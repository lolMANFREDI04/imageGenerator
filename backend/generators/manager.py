from __future__ import annotations
import threading
import time
import queue
import uuid
from typing import Any
from PIL import Image

from ..settings import load as load_settings
from ..model_downloader import find_local
from .optimum_backend import OptimumGenerator
from .genai_backend import GenAIGenerator
from ..gallery import save_image


class ProgressBus:
    """One queue per active job.

    Queues survive worker completion so late SSE subscribers still get
    all events. The SSE handler calls ``discard`` after streaming the
    terminal event.

    A keepalive thread periodically pushes ``{"type":"ping"}`` events so
    the 60-second SSE timeout never fires during a slow step.
    """

    _KEEPALIVE_INTERVAL = 15  # seconds

    def __init__(self):
        self._jobs: dict[str, queue.Queue] = {}
        self._lock = threading.Lock()
        self._ka_thread = threading.Thread(target=self._keepalive_loop, daemon=True)
        self._ka_thread.start()

    def _keepalive_loop(self):
        while True:
            time.sleep(self._KEEPALIVE_INTERVAL)
            with self._lock:
                jids = list(self._jobs.keys())
            for jid in jids:
                self.push(jid, {"type": "ping", "ts": time.time()})

    def open(self) -> str:
        jid = uuid.uuid4().hex[:12]
        with self._lock:
            self._jobs[jid] = queue.Queue()
        return jid

    def open_named(self, jid: str) -> None:
        with self._lock:
            if jid not in self._jobs:
                self._jobs[jid] = queue.Queue()

    def push(self, jid: str, event: dict) -> None:
        with self._lock:
            q = self._jobs.get(jid)
        if q is not None:
            q.put(event)

    def get(self, jid: str) -> queue.Queue | None:
        with self._lock:
            return self._jobs.get(jid)

    def close(self, jid: str) -> None:
        """Worker finished — push terminal sentinel, keep queue for consumer."""
        with self._lock:
            q = self._jobs.get(jid)
        if q is not None:
            q.put({"type": "end"})

    def discard(self, jid: str) -> None:
        """Consumer done — remove the queue."""
        with self._lock:
            self._jobs.pop(jid, None)


BUS = ProgressBus()


class GeneratorManager:
    def __init__(self):
        self._gen = None
        self._signature: tuple | None = None
        self._lock = threading.Lock()
        self._loading = False
        self._load_done = False

    def is_ready(self) -> bool:
        return self._load_done and self._gen is not None

    def is_loading(self) -> bool:
        return self._loading

    def _resolve_model_dir(self, s: dict) -> str:
        local = s.get("model_local_dir") or ""
        if local:
            from pathlib import Path
            if Path(local).exists():
                return local
        found = find_local(s["model_id"])
        if found:
            return found
        return s["model_id"]

    def ensure(self, on_progress) -> None:
        s = load_settings()
        model_dir = self._resolve_model_dir(s)
        sig = (s["backend"], s["device"], model_dir, bool(s.get("uncensored")))
        with self._lock:
            if self._signature == sig and self._gen is not None:
                return
            if self._gen is not None:
                self._gen.unload()
                self._gen = None
            self._loading = True
            self._load_done = False
            backend = s["backend"]
            if backend == "genai":
                self._gen = GenAIGenerator(model_dir, s["device"], bool(s.get("uncensored")))
            else:
                self._gen = OptimumGenerator(model_dir, s["device"], bool(s.get("uncensored")))
        self._gen.load(on_progress)
        with self._lock:
            self._signature = sig
            self._loading = False
            self._load_done = True

    def run(self, params: dict, jid: str) -> dict:
        s = load_settings()
        started_at = time.time()

        def progress(step: int, total: int, msg: str):
            elapsed = time.time() - started_at
            eta = None
            if step > 0 and total > 0:
                eta = (elapsed / step) * (total - step)
            BUS.push(jid, {
                "type": "progress",
                "step": step,
                "total": max(total, 1),
                "pct": min(100, int(step * 100 / max(total, 1))),
                "message": msg,
                "elapsed": round(elapsed, 1),
                "eta": round(eta, 1) if eta is not None else None,
                "ts": time.time(),
            })

        try:
            BUS.push(jid, {"type": "status", "message": "Preparing pipeline...",
                           "elapsed": 0, "eta": None})
            self.ensure(progress)
            BUS.push(jid, {"type": "status", "message": "Generating...",
                           "elapsed": round(time.time() - started_at, 1), "eta": None})
            img = self._gen.generate(params, progress)
            meta = {
                "prompt": params.get("prompt", ""),
                "negative_prompt": params.get("negative_prompt", ""),
                "steps": int(params.get("steps", 25)),
                "guidance": float(params.get("guidance", 7.5)),
                "seed": int(params.get("seed", -1)),
                "width": int(params.get("width", 512)),
                "height": int(params.get("height", 512)),
                "backend": s["backend"],
                "device": s["device"],
                "model_id": s["model_id"],
                "uncensored": bool(s.get("uncensored")),
                "created": time.time(),
                "generation_time": round(time.time() - started_at, 1),
            }
            entry = save_image(img, meta)
            BUS.push(jid, {"type": "done", "image": entry,
                           "elapsed": round(time.time() - started_at, 1)})
            return entry
        except Exception as e:
            BUS.push(jid, {"type": "error", "message": str(e),
                           "elapsed": round(time.time() - started_at, 1)})
            raise
        finally:
            BUS.close(jid)


MANAGER = GeneratorManager()
