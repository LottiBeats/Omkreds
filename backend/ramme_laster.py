"""
ramme_laster.py — sne og vind sat på en plan ramme, EN 1991-1-3 og 1991-1-4.

Hvad
----
Vindblokken giver et tryk pr. flade (q_p og de c_pe, den projekterende har
aflæst). Sneblokken giver s_k, C_e og C_t. Det her modul gør det, der ellers
sker på et stykke papir ved siden af FEM-programmet: hvor zonegrænserne falder
på hver stang, hvor stor en strimmel af bygningen rammen bærer, og hvilken
linjelast der kommer ud af det — ét lasttilfælde ad gangen.

Resultatet er lasttilfælde og linjelaster på modellens led, med fra/til målt
langs leddet fra dets start, og en rapportdel, der viser vejen fra zonetryk
til kN/m. Det er den del, en kontrollant leder efter.

Geometri
--------
Kalderen giver leddene med rolle og endepunkter (start → slut i leddets egen
retning, den samme retning som linjelasternes fra/til måles i):

    {'member_id', 'rolle', 'x0', 'y0', 'x1', 'y1'}

    rolle: 'vaeg_v' | 'vaeg_h' | 'tag_v' | 'tag_h' | 'tag_flad' | 'ingen'

Zonerne måles i planen (EN 1991-1-4 figur 7.8), og en plan længde på et skråt
spær er længere langs spæret. Omregningen sker her, så e/10 er e/10 vandret.

Vinkelret last: + virker langs leddets lokale −y (som løseren påsætter den).
Om det er ind mod fladen, afhænger af hvilken vej leddet er tegnet; fortegnet
sættes derfor pr. led, så et positivt vindtryk altid presser ind mod
bygningen.

Rammens strimmel
----------------
En ramme bærer strimlen fra midt mellem den og naboen på hver side:
[x − s/2, x + s/2], klippet ved gavlen. Endefaget bærer derfor kun s/2.
Ligger strimlen over en zonegrænse (F ved gavlhjørnerne, A/B/C og H/I ved vind
på langs), vægtes c_pe med den andel af strimlen, der ligger i hver zone.
"""
from __future__ import annotations

import math

from calc_core import S, T, N, TBL

CPI_SAET = (+0.2, -0.3)

_ROLLE_TEKST = {
    'vaeg_v': 'Væg, venstre', 'vaeg_h': 'Væg, højre',
    'tag_v': 'Tag, venstre', 'tag_h': 'Tag, højre', 'tag_flad': 'Tag, fladt',
}


def _dk(v, d=2):
    return f"{v:.{d}f}".replace('.', ',').replace('-', '−')


def _cpi(v):
    return f"{v:+.1f}".replace('.', ',').replace('-', '−')


def _overlap(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def strimmel(x_m: float, s_m: float, laengde_m: float):
    """Rammens strimmel [a, b] langs bygningen, klippet ved gavlene."""
    a = max(0.0, x_m - s_m / 2.0)
    b = min(laengde_m, x_m + s_m / 2.0)
    return a, max(a, b)


def mu1(alpha_deg: float) -> float:
    """Formfaktor for sne, EN 1991-1-3 tabel 5.2."""
    a = abs(alpha_deg)
    if a <= 30:
        return 0.8
    if a < 60:
        return 0.8 * (60 - a) / 30
    return 0.0


# ── Geometri ─────────────────────────────────────────────────────────────────

class _Led:
    def __init__(self, d):
        self.id = d['member_id']
        self.rolle = d.get('rolle', 'ingen')
        self.x0, self.y0 = float(d['x0']), float(d['y0'])
        self.x1, self.y1 = float(d['x1']), float(d['y1'])
        self.L = math.hypot(self.x1 - self.x0, self.y1 - self.y0)

    def s_ved_x(self, x):
        """Afstand langs leddet fra dets start til planpunktet x."""
        dx = self.x1 - self.x0
        if abs(dx) < 1e-9:
            return 0.0
        return max(0.0, min(self.L, (x - self.x0) / dx * self.L))

    def indad(self, cx, cy):
        """+1 hvis + vinkelret last (lokal −y) peger ind mod punktet (cx, cy)."""
        dx, dy = self.x1 - self.x0, self.y1 - self.y0
        mx, my = (self.x0 + self.x1) / 2, (self.y0 + self.y1) / 2
        v = dy * (cx - mx) - dx * (cy - my)
        return 1.0 if v >= 0 else -1.0

    def haeldning(self):
        dx = abs(self.x1 - self.x0)
        return math.degrees(math.atan2(abs(self.y1 - self.y0), dx)) if dx > 1e-9 else 90.0


def _bygning(led):
    tag_v = [l for l in led if l.rolle == 'tag_v']
    tag_h = [l for l in led if l.rolle == 'tag_h']
    tag = tag_v + tag_h + [l for l in led if l.rolle == 'tag_flad']
    alle = [l for l in led if l.rolle != 'ingen']
    if not alle:
        raise ValueError('Ingen led har en rolle (væg eller tag) — der er '
                         'ingenting at sætte sne eller vind på.')
    xs = [v for l in alle for v in (l.x0, l.x1)]
    ys = [v for l in alle for v in (l.y0, l.y1)]
    g = {'xmin': min(xs), 'xmax': max(xs), 'ymin': min(ys), 'ymax': max(ys)}
    # Et punkt inde i bygningen: midt mellem væggene, under tagfladen.
    g['cx'] = (g['xmin'] + g['xmax']) / 2
    g['cy'] = g['ymin'] + 0.25 * (g['ymax'] - g['ymin'] or 1.0)
    if tag_v:
        g['tagfod_v'] = min(v for l in tag_v for v in (l.x0, l.x1))
        g['kip'] = max(v for l in tag_v for v in (l.x0, l.x1))
    if tag_h:
        g['tagfod_h'] = max(v for l in tag_h for v in (l.x0, l.x1))
        g.setdefault('kip', min(v for l in tag_h for v in (l.x0, l.x1)))
    g['alpha_v'] = max((l.haeldning() for l in tag_v), default=0.0)
    g['alpha_h'] = max((l.haeldning() for l in tag_h), default=0.0)
    g['har_tag'] = bool(tag)
    return g


def _stykker_i_plan(led_liste, xa, xb):
    """[(led, s1, s2)] for planintervallet [xa, xb] på de givne led."""
    lo, hi = min(xa, xb), max(xa, xb)
    ud = []
    for l in led_liste:
        la, lb = min(l.x0, l.x1), max(l.x0, l.x1)
        a, b = max(lo, la), min(hi, lb)
        if b - a <= 1e-9:
            continue
        s1, s2 = sorted((l.s_ved_x(a), l.s_ved_x(b)))
        ud.append((l, s1, s2))
    return ud


# ── Laster ───────────────────────────────────────────────────────────────────

def _udl(led, s1, s2, vaerdi, retning, lc, zone=None):
    ld = {'type': 'udl', 'target': 'member', 'member_id': led.id,
          'direction': retning, 'value_kNm': round(vaerdi, 4), 'lc': lc,
          'kilde': 'rammelaster'}
    if s1 > 1e-6:
        ld['x1'] = round(s1, 4)
    if s2 < led.L - 1e-6:
        ld['x2'] = round(s2, 4)
    if zone:
        ld['zone'] = zone
    return ld


def laster_paa_ramme(led, *, s_m, x_m=None, laengde_m=None,
                     sne=None, vind=None, g_tag_kNm2=0.0, navn='Ramme'):
    """
    Lasttilfælde og linjelaster på en ramme.

    led        : [{'member_id','rolle','x0','y0','x1','y1'}]
    s_m        : rammeafstand
    x_m        : rammens afstand fra nærmeste gavl (None = midt i bygningen)
    laengde_m  : bygningens længde langs kippen (vindblokkens b). Kræves for
                 at kunne klippe strimlen og placere hjørne- og gavlzoner.
    sne        : {'s_k','C_e','C_t'} eller None
    vind       : {'q_p','h','b','d','cpe0': [{'navn','c_pe':{D,E,F,G,H,I,J}}],
                  'cpe90': {A,B,C,F,G,H,I} | None} eller None
    g_tag_kNm2 : egenlast af tagfladen pr. m² tagflade (0 = ingen)

    Returnerer {'load_cases', 'loads', 'blocks', 'lastbredde_m'}.
    """
    L = [_Led(d) for d in led]
    g = _bygning(L)
    laengde = float(laengde_m) if laengde_m else None
    if x_m is None:
        x_m = (laengde / 2.0) if laengde else 1e6
    x_m = float(x_m)
    if laengde:
        x_m = min(x_m, laengde / 2.0)       # nærmeste gavl
        a, b = strimmel(x_m, float(s_m), laengde)
    else:
        a, b = x_m - s_m / 2.0, x_m + s_m / 2.0
        if a < 0:
            a = 0.0
    bredde = b - a

    tilfaelde, laster, blocks = [], [], []
    blocks.append(S(f'Laster på rammen — {navn}'))
    placering = ('endefag' if x_m <= 1e-6 else
                 f'{_dk(x_m)} m fra nærmeste gavl')
    blocks.append(T(
        f'Rammeafstand s = {_dk(s_m)} m. Rammen står {placering} og bærer '
        f'strimlen {_dk(a)}–{_dk(b)} m, dvs. lastbredden {_dk(bredde)} m. '
        'Linjelasterne nedenfor er fladelasten ganget med lastbredden; '
        '"fra–til" er målt langs leddet fra dets start.'))

    def nyt(navn_lc, kategori, gruppe=None):
        nr = len(tilfaelde) + 1
        tilfaelde.append({'nr': nr, 'navn': navn_lc, 'kategori': kategori,
                          'gruppe': gruppe, 'kilde': 'rammelaster'})
        return nr

    tag_led = [l for l in L if l.rolle in ('tag_v', 'tag_h', 'tag_flad')]

    # ── Egenlast af tag ─────────────────────────────────────────────────────
    if g_tag_kNm2 and tag_led:
        lc = nyt('Egenlast, tag', 'permanent')
        w = float(g_tag_kNm2) * bredde
        for l in tag_led:
            laster.append(_udl(l, 0.0, l.L, w, 'vertical', lc))
        blocks.append(S('Egenlast, tag'))
        blocks.append(T(
            f'g = {_dk(g_tag_kNm2)} kN/m² tagflade · {_dk(bredde)} m = '
            f'{_dk(w, 3)} kN/m langs spærene, lodret.'))

    # ── Sne, EN 1991-1-3 §5.3.3 ────────────────────────────────────────────
    if sne and tag_led:
        s_k = float(sne.get('s_k', 1.0))
        C_e = float(sne.get('C_e', 1.0))
        C_t = float(sne.get('C_t', 1.0))
        rows = []
        tv = [l for l in L if l.rolle == 'tag_v']
        th = [l for l in L if l.rolle == 'tag_h']
        tf = [l for l in L if l.rolle == 'tag_flad']
        m_v, m_h = mu1(g['alpha_v']), mu1(g['alpha_h'])
        m_f = 0.8
        saet = [('Sne, jævnt fordelt', 1.0, 1.0)]
        if tv and th:
            saet += [('Sne, asymmetrisk — venstre halveret', 0.5, 1.0),
                     ('Sne, asymmetrisk — højre halveret', 1.0, 0.5)]
        for navn_lc, fv, fh in saet:
            lc = nyt(navn_lc, 'snow', 'sne')
            for side, liste, mu, f in (('venstre', tv, m_v, fv),
                                       ('højre', th, m_h, fh),
                                       ('fladt', tf, m_f, 1.0)):
                if not liste:
                    continue
                s_flade = f * mu * C_e * C_t * s_k
                w = s_flade * bredde
                for l in liste:
                    laster.append(_udl(l, 0.0, l.L, w, 'projected', lc))
                rows.append([navn_lc, side, _dk(f * mu, 2),
                             _dk(s_flade, 3), _dk(w, 3)])
        blocks.append(S('Sne  (EN 1991-1-3 §5.3.3)'))
        blocks.append(T(
            f's = μ · C_e · C_t · s_k med s_k = {_dk(s_k)} kN/m², '
            f'C_e = {_dk(C_e)}, C_t = {_dk(C_t)}. '
            + (f'μ₁ = {_dk(m_v)} (α = {g["alpha_v"]:.0f}°) til venstre og '
               f'{_dk(m_h)} (α = {g["alpha_h"]:.0f}°) til højre, tabel 5.2. '
               if tv and th else '')
            + 'Lasten virker lodret pr. m vandret projektion.'))
        blocks.append(TBL(['Lasttilfælde', 'Tagflade', 'μ', 's  [kN/m²]',
                           'w  [kN/m vandret]'], rows))

    # ── Vind, EN 1991-1-4 ──────────────────────────────────────────────────
    if vind:
        _vind(vind, L, g, a, b, bredde, laengde, nyt, laster, blocks)

    return {'load_cases': tilfaelde, 'loads': laster, 'blocks': blocks,
            'lastbredde_m': round(bredde, 4)}


def _vind(vind, L, g, a, b, bredde, laengde, nyt, laster, blocks):
    q_p = float(vind['q_p'])
    h = float(vind['h'])
    b_byg = float(vind.get('b') or laengde or 0.0)      # langs kippen
    d_byg = float(vind.get('d') or (g['xmax'] - g['xmin']))  # på tværs
    e0 = min(b_byg, 2 * h) if b_byg else 2 * h
    e90 = min(d_byg, 2 * h)

    vaeg_v = [l for l in L if l.rolle == 'vaeg_v']
    vaeg_h = [l for l in L if l.rolle == 'vaeg_h']
    tag_v = [l for l in L if l.rolle == 'tag_v']
    tag_h = [l for l in L if l.rolle == 'tag_h']
    if [l for l in L if l.rolle == 'tag_flad']:
        blocks.append(N('Vind på et fladt tag er ikke sat på: zonerne for '
                        'flade tage (EN 1991-1-4 §7.2.3) er ikke med i '
                        'lastmodulet endnu. Tilføj dem som laster i modellen.'))

    blocks.append(S('Vind  (EN 1991-1-4 §7.2)'))
    blocks.append(T(
        f'q_p = {_dk(q_p, 3)} kN/m² fra vindberegningen. w = (c_pe − c_pi) · q_p, '
        'positiv er tryk ind mod fladen. Begge indvendige tryk regnes, '
        'c_pi = +0,2 og −0,3 (§7.2.9(6)). '
        f'Vind på tværs af kippen: e = min(b; 2h) = {_dk(e0)} m. '
        f'Vind på langs: e = min(d; 2h) = {_dk(e90)} m. '
        'Zonegrænserne er målt vandret og regnet om til længde langs spæret. '
        'Alle vindtilfælde er i samme gruppe, så højst ét indgår i hver '
        'kombination.'))

    def paasaet(led_, s1, s2, cpe, cpi, lc, zone, rows, flade):
        w_m2 = (cpe - cpi) * q_p
        w = w_m2 * bredde * led_.indad(g['cx'], g['cy'])
        laster.append(_udl(led_, s1, s2, w, 'perpendicular', lc, zone))
        rows.append([flade, zone, f'led {led_.id}', f'{_dk(s1)}–{_dk(s2)}',
                     _dk(cpe, 2), _cpi(cpi), _dk(w_m2, 3),
                     _dk(w_m2 * bredde, 3)])

    # Andel af strimlen i gavlhjørnernes F-zone (e/4 fra hver gavl).
    if laengde:
        fF = (_overlap(a, b, 0, e0 / 4) + _overlap(a, b, laengde - e0 / 4, laengde)) / (bredde or 1)
    else:
        fF = 0.0

    # ── θ = 0°: vind på tværs af kippen, fra venstre og fra højre ──────────
    for saet in vind.get('cpe0') or []:
        cpe = saet['c_pe']
        mangler = [z for z in ('D', 'E', 'G', 'H', 'I', 'J') if cpe.get(z) is None]
        if mangler:
            blocks.append(N(f'Vind "{saet.get("navn", "")}": c_pe mangler for '
                            f'zone {", ".join(mangler)} — sættet er sprunget over.'))
            continue
        cG = fF * float(cpe.get('F', cpe['G'])) + (1 - fF) * float(cpe['G'])
        for fra in ('venstre', 'højre'):
            luv_vaeg, lae_vaeg = (vaeg_v, vaeg_h) if fra == 'venstre' else (vaeg_h, vaeg_v)
            luv_tag, lae_tag = (tag_v, tag_h) if fra == 'venstre' else (tag_h, tag_v)
            for cpi in CPI_SAET:
                navn_lc = (f'Vind fra {fra}{", " + saet["navn"] if saet.get("navn") else ""}, '
                           f'c_pi {_cpi(cpi)}')
                lc = nyt(navn_lc, 'wind', 'vind')
                rows = []
                for l in luv_vaeg:
                    paasaet(l, 0.0, l.L, float(cpe['D']), cpi, lc, 'D', rows, 'væg, luv')
                for l in lae_vaeg:
                    paasaet(l, 0.0, l.L, float(cpe['E']), cpi, lc, 'E', rows, 'væg, læ')
                if luv_tag and 'kip' in g:
                    fod = g['tagfod_v'] if fra == 'venstre' else g['tagfod_h']
                    sgn = 1 if fra == 'venstre' else -1
                    grense = fod + sgn * e0 / 10
                    for l, s1, s2 in _stykker_i_plan(luv_tag, fod, grense):
                        paasaet(l, s1, s2, cG, cpi, lc, 'G' if fF == 0 else 'F/G', rows, 'tag, luv')
                    for l, s1, s2 in _stykker_i_plan(luv_tag, grense, g['kip']):
                        paasaet(l, s1, s2, float(cpe['H']), cpi, lc, 'H', rows, 'tag, luv')
                if lae_tag and 'kip' in g:
                    fod = g['tagfod_h'] if fra == 'venstre' else g['tagfod_v']
                    sgn = 1 if fra == 'venstre' else -1
                    grense = g['kip'] + sgn * e0 / 10
                    for l, s1, s2 in _stykker_i_plan(lae_tag, g['kip'], grense):
                        paasaet(l, s1, s2, float(cpe['J']), cpi, lc, 'J', rows, 'tag, læ')
                    for l, s1, s2 in _stykker_i_plan(lae_tag, grense, fod):
                        paasaet(l, s1, s2, float(cpe['I']), cpi, lc, 'I', rows, 'tag, læ')
                blocks.append(S(f'LC{lc} {navn_lc}'))
                blocks.append(TBL(['Flade', 'Zone', 'Led', 'Fra–til [m]', 'c_pe',
                                   'c_pi', 'w [kN/m²]', 'w·s [kN/m]'], rows))
        if fF > 0:
            blocks.append(T(
                f'{_dk(fF * 100, 0)} % af strimlen ligger i gavlhjørnets F-zone '
                f'(e/4 = {_dk(e0 / 4)} m fra gavlen); c_pe i kantzonen er vægtet '
                f'mellem F og G: {_dk(cG, 2)}.'))

    # ── θ = 90°: vind på langs, fra den nærmeste gavl ──────────────────────
    c90 = vind.get('cpe90')
    if c90:
        mangler = [z for z in ('A', 'B', 'C', 'F', 'G', 'H', 'I') if c90.get(z) is None]
        if mangler:
            blocks.append(N('Vind på langs: c_pe mangler for zone '
                            + ', '.join(mangler) + ' — springes over.'))
        elif not laengde:
            blocks.append(N('Vind på langs kræver bygningens længde — springes over.'))
        else:
            def andele(grenser):
                # andel af strimlen i hvert interval [g0, g1) langs bygningen
                return [_overlap(a, b, g0, g1) / (bredde or 1) for g0, g1 in grenser]
            fA, fB, fC = andele([(0, e90 / 5), (e90 / 5, e90), (e90, 1e9)])
            f1, f2, f3 = andele([(0, e90 / 10), (e90 / 10, e90 / 2), (e90 / 2, 1e9)])
            c_vaeg = fA * c90['A'] + fB * c90['B'] + fC * c90['C']
            c_kant = f1 * c90['F'] + f2 * c90['H'] + f3 * c90['I']   # ved tagfoden
            c_midt = f1 * c90['G'] + f2 * c90['H'] + f3 * c90['I']
            for cpi in CPI_SAET:
                navn_lc = f'Vind på langs, c_pi {_cpi(cpi)}'
                lc = nyt(navn_lc, 'wind', 'vind')
                rows = []
                for l in vaeg_v + vaeg_h:
                    paasaet(l, 0.0, l.L, c_vaeg, cpi, lc, 'A/B/C', rows, 'væg')
                for liste, fod_key in ((tag_v, 'tagfod_v'), (tag_h, 'tagfod_h')):
                    if not liste or fod_key not in g:
                        continue
                    fod = g[fod_key]
                    sgn = 1 if fod_key == 'tagfod_v' else -1
                    grense = fod + sgn * e90 / 4
                    for l, s1, s2 in _stykker_i_plan(liste, fod, grense):
                        paasaet(l, s1, s2, c_kant, cpi, lc, 'F/H/I', rows, 'tag, ved tagfod')
                    for l, s1, s2 in _stykker_i_plan(liste, grense, g['kip']):
                        paasaet(l, s1, s2, c_midt, cpi, lc, 'G/H/I', rows, 'tag')
                blocks.append(S(f'LC{lc} {navn_lc}'))
                blocks.append(TBL(['Flade', 'Zone', 'Led', 'Fra–til [m]', 'c_pe',
                                   'c_pi', 'w [kN/m²]', 'w·s [kN/m]'], rows))
            blocks.append(T(
                'Vind på langs regnes fra den nærmeste gavl. c_pe er vægtet med '
                f'den andel af strimlen, der ligger i hver zone: væg A/B/C '
                f'{_dk(fA * 100, 0)}/{_dk(fB * 100, 0)}/{_dk(fC * 100, 0)} %, '
                f'tag {_dk(f1 * 100, 0)}/{_dk(f2 * 100, 0)}/{_dk(f3 * 100, 0)} % '
                '(e/10 og e/2 fra gavlen). Ved tagfoden (e/4) bruges F i stedet '
                'for G.'))
