from __future__ import annotations
import asyncio
import json
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import settings as settings_mod
from . import gallery as gallery_mod
from . import ollama_client
from . import model_downloader
from .generators.manager import MANAGER, BUS
from .settings import GALLERY_DIR

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="Image Generator")


@app.on_event("startup")
async def _preload_model():
    """Warm up the pipeline at startup so first Generate is instant."""
    def _load():
        def _progress(step, total, msg):
            BUS.push("__preload__", {
                "type": "progress",
                "step": step,
                "total": max(total, 1),
                "pct": min(100, int(step * 100 / max(total, 1))),
                "message": msg,
                "ts": time.time(),
            })
        try:
            MANAGER.ensure(_progress)
            BUS.push("__preload__", {"type": "done", "message": "Model ready."})
        except Exception as e:
            BUS.push("__preload__", {"type": "error", "message": str(e)})
        finally:
            BUS.close("__preload__")

    BUS.open_named("__preload__")
    threading.Thread(target=_load, daemon=True).start()


# ---------- Settings ----------
@app.get("/api/settings")
def get_settings():
    return settings_mod.load()


class SettingsPatch(BaseModel):
    data: dict


@app.post("/api/settings")
def update_settings(patch: SettingsPatch):
    return settings_mod.save(patch.data)


# ---------- Model state ----------
@app.get("/api/model/ready")
def model_ready():
    """Returns whether the pipeline is loaded and ready to generate."""
    return {
        "ready": MANAGER.is_ready(),
        "loading": MANAGER.is_loading(),
    }


@app.get("/api/model/preload/stream")
async def preload_stream():
    """SSE stream for startup model loading progress."""
    q = BUS.get("__preload__")
    if q is None:
        # Already done — return synthetic done event
        async def _done():
            yield 'data: {"type":"done","message":"Model already loaded."}\n\n'
        return StreamingResponse(_done(), media_type="text/event-stream")

    async def event_gen():
        try:
            while True:
                try:
                    event = await asyncio.get_event_loop().run_in_executor(
                        None, q.get, True, 120)
                except Exception:
                    break
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("end", "done", "error"):
                    break
        finally:
            BUS.discard("__preload__")

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---------- Ollama ----------
@app.get("/api/ollama/models")
async def ollama_models():
    try:
        return {"models": await ollama_client.list_models()}
    except Exception as e:
        return {"models": [], "error": str(e)}


class RewriteIn(BaseModel):
    prompt: str
    uncensored: bool | None = None


@app.post("/api/ollama/rewrite")
async def ollama_rewrite(payload: RewriteIn):
    s = settings_mod.load()
    unc = payload.uncensored if payload.uncensored is not None else bool(s.get("uncensored"))
    try:
        new_prompt = await ollama_client.rewrite_prompt(payload.prompt, uncensored=unc)
        return {"prompt": new_prompt}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {e}")


# ---------- Gallery ----------
@app.get("/api/gallery")
def gallery_list():
    return {"items": gallery_mod.list_images()}


@app.get("/api/gallery/file/{filename}")
def gallery_file(filename: str):
    p = gallery_mod.get_path(filename)
    if not p:
        raise HTTPException(404)
    return FileResponse(p)


@app.delete("/api/gallery/{filename}")
def gallery_delete(filename: str):
    return {"ok": gallery_mod.delete(filename)}


class EditIn(BaseModel):
    op: str
    params: dict = {}


@app.post("/api/gallery/{filename}/edit")
def gallery_edit(filename: str, payload: EditIn):
    res = gallery_mod.edit(filename, payload.op, payload.params)
    if res is None:
        raise HTTPException(400, "Invalid edit op or file not found")
    return res


# ---------- Model download ----------
class DownloadIn(BaseModel):
    repo_id: str | None = None


@app.post("/api/model/download")
def model_download(payload: DownloadIn):
    s = settings_mod.load()
    repo = payload.repo_id or s["model_id"]
    return model_downloader.start(repo)


@app.get("/api/model/status")
def model_status():
    st = model_downloader.status()
    if st["status"] == "done" and st["local_dir"]:
        settings_mod.save({"model_local_dir": st["local_dir"]})
    return st


# ---------- Generation ----------
class GenerateIn(BaseModel):
    prompt: str
    negative_prompt: str | None = ""
    width: int = 512
    height: int = 512
    steps: int = 25
    guidance: float = 7.5
    seed: int = -1


@app.post("/api/generate")
def generate(payload: GenerateIn):
    if not payload.prompt.strip():
        raise HTTPException(400, "Prompt is empty")
    if MANAGER.is_loading():
        raise HTTPException(503, "Model is still loading, please wait...")
    jid = BUS.open()
    params = payload.model_dump()
    threading.Thread(target=MANAGER.run, args=(params, jid), daemon=True).start()
    return {"job_id": jid}


@app.get("/api/generate/stream/{jid}")
async def generate_stream(jid: str):
    q = BUS.get(jid)
    if q is None:
        raise HTTPException(404, "Unknown job")

    async def event_gen():
        try:
            while True:
                try:
                    # 120s timeout — longer than the slowest single step
                    event = await asyncio.get_event_loop().run_in_executor(
                        None, q.get, True, 120)
                except Exception:
                    break
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("end", "done", "error"):
                    break
        finally:
            BUS.discard(jid)

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---------- Static frontend ----------
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:
    @app.get("/")
    def _no_frontend():
        return {"error": f"Frontend not built. Run `npm run build` inside {FRONTEND_DIST}."}
