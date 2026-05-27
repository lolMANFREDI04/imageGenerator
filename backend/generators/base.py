from __future__ import annotations
from typing import Callable, Any
from PIL import Image

ProgressCb = Callable[[int, int, str], None]   # step, total, message


class GeneratorBase:
    name: str = "base"

    def __init__(self, model_dir: str, device: str, uncensored: bool):
        self.model_dir = model_dir
        self.device = device
        self.uncensored = uncensored

    def load(self, on_progress: ProgressCb) -> None:
        raise NotImplementedError

    def generate(self, params: dict, on_progress: ProgressCb) -> Image.Image:
        raise NotImplementedError

    def unload(self) -> None:
        pass
