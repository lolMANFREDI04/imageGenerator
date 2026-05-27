from __future__ import annotations
import httpx
from .settings import load as load_settings


async def list_models() -> list[dict]:
    s = load_settings()
    host = s["ollama"]["host"].rstrip("/")
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(f"{host}/api/tags")
        r.raise_for_status()
        data = r.json()
        models = []
        for m in data.get("models", []):
            models.append({
                "name": m.get("name") or m.get("model"),
                "size": m.get("size"),
                "modified": m.get("modified_at"),
            })
        return models


async def rewrite_prompt(user_prompt: str, uncensored: bool = False) -> str:
    s = load_settings()
    host = s["ollama"]["host"].rstrip("/")
    model = s["ollama"]["model"]
    sys_prompt = (
        s["ollama"]["system_prompt_uncensored"]
        if uncensored
        else s["ollama"]["system_prompt"]
    )
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "options": {"temperature": 0.8},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(f"{host}/api/chat", json=payload)
        r.raise_for_status()
        data = r.json()
        return (data.get("message", {}) or {}).get("content", "").strip()
