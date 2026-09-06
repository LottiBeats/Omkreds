"""
test_custom_calc.py — the "Egen beregning" block (/calc/custom-calc)

The block is the escape hatch: whatever Omkreds has no module for, the engineer
writes out by hand. That makes silent arithmetic errors in it worse than
anywhere else in the app, because nothing else is checking the number.

The defect these tests exist for: `_UNIT_NS` was built by keeping the names in
builtins that were *not* standard builtins, on the assumption that only
forallpeople's units would survive. si.environment() injects those units into
builtins, so after it has run they are standard builtins too, and the namespace
came out with no units in it at all. `_parse_qty` and `_fmt_qty` both swallow
the NameError, so every quantity silently degraded to a bare float: the rows
still printed the unit the engineer typed, and a bending stress came out 10^6
too small and passed.
"""
import pytest

from conftest import find_calc_row, find_check, eta


def run(client, items, title="Egen beregning"):
    r = client.post("/calc/custom-calc", json={"title": title, "items": items})
    assert r.status_code == 200, r.text
    return r.json()


# ── The namespace itself ──────────────────────────────────────────────────────

def test_unit_namespace_contains_units():
    import main
    for u in ("kN", "N", "m", "mm", "MPa", "GPa", "kPa", "Pa"):
        assert u in main._UNIT_NS, f"unit {u!r} missing from the eval namespace"


def test_unit_namespace_excludes_dangerous_builtins():
    """The namespace is an eval() namespace before it is anything else."""
    import main
    for name in ("exec", "eval", "open", "__import__", "compile", "input",
                 "globals", "locals", "getattr", "setattr", "vars", "dir",
                 "list", "range", "dict", "str", "bytes", "type", "help"):
        assert name not in main._UNIT_NS, f"{name!r} must not be reachable"
    assert main._UNIT_NS["__builtins__"] == {}


# ── Units survive the round trip ──────────────────────────────────────────────

def test_variable_keeps_its_unit(client):
    blocks = run(client, [
        {"type": "var", "name": "g_k", "value": 1.2, "unit": "kN/m"},
        {"type": "formula", "expr": "w = 2*g_k", "unit": "kN/m"},
    ])
    assert "kN/m" in find_calc_row(blocks, "w")["result"]


def test_bending_stress_chain_is_dimensionally_right(client):
    """
    M_Ed / W_y, the most ordinary thing an engineer writes in this block.

    4.68 kN*m / (45*195**2/6 mm**3) = 16.41 MPa. Unitless, it evaluated to
    1.6e-5 and the check passed at eta = 1e-6 on a member that is overstressed.
    """
    blocks = run(client, [
        {"type": "var", "name": "g_k", "value": 1.2, "unit": "kN/m"},
        {"type": "var", "name": "q_k", "value": 0.6, "unit": "kN/m"},
        {"type": "var", "name": "L",   "value": 4.0, "unit": "m"},
        {"type": "var", "name": "b",   "value": 45,  "unit": "mm"},
        {"type": "var", "name": "h",   "value": 195, "unit": "mm"},
        {"type": "formula", "expr": "w_Ed = 1.2*g_k + 1.5*q_k", "unit": "kN/m"},
        {"type": "formula", "expr": "M_Ed = w_Ed*L**2/8",       "unit": "kN*m"},
        {"type": "formula", "expr": "W_y = b*h**2/6",           "unit": "mm**3"},
        {"type": "formula", "expr": "sigma = M_Ed/W_y",         "unit": "MPa"},
        {"type": "check", "label": "Bøjning", "demand": "sigma",
         "capacity": 15.4, "unit": "MPa"},
    ])

    sigma = find_calc_row(blocks, "sigma")["result"]
    assert "MPa" in sigma
    assert 16.3 < float(sigma.split()[0]) < 16.5, sigma

    chk = find_check(blocks, "Bøjning")
    assert chk["passes"] is False, "16.4 MPa against 15.4 MPa must fail"
    assert 1.05 < eta(chk) < 1.08


def test_mixed_length_units_convert(client):
    """A span in metres divided by a depth in millimetres is 20.5, not 0.0205."""
    blocks = run(client, [
        {"type": "var", "name": "L", "value": 4.1, "unit": "m"},
        {"type": "var", "name": "h", "value": 200, "unit": "mm"},
        {"type": "formula", "expr": "ratio = L/h", "unit": "-"},
    ])
    assert abs(float(find_calc_row(blocks, "ratio")["result"].split()[0]) - 20.5) < 0.05


def test_result_unit_conversion(client):
    """A force in newtons asked for in kN is 5, not 5000."""
    blocks = run(client, [
        {"type": "var", "name": "F", "value": 5000, "unit": "N"},
        {"type": "formula", "expr": "F_Ed = F", "unit": "kN"},
    ])
    row = find_calc_row(blocks, "F_Ed")["result"]
    assert abs(float(row.split()[0]) - 5.0) < 1e-6, row
    assert "kN" in row


def test_incompatible_units_do_not_pass_silently(client):
    """A length compared against a force is an error, not an OK."""
    blocks = run(client, [
        {"type": "var", "name": "L", "value": 4.0, "unit": "m"},
        {"type": "check", "label": "Nonsens", "demand": "L",
         "capacity": 10.0, "unit": "kN"},
    ])
    chk = find_check(blocks, "Nonsens")
    notes = [b for b in blocks if b.get("type") == "note"]
    assert chk is None or chk["passes"] is False or notes, \
        "comparing metres with kilonewtons must not report OK"
