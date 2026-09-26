"""
vind_ramme.py — vindzoner på en saddeltagsramme, EN 1991-1-4

Hvad
----
Du aflæser c_pe i tabel 7.1 og 7.4a. Modulet gør resten: hvor zonegrænserne
falder på hver enkelt stang, hvad de fire lasttilfælde hedder, og hvilken
linjelast hver flade får.

Hvorfor formfaktorerne er INPUT og ikke en tabel i koden
--------------------------------------------------------
Første udgave havde tabel 7.4a skrevet ind i modulet. Det var forkert tænkt,
og Niels sagde det: du har standarden liggende, og at aflæse fem tal tager et
halvt minut. En indkodet tabel flytter ikke arbejdet væk — den flytter
ansvaret hen et sted, hvor en fejl er sværest at få øje på, og hvor den
projekterende ikke kan se, hvad der blev brugt.

Nu står de tal, du har aflæst, i rapporten som dine. Det er også den eneste
form, en kontrollant kan bruge til noget: c_pe = −0,5 med en henvisning til
tabel 7.4a kan efterregnes, "programmet slog det op" kan ikke.

forslag_cpe() findes stadig som et udgangspunkt, men INTET kalder den af sig
selv. Den er et forslag, der skal efterses — ikke et opslag, der skal stoles
på.

Hvordan
-------
Vinden vinkelret på kippen (θ = 0°) er den, der belaster rammen. En indvendig
ramme ser:

    væg, luv         zone D
    tagflade, luv    zone G i e/10 fra tagfoden, derefter H
    tagflade, læ     zone J i e/10 fra kippen, derefter I
    væg, læ          zone E

    e = min(b, 2h)

Zone F og A/B/C hører til gavlene og til vægge parallelt med vinden; en
indvendig ramme bærer dem ikke.

Det indvendige tryk lægges til alle flader: w = (c_pe − c_pi)·q_p·s, hvor s er
rammeafstanden. Med c_pi = +0,2 og −0,3 (EN 1991-1-4 §7.2.9(6), når
åbningsforholdet ikke er kendt) og vind fra hver side giver det fire
lasttilfælde.
"""
from __future__ import annotations

# ── Et FORSLAG, ikke et opslag ─────────────────────────────────────────────
#
# Tallene herunder er skrevet efter EN 1991-1-4 tabel 7.1 og 7.4a. De bruges
# IKKE af sig selv: vindlaster_paa_ramme() kræver, at c_pe gives med, og den
# eneste vej hertil er forslag_cpe(), som kalderen selv skal bede om.
#
# Det er med vilje. Et forslag, man selv har hentet og set på, er noget andet
# end en vaerdi, der kom ind bagvejen -- og det er den projekterende, der
# aflaeser tabellen og staar inde for tallet.
#
# Kun D (luv) og E (læ) paa vaeggene: A, B og C sidder paa de vaegge, der er
# parallelle med vinden, og dem baerer en indvendig ramme ikke. Noeglen er
# h/d, og mellem punkterne interpoleres lineaert.
_FORSLAG_VAEG = {
    # h/d:   (D,    E)
    5.00:    (+0.8, -0.7),
    1.00:    (+0.8, -0.5),
    0.25:    (+0.7, -0.3),
}

# ── EN 1991-1-4 tabel 7.4a — saddeltag, vind paa langs (θ = 0°), c_pe,10 ────
#
# For hver taghaeldning: (F, G, H, J, I).
#
# Ved de flade haeldninger giver tabellen BÅDE en negativ og en positiv
# vaerdi, og begge skal eftervises -- "begge fortegn" er ikke et valg, det er
# to lasttilfaelde. De staar her som to saet.
_FORSLAG_TAG_NEG = {
    #  alfa:  (F,    G,    H,    J,    I)
    5:       (-1.7, -1.2, -0.6, -0.6, -0.6),
    15:      (-0.9, -0.8, -0.3, -1.0, -0.4),
    30:      (-0.5, -0.5, -0.2, -0.5, -0.4),
    45:      (0.0,  0.0,  0.0,  -0.3, -0.2),
    60:      (+0.7, +0.7, +0.7, -0.3, -0.2),
    75:      (+0.8, +0.8, +0.8, -0.3, -0.2),
}
_FORSLAG_TAG_POS = {
    #  alfa:  (F,    G,    H,    J,    I)
    5:       (0.0,  0.0,  0.0,  +0.2, 0.0),
    15:      (+0.2, +0.2, +0.2, 0.0,  0.0),
    30:      (+0.7, +0.7, +0.4, 0.0,  0.0),
    45:      (+0.7, +0.7, +0.6, 0.0,  0.0),
    60:      (+0.7, +0.7, +0.7, 0.0,  0.0),
    75:      (+0.8, +0.8, +0.8, 0.0,  0.0),
}

_ZONER = ('F', 'G', 'H', 'J', 'I')

# EN 1991-1-4 §7.2.9(6): uden kendt aabningsforhold skal BEGGE regnes.
CPI_SAET = (+0.2, -0.3)


def _interpoler(tabel: dict, x: float) -> tuple:
    """Lineaer interpolation mellem tabellens naermeste to punkter."""
    noegler = sorted(tabel)
    if x <= noegler[0]:
        return tabel[noegler[0]]
    if x >= noegler[-1]:
        return tabel[noegler[-1]]
    for lav, hoej in zip(noegler, noegler[1:]):
        if lav <= x <= hoej:
            t = (x - lav) / (hoej - lav)
            return tuple(a + (b - a) * t
                         for a, b in zip(tabel[lav], tabel[hoej]))
    return tabel[noegler[-1]]


def forslag_vaegge(h_m: float, d_m: float) -> dict:
    """FORSLAG til c_pe for luv- og laevaeg (zone D og E) efter h/d.

    Efterprøv mod EN 1991-1-4 tabel 7.1, foer det bruges.
    """
    if d_m <= 0:
        raise ValueError('bygningsdybden d skal vaere positiv')
    D, E = _interpoler(_FORSLAG_VAEG, h_m / d_m)
    return {'D': round(D, 3), 'E': round(E, 3)}


def forslag_saddeltag(alpha_deg: float, fortegn: str = 'neg') -> dict:
    """FORSLAG til c_pe for tagzonerne F, G, H, J, I ved taghaeldningen alfa.

    Efterprøv mod EN 1991-1-4 tabel 7.4a, foer det bruges.

    fortegn: 'neg' eller 'pos'. Ved de flade haeldninger giver tabellen begge,
    og begge skal eftervises -- derfor to opslag og ikke ét med et valg
    indbygget.
    """
    tabel = _FORSLAG_TAG_POS if fortegn == 'pos' else _FORSLAG_TAG_NEG
    vaerdier = _interpoler(tabel, abs(float(alpha_deg)))
    return {z: round(v, 3) for z, v in zip(_ZONER, vaerdier)}


def zonebredde_e(h_m: float, b_m: float) -> float:
    """e = min(b, 2h) -- EN 1991-1-4 figur 7.8."""
    return min(float(b_m), 2.0 * float(h_m))


def tagzoner_langs_spaer(h_m: float, b_m: float, spaerlaengde_m: float,
                         side: str) -> list:
    """
    Zonerne langs ÉT spaer, som (zone, x1, x2) i meter fra tagfoden.

    Luvsiden: G i e/10 fra tagfoden, derefter H.
    Laesiden:  I fra tagfoden, og J i e/10 foer kippen.

    e/10 er et maal i planen. Paa et spaer med haeldning er stykket langs
    spaeret laengere, men zonen er den samme flade -- derfor omregnes der
    ikke her: kalderen giver spaerlaengden, og e/10 sammenlignes med den.
    Ved flade tage er forskellen under en procent; ved 45 grader er den 41,
    og dér er det vaerd at vide, at maalet er vandret.
    """
    e = zonebredde_e(h_m, b_m)
    kant = min(e / 10.0, spaerlaengde_m)
    L = float(spaerlaengde_m)
    if side == 'luv':
        if kant >= L:
            return [('G', 0.0, L)]
        return [('G', 0.0, kant), ('H', kant, L)]
    # Laesiden regnes ogsaa fra tagfoden, saa x altid vokser fra tagfod mod
    # kip -- det er den vej, elementet er tegnet, og en zone, der regnes den
    # anden vej, ville sidde spejlvendt paa stangen.
    if kant >= L:
        return [('J', 0.0, L)]
    return [('I', 0.0, L - kant), ('J', L - kant, L)]


_KRAEVEDE_ZONER = ('D', 'E', 'G', 'H', 'I', 'J')


def zonetryk(q_p_kNm2: float, c_pe: dict, cpi_saet=CPI_SAET,
             rammeafstand_m: float | None = None) -> list:
    """
    Vindtrykket pr. zone. Resultatet af vindberegningen -- ikke laster.

    Vinden regnes foer modellen og staar i dokumentet, uanset om der er en
    FEM-model. Det her er hvad den beregning giver: et tryk pr. flade.

        w = (c_pe - c_pi) * q_p          [kN/m2]

    Hvor det saa skal saettes hen -- hvilket element, fra hvor til hvor --
    hoerer til modellen og afgoeres dér. Zonegeometrien ligger i
    tagzoner_langs_spaer(); den fortaeller hvor graensen falder, naar man
    paasaetter.

    rammeafstand_m er valgfri. Er den givet, kommer w_kNm med: trykket ganget
    med lastbredden, altsaa det tal, der faktisk paasaettes en ramme. Det
    hoerer med i lastgrundlaget, for det er dér, en kontrollant leder efter
    det.

    Returnerer én raekke pr. (zone, c_pi):
        {zone, c_pe, c_pi, w_kNm2 [, w_kNm]}
    """
    mangler = [z for z in _KRAEVEDE_ZONER if z not in (c_pe or {})]
    if mangler:
        # Ikke nul for en manglende zone. Nul er en gyldig formfaktor, og en
        # flade, der stilfaerdigt fik nul, ville se ubelastet ud uden at nogen
        # havde besluttet det.
        raise ValueError(
            'c_pe mangler for zone ' + ', '.join(mangler)
            + '. Aflaes dem i EN 1991-1-4 tabel 7.1 (vaegge) og 7.4a (tag).')

    ud = []
    for cpi in cpi_saet:
        for zone in _KRAEVEDE_ZONER:
            w = (float(c_pe[zone]) - float(cpi)) * float(q_p_kNm2)
            raekke = {'zone': zone, 'c_pe': round(float(c_pe[zone]), 3),
                      'c_pi': round(float(cpi), 3), 'w_kNm2': round(w, 4)}
            if rammeafstand_m is not None:
                raekke['w_kNm'] = round(w * float(rammeafstand_m), 4)
            ud.append(raekke)
    return ud


# ── Vind paa langs af kippen (theta = 90 grader) — FORSLAG ────────────────
#
# Tabel 7.1: vaeggene parallelt med vinden, A/B/C. Vaerdierne er de samme
# for alle h/d i tabellen.
_FORSLAG_LANGS_VAEG = {'A': -1.2, 'B': -0.8, 'C': -0.5}

# Tabel 7.4b, saddeltag, theta = 90 grader, c_pe,10: (F, G, H, I).
_FORSLAG_LANGS_TAG = {
    5:  (-1.6, -1.3, -0.7, -0.6),
    15: (-1.3, -1.3, -0.6, -0.5),
    30: (-1.1, -1.4, -0.8, -0.5),
    45: (-1.1, -1.4, -0.9, -0.5),
    60: (-1.1, -1.2, -0.8, -0.5),
    75: (-1.1, -1.2, -0.8, -0.5),
}


def forslag_langs(alpha_deg: float) -> dict:
    """FORSLAG til c_pe ved vind paa langs: A/B/C paa vaeggene, F/G/H/I paa taget.

    Efterproev mod EN 1991-1-4 tabel 7.1 og 7.4b, foer det bruges.
    """
    F, G, H, I = _interpoler(_FORSLAG_LANGS_TAG, abs(float(alpha_deg)))
    ud = dict(_FORSLAG_LANGS_VAEG)
    ud.update({'F': round(F, 3), 'G': round(G, 3), 'H': round(H, 3), 'I': round(I, 3)})
    return ud
