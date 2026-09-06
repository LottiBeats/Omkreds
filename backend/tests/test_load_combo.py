"""
test_load_combo.py — DS/EN 1990 DK NA:2019, tabel A1.2(B+C)

Værdierne er læst direkte af tabellen (se tests/REFERENCES.md):

  Lastkombination      1 (6.10a)      2 (6.10b)
  ────────────────────────────────────────────────
  Tyngde, ugunstig     1,2·K_FI       1,0·K_FI
  Tyngde, gunstig      1,0            0,9
  Variabel, dominerende  0            1,5·K_FI
  Variabel, øvrige       0            1,5·ψ₀·K_FI

  K_FI:  CC1 = 0,9   CC2 = 1,0   CC3 = 1,1

Den gunstige række har intet K_FI — det står bart i tabellen, i modsætning
til den ugunstige. Det er ikke en forglemmelse i testen.
"""
import pytest


def combos(client, **kw):
    payload = {"label": "LC1", "unit": "kN/m", "G_k": 5.0,
               "loads": [{"label": "Nytte", "Q_k": 3.0, "category": "A"}],
               "method": "6.10ab", "consequence_class": "CC2"}
    payload.update(kw)
    r = client.post("/calc/load-combo", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def ed(blocks, prefix):
    """Værdien af den første ULS-række hvis navn starter med prefix."""
    for b in blocks:
        if (isinstance(b, dict) and b.get("type") == "calc_row"
                and str(b.get("name", "")).startswith(prefix)):
            return float(b["result"].split()[0])
    raise AssertionError(f"ingen række der starter med {prefix!r}")


# ── 6.10a: kun permanent last ────────────────────────────────────────────────

@pytest.mark.parametrize("cc,k_fi", [("CC1", 0.9), ("CC2", 1.0), ("CC3", 1.1)])
def test_610a_is_permanent_load_only(client, cc, k_fi):
    """
    1,2·K_FI·G_k, og ingen variabel last overhovedet — tabellen har 0 i
    begge variable rækker under kombination 1.
    """
    got = ed(combos(client, consequence_class=cc), "6.10a")
    assert got == pytest.approx(1.2 * k_fi * 5.0, abs=1e-6)


def test_610a_ignores_the_variable_loads_entirely(client):
    with_q = ed(combos(client, loads=[{"label": "Q", "Q_k": 99.0, "category": "A"}]), "6.10a")
    no_q   = ed(combos(client, loads=[]), "6.10a")
    assert with_q == pytest.approx(no_q)


# ── 6.10b: permanent + dominerende + ledsagende ─────────────────────────────

@pytest.mark.parametrize("cc,k_fi", [("CC1", 0.9), ("CC2", 1.0), ("CC3", 1.1)])
def test_610b_single_variable_load(client, cc, k_fi):
    """1,0·K_FI·G + 1,5·K_FI·Q₁."""
    got = ed(combos(client, consequence_class=cc), "6.10b")
    assert got == pytest.approx(1.0 * k_fi * 5.0 + 1.5 * k_fi * 3.0, abs=1e-6)


def test_610b_accompanying_load_gets_psi_zero(client):
    """
    Nyttelast (kat. A) dominerende, sne som ledsagende: ψ₀ = 0,3.
    1,0·5 + 1,5·3 + 1,5·0,3·2 = 10,40
    """
    blocks = combos(client, loads=[
        {"label": "Nytte", "Q_k": 3.0, "category": "A"},
        {"label": "Sne",   "Q_k": 2.0, "category": "S"},
    ])
    assert ed(blocks, "6.10b — Nytte") == pytest.approx(10.40, abs=1e-6)


def test_snow_drops_out_when_wind_leads(client):
    """
    DK NA's kontekstregel: ψ₀ for sne er 0 når vinden er dominerende.
    1,0·5 + 1,5·1,5 + 1,5·0,0·2 + 1,5·0,5·3 = 9,50
    """
    blocks = combos(client, loads=[
        {"label": "Vind",  "Q_k": 1.5, "category": "W"},
        {"label": "Sne",   "Q_k": 2.0, "category": "S"},
        {"label": "Nytte", "Q_k": 3.0, "category": "A"},
    ])
    assert ed(blocks, "6.10b — Vind") == pytest.approx(9.50, abs=1e-6)


def test_every_variable_load_gets_a_turn_at_leading(client):
    """Den dimensionsgivende kombination er ikke kendt på forhånd."""
    blocks = combos(client, loads=[
        {"label": "Nytte", "Q_k": 3.0, "category": "A"},
        {"label": "Sne",   "Q_k": 2.0, "category": "S"},
    ])
    names = [b["name"] for b in blocks
             if isinstance(b, dict) and b.get("type") == "calc_row"
             and str(b.get("name", "")).startswith("6.10b")]
    assert any("Nytte" in n for n in names) and any("Sne" in n for n in names)


# ── Gunstig egenlast ────────────────────────────────────────────────────────
# γ_G,inf: 1,0 i 6.10a og 0,9 i 6.10b, begge uden K_FI.
#
# Afkrydsningsfeltet fandtes i brugerfladen, værdien blev sendt til backend og
# givet videre til load_combos() — og aldrig læst. At markere "gunstig" gjorde
# ingenting, uden at sige det.

def test_favourable_permanent_load_610a(client):
    assert ed(combos(client, G_fav=True), "6.10a") == pytest.approx(1.0 * 5.0, abs=1e-6)


def test_favourable_permanent_load_610b(client):
    assert ed(combos(client, G_fav=True), "6.10b") == pytest.approx(
        0.9 * 5.0 + 1.5 * 3.0, abs=1e-6)


def test_favourable_ignores_k_fi(client):
    """Tabellens gunstige række står bart — 1,0 og 0,9, ikke ·K_FI."""
    cc1 = ed(combos(client, G_fav=True, consequence_class="CC1"), "6.10a")
    cc3 = ed(combos(client, G_fav=True, consequence_class="CC3"), "6.10a")
    assert cc1 == pytest.approx(cc3) == pytest.approx(5.0)


def test_favourable_is_never_worse_than_unfavourable(client):
    """En gunstig egenlast kan ikke give et større regningsmæssigt Ed."""
    for tag in ("6.10a", "6.10b"):
        assert ed(combos(client, G_fav=True), tag) <= ed(combos(client), tag) + 1e-9


# ── ψ₂ i den kvasi-permanente SLS-kombination ───────────────────────────────

def test_quasi_permanent_uses_psi_two(client):
    """G + Σψ₂·Q. Kat. A har ψ₂ = 0,2, sne har ψ₂ = 0,0."""
    blocks = combos(client, loads=[
        {"label": "Nytte", "Q_k": 3.0, "category": "A"},
        {"label": "Sne",   "Q_k": 2.0, "category": "S"},
    ])
    rows = [b for b in blocks if isinstance(b, dict) and b.get("type") == "calc_row"
            and str(b.get("name", "")).lower().startswith("kvasi")]
    assert rows, "ingen kvasi-permanent række fundet"
    assert float(rows[0]["result"].split()[0]) == pytest.approx(5.0 + 0.2 * 3.0, abs=1e-6)
