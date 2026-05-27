from __future__ import annotations
from PIL import Image
from .base import GeneratorBase, ProgressCb


class OptimumGenerator(GeneratorBase):
    name = "optimum"

    def __init__(self, model_dir: str, device: str, uncensored: bool):
        super().__init__(model_dir, device, uncensored)
        self.pipe = None

    def load(self, on_progress: ProgressCb) -> None:
        on_progress(0, 1, f"Loading optimum-intel pipeline on {self.device}...")
        from optimum.intel import OVStableDiffusionPipeline

        self.pipe = OVStableDiffusionPipeline.from_pretrained(
            self.model_dir,
            device=self.device,
            compile=False,
        )
        if self.uncensored:
            try:
                self.pipe.safety_checker = None
            except Exception:
                pass
        on_progress(0, 1, "Compiling model for device (first run is slower)...")
        try:
            self.pipe.compile()
        except Exception:
            pass
        on_progress(1, 1, "Pipeline ready.")

    def generate(self, params: dict, on_progress: ProgressCb) -> Image.Image:
        import torch
        import inspect

        steps = int(params.get("steps", 25))
        seed = int(params.get("seed", -1))
        generator = None
        if seed >= 0:
            try:
                generator = torch.Generator().manual_seed(seed)
            except Exception:
                generator = None

        on_progress(0, steps, "Starting diffusion...")

        # diffusers >=0.38 removed callback/callback_steps in favour of
        # callback_on_step_end. Check what the pipeline actually accepts.
        call_sig = inspect.signature(self.pipe.__call__)
        pipe_kwargs = dict(
            prompt=params["prompt"],
            negative_prompt=params.get("negative_prompt", "") or None,
            num_inference_steps=steps,
            guidance_scale=float(params.get("guidance", 7.5)),
            width=int(params.get("width", 512)),
            height=int(params.get("height", 512)),
            generator=generator,
        )

        if "callback_on_step_end" in call_sig.parameters:
            # diffusers >= 0.28 / optimum-intel >= 1.20 style
            def step_cb(pipe_ref, step_idx, timestep, cb_kwargs):
                on_progress(step_idx + 1, steps,
                            f"Diffusion step {step_idx + 1}/{steps}")
                return cb_kwargs

            pipe_kwargs["callback_on_step_end"] = step_cb
        elif "callback" in call_sig.parameters:
            # legacy style
            def legacy_cb(step_idx: int, timestep, latents):
                on_progress(step_idx + 1, steps,
                            f"Diffusion step {step_idx + 1}/{steps}")

            pipe_kwargs["callback"] = legacy_cb
            pipe_kwargs["callback_steps"] = 1

        result = self.pipe(**pipe_kwargs)
        on_progress(steps, steps, "Decoding image...")

        img = result.images[0]
        # Ensure we always return a proper RGB PIL image
        if not isinstance(img, Image.Image):
            import numpy as np
            arr = np.array(img)
            if arr.dtype != "uint8":
                arr = (arr * 255).clip(0, 255).astype("uint8")
            img = Image.fromarray(arr)
        return img.convert("RGB")

    def unload(self) -> None:
        self.pipe = None

