"""
conftest.py — shared fixtures and helpers for all calc module tests.

Running:
    cd backend
    pytest tests/ -v

Requirements:
    pip install pytest httpx
    (httpx is required by FastAPI TestClient)
"""
import pytest
from fastapi.testclient import TestClient

# ── App import ────────────────────────────────────────────────────────────────
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import app
from auth import get_current_user

# ── Auth bypass for tests ─────────────────────────────────────────────────────
# The API routes are protected by Clerk JWT verification.  Tests exercise the
# calculation logic, not the auth layer, so we override the dependency with a
# fixed fake user.  (auth.py itself is untouched.)
app.dependency_overrides[get_current_user] = lambda: {
    "id":    "test-user",
    "email": "test@example.com",
    "name":  "Test User",
}


@pytest.fixture(scope="session")
def client():
    """Single TestClient instance reused across all tests."""
    with TestClient(app) as c:
        yield c


# ── Block extraction helpers ──────────────────────────────────────────────────

def get_checks(blocks: list) -> dict:
    """Return {label: block} for all check-type blocks."""
    return {b["label"]: b for b in blocks if b.get("type") == "check"}


def find_check(blocks: list, fragment: str) -> dict | None:
    """Find the first check block whose label contains *fragment* (case-insensitive)."""
    frag = fragment.lower()
    for b in blocks:
        if b.get("type") == "check" and frag in b.get("label", "").lower():
            return b
    return None


def find_calc_row(blocks: list, name: str) -> dict | None:
    """Find the first calc_row block whose name equals *name*."""
    for b in blocks:
        if b.get("type") == "calc_row" and b.get("name") == name:
            return b
    return None


def eta(block: dict) -> float:
    """
    Extract the utilisation ratio from a check block's value string.
    Value strings are like '0.547 < 1.0' or '1.315 > 1.0'.
    """
    return float(block["value"].split()[0])


def passes(block: dict) -> bool:
    """True if the check block represents a passing check."""
    return block.get("passes") is not False


def assert_eta(block: dict, expected: float, tol: float = 0.015) -> None:
    """
    Assert the utilisation ratio is within *tol* (relative) of *expected*.
    Default tolerance 1.5 % — enough to absorb minor forallpeople rounding
    while still catching formula errors.
    """
    actual = eta(block)
    err = abs(actual - expected) / max(expected, 1e-9)
    assert err <= tol, (
        f"Utilisation ratio {actual:.4f} differs from expected {expected:.4f} "
        f"by {err*100:.1f}% (limit {tol*100:.0f}%)\n"
        f"Check: {block['label']}"
    )
