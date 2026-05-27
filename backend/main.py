from __future__ import annotations
import asyncio
import json
import threading
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


# ---------- Settings ----------
@app.get("/api/settings")
def get_settings():
    return settings_mod.load()


class SettingsPatch(BaseModel):
    data: dict


@app.post("/api/settings")
def update_settings(patch: SettingsPatch):
    return settings_mod.save(patch.data)


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
                    event = await asyncio.get_event_loop().run_in_executor(None, q.get, True, 60)
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
