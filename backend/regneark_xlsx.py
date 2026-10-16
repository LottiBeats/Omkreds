"""
regneark_xlsx.py — regnearksbogen til og fra Excel (.xlsx).

Bogen (frontend/src/lib/regnearksbog.js) skriver formler som dansk Excel:
=HVIS(B2>0;B2*1,5;0) med semikolon, decimalkomma og danske funktionsnavne.
En .xlsx-fil gemmer formlerne i Excels interne, engelske form:
=IF(B2>0,B2*1.5,0), og Excel viser dem på brugerens eget sprog. Her
oversættes begge veje; tekst i anførselstegn og arknavne i apostroffer røres
ikke.

Navngivne celler (bog.navne) bliver Excel-navne og omvendt. Fed skrift,
decimaler og kolonnebredder følger med. Filen gemmes uden beregnede værdier;
Excel og LibreOffice regner formlerne, når filen åbnes.

    bog_til_xlsx(bog) -> bytes
    xlsx_til_bog(data) -> {"ark": [...], "navne": {...}, "advarsler": [...]}

xlsx_til_bog giver arkene med deres navne, som en skabelon (indsaetSkabelon i
regnearksbog.js), så en importeret bog lægges ind ved siden af de ark, der er.
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter, column_index_from_string
from openpyxl.workbook.defined_name import DefinedName

# Dansk navn (som Omkreds skriver det) → Excels interne navn.
DA_EN = {
    "SUM": "SUM", "MIN": "MIN", "MAKS": "MAX", "MIDDEL": "AVERAGE", "ANTAL": "COUNT",
    "SUMPRODUKT": "SUMPRODUCT", "HVIS": "IF", "OG": "AND", "ELLER": "OR", "IKKE": "NOT",
    "AFRUND": "ROUND", "RUND_OP": "ROUNDUP", "RUND.OP": "ROUNDUP", "AFRUND.OP": "ROUNDUP",
    "RUND_NED": "ROUNDDOWN", "RUND.NED": "ROUNDDOWN", "AFRUND.NED": "ROUNDDOWN",
    "ABS": "ABS", "KVROD": "SQRT", "POTENS": "POWER", "EKSP": "EXP", "LN": "LN", "LOG10": "LOG10",
    "PI": "PI", "SIN": "SIN", "COS": "COS", "TAN": "TAN", "ARCSIN": "ASIN", "ARCCOS": "ACOS",
    "ARCTAN": "ATAN", "RADIANER": "RADIANS", "GRADER": "DEGREES",
    "LOPSLAG": "VLOOKUP", "VOPSLAG": "HLOOKUP", "XOPSLAG": "_xlfn.XLOOKUP", "INDEKS": "INDEX",
    "SAMMENLIGN": "MATCH", "HVIS_FEJL": "IFERROR", "HVIS.FEJL": "IFERROR",
    "SUMHVIS": "SUMIF", "ANTAL_HVIS": "COUNTIF", "ANTAL.HVIS": "COUNTIF",
    "SAND": "TRUE", "FALSK": "FALSE",
}
# Engelsk (som i filen) → dansk, som dansk Excel skriver det.
EN_DA = {
    "SUM": "SUM", "MIN": "MIN", "MAX": "MAKS", "AVERAGE": "MIDDEL", "COUNT": "ANTAL",
    "SUMPRODUCT": "SUMPRODUKT", "IF": "HVIS", "AND": "OG", "OR": "ELLER", "NOT": "IKKE",
    "ROUND": "AFRUND", "ROUNDUP": "RUND.OP", "ROUNDDOWN": "RUND.NED", "ABS": "ABS", "SQRT": "KVROD",
    "POWER": "POTENS", "EXP": "EKSP", "LN": "LN", "LOG10": "LOG10", "PI": "PI",
    "SIN": "SIN", "COS": "COS", "TAN": "TAN", "ASIN": "ARCSIN", "ACOS": "ARCCOS", "ATAN": "ARCTAN",
    "RADIANS": "RADIANER", "DEGREES": "GRADER", "VLOOKUP": "LOPSLAG", "HLOOKUP": "VOPSLAG",
    "XLOOKUP": "XOPSLAG", "INDEX": "INDEKS", "MATCH": "SAMMENLIGN", "IFERROR": "HVIS.FEJL",
    "SUMIF": "SUMHVIS", "COUNTIF": "ANTAL.HVIS", "TRUE": "SAND", "FALSE": "FALSK",
}

_UGYLDIG_ARKNAVN = re.compile(r"[\[\]:*?/\\]")
_FUNK = re.compile(r"([A-Za-zÆØÅæøå_][\wÆØÅæøå.]*)\s*\(")
MAKS_BYTES = 10 * 1024 * 1024
MAKS_CELLER = 200_000


def _dele(formel: str):
    """Formlen delt i (tekst, er_beskyttet): "…" og '…' (arknavne) er beskyttet."""
    ud, i, n = [], 0, len(formel)
    buf = ""
    while i < n:
        c = formel[i]
        if c in "\"'":
            if buf:
                ud.append((buf, False))
                buf = ""
            j = i + 1
            while j < n:
                if formel[j] == c:
                    if j + 1 < n and formel[j + 1] == c:   # "" eller '' inde i teksten
                        j += 2
                        continue
                    break
                j += 1
            ud.append((formel[i:j + 1], True))
            i = j + 1
            continue
        buf += c
        i += 1
    if buf:
        ud.append((buf, False))
    return ud


def _oversaet(formel: str, til_en: bool, ukendte: set | None = None, maks_raekke: int = 1000) -> str:
    dele = []
    for tekst, beskyttet in _dele(formel):
        if beskyttet:
            dele.append(tekst)
            continue
        t = tekst
        if til_en:
            t = re.sub(r"(\d),(\d)", r"\1.\2", t)
            t = t.replace(";", ",").replace("·", "*").replace("×", "*").replace("−", "-")
            t = t.replace("²", "^2").replace("³", "^3")
            t = re.sub(r"(?<![\w.!])SAND(?![\w(])", "TRUE", t, flags=re.I)
            t = re.sub(r"(?<![\w.!])FALSK(?![\w(])", "FALSE", t, flags=re.I)
            t = _FUNK.sub(lambda m: f"{DA_EN.get(m.group(1).upper(), m.group(1).upper())}(", t)
        else:
            t = t.replace(",", ";")
            t = re.sub(r"(\d)\.(\d)", r"\1,\2", t)
            t = re.sub(r"(?<![\w.!])TRUE(?![\w(])", "SAND", t, flags=re.I)
            t = re.sub(r"(?<![\w.!])FALSE(?![\w(])", "FALSK", t, flags=re.I)
            # Hele kolonner (A:A) findes ikke i Omkreds — til de rækker, der er brugt.
            t = re.sub(r"(?<![\w$])(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})(?![\w(\d])",
                       lambda m: f"{m.group(1)}{m.group(2)}1:{m.group(3)}{m.group(4)}{maks_raekke}", t)

            def fn(m):
                navn = m.group(1).upper()
                if navn.startswith("_XLFN."):
                    navn = navn[6:]
                if navn.startswith("_XLWS."):
                    navn = navn[6:]
                if navn in EN_DA:
                    return f"{EN_DA[navn]}("
                if ukendte is not None:
                    ukendte.add(navn)
                return f"{navn}("
            t = _FUNK.sub(fn, t)
        dele.append(t)
    return "".join(dele)


def formel_til_excel(raw: str) -> str:
    """=HVIS(A1>0;1,5;0) → =IF(A1>0,1.5,0)"""
    return "=" + _oversaet(raw.strip()[1:], til_en=True)


def formel_fra_excel(raw: str, ukendte: set | None = None, maks_raekke: int = 1000) -> str:
    """=IF(A1>0,1.5,0) → =HVIS(A1>0;1,5;0)"""
    return "=" + _oversaet(str(raw).strip()[1:], til_en=False, ukendte=ukendte, maks_raekke=maks_raekke)


def _laes_tal(s: str):
    """Et tal skrevet som i Omkreds (1,5 · -7,4 · 1.000,5) → float, ellers None."""
    t = str(s).strip().replace(" ", "").replace(" ", "").replace("−", "-")
    if not t:
        return None
    if "," in t:
        if not re.fullmatch(r"[-+]?\d{1,3}(\.\d{3})*(,\d+)?|[-+]?\d+(,\d+)?", t):
            return None
        return float(t.replace(".", "").replace(",", "."))
    if re.fullmatch(r"[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?", t):
        return float(t)
    return None


def _arknavn_excel(navn: str, brugte: set) -> str:
    n = _UGYLDIG_ARKNAVN.sub("_", str(navn)).strip("'")[:31] or "Ark"
    base, i = n, 2
    while n.lower() in brugte:
        suf = f" {i}"
        n = base[:31 - len(suf)] + suf
        i += 1
    brugte.add(n.lower())
    return n


def _adr(a: str):
    m = re.fullmatch(r"\$?([A-Za-z]{1,3})\$?(\d+)", str(a or "").strip())
    if not m:
        return None
    return int(m.group(2)) - 1, column_index_from_string(m.group(1).upper()) - 1


def bog_til_xlsx(bog: dict) -> bytes:
    """Regnearksbogen som en .xlsx-fil (formlerne på Excels form, navne som Excel-navne)."""
    wb = Workbook()
    wb.remove(wb.active)
    brugte: set = set()
    titel_for = {}
    for a in (bog or {}).get("ark") or []:
        ws = wb.create_sheet(_arknavn_excel(a.get("navn", "Ark"), brugte))
        titel_for[a.get("id")] = ws.title
        celler = a.get("celler") or []
        dec = a.get("dec") or {}
        fed = a.get("fed") or {}
        for r, raek in enumerate(celler):
            for k, raw in enumerate(raek):
                if raw is None or raw == "":
                    continue
                s = str(raw)
                celle = ws.cell(row=r + 1, column=k + 1)
                if s.strip().startswith("=") and len(s.strip()) > 1:
                    celle.value = formel_til_excel(s)
                else:
                    tal = _laes_tal(s)
                    if tal is not None:
                        celle.value = int(tal) if tal.is_integer() and abs(tal) < 1e15 and "," not in s and "." not in s else tal
                    elif s.strip().lower() in ("sand", "falsk"):
                        celle.value = s.strip().lower() == "sand"
                    else:
                        celle.value = s
                adr = f"{get_column_letter(k + 1)}{r + 1}"
                d = dec.get(adr, dec.get(get_column_letter(k + 1)))
                if isinstance(d, int) and d >= 0:
                    celle.number_format = "0" if d == 0 else "0." + "0" * d
                if fed.get(adr):
                    celle.font = Font(bold=True)
        for k, px in enumerate(a.get("bredder") or []):
            if px:
                ws.column_dimensions[get_column_letter(k + 1)].width = max(4, round((px - 5) / 7, 1))
    if not wb.sheetnames:
        wb.create_sheet("Ark1")
    for navn, x in ((bog or {}).get("navne") or {}).items():
        titel = titel_for.get(x.get("ark"))
        a = _adr(x.get("celle"))
        if not titel or not a:
            continue
        ref = f"'{titel.replace(chr(39), chr(39) * 2)}'!${get_column_letter(a[1] + 1)}${a[0] + 1}"
        wb.defined_names[navn] = DefinedName(navn, attr_text=ref)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _tal_tekst(v: float) -> str:
    if isinstance(v, bool):
        return "SAND" if v else "FALSK"
    if isinstance(v, int) or (isinstance(v, float) and v.is_integer() and abs(v) < 1e15):
        return str(int(v))
    return repr(float(v)).replace(".", ",")


def _decimaler(fmt: str):
    m = re.search(r"0[.,](0+)", fmt or "")
    if m:
        return len(m.group(1))
    if (fmt or "").strip() in ("0", "#,##0"):
        return 0
    return None


def xlsx_til_bog(data: bytes) -> dict:
    """En .xlsx-fil som ark til regnearksbogen. Advarsler for det, der ikke kan komme med."""
    if len(data) > MAKS_BYTES:
        raise ValueError("Filen er større end 10 MB.")
    try:
        wb = load_workbook(io.BytesIO(data), data_only=False)
    except Exception as exc:   # noqa: BLE001 — en ødelagt fil er brugerens fejl, ikke serverens
        raise ValueError(f"Filen kan ikke læses som .xlsx: {exc}") from exc
    advarsler, ukendte = [], set()
    ark = []
    celler_i_alt = 0
    maks_raekke = max((ws.max_row for ws in wb.worksheets), default=1)
    for ws in wb.worksheets:
        celler, dec, fed, bredder = [], {}, {}, []
        nr = ws.max_row if ws.max_row and ws.max_column else 0
        for r in range(1, nr + 1):
            raek = []
            for k in range(1, ws.max_column + 1):
                c = ws.cell(row=r, column=k)
                v = c.value
                if v is None:
                    raek.append("")
                    continue
                celler_i_alt += 1
                if celler_i_alt > MAKS_CELLER:
                    raise ValueError(f"Filen har mere end {MAKS_CELLER} udfyldte celler.")
                adr = f"{get_column_letter(k)}{r}"
                if c.data_type == "f" or (isinstance(v, str) and v.startswith("=")):
                    raek.append(formel_fra_excel(str(v), ukendte, maks_raekke))
                elif hasattr(v, "text"):          # matrixformel o.l.
                    raek.append("=" + str(getattr(v, "text", "")).lstrip("="))
                    advarsler.append(f"{ws.title}!{adr}: matrixformel er hentet som almindelig formel.")
                elif isinstance(v, (int, float)):
                    raek.append(_tal_tekst(v))
                elif isinstance(v, (datetime, date)):
                    raek.append(v.date().isoformat() if isinstance(v, datetime) else v.isoformat())
                else:
                    raek.append(str(v))
                d = _decimaler(c.number_format)
                if d is not None and isinstance(v, (int, float)) or (d is not None and c.data_type == "f"):
                    dec[adr] = d
                if c.font is not None and c.font.b:
                    fed[adr] = True
            celler.append(raek)
        while celler and not any(x for x in celler[-1]):
            celler.pop()
        bredde = max((max((i + 1 for i, x in enumerate(r) if x != ""), default=0) for r in celler), default=0)
        celler = [(r + [""] * bredde)[:bredde] for r in celler] or [[""]]
        for k in range(1, max(bredde, 1) + 1):
            w = ws.column_dimensions[get_column_letter(k)].width
            bredder.append(round(w * 7 + 5) if w else (150 if k == 1 else 92))
        if ws.merged_cells.ranges:
            advarsler.append(f"{ws.title}: flettede celler er delt op igen (indholdet står i den øverste venstre).")
        ark.append({"navn": ws.title, "titel": "", "overskrift": False, "celler": celler,
                    "bredder": bredder, "dec": dec, "fed": fed})
    navne = {}
    for navn, dn in wb.defined_names.items():
        try:
            dest = list(dn.destinations)
        except Exception:   # noqa: BLE001 — navne med formler o.l. kan ikke peges på
            dest = []
        if len(dest) == 1 and re.fullmatch(r"\$?[A-Z]{1,3}\$?\d+", dest[0][1] or ""):
            navne[navn] = {"ark": dest[0][0], "celle": dest[0][1].replace("$", ""), "enhed": ""}
        else:
            advarsler.append(f"Navnet {navn} peger ikke på én celle og er ikke taget med.")
    if ukendte:
        advarsler.append("Funktioner, Omkreds ikke kan regne endnu (giver #NAVN?): " + ", ".join(sorted(ukendte)) + ".")
    return {"ark": ark, "navne": navne, "advarsler": advarsler}
