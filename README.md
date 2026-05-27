# Image Studio — Phase 1 MVP

Desktop app for Stable Diffusion v1.5 on Intel iGPU (OpenVINO FP16) with
selectable backend (`optimum-intel` or `openvino-genai`), Ollama-powered
prompt rewriting, image gallery and 3 themes (light / dark / uncensored-red).

## Quick start (dev mode)

```bash
# 1. Python deps (one of the backends is enough)
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 2. Frontend
cd frontend
npm install
npm run build         # produces frontend/dist served by FastAPI
cd ..

# 3. Run desktop app
python launcher.py
```

`launcher.py` starts FastAPI on 127.0.0.1:8765 in a background thread, then
opens a PyWebView window pointing at the built frontend.

## Layout

```
backend/         FastAPI app, generators, ollama, gallery, settings
frontend/        React + Vite + Tailwind UI
launcher.py      PyWebView entry point
data/            Created at runtime — settings.json, gallery/, models/
```

## Building the EXE and the installer (Phase 2)

The `installer/` folder contains everything needed to produce both the
desktop EXE and the `.exe` installer.

### One-shot build (Windows)

```cmd
installer\build.bat
```

This will:
1. `npm install` + `npm run build` in `frontend/`
2. `pip install -r requirements.txt` (this is the heavy step — pulls
   `optimum-intel`, `openvino-genai`, `diffusers`, `transformers`, `torch`,
   ~5 GB total). Skip / strip dependencies if you want a slim build.
3. Run **PyInstaller** in `onedir` mode using `installer/launcher.spec`.
   Output: `dist/ImageGenerator/ImageGenerator.exe`
4. Run **Inno Setup** (`ISCC.exe` from `C:\Program Files (x86)\Inno Setup 6\`)
   on `installer/ImageGenerator.iss`. Output:
   `installer/Output/ImageGenerator-Setup.exe`

If Inno Setup is not installed, step 4 is skipped automatically — you can
install it later from https://jrsoftware.org/isdl.php and rerun:

```cmd
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\ImageGenerator.iss
```

### Installer behavior

The setup wizard exposes:
* a **desktop shortcut** checkbox
* an optional **"Download SD 1.5 OpenVINO model now (~2.5 GB)"** checkbox.
  When ticked, after the files are copied the installer runs
  `ImageGenerator.exe --download-model` headless and persists the local
  path into `data/settings.json`. When unticked, the user can trigger the
  same download later from the **Settings → Model download** button.

### Headless model download

`launcher.py` recognises `--download-model` and delegates to
`installer/download_model_cli.py`. This is what Inno Setup runs as a
post-install step.
