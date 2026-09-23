"""
test_vind_ramme.py — vindzoner på en saddeltagsramme

c_pe er INPUT. Den projekterende aflæser tabel 7.1 og 7.4a og står inde for
tallene; modulet regner zonegrænser, fortegn og lasttilfælde. Derfor bruger
prøverne herunder nogle opdigtede, letgenkendelige c_pe-værdier: det, der
efterprøves, er regnestykket omkring dem, ikke en tabel i koden.

Prøverne af forslag_*() står for sig selv til sidst. De låser de foreslåede
værdier, så et forslag ikke kan skride ubemærket — men intet kalder dem af
sig selv, og et forslag er ikke et opslag.
"""
import pytest

import vind_ramme as vr


# ── Tabel 7.1, lodrette vægge ───────────────────────────────────────────────

@pytest.mark.parametrize('h_over_d,D,E', [
    (5.0,  +0.8, -0.7),
    (1.0,  +0.8, -0.5),
    (0.25, +0.7, -0.3),
])
def test_vaegzonerne_er_tabellens(h_over_d, D, E):
    c = vr.forslag_vaegge(h_m=h_over_d * 10.0, d_m=10.0)
    assert c['D'] == pytest.approx(D)
    assert c['E'] == pytest.approx(E)


def test_der_interpoleres_mellem_punkterne():
    """Noten til tabel 7.1: mellem værdierne interpoleres lineært."""
    c = vr.forslag_vaegge(h_m=2.5, d_m=10.0)    # h/d = 0,25 … 1 midtvejs? nej: 0,25
    assert c['E'] == pytest.approx(-0.3)

    midt = vr.forslag_vaegge(h_m=6.25, d_m=10.0)   # h/d = 0,625, midt mellem 0,25 og 1
    assert midt['E'] == pytest.approx((-0.3 + -0.5) / 2, abs=1e-6)


def test_uden_for_tabellen_bruges_yderpunktet():
    """h/d = 12 er ikke i tabellen; den må ikke ekstrapolere ud i det blå."""
    assert vr.forslag_vaegge(h_m=120.0, d_m=10.0)['E'] == pytest.approx(-0.7)


def test_dybde_nul_afvises():
    with pytest.raises(ValueError):
        vr.forslag_vaegge(h_m=5.0, d_m=0.0)


# ── Tabel 7.4a, saddeltag, θ = 0° ───────────────────────────────────────────

@pytest.mark.parametrize('alfa,F,G,H,J,I', [
    (5,  -1.7, -1.2, -0.6, -0.6, -0.6),
    (15, -0.9, -0.8, -0.3, -1.0, -0.4),
    (30, -0.5, -0.5, -0.2, -0.5, -0.4),
    (45,  0.0,  0.0,  0.0, -0.3, -0.2),
    (60, +0.7, +0.7, +0.7, -0.3, -0.2),
    (75, +0.8, +0.8, +0.8, -0.3, -0.2),
])
def test_tagzonerne_negative_er_tabellens(alfa, F, G, H, J, I):
    c = vr.forslag_saddeltag(alfa, 'neg')
    assert (c['F'], c['G'], c['H'], c['J'], c['I']) \
        == pytest.approx((F, G, H, J, I))


@pytest.mark.parametrize('alfa,F,G,H,J,I', [
    (5,   0.0,  0.0,  0.0, +0.2, 0.0),
    (15, +0.2, +0.2, +0.2,  0.0, 0.0),
    (30, +0.7, +0.7, +0.4,  0.0, 0.0),
    (45, +0.7, +0.7, +0.6,  0.0, 0.0),
])
def test_tagzonerne_positive_er_tabellens(alfa, F, G, H, J, I):
    c = vr.forslag_saddeltag(alfa, 'pos')
    assert (c['F'], c['G'], c['H'], c['J'], c['I']) \
        == pytest.approx((F, G, H, J, I))


def test_en_manglende_formfaktor_afvises():
    """Ikke nul. Nul er en gyldig formfaktor, og en flade, der stilfaerdigt
    fik nul, ville se ubelastet ud i en figur uden at nogen besluttede det."""
    uden_J = {k: v for k, v in CPE.items() if k != 'J'}
    argumenter = dict(RAMME, c_pe=uden_J)
    with pytest.raises(ValueError, match='J'):
        vr.vindlaster_paa_ramme(**argumenter, c_pi=0.2)


def test_begge_fortegn_findes_ved_de_flade_haeldninger():
    """Ved flade tage giver tabellen begge, og begge skal eftervises.

    Det er ikke et valg mellem to tal — det er to lasttilfælde.
    """
    neg = vr.forslag_saddeltag(15, 'neg')
    pos = vr.forslag_saddeltag(15, 'pos')
    assert neg['H'] < 0 < pos['H']


# ── Zonegeometrien ──────────────────────────────────────────────────────────

def test_e_er_den_mindste_af_b_og_2h():
    assert vr.zonebredde_e(h_m=6.0, b_m=30.0) == 12.0   # 2h
    assert vr.zonebredde_e(h_m=10.0, b_m=12.0) == 12.0  # b


def test_luvsiden_har_G_ved_tagfoden_og_H_derefter():
    zoner = vr.tagzoner_langs_spaer(h_m=6.0, b_m=30.0, spaerlaengde_m=8.0,
                                    side='luv')
    assert zoner == [('G', 0.0, 1.2), ('H', 1.2, 8.0)]   # e/10 = 1,2


def test_laesiden_har_J_ved_kippen():
    """J sidder ved kippen, ikke ved tagfoden. Sidder den forkert, sidder
    den største sugværdi på den forkerte ende af spæret."""
    zoner = vr.tagzoner_langs_spaer(h_m=6.0, b_m=30.0, spaerlaengde_m=8.0,
                                    side='lae')
    assert zoner == [('I', 0.0, 6.8), ('J', 6.8, 8.0)]


def test_et_kort_spaer_bliver_én_zone():
    """Er e/10 længere end spæret, er hele fladen kantzone."""
    assert vr.tagzoner_langs_spaer(h_m=20.0, b_m=40.0, spaerlaengde_m=2.0,
                                   side='luv') == [('G', 0.0, 2.0)]
    assert vr.tagzoner_langs_spaer(h_m=20.0, b_m=40.0, spaerlaengde_m=2.0,
                                   side='lae') == [('J', 0.0, 2.0)]


# ── Vindtrykket pr. zone ────────────────────────────────────────────────────
#
# Vinden regnes FØR modellen og står i dokumentet, uanset om der er en
# FEM-model. Resultatet er et tryk pr. flade — ikke laster på elementer.
# Hvor det skal sættes hen, afgøres i modellen.

# c_pe som den projekterende har aflæst dem. Tallene er valgt, så hver zone
# kan kendes igen i et resultat — det er regnestykket, der prøves her.
CPE = {'D': +0.80, 'E': -0.50, 'G': -1.20, 'H': -0.60,
       'I': -0.40, 'J': -1.00}


def test_der_er_en_raekke_pr_zone_og_cpi():
    t = vr.zonetryk(q_p_kNm2=0.75, c_pe=CPE)
    assert len(t) == 6 * 2          # seks zoner, to indvendige tryk
    assert {r['zone'] for r in t} == set('DEGHIJ')
    assert {r['c_pi'] for r in t} == {0.2, -0.3}


def test_trykket_er_cpe_minus_cpi_gange_qp():
    """Håndregnet: (0,80 − 0,20) · 0,75 = 0,45 kN/m²."""
    t = vr.zonetryk(q_p_kNm2=0.75, c_pe=CPE)
    D = next(r for r in t if r['zone'] == 'D' and r['c_pi'] == 0.2)
    assert D['w_kNm2'] == pytest.approx(0.45)


def test_luvvaeggen_faar_tryk_og_laevaeggen_sug():
    t = vr.zonetryk(q_p_kNm2=0.75, c_pe=CPE)
    D = next(r for r in t if r['zone'] == 'D' and r['c_pi'] == 0.2)
    E = next(r for r in t if r['zone'] == 'E' and r['c_pi'] == 0.2)
    assert D['w_kNm2'] > 0, 'luvvæggen skal have tryk'
    assert E['w_kNm2'] < 0, 'lævæggen skal have sug'


def test_indvendigt_undertryk_goer_suget_mindre():
    t = vr.zonetryk(q_p_kNm2=0.75, c_pe=CPE)
    over = next(r for r in t if r['zone'] == 'E' and r['c_pi'] == 0.2)
    under = next(r for r in t if r['zone'] == 'E' and r['c_pi'] == -0.3)
    assert under['w_kNm2'] > over['w_kNm2']


def test_rammeafstanden_giver_det_tal_der_paasaettes():
    """kN/m² er vindberegningen; kN/m er det, en ramme får."""
    uden = vr.zonetryk(q_p_kNm2=0.75, c_pe=CPE)
    med = vr.zonetryk(q_p_kNm2=0.75, c_pe=CPE, rammeafstand_m=4.0)
    assert 'w_kNm' not in uden[0]
    for u, m in zip(uden, med):
        assert m['w_kNm'] == pytest.approx(u['w_kNm2'] * 4.0)


def test_en_manglende_formfaktor_afvises():
    """Ikke nul. Nul er en gyldig formfaktor, og en flade, der stilfærdigt
    fik nul, ville se ubelastet ud uden at nogen besluttede det."""
    uden_J = {k: v for k, v in CPE.items() if k != 'J'}
    with pytest.raises(ValueError, match='J'):
        vr.zonetryk(q_p_kNm2=0.75, c_pe=uden_J)
