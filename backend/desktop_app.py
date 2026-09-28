"""
desktop_app.py — Omkreds FEM som selvstændigt program på computeren

Kører den samme backend som omkreds.dk, bare lokalt:

  /api/...     hele main.app — FEM, laster, kombinationer, eftervisninger
  /api/desktop/pdf   PDF direkte af en model (ingen database, intet projekt)
  /            den byggede frontend (frontend/dist), hvor fem.html er programmet

Der er intet login: programmet kører kun på 127.0.0.1 og bruges af den, der
sidder ved computeren. Modellerne gemmes som filer af brugerfladen, ikke i en
database. main.py kræver alligevel en database ved import, så den lægges i en
midlertidig mappe og bruges ikke.

Start:
    python desktop_app.py                 # vælger en ledig port og åbner browseren
    python desktop_app.py --port 8765 --no-browser

Tauri-skallen starter den som sidecar med --no-browser og læser porten på den
første linje, der begynder med "OMKREDS_PORT=".
"""
import argparse
import os
import socket
import sys
import tempfile
from pathlib import Path

# Skal være sat, før main importeres.
os.environ.setdefault("DATABASE_PATH", str(Path(tempfile.gettempdir()) / "omkreds_desktop.db"))
os.environ.setdefault("DB_MAINTENANCE", "off")
os.environ.setdefault("MPLBACKEND", "Agg")

from fastapi import FastAPI, HTTPException                      # noqa: E402
from fastapi.responses import Response, RedirectResponse         # noqa: E402
from fastapi.staticfiles import StaticFiles                      # noqa: E402
from pydantic import BaseModel                                   # noqa: E402

import main                                                      # noqa: E402
from auth import get_current_user                                # noqa: E402

LOKAL_BRUGER = {"id": "lokal", "email": "lokal@omkreds", "name": "Lokal bruger"}
main.app.dependency_overrides[get_current_user] = lambda: LOKAL_BRUGER


class ModelPdf(BaseModel):
    metadata: dict = {}
    blocks: list = []
    doc_id: str = "A2"


@main.app.post("/desktop/pdf", tags=["Desktop"])
def desktop_pdf(data: ModelPdf):
    """PDF af en model, som den ligger i brugerfladen."""
    try:
        from pdf_builder import build_pdf
        project = {"id": "lokal", "metadata": data.metadata or {}, "documents": {}}
        pdf = build_pdf(project, data.blocks, doc_id=data.doc_id)
        return Response(content=pdf, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _dist_dir() -> Path:
    # PyInstaller pakker filerne ud i sys._MEIPASS; under udvikling ligger de
    # ved siden af backend-mappen.
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent / "frontend"))
    for kandidat in (base / "dist-desktop", base / "frontend" / "dist-desktop",
                     base / "dist", base / "frontend" / "dist"):
        if (kandidat / "fem.html").exists():
            return kandidat
    raise SystemExit("Frontend er ikke bygget: kør 'OMKREDS_DESKTOP=1 npx vite build "
                     "--outDir dist-desktop' i frontend/ først.")


def lav_app() -> FastAPI:
    root = FastAPI(title="Omkreds FEM")
    root.mount("/api", main.app)

    @root.get("/")
    def _forside():
        return RedirectResponse("/fem.html")

    root.mount("/", StaticFiles(directory=_dist_dir(), html=True), name="frontend")
    return root


def _ledig_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def run():
    p = argparse.ArgumentParser(description="Omkreds FEM")
    p.add_argument("--port", type=int, default=0)
    p.add_argument("--no-browser", action="store_true")
    args = p.parse_args()

    import uvicorn
    port = args.port or _ledig_port()
    app = lav_app()
    print(f"OMKREDS_PORT={port}", flush=True)
    if not args.no_browser:
        import threading
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{port}/fem.html")).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    run()
