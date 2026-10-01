"""
byg_notat.py — energinotat (Markdown + projekt.yaml) -> PDF i Omkreds' rapportstil.

    python energi/rapport/byg_notat.py energi/projekter/hjerlesvej

Notatet skrives i notat.md; sagsoplysningerne står i projekt.yaml. PDF'en
laves med den samme motor som de statiske rapporter (backend/holst_layout.py,
IBM Plex, forside, indholdsfortegnelse), så energinotater og statik ser ud
som det samme firma.

Forsiden er ikke den statiske (certificering, DS 1140-dokumentliste): et
energinotat har sagsoplysninger, revisioner og underskrifter.
"""
import re
import sys
from pathlib import Path

import yaml

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from calc_core import COVER, TOC, PAGEBREAK  # noqa: E402
from holst_layout import generate_pdf_holst  # noqa: E402
from pdf_builder import _convert_block, _number_headings  # noqa: E402
from figurer import nummerer_figurer  # noqa: E402


# ── Markdown -> Omkreds-blokke ────────────────────────────────────────────────
#
# Kun det notaterne bruger: ## og ### overskrifter, afsnit, punkt- og
# nummerlister, tabeller og **fed**. Links skrives som deres tekst.

_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def _ren(s: str) -> str:
    return _LINK.sub(r"\1", s.strip())


def _celle(s: str) -> str:
    return _ren(s).replace("**", "")


def md_til_blokke(md: str) -> list:
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    blokke, afsnit, tabel = [], [], []

    def tøm_afsnit():
        if afsnit:
            blokke.append({"type": "text", "data": {"text": " ".join(afsnit)}})
            afsnit.clear()

    def tøm_tabel():
        if tabel:
            rækker = [r for r in tabel if not re.fullmatch(r"\|[\s:|-]+\|", r)]
            rows = [[_celle(c) for c in r.strip("|").split("|")] for r in rækker]
            blokke.append({"type": "table",
                           "data": {"has_header": True, "rows": rows}})
            tabel.clear()

    for linje in md.splitlines():
        s = linje.strip()
        if s.startswith("|"):
            tøm_afsnit()
            tabel.append(s)
            continue
        tøm_tabel()
        if not s:
            tøm_afsnit()
        elif s.startswith("# "):
            continue                       # titlen står på forsiden
        elif s.startswith("### "):
            tøm_afsnit()
            blokke.append({"type": "heading", "data": {"level": 2, "text": _ren(s[4:])}})
        elif s.startswith("## "):
            tøm_afsnit()
            blokke.append({"type": "heading", "data": {"level": 1, "text": _ren(s[3:])}})
        elif re.match(r"^(- |\d+\. )", s):
            tøm_afsnit()
            m = re.match(r"^(- |(\d+)\. )(.*)", s)
            tegn = f"{m.group(2)}." if m.group(2) else "•"
            blokke.append({"type": "text", "data": {"text": f"{tegn}  {_ren(m.group(3))}"}})
        else:
            afsnit.append(_ren(s))
    tøm_afsnit()
    tøm_tabel()
    return blokke


# ── Forside ──────────────────────────────────────────────────────────────────

def _v(p: dict, k: str) -> str:
    return str(p.get(k) or "—")


def forside_blokke(p: dict) -> list:
    revs = p.get("revisioner") or []
    rev_rows = [["Rev.", "Dato", "Beskrivelse"]] + [
        [str(r.get("rev", "")), str(r.get("dato", "")), str(r.get("beskrivelse", ""))]
        for r in revs] if revs else [["Rev.", "Dato", "Beskrivelse"], ["—", "—", "Ikke udstedt"]]
    return [
        {"type": "table", "data": {"caption": "Sagsoplysninger", "has_header": False,
         "col_widths": [26, 74], "rows": [
             ["Sag:", _v(p, "sag")], ["Emne:", _v(p, "emne")],
             ["Adresse:", _v(p, "adresse")], ["Matrikel:", _v(p, "matrikel")],
             ["Sags. nr.:", _v(p, "sagsnr")], ["Fase:", _v(p, "fase")],
             ["Bygherre:", _v(p, "bygherre")], ["Arkitekt:", _v(p, "arkitekt")],
             ["Grundlag:", _v(p, "grundlag")],
             ["Regelgrundlag:", f"BR18, version {_v(p, 'regelversion')}"]]}},
        {"type": "table", "data": {"caption": "Revisioner", "has_header": True,
         "col_widths": [12, 20, 68], "rows": rev_rows}},
        {"type": "table", "data": {"caption": "Underskrifter", "has_header": True,
         "col_widths": [33, 33, 34], "rows": [
             ["Udarbejdet", "Kontrolleret", "Godkendt"], ["", "", ""],
             [_v(p, "udarbejdet"), _v(p, "kontrolleret"), _v(p, "godkendt")]]}},
    ]


def flad_projekt(p: dict) -> dict:
    revs = p.get("revisioner") or []
    sidste = revs[-1] if revs else {}
    return {
        "project": p.get("sag", ""), "ref": p.get("sagsnr", ""),
        "title": p.get("emne", ""), "section": "Energinotat",
        "revision": sidste.get("rev", ""), "revision_desc": sidste.get("beskrivelse", ""),
        "client": p.get("bygherre", ""), "standard": "BR18",
        "engineer": p.get("udarbejdet", ""), "checker": p.get("kontrolleret", ""),
        "approver": p.get("godkendt", ""), "date": sidste.get("dato", ""),
        "firm": p.get("firma", ""), "address": "", "phone": "", "email": "", "cvr": "",
        "doc_id": "", "revisions": [
            {"rev": r.get("rev"), "date": r.get("dato"), "description": r.get("beskrivelse")}
            for r in revs],
        "cover_image_path": "", "logo_path": "",
    }


def byg(projektmappe: Path) -> Path:
    p = yaml.safe_load((projektmappe / "projekt.yaml").read_text(encoding="utf-8"))
    md = (projektmappe / "notat.md").read_text(encoding="utf-8")

    indhold = nummerer_figurer(_number_headings(md_til_blokke(md)))
    tmp: list[str] = []
    alle = COVER(flad_projekt(p))
    for b in forside_blokke(p):
        alle.extend(_convert_block(b, tmp))
    alle += PAGEBREAK() + TOC()
    for b in indhold:
        alle.extend(_convert_block(b, tmp))

    ud = projektmappe / "ud" / f"Energinotat_{p.get('sag', 'projekt')}.pdf"
    ud.parent.mkdir(exist_ok=True)
    generate_pdf_holst(flad_projekt(p), alle, str(ud))
    return ud


if __name__ == "__main__":
    mappe = Path(sys.argv[1] if len(sys.argv) > 1 else "energi/projekter/hjerlesvej")
    print(byg(mappe.resolve()))
