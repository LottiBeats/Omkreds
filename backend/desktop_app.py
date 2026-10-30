"""
desktop_app.py — Omkreds som selvstændigt program på computeren

Kører den samme backend som omkreds.dk, bare lokalt. To programmer:

  --app fem      Omkreds FEM (standard): fem.html. Modellerne gemmes som filer
                 af brugerfladen; main.py kræver alligevel en database ved
                 import, så den lægges i en midlertidig mappe og bruges ikke.
  --app omkreds  Hele Omkreds: projekter, dokumenter, regnearksbog, PDF og
                 Word (index.html, bygget med en lokal erstatning for login).
                 Projekterne ligger i en database i brugerens programdata
                 (Windows: %LOCALAPPDATA%\\Omkreds\\projects.db) med daglige
                 kopier i backups/ ved siden af. OMKREDS_DATA flytter mappen.

  /api/...           hele main.app — beregninger, projekter, eksport
  /api/desktop/pdf   PDF direkte af en model (ingen database, intet projekt)
  /                  den byggede frontend (frontend/dist-desktop)

Der er intet login: programmet kører kun på 127.0.0.1 og bruges af den, der
sidder ved computeren.

Start:
    python desktop_app.py                 # vælger en ledig port og åbner browseren
    python desktop_app.py --app omkreds --port 8765 --no-browser

Skrivebordsprogrammet (desktop/src-tauri) vælger selv en ledig port, starter
den med --port N --no-browser og venter, til siden svarer.
"""
import argparse
import os
import socket
import sys
import tempfile
from pathlib import Path


def _hvilken_app(argv) -> str:
    """--app omkreds / --app=omkreds; alt andet er FEM-programmet. Læses før
    main importeres, fordi databasen afhænger af det."""
    for i, a in enumerate(argv):
        if a == "--app" and i + 1 < len(argv):
            return argv[i + 1]
        if a.startswith("--app="):
            return a.split("=", 1)[1]
    return "fem"


APP = "omkreds" if _hvilken_app(sys.argv[1:]) == "omkreds" else "fem"


def datamappe() -> Path:
    """Hvor det lokale Omkreds gemmer projekterne."""
    if os.environ.get("OMKREDS_DATA"):
        return Path(os.environ["OMKREDS_DATA"])
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "Omkreds"


# Uden konsol (Windows-programmet er pakket med console=False) er stdout og
# stderr None, og så fejler både print og uvicorns logning. Skriv til en
# logfil i stedet; den er også det, man beder brugeren om ved en fejl.
if sys.stdout is None or sys.stderr is None:
    _navn = "omkreds.log" if APP == "omkreds" else "omkreds_fem.log"
    _log = open(Path(tempfile.gettempdir()) / _navn, "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stdout or _log
    sys.stderr = sys.stderr or _log

# Skal være sat, før main importeres.
if APP == "omkreds":
    datamappe().mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("DATABASE_PATH", str(datamappe() / "projects.db"))
else:
    os.environ.setdefault("DATABASE_PATH", str(Path(tempfile.gettempdir()) / "omkreds_desktop.db"))
# Sikkerhedskopierne startes af lav_app (et monteret programs lifespan kører ikke).
os.environ["DB_MAINTENANCE"] = "off"
os.environ.setdefault("MPLBACKEND", "Agg")

from contextlib import asynccontextmanager                      # noqa: E402

from fastapi import FastAPI, HTTPException                      # noqa: E402
from fastapi.responses import Response, RedirectResponse         # noqa: E402
from fastapi.staticfiles import StaticFiles                      # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402
from pydantic import BaseModel                                   # noqa: E402

import main                                                      # noqa: E402
from auth import get_current_user                                # noqa: E402

LOKAL_BRUGER = {"id": "lokal", "email": "lokal@omkreds", "name": "Lokal bruger"}
main.app.dependency_overrides[get_current_user] = lambda: LOKAL_BRUGER


class ModelPdf(BaseModel):
    metadata: dict = {}
    blocks: list = []
    doc_id: str = "A2"
    bog: dict = {}


@main.app.post("/desktop/pdf", tags=["Desktop"])
def desktop_pdf(data: ModelPdf):
    """PDF af rapporten, som den ligger i brugerfladen: blankt papir, uden
    A2-forside, sagsoplysninger og tegningshoved. Sagens navn og nummer står
    kun i sidefoden."""
    try:
        from pdf_builder import build_pdf_simpel
        m = data.metadata or {}
        titel = " · ".join(str(x).strip() for x in (m.get("project_ref"), m.get("project_name")) if x and str(x).strip())
        pdf = build_pdf_simpel(data.blocks, titel=titel, bog=data.bog)
        return Response(content=pdf, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _dist_dir() -> Path:
    # PyInstaller pakker filerne ud i sys._MEIPASS; under udvikling ligger de
    # ved siden af backend-mappen.
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent / "frontend"))
    side = "index.html" if APP == "omkreds" else "fem.html"
    for kandidat in (base / "dist-desktop", base / "frontend" / "dist-desktop"):
        if (kandidat / side).exists():
            return kandidat
    if APP == "fem":
        for kandidat in (base / "dist", base / "frontend" / "dist"):
            if (kandidat / side).exists():
                return kandidat
    raise SystemExit("Frontend er ikke bygget: kør 'OMKREDS_DESKTOP=1 npx vite build "
                     "--outDir dist-desktop' i frontend/ først.")


class _AppFiler(StaticFiles):
    """Appen styrer selv sine adresser (/projects/ab12cd34/A2): en sti uden
    filendelse, der ikke er en fil, får index.html, så en genindlæsning eller et
    bogmærke virker."""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and "." not in Path(path).name:
                return await super().get_response("index.html", scope)
            raise


def lav_app() -> FastAPI:
    if APP == "omkreds":
        @asynccontextmanager
        async def _vedligehold(_app):
            # Daglig kopi af databasen i backups/ og tømning af papirkurven,
            # som på serveren.
            try:
                import db
                db.init_db()                # så der er en fil at kopiere fra første start
                db.start_backup_scheduler()
            except Exception as exc:
                print(f"[desktop] kunne ikke starte sikkerhedskopierne: {exc}")
            yield

        root = FastAPI(title="Omkreds", lifespan=_vedligehold)
        root.mount("/api", main.app)
        root.mount("/", _AppFiler(directory=_dist_dir(), html=True), name="frontend")
        return root

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


def _lever(pid: int) -> bool:
    if sys.platform == "win32":
        import ctypes
        k32 = ctypes.windll.kernel32
        h = k32.OpenProcess(0x1000, False, pid)   # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        kode = ctypes.c_ulong()
        ok = k32.GetExitCodeProcess(h, ctypes.byref(kode))
        k32.CloseHandle(h)
        return bool(ok) and kode.value == 259     # STILL_ACTIVE
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    return True


def _stop_med_skallen(pid: int):
    """Stop, når skallen er væk. Går skallen ned (eller lukkes fra
    Jobliste), får den ikke stoppet beregningsdelen selv; så kørte den videre
    og holdt filerne låst, og den næste installation fejlede."""
    import threading
    import time

    def vagt():
        while _lever(pid):
            time.sleep(2)
        os._exit(0)

    threading.Thread(target=vagt, daemon=True).start()


def run():
    p = argparse.ArgumentParser(description="Omkreds på computeren")
    p.add_argument("--app", choices=["fem", "omkreds"], default="fem")
    p.add_argument("--port", type=int, default=0)
    p.add_argument("--no-browser", action="store_true")
    p.add_argument("--parent-pid", type=int, default=0)
    args = p.parse_args()
    if args.parent_pid:
        _stop_med_skallen(args.parent_pid)

    import uvicorn
    port = args.port or _ledig_port()
    app = lav_app()
    print(f"OMKREDS_PORT={port}", flush=True)
    if not args.no_browser:
        import threading
        import webbrowser
        side = "" if APP == "omkreds" else "fem.html"
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{port}/{side}")).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    run()
