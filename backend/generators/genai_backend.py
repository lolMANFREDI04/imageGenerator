from __future__ import annotations
import io
from PIL import Image
from .base import GeneratorBase, ProgressCb


class GenAIGenerator(GeneratorBase):
    name = "genai"

    def __init__(self, model_dir: str, device: str, uncensored: bool):
        super().__init__(model_dir, device, uncensored)
        self.pipe = None

    def load(self, on_progress: ProgressCb) -> None:
        on_progress(0, 1, f"Loading openvino-genai Text2ImagePipeline on {self.device}...")
        import openvino_genai as ov_genai

        self.pipe = ov_genai.Text2ImagePipeline(self.model_dir, self.device)
        on_progress(1, 1, "Pipeline ready.")

    def generate(self, params: dict, on_progress: ProgressCb) -> Image.Image:
        import numpy as np

        steps = int(params.get("steps", 25))
        seed = int(params.get("seed", -1))
        last_seen_total = [steps]

        def cb(step, num_steps, latents):
            try:
                total = int(num_steps) or steps
                last_seen_total[0] = total
                on_progress(int(step) + 1, total,
                            f"Diffusion step {int(step) + 1}/{total}")
            except Exception:
                pass
            return False  # don't cancel

        kwargs = dict(
            width=int(params.get("width", 512)),
            height=int(params.get("height", 512)),
            num_inference_steps=steps,
            guidance_scale=float(params.get("guidance", 7.5)),
        )
        if (params.get("negative_prompt") or "").strip():
            kwargs["negative_prompt"] = params["negative_prompt"]
        if seed >= 0:
            kwargs["rng_seed"] = seed

        on_progress(0, steps, "Starting diffusion...")
        try:
            tensor = self.pipe.generate(params["prompt"], callback=cb, **kwargs)
        except RuntimeError as e:
            if "busy" not in str(e).lower():
                raise
            # Retry once without the callback — some openvino_genai builds
            # raise "Infer Request is busy" when the callback runs alongside
            # the VAE decoder. Lose live progress, keep generation working.
            on_progress(last_seen_total[0], last_seen_total[0],
                        "Decoding image (retry without callback)...")
            tensor = self.pipe.generate(params["prompt"], **kwargs)

        on_progress(last_seen_total[0], last_seen_total[0], "Decoding image...")
        # Always copy out of the OV tensor so the underlying infer request
        # can be released cleanly. ov.Tensor exposes the buffer via `.data`
        # in openvino>=2024; older builds support np.array() directly.
        if hasattr(tensor, "data"):
            arr = np.array(tensor.data, copy=True)
        else:
            arr = np.array(tensor)
        if arr.ndim == 4:
            arr = arr[0]
        return Image.fromarray(arr.astype("uint8"))

    def unload(self) -> None:
        self.pipe = None
