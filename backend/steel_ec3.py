"""Small EN 1993-1-1 helper functions shared by steel modules."""

import math


BUCKLING_ALPHA = {"a0": 0.13, "a": 0.21, "b": 0.34, "c": 0.49, "d": 0.76}


def buckling_curve_hot_rolled(h_mm: float, b_mm: float, tf_mm: float) -> tuple[str, str]:
    """EC3 Table 6.2 buckling curves for hot-rolled I/H sections."""
    hb = h_mm / max(b_mm, 1e-9)
    if tf_mm <= 40:
        return ("a", "b") if hb > 1.2 else ("b", "c")
    if tf_mm <= 100:
        return ("b", "c")
    return ("d", "d")


def chi_flexural(lam_bar: float, curve: str) -> float:
    """EC3 6.3.1.2 reduction factor for flexural buckling."""
    alpha = BUCKLING_ALPHA.get(curve.lower(), BUCKLING_ALPHA["b"])
    phi = 0.5 * (1.0 + alpha * (lam_bar - 0.2) + lam_bar**2)
    return min(1.0 / (phi + math.sqrt(max(phi**2 - lam_bar**2, 1e-14))), 1.0)


def ltb_curve_hot_rolled(h_mm: float, b_mm: float, modified: bool = True) -> str:
    """
    Kipningskurve for valsede I-profiler.

    Den modificerede metode (§6.3.2.3, beta = 0,75, lambda_LT,0 = 0,4) har sin
    egen tabel, 6.5: h/b <= 2 giver kurve b, h/b > 2 kurve c. Tabel 6.4 (a/b)
    hører til den generelle metode (§6.3.2.2). Modulerne regnede med den
    modificerede formel og tabel 6.4's kurver -- chi_LT blev op til ca. 10 %
    for høj ved lambda_LT omkring 1.
    """
    hb = h_mm / max(b_mm, 1e-9)
    if modified:
        return "b" if hb <= 2.0 else "c"
    return "a" if hb <= 2.0 else "b"


def chi_ltb(lam_lt: float, curve: str, modified: bool = True) -> float:
    """EC3 6.3.2.2 lateral-torsional buckling reduction factor."""
    alpha = BUCKLING_ALPHA.get(curve.lower(), BUCKLING_ALPHA["b"])
    if modified:
        lam_0 = 0.4
        beta = 0.75
        if lam_lt <= lam_0:
            return 1.0
        phi = 0.5 * (1.0 + alpha * (lam_lt - lam_0) + beta * lam_lt**2)
        chi = 1.0 / (phi + math.sqrt(max(phi**2 - beta * lam_lt**2, 1e-14)))
        return min(chi, 1.0 / lam_lt**2, 1.0)

    if lam_lt <= 0.2:
        return 1.0
    phi = 0.5 * (1.0 + alpha * (lam_lt - 0.2) + lam_lt**2)
    return min(1.0 / (phi + math.sqrt(max(phi**2 - lam_lt**2, 1e-14))), 1.0)
