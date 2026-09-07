"""
fem_pynite.py — samme rammeberegning som general_frame_fem.solve(), men med
PyNite i stedet for OpenSeesPy.

Hvorfor den findes
------------------
openseespy er en kompileret udvidelse, og den kan ikke importeres paa Windows:

    RuntimeError: DLL load failed while importing opensees

Det betyder, at de syv tests i test_general_frame_fem.py, som faktisk loeser en
model, aldrig koerer paa udviklingsmaskinen -- de springes over. FEM-blokken er
dermed det ene sted i projektet, hvor en aendring foerst kan afproeves ved at
deploye. Det er den samme opstilling, der lod `exports_ is not defined` slippe
igennem et groent byggeri og en groen testsuite.

PyNite er ren Python og importerer overalt. Den er ikke en erstatning, der er
besluttet -- den ligger ved siden af, saa de samme tests kan koere mod begge og
svarene sammenlignes, foer noget skiftes ud.

Hvad OpenSees faktisk bliver bedt om
------------------------------------
Optaelt paa kaldene i general_frame_fem.solve(): elasticBeamColumn med valgfri
momentudloesning, Truss med elastisk materiale, equalDOF, eleLoad -beamUniform,
og een Linear statisk analyse. Ingen geometrisk stivhed, ingen P-Delta, ingen
egenvaerdier -- ops.eigen() blev fjernet tidligere. Alt sammen ligger inden for
PyNites kerne.

Kontrakten
----------
Returvaerdien er den samme dict som general_frame_fem.solve(), med de samme
fortegn, saa alt nedenstroems -- section_force_extremes, compute_alpha_cr,
compute_buckling_lengths, fem_diagrams, summarise -- virker uaendret. Det er
hele pointen: kun selve loesningen skiftes ud, ikke de 1400 linjer omkring den.

Forskelle, der skal haandteres
------------------------------
1. PyNite er kun 3D. 2D laves ved at fastholde DZ, RX og RY i hver knude.
2. PyNite har ingen equalDOF. Se _kollaps_charnierer() -- den oversaetter, og
   naegter hellere end at gaette, naar oversaettelsen ikke er noejagtig.
3. Fortegnene er ikke de samme. _lokale_endekraefter() oversaetter, og
   oversaettelsen er bundet til den fordeling, section_forces_2d definerer --
   ikke laest ud af en manual.
"""
from __future__ import annotations

import math

from general_frame_fem import (
    ModelError,
    validate_model,
    check_results,
    section_force_extremes,
    _project_load,
)

try:
    from Pynite import FEModel3D
    _PYNITE_AVAILABLE = True
except Exception:                                    # pragma: no cover
    FEModel3D = None
    _PYNITE_AVAILABLE = False


# Kombinationsnavnet PyNite bruger, naar man ikke selv definerer et.
_COMBO = 'Combo 1'

# Tvaerkontraktion og vridningsinerti indgaar ikke i en plan rammes stivhed:
# de tre frihedsgrader ud af planen er fastholdt i hver knude, saa G og J roerer
# aldrig ligningerne. Vaerdierne er sat for at goere PyNite tilfreds.
_NU = 0.3
_J = 1.0


def _navn_knude(nid) -> str:
    return 'N%d' % int(nid)


def _navn_element(eid) -> str:
    return 'E%d' % int(eid)


# ---------------------------------------------------------------------------
# equalDOF -> PyNite
# ---------------------------------------------------------------------------

def _kollaps_charnierer(nodes, elements, equal_dofs):
    """
    Oversaet equalDOF-charnierer til een knude med momentudloesning.

    OpenSees-modellen laegger to knuder oven i hinanden og binder deres
    flytninger sammen, men ikke deres drejning:

        equalDOF(kip_venstre, kip_hoejre, [1, 2])

    Mekanisk er det det samme som een knude, hvor det ene element ikke kan
    overfoere moment. PyNite har ingen equalDOF, saa vi laver den omskrivning
    eksplicit: c_node forsvinder, dens element haenger nu i r_node, og den ende
    faar en Rz-udloesning.

    Omskrivningen er kun noejagtig, naar der sidder eet element i c_node. Sidder
    der to, deler de en drejning med hinanden, men ikke med r_node, og det kan
    en enkelt udloesning ikke gengive -- saa ville vi levere et andet baerende
    system end det, brugeren tegnede. Derfor naegter vi i stedet for at gaette.
    Det er samme holdning som validate_model: hellere et nej, man kan laese,
    end et tal, man ikke kan stole paa.

    Returnerer (nodes, elements, extra_releases), hvor extra_releases er en
    maengde af (elem_id, 'i'|'j'), der skal have Rz frigjort.
    """
    if not equal_dofs:
        return nodes, elements, set()

    elements = [dict(el) for el in elements]
    extra = set()
    fjernede = set()

    for eq in equal_dofs:
        r = int(eq['r_node'])
        c = int(eq['c_node'])
        dofs = sorted(int(d) for d in eq.get('dofs', [1, 2]))

        if dofs != [1, 2]:
            raise ModelError(
                "Charnieret mellem knude %d og %d binder frihedsgraderne %s. "
                "PyNite-loeseren kan kun oversaette et charnier, der binder "
                "flytningerne (1 og 2) og lader drejningen vaere fri."
                % (r, c, dofs))

        i_c = [el for el in elements if int(el['ni']) == c or int(el['nj']) == c]
        if len(i_c) != 1:
            raise ModelError(
                "Der sidder %d elementer i knude %d, som er charnieret til "
                "knude %d. PyNite-loeseren kan kun oversaette et charnier med "
                "eet element, fordi to elementer i samme knude deler en drejning "
                "med hinanden -- det kan en enkelt momentudloesning ikke gengive."
                % (len(i_c), c, r))

        el = i_c[0]
        if int(el['ni']) == c:
            el['ni'] = r
            extra.add((el['id'], 'i'))
        else:
            el['nj'] = r
            extra.add((el['id'], 'j'))
        fjernede.add(c)

    nodes = [n for n in nodes if int(n['id']) not in fjernede]
    return nodes, elements, extra


# ---------------------------------------------------------------------------
# Fortegn
# ---------------------------------------------------------------------------

def _lokale_endekraefter(mem, L, wy, wx):
    """
    De seks lokale endekraefter [N_i, V_i, M_i, N_j, V_j, M_j] i OpenSees'
    forstand, udledt af PyNites snitkraefter.

    general_frame_fem.section_forces_2d definerer, hvad de seks tal betyder:

        N(x) = -N_i - wx*x
        V(x) =  V_i + wy*x
        M(x) = -M_i + V_i*x + wy*x^2/2

    Vi vender relationerne om og laeser N(0), V(0) og M(0) hos PyNite. Saa er
    de seks tal pr. definition dem, der giver den rigtige fordeling langs
    elementet -- og dermed virker section_force_extremes og diagrammerne
    uaendret.

    j-enden foelger af ligevaegt frem for af en ny aflaesning: saa kan de to
    ender ikke komme til at beskrive hver sin bjaelke.

    Fortegnene er maalt, ikke laest:

      shear('Fy')   samme stoerrelse som V ovenfor.
      moment('Mz')  modsat. Paa en to-elements bjaelke med w = 10 kN/m over 6 m
                    gav PyNite M(3) = -45 kNm, hvor section_forces_2d skal have
                    +45; uden det fortegn kom momentet i det andet element ud
                    som 90 kNm, praecis det dobbelte.
      axial()       modsat. PyNite regner tryk positivt, mens N_kN her skal
                    vaere positiv i traek -- det er den konvention,
                    pdf_builder skriver "traek" og "tryk" ud fra. Med det
                    forkerte fortegn kom en soejle med 120 kN nedad ud som
                    +120 kN traek. Ingen af de eksisterende tests fangede det,
                    fordi de alle sammenligner med abs(); se
                    test_axial_sign_says_compression_not_tension.
    """
    N0 = mem.axial(0.0, _COMBO)
    V0 = mem.shear('Fy', 0.0, _COMBO)
    M0 = mem.moment('Mz', 0.0, _COMBO)

    N_i = N0
    V_i = V0
    M_i = M0

    # x = L, samme relationer
    N_L = -N_i - wx * L
    V_L = V_i + wy * L
    M_L = -M_i + V_i * L + 0.5 * wy * L * L

    return [N_i, V_i, M_i, -N_L, -V_L, M_L]


# ---------------------------------------------------------------------------
# Loeseren
# ---------------------------------------------------------------------------

def solve(nodes, elements, supports, loads, equal_dofs=None):
    """
    Byg og loes en plan, lineaer elastisk ramme med PyNite.

    Samme parametre og samme returvaerdi som general_frame_fem.solve().
    """
    if not _PYNITE_AVAILABLE:
        raise ImportError("PyNite er paakraevet. pip install PyNiteFEA")

    # Samme afvisning af ubrugelige modeller som OpenSees-vejen, og paa den
    # oprindelige model -- foer charniererne skrives om, saa fejlbeskederne
    # taler om de knuder, brugeren selv har tegnet.
    validate_model(nodes, elements, supports, loads, equal_dofs)

    org_nodes = nodes
    nodes, elements, extra_rel = _kollaps_charnierer(nodes, elements, equal_dofs)

    dict_nodes = {int(n['id']): n for n in nodes}
    m = FEModel3D()

    for n in nodes:
        m.add_node(_navn_knude(n['id']), float(n['x']), float(n['y']), 0.0)

    # Understoetninger. De tre frihedsgrader ud af planen -- DZ, RX, RY -- er
    # fastholdt i hver eneste knude; det er det, der goer den 3D-loeser plan.
    sup = {int(s['node_id']): s for s in supports}
    for n in nodes:
        nid = int(n['id'])
        s = sup.get(nid, {})
        m.def_support(_navn_knude(nid),
                      bool(s.get('ux')), bool(s.get('uy')), True,
                      True, True, bool(s.get('rz')))

    # Elementer. Eet materiale og eet tvaersnit pr. element: de er ikke delt i
    # modellen, og at give hver sit navn er billigere end at slaa ens vaerdier
    # sammen.
    for el in elements:
        eid = el['id']
        E = float(el.get('E_GPa', 210.0)) * 1e6      # GPa  -> kN/m2
        A = float(el.get('A_cm2', 50.0)) * 1e-4      # cm2  -> m2
        Iz = float(el.get('Iz_cm4', 5000.0)) * 1e-8  # cm4  -> m4
        G = E / (2.0 * (1.0 + _NU))

        mat = 'M%d' % eid
        sec = 'S%d' % eid
        m.add_material(mat, E, G, _NU, 78.5)
        m.add_section(sec, A, Iz, Iz, _J)            # Iy uden betydning i planen

        m.add_member(_navn_element(eid), _navn_knude(el['ni']),
                     _navn_knude(el['nj']), mat, sec)

        # Momentudloesninger. En gitterstang er en bjaelke uden momenter i
        # nogen af enderne -- det er det, OpenSees' Truss-element er her.
        rel = el.get('release', 'none')
        i_fri = (rel in ('start', 'both') or el.get('type') == 'truss'
                 or (eid, 'i') in extra_rel)
        j_fri = (rel in ('end', 'both') or el.get('type') == 'truss'
                 or (eid, 'j') in extra_rel)
        if i_fri or j_fri:
            m.def_releases(_navn_element(eid), Rzi=bool(i_fri), Rzj=bool(j_fri))

    # Laster
    ele_udl = {}
    for ld in (loads or []):
        if ld['type'] == 'nodal':
            for retning, noegle in (('FX', 'Fx_kN'), ('FY', 'Fy_kN'),
                                    ('MZ', 'Mz_kNm')):
                v = float(ld.get(noegle, 0.0))
                if v:
                    m.add_node_load(_navn_knude(ld['node_id']), retning, v)

        elif ld['type'] == 'udl':
            retning = ld.get('direction')
            if retning is not None:
                proj = _project_load(
                    {'load_type': 'udl', 'elem_id': ld['elem_id'],
                     'direction': retning,
                     'value_kNm': float(ld.get('value_kNm', 0.0))},
                    elements, dict_nodes,
                )
                if proj is None:
                    continue
                wy_ops = -float(proj['wy_kNm'])
                wx_ops = float(proj['wx_kNm'])
            else:
                wy_ops = -float(ld.get('wy_kNm', 0.0))
                wx_ops = float(ld.get('wx_kNm', 0.0))

            eid = ld['elem_id']
            el = next(e for e in elements if e['id'] == eid)
            ni, nj = dict_nodes[int(el['ni'])], dict_nodes[int(el['nj'])]
            dx = float(nj['x']) - float(ni['x'])
            dy = float(nj['y']) - float(ni['y'])
            L = math.hypot(dx, dy)
            if L < 1e-12:
                raise ModelError("Element %s har laengden nul." % eid)
            c, s = dx / L, dy / L

            # Lasten paasaettes i globale komposanter, saa PyNites egen
            # opfattelse af elementets lokale y-akse ikke behoever at stemme
            # med OpenSees'. Lokal x er (c, s) og lokal y er (-s, c).
            gx = wx_ops * c - wy_ops * s
            gy = wx_ops * s + wy_ops * c
            if gx:
                m.add_member_dist_load(_navn_element(eid), 'FX', gx, gx)
            if gy:
                m.add_member_dist_load(_navn_element(eid), 'FY', gy, gy)

            prev_y, prev_x = ele_udl.get(eid, (0.0, 0.0))
            ele_udl[eid] = (prev_y + wy_ops, prev_x + wx_ops)

    m.analyze_linear(check_statics=False, sparse=False)

    # Aflaesning
    node_disps = {}
    node_reactions = {}
    for n in nodes:
        nid = int(n['id'])
        nd = m.nodes[_navn_knude(nid)]
        node_disps[nid] = [nd.DX[_COMBO], nd.DY[_COMBO], nd.RZ[_COMBO]]
        node_reactions[nid] = [nd.RxnFX[_COMBO], nd.RxnFY[_COMBO],
                               nd.RxnMZ[_COMBO]]

    # Charnierknuderne blev skrevet vaek, men de staar stadig i brugerens model
    # og i alt hvad der laeser resultatet. De faar den knude, de er bundet til:
    # flytningerne er pr. definition ens, og drejningen er den eneste stoerrelse,
    # der ikke er det. Den er ikke defineret her, og et opdigtet tal ville vaere
    # vaerre end et nul, man kan se er et nul.
    for eq in (equal_dofs or []):
        r, c = int(eq['r_node']), int(eq['c_node'])
        if c not in node_disps and r in node_disps:
            node_disps[c] = [node_disps[r][0], node_disps[r][1], 0.0]
            node_reactions[c] = [0.0, 0.0, 0.0]

    ele_forces = {}
    ele_extremes = {}
    for el in elements:
        eid = el['id']
        ni, nj = dict_nodes[int(el['ni'])], dict_nodes[int(el['nj'])]
        L = math.hypot(float(nj['x']) - float(ni['x']),
                       float(nj['y']) - float(ni['y']))
        wy, wx = ele_udl.get(eid, (0.0, 0.0))

        mem = m.members[_navn_element(eid)]
        pl = _lokale_endekraefter(mem, L, wy, wx)

        if el.get('type', 'beam') == 'truss':
            N = pl[0]
            ele_forces[eid] = [N, 0.0, 0.0, -N, 0.0, 0.0]
            ele_extremes[eid] = {'N_kN': -N, 'V_kN': 0.0, 'M_kNm': 0.0,
                                 'x_N_m': 0.0, 'x_V_m': 0.0, 'x_M_m': 0.0}
        else:
            ele_forces[eid] = pl
            ele_extremes[eid] = section_force_extremes(pl, L, wy, wx)

    xs = [float(n['x']) for n in org_nodes]
    ys = [float(n['y']) for n in org_nodes]
    ref_size = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)
    check_results(org_nodes, node_disps, ele_forces, ref_size)

    return {
        'node_disps':     node_disps,
        'node_reactions': node_reactions,
        'ele_forces':     ele_forces,
        'ele_extremes':   ele_extremes,
        'ele_udl':        ele_udl,
    }
