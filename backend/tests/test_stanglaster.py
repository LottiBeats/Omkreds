"""
test_stanglaster.py — fordelte laster paa et stykke af en stang.

De lukkede former er specifikationen. En fastindspaendingsberegning kan man
ikke se paa om er rigtig; man kan kun holde den op mod de vaerdier, der staar i
enhver staabi.

Tallene her er de klassiske:

    fuld konstant   M = wL²/12,  R = wL/2
    trekant 0→w     M_i = wL²/30, M_j = wL²/20, R_i = 3wL/20, R_j = 7wL/20

Bemaerk at R_i for trekantlasten er 3wL/20 og ikke wL/6. wL/6 er den SIMPELT
UNDERSTOETTEDE reaktion, og det var den, jeg foerst skrev i en proeve -- to tal
der ligger taet nok til at ligne hinanden, og som beskriver hver sin
konstruktion.
"""
import pytest

import stanglaster as sl
from fem_direkte import _fastindspaending

L = 6.0
W = 10.0


# ── Det gamle tilfaelde skal komme ud som foer ──────────────────────────────

@pytest.mark.parametrize('wy,wx', [(-10.0, 0.0), (0.0, 4.0), (-7.5, 2.5),
                                   (12.0, -3.0)])
def test_fuld_konstant_giver_praecis_det_gamle(wy, wx):
    """
    Den generelle vej skal give BIT for bit det samme som den gamle formel paa
    det tilfaelde, den gamle kunne.

    Det er den eneste maade at skifte den ud uden at flytte et eneste tal i et
    dokument, der allerede er skrevet.
    """
    segs_y, segs_x = sl.afsnit_fra_par(wy, wx, L)
    ny = sl.fastindspaending(segs_y, segs_x, L)
    gammel = _fastindspaending(wx, wy, L)
    for n, g in zip(ny, gammel):
        assert n == pytest.approx(g, abs=1e-9)


# ── Lukkede former ──────────────────────────────────────────────────────────

def test_fuld_konstant_mod_staabi():
    p = sl.fastindspaending([(-W, -W, 0.0, L)], [], L)
    assert p[1] == pytest.approx(W * L / 2)          # V_i = wL/2
    assert p[4] == pytest.approx(W * L / 2)          # V_j = wL/2
    assert p[2] == pytest.approx(W * L**2 / 12)      # M_i
    assert p[5] == pytest.approx(-W * L**2 / 12)     # M_j


def test_trekantlast_mod_staabi():
    """0 ved i-enden, w ved j-enden."""
    p = sl.fastindspaending([(0.0, -W, 0.0, L)], [], L)
    assert p[1] == pytest.approx(3 * W * L / 20)     # R_i = 3wL/20
    assert p[4] == pytest.approx(7 * W * L / 20)     # R_j = 7wL/20
    assert p[2] == pytest.approx(W * L**2 / 30)      # M_i = wL²/30
    assert p[5] == pytest.approx(-W * L**2 / 20)     # M_j = wL²/20
    # Summen af reaktionerne er hele lasten.
    assert p[1] + p[4] == pytest.approx(W * L / 2)


def test_trekantlast_den_anden_vej_er_spejlvendt():
    a = sl.fastindspaending([(0.0, -W, 0.0, L)], [], L)
    b = sl.fastindspaending([(-W, 0.0, 0.0, L)], [], L)
    assert b[1] == pytest.approx(a[4])
    assert b[4] == pytest.approx(a[1])
    assert b[2] == pytest.approx(-a[5])
    assert b[5] == pytest.approx(-a[2])


def test_en_dellast_paa_midten_er_symmetrisk():
    p = sl.fastindspaending([(-W, -W, L / 4, 3 * L / 4)], [], L)
    assert p[1] == pytest.approx(p[4])               # lige reaktioner
    assert p[2] == pytest.approx(-p[5])              # modsatte momenter
    assert p[1] + p[4] == pytest.approx(W * L / 2)   # hele lasten baaret


def test_last_uden_for_stangen_ignoreres():
    """
    Et afsnit, der raekker ud over stangen, klippes -- og intensiteterne i
    enderne foelger med klippet. Ellers ville en trekantlast, der er tastet
    for lang, faa forkert haeldning inde paa stangen.
    """
    hel = sl.fastindspaending([(-W, -W, 0.0, L)], [], L)
    for over in ([(-W, -W, -2.0, L + 2.0)], [(-W, -W, 0.0, L + 5.0)]):
        klippet = sl.fastindspaending(over, [], L)
        # En konstant last klippet til [0, L] er den fulde last.
        assert klippet[1] == pytest.approx(hel[1])
        assert klippet[2] == pytest.approx(hel[2])


def test_to_afsnit_lagt_sammen_er_det_samme_som_ét():
    """En last delt paa midten skal give det samme som den udelte."""
    hel = sl.fastindspaending([(-W, -W, 0.0, L)], [], L)
    delt = sl.fastindspaending([(-W, -W, 0.0, L / 2),
                                (-W, -W, L / 2, L)], [], L)
    for a, b in zip(hel, delt):
        assert a == pytest.approx(b, abs=1e-9)


def test_normalkraft_fordelt_langs_stangen():
    """wx over hele stangen deles ligeligt paa enderne."""
    wx = 5.0
    p = sl.fastindspaending([], [(wx, wx, 0.0, L)], L)
    assert p[0] == pytest.approx(-wx * L / 2)
    assert p[3] == pytest.approx(-wx * L / 2)


# ── Snitkraefter ────────────────────────────────────────────────────────────

def test_snitkraefter_paa_fuld_last_er_den_gamle_formel():
    """
    Med konstant last over hele stangen skal snitkraefterne vaere praecis
    section_forces_2d's udtryk.
    """
    from general_frame_fem import section_forces_2d
    wy = -W
    pl = [0.0, W * L / 2, 0.0, 0.0, W * L / 2, 0.0]   # simpelt understoettet
    segs_y, segs_x = sl.afsnit_fra_par(wy, 0.0, L)
    for x in (0.0, 1.0, L / 2, 4.2, L):
        ny = sl.snitkraefter(pl, x, segs_y, segs_x, L)
        gl = section_forces_2d(pl, x, wy, 0.0)
        for a, b in zip(ny, gl):
            assert a == pytest.approx(b, abs=1e-9)


def test_momentet_i_en_simpelt_understoettet_med_dellast():
    """
    Konstant w over midterste halvdel, simpelt understoettet.

    Reaktionen er wL/4 i hver ende (w gange den halve laengde, delt paa to).
    Momentet midt paa er R·L/2 − (w·L/4)·(L/8):

        M = wL/4 · L/2 − wL/4 · L/8 = wL²/8 − wL²/32 = 3wL²/32
    """
    R = W * (L / 2) / 2                     # wL/4
    pl = [0.0, R, 0.0, 0.0, R, 0.0]
    segs_y = [(-W, -W, L / 4, 3 * L / 4)]
    N, V, M = sl.snitkraefter(pl, L / 2, segs_y, [], L)
    assert M == pytest.approx(3 * W * L**2 / 32)
    assert V == pytest.approx(0.0, abs=1e-9)    # midt: forskydningen skifter


def test_ekstremerne_rammer_enden_af_en_dellast():
    """
    Toppunktet kan ligge praecis dér, hvor en dellast slutter -- og det goer
    det ofte. Et jaevnt gitter alene kunne springe over det, saa
    afsnitsenderne proeves altid.
    """
    R = W * (L / 2) / 2
    pl = [0.0, R, 0.0, 0.0, R, 0.0]
    segs_y = [(-W, -W, 0.0, L / 2)]          # last paa foerste halvdel
    e = sl.ekstremer(pl, L, segs_y, [])
    # Forskydningen springer ved x = L/2; den stoerste er ved x = 0.
    assert abs(e['V_kN']) == pytest.approx(R)
    assert e['M_kNm'] != 0.0


# ── To afsnit paa den samme stang ───────────────────────────────────────────
#
# Her laa en rigtig fejl. Toppunkterne blev soegt inden for hvert afsnit for
# sig, med afsnittets EGEN intensitet som haeldning paa V. Det er rigtigt med ét
# afsnit og forkert, saa snart to daekker det samme stykke.
#
# Og to afsnit er ikke en saerlig situation: enhver lastkombination laver ét
# afsnit pr. virkning, saa egenlast og sne paa den samme bjaelke er to.

def _simpelt_understoettet(w, laengde):
    """Fastindspaendingsfri endekraefter for en simpelt understoettet bjaelke.

    pl er [N_i, V_i, M_i, ...] som ekstremer() laeser dem: V_i = -wL/2 og
    M_i = 0 giver M(x) = w·x·(L-x)/2 -- staabiens parabel.
    """
    return [0.0, -w * laengde / 2.0, 0.0, 0.0, w * laengde / 2.0, 0.0]


def test_to_fulde_afsnit_giver_toppunktet_paa_midten():
    """Den samlede last er 3,6 -- toppunktet ligger i midten, ikke ved 2,4 m.

    Tallene er det lette tag med vindsug: 0,9 ned og 4,5 op. Den gamle kode
    loeste V = 0 med 4,5 alene og fandt 2,4 m, og momentet blev 15,552 i
    stedet for 16,2. Fire procent for lidt, i den retning der ikke maa tage
    fejl.
    """
    segs = [(-0.9, -0.9, 0.0, L), (4.5, 4.5, 0.0, L)]
    w_net = 3.6
    pl = _simpelt_understoettet(w_net, L)

    e = sl.ekstremer(pl, L, segs, [])
    assert e['x_M_m'] == pytest.approx(L / 2, abs=1e-9)
    assert abs(e['M_kNm']) == pytest.approx(w_net * L ** 2 / 8, rel=1e-9)


def test_to_afsnit_giver_det_samme_som_deres_sum():
    """Uanset hvordan lasten er delt op, er det den samme bjaelke."""
    delt   = [(2.0, 2.0, 0.0, L), (3.0, 3.0, 0.0, L)]
    samlet = [(5.0, 5.0, 0.0, L)]
    pl = _simpelt_understoettet(5.0, L)

    a = sl.ekstremer(pl, L, delt, [])
    b = sl.ekstremer(pl, L, samlet, [])
    for felt in ('M_kNm', 'V_kN', 'x_M_m'):
        assert a[felt] == pytest.approx(b[felt], abs=1e-9), felt


def test_to_afsnit_der_kun_overlapper_delvis():
    """Det ene daekker hele stangen, det andet kun den halve.

    Toppunktet ligger hverken paa midten eller i afsnitsskiftet, og det er
    netop derfor det skal regnes og ikke gaettes.
    """
    segs = [(2.0, 2.0, 0.0, L), (6.0, 6.0, 0.0, L / 2)]
    # Reaktionen findes af ligevaegt: R_i = (2·6·3 + 6·3·4,5)/6
    R_i = (2.0 * L * (L / 2) + 6.0 * (L / 2) * (L * 0.75)) / L
    pl = [0.0, -R_i, 0.0, 0.0, 0.0, 0.0]

    e = sl.ekstremer(pl, L, segs, [])
    x = e['x_M_m']

    # Toppunktet er der, hvor V = 0. Det efterproeves uafhaengigt af ekstremer:
    # forskydningen skal skifte fortegn omkring x.
    V_foer = sl.snitkraefter(pl, x - 1e-4, segs, [], L)[1]
    V_efter = sl.snitkraefter(pl, x + 1e-4, segs, [], L)[1]
    assert V_foer * V_efter < 0, (V_foer, V_efter)

    # Og momentet dér er stoerre end paa hver side.
    M = abs(sl.snitkraefter(pl, x, segs, [], L)[2])
    for d in (0.05, 0.2, 0.5):
        assert M >= abs(sl.snitkraefter(pl, x - d, segs, [], L)[2]) - 1e-9
        assert M >= abs(sl.snitkraefter(pl, x + d, segs, [], L)[2]) - 1e-9


def test_tre_afsnit_med_en_trapez_imellem():
    """Blandingen: konstant plus trekant plus dellast, alle paa samme stang."""
    segs = [(1.0, 1.0, 0.0, L), (0.0, 4.0, 0.0, L), (3.0, 3.0, 2.0, 4.0)]
    samlet = 1.0 * L + 0.5 * 4.0 * L + 3.0 * 2.0
    R_i = samlet / 2.0   # ikke symmetrisk, men bruges kun som en prøvelast
    pl = [0.0, -R_i, 0.0, 0.0, 0.0, 0.0]

    e = sl.ekstremer(pl, L, segs, [])

    # Et fint gitter kan ikke slaa det eksakte svar, men det kan afsloere et
    # toppunkt, der er fundet det forkerte sted.
    bedst = max((abs(sl.snitkraefter(pl, i * L / 20000, segs, [], L)[2])
                 for i in range(20001)))
    assert abs(e['M_kNm']) >= bedst - 1e-6
