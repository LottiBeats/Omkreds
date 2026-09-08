"""
stanglaster.py — fordelte laster paa et stykke af en stang.

Hvorfor
-------
Resten af koden antog, at en linjelast er konstant over HELE elementet. Det
staar i section_forces_2d:

    V(x) = V_i + wy*x          lineaer forskydning = konstant last
    M(x) = -M_i + V_i*x + wy*x^2/2

og i ele_udl, der er ét talpar (wy, wx) pr. element. Den antagelse blev truffet
tidligt og delt af tre loesere, gentegningen og diagrammerne -- saa en last paa
det halve af en bjaelke, eller en trekantlast, kunne ikke skrives.

Her er den generelle form: en liste af afsnit, hvor lasten varierer lineaert.

    (w1, w2, a, b)   intensitet w1 ved x = a, w2 ved x = b, nul udenfor

Konstant over hele stangen er (w, w, 0, L) -- specialtilfaeldet, ikke reglen.
Trekantlast er (0, w, a, b). Delvis last er (w, w, a, b).

Fortegn og retning foelger OpenSees' eleLoad -beamUniform, praecis som det
enkelte talpar gjorde: lokal y, positiv i den retning section_forces_2d regner
med.

Hvordan
-------
Fastindspaendingskraefterne findes ved at integrere lasten mod bjaelkens
formfunktioner:

    f_eq = ∫ w(x) · [N1 N2 N3 N4] dx        (ekvivalente knudelaster)
    p_fast = -f_eq                          (fastindspaendingskraefter)

Det er den almindelige konsistente formulering. Den er ikke en tilnaermelse:
w er hoejst lineaer og N hoejst kubisk, saa produktet er hoejst 4. grad, og
3-punkts Gauss integrerer eksakt til og med 5. grad.

Grunden til at der integreres numerisk frem for at slaa lukkede former op pr.
lasttype er, at der saa kun er ÉT udtryk at have ret i. En tabel med et udtryk
for delvis konstant, et for trekant fra venstre, et for trekant fra hoejre og
et for trapez er fire steder at tage fejl -- og fejlen ville vaere et forkert
moment, ikke et sammenbrud.
"""
from __future__ import annotations

# 3-punkts Gauss-Legendre paa [-1, 1]. Eksakt til og med 5. grad.
_GAUSS = (
    (-0.7745966692414834, 0.5555555555555556),
    ( 0.0,                0.8888888888888888),
    ( 0.7745966692414834, 0.5555555555555556),
)


def afsnit_fra_par(wy, wx, L):
    """
    Det gamle talpar (wy, wx) som afsnit over hele stangen.

    Findes for at alt, der stadig sender ét par, virker uaendret -- og for at
    der kun er én vej gennem regnestykket.
    """
    return ([(float(wy), float(wy), 0.0, float(L))] if wy else [],
            [(float(wx), float(wx), 0.0, float(L))] if wx else [])


def _klip(seg, L):
    """Afsnittet inden for [0, L], eller None."""
    w1, w2, a, b = seg
    a = max(0.0, float(a))
    b = min(float(L), float(b))
    if b - a <= 1e-12:
        return None
    # Er der klippet, skal intensiteterne i enderne foelge med.
    o_a, o_b = float(seg[2]), float(seg[3])
    if o_b - o_a <= 1e-12:
        return None
    def w_ved(x):
        t = (x - o_a) / (o_b - o_a)
        return w1 + (w2 - w1) * t
    return (w_ved(a), w_ved(b), a, b)


def _w(seg, x):
    """Intensiteten i x, nul uden for afsnittet."""
    w1, w2, a, b = seg
    if x < a - 1e-12 or x > b + 1e-12:
        return 0.0
    if b - a <= 1e-12:
        return 0.0
    return w1 + (w2 - w1) * (x - a) / (b - a)


def _integrer(seg, x0, x1, f):
    """∫ w(t)·f(t) dt over [x0, x1] med 3-punkts Gauss."""
    if x1 - x0 <= 1e-15:
        return 0.0
    m = 0.5 * (x0 + x1)
    h = 0.5 * (x1 - x0)
    s = 0.0
    for xi, wg in _GAUSS:
        t = m + h * xi
        s += wg * _w(seg, t) * f(t)
    return s * h


# ── Fastindspaendingskraefter ───────────────────────────────────────────────

def fastindspaending(segs_y, segs_x, L):
    """
    De seks fastindspaendingskraefter [N_i, V_i, M_i, N_j, V_j, M_j] i lokale
    akser, for lastafsnittene paa stangen.

    Samme fortegnskonvention som den tidligere _fastindspaending(wx, wy, L):
    for en konstant wy over hele stangen giver den

        [0, -wy*L/2, -wy*L^2/12, 0, -wy*L/2, +wy*L^2/12]
    """
    if L <= 0:
        raise ValueError('stanglaengden skal vaere positiv')

    # Hermites formfunktioner for [v_i, rz_i, v_j, rz_j].
    def N1(x):
        e = x / L
        return 1 - 3 * e * e + 2 * e ** 3

    def N2(x):
        e = x / L
        return L * (e - 2 * e * e + e ** 3)

    def N3(x):
        e = x / L
        return 3 * e * e - 2 * e ** 3

    def N4(x):
        e = x / L
        return L * (-e * e + e ** 3)

    fy = [0.0, 0.0, 0.0, 0.0]
    for seg in segs_y:
        s = _klip(seg, L)
        if s is None:
            continue
        _, _, a, b = s
        for k, N in enumerate((N1, N2, N3, N4)):
            fy[k] += _integrer(s, a, b, N)

    # Normalkraft: lineaere formfunktioner.
    fx = [0.0, 0.0]
    for seg in segs_x:
        s = _klip(seg, L)
        if s is None:
            continue
        _, _, a, b = s
        fx[0] += _integrer(s, a, b, lambda t: 1 - t / L)
        fx[1] += _integrer(s, a, b, lambda t: t / L)

    # p_fast = -f_eq
    return [-fx[0], -fy[0], -fy[1], -fx[1], -fy[2], -fy[3]]


# ── Snitkraefter ────────────────────────────────────────────────────────────

def snitkraefter(pl, x, segs_y, segs_x, L):
    """
    (N, V, M) i afstanden x fra i-enden.

        N(x) = -N_i - ∫₀ˣ wx dt
        V(x) =  V_i + ∫₀ˣ wy dt
        M(x) = -M_i + V_i·x + ∫₀ˣ (x-t)·wy dt

    Med konstant wy over hele stangen bliver integralerne wy·x og wy·x²/2, og
    udtrykket er praecis det, section_forces_2d altid har regnet.
    """
    N_i, V_i, M_i = pl[0], pl[1], pl[2]

    sum_y = 0.0
    mom_y = 0.0
    for seg in segs_y:
        s = _klip(seg, L)
        if s is None:
            continue
        _, _, a, b = s
        oe = min(x, b)
        if oe <= a:
            continue
        sum_y += _integrer(s, a, oe, lambda t: 1.0)
        mom_y += _integrer(s, a, oe, lambda t: (x - t))

    sum_x = 0.0
    for seg in segs_x:
        s = _klip(seg, L)
        if s is None:
            continue
        _, _, a, b = s
        oe = min(x, b)
        if oe > a:
            sum_x += _integrer(s, a, oe, lambda t: 1.0)

    return (-N_i - sum_x,
            V_i + sum_y,
            -M_i + V_i * x + mom_y)


def ekstremer(pl, L, segs_y, segs_x, n=40):
    """
    Stoerste N, V og M langs stangen, med fortegn og sted.

    Med konstant last er M kvadratisk, og stationaerpunktet kan findes eksakt.
    Med afsnit er kurven stykkevis polynomiel, og knaekpunkterne ligger ved
    afsnittenes ender. Der proeves derfor paa et gitter PLUS hver afsnitsende
    -- gitteret alene ville kunne springe over et maksimum, der ligger praecis
    hvor en dellast slutter, og det er netop dér, det ofte ligger.
    """
    steder = {0.0, float(L)}
    for seg in (list(segs_y) + list(segs_x)):
        s = _klip(seg, L)
        if s is None:
            continue
        steder.add(s[2])
        steder.add(s[3])
    for i in range(n + 1):
        steder.add(L * i / n)

    bedst = {'N_kN': 0.0, 'V_kN': 0.0, 'M_kNm': 0.0,
             'x_N_m': 0.0, 'x_V_m': 0.0, 'x_M_m': 0.0}
    for x in sorted(steder):
        N, V, M = snitkraefter(pl, x, segs_y, segs_x, L)
        if abs(N) > abs(bedst['N_kN']):
            bedst['N_kN'], bedst['x_N_m'] = N, x
        if abs(V) > abs(bedst['V_kN']):
            bedst['V_kN'], bedst['x_V_m'] = V, x
        if abs(M) > abs(bedst['M_kNm']):
            bedst['M_kNm'], bedst['x_M_m'] = M, x
    return bedst
