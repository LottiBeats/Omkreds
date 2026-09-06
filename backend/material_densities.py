"""
material_densities.py — nominelle densiteter, DS/EN 1991-1-1:2002 bilag A

Tabel A.1 til A.5, afskrevet fra standarden. Hver post bærer sin tabel, så en
værdi i et dokument kan føres tilbage til den række, den kom fra.

To ting at vide, før tallene bruges:

**Bilag A er informativt.** Det er nominelle værdier til projektering, ikke
garanterede egenskaber. Er der produktdata på det, der faktisk bygges med,
går de forud.

**Mange rækker er intervaller**, ikke tal. Standarden skriver 19,0 til 23,0
for cementmørtel, fordi det er spændet. Egenlast er næsten altid ugunstig, så
`default` er den øvre ende — men valget står i dokumentet, og den, der ved
bedre, skal kunne skrive noget andet.

Tagsten, tagpap, isoleringsbatts og lignende byggevarer står IKKE i bilag A.
De har ingen nominel densitet i Eurocoden; de har produktdatablade. Kilden er
det eneste, der gør en tabel som denne brugbar, så de er ikke fundet på her.
"""

# (nøgle, dansk navn, min, max, tabel)  — min == max når standarden giver ét tal
_RAW = [
    # ── Tabel A.1 — beton og mørtel ──────────────────────────────────────────
    ("lc10",            "Letbeton, densitetsklasse LC 1,0",  9.0,  10.0, "A.1"),
    ("lc12",            "Letbeton, densitetsklasse LC 1,2", 10.0,  12.0, "A.1"),
    ("lc14",            "Letbeton, densitetsklasse LC 1,4", 12.0,  14.0, "A.1"),
    ("lc16",            "Letbeton, densitetsklasse LC 1,6", 14.0,  16.0, "A.1"),
    ("lc18",            "Letbeton, densitetsklasse LC 1,8", 16.0,  18.0, "A.1"),
    ("lc20",            "Letbeton, densitetsklasse LC 2,0", 18.0,  20.0, "A.1"),
    ("beton",           "Beton, normal densitet",           24.0,  24.0, "A.1"),
    ("cementmoertel",   "Cementmørtel",                     19.0,  23.0, "A.1"),
    ("gipsmoertel",     "Gipsmørtel",                       12.0,  18.0, "A.1"),
    ("kalkcementmoertel", "Kalkcementmørtel",               18.0,  20.0, "A.1"),
    ("kalkmoertel",     "Kalkmørtel",                       12.0,  18.0, "A.1"),

    # ── Tabel A.2 — murværk og natursten ────────────────────────────────────
    ("terracotta",      "Terrakotta",                       21.0,  21.0, "A.2"),
    ("granit",          "Granit, syenit, porfyr",           27.0,  30.0, "A.2"),
    ("basalt",          "Basalt, diorit, gabbro",           27.0,  31.0, "A.2"),
    ("tachylyt",        "Tachylyt",                         26.0,  26.0, "A.2"),
    ("basaltlava",      "Basaltlava",                       24.0,  24.0, "A.2"),
    ("sandsten",        "Gråvakke, sandsten",               21.0,  27.0, "A.2"),
    ("kalksten_taet",   "Kalksten, tæt",                    20.0,  29.0, "A.2"),
    ("kalksten",        "Kalksten, øvrig",                  20.0,  20.0, "A.2"),
    ("tuf",             "Vulkansk tuf",                     20.0,  20.0, "A.2"),
    ("gnejs",           "Gnejs",                            30.0,  30.0, "A.2"),
    ("skifer",          "Skifer",                           28.0,  28.0, "A.2"),

    # ── Tabel A.3 — træ ─────────────────────────────────────────────────────
    ("C14", "Konstruktionstræ C14",  3.5,  3.5, "A.3"),
    ("C16", "Konstruktionstræ C16",  3.7,  3.7, "A.3"),
    ("C18", "Konstruktionstræ C18",  3.8,  3.8, "A.3"),
    ("C22", "Konstruktionstræ C22",  4.1,  4.1, "A.3"),
    ("C24", "Konstruktionstræ C24",  4.2,  4.2, "A.3"),
    ("C27", "Konstruktionstræ C27",  4.5,  4.5, "A.3"),
    ("C30", "Konstruktionstræ C30",  4.6,  4.6, "A.3"),
    ("C35", "Konstruktionstræ C35",  4.8,  4.8, "A.3"),
    ("C40", "Konstruktionstræ C40",  5.0,  5.0, "A.3"),
    ("D30", "Løvtræ D30",            6.4,  6.4, "A.3"),
    ("D35", "Løvtræ D35",            6.7,  6.7, "A.3"),
    ("D40", "Løvtræ D40",            7.0,  7.0, "A.3"),
    ("D50", "Løvtræ D50",            7.8,  7.8, "A.3"),
    ("D60", "Løvtræ D60",            8.4,  8.4, "A.3"),
    ("D70", "Løvtræ D70",           10.8, 10.8, "A.3"),
    ("GL24h", "Limtræ GL24h (homogent)", 3.7, 3.7, "A.3"),
    ("GL28h", "Limtræ GL28h (homogent)", 4.0, 4.0, "A.3"),
    ("GL32h", "Limtræ GL32h (homogent)", 4.2, 4.2, "A.3"),
    ("GL36h", "Limtræ GL36h (homogent)", 4.4, 4.4, "A.3"),
    ("GL24c", "Limtræ GL24c (kombineret)", 3.5, 3.5, "A.3"),
    ("GL28c", "Limtræ GL28c (kombineret)", 3.7, 3.7, "A.3"),
    ("GL32c", "Limtræ GL32c (kombineret)", 4.0, 4.0, "A.3"),
    ("GL36c", "Limtræ GL36c (kombineret)", 4.2, 4.2, "A.3"),
    ("kryds_naale",  "Krydsfiner, nåletræ",            5.0,  5.0, "A.3"),
    ("kryds_birk",   "Krydsfiner, birk",               7.0,  7.0, "A.3"),
    ("lamelplade",   "Lamelplade og blokplade",        4.5,  4.5, "A.3"),
    ("spaanplade",   "Spånplade",                      7.0,  8.0, "A.3"),
    ("cementspaan",  "Cementbundet spånplade",        12.0, 12.0, "A.3"),
    ("osb",          "OSB, flake board, wafer board",  7.0,  7.0, "A.3"),
    ("hardboard",    "Hårdt træfiberplade",           10.0, 10.0, "A.3"),
    ("mdf",          "MDF",                            8.0,  8.0, "A.3"),
    ("softboard",    "Porøs træfiberplade",            4.0,  4.0, "A.3"),

    # ── Tabel A.4 — metaller ────────────────────────────────────────────────
    ("aluminium",   "Aluminium",       27.0,  27.0, "A.4"),
    ("messing",     "Messing",         83.0,  85.0, "A.4"),
    ("bronze",      "Bronze",          83.0,  85.0, "A.4"),
    ("kobber",      "Kobber",          87.0,  89.0, "A.4"),
    ("stoebejern",  "Støbejern",       71.0,  72.5, "A.4"),
    ("smedejern",   "Smedejern",       76.0,  76.0, "A.4"),
    ("bly",         "Bly",            112.0, 114.0, "A.4"),
    ("staal",       "Stål",            77.0,  78.5, "A.4"),
    ("zink",        "Zink",            71.0,  72.0, "A.4"),

    # ── Tabel A.5 — øvrige materialer ───────────────────────────────────────
    ("glas_knust",  "Glas, knust",                     22.0, 22.0, "A.5"),
    ("glas_plade",  "Glas, i plader",                  25.0, 25.0, "A.5"),
    ("akryl",       "Akrylplade",                      12.0, 12.0, "A.5"),
    ("eps",         "Ekspanderet polystyren, granulat", 0.3,  0.3, "A.5"),
    ("skumglas",    "Skumglas",                         1.4,  1.4, "A.5"),
]

# Armeret beton er ikke en selvstændig række i tabel A.1 — det er normalbeton
# plus fodnote 1: "Increase by 1 kN/m³ for normal percentage of reinforcing and
# pre-stressing steel". Den står her, fordi det er den, folk faktisk slår op,
# og fordi den ellers bliver gættet til 25 uden at nogen skriver hvorfor.
_DERIVED = [
    ("jernbeton", "Jernbeton (beton + 1 kN/m³, note 1)", 25.0, 25.0, "A.1"),
    ("beton_frisk", "Frisk beton (beton + 1 kN/m³, note 2)", 25.0, 25.0, "A.1"),
]

DENSITIES = {
    key: {
        "key": key,
        "name": name,
        "min_kNm3": lo,
        "max_kNm3": hi,
        # Egenlast er næsten altid ugunstig, så et interval regnes fra sin
        # øvre ende med mindre nogen tager stilling til andet.
        "default_kNm3": hi,
        "is_range": lo != hi,
        "table": f"EN 1991-1-1 tabel {tbl}",
    }
    for key, name, lo, hi, tbl in (_RAW + _DERIVED)
}

# Rækkefølgen i standarden, til en menu der skal kunne genkendes
ORDER = [key for key, *_ in _RAW + _DERIVED]

_TABLE_TITLES = {
    "A.1": "Beton og mørtel",
    "A.2": "Murværk og natursten",
    "A.3": "Træ og træbaserede plader",
    "A.4": "Metaller",
    "A.5": "Øvrige materialer",
}


def groups() -> list:
    """Materialerne grupperet efter tabel, i standardens egen rækkefølge."""
    out, seen = [], {}
    for key in ORDER:
        tbl = DENSITIES[key]["table"].split()[-1]
        if tbl not in seen:
            seen[tbl] = {"table": tbl, "title": _TABLE_TITLES.get(tbl, tbl),
                         "materials": []}
            out.append(seen[tbl])
        seen[tbl]["materials"].append(DENSITIES[key])
    return out


def area_load_kNm2(material_key: str, thickness_mm: float,
                   density_kNm3: float | None = None) -> dict:
    """
    Fladelasten af et lag: g = γ · t.

    Returnerer også hvad regnestykket blev lavet med, så dokumentet kan skrive
    densiteten og dens kilde ud i stedet for et tal, ingen kan spore.
    """
    mat = DENSITIES.get(material_key)
    if mat is None:
        raise KeyError(f"Ukendt materiale: {material_key!r}")
    gamma = float(density_kNm3) if density_kNm3 is not None else mat["default_kNm3"]
    if thickness_mm < 0:
        raise ValueError("Tykkelsen kan ikke være negativ.")
    return {
        "material": mat["name"],
        "table": mat["table"],
        "density_kNm3": gamma,
        "thickness_mm": float(thickness_mm),
        "g_kNm2": gamma * float(thickness_mm) / 1000.0,
        "density_was_overridden": density_kNm3 is not None,
    }
