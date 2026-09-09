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


def _rødder_i(c2, c1, c0, laengde):
    """Rødder af c2·u² + c1·u + c0 i [0, laengde]."""
    ud = []
    if abs(c2) < 1e-14:
        if abs(c1) > 1e-14:
            ud.append(-c0 / c1)
    else:
        disk = c1 * c1 - 4 * c2 * c0
        if disk >= 0:
            r = disk ** 0.5
            ud += [(-c1 + r) / (2 * c2), (-c1 - r) / (2 * c2)]
    return [u for u in ud if -1e-12 <= u <= laengde + 1e-12]


def ekstremer(pl, L, segs_y, segs_x):
    """
    Stoerste N, V og M langs stangen, med fortegn og sted -- EKSAKT.

    Foerste udgave proevede paa et jaevnt gitter. Det var forkert nok til at
    blive fanget: paa en tilfaeldig ramme gav den M = -4,69602 hvor PyNite gav
    -4,69664. Toppunktet ligger sjaeldent paa et gitterpunkt.

    Med stykkevis lineaer last er V stykkevis kvadratisk og M stykkevis kubisk.
    Saa ligger kandidaterne praecis her, og der er ikke flere:

        M: hvor V = 0            (dM/dx = V)  -- roedder i et andengradspolynomium
        V: hvor w = 0            (dV/dx = w)  -- hvor en trapezlast skifter fortegn
        begge: afsnitsenderne og stangens to ender

    Det er samme fremgangsmaade som den gamle section_force_extremes, der loeste
    V_i + wy·x = 0 for den ene last, den kunne haandtere -- bare for et afsnit
    ad gangen.
    """
    V_i = pl[1]

    steder = {0.0, float(L)}
    for seg in (list(segs_y) + list(segs_x)):
        s = _klip(seg, L)
        if s is None:
            continue
        steder.add(s[2]); steder.add(s[3])

    # M's toppunkter: V(x) = 0 inden for hvert afsnit.
    for seg in segs_y:
        s = _klip(seg, L)
        if s is None:
            continue
        w1, w2, a, b = s
        # V(a) findes ved at integrere frem til afsnittets begyndelse.
        V_a = V_i
        for andet in segs_y:
            t = _klip(andet, L)
            if t is None:
                continue
            oe = min(a, t[3])
            if oe > t[2]:
                V_a += _integrer(t, t[2], oe, lambda _t: 1.0)
        c = (w2 - w1) / (b - a) if b > a else 0.0
        for u in _rødder_i(c / 2.0, w1, V_a, b - a):
            steder.add(a + u)
        # V's toppunkt: w(x) = 0, hvor en trapezlast skifter fortegn.
        if abs(w2 - w1) > 1e-14 and w1 * w2 < 0:
            steder.add(a + (b - a) * (-w1) / (w2 - w1))

    def _stoerre(ny, hidtil):
        """
        Med et slip, saa et uafgjort ikke afgoeres af afrunding.

        Samme regel som section_force_extremes, og af samme grund: en
        symmetrisk bjaelke med jaevnt fordelt last har V(0) = -V(L). De to
        ender er lige store, saa hvilken der vinder blev afgjort af den sidste
        bit -- og de har modsat fortegn. Den samme konstruktion kunne give
        -10 kN i ét dokument og +10 kN i det naeste.

        Reglen skal staa BEGGE steder. Stod den kun det ene, var de to veje
        gennem koden uenige om fortegnet paa praecis det tilfaelde, reglen blev
        skrevet for.
        """
        return abs(ny) > abs(hidtil) * (1.0 + 1e-9) + 1e-12

    bedst = {'N_kN': 0.0, 'V_kN': 0.0, 'M_kNm': 0.0,
             'x_N_m': 0.0, 'x_V_m': 0.0, 'x_M_m': 0.0}
    for x in sorted(v for v in steder if -1e-9 <= v <= L + 1e-9):
        x = min(max(x, 0.0), L)
        N, V, M = snitkraefter(pl, x, segs_y, segs_x, L)
        if _stoerre(N, bedst['N_kN']):
            bedst['N_kN'], bedst['x_N_m'] = N, x
        if _stoerre(V, bedst['V_kN']):
            bedst['V_kN'], bedst['x_V_m'] = V, x
        if _stoerre(M, bedst['M_kNm']):
            bedst['M_kNm'], bedst['x_M_m'] = M, x
    return bedst


def afsnit_af_last(wy_start, wy_slut, wx_start, wx_slut, x1, x2, L):
    """
    Ét lastafsnit ud af de vaerdier, en lastraekke baerer.

    x1, x2 er meter langs stangen fra i-enden. Er de None, daekker lasten hele
    stangen -- det er den gamle opfoersel, og den er stadig det almindelige.

    Vaerdierne er allerede projiceret til lokale akser og vendt til
    OpenSees-konventionen af kalderen; her laves der ingen mekanik, kun
    bogholderi over, hvor lasten begynder og slutter.
    """
    a = 0.0 if x1 is None else max(0.0, float(x1))
    b = float(L) if x2 is None else min(float(L), float(x2))
    if b - a <= 1e-9:
        return [], []
    segs_y = [(float(wy_start), float(wy_slut), a, b)] \
        if (wy_start or wy_slut) else []
    segs_x = [(float(wx_start), float(wx_slut), a, b)] \
        if (wx_start or wx_slut) else []
    return segs_y, segs_x


def er_fuld_og_konstant(segs_y, segs_x, L):
    """
    Er lasten den gamle slags -- konstant over hele stangen?

    Bruges til at afgoere, om ele_udl kan udfyldes med et talpar, der betyder
    det samme. Kan den ikke, maa den, der tegner, bruge afsnittene; et talpar
    ville tegne en ret linje, hvor der skal vaere et knaek.
    """
    for segs in (segs_y, segs_x):
        for w1, w2, a, b in segs:
            if abs(w1 - w2) > 1e-12:
                return False
            if abs(a) > 1e-9 or abs(b - L) > 1e-9:
                return False
    return True


def som_par(segs_y, segs_x):
    """(wy, wx) for laster, der ER fulde og konstante. Ellers (0, 0)."""
    wy = sum(w1 for w1, _, _, _ in segs_y)
    wx = sum(w1 for w1, _, _, _ in segs_x)
    return wy, wx
