"""
vind_ramme.py — vindzoner på en saddeltagsramme, EN 1991-1-4

Hvad
----
Tager rammens geometri og spidshastighedstrykket q_p og giver de linjelaster,
vinden sætter på hver enkelt stang — zone for zone, med de rigtige
formfaktorer og med de fire lasttilfælde, en ramme skal eftervises for.

Hvorfor
-------
q_p regnes allerede rigtigt i wind_load.py. Formfaktorerne gjorde ikke: de var
parametre med standardværdier (c_pe,los = 0,8, c_pe,læ = −0,5), tastet i
hånden, og der fandtes ingen tagzoner overhovedet. På et saddeltag er det
netop taget, der afgør rammen — og zonerne dér spænder fra +0,7 til −1,7
afhængigt af taghældningen.

    ┌─ ADVARSEL ─────────────────────────────────────────────────────────┐
    │ Tabelværdierne nedenfor er skrevet efter EN 1991-1-4 tabel 7.1 og  │
    │ 7.4a. De SKAL efterprøves mod standarden, før de bruges i et       │
    │ dokument, der udstedes. De står ét sted og kun ét, netop for at    │
    │ den kontrol kan gøres én gang — se _CPE_VAEG og _CPE_SADDELTAG.    │
    │                                                                     │
    │ Prøverne i tests/test_vind_ramme.py låser hver eneste værdi fast,   │
    │ så en rettelse er én linje og en fejlende prøve, ikke en jagt.      │
    └─────────────────────────────────────────────────────────────────────┘

Hvordan
-------
Vinden vinkelret på kippen (θ = 0°) er den, der belaster rammen. En
indvendig ramme ser:

    væg, luv         zone D
    tagflade, luv    zone G i e/10 fra tagfoden, derefter H
    tagflade, læ     zone J i e/10 fra kippen, derefter I
    væg, læ          zone E

    e = min(b, 2h)

Zone F og A/B/C hører til gavlene og til vægge parallelt med vinden; en
indvendig ramme bærer dem ikke.

Det indvendige tryk lægges til alle flader: w = (c_pe − c_pi)·q_p. Med c_pi
= +0,2 og −0,3 (EN 1991-1-4 §7.2.9(6), når åbningsforholdet ikke er kendt)
og vind fra hver side giver det fire lasttilfælde — de fire, enhver ramme
skal eftervises for.
"""
from __future__ import annotations

# ── EN 1991-1-4 tabel 7.1 — lodrette vægge, c_pe,10 ─────────────────────────
#
# Kun D (luv) og E (læ): A, B og C sidder på de vægge, der er parallelle med
# vinden, og dem bærer en indvendig ramme ikke.
#
# Nøglen er h/d. Mellem punkterne interpoleres lineært, som noten til tabellen
# foreskriver.
_CPE_VAEG = {
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
_CPE_SADDELTAG_NEG = {
    #  alfa:  (F,    G,    H,    J,    I)
    5:       (-1.7, -1.2, -0.6, -0.6, -0.6),
    15:      (-0.9, -0.8, -0.3, -1.0, -0.4),
    30:      (-0.5, -0.5, -0.2, -0.5, -0.4),
    45:      (0.0,  0.0,  0.0,  -0.3, -0.2),
    60:      (+0.7, +0.7, +0.7, -0.3, -0.2),
    75:      (+0.8, +0.8, +0.8, -0.3, -0.2),
}
_CPE_SADDELTAG_POS = {
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


def cpe_vaegge(h_m: float, d_m: float) -> dict:
    """c_pe for luv- og laevaeg (zone D og E) efter h/d."""
    if d_m <= 0:
        raise ValueError('bygningsdybden d skal vaere positiv')
    D, E = _interpoler(_CPE_VAEG, h_m / d_m)
    return {'D': round(D, 3), 'E': round(E, 3)}


def cpe_saddeltag(alpha_deg: float, fortegn: str = 'neg') -> dict:
    """c_pe for tagzonerne F, G, H, J, I ved taghaeldningen alfa.

    fortegn: 'neg' eller 'pos'. Ved de flade haeldninger giver tabellen begge,
    og begge skal eftervises -- derfor to opslag og ikke ét med et valg
    indbygget.
    """
    tabel = _CPE_SADDELTAG_POS if fortegn == 'pos' else _CPE_SADDELTAG_NEG
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


def vindlaster_paa_ramme(q_p_kNm2: float, h_m: float, b_m: float, d_m: float,
                         alpha_deg: float, spaer_luv_m: float,
                         spaer_lae_m: float, rammeafstand_m: float,
                         elementer: dict, fra: str = 'venstre',
                         c_pi: float = 0.2, fortegn: str = 'neg') -> list:
    """
    Linjelasterne paa rammens staenger for ÉN vindretning og ÉT c_pi.

    elementer: {'vaeg_luv': id, 'spaer_luv': id, 'spaer_lae': id,
                'vaeg_lae': id}

    Returnerer laster i blokkens eget format, med 'direction' = 'perpendicular'
    -- vindtryk virker vinkelret paa fladen, og det gaelder ogsaa et spaer.

    Fortegnet: w er positiv som TRYK ind mod fladen. En negativ w er sug.
    """
    vaeg = cpe_vaegge(h_m, d_m)
    tag = cpe_saddeltag(alpha_deg, fortegn)
    s = float(rammeafstand_m)

    def w(c_pe):
        # w = (c_pe - c_pi) * q_p, ganget med rammeafstanden -> kN/m
        return round((c_pe - c_pi) * float(q_p_kNm2) * s, 4)

    ud = []

    def _tilfoej(elem_id, vaerdi, zone, x1=None, x2=None):
        last = {'type': 'udl', 'elem_id': int(elem_id),
                'direction': 'perpendicular', 'value_kNm': vaerdi,
                'zone': zone}
        if x1 is not None:
            last['x1'], last['x2'] = round(x1, 4), round(x2, 4)
        ud.append(last)

    _tilfoej(elementer['vaeg_luv'], w(vaeg['D']), 'D')
    _tilfoej(elementer['vaeg_lae'], w(vaeg['E']), 'E')

    for zone, x1, x2 in tagzoner_langs_spaer(h_m, b_m, spaer_luv_m, 'luv'):
        _tilfoej(elementer['spaer_luv'], w(tag[zone]), zone, x1, x2)
    for zone, x1, x2 in tagzoner_langs_spaer(h_m, b_m, spaer_lae_m, 'lae'):
        _tilfoej(elementer['spaer_lae'], w(tag[zone]), zone, x1, x2)

    return ud


def lasttilfaelde_vind(**kwargs) -> list:
    """
    De fire vindlasttilfaelde, en saddeltagsramme skal eftervises for.

    To retninger gange to indvendige tryk. De fire udelukker hinanden
    indbyrdes -- de ligger i gruppen 'vind' -- saa de kommer aldrig to ad
    gangen i den samme kombination.

    Hvorfor fire og ikke to: c_pi er +0,2 ELLER -0,3, og hvilken der er
    vaerst kan ikke afgoeres paa forhaand. Et indvendigt overtryk loefter
    taget sammen med suget; et undertryk trykker det ned og modvirker.
    Paa et let tag afgoer det forankringen.
    """
    fra_retning = kwargs.pop('retninger', ('venstre', 'hoejre'))
    cpi_saet = kwargs.pop('cpi_saet', CPI_SAET)
    fortegn = kwargs.pop('fortegn', 'neg')

    tilfaelde = []
    nr = int(kwargs.pop('foerste_nr', 1))
    for retning in fra_retning:
        for cpi in cpi_saet:
            elementer = dict(kwargs['elementer'])
            if retning == 'hoejre':
                # Spejlvendingen er kun et bytte af, hvilken side der er luv.
                elementer = {
                    'vaeg_luv': elementer['vaeg_lae'],
                    'vaeg_lae': elementer['vaeg_luv'],
                    'spaer_luv': elementer['spaer_lae'],
                    'spaer_lae': elementer['spaer_luv'],
                }
            argumenter = dict(kwargs, elementer=elementer, c_pi=cpi,
                              fortegn=fortegn, fra=retning)
            argumenter.pop('foerste_nr', None)
            laster = vindlaster_paa_ramme(**argumenter)
            navn = (f"Vind fra {retning}, "
                    f"c_pi = {cpi:+.1f}".replace('.', ','))
            tilfaelde.append({
                'nr': nr,
                'navn': navn,
                'kategori': 'wind',
                'gruppe': 'vind',
                'laster': [dict(l, lc=nr) for l in laster],
            })
            nr += 1
    return tilfaelde
