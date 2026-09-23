"""
test_vind_ramme.py — vindzoner på en saddeltagsramme

Prøverne her har to formål, og det andet er det vigtigste.

Det første er det sædvanlige: at regnestykket gør, hvad det skal.

Det andet er at LÅSE tabelværdierne. c_pe-tallene i vind_ramme.py er skrevet
efter EN 1991-1-4 tabel 7.1 og 7.4a og skal efterprøves mod standarden. Når
de står her én gang til, er en rettelse én linje hvert sted og en fejlende
prøve — ikke en jagt gennem koden efter, hvor et tal ellers måtte gemme sig.

Så: finder du en forkert værdi, retter du den BEGGE steder. Fejler kun den
ene, er det prøven, der har ret.
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
    c = vr.cpe_vaegge(h_m=h_over_d * 10.0, d_m=10.0)
    assert c['D'] == pytest.approx(D)
    assert c['E'] == pytest.approx(E)


def test_der_interpoleres_mellem_punkterne():
    """Noten til tabel 7.1: mellem værdierne interpoleres lineært."""
    c = vr.cpe_vaegge(h_m=2.5, d_m=10.0)    # h/d = 0,25 … 1 midtvejs? nej: 0,25
    assert c['E'] == pytest.approx(-0.3)

    midt = vr.cpe_vaegge(h_m=6.25, d_m=10.0)   # h/d = 0,625, midt mellem 0,25 og 1
    assert midt['E'] == pytest.approx((-0.3 + -0.5) / 2, abs=1e-6)


def test_uden_for_tabellen_bruges_yderpunktet():
    """h/d = 12 er ikke i tabellen; den må ikke ekstrapolere ud i det blå."""
    assert vr.cpe_vaegge(h_m=120.0, d_m=10.0)['E'] == pytest.approx(-0.7)


def test_dybde_nul_afvises():
    with pytest.raises(ValueError):
        vr.cpe_vaegge(h_m=5.0, d_m=0.0)


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
    c = vr.cpe_saddeltag(alfa, 'neg')
    assert (c['F'], c['G'], c['H'], c['J'], c['I']) \
        == pytest.approx((F, G, H, J, I))


@pytest.mark.parametrize('alfa,F,G,H,J,I', [
    (5,   0.0,  0.0,  0.0, +0.2, 0.0),
    (15, +0.2, +0.2, +0.2,  0.0, 0.0),
    (30, +0.7, +0.7, +0.4,  0.0, 0.0),
    (45, +0.7, +0.7, +0.6,  0.0, 0.0),
])
def test_tagzonerne_positive_er_tabellens(alfa, F, G, H, J, I):
    c = vr.cpe_saddeltag(alfa, 'pos')
    assert (c['F'], c['G'], c['H'], c['J'], c['I']) \
        == pytest.approx((F, G, H, J, I))


def test_begge_fortegn_findes_ved_de_flade_haeldninger():
    """Ved flade tage giver tabellen begge, og begge skal eftervises.

    Det er ikke et valg mellem to tal — det er to lasttilfælde.
    """
    neg = vr.cpe_saddeltag(15, 'neg')
    pos = vr.cpe_saddeltag(15, 'pos')
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


# ── Lasterne på rammen ──────────────────────────────────────────────────────

RAMME = dict(
    q_p_kNm2=0.75, h_m=6.0, b_m=30.0, d_m=12.0, alpha_deg=30.0,
    spaer_luv_m=3.5, spaer_lae_m=3.5, rammeafstand_m=4.0,
    elementer={'vaeg_luv': 1, 'spaer_luv': 2, 'spaer_lae': 3, 'vaeg_lae': 4},
)


def test_luvvaeggen_faar_tryk_og_laevaeggen_sug():
    laster = vr.vindlaster_paa_ramme(**RAMME, c_pi=0.2)
    luv = next(l for l in laster if l['elem_id'] == 1)
    lae = next(l for l in laster if l['elem_id'] == 4)
    assert luv['value_kNm'] > 0, 'luvvæggen skal have tryk'
    assert lae['value_kNm'] < 0, 'lævæggen skal have sug'


def test_vaerdien_er_cpe_minus_cpi_gange_qp_gange_rammeafstand():
    """Håndregnet: h/d = 0,5 → D interpoleret mellem 0,7 og 0,8."""
    laster = vr.vindlaster_paa_ramme(**RAMME, c_pi=0.2)
    D = vr.cpe_vaegge(6.0, 12.0)['D']
    forventet = (D - 0.2) * 0.75 * 4.0
    luv = next(l for l in laster if l['elem_id'] == 1)
    assert luv['value_kNm'] == pytest.approx(forventet, abs=1e-4)


def test_spaeret_faar_to_dellaster():
    """G nær tagfoden, H på resten — det er dellaster på den samme stang."""
    laster = [l for l in vr.vindlaster_paa_ramme(**RAMME, c_pi=0.2)
              if l['elem_id'] == 2]
    assert [l['zone'] for l in laster] == ['G', 'H']
    # e = min(b, 2h) = min(30, 12) = 12, saa e/10 = 1,2 m.
    # Bemaerk at det er 2h der binder her, ikke b -- den fejl lavede proeven
    # foerst, og den ville have flyttet zonegraensen 1,8 m op ad spaeret.
    assert laster[0]['x1'] == 0.0
    assert laster[0]['x2'] == pytest.approx(1.2)
    assert laster[1]['x1'] == pytest.approx(1.2)
    assert laster[1]['x2'] == pytest.approx(3.5)


def test_vinden_virker_vinkelret_paa_fladen():
    for l in vr.vindlaster_paa_ramme(**RAMME, c_pi=0.2):
        assert l['direction'] == 'perpendicular'


def test_indvendigt_undertryk_goer_suget_mindre():
    """c_pi = −0,3 trykker udad indefra og modvirker ikke suget — det
    forstærker trykket og mindsker suget på ydersiden."""
    med_overtryk = vr.vindlaster_paa_ramme(**RAMME, c_pi=+0.2)
    med_undertryk = vr.vindlaster_paa_ramme(**RAMME, c_pi=-0.3)
    sug_over = next(l for l in med_overtryk if l['elem_id'] == 4)['value_kNm']
    sug_under = next(l for l in med_undertryk if l['elem_id'] == 4)['value_kNm']
    assert sug_under > sug_over, 'undertryk skal gøre lævæggens sug mindre'


# ── De fire lasttilfælde ────────────────────────────────────────────────────

def test_der_dannes_fire_lasttilfaelde():
    t = vr.lasttilfaelde_vind(**RAMME)
    assert len(t) == 4
    assert [x['nr'] for x in t] == [1, 2, 3, 4]
    for x in t:
        assert x['kategori'] == 'wind'
        assert x['gruppe'] == 'vind', \
            'de fire skal udelukke hinanden — ellers lægges to vindretninger sammen'


def test_navnene_siger_retning_og_indvendigt_tryk():
    navne = [t['navn'] for t in vr.lasttilfaelde_vind(**RAMME)]
    assert navne == [
        'Vind fra venstre, c_pi = +0,2',
        'Vind fra venstre, c_pi = -0,3',
        'Vind fra hoejre, c_pi = +0,2',
        'Vind fra hoejre, c_pi = -0,3',
    ]


def test_vind_fra_hoejre_er_spejlvendt():
    """Luv og læ bytter plads. Gør de ikke det, blæser det fra samme side
    fire gange, og rammen er aldrig eftervist den anden vej."""
    t = vr.lasttilfaelde_vind(**RAMME)
    venstre = {l['elem_id']: l['value_kNm'] for l in t[0]['laster']
               if 'x1' not in l}
    hoejre = {l['elem_id']: l['value_kNm'] for l in t[2]['laster']
              if 'x1' not in l}
    assert venstre[1] == pytest.approx(hoejre[4])
    assert venstre[4] == pytest.approx(hoejre[1])


def test_hver_last_peger_paa_sit_eget_tilfaelde():
    for t in vr.lasttilfaelde_vind(**RAMME):
        for l in t['laster']:
            assert l['lc'] == t['nr']


def test_tilfaeldene_kan_kombineres_af_motoren():
    """Ende til ende: de fire går ind i den almindelige kombinationsmotor."""
    from frame_load_cases import kombinationer_af_tilfaelde
    vind = vr.lasttilfaelde_vind(**RAMME, foerste_nr=2)
    tilfaelde = [{'nr': 1, 'navn': 'Egenlast', 'kategori': 'permanent'}] + [
        {k: t[k] for k in ('nr', 'navn', 'kategori', 'gruppe')} for t in vind]
    laster = [{'type': 'udl', 'elem_id': 2, 'value_kNm': 1.0, 'lc': 1}]
    for t in vind:
        laster += t['laster']

    combos = kombinationer_af_tilfaelde(tilfaelde, laster)
    assert combos
    # Ingen kombination må have to vindtilfælde.
    for c in combos:
        vindnavne = [a for a in c['aktive'] if a.startswith('Vind')]
        assert len(vindnavne) <= 1, c['name']
