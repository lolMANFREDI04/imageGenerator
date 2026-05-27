"""Headless model downloader used by the Inno Setup post-install step.

Usage:  ImageGenerator.exe --download-model

Reads settings.json (or uses the default repo) and downloads the SD 1.5
OpenVINO snapshot into the user's data folder, with a console progress
bar visible to the installer.
"""
from __future__ import annotations
import sys
from pathlib import Path

DEFAULT_REPO = "OpenVINO/stable-diffusion-v1-5-fp16-ov"


def main(repo_id: str | None = None) -> int:
    repo = repo_id or DEFAULT_REPO
    print(f"[ImageGenerator] Downloading {repo} ...")
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("ERROR: huggingface_hub is missing — model cannot be downloaded.")
        return 2

    # Use the same data dir as the running app
    if getattr(sys, "frozen", False):
        # Frozen onedir layout: exe lives in dist/ImageGenerator/
        base = Path(sys.executable).resolve().parent
    else:
        base = Path(__file__).resolve().parent.parent
    target = base / "data" / "models" / repo.replace("/", "__")
    target.mkdir(parents=True, exist_ok=True)

    try:
        path = snapshot_download(
            repo_id=repo,
            local_dir=str(target),
        )
        print(f"[ImageGenerator] Model ready at: {path}")

        # Persist into settings.json so the app picks it up
        import json
        settings_file = base / "data" / "settings.json"
        settings_file.parent.mkdir(parents=True, exist_ok=True)
        cfg = {}
        if settings_file.exists():
            try: cfg = json.loads(settings_file.read_text(encoding="utf-8"))
            except Exception: cfg = {}
        cfg["model_local_dir"] = str(path)
        cfg.setdefault("model_id", repo)
        settings_file.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        return 0
    except Exception as e:
        print(f"ERROR: download failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
