"""
byggevarer.py — vejledende egenvægt af byggevarer, der ikke står i bilag A

DS/EN 1991-1-1 bilag A har beton, træ, metal og natursten, men ikke tagsten,
tagpap, gips eller mineraluld. De har ingen nominel densitet i Eurocoden; de
har produktdatablade. Værdierne her er typiske produktværdier, valgt i den
tunge ende, så de kan bruges i et skitseprojekt og står som *vejledende* i
dokumentet. Er produktet kendt, skal databladets tal skrives ind i stedet —
begge felter kan overskrives i blokken.

To slags poster:

  "densitet"  kN/m³, ganges med en tykkelse (plader, isolering, murværk)
  "flade"     kN/m² for hele laget, uanset tykkelse (tagsten, pap, folier)
"""

KILDE = "vejledende, typisk produktværdi"

# (nøgle, navn, slags, værdi, bemærkning)
_RAW = [
    # ── Tagdækning ──────────────────────────────────────────────────────────
    ("tegltagsten",   "Tegltagsten (vingetegl)",           "flade", 0.50, "ca. 45–50 kg/m²"),
    ("betontagsten",  "Betontagsten",                      "flade", 0.50, "ca. 42–50 kg/m²"),
    ("naturskifer",   "Naturskifer",                       "flade", 0.50, "ca. 40–50 kg/m²"),
    ("fiberskifer",   "Fibercementskifer",                 "flade", 0.25, "ca. 20–25 kg/m²"),
    ("boelgeplade",   "Fibercement-bølgeplader",           "flade", 0.20, "ca. 17–20 kg/m²"),
    ("staaltagplade", "Stålprofilplader, tag",             "flade", 0.10, "0,5–0,7 mm, profileret"),
    ("tagpap_1",      "Tagpap, 1 lag",                     "flade", 0.05, "ca. 4–5 kg/m²"),
    ("tagpap_2",      "Tagpap, 2 lag",                     "flade", 0.10, "ca. 8–10 kg/m²"),
    ("undertag",      "Undertag (dug)",                    "flade", 0.01, ""),
    ("dampspaerre",   "Dampspærre (PE-folie)",             "flade", 0.01, ""),

    # ── Plader ──────────────────────────────────────────────────────────────
    ("gips",          "Gipsplade, standard",               "densitet", 7.0, "ca. 700 kg/m³"),
    ("gips_brand",    "Gipsplade, brand (type F)",         "densitet", 8.5, "ca. 850 kg/m³"),
    ("fibercement",   "Fibercementplade",                  "densitet", 16.0, "ca. 1600 kg/m³"),

    # ── Isolering ───────────────────────────────────────────────────────────
    ("glasuld",       "Mineraluld, glasuld",               "densitet", 0.20, "ca. 15–20 kg/m³"),
    ("stenuld",       "Mineraluld, stenuld (bats)",        "densitet", 0.40, "ca. 30–40 kg/m³"),
    ("stenuld_tag",   "Stenuld, trædefast tagplade",       "densitet", 1.60, "ca. 140–160 kg/m³"),
    ("eps_plade",     "EPS-isolering, plader",             "densitet", 0.30, "ca. 15–30 kg/m³"),
    ("pir",           "PIR-isolering",                     "densitet", 0.35, "ca. 30–35 kg/m³"),

    # ── Murværk ─────────────────────────────────────────────────────────────
    ("teglmur",       "Murværk af massive teglsten, inkl. fuger", "densitet", 18.0, "ca. 1800 kg/m³"),
    ("porebeton",     "Porebeton (gasbeton), inkl. fugt",  "densitet", 6.0, "ca. 535 kg/m³ tør"),
]

BYGGEVARER = {
    key: {
        "key": key,
        "name": name,
        "kind": kind,
        "value": value,
        "unit": "kN/m²" if kind == "flade" else "kN/m³",
        "note": note,
        "source": KILDE,
    }
    for key, name, kind, value, note in _RAW
}

ORDER = [key for key, *_ in _RAW]


def liste() -> list:
    return [BYGGEVARER[k] for k in ORDER]
