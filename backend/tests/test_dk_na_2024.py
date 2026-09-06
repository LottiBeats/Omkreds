"""
test_dk_na_2024.py — ψ-faktorer og ulykkeskombinationer mod selve standarden

Værdierne er afskrevet fra DS/EN 1990 DK NA:2024, rev. 2023-12-19, tabel A1.1
og A1.3 (Social- og Boligstyrelsen). Modulet citerede 2019-udgaven; tallene er
uændrede, men det er kontrolleret og ikke antaget.

En ψ-faktor er ren data. Der er intet i koden, der fanger en tastefejl — en
0,3 der bliver til 0,6 giver et plausibelt tal hele vejen ud i dokumentet.
"""
import pytest

import load_combo as lc

# Tabel A1.1 DK NA: (ψ₀, ψ₁, ψ₂)
TABEL_A1_1 = {
    "A": (0.5, 0.3, 0.2),   # arealer til boligformål
    "B": (0.6, 0.4, 0.2),   # kontorarealer
    "C": (0.6, 0.6, 0.5),   # større forsamlingsarealer
    "D": (0.6, 0.6, 0.5),   # butiksarealer
    "E": (0.8, 0.8, 0.7),   # erhverv og lagerarealer
    "F": (0.6, 0.6, 0.5),   # trafikarealer ≤ 30 kN
    "G": (0.6, 0.4, 0.2),   # trafikarealer 30–160 kN
    "H": (0.0, 0.0, 0.0),   # tage
    "S": (0.3, 0.2, 0.0),   # snelast, "ellers"
    "W": (0.3, 0.2, 0.0),   # vindlast, "ellers"
    "T": (0.6, 0.5, 0.0),   # temperaturlast
}


@pytest.mark.parametrize("kat,vaerdier", sorted(TABEL_A1_1.items()))
def test_psi_factors_match_table_a1_1(kat, vaerdier):
    assert lc.PSI_DK[kat] == pytest.approx(vaerdier), f"kategori {kat}"


def test_no_extra_categories():
    """En kategori, standarden ikke har, ville blive brugt uden at nogen vidste det."""
    assert set(lc.PSI_DK) == set(TABEL_A1_1)


def test_roofs_carry_no_accompanying_load():
    """Kategori H er 0 i alle tre kolonner — et tag ledsager ikke noget."""
    assert lc.PSI_DK["H"] == (0.0, 0.0, 0.0)


# ── De tre kontekstregler for ψ₀ ────────────────────────────────────────────
# Tabellen deler sne og vind op efter hvad der dominerer:
#   Sne, dominerende nyttelast kat. E eller temperatur  → 0,6
#   Sne, dominerende vindlast                           → 0
#   Sne, ellers                                         → 0,3
#   Vind, dominerende nyttelast kat. E                  → 0,6
#   Vind, ellers                                        → 0,3

@pytest.mark.parametrize("lead,forventet", [
    ("E", 0.6), ("T", 0.6),          # kat. E eller temperatur dominerer
    ("W", 0.0),                       # vind dominerer → sne regnes ikke med
    ("A", 0.3), ("B", 0.3), ("C", 0.3), ("G", 0.3),
])
def test_snow_psi_zero_depends_on_the_leading_action(lead, forventet):
    assert lc._psi0("S", lead) == pytest.approx(forventet)


@pytest.mark.parametrize("lead,forventet", [
    ("E", 0.6),
    ("A", 0.3), ("S", 0.3), ("T", 0.3), ("C", 0.3),
])
def test_wind_psi_zero_depends_on_the_leading_action(lead, forventet):
    assert lc._psi0("W", lead) == pytest.approx(forventet)


def test_other_categories_are_not_context_dependent():
    """Kun sne og vind har delte rækker i tabellen."""
    for kat in ("A", "B", "C", "D", "E", "F", "G", "H", "T"):
        for lead in ("A", "E", "W", "S", "T"):
            assert lc._psi0(kat, lead) == pytest.approx(TABEL_A1_1[kat][0]), \
                f"{kat} ændrede sig med {lead} som dominerende"


# ── K_FI, note 4 side 6 ─────────────────────────────────────────────────────

def test_k_fi_per_consequence_class():
    assert lc.K_FI_MAP == {"CC1": 0.9, "CC2": 1.0, "CC3": 1.1}


# ── Tabel A1.3: ulykke og brand ─────────────────────────────────────────────
# Brand          G + A_d + ψ₁,₁·Q_k,₁ + Σ ψ₂,ᵢ·Q_k,ᵢ     (formel 6.11a/b)
# Ulykke i øvrigt G + A_d + ψ₂,₁·Q_k,₁ + Σ ψ₂,ᵢ·Q_k,ᵢ

def _als(client, accidental_type, A_d=10.0):
    r = client.post("/calc/load-combo", json={
        "label": "LC", "unit": "kN/m", "G_k": 5.0,
        "loads": [{"label": "Nytte", "Q_k": 4.0, "category": "A"},
                  {"label": "Sne", "Q_k": 2.0, "category": "S"}],
        "method": "6.10ab", "consequence_class": "CC2",
        "A_d": A_d, "accidental_type": accidental_type})
    assert r.status_code == 200, r.text
    for b in r.json():
        if (isinstance(b, dict) and b.get("type") == "calc_row"
                and str(b.get("name", "")).startswith("E_d,ALS")):
            return float(b["result"].split()[0])
    raise AssertionError("ingen ALS-række")


def test_fire_uses_psi_one_on_the_leading_action(client):
    """
    Brand: G + A_d + ψ₁·Q₁ + ψ₂·Q₂. Med nyttelast kat. A dominerende er
    ψ₁ = 0,3 og sneens ψ₂ = 0.  5 + 10 + 0,3·4 + 0·2 = 16,20
    """
    assert _als(client, "fire") == pytest.approx(16.20, abs=1e-6)


def test_other_accidents_use_psi_two_throughout(client):
    """
    Ulykke i øvrigt: G + A_d + ψ₂·Q₁ + ψ₂·Q₂.
    5 + 10 + 0,2·4 + 0·2 = 15,80 — mindre end brand, og det skal det være.
    """
    assert _als(client, "other") == pytest.approx(15.80, abs=1e-6)


def test_fire_is_never_lower_than_another_accident(client):
    """ψ₁ ≥ ψ₂ for alle kategorier i tabel A1.1, så brand kan ikke give mindre."""
    assert _als(client, "fire") >= _als(client, "other")


def test_no_accidental_action_means_no_als_row(client):
    r = client.post("/calc/load-combo", json={
        "label": "LC", "unit": "kN/m", "G_k": 5.0,
        "loads": [{"label": "Nytte", "Q_k": 4.0, "category": "A"}],
        "method": "6.10ab", "consequence_class": "CC2",
        "A_d": 0.0, "accidental_type": "none"})
    navne = [b.get("name") for b in r.json() if isinstance(b, dict)]
    assert not any(str(n).startswith("E_d,ALS") for n in navne)


def test_partial_factors_are_all_unity_in_an_accident(client):
    """
    Tabel A1.3 har hverken K_FI eller partialkoefficienter paa lasterne —
    alt regnes med 1,0. Konsekvensklassen maa derfor ikke flytte ALS.
    """
    def als(cc):
        r = client.post("/calc/load-combo", json={
            "label": "LC", "unit": "kN/m", "G_k": 5.0,
            "loads": [{"label": "Nytte", "Q_k": 4.0, "category": "A"}],
            "method": "6.10ab", "consequence_class": cc,
            "A_d": 10.0, "accidental_type": "fire"})
        for b in r.json():
            if (isinstance(b, dict) and b.get("type") == "calc_row"
                    and str(b.get("name", "")).startswith("E_d,ALS")):
                return float(b["result"].split()[0])
        raise AssertionError("ingen ALS-række")
    assert als("CC1") == pytest.approx(als("CC3"))
