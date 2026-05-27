from __future__ import annotations
import threading
from pathlib import Path
from typing import Callable

from .settings import MODELS_DIR


class DownloadJob:
    def __init__(self):
        self.progress = 0.0
        self.status = "idle"   # idle | running | done | error
        self.message = ""
        self.local_dir = ""
        self._thread: threading.Thread | None = None

    def start(self, repo_id: str):
        if self.status == "running":
            return
        self.status = "running"
        self.progress = 0.0
        self.message = f"Downloading {repo_id}..."
        self._thread = threading.Thread(target=self._run, args=(repo_id,), daemon=True)
        self._thread.start()

    def _run(self, repo_id: str):
        try:
            from huggingface_hub import snapshot_download

            target = MODELS_DIR / repo_id.replace("/", "__")
            target.mkdir(parents=True, exist_ok=True)

            # huggingface_hub >= 0.20 has tqdm progress; we approximate via
            # a callback-less call and report indeterminate progress.
            self.message = f"Fetching files from {repo_id}..."
            self.progress = 0.05
            local = snapshot_download(
                repo_id=repo_id,
                local_dir=str(target),
            )
            self.local_dir = str(local)
            self.progress = 1.0
            self.status = "done"
            self.message = "Download complete."
        except Exception as e:
            self.status = "error"
            self.message = f"Download failed: {e}"


JOB = DownloadJob()


def status() -> dict:
    return {
        "status": JOB.status,
        "progress": JOB.progress,
        "message": JOB.message,
        "local_dir": JOB.local_dir,
    }


def start(repo_id: str) -> dict:
    JOB.start(repo_id)
    return status()


def find_local(repo_id: str) -> str:
    target = MODELS_DIR / repo_id.replace("/", "__")
    if target.exists() and any(target.iterdir()):
        return str(target)
    return ""
