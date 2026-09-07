"""
fem_direkte.py — den plane rammes stivhedsmatricer, regnet her.

Hvorfor den findes
------------------
general_frame_fem beder kun om lineaer elastisk 2D-statik: elasticBeamColumn med
momentudloesninger, gitterstaenger, equalDOF, jaevnt fordelt elementlast og een
statisk beregning. Ingen geometrisk stivhed, ingen P-Delta, ingen egenvaerdier.
Til det er baade OpenSees (17 MB kompileret C++, kan ikke importeres paa Windows)
og PyNite (ren Python, men 3D og traekker scipy paa 115 MB ind) langt stoerre
end opgaven.

Elementstivhedsmatricen for en plan Euler-Bernoulli-bjaelke er en lukket form.
Den bliver ikke rettet, den har ingen kanttilfaelde, og modellerne her er ~20
elementer -- numpy.linalg.solve paa 60 frihedsgrader er oejeblikkeligt.

Det afgoerende argument er dog et andet: hver gang en fremmed loesers
konventioner skal oversaettes til denne kodes, opstaar der fortegnsfejl. PyNite
gav to (moment('Mz') og N_j), og begge kunne kun findes ved at sammenligne med
OpenSees. Her er der ingen oversaettelse: matricerne skrives i praecis den
konvention, section_forces_2d allerede definerer.

Kontrakten
----------
Samme parametre og samme returvaerdi som general_frame_fem.solve(), saa alt
nedenstroems virker uaendret.

Konventionen
------------
Lokale frihedsgrader pr. element: [u_i, v_i, rz_i, u_j, v_j, rz_j], hvor lokal x
peger fra i mod j og lokal y er 90 grader mod uret derfra -- altsaa (-s, c) naar
lokal x er (c, s). Det er OpenSees' Linear-transformation.

De seks endekraefter, der returneres, er dem section_forces_2d laeser:

    N(x) = -N_i - wx*x
    V(x) =  V_i + wy*x
    M(x) = -M_i + V_i*x + wy*x^2/2

Den almindelige formulering -- p = k*d + p_fast -- rammer den konvention af sig
selv. Det er ikke et tilfaelde, men det er vaerd at vide: der er ikke justeret
et eneste fortegn i haanden for at faa testene til at passe.
"""
from __future__ import annotations

import math

import numpy as np

from general_frame_fem import (
    ModelError,
    validate_model,
    check_results,
    section_force_extremes,
    _project_load,
)


# Lokale frihedsgrader, der frigives ved en momentudloesning.
_UDLOESNING = {
    'none':  (),
    'start': (2,),
    'end':   (5,),
    'both':  (2, 5),
}


def _stivhed(E, A, I, L):
    """
    Elementets stivhedsmatrix i egne akser, 6x6.

    Traek/tryk og boejning er uafhaengige i en Euler-Bernoulli-bjaelke, saa de
    to bidrag staar hver for sig. Raekkefoelgen er [u_i, v_i, rz_i, u_j, v_j,
    rz_j].
    """
    k = np.zeros((6, 6))

    # Normalkraft
    ea = E * A / L
    k[0, 0] = k[3, 3] = ea
    k[0, 3] = k[3, 0] = -ea

    # Boejning
    ei = E * I
    k12 = 12.0 * ei / L**3
    k6 = 6.0 * ei / L**2
    k4 = 4.0 * ei / L
    k2 = 2.0 * ei / L

    k[1, 1] = k[4, 4] = k12
    k[1, 4] = k[4, 1] = -k12
    k[1, 2] = k[2, 1] = k6
    k[1, 5] = k[5, 1] = k6
    k[2, 4] = k[4, 2] = -k6
    k[4, 5] = k[5, 4] = -k6
    k[2, 2] = k[5, 5] = k4
    k[2, 5] = k[5, 2] = k2

    return k


def _fastindspaending(wx, wy, L):
    """
    Fastindspaendingskraefter for en jaevnt fordelt last i elementets egne akser.

    Det er de kraefter, understoetningerne skal yde for at holde elementet
    ubevaegeligt under lasten -- altsaa endekraefterne, naar begge ender staar
    stille. wx og wy er intensiteterne i lokal x og y, med samme fortegn som
    OpenSees' eleLoad -beamUniform.
    """
    return np.array([
        -wx * L / 2.0,
        -wy * L / 2.0,
        -wy * L * L / 12.0,
        -wx * L / 2.0,
        -wy * L / 2.0,
        +wy * L * L / 12.0,
    ])


def _kondenser(k, p_fast, frigivne):
    """
    Statisk kondensering af de frigivne frihedsgrader.

    En momentudloesning betyder, at elementet ikke kan optage moment i den ende.
    Frihedsgraden findes stadig, men dens kraft er nul, saa den kan elimineres:

        k* = k_bb - k_bf * k_ff^-1 * k_fb
        p* = p_b  - k_bf * k_ff^-1 * p_f

    hvor f er de frigivne og b resten. Bagefter nulstilles de frigivne raekker og
    soejler, saa den frigivne endes moment kommer ud som praecis nul i stedet for
    som et lille afrundet tal.

    En gitterstang er det samme med begge rotationer frigivet -- saa er der kun
    normalkraft tilbage, og det er netop, hvad OpenSees' Truss-element er her.
    """
    if not frigivne:
        return k, p_fast

    f = list(frigivne)
    b = [i for i in range(6) if i not in frigivne]

    k_ff = k[np.ix_(f, f)]
    if abs(np.linalg.det(k_ff)) < 1e-30:
        raise ModelError(
            "Et element har momentudloesning i begge ender og ingen boejning "
            "tilbage at kondensere. Det er en gitterstang -- angiv den som en.")

    k_bf = k[np.ix_(b, f)]
    k_fb = k[np.ix_(f, b)]
    loest = np.linalg.solve(k_ff, k_fb)

    k_ny = np.zeros((6, 6))
    k_ny[np.ix_(b, b)] = k[np.ix_(b, b)] - k_bf @ loest

    p_ny = np.zeros(6)
    p_ny[b] = p_fast[b] - k_bf @ np.linalg.solve(k_ff, p_fast[f])

    return k_ny, p_ny


def _transformation(c, s):
    """Fra lokale til globale akser. Lokal x er (c, s), lokal y er (-s, c)."""
    T = np.zeros((6, 6))
    for blok in (0, 3):
        T[blok + 0, blok + 0] = c
        T[blok + 0, blok + 1] = s
        T[blok + 1, blok + 0] = -s
        T[blok + 1, blok + 1] = c
        T[blok + 2, blok + 2] = 1.0
    return T


def _frihedsgradskort(nodes, equal_dofs):
    """
    Nummerér frihedsgraderne, og lad de bundne dele samme nummer.

    equalDOF binder to sammenfaldende knuders flytninger, men ikke deres
    drejning. Her loeses det, hvor det hoerer hjemme -- i nummereringen. To
    bundne frihedsgrader faar samme ligningsnummer og er dermed den samme
    ubekendte. Der er ingen straffestivhed og ingen ekstra ligning, saa der er
    heller ikke noget, der kan vaere naesten-bundet.
    """
    binding = {}
    for eq in (equal_dofs or []):
        r = int(eq['r_node'])
        c = int(eq['c_node'])
        for d in eq.get('dofs', [1, 2]):
            binding[(c, int(d) - 1)] = (r, int(d) - 1)

    def kanonisk(nid, k):
        set_ = set()
        while (nid, k) in binding:
            if (nid, k) in set_:
                raise ModelError(
                    "Charniererne binder knude %d til sig selv i en ring. "
                    "En af bindingerne skal fjernes." % nid)
            set_.add((nid, k))
            nid, k = binding[(nid, k)]
        return nid, k

    numre = {}
    n = 0
    for node in nodes:
        for k in range(3):
            noegle = kanonisk(int(node['id']), k)
            if noegle not in numre:
                numre[noegle] = n
                n += 1

    kort = {}
    for node in nodes:
        for k in range(3):
            kort[(int(node['id']), k)] = numre[kanonisk(int(node['id']), k)]

    return kort, n, kanonisk


def solve(nodes, elements, supports, loads, equal_dofs=None):
    """
    Byg og loes en plan, lineaer elastisk ramme.

    Samme parametre og samme returvaerdi som general_frame_fem.solve().
    """
    validate_model(nodes, elements, supports, loads, equal_dofs)

    dn = {int(node['id']): node for node in nodes}
    kort, n_dof, kanonisk = _frihedsgradskort(nodes, equal_dofs)

    # ── Laster ────────────────────────────────────────────────────────────────
    # Elementlasterne laegges til side i lokale akser, fordi de skal bruges to
    # gange: til fastindspaendingskraefterne nu, og til fordelingen langs
    # elementet bagefter.
    ele_udl = {}
    F = np.zeros(n_dof)

    for ld in (loads or []):
        if ld['type'] == 'nodal':
            nid = int(ld['node_id'])
            for k, noegle in enumerate(('Fx_kN', 'Fy_kN', 'Mz_kNm')):
                F[kort[(nid, k)]] += float(ld.get(noegle, 0.0))

        elif ld['type'] == 'udl':
            retning = ld.get('direction')
            if retning is not None:
                proj = _project_load(
                    {'load_type': 'udl', 'elem_id': ld['elem_id'],
                     'direction': retning,
                     'value_kNm': float(ld.get('value_kNm', 0.0))},
                    elements, dn,
                )
                if proj is None:
                    continue
                wy = -float(proj['wy_kNm'])
                wx = float(proj['wx_kNm'])
            else:
                wy = -float(ld.get('wy_kNm', 0.0))
                wx = float(ld.get('wx_kNm', 0.0))

            forrige_y, forrige_x = ele_udl.get(ld['elem_id'], (0.0, 0.0))
            ele_udl[ld['elem_id']] = (forrige_y + wy, forrige_x + wx)

    # ── Samling ───────────────────────────────────────────────────────────────
    K = np.zeros((n_dof, n_dof))
    ele_data = {}

    for el in elements:
        eid = el['id']
        ni, nj = dn[int(el['ni'])], dn[int(el['nj'])]
        dx = float(nj['x']) - float(ni['x'])
        dy = float(nj['y']) - float(ni['y'])
        L = math.hypot(dx, dy)
        if L < 1e-12:
            raise ModelError("Element %s har laengden nul." % eid)
        c, s = dx / L, dy / L

        E = float(el.get('E_GPa', 210.0)) * 1e6       # GPa  -> kN/m2
        A = float(el.get('A_cm2', 50.0)) * 1e-4       # cm2  -> m2
        I = float(el.get('Iz_cm4', 5000.0)) * 1e-8    # cm4  -> m4

        frigivne = set(_UDLOESNING.get(el.get('release', 'none'), ()))
        if el.get('type') == 'truss':
            frigivne = {2, 5}

        wy, wx = ele_udl.get(eid, (0.0, 0.0))
        k_lok = _stivhed(E, A, I, L)
        p_fast = _fastindspaending(wx, wy, L)
        k_lok, p_fast = _kondenser(k_lok, p_fast, frigivne)

        T = _transformation(c, s)
        k_glob = T.T @ k_lok @ T

        # Ligningsnumrene for elementets seks lokale frihedsgrader.
        idx = [kort[(int(el['ni']), 0)], kort[(int(el['ni']), 1)],
               kort[(int(el['ni']), 2)], kort[(int(el['nj']), 0)],
               kort[(int(el['nj']), 1)], kort[(int(el['nj']), 2)]]

        K[np.ix_(idx, idx)] += k_glob

        # Ekvivalente knudelaster: det modsatte af fastindspaendingskraefterne,
        # drejet til globale akser.
        F[idx] -= T.T @ p_fast

        ele_data[eid] = (idx, T, k_lok, p_fast, L, wy, wx)

    # ── Understoetninger ──────────────────────────────────────────────────────
    # Bundne frihedsgrader fjernes i stedet for at faa en stor stivhed paalagt.
    # En straffestivhed goer matricen daarligt konditioneret, og reaktionerne
    # bliver kun naesten rigtige; elimination giver dem eksakt.
    bundet = np.zeros(n_dof, dtype=bool)
    for sup in supports:
        nid = int(sup['node_id'])
        for k, noegle in enumerate(('ux', 'uy', 'rz')):
            if sup.get(noegle):
                bundet[kort[(nid, k)]] = True

    fri = ~bundet
    D = np.zeros(n_dof)

    if fri.any():
        K_ff = K[np.ix_(fri, fri)]
        # Modellen er allerede godkendt af validate_model, men den ser paa
        # topologien, ikke paa tallene. En ramme kan vaere afstivet af to
        # naesten parallelle staenger og dermed vaere naesten singulaer uden at
        # mangle noget.
        try:
            D[fri] = np.linalg.solve(K_ff, F[fri])
        except np.linalg.LinAlgError:
            raise ModelError(
                "Modellen kan ikke regnes: stivhedsmatricen er singulaer. "
                "Systemet er en mekanisme -- der mangler en understoetning "
                "eller et element.")

    # Reaktioner: R = K*D - F. Ved en fri frihedsgrad er den nul af sig selv,
    # for det er praecis den ligning, der lige er loest.
    R = K @ D - F

    node_disps = {}
    node_reactions = {}
    for node in nodes:
        nid = int(node['id'])
        i0, i1, i2 = kort[(nid, 0)], kort[(nid, 1)], kort[(nid, 2)]
        node_disps[nid] = [D[i0], D[i1], D[i2]]
        node_reactions[nid] = [
            R[i0] if bundet[i0] else 0.0,
            R[i1] if bundet[i1] else 0.0,
            R[i2] if bundet[i2] else 0.0,
        ]

    # ── Snitkraefter ──────────────────────────────────────────────────────────
    ele_forces = {}
    ele_extremes = {}
    for el in elements:
        eid = el['id']
        idx, T, k_lok, p_fast, L, wy, wx = ele_data[eid]
        d_lok = T @ D[idx]
        pl = list(k_lok @ d_lok + p_fast)

        if el.get('type', 'beam') == 'truss':
            N = pl[0]
            ele_forces[eid] = [N, 0.0, 0.0, -N, 0.0, 0.0]
            ele_extremes[eid] = {'N_kN': -N, 'V_kN': 0.0, 'M_kNm': 0.0,
                                 'x_N_m': 0.0, 'x_V_m': 0.0, 'x_M_m': 0.0}
        else:
            ele_forces[eid] = pl
            ele_extremes[eid] = section_force_extremes(pl, L, wy, wx)

    xs = [float(node['x']) for node in nodes]
    ys = [float(node['y']) for node in nodes]
    ref_size = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)
    check_results(nodes, node_disps, ele_forces, ref_size)

    return {
        'node_disps':     node_disps,
        'node_reactions': node_reactions,
        'ele_forces':     ele_forces,
        'ele_extremes':   ele_extremes,
        'ele_udl':        ele_udl,
    }
