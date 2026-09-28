# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller: backend/desktop_app.py -> desktop/build-py/dist/omkreds-backend/

Én mappe (ikke én fil): en --onefile-pakke pakker sig selv ud ved hver start,
og med numpy, matplotlib og ReportLab tager det sekunder. Mappen lægges ind i
Tauri-programmet som resource og startes derfra.

Byg (fra repo-roden, efter frontend er bygget til dist-desktop):
    pyinstaller desktop/omkreds-backend.spec --distpath desktop/build-py/dist \
        --workpath desktop/build-py/work --noconfirm
"""
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROD = Path(SPECPATH).resolve().parent
BACKEND = ROD / "backend"

datas = [
    (str(BACKEND / "fonts"), "fonts"),
    (str(BACKEND / "steel_profiles.csv"), "."),
    (str(ROD / "frontend" / "dist-desktop"), "dist-desktop"),
]
datas += collect_data_files("forallpeople")
datas += collect_data_files("matplotlib")
datas += collect_data_files("reportlab")

# Beregningsmodulerne importeres inde i endpoints; tag dem alle med, så intet
# mangler, når en blok regnes første gang på brugerens maskine.
hidden = [p.stem for p in BACKEND.glob("*.py") if p.stem not in {"desktop_app"}]
hidden += collect_submodules("uvicorn")

a = Analysis(
    [str(BACKEND / "desktop_app.py")],
    pathex=[str(BACKEND)],
    datas=datas,
    hiddenimports=hidden,
    excludes=["openseespy", "opsvis", "Pynite", "PyNite", "scipy", "pandas",
              "handcalcs", "tkinter", "IPython", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="omkreds-backend",
          console=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="omkreds-backend", upx=False)
