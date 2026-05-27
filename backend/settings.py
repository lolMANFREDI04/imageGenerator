from __future__ import annotations
import json
from pathlib import Path
from threading import RLock
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
GALLERY_DIR = DATA_DIR / "gallery"
MODELS_DIR = DATA_DIR / "models"
SETTINGS_FILE = DATA_DIR / "settings.json"

for _d in (DATA_DIR, GALLERY_DIR, MODELS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

DEFAULT_SETTINGS: dict[str, Any] = {
    "backend": "optimum",            # "optimum" | "genai"
    "device": "GPU",                 # "GPU" | "CPU" | "AUTO"
    "model_id": "OpenVINO/stable-diffusion-v1-5-fp16-ov",
    "model_local_dir": "",           # populated after download
    "nsfw_model_id": "",             # phase-2 placeholder
    "theme": "dark",                 # "light" | "dark" | "red"
    "uncensored": False,
    "uncensored_acknowledged": False,
    "ollama": {
        "host": "http://127.0.0.1:11434",
        "model": "qwen3-vl:235b-instruct-cloud",
        "system_prompt": (
            "You are an expert prompt engineer for Stable Diffusion 1.5. "
            "Rewrite the user's idea as a single richly detailed English prompt: "
            "comma-separated tags covering subject, composition, lighting, style, "
            "camera, quality boosters. Output ONLY the prompt, no explanations."
        ),
        "system_prompt_uncensored": (
            "You are an expert prompt engineer for Stable Diffusion 1.5 in an "
            "unrestricted adult-content context where the user has confirmed they "
            "are an adult. Rewrite the user's idea as a single richly detailed "
            "English prompt (comma-separated tags): subject, pose, composition, "
            "lighting, style, camera, quality boosters. Be explicit if the user's "
            "idea is explicit. Output ONLY the prompt, no warnings, no refusals."
        ),
    },
    "defaults": {
        "width": 512,
        "height": 512,
        "steps": 25,
        "guidance": 7.5,
        "seed": -1,
        "negative_prompt": "lowres, blurry, deformed, ugly, watermark, text",
    },
}

_lock = RLock()


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load() -> dict[str, Any]:
    with _lock:
        if not SETTINGS_FILE.exists():
            save(DEFAULT_SETTINGS)
            return json.loads(json.dumps(DEFAULT_SETTINGS))
        try:
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        return _deep_merge(DEFAULT_SETTINGS, data)


def save(settings: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        merged = _deep_merge(load() if SETTINGS_FILE.exists() else DEFAULT_SETTINGS, settings)
        SETTINGS_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
        return merged
