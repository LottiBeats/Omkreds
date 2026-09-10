"""
test_brand_eta_fi.py — brandmomentet maa ikke vaere ULS-momentet.

Fejlen der gav anledning til filen
----------------------------------
I et faerdigt A2-dokument stod:

    E_d,ULS        = 3,250 kN/m
    Ulykke — brand = 1,450 kN/m
    ...
    M_Ed           = 6,50 kNm
    M_Ed,fi        = 6,50 kNm      <- det samme

Brandeftervisningen brugte hele brudgraenselastens moment. timber.py kan godt
regne med et eta_fi, og siger endda i sin egen note at den ikke kunne udlede
det -- men frontenden sendte det aldrig, saa den faldt tilbage paa 1,0.

Praemissen i noten var forkert netop dér: lasten KOM fra en
lastkombinationsblok, og den eksporterer baade E_d_uls og E_d_brand.
1,450 / 3,250 = 0,446, saa brandmomentet skulle have vaeret ~2,90 kNm.

Paa den sikre side, ja. Men et moment, der er dobbelt saa stort som det skal
vaere, dimensionerer et tvaersnit der er dobbelt saa dyrt -- og en note, der
siger "kunne ikke udledes" om noget, der ligger to afsnit laengere oppe i det
samme dokument, er ikke en note, man kan stole paa.
"""
import pytest

import forallpeople as si
si.environment('structural', top_level=True)
from timber import timber_beam            # noqa: E402


def _brand(eta_fi):
    """Brandafsnittets M_Ed,fi for et givet eta_fi, med importeret moment."""
    return timber_beam(
        label='T1', span=4.0 * m, g_k=0, q_k=0,
        b=110 * mm, h=220 * mm, timber_grade='C24',
        service_class=1, load_duration='medium', gamma_M=1.3,
        beam_results={'M_Ed': 6.5 * kN * m, 'V_Ed': 6.5 * kN,
                      'source': 'Load combination LC1'},
        check_deflection=False,
        fire_design={'t_fire': 30.0, 'eta_fi': eta_fi},
    )


def _raekke(blocks, navn):
    for b in blocks:
        if b.get('type') == 'calc_row' and b.get('name') == navn:
            return float(b['result'].split()[0].replace(',', '.'))
    raise AssertionError('fandt ingen raekke %r' % navn)


def test_eta_fi_skalerer_brandmomentet():
    """
    Med eta_fi = 0,446 skal brandmomentet vaere 0,446 gange ULS-momentet.

    Det er hele pointen: brandkombinationen er lettere end brudgraensen, og
    tvaersnittet er allerede reduceret af indbraendingen. At regne begge dele
    paa én gang er at straffe konstruktionen to gange.
    """
    blocks = _brand(0.446)
    assert _raekke(blocks, 'M_Ed,fi') == pytest.approx(0.446 * 6.5, abs=0.02)
    assert _raekke(blocks, 'V_Ed,fi') == pytest.approx(0.446 * 6.5, abs=0.02)


def test_uden_eta_fi_regnes_der_med_hele_lasten():
    """
    Falder man tilbage paa den fulde last, skal det vaere fordi der ikke er et
    forhold at bruge -- ikke fordi det blev glemt. Noten i dokumentet siger
    det, og den skal blive ved med at passe.
    """
    blocks = _brand(None)
    assert _raekke(blocks, 'M_Ed,fi') == pytest.approx(6.5, abs=0.02)


def test_brandmomentet_er_mindre_end_uls_momentet():
    """
    Den korte version af hele filen: er de to ens, er noget galt.

    Et dokument, hvor M_Ed og M_Ed,fi staar med det samme tal, er det, Niels
    fangede -- og det er let at se, naar man kigger efter, og umuligt at se,
    naar man ikke goer.
    """
    blocks = _brand(0.446)
    assert _raekke(blocks, 'M_Ed,fi') < _raekke(blocks, 'M_Ed')


# ── Nedbøjning med importerede snitkræfter ──────────────────────────────────

def test_nedboejningen_eftervises_naar_opdelingen_foelger_med():
    """
    Samme fejlklasse som eta_fi, samme dokument.

    Der stod: "opdelingen i permanent og variabel last følger ikke med fra
    rammeberegningen, så w_fin og w_net,fin er ikke eftervist her" -- to
    afsnit under en tabel, der viste G_k = 1 kN/m og Q1 = 1,5 kN/m.

    Lasten kom fra en lastkombination, ikke fra en ramme. Bjaelken er stadig
    et simpelt understoettet fag -- det er saadan M_Ed = w*L^2/8 blev dannet --
    saa 5wL^4/384EI gaelder, og krybningen kan deles efter §2.2.3(5).
    """
    blocks = timber_beam(
        label='T1', span=4.0 * m, g_k=1.0 * kN / m, q_k=1.5 * kN / m,
        b=110 * mm, h=220 * mm, timber_grade='C24',
        service_class=1, load_duration='medium', gamma_M=1.3,
        beam_results={'M_Ed': 6.5 * kN * m, 'V_Ed': 6.5 * kN,
                      'source': 'Load combination LC1'},
        check_deflection=True, udl_deflection=True,
    )
    navne = {b.get('name') for b in blocks if b.get('type') == 'calc_row'}
    for n in ('w_inst', 'w_fin,G', 'w_fin,Q', 'w_fin', 'w_net,fin'):
        assert n in navne, 'nedboejningsraekken %r mangler' % n

    tekst = ' '.join(b.get('content', '') for b in blocks
                     if b.get('type') in ('note', 'text'))
    assert 'ikke eftervist her' not in tekst, \
        'noten om manglende opdeling staar stadig, selvom den blev eftervist'


def test_fra_en_ramme_eftervises_nedboejningen_stadig_ikke():
    """
    Uden flaget er formen ukendt, og 5wL^4/384EI gaelder ikke. Da skal noten
    staa -- og den skal sige hvad der skal til for at faa tallet.
    """
    blocks = timber_beam(
        label='T1', span=4.0 * m, g_k=1.0 * kN / m, q_k=1.5 * kN / m,
        b=110 * mm, h=220 * mm, timber_grade='C24',
        service_class=1, load_duration='medium', gamma_M=1.3,
        beam_results={'M_Ed': 6.5 * kN * m, 'V_Ed': 6.5 * kN,
                      'source': 'Rammeberegning'},
        check_deflection=True, udl_deflection=False,
    )
    navne = {b.get('name') for b in blocks if b.get('type') == 'calc_row'}
    assert 'w_fin' not in navne
    tekst = ' '.join(b.get('content', '') for b in blocks
                     if b.get('type') in ('note', 'text'))
    assert 'lastkombination' in tekst, \
        'noten skal sige, hvordan man faar nedboejningen eftervist'
