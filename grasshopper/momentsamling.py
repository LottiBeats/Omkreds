"""Momentsamling med dorne – elastisk kraftfordeling, EC5-kontrol og plot.

Kører både som Grasshopper Python 3-komponent (Rhino 8) og lokalt:
    python momentsamling.py        (ret værdierne nederst i filen)

Samlingstyper:
  typ "A"  Indslidset stålplade, dorne i ét træemne (dobbeltsnit, 8.11).
  typ "B"  Træ-træ, de samme dorne gennem to emner (dobbeltsnit, 8.7):
           sidetræ (fx delt søjle) med fiber `grain` og tykkelse t1,
           midtertræ (fx spær) med fiber `grain_mid` og tykkelse t2.

Område: en vilkårlig konveks polygon (fx overlappet mellem en søjle og et
skråt spær = et parallelogram, se overlap_poly). Siderne nummereres 1, 2,
3 ... i polygonens rækkefølge. For hvert emne er en side automatisk en
ENDE (skærer fiberen, også skrå afskæringer) eller en KANT (parallel med
fiberen) – eller FRI, hvis emnet fortsætter forbi den (free / free_mid).

Fiberretninger angives i grader fra x-aksen ("x" = 0, "y" = 90, skråt
spær fx -35). N virker langs `grain`, V vinkelret (drejet +90 grader, mod
uret), M er positiv mod uret.

Afstande (tabel 8.5):
  - Kantafstand a4 måles vinkelret på fiberen, endeafstand a3 langs
    fiberen – også ved skrå afskæringer.
  - To dorne skal for hvert emne enten ligge a1 fra hinanden langs fiberen
    eller a2 på tværs (bogstavelig læsning af EC5; dorne i forskudte
    rækker skal altså have a2 mellem rækkerne).
  - rule "omhyllende": ugunstigste retning (a1 = 5d, a2 = 3d,
    a3,t = max(7d; 80 mm), a4,t = 4d). rule "dorn": hver dorn med sin
    egen kraftretning i alle lasttilfælde.

Opsætning i Grasshopper (højreklik på hver input):
  Geometri
    area       Curve,   Item   lukket polylinje (valgfri – ellers
                               rektangel x_size × y_size fra 0,0)
    x_size     float,   Item   (0.333)
    y_size     float,   Item   (0.4)
    dorn       str,     Item   "M12" eller 12 (mm)
    typ        str,     Item   "A" eller "B" ("A")
    grain      str,     Item   fiber for træ (A) / sidetræ (B) ("y")
    free       str,     Item   sider hvor det emne fortsætter, fx "1"
    grain_mid  str,     Item   typ B: midtertræets fiber, fx "-35"
    free_mid   str,     Item   typ B: sider hvor midtertræet fortsætter
    grid_angle float,   Item   retning for dornrækkerne (side 1's retning)
    a_edge     float,   Item   kantafstand til placering [x d] (4)
    a_end      float,   Item   endeafstand til placering [x d] (7)
    s_par      float,   Item   dornafstand langs fiberen [x d] (5)
    s_perp     float,   Item   afstand på tværs [x d] (3 dorn / 4 bolt)
    pts        Point3d, List   (valgfri – egne dornplaceringer)
  Last (lister = lasttilfælde; korte lister gentages)
    N          float,   List   [kN] langs grain
    V          float,   List   [kN] vinkelret på grain (+90 grader)
    M          float,   List   [kNm], positiv mod uret
    load_pt    Point3d, Item   (valgfri – angrebspunkt for N og V, fx
                               systemknuden)
    load_angle str,     Item   retning N virker i (valgfri – standard
                               grain). Fx "y" for søjlens kræfter på
                               spærets dorngruppe.
    both_signs bool,    Item   regn også med modsat fortegn (True)
  Kontrol
    n_plates   int,     Item   typ A: 1 eller 2 indslidsede plader (1).
                               Ved 2: t1 = ydertræ, t2 = midtertræ
    t_p        float,   Item   pladetykkelse [mm] (d) – tynd/tyk plade
    fastener   str,     Item   "dorn" eller "bolt" ("dorn")
    d_w        float,   Item   bolt: skivens diameter [mm] (3d)
    t_w        float,   Item   bolt: skivens tykkelse [mm] (0.3d)
    slip       float,   Item   hulluft pr. forbindelse [mm] (bolt 1, dorn 0)
    M_ser      float,   Item   moment i anvendelse [kNm] -> rotation (valgfri)
    rule       str,     Item   "omhyllende" eller "dorn" ("omhyllende")
    timber     str,     Item   "GL24h", "C24" ... eller rho_k (GL24h)
    t1         float,   Item   A: træ på hver side af pladen; B: sidetræ
                               [mm] (80)
    t2         float,   Item   B: midtertræ [mm] (2*t1)
    f_uk       float,   Item   dornens trækstyrke [MPa] (360)
    k_mod      float,   Item   (0.8)
    gamma_M    float,   Item   (1.3)
    use_nef    bool,    Item   n_ef for rækker langs fiberen (True)
    Fv_Rd      float,   Item   (valgfri – fast bæreevne pr. dorn [kN])
  Visning
    scale      float,   Item   pilelængde pr. kN (auto)
    plot       bool,    Item   tegn i viewporten (True)

Outputs: pts, F_vec, F, Fmax, Ip, centroid, IC, arrows, outline, inner,
Rd, eta, util, ok, info.  Stivheden (K_r,ser, K_r,u, rotation) står i info;
i et hjørne lægges de to gruppers stivhed i serie: 1/K = 1/K1 + 1/K2.  (Pile og kræfter er fra det styrende
lasttilfælde.)

Kraftfordeling (elastisk, stiv plade):
    F_i = F/n + M_tot/Ip * (-y_i, x_i),   Ip = sum(x_i^2 + y_i^2)
Bæreevne pr. dorn, alpha = vinkel mellem kraft og fiber:
    f_h,0,k = 0.082 (1 - 0.01 d) rho_k;  f_h,a,k = f_h,0,k/(k90 sin^2 + cos^2)
    M_y,Rk = 0.3 f_u,k d^2.6
    A: F_v,Rk = 2 min(f, g, h) (8.11);  B: F_v,Rk = 2 min(g, h, j, k) (8.7)
    A med 2 plader: 2 ydre snit (8.11) + 2 indre snit (8.12/8.13), 8.1.3
    Bolte: + F_ax,Rk/4 i g, h (A) / j, k (B), højst 25 %; F_ax,Rk = min(
    3 f_c,90,k A_skive, 0.9 f_ub A_s). Afstande efter tabel 8.4.
    F_v,Rd = n_ef/n k_mod F_v,Rk / gamma_M   (B: mindste n_ef af emnerne)

Stålplade-rammehjørne (lokalt): stalplade_hjorne() regner spærets og
søjlens dorngruppe og stålpladen (snit mellem grupperne + hulrandstryk);
plot_hjorne() tegner det hele. I Grasshopper: to komponenter med hver sin
gruppe (area, grain, free, grid_angle) og samme N, V, M, load_pt og
load_angle = "y".

Ikke med: blokforskydning (bilag A), kløvning (8.1.4), pladens svejsninger
og evt. knæk/stabilitet af pladen.
"""

import math

try:                                    # i Rhino/Grasshopper
    import Grasshopper
    import Rhino
    import Rhino.Geometry as rg
    import System.Drawing as sd
    IN_RHINO = True
except ImportError:                     # lokalt, fx i VS Code
    IN_RHINO = False


# ---------------------------------------------------------------- beregning
# Ren Python uden Rhino. Længder i meter, d og t i mm, kN og kNm.

# rho_k [kg/m3] – EN 338 og EN 14080
RHO_K = {
    "C14": 290, "C16": 310, "C18": 320, "C20": 330, "C22": 340,
    "C24": 350, "C27": 360, "C30": 380, "C35": 390, "C40": 400,
    "D30": 530, "D35": 540, "D40": 550, "D50": 620, "D60": 700,
    "D70": 900,
    "GL20H": 340, "GL22H": 370, "GL24H": 385, "GL26H": 405,
    "GL28H": 425, "GL30H": 430, "GL32H": 440,
    "GL20C": 355, "GL22C": 355, "GL24C": 365, "GL26C": 385,
    "GL28C": 390, "GL30C": 390, "GL32C": 400,
}
EPS = 1e-9

# f_c,90,k [MPa] – EN 338 og EN 14080 (til skivetryk ved bolte)
F_C90 = {
    "C14": 2.0, "C16": 2.2, "C18": 2.2, "C20": 2.3, "C22": 2.4,
    "C24": 2.5, "C27": 2.6, "C30": 2.7, "C35": 2.7, "C40": 2.8,
    "D30": 8.0, "D35": 8.1, "D40": 8.3, "D50": 9.3, "D60": 10.5,
    "D70": 13.5,
}

# Spændingsareal A_s [mm2] for metriske bolte
# rho_mean [kg/m3] – EN 338 og EN 14080 (til K_ser)
RHO_MEAN = {
    "C14": 350, "C16": 370, "C18": 380, "C20": 390, "C22": 410,
    "C24": 420, "C27": 430, "C30": 460, "C35": 470, "C40": 480,
    "D30": 640, "D35": 650, "D40": 660, "D50": 750, "D60": 840,
    "D70": 1080,
    "GL20H": 370, "GL22H": 410, "GL24H": 420, "GL26H": 445,
    "GL28H": 460, "GL30H": 480, "GL32H": 490,
    "GL20C": 390, "GL22C": 390, "GL24C": 400, "GL26C": 420,
    "GL28C": 420, "GL30C": 430, "GL32C": 440,
}

A_S = {10: 58.0, 12: 84.3, 14: 115.0, 16: 157.0, 20: 245.0, 22: 303.0,
       24: 353.0, 27: 459.0, 30: 561.0}


# ---- små vektorhjælpere

def unit(a_deg):
    a = math.radians(a_deg)
    return (math.cos(a), math.sin(a))


def perp(v):
    return (-v[1], v[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


# ---- input

def parse_dorn(dorn):
    """'M12', 'm12', '12' eller 12 -> 12.0 (mm)."""
    if dorn is None:
        return 12.0
    s = str(dorn).strip().upper().lstrip("M").replace(",", ".")
    return float(s)


def parse_timber(timber):
    """'GL24h' -> (385, 'GL24h', False); 420 -> (420, 'rho_k = 420', False).
    Tredje værdi er True for løvtræ (D-klasser)."""
    if timber is None:
        timber = "GL24h"
    s = str(timber).strip()
    try:
        rho = float(s.replace(",", "."))
        return rho, "rho_k = {:g}".format(rho), False
    except ValueError:
        pass
    key = s.upper()
    if key not in RHO_K:
        raise ValueError("Ukendt træsort: " + s)
    return float(RHO_K[key]), s, key.startswith("D")


def parse_grain(g, default=90.0):
    """'x' -> 0, 'y' -> 90, '-35' / -35 -> -35 (grader fra x-aksen)."""
    if g is None or str(g).strip() == "":
        return default
    s = str(g).strip().lower()
    if s == "x":
        return 0.0
    if s == "y":
        return 90.0
    return float(s.replace(",", "."))


def parse_sides(v):
    """None, 2, '2,3', '2 3', [2, '3'] -> {2, 3}."""
    if v is None:
        return set()
    if isinstance(v, (int, float)):
        items = [v]
    elif isinstance(v, str):
        items = v.replace(",", " ").replace(";", " ").split()
    else:
        items = list(v)
    return set(int(float(it)) for it in items)


def _as_list(v):
    if v is None:
        return [0.0]
    if isinstance(v, (int, float)):
        return [float(v)]
    vals = [float(x) for x in v]
    return vals or [0.0]


def load_cases(N, V, M, both_signs=True):
    """Lasttilfælde [(N, V, M)]. Korte lister gentages (længde 1)."""
    Ns, Vs, Ms = _as_list(N), _as_list(V), _as_list(M)
    n = max(len(Ns), len(Vs), len(Ms))
    for name, l in (("N", Ns), ("V", Vs), ("M", Ms)):
        if len(l) not in (1, n):
            raise ValueError("{} har {} værdier – forventede 1 eller {}"
                             .format(name, len(l), n))

    def at(l, i):
        return l[0] if len(l) == 1 else l[i]
    cases = [(at(Ns, i), at(Vs, i), at(Ms, i)) for i in range(n)]
    if both_signs:
        cases += [(-a, -b, -c) for a, b, c in cases]
    return cases


def members(typ, grain, free, grain_mid=None, free_mid=None):
    """Emner som dicts: navn, fiber (grader), g (enhedsvektor), frie sider.
    Første emne er det, N og V hører til (og sidetræet i typ B)."""
    g1 = parse_grain(grain)
    if typ == "B":
        g2 = parse_grain(grain_mid, 0.0)
        return [{"name": "sidetræ", "angle": g1, "g": unit(g1),
                 "free": parse_sides(free)},
                {"name": "midtertræ", "angle": g2, "g": unit(g2),
                 "free": parse_sides(free_mid)}]
    return [{"name": "træ", "angle": g1, "g": unit(g1),
             "free": parse_sides(free)}]


# ---- polygon

def rect_poly(Lx, Ly):
    """Rektangel fra (0, 0): side 1 bund, 2 højre, 3 top, 4 venstre."""
    return [(0.0, 0.0), (Lx, 0.0), (Lx, Ly), (0.0, Ly)]


def overlap_poly(b, h, slope):
    """Overlap mellem en lodret søjle (bredde b, x = 0..b) og et spær med
    højde h vinkelret på fiberen og fiberretning `slope` grader, hvor
    spærets underside går gennem søjlens ydre hjørne (b, 0).
    Side 1 = spærets underside, 2 = søjlens yderside (x = b),
    3 = spærets overside, 4 = søjlens inderside (x = 0)."""
    t = math.tan(math.radians(slope))
    H = h / math.cos(math.radians(slope))       # lodret højde af spæret
    y0 = -b * t                                 # undersiden ved x = 0
    return [(0.0, y0), (b, 0.0), (b, H), (0.0, y0 + H)]


def poly_sides(P):
    """For hver side i (nr. i+1): (startpunkt, retning, udadrettet normal,
    længde, midtpunkt)."""
    n = len(P)
    area2 = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1]
                for i in range(n))
    o = 1.0 if area2 > 0 else -1.0
    out = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        e = sub(b, a)
        L = math.hypot(*e)
        if L < EPS:
            raise ValueError("Polygonen har to ens punkter")
        e = (e[0] / L, e[1] / L)
        out.append((a, e, (o * e[1], -o * e[0]), L,
                    ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)))
    return out


def inside_dist(p, side):
    """Vinkelret afstand fra p ind til sidens linje (positiv indenfor)."""
    return -dot(sub(p, side[0]), side[2])


def side_type(m, s_no, side):
    if s_no in m["free"]:
        return "fri"
    return "kant" if abs(dot(side[1], m["g"])) >= math.cos(
        math.radians(45)) else "ende"


def offset_poly(P, sides, offs):
    """Polygon med hver side flyttet offs[i] indad. None hvis den
    forsvinder."""
    n = len(P)
    c = [dot(s[0], s[2]) - o for s, o in zip(sides, offs)]
    Q = []
    for j in range(n):
        i = (j - 1) % n
        n1, n2 = sides[i][2], sides[j][2]
        det = n1[0] * n2[1] - n1[1] * n2[0]
        if abs(det) < EPS:
            return None
        Q.append(((c[i] * n2[1] - n1[1] * c[j]) / det,
                  (n1[0] * c[j] - c[i] * n2[0]) / det))
    for q in Q:
        for s, o in zip(sides, offs):
            if inside_dist(q, s) < o - 1e-7:
                return None
    return Q


# ---- placering

def grid_1d(length, s_min):
    """Positioner 0..length med mindst s_min imellem, jævnt fordelt."""
    if length < -1e-9:
        return []
    length = max(length, 0.0)
    n = int(math.floor(length / s_min + 1e-9)) + 1 if s_min > 0 else 1
    if n == 1:
        return [length / 2.0]
    return [i * length / (n - 1) for i in range(n)]


def min_len(direction, mems, a1, a2):
    """Mindste afstand langs `direction`, så to dorne på linjen har a1
    langs eller a2 på tværs af fiberen i alle emner."""
    L = 0.0
    for m in mems:
        c = abs(dot(direction, m["g"]))
        s = abs(dot(direction, perp(m["g"])))
        cand = []
        if c > EPS:
            cand.append(a1 / c)
        if s > EPS:
            cand.append(a2 / s)
        L = max(L, min(cand))
    return L


def pair_ok(p, q, mems, a1, a2):
    s = sub(q, p)
    for m in mems:
        if abs(dot(s, m["g"])) < a1 - 1e-9 and \
                abs(dot(s, perp(m["g"]))) < a2 - 1e-9:
            return False
    return True


def layout(P, d, mems, a_edge=4.0, a_end=7.0, s_par=5.0, s_perp=3.0,
           grid_angle=None):
    """Dorne i rækker langs grid_angle inden for polygonen P minus kant- og
    endeafstande. d og P i meter. Returnerer (punkter, indre polygon)."""
    sides = poly_sides(P)
    u = sides[0][1] if grid_angle is None else unit(grid_angle)
    v = perp(u)
    a1, a2 = s_par * d, s_perp * d
    sx = min_len(u, mems, a1, a2)
    sy = min_len(v, mems, a1, a2)

    offs = []
    for k, s in enumerate(sides):
        req = []
        for m in mems:
            t = side_type(m, k + 1, s)
            if t == "ende":                     # a3 langs fiberen
                req.append(a_end * d * abs(dot(m["g"], s[2])))
            elif t == "kant":                   # a4 vinkelret på fiberen
                req.append(a_edge * d * abs(dot(perp(m["g"]), s[2])))
        offs.append(max(req) if req else 0.5 * min(sx, sy))
    Q = offset_poly(P, sides, offs)
    if Q is None:
        return [], None
    qs = poly_sides(Q)

    def generate(sy):
        ws = [dot(q, v) for q in Q]
        pts = []
        for w in grid_1d(max(ws) - min(ws), sy):
            w += min(ws)
            p0 = (v[0] * w, v[1] * w)
            tmin, tmax = -1e18, 1e18
            for s in qs:
                un = dot(u, s[2])
                rhs = dot(s[0], s[2]) - dot(p0, s[2])
                if un > EPS:
                    tmax = min(tmax, rhs / un)
                elif un < -EPS:
                    tmin = max(tmin, rhs / un)
                elif rhs < -1e-9:
                    tmin, tmax = 1, 0
            if tmax - tmin < -1e-9:
                continue
            for t in grid_1d(tmax - tmin, sx):
                t += tmin
                pts.append((p0[0] + u[0] * t, p0[1] + u[1] * t))
        return pts

    pts = generate(sy)
    for _ in range(80):                         # forskudte rækker
        if all(pair_ok(pts[i], pts[j], mems, a1, a2)
               for i in range(len(pts)) for j in range(i + 1, len(pts))):
            break
        sy *= 1.04
        pts = generate(sy)
    return pts, Q


# ---- kræfter

def distribute(points, Fx, Fy, M, load_pt=None):
    """Elastisk fordeling. points/load_pt i meter, kræfter i kN, M i kNm."""
    n = len(points)
    cx = sum(p[0] for p in points) / n
    cy = sum(p[1] for p in points) / n
    rel = [(p[0] - cx, p[1] - cy) for p in points]
    Ip = sum(x * x + y * y for x, y in rel)

    M_tot = M
    if load_pt is not None:
        ex, ey = load_pt[0] - cx, load_pt[1] - cy
        M_tot += ex * Fy - ey * Fx

    forces = []
    for x, y in rel:
        fx, fy = Fx / n, Fy / n
        if Ip > 0:
            fx += -M_tot * y / Ip
            fy += M_tot * x / Ip
        forces.append((fx, fy))
    mags = [math.hypot(fx, fy) for fx, fy in forces]

    ic = None
    if abs(M_tot) > 1e-12 and Ip > 0:
        k = Ip / (n * M_tot)
        ic = (cx - k * Fy, cy + k * Fx)

    return {"centroid": (cx, cy), "Ip": Ip, "M_tot": M_tot,
            "forces": forces, "mags": mags, "ic": ic}


# ---- bæreevne

def angle_to_grain(f, g):
    """Vinkel 0..90 grader mellem kraft f og fiber (enhedsvektor g)."""
    F = math.hypot(f[0], f[1])
    if F < 1e-12:
        return 0.0
    return math.degrees(math.acos(min(1.0, abs(dot(f, g)) / F)))


def f_h_alpha(d, rho_k, alpha_deg, hardwood=False):
    f_h0 = 0.082 * (1 - 0.01 * d) * rho_k
    k90 = (0.90 if hardwood else 1.35) + 0.015 * d
    a = math.radians(alpha_deg)
    return f_h0 / (k90 * math.sin(a) ** 2 + math.cos(a) ** 2), f_h0, k90


def rope(johansen, F_ax):
    """Rebvirkning F_ax,Rk/4, højst 25 % af Johansen-delen (bolte,
    EC5 8.2.2(2)). N."""
    return min(F_ax / 4.0, 0.25 * johansen)


def johansen_steel_center(d, t1, rho_k, f_uk, alpha_deg, hardwood=False,
                          F_ax=0.0):
    """EC5 (8.11): stålplade som midterdel, dobbeltsnit. F_ax = F_ax,Rk [N]
    (0 for dorne). Returnerer F_v,Rk pr. forbindelse [kN] (2 snit) og
    mellemregninger."""
    f_ha, f_h0, k90 = f_h_alpha(d, rho_k, alpha_deg, hardwood)
    M_y = 0.3 * f_uk * d ** 2.6
    g = f_ha * t1 * d * (math.sqrt(2 + 4 * M_y / (f_ha * d * t1 ** 2)) - 1)
    h = 2.3 * math.sqrt(M_y * f_ha * d)
    modes = {"f": f_ha * t1 * d, "g": g + rope(g, F_ax),
             "h": h + rope(h, F_ax)}
    mode = min(modes, key=modes.get)
    return 2 * modes[mode] / 1000.0, {
        "f_h0": f_h0, "k90": k90, "f_h": {"træ": f_ha}, "M_y": M_y,
        "modes": modes, "mode": mode, "F_ax": F_ax}


def johansen_timber_double(d, t1, t2, rho_k, f_uk, a_side, a_mid,
                           hardwood=False, F_ax=0.0):
    """EC5 (8.7): træ-træ, dobbeltsnit. Sidetræ t1 med vinkel a_side til
    fiberen, midtertræ t2 med a_mid. F_ax = F_ax,Rk [N] (0 for dorne)."""
    f_h1, f_h0, k90 = f_h_alpha(d, rho_k, a_side, hardwood)
    f_h2, _, _ = f_h_alpha(d, rho_k, a_mid, hardwood)
    M_y = 0.3 * f_uk * d ** 2.6
    b = f_h2 / f_h1
    j = 1.05 * f_h1 * t1 * d / (2 + b) * (
        math.sqrt(2 * b * (1 + b)
                  + 4 * b * (2 + b) * M_y / (f_h1 * d * t1 ** 2)) - b)
    k = 1.15 * math.sqrt(2 * b / (1 + b)) * math.sqrt(2 * M_y * f_h1 * d)
    modes = {"g": f_h1 * t1 * d, "h": 0.5 * f_h2 * t2 * d,
             "j": j + rope(j, F_ax), "k": k + rope(k, F_ax)}
    mode = min(modes, key=modes.get)
    return 2 * modes[mode] / 1000.0, {
        "f_h0": f_h0, "k90": k90, "f_h": {"side": f_h1, "midte": f_h2},
        "beta": b, "M_y": M_y, "modes": modes, "mode": mode, "F_ax": F_ax}


def johansen_steel_two_plates(d, t1, t2, t_p, rho_k, f_uk, alpha_deg,
                              hardwood=False, F_ax=0.0):
    """To indslidsede stålplader, 4 snit (EC5 8.1.3).
    Ydre snit (ydertræ t1 mod plade) som stålplade i midten (8.11): f, g, h.
    Indre snit (midtertræ t2 mellem pladerne) som stålplader udenpå
    (8.12 tynd / 8.13 tyk, interpoleret for 0.5d < t_p < d): l, m.
    Rebvirkning kun i de ydre snit (skiverne sidder på ydersiderne).
    F_v,Rk = 2 F_ydre + 2 F_indre, hvis brudformerne er forenelige (begge
    hultryk eller begge flydning), ellers 4 x det mindste."""
    f_ha, f_h0, k90 = f_h_alpha(d, rho_k, alpha_deg, hardwood)
    M_y = 0.3 * f_uk * d ** 2.6
    g = f_ha * t1 * d * (math.sqrt(2 + 4 * M_y / (f_ha * d * t1 ** 2)) - 1)
    h = 2.3 * math.sqrt(M_y * f_ha * d)
    outer = {"f": f_ha * t1 * d, "g": g + rope(g, F_ax),
             "h": h + rope(h, F_ax)}
    m_thin = 1.15 * math.sqrt(2 * M_y * f_ha * d)          # (8.12 k)
    m_thick = 2.3 * math.sqrt(M_y * f_ha * d)              # (8.13 m)
    w = min(1.0, max(0.0, (t_p - 0.5 * d) / (0.5 * d)))
    inner = {"l": 0.5 * f_ha * t2 * d, "m": m_thin + w * (m_thick - m_thin)}
    o = min(outer, key=outer.get)
    i = min(inner, key=inner.get)
    if (o == "f") == (i == "l"):
        Rk = 2 * outer[o] + 2 * inner[i]
        txt = "2 x {:.2f} (ydre, {}) + 2 x {:.2f} (indre, {})".format(
            outer[o] / 1000, o, inner[i] / 1000, i)
    else:
        lo = min(outer[o], inner[i])
        Rk = 4 * lo
        txt = ("brudform {} og {} er ikke forenelige -> 4 x {:.2f}"
               .format(o, i, lo / 1000))
    modes = dict([("ydre " + k, v) for k, v in outer.items()]
                 + [("indre " + k, v) for k, v in inner.items()])
    return Rk / 1000.0, {
        "f_h0": f_h0, "k90": k90, "f_h": {"træ": f_ha}, "M_y": M_y,
        "modes": modes, "mode": o + "/" + i, "F_ax": F_ax, "Rk_text": txt}


def bolt_axial(d, f_c90, f_ub, d_w, t_w, d_hole=None):
    """F_ax,Rk for en bolt [N]: skivetryk 3 f_c,90,k på skivens areal
    (EC5 8.5.2(2), skivens diameter højst 12 t_w og 4d) og boltens
    trækbæreevne 0.9 f_ub A_s. Som SømDIM: hullet trækkes kun fra den
    faktiske skive."""
    d_hole = d_hole or d + 2
    R_w = {"skive": 3 * f_c90 * math.pi / 4 * (d_w ** 2 - d_hole ** 2),
           "12 t_w": 3 * f_c90 * math.pi / 4 * (12 * t_w) ** 2,
           "4d": 3 * f_c90 * math.pi / 4 * (4 * d) ** 2}
    R_t = 0.9 * f_ub * A_S.get(int(round(d)), 0.78 * math.pi * d ** 2 / 4)
    vals = dict(R_w, bolt=R_t)
    gov = min(vals, key=vals.get)
    return vals[gov], vals, gov


def k_ser_fastener(d_mm, rho_m, planes=2, steel=True):
    """K_ser pr. forbindelse [N/mm]: rho_m^1.5 d / 23 pr. snit (EC5 tabel
    7.1), x 2 for stål mod træ (7.1(3))."""
    return planes * (2.0 if steel else 1.0) * rho_m ** 1.5 * d_mm / 23.0


def group_rotation(points_mm, K, M_Nmm, slip=0.0):
    """Rotation [rad] af en gruppe om tyngdepunktet ved momentet M [Nmm].
    Hver forbindelse (stivhed K [N/mm]) bærer først, når dens hulluft
    `slip` [mm] er taget op: M(phi) = sum K r_i max(0, phi r_i - slip)."""
    M_Nmm = abs(M_Nmm)
    n = len(points_mm)
    cx = sum(p[0] for p in points_mm) / n
    cy = sum(p[1] for p in points_mm) / n
    rs = [math.hypot(p[0] - cx, p[1] - cy) for p in points_mm]
    if M_Nmm <= 0 or max(rs) <= 0:
        return 0.0

    def moment(phi):
        return sum(K * r * max(0.0, phi * r - slip) for r in rs)
    hi = slip / max(rs) + M_Nmm / (K * sum(r * r for r in rs))
    while moment(hi) < M_Nmm:
        hi *= 2
    lo = 0.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if moment(mid) < M_Nmm:
            lo = mid
        else:
            hi = mid
    return hi


def n_ef_factor(n, a1, d, alpha_deg):
    """n_ef,alpha / n for en række med n dorne og afstand a1 (samme enhed
    som d). EC5 (8.34) og 8.5.1.1(4)."""
    if n <= 1 or a1 <= 0:
        return 1.0
    nef0 = min(n, n ** 0.9 * (a1 / (13.0 * d)) ** 0.25)
    nef = nef0 + (n - nef0) * min(abs(alpha_deg), 90.0) / 90.0
    return nef / n


def rows_along_grain(points, g, tol):
    """Rækker langs fiberen g (dorne med samme tværposition inden for tol).
    Returnerer rækkerne (sorteret langs fiberen) og pr. dorn
    (antal i rækken, mindste afstand i rækken)."""
    q = perp(g)
    rows = []
    for idx, p in enumerate(points):
        for r in rows:
            if abs(dot(points[r[0]], q) - dot(p, q)) < tol:
                r.append(idx)
                break
        else:
            rows.append([idx])
    info = [None] * len(points)
    for r in rows:
        r.sort(key=lambda i: dot(points[i], g))
        gaps = [dot(points[b], g) - dot(points[a], g)
                for a, b in zip(r, r[1:])]
        gaps = [x for x in gaps if x > 1e-9]
        a1 = min(gaps) if gaps else 0.0
        for i in r:
            info[i] = (len(r), a1)
    return rows, info


# ---- afstandskrav, tabel 8.4 (bolte) og 8.5 (dorne)

def req_end(f, toward, d, env, bolt=False):
    """Krævet a3 (langs fiberen) til en ende i retning `toward`."""
    a3t = max(7 * d, 0.080)
    a3c_min = (4 if bolt else 3) * d
    if env:
        return a3t
    F = math.hypot(f[0], f[1])
    if F < 1e-12:
        return a3c_min
    th = math.degrees(math.acos(max(-1.0, min(1.0, dot(f, toward) / F))))
    if th <= 90:
        return a3t                                  # belastet ende
    if th < 150:
        sn = math.sin(math.radians(th))
        return max((1 + 6 * sn) * d if bolt else a3t * sn, a3c_min)
    return a3c_min


def req_edge(f, toward, d, env, bolt=False):
    """Krævet a4 (vinkelret på fiberen) til en kant i retning `toward`."""
    if env:
        return 4 * d
    F = math.hypot(f[0], f[1])
    if F < 1e-12:
        return 3 * d
    c = dot(f, toward) / F                         # = sin(alpha)
    return max((2 + 2 * c) * d, 3 * d) if c > 0 else 3 * d


def req_a1(f, g, d, env, bolt=False):
    if env:
        return 5 * d
    c = abs(math.cos(math.radians(angle_to_grain(f, g))))
    return ((4 + c) if bolt else (3 + 2 * c)) * d


def distance_checks(points, P, d, mems, case_forces, env, bolt=False):
    """Afstande mod tabel 8.4/8.5. Returnerer [(navn, aktuel, krav, ok,
    tekst)] for den forbindelse/det par, der har mindst margin."""
    sides = poly_sides(P)
    out = []
    many = len(mems) > 1
    for m in mems:
        g, q = m["g"], perp(m["g"])
        tag = " ({})".format(m["name"]) if many else ""

        # dornafstande: a1 langs fiberen eller a2 på tværs
        a1_i = [max(req_a1(fs[i], g, d, env, bolt) for fs in case_forces)
                for i in range(len(points))]
        a2 = (4 if bolt else 3) * d
        worst = None
        for i in range(len(points)):
            for j in range(i + 1, len(points)):
                s = sub(points[j], points[i])
                sp, sq = abs(dot(s, g)), abs(dot(s, q))
                a1 = max(a1_i[i], a1_i[j])
                margin = max(sp / a1, sq / a2)
                if worst is None or margin < worst[0]:
                    worst = (margin, i, j, sp, sq, a1)
        if worst:
            mg, i, j, sp, sq, a1 = worst
            out.append(("indbyrdes afstand" + tag, mg, 1.0, mg >= 1 - 1e-9,
                        "nr. {}-{}: langs {:.0f} (a1 {:.0f}) / tværs {:.0f} "
                        "(a2 {:.0f}) mm".format(i + 1, j + 1, sp * 1000,
                                                a1 * 1000, sq * 1000,
                                                a2 * 1000)))

        # ender og kanter
        for k, s in enumerate(sides):
            st = side_type(m, k + 1, s)
            if st == "fri":
                continue
            if st == "ende":
                dvec, fn, nm = g, req_end, "a3"
            else:
                dvec, fn, nm = q, req_edge, "a4"
            c = dot(dvec, s[2])
            toward = dvec if c > 0 else (-dvec[0], -dvec[1])
            worst = None
            for i, p in enumerate(points):
                act = inside_dist(p, s) / abs(c)
                req = max(fn(fs[i], toward, d, env, bolt)
                          for fs in case_forces)
                if worst is None or act - req < worst[0] - worst[1]:
                    worst = (act, req)
            out.append(("{} side {}{}".format(nm, k + 1, tag), worst[0],
                        worst[1], worst[0] >= worst[1] - 1e-9, None))
    return out


def analyse(points, P, d_mm, typ="A", grain="y", free=None, grain_mid=None,
            free_mid=None, N=0.0, V=0.0, M=0.0, load_pt=None,
            both_signs=True, rule="omhyllende", timber="GL24h", t1=80.0,
            t2=None, f_uk=360.0, k_mod=0.8, gamma_M=1.3, use_nef=True,
            Fv_Rd=None, load_angle=None, fastener="dorn", d_w=None,
            t_w=None, slip=None, M_ser=None, n_plates=1, t_p=None):
    """Kraftfordeling og kontrol for alle lasttilfælde. fastener "dorn"
    eller "bolt" (bolt: rebvirkning fra skive d_w × t_w [mm], standard
    3d × 0.3d, og boltenes afstandskrav). Stivhed: K_ser efter EC5 7.1,
    hulluft `slip` [mm] (bolt 1.0, dorn 0) og rotationen ved M_ser [kNm].
    points, P og
    load_pt i meter. N virker langs load_angle (standard: første emnes
    fiber), V +90 grader derfra. Returnerer dict for det styrende
    lasttilfælde."""
    typ = str(typ or "A").strip().upper()
    rule = str(rule or "omhyllende").strip().lower()
    env = not rule.startswith("d")
    t2 = 2 * t1 if not t2 else t2
    rho_k, tname, hard = parse_timber(timber)
    d = d_mm / 1000.0
    mems = members(typ, grain, free, grain_mid, free_mid)
    cases = load_cases(N, V, M, both_signs)
    g0 = mems[0]["g"]
    rinfo = [rows_along_grain(points, m["g"], d / 2)[1] for m in mems]
    bolt = str(fastener or "dorn").strip().lower().startswith("b")
    word = "bolt" if bolt else "dorn"
    F_ax, ax_info = 0.0, None
    if bolt:
        d_w = d_w or 3 * d_mm
        t_w = t_w or 0.3 * d_mm
        f_c90 = F_C90.get(str(timber).strip().upper(), 2.5)
        F_ax, vals, gov_ax = bolt_axial(d_mm, f_c90, f_uk, d_w, t_w)
        ax_info = (f_c90, d_w, t_w, vals, gov_ax)

    def capacity(f, i):
        if Fv_Rd:
            return float(Fv_Rd), None
        if typ == "B":
            Rk, x = johansen_timber_double(
                d_mm, t1, t2, rho_k, f_uk, angle_to_grain(f, mems[0]["g"]),
                angle_to_grain(f, mems[1]["g"]), hard, F_ax)
        else:
            if n_plates == 2:
                Rk, x = johansen_steel_two_plates(
                    d_mm, t1, t2, t_p or d_mm, rho_k, f_uk,
                    angle_to_grain(f, g0), hard, F_ax)
            else:
                Rk, x = johansen_steel_center(
                    d_mm, t1, rho_k, f_uk, angle_to_grain(f, g0), hard,
                    F_ax)
        kef = 1.0
        if use_nef:
            kef = min(n_ef_factor(ri[i][0], ri[i][1], d,
                                  angle_to_grain(f, m["g"]))
                      for m, ri in zip(mems, rinfo))
        x = dict(x, kef=kef, Rk=Rk)
        return kef * k_mod * Rk / gamma_M, x

    results = []
    for (n_, v_, m_) in cases:
        gl = g0 if load_angle is None else unit(parse_grain(load_angle))
        q0 = perp(gl)
        Fx, Fy = n_ * gl[0] + v_ * q0[0], n_ * gl[1] + v_ * q0[1]
        res = distribute(points, Fx, Fy, m_, load_pt)
        Rd, eta = [], []
        for i, (f, F) in enumerate(zip(res["forces"], res["mags"])):
            rd, _ = capacity(f, i)
            Rd.append(rd)
            eta.append(F / rd if rd > 0 else float("inf"))
        res.update({"case": (n_, v_, m_), "F_res": math.hypot(Fx, Fy),
                    "Rd": Rd, "eta": eta})
        results.append(res)

    gov = max(results, key=lambda r: max(r["eta"]))
    i_max = max(range(len(points)), key=lambda i: gov["eta"][i])
    util = gov["eta"][i_max]
    spacing = distance_checks(points, P, d, mems,
                              [r["forces"] for r in results], env, bolt)
    ok = util <= 1.0 and all(s[3] for s in spacing)

    # ---- rapport
    sides = poly_sides(P)
    if typ == "B":
        head = "KONTROL (DS/EN 1995-1-1, træ-træ, dobbeltsnit (8.7))"
        thick = "t1 = {:g} mm (sidetræ), t2 = {:g} mm (midtertræ)".format(
            t1, t2)
    else:
        if n_plates == 2:
            head = ("KONTROL (DS/EN 1995-1-1, to indslidsede stålplader, "
                    "4 snit (8.11 + 8.13, 8.1.3))")
            thick = ("t1 = {:g} mm (ydre), t2 = {:g} mm (indre), plader "
                     "t = {:g} mm".format(t1, t2, t_p or d_mm))
        else:
            head = ("KONTROL (DS/EN 1995-1-1, indslidset stålplade, "
                    "dobbeltsnit (8.11))")
            thick = "t1 = {:g} mm".format(t1)
    L = [head,
         "Træ: {}, rho_k = {:g} kg/m3; {} d = {:g} mm, f_u,k = {:g} MPa"
         .format(tname, rho_k, word, d_mm, f_uk),
         "{}, k_mod = {:g}, gamma_M = {:g}".format(thick, k_mod, gamma_M)]
    for m in mems:
        L.append("{} (fiber {:g} grader): {}".format(
            m["name"].capitalize(), m["angle"], ", ".join(
                "{} {}".format(k + 1, side_type(m, k + 1, s))
                for k, s in enumerate(sides))))
    L.append("Lasttilfælde: {}{}; styrende N = {:g}, V = {:g}, M = {:g}"
             .format(len(cases), " (inkl. modsat fortegn)" if both_signs
                     else "", *gov["case"]))
    f = gov["forces"][i_max]
    rd, x = capacity(f, i_max)
    if x is None:
        L.append("F_v,Rd = {:.2f} kN (givet)".format(rd))
    else:
        L.append("Styrende {} nr. {}: F = {:.2f} kN, alpha = {}".format(
            word, i_max + 1, gov["mags"][i_max], " / ".join(
                "{:.1f} grader ({})".format(angle_to_grain(f, m["g"]),
                                            m["name"]) for m in mems)))
        L += ["f_h,0,k = 0.082(1-0.01d)rho_k = {:.2f} MPa, k90 = {:.3f}"
              .format(x["f_h0"], x["k90"]),
              "f_h,a,k: " + ", ".join("{} {:.2f} MPa".format(k, v)
                                      for k, v in x["f_h"].items()),
              "M_y,Rk = 0.3 f_u,k d^2.6 = {:.0f} Nmm".format(x["M_y"])]
        if ax_info:
            f_c90, dw, tw, vals, gov_ax = ax_info
            L += ["F_ax,Rk = min(3 f_c,90,k A (skive {:g} x {:g}, f_c,90,k = "
                  "{:g} MPa), 0.9 f_ub A_s): ".format(dw, tw, f_c90)
                  + ", ".join("{} {:.0f}".format(k, v)
                              for k, v in vals.items())
                  + " N -> {:.0f} N ({})".format(F_ax, gov_ax),
                  "Rebvirkning F_ax,Rk/4 = {:.0f} N pr. snit (højst 25 % "
                  "af Johansen-delen)".format(F_ax / 4)]
        L += [
              "Brudformer pr. snit: " + ", ".join(
                  "{} = {:.2f}".format(k, v / 1000)
                  for k, v in x["modes"].items()) + " kN",
              ("F_v,Rk = {} = {:.2f} kN".format(x["Rk_text"], x["Rk"])
               if "Rk_text" in x else
               "F_v,Rk = 2 snit x {:.2f} = {:.2f} kN (brudform {})".format(
                   x["Rk"] / 2, x["Rk"], x["mode"])),
              "n_ef/n = {:.3f}".format(x["kef"]) if use_nef
              else "n_ef ikke medregnet",
              "F_v,Rd = {:.3f} x {:g} x {:.2f} / {:g} = {:.2f} kN".format(
                  x["kef"], k_mod, x["Rk"], gamma_M, rd)]
    L.append("eta = {:.2f} / {:.2f} = {:.2f}  {}".format(
        gov["mags"][i_max], rd, util, "OK" if util <= 1 else "IKKE OK"))
    L.append("Afstande ({}):".format("ugunstigste retning" if env
                                     else "pr. {} efter kraftretning".format(
                                         word)))
    for nm, a, r, sok, txt in spacing:
        res_txt = "OK" if sok else "IKKE OK"
        if txt:
            L.append("  {}: {}  {}".format(nm, txt, res_txt))
        else:
            L.append("  {} = {:.0f} mm >= {:.0f} mm  {}".format(
                nm, a * 1000, r * 1000, res_txt))
    L.append("SAMLET: " + ("OK" if ok else "IKKE OK"))

    # ---- stivhed (EC5 7.1)
    rho_m = RHO_MEAN.get(str(timber).strip().upper(), 1.09 * rho_k)
    planes = 2 * n_plates if typ != "B" else 2
    K_f = k_ser_fastener(d_mm, rho_m, planes, steel=(typ != "B"))
    slip = (1.0 if bolt else 0.0) if slip is None else float(slip)
    pts_mm = [(p[0] * 1000, p[1] * 1000) for p in points]
    Ip_mm = gov["Ip"] * 1e6
    K_r = K_f * Ip_mm / 1e6                     # kNm/rad
    L += ["STIVHED (DS/EN 1995-1-1, 7.1)",
          "rho_m = {:g} kg/m3; K_ser = {} snit x {}rho_m^1.5 d/23 = {:.0f} "
          "N/mm pr. {}".format(rho_m, planes,
                               "2 (stål) x " if typ != "B" else "",
                               K_f, word),
          "K_r,ser = K_ser x sum r^2 = {:.0f} N/mm x {:.0f} mm2 = {:.0f} "
          "kNm/rad;  K_r,u = 2/3 K_r,ser = {:.0f} kNm/rad".format(
              K_f, Ip_mm, K_r, 2 * K_r / 3),
          "Hulluft {:g} mm pr. {} (lægges til separat)".format(slip, word)]
    phi = None
    if M_ser:
        phi = group_rotation(pts_mm, K_f, float(M_ser) * 1e6, slip)
        phi_el = abs(float(M_ser)) / K_r
        L.append("Rotation ved M_ser = {:.2f} kNm: {:.2f} mrad (elastisk "
                 "{:.2f} + hulluft {:.2f})".format(
                     float(M_ser), phi * 1000, phi_el * 1000,
                     (phi - phi_el) * 1000))

    out = dict(gov)
    out.update({"K_f": K_f, "K_r": K_r, "slip": slip, "phi_ser": phi,
                "rho_m": rho_m, "util": util, "i_max": i_max, "ok": ok, "spacing": spacing,
                "lines": L, "cases": results, "members": mems})
    return out


# ------------------------------------------------------- lokalt (VS Code)

def solve(poly=None, x_size=0.333, y_size=0.4, dorn="M12", typ="A",
          grain="y", free=None, grain_mid=None, free_mid=None,
          grid_angle=None, a_edge=4.0, a_end=7.0, s_par=5.0, s_perp=None,
          pts=None, **kw):
    """Placerer dornene og kører analyse(). poly i meter (ellers rektangel
    x_size × y_size fra 0,0). Øvrige argumenter går til analyse()."""
    typ = str(typ).strip().upper()
    P = poly or rect_poly(x_size, y_size)
    d_mm = parse_dorn(dorn)
    mems = members(typ, grain, free, grain_mid, free_mid)
    if s_perp is None:                  # a2 = 4d for bolte, 3d for dorne
        bolt = str(kw.get("fastener") or "dorn").lower().startswith("b")
        s_perp = 4.0 if bolt else 3.0
    auto, Q = layout(P, d_mm / 1000.0, mems, a_edge, a_end, s_par, s_perp,
                     grid_angle)
    if pts is None:
        pts = auto
    if not pts:
        raise ValueError("Ingen dorne – området er for lille til "
                         "kant-/endeafstandene.")
    r = analyse(pts, P, d_mm, typ, grain, free, grain_mid, free_mid, **kw)
    r.update({"pts": pts, "poly": P, "inner": Q, "d_mm": d_mm})
    return r


def side_labels(P, mems):
    sides = poly_sides(P)
    out = []
    for k, s in enumerate(sides):
        t = "/".join(side_type(m, k + 1, s) for m in mems)
        out.append(("{} {}".format(k + 1, t), s[4], s[2]))
    return out


def plot_mpl(r, scale=None, show=True, save=None, ax=None, labels="all"):
    """Tegner samlingen: pile og kræfter fra det styrende lasttilfælde.
    labels="max" skriver kun tekst ved den styrende dorn."""
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon

    P = r["poly"]
    xs, ys = [p[0] for p in P], [p[1] for p in P]
    size = max(max(xs) - min(xs), max(ys) - min(ys))
    Fmax = max(r["mags"])
    if not scale:
        scale = 0.35 * size / Fmax if Fmax > 0 else 0.0

    own = ax is None
    if own:
        fig, ax = plt.subplots(figsize=(8, 8))
    ax.add_patch(Polygon(P, closed=True, fill=False, ec="#aa0000"))
    if r["inner"]:
        ax.add_patch(Polygon(r["inner"], closed=True, fill=False, ec="grey",
                             ls=":"))
    for txt, mid, n in side_labels(P, r["members"]):
        ax.text(mid[0] + n[0] * 0.03 * size, mid[1] + n[1] * 0.03 * size,
                txt, color="#aa0000", ha="center", va="center", fontsize=8,
                bbox=dict(fc="white", ec="none", pad=1))

    # fiberretninger
    cx, cy = r["centroid"]
    for k, m in enumerate(r["members"]):
        g = m["g"]
        L = 0.2 * size
        ox, oy = min(xs) - 0.15 * size, max(ys) - 0.25 * size * k
        ends = [(ox + g[0] * L / 2, oy + g[1] * L / 2),
                (ox - g[0] * L / 2, oy - g[1] * L / 2)]
        ax.annotate("", xy=ends[0], xytext=ends[1],
                    arrowprops=dict(arrowstyle="<->", color="#8a6d3b"))
        ax.plot(*zip(*ends), alpha=0)           # med i aksegrænserne
        ax.text(ox, oy, " fiber " + m["name"], color="#8a6d3b", fontsize=8,
                ha="left", va="bottom")

    for i, ((x, y), (fx, fy), F, e) in enumerate(
            zip(r["pts"], r["forces"], r["mags"], r["eta"])):
        col = "#007828" if e <= 1.0 else "#aa0000"
        ax.plot(x, y, "x", color=col, ms=7, mew=2)
        if i == r["i_max"]:
            ax.plot(x, y, "o", mfc="none", mec="#0046a0", ms=15, mew=2)
        if F > 1e-9:
            ax.annotate("", xy=(x + fx * scale, y + fy * scale), xytext=(x, y),
                        arrowprops=dict(arrowstyle="-|>", color=col, lw=1.2))
        if labels != "all" and i != r["i_max"]:
            continue
        ax.text(x, y - 0.008, "{:.1f} kN ({:.2f})".format(F, e), color=col,
                ha="center", va="top", fontsize=7,
                bbox=dict(fc="white", ec="none", alpha=0.75, pad=1))

    ax.plot(cx, cy, "o", color="grey", ms=4)
    if r["ic"] is not None:
        ax.plot(*r["ic"], "o", color="#0046a0", ms=6)
        ax.annotate("rotationscenter", r["ic"], color="#0046a0",
                    xytext=(5, 5), textcoords="offset points", fontsize=8)

    n_, v_, m_ = r["case"]
    head = ("M{:g}, n = {}   N = {:g}, V = {:g} kN, M = {:g} kNm   "
            "Fmax = {:.1f} kN   udnyttelse = {:.2f}  {}").format(
        r["d_mm"], len(r["pts"]), n_, v_, m_, Fmax, r["util"],
        "OK" if r["ok"] else "IKKE OK")
    if not own:
        return ax
    ax.set_title(head, fontsize=9, color="#007828" if r["ok"] else "#aa0000")
    ax.set_aspect("equal")
    ax.autoscale_view()
    ax.margins(0.15)
    ax.set_xlabel("x [m]")
    ax.set_ylabel("y [m]")
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=150)
    if show:
        plt.show()
    return fig


# ------------------------------------------------- stålplade-rammehjørne
# Søjle (lodret, bredde b, x = 0..b) og skråt spær (højde h vinkelret på
# fiberen, fiberretning `slope`), forbundet med en indslidset stålplade.
# Spæret ligger over søjlen; søjletoppen er skåret efter spærets underside,
# og spærenden er skåret lodret ved søjlens yderside (x = b).
#   spærgruppe:  dorne i spæret over søjlen (parallelogrammet overlap_poly)
#   søjlegruppe: dorne i søjlen under spærets underside, højde H_col
# Begge grupper får knudens N, V og M (med excentriciteten fra
# systemknuden til gruppens tyngdepunkt). Pladen eftervises i snittet
# mellem grupperne (langs spærets underside) og for hulrandstryk.

def column_poly(b, H, slope):
    """Søjlens dornområde: lodret højde H under spærets underside.
    Side 1 = bund (søjlen fortsætter), 2 = yderside, 3 = top (skrå ende),
    4 = inderside."""
    t = -b * math.tan(math.radians(slope))      # undersiden ved x = 0
    return [(0.0, t - H), (b, -H), (b, 0.0), (0.0, t)]


def system_node(b, h, slope):
    """Skæring mellem søjlens akse (x = b/2) og spærets akse."""
    s = math.radians(slope)
    return (b / 2, -b / 2 * math.tan(s) + h / (2 * math.cos(s)))


def plate_check(F, M, node, a, b, t_p, f_y, f_u, Fmax_dowel, d_mm,
                f_ub, gamma_M0=1.10, gamma_M2=1.35, n_plates=1):
    """Stålpladen (EC3). F = (Fx, Fy) [kN] og M [kNm] i knuden `node`.
    Snittet går fra a til b [m] (fuldt tværsnit uden huller). Hulrandstryk
    pr. dorn med k1 = 2.5 og alpha_b = min(f_ub/f_u, 1) – forudsætter
    e1 >= 3 d0 og e2 >= 1.5 d0 i pladen. Med n_plates deles kræfterne
    ligeligt mellem pladerne."""
    F = (F[0] / n_plates, F[1] / n_plates)
    M = M / n_plates
    Fmax_dowel = Fmax_dowel / n_plates
    e = sub(b, a)
    L = math.hypot(*e)
    t_dir = (e[0] / L, e[1] / L)
    n_dir = perp(t_dir)
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    dx, dy = node[0] - mid[0], node[1] - mid[1]
    M_s = M + dx * F[1] - dy * F[0]             # moment i snittets midte
    N_s, V_s = dot(F, n_dir), dot(F, t_dir)
    t = t_p / 1000.0
    A, W = t * L, t * L ** 2 / 6
    sig = (abs(N_s) / A + abs(M_s) / W) / 1000.0     # MPa
    tau = 1.5 * abs(V_s) / A / 1000.0                # MPa, parabolsk
    vm = math.sqrt(sig ** 2 + 3 * tau ** 2)
    f_d = f_y / gamma_M0
    alpha_b = min(f_ub / f_u, 1.0)
    F_bRd = 2.5 * alpha_b * f_u * d_mm * t_p / gamma_M2 / 1000.0
    u_sec, u_b = vm / f_d, Fmax_dowel / F_bRd
    L_ = ["STÅLPLADE (DS/EN 1993-1-8, gamma_M0 = {:g}, gamma_M2 = {:g})"
          .format(gamma_M0, gamma_M2),
          "{} plade{} t = {:g} mm, f_y = {:g} MPa, f_u = {:g} MPa – "
          "kræfter pr. plade".format(n_plates, "r" if n_plates > 1 else "",
                                     t_p, f_y, f_u),
          "Snit langs spærets underside: L = {:.0f} mm".format(L * 1000),
          "N = {:.1f} kN, V = {:.1f} kN, M = {:.2f} kNm (i snittets midte)"
          .format(N_s, V_s, M_s),
          "sigma = N/A + M/W = {:.0f} MPa, tau = 1.5 V/A = {:.0f} MPa"
          .format(sig, tau),
          "von Mises = {:.0f} MPa <= f_y/gamma_M0 = {:.0f} MPa  ({:.2f})  {}"
          .format(vm, f_d, u_sec, "OK" if u_sec <= 1 else "IKKE OK"),
          "Hulrandstryk: F_b,Rd = 2.5 x {:.2f} x {:g} x {:g} x {:g} / {:g} "
          "= {:.1f} kN".format(alpha_b, f_u, d_mm, t_p, gamma_M2, F_bRd),
          "  F_max pr. plade = {:.1f} kN  ({:.2f})  {}".format(
              Fmax_dowel, u_b, "OK" if u_b <= 1 else "IKKE OK")]
    return {"util": max(u_sec, u_b), "ok": max(u_sec, u_b) <= 1,
            "lines": L_, "section": (a, b)}


def stalplade_hjorne(b=0.4, h=0.4, slope=-35.0, H_col=0.5, dorn="M12",
                     N=0.0, V=0.0, M=0.0, node=None, timber="GL24h",
                     t1=80.0, t_p=10.0, f_y=355.0, f_u=490.0, f_uk=360.0,
                     k_mod=0.8, gamma_M=1.3, rule="omhyllende",
                     both_signs=True, n_plates=1, t2=None, **kw):
    """Stålplade-rammehjørne. N, V og M er søjlens snitkræfter i
    systemknuden (N langs søjlen, V +90 grader, M mod uret). Øvrige
    argumenter (a_edge, s_par ...) går til solve()."""
    node = node or system_node(b, h, slope)
    common = dict(dorn=dorn, typ="A", N=N, V=V, M=M, load_pt=node,
                  load_angle=90, timber=timber, t1=t1, f_uk=f_uk,
                  k_mod=k_mod, gamma_M=gamma_M, rule=rule,
                  both_signs=both_signs, n_plates=n_plates, t2=t2, t_p=t_p,
                  **kw)
    # rækker langs hvert emnes egen fiber giver flest dorne
    rafter = solve(poly=overlap_poly(b, h, slope), grain=slope, free="4",
                   grid_angle=slope, **common)
    column = solve(poly=column_poly(b, H_col, slope), grain=90, free="1",
                   grid_angle=90, **common)
    rafter["members"][0]["name"] = "spær"
    column["members"][0]["name"] = "søjle"

    # pladen: snit langs spærets underside, styrende lasttilfælde
    t = -b * math.tan(math.radians(slope))
    worst = None
    for n_, v_, m_ in load_cases(N, V, M, both_signs):
        F = (-v_, n_)                           # N langs +y, V mod -x
        Fd = max(max(r["mags"]) for r in (rafter, column))
        pc = plate_check(F, m_, node, (0.0, t), (b, 0.0), t_p, f_y, f_u,
                         Fd, parse_dorn(dorn), f_uk, n_plates=n_plates)
        if worst is None or pc["util"] > worst["util"]:
            worst = pc
    plate = worst

    # stivhed: spær- og søjlegruppe i serie (pladen regnes stiv)
    K_ser = 1.0 / (1.0 / rafter["K_r"] + 1.0 / column["K_r"])
    stiff = ["HJØRNETS ROTATIONSSTIVHED (spær + søjle i serie, stiv plade)",
             "K_ser = 1/(1/{:.0f} + 1/{:.0f}) = {:.0f} kNm/rad (SLS)".format(
                 rafter["K_r"], column["K_r"], K_ser),
             "K_u = 2/3 K_ser = {:.0f} kNm/rad (ULS, kraftfordeling)".format(
                 2 * K_ser / 3),
             "K_fin = K_ser / (1 + psi2 k_def) – vind: psi2 = 0, så K_fin = "
             "K_ser"]
    phi0 = None
    if rafter["phi_ser"] is not None:
        phi = rafter["phi_ser"] + column["phi_ser"]
        M_ser = kw.get("M_ser")
        phi0 = phi - abs(M_ser) / K_ser
        stiff += ["Rotation ved M_ser = {:.2f} kNm: {:.2f} mrad i alt "
                  "(spær {:.2f} + søjle {:.2f})".format(
                      M_ser, phi * 1000, rafter["phi_ser"] * 1000,
                      column["phi_ser"] * 1000),
                  "  heraf hulluft ca. {:.2f} mrad – i rammemodellen: fjeder "
                  "K_ser + en ekstra knæk på {:.2f} mrad".format(
                      phi0 * 1000, phi0 * 1000)]

    ok = rafter["ok"] and column["ok"] and plate["ok"]
    grp = ("BOLT" if str(kw.get("fastener") or "").lower().startswith("b")
           else "DORN") + "GRUPPE"
    lines = (["=== SPÆRETS {} ===".format(grp)] + rafter["lines"]
             + ["", "=== SØJLENS {} ===".format(grp)] + column["lines"]
             + [""] + plate["lines"] + [""] + stiff
             + ["", "HJØRNE SAMLET: {}  (spær {:.2f}, søjle {:.2f}, plade "
                "{:.2f})".format("OK" if ok else "IKKE OK", rafter["util"],
                                 column["util"], plate["util"])])
    return {"rafter": rafter, "column": column, "plate": plate, "ok": ok,
            "node": node, "lines": lines, "b": b, "h": h, "slope": slope,
            "H_col": H_col, "K_ser": K_ser, "K_u": 2 * K_ser / 3,
            "phi_slip": phi0}


def plot_hjorne(res, show=True, save=None):
    """Hele hjørnet: begge dorngrupper med fælles pileskala, pladesnit og
    systemknude."""
    import matplotlib.pyplot as plt
    ra, co = res["rafter"], res["column"]
    Fmax = max(max(ra["mags"]), max(co["mags"]))
    scale = 0.2 * res["b"] / Fmax if Fmax > 0 else 0.0
    fig, ax = plt.subplots(figsize=(9, 10))
    plot_mpl(ra, scale=scale, ax=ax, labels="max")
    plot_mpl(co, scale=scale, ax=ax, labels="max")
    a, b = res["plate"]["section"]
    ax.plot([a[0], b[0]], [a[1], b[1]], color="#555555", lw=3, alpha=0.4)
    ax.text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, "pladesnit",
            color="#555555", fontsize=8, ha="center", va="bottom")
    ax.plot(*res["node"], "s", color="black", ms=6)
    ax.annotate("systemknude", res["node"], xytext=(6, -10),
                textcoords="offset points", fontsize=8)
    ax.set_title("Stålplade-hjørne: spær {:.2f}, søjle {:.2f}, plade {:.2f}"
                 "  {}".format(ra["util"], co["util"], res["plate"]["util"],
                               "OK" if res["ok"] else "IKKE OK"),
                 color="#007828" if res["ok"] else "#aa0000", fontsize=10)
    ax.set_aspect("equal")
    ax.autoscale_view()
    ax.margins(0.1)
    ax.set_xlabel("x [m]")
    ax.set_ylabel("y [m]")
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=150)
    if show:
        plt.show()
    return fig


# ------------------------------------------------------------ Rhino-hjælpere

def _unit_to_m():
    doc = Rhino.RhinoDoc.ActiveDoc
    if doc is None:
        return 1.0
    return Rhino.RhinoMath.UnitScale(doc.ModelUnitSystem,
                                     Rhino.UnitSystem.Meters)


def _coerce_curve(obj):
    if obj is None or isinstance(obj, rg.Curve):
        return obj
    try:
        import rhinoscriptsyntax as rs
        return rs.coercecurve(obj)
    except Exception:
        return None


def _d(v, default):
    return default if v is None else v


if IN_RHINO:
    RED = sd.Color.FromArgb(170, 0, 0)
    GREEN = sd.Color.FromArgb(0, 120, 40)
    GREY = sd.Color.FromArgb(120, 120, 120)
    BLUE = sd.Color.FromArgb(0, 70, 160)
    BROWN = sd.Color.FromArgb(138, 109, 59)


class MyComponent(Grasshopper.Kernel.GH_ScriptInstance if IN_RHINO
                  else object):

    def RunScript(self, area, x_size, y_size, dorn, typ, grain, free,
                  grain_mid, free_mid, grid_angle, a_edge, a_end, s_par,
                  s_perp, pts, N, V, M, load_pt, load_angle, both_signs,
                  n_plates, t_p, fastener, d_w, t_w, slip, M_ser, rule,
                  timber, t1, t2, f_uk, k_mod, gamma_M, use_nef, Fv_Rd,
                  scale, plot):
        self._draw = None
        empty = (None,) * 15
        lvl = Grasshopper.Kernel.GH_RuntimeMessageLevel

        typ = str(typ or "A").strip().upper()
        plot = _d(plot, True)
        u = _unit_to_m()                      # model-enhed -> m
        d_mm = parse_dorn(dorn)

        try:
            # --- område (regnes i meter, tegnes i model-enheder)
            crv = _coerce_curve(area)
            z = 0.0
            if crv is not None:
                okp, pl = crv.TryGetPolyline()
                if not okp:
                    raise ValueError("area skal være en lukket polylinje")
                V3 = list(pl)
                if V3[0].DistanceTo(V3[-1]) < 1e-9:
                    V3 = V3[:-1]
                z = V3[0].Z
                P = [(p.X * u, p.Y * u) for p in V3]
            else:
                P = rect_poly(float(_d(x_size, 0.333)) * u,
                              float(_d(y_size, 0.4)) * u)

            mems = members(typ, grain, free, grain_mid, free_mid)
            bolt = str(fastener or "dorn").lower().startswith("b")
            auto, Q = layout(P, d_mm / 1000.0, mems, _d(a_edge, 4.0),
                             _d(a_end, 7.0), _d(s_par, 5.0),
                             _d(s_perp, 4.0 if bolt else 3.0), grid_angle)
            Pm = [(p.X * u, p.Y * u) for p in pts] if pts else auto
            if not Pm:
                raise ValueError("Ingen dorne – området er for lille til "
                                 "kant-/endeafstandene.")
            lp = None
            if load_pt is not None:
                lp = (load_pt.X * u, load_pt.Y * u)
            r = analyse(Pm, P, d_mm, typ, grain, free, grain_mid, free_mid,
                        N, V, M, lp, _d(both_signs, True), rule, timber,
                        _d(t1, 80.0), t2, _d(f_uk, 360.0), _d(k_mod, 0.8),
                        _d(gamma_M, 1.3), _d(use_nef, True), Fv_Rd,
                        load_angle, fastener, d_w, t_w, slip, M_ser,
                        int(_d(n_plates, 1)), t_p)
        except ValueError as exc:
            self.Component.AddRuntimeMessage(lvl.Error, str(exc))
            return empty
        if not r["ok"]:
            self.Component.AddRuntimeMessage(
                lvl.Warning, "Kontrol IKKE OK – udnyttelse {:.2f}".format(
                    r["util"]))

        def to_model(p):
            return rg.Point3d(p[0] / u, p[1] / u, z)

        Pts = [to_model(p) for p in Pm]
        F_vec = [rg.Vector3d(fx, fy, 0) for fx, fy in r["forces"]]
        F = r["mags"]
        Fmax = max(F)
        c = to_model(r["centroid"])
        IC = to_model(r["ic"]) if r["ic"] is not None else None
        outline = rg.Polyline([to_model(p) for p in P + P[:1]])
        inner = rg.Polyline([to_model(p) for p in Q + Q[:1]]) if Q else None

        bb = outline.BoundingBox
        size = max(bb.Max.X - bb.Min.X, bb.Max.Y - bb.Min.Y)
        if not scale:
            scale = 0.35 * size / Fmax if Fmax > 0 else 0.0
        arrows = [rg.Line(p, p + v * scale) for p, v in zip(Pts, F_vec)]

        n_, v_, m_ = r["case"]
        summary = [
            "Dorn: M{:g}, n = {}, typ {}".format(d_mm, len(Pts), typ),
            "Styrende: N = {:g}, V = {:g} kN, M = {:g} kNm".format(
                n_, v_, m_),
            "Ip = {:.5f} m2, Fmax = {:.2f} kN".format(r["Ip"], Fmax),
            "Udnyttelse = {:.2f}  {}".format(
                r["util"], "OK" if r["ok"] else "IKKE OK"),
        ]
        info = "\n".join(summary + [""] + r["lines"])

        if plot:
            labels = [(t, to_model((m[0] + n[0] * 0.03 * size * u,
                                    m[1] + n[1] * 0.03 * size * u)))
                      for t, m, n in side_labels(P, mems)]
            grains = []
            for k, m in enumerate(mems):
                o = rg.Point3d(bb.Min.X - 0.12 * size,
                               bb.Max.Y - 0.1 * size * k, z)
                gv = rg.Vector3d(m["g"][0], m["g"][1], 0) * (0.1 * size)
                grains.append((rg.Line(o - gv, o + gv), m["name"]))
            self._draw = {
                "P": Pts, "F": F, "eta": r["eta"], "i_max": r["i_max"],
                "arrows": arrows, "outline": outline, "inner": inner,
                "c": c, "IC": IC, "info": summary, "ok": r["ok"],
                "labels": labels, "grains": grains, "bb": bb, "size": size,
                "z": z,
            }
            box = rg.BoundingBox(bb.Min, bb.Max)
            for a in arrows:
                box.Union(a.BoundingBox)
            for ln, _ in grains:
                box.Union(ln.BoundingBox)
            if IC is not None:
                box.Union(IC)
            box.Inflate(0.1 * size)
            self._bbox = box

        return (Pts, F_vec, F, Fmax, r["Ip"], c, IC, arrows,
                outline.ToNurbsCurve(),
                inner.ToNurbsCurve() if inner else None,
                r["Rd"], r["eta"], r["util"], r["ok"], info)

    # ------------------------------------------------------------- preview
    @property
    def ClippingBox(self):
        if getattr(self, "_draw", None):
            return self._bbox
        return rg.BoundingBox.Empty

    def DrawViewportWires(self, *a):
        dr = getattr(self, "_draw", None)
        if not dr:
            return
        dsp = a[-1].Display                   # IGH_PreviewArgs er sidste arg

        dsp.DrawPolyline(dr["outline"], RED, 1)
        if dr["inner"] is not None:
            dsp.DrawDottedPolyline(dr["inner"], GREY, True)
        for t, p in dr["labels"]:
            dsp.Draw2dText(t, RED, p, True, 12)
        for ln, name in dr["grains"]:
            dsp.DrawArrow(ln, BROWN)
            dsp.Draw2dText("fiber " + name, BROWN, ln.To, False, 12)

        # grøn = OK, rød = overskredet, blå ring = styrende dorn
        for i, (p, f, e, ln) in enumerate(
                zip(dr["P"], dr["F"], dr["eta"], dr["arrows"])):
            col = GREEN if e <= 1.0 else RED
            dsp.DrawPoint(p, Rhino.Display.PointStyle.X, 5, col)
            if i == dr["i_max"]:
                dsp.DrawPoint(p, Rhino.Display.PointStyle.RoundActivePoint,
                              9, BLUE)
            if ln.Length > 1e-9:
                dsp.DrawArrow(ln, col)
            dsp.Draw2dText("{:.1f} kN ({:.2f})".format(f, e), col, p, True,
                           13)

        dsp.DrawPoint(dr["c"], Rhino.Display.PointStyle.Circle, 4, GREY)
        if dr["IC"] is not None:
            dsp.DrawPoint(dr["IC"], Rhino.Display.PointStyle.ActivePoint,
                          5, BLUE)
            dsp.Draw2dText("rotationscenter", BLUE, dr["IC"], False, 12)

        bb, size, z = dr["bb"], dr["size"], dr["z"]
        dy = 0.06 * size
        n = len(dr["info"])
        for i, t in enumerate(dr["info"]):
            pt = rg.Point3d(bb.Min.X, bb.Max.Y + dy * (n - i), z)
            col = (GREEN if dr["ok"] else RED) if i == n - 1 else RED
            dsp.Draw2dText(t, col, pt, False, 14)


if __name__ == "__main__":
    # Stålplade-rammehjørne: søjle + skråt spær. N, V og M er søjlens
    # snitkræfter i systemknuden (N langs søjlen, V +90 grader, M mod uret).
    res = stalplade_hjorne(
        b=0.4,                  # søjlebredde [m]
        h=0.4,                  # spærhøjde vinkelret på fiberen [m]
        slope=-35,              # spærets fiberretning [grader]
        H_col=0.5,              # højde af søjlens dornområde [m]
        dorn="M12",
        fastener="bolt",        # "bolt" (med rebvirkning) eller "dorn"
        d_w=36, t_w=3.6,        # skive [mm]
        N=[27.42], V=[15.49], M=[43.55],  # lasttilfælde [kN], [kN], [kNm]
        M_ser=43.55 / 1.5,      # moment i anvendelsesgrænsetilstand [kNm]
        slip=1.0,               # hulluft pr. bolt [mm] (træ d+1)
        rule="omhyllende",      # eller "dorn"
        n_plates=1,             # 1 plade: t1 = træ på hver side
        timber="GL24h", t1=165,  # 2 plader: t1 = ydertræ, t2 = midtertræ
        t2=None,                # fx n_plates=2, t1=100, t2=120
        t_p=12, f_y=355, f_u=490,  # plade(r) S355
        f_uk=300,
        k_mod=0.9,              # vind: kort (0.9) – momentan (1.1)
        gamma_M=1.35,
    )
    print("\n".join(res["lines"]))
    plot_hjorne(res)

    # Én dorngruppe for sig (fx i Grasshopper-stil):
    # r = solve(poly=overlap_poly(0.4, 0.4, -35), grain=-35, free="4",
    #           N=[27.42], V=[15.49], M=[43.55], load_angle=90)
    # print("\n".join(r["lines"])); plot_mpl(r)
