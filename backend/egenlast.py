"""
egenlast.py — egenlast af en bygningsdel ud fra dens lagopbygning (EN 1991-1-1)

En væg, et tag eller et dæk beskrives lag for lag, udefra og ind:

    gips 13 mm + 45×195 c/c 600 + isolering 195 mm + tagsten  →  g_k [kN/m²]

Tre slags lag:

  "lag"    en plade eller et fyld:      g = γ · t
  "ribbe"  spær, stolper, lægter:       g = γ · b · h / (c/c)
  "fast"   en fladelast for hele laget: g angives direkte (tagsten, pap, folie)

γ slås op i DS/EN 1991-1-1 bilag A (material_densities) eller, for byggevarer
som bilag A ikke har, i en tabel over vejledende produktværdier (byggevarer).
Begge kan overskrives med databladets tal.

Alle lag regnes pr. m² af selve fladen. For et tag er det den skrå flade, og
lasten pr. m² vandret projektion er g / cos α — en skrå tagflade er længere
end sin grundplan. Isolering mellem ribber regnes over hele fladen; det er på
den sikre side og lille.

Resultatet eksporteres som G_k, så lastkombinationer og "Laster på rammen"
kan hente det i stedet for at få det tastet af.
"""
import math

from calc_core import S, T, N, TBL, CALC_ROW, MH
from material_densities import DENSITIES
from byggevarer import BYGGEVARER

BYGNINGSDELE = {
    "tag":  "Tag",
    "daek": "Dæk",
    "vaeg": "Væg",
}


def _dk(v, d=3):
    return f"{v:.{d}f}".replace(".", ",")


def _densitet(key, override):
    """γ [kN/m³] og kilde for et materiale, fra bilag A eller byggevarerne."""
    if not key:
        if override is not None:
            return "", float(override), "angivet"
        raise ValueError("Et lag mangler materiale eller densitet.")
    if key in DENSITIES:
        m = DENSITIES[key]
        navn, gamma, kilde = m["name"], m["default_kNm3"], m["table"]
    elif key in BYGGEVARER and BYGGEVARER[key]["kind"] == "densitet":
        m = BYGGEVARER[key]
        navn, gamma, kilde = m["name"], m["value"], m["source"]
    else:
        raise ValueError(f"Ukendt materiale: {key!r}")
    if override is not None:
        return navn, float(override), "angivet"
    return navn, gamma, kilde


def regn_lag(l: dict) -> dict:
    """Ét lag → {'navn', 'opbygning', 'kilde', 'g'} med g i kN/m² flade."""
    typ = l.get("type") or "fast"
    besk = (l.get("beskrivelse") or "").strip()

    if typ == "lag":
        navn, gamma, kilde = _densitet(l.get("materiale"), l.get("gamma_kNm3"))
        t = float(l.get("t_mm") or 0)
        if t < 0:
            raise ValueError(f"{besk or navn}: tykkelsen kan ikke være negativ.")
        g = gamma * t / 1000.0
        opb = f"{t:.0f} mm · {_dk(gamma, 2)} kN/m³"

    elif typ == "ribbe":
        navn, gamma, kilde = _densitet(l.get("materiale") or "C24", l.get("gamma_kNm3"))
        b = float(l.get("b_mm") or 0)
        h = float(l.get("h_mm") or 0)
        cc = float(l.get("cc_mm") or 0)
        if b <= 0 or h <= 0:
            raise ValueError(f"{besk or navn}: ribben skal have bredde og højde.")
        if cc < b:
            raise ValueError(f"{besk or navn}: c/c = {cc:.0f} mm er mindre end "
                             f"bredden {b:.0f} mm.")
        g = gamma * (b / 1000) * (h / 1000) / (cc / 1000)
        opb = f"{b:.0f}×{h:.0f} c/c {cc:.0f} · {_dk(gamma, 2)} kN/m³"

    elif typ == "fast":
        g = float(l.get("g_kNm2") or 0)
        p = BYGGEVARER.get(l.get("produkt") or "")
        if p and p["kind"] == "flade":
            navn = p["name"]
            kilde = p["source"] if abs(g - p["value"]) < 1e-9 else "angivet"
        else:
            navn, kilde = "", "angivet"
        opb = ""

    else:
        raise ValueError(f"Ukendt lagtype: {typ!r}")

    return {"navn": besk or navn or "Lag", "opbygning": opb,
            "kilde": kilde, "g": g}


def egenlast(*, label="G1", bygningsdel="tag", alpha_deg=0.0, lag=(),
             bredde_m=0.0):
    """
    Returnerer (blocks, exports).

    bredde_m : tag og dæk — belastningsbredde (fx spærafstand), væg — højde.
               0 = ingen linjelast.
    """
    if bygningsdel not in BYGNINGSDELE:
        raise ValueError(f"Ukendt bygningsdel: {bygningsdel!r}")
    if not lag:
        raise ValueError("Opbygningen har ingen lag.")

    er_tag = bygningsdel == "tag"
    alpha = float(alpha_deg or 0) if er_tag else 0.0
    if not 0 <= alpha < 90:
        raise ValueError("Taghældningen skal ligge mellem 0° og 90°.")
    cos_a = math.cos(math.radians(alpha))

    rows = [regn_lag(l) for l in lag]
    g_flade = sum(r["g"] for r in rows)
    g_vandret = g_flade / cos_a
    bredde = float(bredde_m or 0)

    del_navn = BYGNINGSDELE[bygningsdel]
    blocks = [MH(
        f"{label} — Egenlast, {del_navn.lower()}  (EN 1991-1-1)",
        (f"α = {_dk(alpha, 1)}°  ·  " if er_tag else "")
        + "karakteristiske værdier",
        "general",
    )]

    enhed_flade = "kN/m² tagflade" if er_tag else "kN/m²"
    blocks.append(S(f"Opbygning — {del_navn.lower()}, pr. m² "
                    + ("tagflade" if er_tag else "flade")))
    tabel = [[r["navn"], r["opbygning"], r["kilde"], _dk(r["g"])] for r in rows]
    tabel.append(["I alt  g_k", "", "", _dk(g_flade)])
    blocks.append(TBL(["Lag", "Opbygning", "Kilde", "g_k  [kN/m²]"], tabel))

    if any(r["kilde"] == "vejledende, typisk produktværdi" for r in rows):
        blocks.append(N(
            "Lag mærket \"vejledende\" står ikke i DS/EN 1991-1-1 bilag A. "
            "Værdien er en typisk produktværdi og skal kontrolleres mod "
            "producentens datablad for det produkt, der bygges med."))
    if any(l.get("type") == "ribbe" for l in lag):
        blocks.append(N(
            "Ribber regnes som γ · b · h / (c/c). Isolering mellem ribberne er "
            "regnet over hele fladen, hvilket er på den sikre side."))

    blocks.append(S("Karakteristisk egenlast"))
    blocks.append(CALC_ROW("g_k", "= Σ g_lag", f"{_dk(g_flade)} {enhed_flade}"))
    if er_tag:
        blocks += [
            CALC_ROW("cos α", f"cos({_dk(alpha, 1)}°)", _dk(cos_a, 4)),
            CALC_ROW("g_k,vandret", "= g_k / cos α",
                     f"{_dk(g_vandret)} kN/m² vandret projektion"),
        ]

    g_linje = None
    if bredde > 0:
        if bygningsdel == "vaeg":
            g_linje = g_flade * bredde
            blocks.append(S("Linjelast fra væggen"))
            blocks += [
                CALC_ROW("H", "væghøjde", f"{_dk(bredde, 2)} m"),
                CALC_ROW("g_k,linje", "= g_k · H", f"{_dk(g_linje)} kN/m"),
            ]
        else:
            g_linje = g_vandret * bredde
            blocks.append(S("Linjelast pr. bjælke" if not er_tag
                            else "Linjelast pr. spær, vandret projektion"))
            blocks += [
                CALC_ROW("a", "belastningsbredde", f"{_dk(bredde, 2)} m"),
                CALC_ROW("g_k,linje",
                         "= g_k,vandret · a" if er_tag else "= g_k · a",
                         f"{_dk(g_linje)} kN/m"),
            ]

    exports = {
        "label": label,
        "bygningsdel": bygningsdel,
        "alpha_deg": alpha,
        "g_flade_kNm2": round(g_flade, 4),
        "g_vandret_kNm2": round(g_vandret, 4),
        "g_linje_kNm": round(g_linje, 4) if g_linje is not None else None,
        "bredde_m": bredde,
    }
    return blocks, exports
