from __future__ import annotations
import json
import time
from pathlib import Path
from typing import Iterator
from PIL import Image

from .settings import GALLERY_DIR


def _meta_path(img_path: Path) -> Path:
    return img_path.with_suffix(".json")


def list_images() -> list[dict]:
    items = []
    for p in sorted(GALLERY_DIR.glob("*.png"), key=lambda x: x.stat().st_mtime, reverse=True):
        meta_p = _meta_path(p)
        meta = {}
        if meta_p.exists():
            try:
                meta = json.loads(meta_p.read_text(encoding="utf-8"))
            except Exception:
                pass
        items.append({
            "id": p.stem,
            "filename": p.name,
            "url": f"/api/gallery/file/{p.name}",
            "created": p.stat().st_mtime,
            "size": p.stat().st_size,
            "meta": meta,
        })
    return items


def save_image(image: Image.Image, meta: dict) -> dict:
    ts = int(time.time() * 1000)
    name = f"img_{ts}.png"
    path = GALLERY_DIR / name
    image.save(path, format="PNG")
    _meta_path(path).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return {
        "id": path.stem,
        "filename": name,
        "url": f"/api/gallery/file/{name}",
        "created": path.stat().st_mtime,
        "size": path.stat().st_size,
        "meta": meta,
    }


def get_path(filename: str) -> Path | None:
    p = GALLERY_DIR / filename
    if not p.exists() or p.parent.resolve() != GALLERY_DIR.resolve():
        return None
    return p


def delete(filename: str) -> bool:
    p = get_path(filename)
    if not p:
        return False
    try:
        p.unlink()
        mp = _meta_path(p)
        if mp.exists():
            mp.unlink()
        return True
    except Exception:
        return False


def edit(filename: str, op: str, params: dict) -> dict | None:
    p = get_path(filename)
    if not p:
        return None
    img = Image.open(p)
    if op == "rotate":
        img = img.rotate(-float(params.get("angle", 90)), expand=True)
    elif op == "flip_h":
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    elif op == "flip_v":
        img = img.transpose(Image.FLIP_TOP_BOTTOM)
    elif op == "crop":
        l = int(params.get("left", 0))
        t = int(params.get("top", 0))
        r = int(params.get("right", img.width))
        b = int(params.get("bottom", img.height))
        img = img.crop((l, t, r, b))
    elif op == "grayscale":
        img = img.convert("L").convert("RGB")
    else:
        return None
    img.save(p, format="PNG")
    meta = {}
    mp = _meta_path(p)
    if mp.exists():
        try:
            meta = json.loads(mp.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "id": p.stem,
        "filename": p.name,
        "url": f"/api/gallery/file/{p.name}?t={int(time.time())}",
        "created": p.stat().st_mtime,
        "size": p.stat().st_size,
        "meta": meta,
    }
