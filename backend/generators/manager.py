from __future__ import annotations
import threading
import time
import queue
import uuid
from typing import Any
from PIL import Image

from .. import settings as cfg
from ..settings import load as load_settings
from ..model_downloader import find_local
from .optimum_backend import OptimumGenerator
from .genai_backend import GenAIGenerator
from ..gallery import save_image


class ProgressBus:
    """One queue per active job. SSE consumers drain a queue.

    Queues are NOT removed when the worker finishes — they stay around so a
    late subscriber can still read the buffered events (and the terminal
    "end" event). The SSE handler is responsible for calling ``discard`` once
    it has streamed the terminal event to the client.
    """

    def __init__(self):
        self._jobs: dict[str, queue.Queue] = {}
        self._lock = threading.Lock()

    def open(self) -> str:
        jid = uuid.uuid4().hex[:12]
        with self._lock:
            self._jobs[jid] = queue.Queue()
        return jid

    def push(self, jid: str, event: dict) -> None:
        with self._lock:
            q = self._jobs.get(jid)
        if q is not None:
            q.put(event)

    def get(self, jid: str) -> queue.Queue | None:
        with self._lock:
            return self._jobs.get(jid)

    def close(self, jid: str) -> None:
        """Worker finished — push terminal event but keep queue for consumer."""
        with self._lock:
            q = self._jobs.get(jid)
        if q is not None:
            q.put({"type": "end"})

    def discard(self, jid: str) -> None:
        """Consumer is done — remove the queue."""
        with self._lock:
            self._jobs.pop(jid, None)


BUS = ProgressBus()


class GeneratorManager:
    def __init__(self):
        self._gen = None
        self._signature: tuple | None = None
        self._lock = threading.Lock()

    def _resolve_model_dir(self, s: dict) -> str:
        local = s.get("model_local_dir") or ""
        if local and any(p for p in [local]):
            from pathlib import Path
            if Path(local).exists():
                return local
        # try to find a previously downloaded snapshot
        found = find_local(s["model_id"])
        if found:
            return found
        # fall back to the HF id (optimum can resolve it on its own,
        # genai requires a local dir)
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
            backend = s["backend"]
            if backend == "genai":
                self._gen = GenAIGenerator(model_dir, s["device"], bool(s.get("uncensored")))
            else:
                self._gen = OptimumGenerator(model_dir, s["device"], bool(s.get("uncensored")))
            self._gen.load(on_progress)
            self._signature = sig

    def run(self, params: dict, jid: str) -> dict:
        s = load_settings()

        def progress(step: int, total: int, msg: str):
            BUS.push(jid, {
                "type": "progress",
                "step": step,
                "total": max(total, 1),
                "pct": min(100, int(step * 100 / max(total, 1))),
                "message": msg,
                "ts": time.time(),
            })

        try:
            BUS.push(jid, {"type": "status", "message": "Preparing pipeline..."})
            self.ensure(progress)
            BUS.push(jid, {"type": "status", "message": "Generating..."})
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
            }
            entry = save_image(img, meta)
            BUS.push(jid, {"type": "done", "image": entry})
            return entry
        except Exception as e:
            BUS.push(jid, {"type": "error", "message": str(e)})
            raise
        finally:
            BUS.close(jid)


MANAGER = GeneratorManager()
