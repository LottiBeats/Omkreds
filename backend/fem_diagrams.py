"""
fem_diagrams.py — snitkraftkurver tegnet som en tegning, ikke som et plot

Kurverne blev før tegnet af opsvis. Det gav to problemer, som begge er af den
slags man kun ser når man kigger på den færdige rapport:

  Udseendet. opsvis tegner et matplotlib-plot: akser, gitter, ticks, 13x7 tommer
  uanset hvad konstruktionen er. En bjælke på 6 m fylder en tredjedel af sin
  egen figur, resten er luft. I en statisk beregning er en momentkurve en
  *tegning* — konstruktionen, kurven, og de tal der betyder noget. Ikke et
  koordinatsystem.

  Tallene. opsvis integrerer sin egen fordeling ud fra modellen i OpenSees.
  Tabellen kommer fra section_force_extremes(). To veje til det samme tal er én
  vej for meget: kurven toppede i 4,2374 hvor tabellen skrev 4,17. Her tegnes
  kurven af præcis den funktion tabellen læser sit maksimum af, så de kan ikke
  være uenige.

Sidegevinsten er, at intet her rører OpenSees. Figurerne behøver ikke længere
blive lavet mens solveren stadig står med den rigtige lastkombination i
hukommelsen — de kan laves når som helst ud fra snitkræfterne.
"""

import base64
import io
import math
from collections import defaultdict

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D


# ── Palet ─────────────────────────────────────────────────────────────────────

C_STRUCT   = '#374151'   # konstruktionen i en snitkraftfigur
C_STRUCT_L = '#C7CBD1'   # udeformeret geometri bag den deformerede
C_SUPPORT  = '#6B7280'
C_TEXT     = '#1C1C1E'
C_MUTED    = '#6E6E73'

# Én kulør pr. kurvetype. N får to: træk og tryk er det man aflæser en
# normalkraftkurve for, og en farve siger det hurtigere end et fortegn.
STYLE = {
    'M':    {'line': '#0E7C66', 'pos': '#0E7C66', 'neg': '#0E7C66',
             'title': 'M', 'unit': 'kNm', 'label': 'Momentkurve'},
    'V':    {'line': '#2563EB', 'pos': '#2563EB', 'neg': '#2563EB',
             'title': 'V', 'unit': 'kN',  'label': 'Forskydningskurve'},
    'N':    {'line': '#B45309', 'pos': '#2563EB', 'neg': '#DC2626',
             'title': 'N', 'unit': 'kN',  'label': 'Normalkraftkurve'},
}

# Største ordinat som andel af modellens største udstrækning. Højere ser
# dramatisk ud og lyver om ingenting, men får kurven til at støde ind i
# nabofagene på en ramme.
ORDINATE_FRAC = 0.16

SAMPLES_PER_ELEM = 25       # nok til at en parabel ser ud som en parabel
# Figuren tegnes taet paa den stoerrelse, den trykkes i: 5,5" er 140 mm, og
# det er den bredde, PDF'en giver den. Foer blev der tegnet 9" og skaleret ned
# til 160 mm -- en reduktion paa 30 %, saa 8,5 pt etiketter blev til under 6 pt
# paa papiret. Tegner man i den rigtige stoerrelse, staar skriften som den er
# sat.
#
# Hoejden foelger modellen, men har et loft: en ramme er hoejere end en
# bjaelke, og uden loftet fyldte én figur en halv A4-side. Fem af dem blev til
# 2,3 siders billede, foer der stod tekst.
FIG_WIDTH_IN     = 5.5
FIG_H_MIN        = 1.7
FIG_H_MAX        = 3.4
DPI              = 200
MAX_PEAK_LABELS  = 8


def _dk(v, d=2):
    """Tal med dansk decimalkomma."""
    return f'{v:.{d}f}'.replace('.', ',')


def _nice(v, unit):
    """Et tal til en figur: to decimaler, komma, enhed, uden tvivl om fortegn."""
    return f'{_dk(v)} {unit}'


# ── Geometri ──────────────────────────────────────────────────────────────────

def _geom(el, dict_nodes):
    ni = dict_nodes[el['ni']]; nj = dict_nodes[el['nj']]
    xi, yi = float(ni['x']), float(ni['y'])
    xj, yj = float(nj['x']), float(nj['y'])
    L = math.hypot(xj - xi, yj - yi) or 1e-9
    return xi, yi, xj, yj, L, (xj - xi) / L, (yj - yi) / L


def _ordinate_reference(elements, dict_nodes, ref_size):
    """
    Hvad ordinaten måles imod.

    Modellens største udstrækning er det nærliggende valg, og det er rigtigt
    for en bjælke, hvor leddet *er* modellen. På en hanebåndsramme er det
    forkert: spændet er 8 m, men spærene er 4,8 og hanebåndet 4, så en ordinat
    på 16 % af spændet er en fjerdedel af det led den hører til — og alle fire
    kurver ender oven i hinanden omkring rygningen.

    Middellængden af leddene følger konstruktionen i stedet. Den holdes inden
    for modellen og over en tredjedel af den, så hverken en enkelt kort stang
    eller et enkelt langt fag kan trække skalaen med sig.
    """
    lengths = defaultdict(float)
    for el in elements:
        if el['ni'] not in dict_nodes or el['nj'] not in dict_nodes:
            continue
        lengths[_member_key(el)] += _geom(el, dict_nodes)[4]
    if not lengths:
        return ref_size
    mean = sum(lengths.values()) / len(lengths)
    return min(ref_size, max(mean, ref_size / 3.0))


def _member_key(el):
    """Hvad brugeren kalder ét led. Falder tilbage til elementet selv."""
    mid = el.get('member_id')
    return ('m', mid) if mid is not None else ('e', el['id'])


def _interior_nodes(elements):
    """
    Knuder der kun findes fordi et led er delt op i elementer.

    De skal ikke have en prik og et nummer på tegningen — de er en detalje ved
    beregningen, ikke ved konstruktionen.
    """
    if not any(el.get('member_id') is not None for el in elements):
        return set()
    mids  = defaultdict(set)
    count = defaultdict(int)
    for el in elements:
        for nid in (el['ni'], el['nj']):
            mids[nid].add(el.get('member_id'))
            count[nid] += 1
    return {nid for nid, ms in mids.items()
            if count[nid] == 2 and len(ms) == 1 and None not in ms}


# ── Snitkræfter langs elementet ───────────────────────────────────────────────

def _ordinate(kind, pl, x, wy, wx, segs=None, L=None):
    """
    N, V eller M i afstanden x fra ende i.

    Samme udtryk som section_forces_2d() i general_frame_fem — gentaget her, og
    ikke importeret, ville være to sandheder. Det importeres.

    Er lasten givet som afsnit, regnes den af stanglaster: en dellast eller en
    trekantlast kan ikke beskrives af ét talpar, og section_forces_2d ville
    tegne en ret linje, hvor der skal være et knæk.
    """
    if segs is not None:
        import stanglaster as _sl
        segs_y, segs_x = segs
        N, V, M = _sl.snitkraefter(pl, x, segs_y, segs_x, L)
    else:
        from general_frame_fem import section_forces_2d
        N, V, M = section_forces_2d(pl, x, wy, wx)
    return {'N': N, 'V': V, 'M': M}[kind]


def _sample(kind, el, pl, wy, wx, L, n=SAMPLES_PER_ELEM, segs=None):
    """
    (x, værdi) langs ét element.

    Med afsnit lægges afsnittenes ender ind mellem stikprøverne. Et jævnt
    gitter ville skære hjørnet af netop dér, hvor en dellast begynder eller
    slutter — og det er det sted på kurven, der bærer oplysningen om, at
    lasten ikke dækker det hele.
    """
    if el.get('type', 'beam') == 'truss':
        # En trussstang har kun normalkraft, og den er konstant.
        v = -pl[0] if kind == 'N' else 0.0
        return [(0.0, v), (L, v)]
    xs = [L * i / (n - 1) for i in range(n)]
    if segs is not None:
        knaek = set()
        for seg in (list(segs[0]) + list(segs[1])):
            for x in (seg[2], seg[3]):
                if 0.0 < x < L:
                    # Lige på hver side af knækket, så springet i V ses.
                    knaek.add(max(0.0, x - 1e-7))
                    knaek.add(min(L, x + 1e-7))
        xs = sorted(set(xs) | knaek)
    return [(x, _ordinate(kind, pl, x, wy, wx, segs, L)) for x in xs]


# ── Tegneprimitiver ───────────────────────────────────────────────────────────

def _draw_supports(ax, supports, dict_nodes, sz):
    for sup in supports:
        n = dict_nodes.get(sup.get('node_id'))
        if not n:
            continue
        x, y = float(n['x']), float(n['y'])
        ux, uy, rz = bool(sup.get('ux')), bool(sup.get('uy')), bool(sup.get('rz'))
        if rz:                                   # indspænding
            ax.add_patch(plt.Rectangle((x - sz*0.55, y - sz), sz*1.1, sz,
                                       fc='none', ec=C_SUPPORT, lw=1.2,
                                       hatch='///', zorder=4))
        elif ux and uy:                          # charnier
            ax.add_patch(plt.Polygon([[x, y], [x - sz*0.5, y - sz],
                                      [x + sz*0.5, y - sz]],
                                     fc='white', ec=C_SUPPORT, lw=1.2, zorder=4))
            ax.plot([x - sz*0.75, x + sz*0.75], [y - sz*1.06]*2,
                    color=C_SUPPORT, lw=1.2, zorder=4)
        elif uy:                                 # rulle
            ax.add_patch(plt.Polygon([[x, y], [x - sz*0.5, y - sz*0.78],
                                      [x + sz*0.5, y - sz*0.78]],
                                     fc='white', ec=C_SUPPORT, lw=1.2, zorder=4))
            ax.add_patch(plt.Circle((x, y - sz*0.95), sz*0.17,
                                    fc='white', ec=C_SUPPORT, lw=1.1, zorder=4))
            ax.plot([x - sz*0.75, x + sz*0.75], [y - sz*1.2]*2,
                    color=C_SUPPORT, lw=1.2, zorder=4)
        elif ux:                                 # vandret rulle
            ax.add_patch(plt.Polygon([[x, y], [x - sz*0.78, y - sz*0.5],
                                      [x - sz*0.78, y + sz*0.5]],
                                     fc='white', ec=C_SUPPORT, lw=1.2, zorder=4))
            ax.plot([x - sz*0.95]*2, [y - sz*0.75, y + sz*0.75],
                    color=C_SUPPORT, lw=1.2, zorder=4)


def _draw_structure(ax, elements, dict_nodes, color, lw=2.0, zorder=3):
    for el in elements:
        xi, yi, xj, yj, _, _, _ = _geom(el, dict_nodes)
        ax.plot([xi, xj], [yi, yj], color=color, lw=lw,
                ls='-' if el.get('type', 'beam') == 'beam' else (0, (5, 3)),
                solid_capstyle='round', zorder=zorder)


def _finish(fig, ax, xs, ys, title_left, title_right):
    """
    Fælles afslutning: lige akseforhold, ingen akser, luft der passer til
    modellen — og en figurhøjde der følger konstruktionen i stedet for at være
    7 tommer uanset hvad.

    Overskrifterne sættes som titler over akserne, ikke som tekst inde i dem.
    Ellers skal der reserveres plads i toppen af tegningen til dem, og den
    plads bliver til hvidt felt i rapporten på hver eneste figur.
    """
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    w = max(x1 - x0, 1e-6)
    h = max(y1 - y0, 1e-6)
    pad = max(w, h) * 0.06

    ax.set_xlim(x0 - pad, x1 + pad)
    ax.set_ylim(y0 - pad, y1 + pad)
    ax.set_aspect('equal', adjustable='box')
    ax.axis('off')

    aspect = (h + 2 * pad) / (w + 2 * pad)
    fig.set_size_inches(FIG_WIDTH_IN,
                        min(max(FIG_WIDTH_IN * aspect, FIG_H_MIN), FIG_H_MAX))

    ax.set_title(title_left, loc='left', fontsize=11, fontweight='bold',
                 color=C_TEXT, pad=7)
    if title_right:
        ax.set_title(title_right, loc='right', fontsize=9.5, color=C_MUTED,
                     pad=8)

    fig.tight_layout(pad=0.3)
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=DPI, facecolor='white',
                edgecolor='none', bbox_inches='tight', pad_inches=0.06)
    buf.seek(0)
    plt.close(fig)
    return base64.b64encode(buf.read()).decode()


# ── Snitkraftkurve ────────────────────────────────────────────────────────────

def section_force_figure(kind, nodes, elements, supports, ele_forces, ele_udl,
                         ref_size, scale=1.0, ele_segs=None):
    """
    Tegn N-, V- eller M-kurven.

    kind      : 'N' | 'V' | 'M'
    ele_udl   : {elem_id: (wy, wx)} som givet til eleLoad — den lokale
                fordeling kurven integreres af
    scale     : brugerens skalering af ordinaten. 1,0 = automatisk.
    """
    st = STYLE[kind]
    dict_nodes = {n['id']: n for n in nodes}
    drawn = [el for el in elements
             if el['id'] in ele_forces and (kind == 'N' or
                                            el.get('type', 'beam') == 'beam')]
    if not drawn:
        drawn = [el for el in elements if el['id'] in ele_forces]

    # Snitkræfterne først — skalaen kan først vælges når maksimum kendes
    curves = []
    peak_abs = 0.0
    for el in drawn:
        xi, yi, xj, yj, L, ca, sa = _geom(el, dict_nodes)
        wy, wx = ele_udl.get(el['id'], (0.0, 0.0))
        segs = (ele_segs or {}).get(el['id'])
        pts = _sample(kind, el, ele_forces[el['id']], wy, wx, L, segs=segs)
        curves.append((el, xi, yi, ca, sa, L, wy, wx, pts))
        peak_abs = max(peak_abs, max(abs(v) for _, v in pts))

    ord_ref = _ordinate_reference(drawn, dict_nodes, ref_size)
    fac = (ord_ref * ORDINATE_FRAC / peak_abs * scale) if peak_abs > 1e-9 else 0.0

    fig, ax = plt.subplots()
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    xs, ys = [], []
    for n in nodes:
        xs.append(float(n['x'])); ys.append(float(n['y']))

    _draw_structure(ax, elements, dict_nodes, C_STRUCT, lw=2.0, zorder=4)
    _draw_supports(ax, supports, dict_nodes, ref_size * 0.05)

    # Momentet tegnes på trækside — dansk og europæisk konvention. De øvrige
    # tegnes med positiv ordinat til den lokale +y-side.
    flip = -1.0 if kind == 'M' else 1.0
    tick_step = max(ref_size / 22.0, 1e-6)

    for el, xi, yi, ca, sa, L, wy, wx, pts in curves:
        ox, oy = -sa * fac * flip, ca * fac * flip     # ordinatretning

        px = [xi + ca * x + ox * v for x, v in pts]
        py = [yi + sa * x + oy * v for x, v in pts]
        bx = [xi + ca * x for x, _ in pts]
        by = [yi + sa * x for x, _ in pts]
        xs += px; ys += py

        # Fyld mellem stangen og kurven, delt ved fortegn så en normalkraft-
        # kurve viser træk og tryk hver for sig
        vals = [v for _, v in pts]
        # Et led uden snitkraft — et hanebånd med charnier i begge ender har
        # intet moment — ville få kurven tegnet oven i stangen selv, som en
        # farvet streg der ligner en fremhævning af noget.
        if max(abs(v) for v in vals) < 5e-3 * max(peak_abs, 1e-12):
            continue

        if st['pos'] == st['neg']:
            ax.fill(px + bx[::-1], py + by[::-1],
                    color=st['pos'], alpha=0.14, lw=0, zorder=2)
        else:
            for sign, col in ((1, st['pos']), (-1, st['neg'])):
                mask = [v * sign > 0 for v in vals]
                if not any(mask):
                    continue
                fx = [px[i] if mask[i] else bx[i] for i in range(len(px))]
                fy = [py[i] if mask[i] else by[i] for i in range(len(py))]
                ax.fill(fx + bx[::-1], fy + by[::-1],
                        color=col, alpha=0.16, lw=0, zorder=2)

        # Ordinatstreger med fast afstand i meter, ikke pr. stikprøve — ellers
        # bliver et opdelt led fire gange så tæt stribet som et udelt
        n_tick = max(int(L / tick_step), 1)
        for i in range(n_tick + 1):
            x = L * i / n_tick
            v = _ordinate(kind, ele_forces[el['id']], x, wy, wx,
                          (ele_segs or {}).get(el['id']), L)
            if abs(v) * fac < ref_size * 0.004:
                continue
            ax.plot([xi + ca * x, xi + ca * x + ox * v],
                    [yi + sa * x, yi + sa * x + oy * v],
                    color=st['line'], lw=0.45, alpha=0.42, zorder=2)

        ax.plot(px, py, color=st['line'], lw=1.5, zorder=5,
                solid_joinstyle='round')

    # ── Toppunkter ───────────────────────────────────────────────────────────
    # Ét tal pr. led *pr. fortegn*, ikke ét pr. element. Pr. element ville et
    # opdelt spær få fire etiketter oven i hinanden med næsten samme værdi; kun
    # ét pr. led ville derimod tabe feltmomentet i en ramme, hvor hjørnet er
    # størst — og feltmomentet er det, riglen skal eftervises for.
    per_member = {}
    for el, xi, yi, ca, sa, L, wy, wx, pts in curves:
        slot = per_member.setdefault(_member_key(el), {})
        for x, v in pts:
            side = 'pos' if v >= 0 else 'neg'
            cur = slot.get(side)
            if cur is None or abs(v) > abs(cur[0]):
                slot[side] = (v, xi + ca * x, yi + sa * x, -sa * flip, ca * flip)

    cands = [t for slot in per_member.values() for t in slot.values()]
    cands.sort(key=lambda t: -abs(t[0]))
    placed = []
    min_gap = ref_size * 0.055
    for v, x, y, ux_, uy_ in cands:
        # Under en tiendedel af det største: et tal der ikke bærer nogen
        # beslutning, men som godt kan dække et der gør
        if abs(v) < 0.1 * peak_abs or len(placed) >= MAX_PEAK_LABELS:
            continue
        tipx, tipy = x + ux_ * fac * v, y + uy_ * fac * v
        pad = ref_size * 0.026
        lx = tipx + ux_ * math.copysign(pad, v)
        ly = tipy + uy_ * math.copysign(pad, v)
        if any(math.hypot(lx - px, ly - py) < min_gap for px, py in placed):
            continue
        placed.append((lx, ly))
        # M og V aflæses med fortegn efter elementets lokale akser, og det
        # samme hjørnemoment ville så stå som +9,23 på søjlen og −9,23 på
        # riglen. Tallet skrives numerisk; hvilken side kurven ligger på er
        # den oplysning fortegnet skulle bære, og den er entydig.
        txt = _nice(v if kind == 'N' else abs(v), st['unit'])
        ax.plot([tipx], [tipy], 'o', ms=3.2, color=st['line'], zorder=6)
        ax.text(lx, ly, txt, fontsize=8.5, color=st['line'], fontweight='bold',
                ha='center', va='center', zorder=7,
                bbox=dict(fc='white', ec='none', alpha=0.85, pad=1.2))
        xs.append(lx); ys.append(ly)

    hint = {'M': ' · tegnet på trækside',
            'V': '',
            'N': ' · + træk / − tryk'}[kind]
    scale_note = '' if abs(scale - 1.0) < 1e-9 else f' · ordinat ×{_dk(scale, 1)}'
    return _finish(fig, ax, xs, ys,
                   f'{st["title"]}  [{st["unit"]}]',
                   f'max {_nice(peak_abs, st["unit"])}{hint}{scale_note}')


# ── Deformeret form ───────────────────────────────────────────────────────────

def deformed_figure(nodes, elements, supports, node_disps, ref_size, scale=1.0):
    """
    Den deformerede konstruktion, tegnet med kubiske formfunktioner.

    Knudeflytningerne alene giver en polygon; med knudedrejningerne bliver det
    den bøjningslinje elementet faktisk har. Et led med charnier får sin
    kordehældning i stedet for knudens drejning, så et charnier ser ud som et
    charnier og ikke som en glat kurve.
    """
    dict_nodes = {n['id']: n for n in nodes}

    dmax = 0.0
    for d in node_disps.values():
        dmax = max(dmax, math.hypot(float(d[0]), float(d[1])))
    fac = (ref_size * 0.10 / dmax * scale) if dmax > 1e-12 else 0.0

    fig, ax = plt.subplots()
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    _draw_structure(ax, elements, dict_nodes, C_STRUCT_L, lw=1.4, zorder=2)
    _draw_supports(ax, supports, dict_nodes, ref_size * 0.05)

    xs = [float(n['x']) for n in nodes]
    ys = [float(n['y']) for n in nodes]

    for el in elements:
        xi, yi, xj, yj, L, ca, sa = _geom(el, dict_nodes)
        di = node_disps.get(el['ni'], (0.0, 0.0, 0.0))
        dj = node_disps.get(el['nj'], (0.0, 0.0, 0.0))

        # Global → lokal
        ui = ca * float(di[0]) + sa * float(di[1])
        vi = -sa * float(di[0]) + ca * float(di[1])
        uj = ca * float(dj[0]) + sa * float(dj[1])
        vj = -sa * float(dj[0]) + ca * float(dj[1])
        ti = float(di[2]) if len(di) > 2 else 0.0
        tj = float(dj[2]) if len(dj) > 2 else 0.0

        rel = el.get('release', 'none')
        if el.get('type', 'beam') == 'truss' or rel == 'both':
            ti = tj = (vj - vi) / L
        elif rel == 'start':
            ti = (vj - vi) / L
        elif rel == 'end':
            tj = (vj - vi) / L

        pts = []
        for i in range(21):
            s = i / 20.0
            h1 = 1 - 3*s*s + 2*s**3
            h2 = L * (s - 2*s*s + s**3)
            h3 = 3*s*s - 2*s**3
            h4 = L * (-s*s + s**3)
            v = h1*vi + h2*ti + h3*vj + h4*tj
            u = (1 - s) * ui + s * uj
            x = xi + ca * (L * s) + (ca * u - sa * v) * fac
            y = yi + sa * (L * s) + (sa * u + ca * v) * fac
            pts.append((x, y))
        xs += [p[0] for p in pts]; ys += [p[1] for p in pts]
        ax.plot([p[0] for p in pts], [p[1] for p in pts],
                color='#E74825', lw=2.0, zorder=5, solid_capstyle='round')

    # Den største flytning er det tal figuren er lavet for at vise
    worst_id, worst = None, 0.0
    for nid, d in node_disps.items():
        m = math.hypot(float(d[0]), float(d[1]))
        if m > worst:
            worst_id, worst = nid, m
    if worst_id is not None and worst > 1e-12 and worst_id in dict_nodes:
        n = dict_nodes[worst_id]
        d = node_disps[worst_id]
        x = float(n['x']) + float(d[0]) * fac
        y = float(n['y']) + float(d[1]) * fac
        ax.plot([x], [y], 'o', ms=3.6, color='#E74825', zorder=6)
        lbl = f'{_dk(worst * 1000, 1)} mm'
        ax.text(x, y - ref_size * 0.03, lbl, fontsize=8.5, fontweight='bold',
                color='#E74825', ha='center', va='top', zorder=7,
                bbox=dict(fc='white', ec='none', alpha=0.85, pad=1.2))
        xs.append(x); ys.append(y - ref_size * 0.05)

    mag = f' · {_dk(fac, 0)}× forstørret' if fac >= 1 else ''
    return _finish(fig, ax, xs, ys, 'Deformation  [mm]',
                   f'max {_dk(worst * 1000, 1)} mm{mag}')


# ── Samlet ────────────────────────────────────────────────────────────────────

FIGURE_KINDS = ('defo', 'M', 'V', 'N')


def render_all(nodes, elements, supports, ele_forces, ele_udl, node_disps,
               ref_size, scale=1.0, defo_scale=None, ele_segs=None):
    """
    Deformeret form, M, V og N i den rækkefølge frontend og PDF forventer.
    Returnerer en liste af base64-PNG'er.
    """
    # Altid fire, altid i samme rækkefølge. En model helt uden bjælkeelementer
    # får en flad M- og V-kurve, og det er sandt; springer man dem over i
    # stedet, skrider figurteksterne i rapporten et trin — hvilket de gjorde,
    # så momentkurven stod med teksten "Deformeret form".
    out = [deformed_figure(nodes, elements, supports, node_disps, ref_size,
                           defo_scale if defo_scale is not None else scale)]
    for kind in ('M', 'V', 'N'):
        out.append(section_force_figure(kind, nodes, elements, supports,
                                        ele_forces, ele_udl, ref_size, scale,
                                        ele_segs=ele_segs))
    return out


# ── Flere lastkombinationer i ét plot ─────────────────────────────────────────

# Farver til serierne. Valgt saa de kan skelnes paa hvidt papir og i graatone
# -- en rapport bliver printet -- og saa de ikke ligner STYLE-farverne for M, V
# og N, som betyder noget andet.
# Ordinaten i et overlay. Lavere end den enkelte figurs ORDINATE_FRAC, fordi
# flere kurver ud fra den samme stav skal kunne vaere der uden at naa ind i
# nabofagene.
OVERLAY_ORDINATE_FRAC = 0.115

SERIE_FARVER = [
    '#1F4E79', '#C2410C', '#0E7C66', '#7C3AED',
    '#B45309', '#BE185D', '#0369A1', '#4D7C0F',
]


def overlay_skala(kind, drawn, dict_nodes, serier, ref_size, scale=1.0):
    """
    Kurverne for alle serier, og den FAELLES ordinatfaktor.

    Trukket ud af tegnefunktionen, fordi det er her sammenligningen staar og
    falder, og fordi et tal kan proeves af, hvor en PNG ikke kan. Faktoren
    kommer af det stoerste maksimum blandt SAMTLIGE serier -- ikke af hver
    series eget. Skalerede hver for sig ville to kombinationer, hvor den ene er
    dobbelt saa stor som den anden, blive tegnet lige store, og figuren ville
    svare paa noget andet end det, den bliver brugt til.

    Returnerer (alle, peak_abs, serie_peak, fac), hvor alle er
    [(serie_idx, el, xi, yi, ca, sa, L, pts)].
    """
    alle = []
    peak_abs = 0.0
    serie_peak = []
    for si, s in enumerate(serier):
        sp = 0.0
        for el in drawn:
            ef = s['ele_forces'].get(el['id'])
            if ef is None:
                continue
            xi, yi, xj, yj, L, ca, sa = _geom(el, dict_nodes)
            wy, wx = (s.get('ele_udl') or {}).get(el['id'], (0.0, 0.0))
            pts = _sample(kind, el, ef, wy, wx, L,
                          segs=(s.get('ele_segs') or {}).get(el['id']))
            alle.append((si, el, xi, yi, ca, sa, L, pts))
            sp = max(sp, max(abs(v) for _, v in pts))
        serie_peak.append(sp)
        peak_abs = max(peak_abs, sp)

    ord_ref = _ordinate_reference(drawn, dict_nodes, ref_size)
    # Lavere end den enkelte figurs 0,16. Med fire kurver ud fra samme stav
    # naar den yderste lige saa langt ud som én kurve gjorde, og saa stoeder
    # soejlernes kurver ind i riglens. Det er ikke en skoenhedsfejl: to
    # kurvesaet, der overlapper hinanden, kan ikke laeses hver for sig.
    fac = (ord_ref * OVERLAY_ORDINATE_FRAC / peak_abs * scale)         if peak_abs > 1e-9 else 0.0
    return alle, peak_abs, serie_peak, fac


def section_force_overlay(kind, nodes, elements, supports, serier, ref_size,
                          scale=1.0):
    """
    Tegn den samme snitkraft for flere lastkombinationer i ét plot.

    serier : liste af {'navn': str, 'ele_forces': dict, 'ele_udl': dict}

    Hvorfor en funktion for sig og ikke et flag paa section_force_figure:
    den enkelte kurve tegnes med udfyldning mellem stangen og kurven, med
    ordinatstreger og med toppunkter sat paa. Alt tre er rigtigt for én kurve
    og ulaeseligt for seks -- udfyldningen bliver groed ved alpha 0,16 gange
    seks, og stregerne staar saa taet, at kurverne forsvinder i dem. Her
    tegnes streger og en signaturforklaring, og ingenting andet.

    DET VIGTIGE: ordinatskalaen findes paa tvaers af ALLE serier. Skalerede
    hver for sig ville kurverne blive lige store paa papiret, og saa kan man
    ikke se, hvilken kombination der er den vaerste -- hvilket er det eneste,
    man laegger dem oven paa hinanden for at finde ud af.
    """
    st = STYLE[kind]
    dict_nodes = {n['id']: n for n in nodes}

    if not serier:
        raise ValueError("section_force_overlay kaldt uden serier")

    # Elementerne er de samme i alle serier -- det er den samme model regnet
    # med forskellige laster -- men vi tager unionen, saa en serie, der mangler
    # et element, ikke tavst fjerner det for de andre.
    har = set()
    for s in serier:
        har |= set(s['ele_forces'])
    drawn = [el for el in elements
             if el['id'] in har and (kind == 'N'
                                     or el.get('type', 'beam') == 'beam')]
    if not drawn:
        drawn = [el for el in elements if el['id'] in har]

    alle, peak_abs, serie_peak, fac = overlay_skala(
        kind, drawn, dict_nodes, serier, ref_size, scale)

    fig, ax = plt.subplots()
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    xs = [float(n['x']) for n in nodes]
    ys = [float(n['y']) for n in nodes]

    _draw_structure(ax, elements, dict_nodes, C_STRUCT, lw=2.0, zorder=4)
    _draw_supports(ax, supports, dict_nodes, ref_size * 0.05)

    # Momentet paa traekside, som i den enkelte figur.
    flip = -1.0 if kind == 'M' else 1.0

    # Den dimensionerende serie tegnes med en svag udfyldning mellem stav og
    # kurve. Uden noget udfyldt er der ingenting, der binder en kurve til sin
    # stav: en kurve, der krydser sin egen stav, ligner bare to streger der
    # krydser. Kun ÉN faar den -- fire udfyldninger oven i hinanden er den
    # groed, overlayet skulle undgaa -- og det er den dimensionerende, fordi
    # det er den, resten sammenlignes med.
    vaerst_idx = serie_peak.index(peak_abs) if peak_abs > 0 else -1

    for si, el, xi, yi, ca, sa, L, pts in alle:
        farve = SERIE_FARVER[si % len(SERIE_FARVER)]
        ox, oy = -sa * fac * flip, ca * fac * flip
        px = [xi + ca * x + ox * v for x, v in pts]
        py = [yi + sa * x + oy * v for x, v in pts]
        bx = [xi + ca * x for x, _ in pts]
        by = [yi + sa * x for x, _ in pts]
        xs += px; ys += py

        if si == vaerst_idx and max(abs(v) for _, v in pts) > 5e-3 * peak_abs:
            ax.fill(px + bx[::-1], py + by[::-1],
                    color=farve, alpha=0.11, lw=0, zorder=2)

        ax.plot(px, py, color=farve,
                lw=1.7 if si == vaerst_idx else 1.15,
                zorder=6 if si == vaerst_idx else 5,
                solid_joinstyle='round',
                alpha=1.0 if si == vaerst_idx else 0.82)

    # ── Signaturforklaring ──────────────────────────────────────────────────
    # Hver serie faar sit eget maksimum med. Uden det skal man gaette sig til,
    # hvilken kurve der er stoerst, ud fra hvor langt den stikker ud -- og det
    # er praecis den aflaesning, tallet kan goere overfloedig.
    # Forklaringen ligger UNDER tegningen, ikke i et hjoerne af den. "loc=best"
    # lagde den oven paa taget -- den daekkede den konstruktion, kurverne
    # handler om. Der er ingen ledig plads inde i en rammefigur; ordinaterne
    # peger udad til alle sider.
    haandtag = [
        Line2D([0], [0],
               color=SERIE_FARVER[i % len(SERIE_FARVER)],
               lw=2.6 if i == vaerst_idx else 1.6,
               label='%s%s   %s' % ('▸ ' if i == vaerst_idx else '   ',
                                    s['navn'],
                                    _nice(serie_peak[i], st['unit'])))
        for i, s in enumerate(serier)
    ]
    leg = ax.legend(handles=haandtag, fontsize=8.5, frameon=False,
                    loc='upper center', bbox_to_anchor=(0.5, -0.02),
                    ncol=2 if len(serier) > 3 else 1,
                    handlelength=2.2, columnspacing=2.4, labelspacing=0.45)
    leg.set_zorder(10)

    hint = {'M': ' · tegnet på trækside',
            'V': '',
            'N': ' · + træk / − tryk'}[kind]
    scale_note = '' if abs(scale - 1.0) < 1e-9 else f' · ordinat ×{_dk(scale, 1)}'
    # Hvilken kombination der ejer maksimum staar i overskriften. Det er det
    # foerste, man vil vide, og signaturforklaringen kraever, at man
    # sammenligner otte tal for at finde det samme svar.
    vaerst = serier[serie_peak.index(peak_abs)]['navn'] if peak_abs > 0 else '—'
    return _finish(fig, ax, xs, ys,
                   f'{st["title"]}  [{st["unit"]}]  ·  {len(serier)} kombinationer',
                   f'max {_nice(peak_abs, st["unit"])} i {vaerst}'
                   f'{hint}{scale_note}')


def render_overlay(nodes, elements, supports, serier, ref_size, scale=1.0):
    """
    M, V og N for alle kombinationer, i den raekkefoelge rapporten forventer.

    Ingen deformeret form: den tegnes af den flyttede geometri og ikke af en
    kurve langs staven, saa seks af dem oven i hinanden er en tegning af noget
    andet end en sammenligning.
    """
    return [section_force_overlay(kind, nodes, elements, supports, serier,
                                  ref_size, scale)
            for kind in ('M', 'V', 'N')]


# ── Udnyttelse langs stangen ─────────────────────────────────────────────────

C_ETA_OK    = '#0E7C66'    # under 1,0
C_ETA_OVER  = '#DC2626'    # over 1,0 — eftervisningen holder ikke


def udnyttelse_figur(nodes, elements, supports, ele_forces, ele_segs,
                     kapaciteter, ref_size, art='boejning', scale=1.0):
    """
    Tegn udnyttelsesgraden langs hver stang.

    kapaciteter : {elem_id: kapacitetsdict fra udnyttelse.kapaciteter}
                  Elementer uden en kapacitet springes over -- et element uden
                  tvaersnit har ingen udnyttelse, og en kurve paa nul ville
                  ligne en stang, der ikke er belastet.
    art         : 'boejning' | 'forskydning'

    Ordinaten er dimensionsloes, saa skalaen er fast: 1,0 fylder altid det
    samme. Dermed kan to figurer sammenlignes med oejet, og en stang, der er
    over, ser ud som om den er over -- hvor en automatisk skala ville faa 0,3
    og 1,3 til at se lige store ud.

    Kurven skifter farve ved 1,0. Det er den ene graense, der betyder noget, og
    en roed strimmel er lettere at faa oeje paa end et tal i en tabel.
    """
    import udnyttelse as _u

    dict_nodes = {n['id']: n for n in nodes}
    idx = 1 if art == 'boejning' else 2
    navn = 'Bøjning' if art == 'boejning' else 'Forskydning'

    drawn = [el for el in elements
             if el['id'] in ele_forces and el['id'] in kapaciteter
             and el.get('type', 'beam') == 'beam']

    fig, ax = plt.subplots()
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')
    xs = [float(n['x']) for n in nodes]
    ys = [float(n['y']) for n in nodes]

    _draw_structure(ax, elements, dict_nodes, C_STRUCT, lw=2.0, zorder=4)
    _draw_supports(ax, supports, dict_nodes, ref_size * 0.05)

    if not drawn:
        return _finish(fig, ax, xs, ys, f'η — {navn}',
                       'ingen stænger med tværsnit')

    # Ordinaten er fast, saa laenge udnyttelsen er i naerheden af 1,0: dér
    # betyder sammenligneligheden noget, og to figurer kan holdes op mod
    # hinanden. Er en stang langt over, ville den faste skala sende kurven ud
    # af figuren og ind over nabofagene -- saa skaleres der ned, og
    # overskriften siger det.
    ord_ref = _ordinate_reference(drawn, dict_nodes, ref_size)
    _toppe = []
    for el in drawn:
        _, _, _, _, _L, _, _ = _geom(el, dict_nodes)
        _sy, _sx = ele_segs.get(el['id'], ([], []))
        _k = _u.eta_langs_stang(ele_forces[el['id']], _L, _sy, _sx,
                                kapaciteter[el['id']])
        _toppe.append(max([t[idx] for t in _k], default=0.0))
    _top = max(_toppe, default=0.0)
    GRAENSE = 1.5
    _presset = _top > GRAENSE
    fac = ord_ref * OVERLAY_ORDINATE_FRAC * scale / (_top if _presset else 1.0)

    peak = 0.0
    peak_el = None
    for el in drawn:
        eid = el['id']
        xi, yi, xj, yj, L, ca, sa = _geom(el, dict_nodes)
        segs_y, segs_x = ele_segs.get(eid, ([], []))
        kurve = _u.eta_langs_stang(ele_forces[eid], L, segs_y, segs_x,
                                   kapaciteter[eid])
        ox, oy = -sa * fac, ca * fac

        px = [xi + ca * k[0] + ox * k[idx] for k in kurve]
        py = [yi + sa * k[0] + oy * k[idx] for k in kurve]
        bx = [xi + ca * k[0] for k in kurve]
        by = [yi + sa * k[0] for k in kurve]
        xs += px; ys += py

        vals = [k[idx] for k in kurve]
        e_max = max(vals) if vals else 0.0
        if e_max > peak:
            peak, peak_el = e_max, eid

        ax.fill(px + bx[::-1], py + by[::-1],
                color=C_ETA_OK if e_max <= 1.0 else C_ETA_OVER,
                alpha=0.13, lw=0, zorder=2)

        # Kurven tegnes i stykker, saa den del der er over 1,0 er roed.
        for i in range(len(kurve) - 1):
            over = vals[i] > 1.0 or vals[i + 1] > 1.0
            ax.plot(px[i:i + 2], py[i:i + 2],
                    color=C_ETA_OVER if over else C_ETA_OK,
                    lw=1.9 if over else 1.5, zorder=6 if over else 5,
                    solid_joinstyle='round')

        # Stiplet linje ved 1,0, saa graensen kan ses og ikke kun beregnes.
        gx = [xi + ca * k[0] + ox * 1.0 for k in (kurve[0], kurve[-1])]
        gy = [yi + sa * k[0] + oy * 1.0 for k in (kurve[0], kurve[-1])]
        ax.plot(gx, gy, color=C_ETA_OVER, lw=0.7, ls=(0, (4, 3)),
                alpha=0.55, zorder=3)

        if e_max > 0.05:
            j = vals.index(e_max)
            tipx = xi + ca * kurve[j][0] + ox * e_max
            tipy = yi + sa * kurve[j][0] + oy * e_max
            pad = ref_size * 0.028
            lx, ly = tipx - sa * pad, tipy + ca * pad
            ax.text(lx, ly, _dk(e_max, 2), fontsize=8.5, fontweight='bold',
                    color=C_ETA_OK if e_max <= 1.0 else C_ETA_OVER,
                    ha='center', va='center', zorder=7,
                    bbox=dict(fc='white', ec='none', alpha=0.85, pad=1.2))
            xs.append(lx); ys.append(ly)

    hoejre = (f'max η = {_dk(peak, 2)} i element {peak_el}'
              + ('  ·  HOLDER IKKE' if peak > 1.0 else '')
              + ('  ·  ordinat nedskaleret' if _presset else ''))
    return _finish(fig, ax, xs, ys, f'η — {navn}', hoejre)
