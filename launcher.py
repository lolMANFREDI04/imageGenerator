"""PyWebView desktop launcher.

Starts FastAPI in a background thread on 127.0.0.1:8765, then opens a
PyWebView window. When the window is closed, the process exits.
"""
from __future__ import annotations
import socket
import threading
import time
import sys
import webview
import uvicorn

from backend.main import app

HOST = "127.0.0.1"
PORT = 8765


def _free_port(preferred: int) -> int:
    """Return preferred port if free, otherwise the next available one."""
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    raise OSError("No free port found in range")


def _wait_for_port(host: str, port: int, timeout: float = 15.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def run_server():
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning", access_log=False)


def main():
    if "--download-model" in sys.argv:
        from installer.download_model_cli import main as dl_main
        sys.exit(dl_main())

    port = _free_port(PORT)
    if port != PORT:
        print(f"Port {PORT} busy, using {port}", file=sys.stderr)

    def run_server():
        uvicorn.run(app, host=HOST, port=port, log_level="warning", access_log=False)

    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    if not _wait_for_port(HOST, port):
        print("Backend failed to start", file=sys.stderr)
        sys.exit(1)

    webview.create_window(
        title="Image Generator",
        url=f"http://{HOST}:{port}/",
        width=1280,
        height=820,
        min_size=(960, 640),
    )
    webview.start()


if __name__ == "__main__":
    main()
