"""
test_formler.py — brøker og rødder tegnes i PDF og Word (formler.py)

Notationen er den samme som i editoren: " / " med mellemrum er en brøk,
"/" uden mellemrum (kN/m, b·h²/6) er ikke. Kan formlen ikke oversættes eller
tegnes, skal teksten stå — den må aldrig forsvinde.
"""
import pytest

from formler import til_mathtext, tegn


@pytest.mark.parametrize("formel, forventet", [
    ("A_s·f_yd / (0,8·b·f_cd)", r"\dfrac{A_{s}\cdot f_{yd}}{0{,}8\cdot b\cdot f_{cd}}"),
    # hel parentes med mellemrum er nævneren, ikke "(cot"
    ("b·z / (cot θ + tan θ)", r"\dfrac{b\cdot z}{cot\ θ+tan\ θ}"),
    # parentes med mellemrum i tælleren
    ("(1 − √(1 − 2μ))·b / f_yd", r"\dfrac{(1-\sqrt{1-2μ})\cdot b}{f_{yd}}"),
    # brøk i nævneren
    ("M_Ed / (1 − N_Ed / N_B)", r"\dfrac{M_{Ed}}{1-\dfrac{N_{Ed}}{N_{B}}}"),
    # brøk i parentes med eksponent
    ("(σ_d / f_d)² ≤ 1", r"\left(\dfrac{σ_{d}}{f_{d}}\right)^{2}\leq 1"),
    # M₀_Ed er ét indeks
    ("M₀_Ed / 2", r"\dfrac{M_{0{,}Ed}}{2}"),
])
def test_oversaettelse(formel, forventet):
    assert til_mathtext(formel) == forventet


@pytest.mark.parametrize("formel", ["kN/m", "b·h²/6", "0,26·f_ctm/f_yk", "", "den største af 6.10a og 6.10b"])
def test_uden_broek_er_tekst(formel):
    assert til_mathtext(formel) is None


def test_tegnes_som_png():
    r = tegn("A_s·f_yd / (0,8·b·f_cd)")
    assert r is not None
    path, w, h = r
    assert path.endswith(".png") and w > 10 and h > 10


def test_pdf_celle_falder_tilbage_til_tekst(monkeypatch):
    from reportlab.platypus import Paragraph, Image
    import calc_core
    styles = calc_core.make_styles()
    celle = calc_core._formel_celle("A_s·f_yd / (0,8·b·f_cd)", styles["hc_sym"], 200)
    assert isinstance(celle, Image)
    import formler
    monkeypatch.setattr(formler, "tegn", lambda *a, **k: None)
    celle = calc_core._formel_celle("A_s·f_yd / (0,8·b·f_cd)", styles["hc_sym"], 200)
    assert isinstance(celle, Paragraph)
