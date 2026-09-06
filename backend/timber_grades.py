"""
timber_grades.py - Timber grade lookup helpers.

Provides a forgiving text input such as:
- C24
- c24
- GL24h
- glh24H
"""

import re

import forallpeople as si

si.environment("structural", top_level=True)


TIMBER_GRADE_DATA = {
    "C14": {"f_mk": 14 * MPa, "f_vk": 2.5 * MPa, "f_c0k": 16 * MPa, "f_c_90_k": 2.0 * MPa, "E_0_05": 4_700 * MPa, "G_0_05":  294 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C14"},
    "C16": {"f_mk": 16 * MPa, "f_vk": 3.2 * MPa, "f_c0k": 17 * MPa, "f_c_90_k": 2.2 * MPa, "E_0_05": 5_400 * MPa, "G_0_05":  338 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C16"},
    "C18": {"f_mk": 18 * MPa, "f_vk": 3.4 * MPa, "f_c0k": 18 * MPa, "f_c_90_k": 2.2 * MPa, "E_0_05": 6_000 * MPa, "G_0_05":  375 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C18"},
    "C20": {"f_mk": 20 * MPa, "f_vk": 3.6 * MPa, "f_c0k": 19 * MPa, "f_c_90_k": 2.3 * MPa, "E_0_05": 6_400 * MPa, "G_0_05":  400 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C20"},
    "C22": {"f_mk": 22 * MPa, "f_vk": 3.8 * MPa, "f_c0k": 20 * MPa, "f_c_90_k": 2.4 * MPa, "E_0_05": 6_700 * MPa, "G_0_05":  419 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C22"},
    "C24": {"f_mk": 24 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 21 * MPa, "f_c_90_k": 2.5 * MPa, "E_0_05": 7_400 * MPa, "G_0_05":  463 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C24"},
    "C27": {"f_mk": 27 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 22 * MPa, "f_c_90_k": 2.6 * MPa, "E_0_05": 7_700 * MPa, "G_0_05":  481 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C27"},
    "C30": {"f_mk": 30 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 23 * MPa, "f_c_90_k": 2.7 * MPa, "E_0_05": 8_000 * MPa, "G_0_05":  500 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C30"},
    "C35": {"f_mk": 35 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 25 * MPa, "f_c_90_k": 2.8 * MPa, "E_0_05": 8_700 * MPa, "G_0_05":  544 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C35"},
    "C40": {"f_mk": 40 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 26 * MPa, "f_c_90_k": 2.9 * MPa, "E_0_05": 9_400 * MPa, "G_0_05":  588 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C40"},
    "C45": {"f_mk": 45 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 27 * MPa, "f_c_90_k": 3.1 * MPa, "E_0_05": 10_000 * MPa, "G_0_05":  625 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C45"},
    "C50": {"f_mk": 50 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 29 * MPa, "f_c_90_k": 3.2 * MPa, "E_0_05": 10_100 * MPa, "G_0_05":  631 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Konstruktionstræ C50"},
    "D30": {"f_mk": 30 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 23 * MPa, "f_c_90_k": 8.0 * MPa, "E_0_05": 9_500 * MPa, "G_0_05":  594 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Løvtræ D30"},
    "D35": {"f_mk": 35 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 25 * MPa, "f_c_90_k": 8.0 * MPa, "E_0_05": 10_000 * MPa, "G_0_05":  625 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Løvtræ D35"},
    "D40": {"f_mk": 40 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 26 * MPa, "f_c_90_k": 8.0 * MPa, "E_0_05": 10_500 * MPa, "G_0_05":  656 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Løvtræ D40"},
    "D50": {"f_mk": 50 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 29 * MPa, "f_c_90_k": 8.0 * MPa, "E_0_05": 11_800 * MPa, "G_0_05":  738 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Løvtræ D50"},
    "D60": {"f_mk": 60 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 32 * MPa, "f_c_90_k": 8.0 * MPa, "E_0_05": 13_600 * MPa, "G_0_05":  850 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Løvtræ D60"},
    "D70": {"f_mk": 70 * MPa, "f_vk": 4.0 * MPa, "f_c0k": 34 * MPa, "f_c_90_k": 8.0 * MPa, "E_0_05": 14_100 * MPa, "G_0_05":  881 * MPa, "material_type": "solid_timber", "support_material": "solid_timber", "description": "Løvtræ D70"},
    "GL20H": {"f_mk": 20 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 24 * MPa, "f_c_90_k": 2.4 * MPa, "E_0_05": 8_400 * MPa, "G_0_05":  525 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL20h"},
    "GL22H": {"f_mk": 22 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 26 * MPa, "f_c_90_k": 2.5 * MPa, "E_0_05": 9_100 * MPa, "G_0_05":  569 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL22h"},
    "GL24H": {"f_mk": 24 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 24 * MPa, "f_c_90_k": 2.5 * MPa, "E_0_05": 9_400 * MPa, "G_0_05":  588 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL24h"},
    "GL26H": {"f_mk": 26 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 26.5 * MPa, "f_c_90_k": 2.6 * MPa, "E_0_05": 9_700 * MPa, "G_0_05":  606 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL26h"},
    "GL28H": {"f_mk": 28 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 29 * MPa, "f_c_90_k": 2.7 * MPa, "E_0_05": 10_100 * MPa, "G_0_05":  631 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL28h"},
    "GL30H": {"f_mk": 30 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 31 * MPa, "f_c_90_k": 2.7 * MPa, "E_0_05": 10_500 * MPa, "G_0_05":  656 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL30h"},
    "GL32H": {"f_mk": 32 * MPa, "f_vk": 3.8 * MPa, "f_c0k": 33 * MPa, "f_c_90_k": 2.8 * MPa, "E_0_05": 11_100 * MPa, "G_0_05":  694 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL32h"},
    "GL20C": {"f_mk": 20 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 24 * MPa, "f_c_90_k": 2.3 * MPa, "E_0_05": 8_400 * MPa, "G_0_05":  525 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL20c"},
    "GL22C": {"f_mk": 22 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 26 * MPa, "f_c_90_k": 2.4 * MPa, "E_0_05": 9_100 * MPa, "G_0_05":  569 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL22c"},
    "GL24C": {"f_mk": 24 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 24 * MPa, "f_c_90_k": 2.5 * MPa, "E_0_05": 9_400 * MPa, "G_0_05":  588 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL24c"},
    "GL26C": {"f_mk": 26 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 26.5 * MPa, "f_c_90_k": 2.6 * MPa, "E_0_05": 9_700 * MPa, "G_0_05":  606 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL26c"},
    "GL28C": {"f_mk": 28 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 29 * MPa, "f_c_90_k": 2.7 * MPa, "E_0_05": 10_100 * MPa, "G_0_05":  631 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL28c"},
    "GL30C": {"f_mk": 30 * MPa, "f_vk": 3.5 * MPa, "f_c0k": 31 * MPa, "f_c_90_k": 2.7 * MPa, "E_0_05": 10_500 * MPa, "G_0_05":  656 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL30c"},
    "GL32C": {"f_mk": 32 * MPa, "f_vk": 3.8 * MPa, "f_c0k": 33 * MPa, "f_c_90_k": 2.8 * MPa, "E_0_05": 11_100 * MPa, "G_0_05":  694 * MPa, "material_type": "glulam", "support_material": "glulam", "description": "Limtræ GL32c"},
}


def normalize_timber_grade(grade):
    if grade is None:
        return None
    key = re.sub(r"[^A-Za-z0-9]", "", str(grade)).upper()
    if key.startswith("GLH"):
        key = "GL" + key[3:]
    return key


def get_timber_grade(grade):
    key = normalize_timber_grade(grade)
    if key not in TIMBER_GRADE_DATA:
        available = ", ".join(sorted(TIMBER_GRADE_DATA))
        raise ValueError(f"Unknown timber grade '{grade}'. Available grades: {available}")
    return key, TIMBER_GRADE_DATA[key]


# ── E_0,mean til nedbøjning ──────────────────────────────────────────────────
# Tabellen har kun 5 %-fraktilen, som bruges til bæreevne. Nedbøjning regnes
# med middelværdien (EN 1995-1-1 §2.2.3), og den udledes her af standardernes
# egne forhold mellem de to:
#
#   EN 338 §5   nåletræ (C):   E_0,05 = 0,67 · E_0,mean
#   EN 338 §5   løvtræ  (D):   E_0,05 = 0,84 · E_0,mean
#   EN 14080    limtræ  (GL):  E_0,g,05 = 0,85 · E_0,g,mean
#
# Kontrol mod de tabellerede middelværdier: C24 giver 11 045 mod 11 000 MPa,
# C30 11 940 mod 12 000, D30 11 310 mod 11 000, GL28h 11 882 mod 12 600. De tre
# første ligger inden for en halv procent til knap tre; limtræet lander knap
# 6 % LAVT, hvilket for en nedbøjning er den sikre side.
#
# Skal det være helt nøjagtigt, skal de tabellerede middelværdier skrives ind
# pr. klasse. Indtil da står forholdet og dets kilde i dokumentet, så læseren
# kan se hvad tallet er.
_E05_TIL_EMEAN = {
    "solid_timber": 0.67,   # ændres til 0,84 for D-klasser nedenfor
    "glulam":       0.85,
}


def E_0_mean(grade_key: str):
    """
    Middelværdien af elasticitetsmodulet for en styrkeklasse.

    Returnerer en forallpeople-størrelse som resten af tabellen, plus det
    forhold og den kilde, den er udledt af.
    """
    key, data = get_timber_grade(grade_key)
    mtype = data["material_type"]
    if mtype == "glulam":
        forhold, kilde = 0.85, "EN 14080 (E_0,g,05 = 0,85 · E_0,g,mean)"
    elif key.upper().startswith("D"):
        forhold, kilde = 0.84, "EN 338 §5, løvtræ (E_0,05 = 0,84 · E_0,mean)"
    else:
        forhold, kilde = 0.67, "EN 338 §5, nåletræ (E_0,05 = 0,67 · E_0,mean)"
    return data["E_0_05"] / forhold, forhold, kilde


# k_def, EN 1995-1-1 tabel 3.2 — konstruktionstræ, limtræ og LVL.
# Plader har andre værdier; de er ikke i denne tabel.
K_DEF = {1: 0.60, 2: 0.80, 3: 2.00}
