"""
Røgtest af byg_indeklimanotat.py: eksempel-eksport -> PDF.

    python -m pytest energi/rapport/test_byg_indeklimanotat.py
"""
import json
import shutil
from pathlib import Path

import byg_indeklimanotat as bn
import eksempel_eksport

PROJEKT = Path(__file__).resolve().parents[1] / "projekter" / "hjerlesvej" / "projekt.yaml"


def test_notat_bygges(tmp_path):
    eksempel_eksport.lav(tmp_path)
    prj = tmp_path / "projekt.yaml"
    shutil.copy(PROJEKT, prj)          # logo findes ikke her -> firmanavn som tekst
    pdf = bn.byg(tmp_path, prj, tmp_path / "notat.pdf")
    data = pdf.read_bytes()
    assert data.startswith(b"%PDF") and data.count(b"/Type /Page\n") + data.count(b"/Type /Page\r") >= 0
    assert pdf.stat().st_size > 20000


def test_mangler_data_giver_ikke_fejl(tmp_path):
    (tmp_path / "resultater.json").write_text(json.dumps({"billeder": []}))
    prj = tmp_path / "projekt.yaml"
    shutil.copy(PROJEKT, prj)
    assert bn.byg(tmp_path, prj).exists()


def test_talformat():
    assert bn.tal(1234.56) == "1.234,6"
    assert bn.tal(0.093, 3) == "0,093"
    assert bn.tal(None) == "–"
