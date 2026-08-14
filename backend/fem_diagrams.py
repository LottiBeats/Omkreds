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
FIG_WIDTH_IN     = 9.0      # smallere end opsvis' 13" — figuren skal ind i A4
FIG_H_MIN        = 2.6
FIG_H_MAX        = 7.0
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

def _ordinate(kind, pl, x, wy, wx):
    """
    N, V eller M i afstanden x fra ende i.

    Samme udtryk som section_force_2d() i general_frame_fem — gentaget her, og
    ikke importeret, ville være to sandheder. Det importeres.
    """
    from general_frame_fem import section_forces_2d
    N, V, M = section_forces_2d(pl, x, wy, wx)
    return {'N': N, 'V': V, 'M': M}[kind]


def _sample(kind, el, pl, wy, wx, L, n=SAMPLES_PER_ELEM):
    """(x, værdi) langs ét element."""
    if el.get('type', 'beam') == 'truss':
        # En trussstang har kun normalkraft, og den er konstant.
        v = -pl[0] if kind == 'N' else 0.0
        return [(0.0, v), (L, v)]
    xs = [L * i / (n - 1) for i in range(n)]
    return [(x, _ordinate(kind, pl, x, wy, wx)) for x in xs]


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
                         ref_size, scale=1.0):
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
        pts = _sample(kind, el, ele_forces[el['id']], wy, wx, L)
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
            v = _ordinate(kind, ele_forces[el['id']], x, wy, wx)
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
               ref_size, scale=1.0, defo_scale=None):
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
                                        ele_forces, ele_udl, ref_size, scale))
    return out
