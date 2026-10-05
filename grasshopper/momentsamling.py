"""Momentsamling med dorne – elastisk kraftfordeling, EC5-kontrol og plot.

Kører både som Grasshopper Python 3-komponent (Rhino 8) og lokalt:
    python momentsamling.py        (ret værdierne nederst i filen)

To samlingstyper:
  typ "A"  Indslidset stålplade, dorne i ét træemne (dobbeltsnit, 8.11).
           Fiberretning = grain. I et rammehjørne regnes bjælkens og
           søjlens dorngruppe hver for sig.
  typ "B"  Træ-træ: de samme dorne går gennem to emner med fibre i x og y
           (fx delt søjle omkring bjælken). Dobbeltsnit (8.7): sidetræ med
           tykkelse t1, midtertræ med tykkelse t2 og fiber "mid".

Sider: 1 = bund, 2 = højre, 3 = top, 4 = venstre. For hvert emne er en
side en ENDE (vinkelret på fiberen) eller en KANT (parallel med fiberen),
medmindre emnet fortsætter forbi den (free_x / free_y) – så gælder der
intet krav, og dornene placeres en halv dornafstand fra siden.

Afstandskrav (rule):
  "omhyllende"  ugunstigste kraftretning (a1 = 5d, a2 = 3d,
                a3,t = max(7d; 80 mm), a4,t = 4d)
  "dorn"        tabel 8.5 for hver dorn med dens egen kraftretning, i alle
                lasttilfælde (og med modsat fortegn, hvis both_signs).

Opsætning i Grasshopper (højreklik på hver input):
  Geometri
    area      Curve,  Item     (valgfri – ellers x_size/y_size fra 0,0)
    x_size    float,  Item     model-enheder (0.333)
    y_size    float,  Item     model-enheder (0.369)
    dorn      str,    Item     "M12" eller 12 (mm)
    typ       str,    Item     "A" eller "B" ("A")
    grain     str,    Item     typ A: fiberretning "x"/"y". Begge typer:
                               N virker langs denne akse ("y")
    free_x    str,    Item     sider hvor emnet med fiber i x fortsætter,
                               fx "2" eller "2,3" (valgfri)
    free_y    str,    Item     det samme for emnet med fiber i y
    a_edge    float,  Item     kantafstand til placering [x d] (4)
    a_end     float,  Item     endeafstand til placering [x d] (7)
    s_par     float,  Item     dornafstand langs fiberen [x d] (5)
    s_perp    float,  Item     dornafstand på tværs [x d] (3)
    pts       Point3d, List    (valgfri – egne dornplaceringer)
  Last (lister = lasttilfælde; korte lister gentages)
    N         float,  List     [kN] langs grain
    V         float,  List     [kN] vinkelret
    M         float,  List     [kNm], positiv mod uret
    load_pt   Point3d, Item    (valgfri – angrebspunkt for N og V)
    both_signs bool,  Item     regn også med modsat fortegn (True)
  Kontrol
    rule      str,    Item     "omhyllende" eller "dorn" ("omhyllende")
    timber    str,    Item     "GL24h", "C24" ... eller rho_k (GL24h)
    t1        float,  Item     typ A: træ på hver side af pladen [mm];
                               typ B: sidetræets tykkelse [mm] (80)
    t2        float,  Item     typ B: midtertræets tykkelse [mm] (2*t1)
    mid       str,    Item     typ B: midtertræets fiber "x"/"y" ("x")
    f_uk      float,  Item     dornens trækstyrke [MPa] (360)
    k_mod     float,  Item     (0.8)
    gamma_M   float,  Item     (1.3)
    use_nef   bool,   Item     n_ef for rækker langs fiberen (True)
    Fv_Rd     float,  Item     (valgfri – fast bæreevne pr. dorn [kN])
  Visning
    scale     float,  Item     pilelængde pr. kN (auto)
    plot      bool,   Item     tegn i viewporten (True)

Outputs: pts, F_vec, F, Fmax, Ip, centroid, IC, arrows, outline, inner,
Rd, eta, util, ok, info.  (Pile og kræfter er fra det styrende
lasttilfælde.)

Kraftfordeling (elastisk, stiv plade):
    F_i = F/n + M_tot/Ip * (-y_i, x_i),   Ip = sum(x_i^2 + y_i^2)

Bæreevne pr. dorn (EN 1995-1-1), alpha = vinkel mellem kraft og fiber:
    f_h,0,k = 0.082 (1 - 0.01 d) rho_k;  f_h,a,k = f_h,0,k/(k90 sin^2 + cos^2)
    M_y,Rk = 0.3 f_u,k d^2.6
    typ A: F_v,Rk = 2 min(f, g, h)  (8.11)
    typ B: F_v,Rk = 2 min(g, h, j, k)  (8.7), beta = f_h,mid / f_h,side
    F_v,Rd = n_ef/n k_mod F_v,Rk / gamma_M   (typ B: mindste n_ef af emnerne)

Ikke med: stålpladen (EC3), blokforskydning (bilag A), kløvning (8.1.4).
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

SIDE_NAMES = {1: "bund", 2: "højre", 3: "top", 4: "venstre"}
SIDE_NORMAL = {1: (0.0, -1.0), 2: (1.0, 0.0), 3: (0.0, 1.0), 4: (-1.0, 0.0)}
GRAIN_VEC = {"x": (1.0, 0.0), "y": (0.0, 1.0)}


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
    out = set()
    for it in items:
        s = int(float(it))
        if s not in SIDE_NAMES:
            raise ValueError("Side skal være 1-4, fik {}".format(it))
        out.add(s)
    return out


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


def members(typ, grain, free_x, free_y):
    """[(fiber, frie sider)] – ét emne for typ A, to for typ B."""
    fx, fy = parse_sides(free_x), parse_sides(free_y)
    if typ == "B":
        return [("x", fx), ("y", fy)]
    return [(grain, fx if grain == "x" else fy)]


def side_type(grain, side, free):
    if side in free:
        return "fri"
    n = SIDE_NORMAL[side]
    g = GRAIN_VEC[grain]
    return "ende" if abs(n[0] * g[0] + n[1] * g[1]) > 0.5 else "kant"


def grid_1d(length, e_lo, e_hi, s_min):
    """Positioner langs én akse med afstand e_lo/e_hi til siderne og
    mindst s_min imellem, jævnt fordelt."""
    inner = length - e_lo - e_hi
    if inner < -1e-12:
        return []
    n = int(math.floor(inner / s_min + 1e-9)) + 1 if s_min > 0 else 1
    if n == 1:
        return [e_lo + inner / 2.0]
    step = inner / (n - 1)
    return [e_lo + i * step for i in range(n)]


def layout(Lx, Ly, d, mems, a_edge=4.0, a_end=7.0, s_par=5.0, s_perp=3.0):
    """Dornnet i området (0..Lx, 0..Ly). d og Lx/Ly i samme enhed.
    Returnerer (xs, ys, afstande {side: afstand})."""
    # afstand mellem dorne pr. retning: langs fiber for et af emnerne -> s_par
    sx = max((s_par if g == "x" else s_perp) for g, _ in mems) * d
    sy = max((s_par if g == "y" else s_perp) for g, _ in mems) * d
    dist = {}
    for side in SIDE_NAMES:
        req = [{"ende": a_end, "kant": a_edge}[side_type(g, side, fr)] * d
               for g, fr in mems if side_type(g, side, fr) != "fri"]
        if req:
            dist[side] = max(req)
        else:                           # fortsætter: halv dornafstand
            dist[side] = (sx if side in (2, 4) else sy) / 2.0
    xs = grid_1d(Lx, dist[4], dist[2], sx)
    ys = grid_1d(Ly, dist[1], dist[3], sy)
    return xs, ys, dist


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


def angle_to_grain(f, grain):
    """Vinkel 0..90 grader mellem kraft og fiber."""
    F = math.hypot(f[0], f[1])
    if F < 1e-12:
        return 0.0
    g = GRAIN_VEC[grain]
    return math.degrees(math.acos(min(1.0, abs(f[0] * g[0] + f[1] * g[1])
                                      / F)))


def f_h_alpha(d, rho_k, alpha_deg, hardwood=False):
    f_h0 = 0.082 * (1 - 0.01 * d) * rho_k
    k90 = (0.90 if hardwood else 1.35) + 0.015 * d
    a = math.radians(alpha_deg)
    return f_h0 / (k90 * math.sin(a) ** 2 + math.cos(a) ** 2), f_h0, k90


def johansen_steel_center(d, t1, rho_k, f_uk, alpha_deg, hardwood=False):
    """EC5 (8.11): stålplade som midterdel, dobbeltsnit, dorn (F_ax = 0).
    Returnerer F_v,Rk pr. dorn [kN] og mellemregninger."""
    f_ha, f_h0, k90 = f_h_alpha(d, rho_k, alpha_deg, hardwood)
    M_y = 0.3 * f_uk * d ** 2.6
    modes = {
        "f": f_ha * t1 * d,
        "g": f_ha * t1 * d * (math.sqrt(2 + 4 * M_y / (f_ha * d * t1 ** 2))
                              - 1),
        "h": 2.3 * math.sqrt(M_y * f_ha * d),
    }
    mode = min(modes, key=modes.get)
    return 2 * modes[mode] / 1000.0, {
        "f_h0": f_h0, "k90": k90, "f_h": {"side": f_ha}, "M_y": M_y,
        "modes": modes, "mode": mode}


def johansen_timber_double(d, t1, t2, rho_k, f_uk, a_side, a_mid,
                           hardwood=False):
    """EC5 (8.7): træ-træ, dobbeltsnit, dorn (F_ax = 0). Sidetræ t1 med
    vinkel a_side til fiberen, midtertræ t2 med a_mid."""
    f_h1, f_h0, k90 = f_h_alpha(d, rho_k, a_side, hardwood)
    f_h2, _, _ = f_h_alpha(d, rho_k, a_mid, hardwood)
    M_y = 0.3 * f_uk * d ** 2.6
    b = f_h2 / f_h1
    modes = {
        "g": f_h1 * t1 * d,
        "h": 0.5 * f_h2 * t2 * d,
        "j": 1.05 * f_h1 * t1 * d / (2 + b) * (
            math.sqrt(2 * b * (1 + b)
                      + 4 * b * (2 + b) * M_y / (f_h1 * d * t1 ** 2)) - b),
        "k": 1.15 * math.sqrt(2 * b / (1 + b))
        * math.sqrt(2 * M_y * f_h1 * d),
    }
    mode = min(modes, key=modes.get)
    return 2 * modes[mode] / 1000.0, {
        "f_h0": f_h0, "k90": k90, "f_h": {"side": f_h1, "midte": f_h2},
        "beta": b, "M_y": M_y, "modes": modes, "mode": mode}


def n_ef_factor(n, a1, d, alpha_deg):
    """n_ef,alpha / n for en række med n dorne og afstand a1 (samme enhed
    som d). EC5 (8.34) og 8.5.1.1(4)."""
    if n <= 1 or a1 <= 0:
        return 1.0
    nef0 = min(n, n ** 0.9 * (a1 / (13.0 * d)) ** 0.25)
    nef = nef0 + (n - nef0) * min(abs(alpha_deg), 90.0) / 90.0
    return nef / n


def rows_along_grain(points, grain, tol=1e-6):
    """Rækker langs fiberen: liste af indeks-lister, sorteret langs fiberen,
    og for hver dorn (antal i rækken, mindste afstand i rækken)."""
    gi, pi = (0, 1) if grain == "x" else (1, 0)
    rows = []
    for idx, p in enumerate(points):
        for r in rows:
            if abs(points[r[0]][pi] - p[pi]) < tol:
                r.append(idx)
                break
        else:
            rows.append([idx])
    info = [None] * len(points)
    for r in rows:
        r.sort(key=lambda i: points[i][gi])
        gaps = [points[b][gi] - points[a][gi] for a, b in zip(r, r[1:])]
        gaps = [g for g in gaps if g > tol]
        a1 = min(gaps) if gaps else 0.0
        for i in r:
            info[i] = (len(r), a1)
    return rows, info


# ---- afstandskrav, tabel 8.5 (dorne)

def req_end(f, side, d, env):
    """Krævet afstand til en ENDE. d i meter."""
    a3t = max(7 * d, 0.080)
    F = math.hypot(f[0], f[1])
    if env or F < 1e-12:
        return a3t if env else 3 * d
    n = SIDE_NORMAL[side]
    th = math.degrees(math.acos(max(-1.0, min(1.0, (f[0] * n[0] + f[1] * n[1])
                                              / F))))
    if th <= 90:
        return a3t                                  # belastet ende
    if th < 150:
        return max(a3t * math.sin(math.radians(th)), 3 * d)
    return 3 * d


def req_edge(f, side, d, env):
    """Krævet afstand til en KANT. d i meter."""
    if env:
        return 4 * d
    F = math.hypot(f[0], f[1])
    if F < 1e-12:
        return 3 * d
    n = SIDE_NORMAL[side]
    c = (f[0] * n[0] + f[1] * n[1]) / F            # = sin(alpha) mod kanten
    if c > 0:                                       # belastet kant
        return max((2 + 2 * c) * d, 3 * d)
    return 3 * d


def req_a1(f, grain, d, env):
    if env:
        return 5 * d
    a = math.radians(angle_to_grain(f, grain))
    return (3 + 2 * abs(math.cos(a))) * d


def distance_checks(points, box, d, mems, case_forces, env):
    """Afstande mod tabel 8.5. Returnerer [(navn, aktuel, krav, ok)] med
    den dorn/det par, der har mindst margin."""
    x0, y0, x1, y1 = box
    dist_to = {1: lambda p: p[1] - y0, 2: lambda p: x1 - p[0],
               3: lambda p: y1 - p[1], 4: lambda p: p[0] - x0}
    out = []
    many = len(mems) > 1
    for g, free in mems:
        tag = " (fiber {})".format(g) if many else ""
        rows, _ = rows_along_grain(points, g)

        # a1 langs fiberen
        worst = None
        for r in rows:
            for i, j in zip(r, r[1:]):
                act = math.hypot(points[j][0] - points[i][0],
                                 points[j][1] - points[i][1])
                req = max(req_a1(fs[k], g, d, env)
                          for fs in case_forces for k in (i, j))
                if worst is None or act - req < worst[1] - worst[2]:
                    worst = ("a1" + tag, act, req)
        if worst:
            out.append(worst)

        # a2 mellem rækker
        pi = 1 if g == "x" else 0
        lines = sorted(set(round(points[r[0]][pi], 9) for r in rows))
        gaps = [b - a for a, b in zip(lines, lines[1:])]
        if gaps:
            out.append(("a2" + tag, min(gaps), 3 * d))

        # ender og kanter
        for side in sorted(SIDE_NAMES):
            st = side_type(g, side, free)
            if st == "fri":
                continue
            fn = req_end if st == "ende" else req_edge
            worst = None
            for i, p in enumerate(points):
                act = dist_to[side](p)
                req = max(fn(fs[i], side, d, env) for fs in case_forces)
                if worst is None or act - req < worst[0] - worst[1]:
                    worst = (act, req)
            name = "{} side {} {}{}".format(
                "a3" if st == "ende" else "a4", side, SIDE_NAMES[side], tag)
            out.append((name, worst[0], worst[1]))
    return [(n, a, r, a >= r - 1e-9) for n, a, r in out]


def analyse(points, box, d_mm, typ="A", grain="y", free_x=None, free_y=None,
            N=0.0, V=0.0, M=0.0, load_pt=None, both_signs=True,
            rule="omhyllende", timber="GL24h", t1=80.0, t2=None, mid="x",
            f_uk=360.0, k_mod=0.8, gamma_M=1.3, use_nef=True, Fv_Rd=None):
    """Kraftfordeling og kontrol for alle lasttilfælde. points, box og
    load_pt i meter. Returnerer dict (styrende lasttilfælde øverst)."""
    typ = str(typ or "A").strip().upper()
    grain = str(grain or "y").strip().lower()
    mid = str(mid or "x").strip().lower()
    rule = str(rule or "omhyllende").strip().lower()
    env = not rule.startswith("d")
    t2 = 2 * t1 if not t2 else t2
    rho_k, tname, hard = parse_timber(timber)
    d = d_mm / 1000.0
    mems = members(typ, grain, free_x, free_y)
    side_g = "y" if mid == "x" else "x"
    cases = load_cases(N, V, M, both_signs)

    rinfo = {g: rows_along_grain(points, g)[1] for g, _ in mems}

    def capacity(f, i):
        if Fv_Rd:
            return float(Fv_Rd), None
        if typ == "B":
            a_s, a_m = angle_to_grain(f, side_g), angle_to_grain(f, mid)
            Rk, mid_ = johansen_timber_double(d_mm, t1, t2, rho_k, f_uk,
                                              a_s, a_m, hard)
        else:
            Rk, mid_ = johansen_steel_center(
                d_mm, t1, rho_k, f_uk, angle_to_grain(f, grain), hard)
        kef = 1.0
        if use_nef:
            kef = min(n_ef_factor(rinfo[g][i][0], rinfo[g][i][1], d,
                                  angle_to_grain(f, g)) for g, _ in mems)
        mid_ = dict(mid_, kef=kef, Rk=Rk)
        return kef * k_mod * Rk / gamma_M, mid_

    results = []
    for (n_, v_, m_) in cases:
        Fx, Fy = (n_, v_) if grain == "x" else (v_, n_)
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
    spacing = distance_checks(points, box, d, mems,
                              [r["forces"] for r in results], env)
    ok = util <= 1.0 and all(s[3] for s in spacing)

    # ---- rapport
    if typ == "B":
        head = ("KONTROL (DS/EN 1995-1-1, træ-træ, dobbeltsnit (8.7)) – "
                "sidetræ fiber {}, midtertræ fiber {}".format(side_g, mid))
        thick = "t1 = {:g} mm (side), t2 = {:g} mm (midte)".format(t1, t2)
    else:
        head = ("KONTROL (DS/EN 1995-1-1, indslidset stålplade, "
                "dobbeltsnit (8.11)) – fiber {}".format(grain))
        thick = "t1 = {:g} mm".format(t1)
    L = [head,
         "Træ: {}, rho_k = {:g} kg/m3; dorn d = {:g} mm, f_u,k = {:g} MPa"
         .format(tname, rho_k, d_mm, f_uk),
         "{}, k_mod = {:g}, gamma_M = {:g}".format(thick, k_mod, gamma_M)]
    for g, fr in mems:
        L.append("Sider, emne med fiber {}: {}".format(g, ", ".join(
            "{} {}".format(s, side_type(g, s, fr)) for s in sorted(SIDE_NAMES))))
    L.append("Lasttilfælde: {}{}; styrende N = {:g}, V = {:g}, M = {:g}"
             .format(len(cases), " (inkl. modsat fortegn)" if both_signs
                     else "", *gov["case"]))
    f = gov["forces"][i_max]
    rd, mid_ = capacity(f, i_max)
    if mid_ is None:
        L.append("F_v,Rd = {:.2f} kN (givet)".format(rd))
    else:
        if typ == "B":
            L.append("Styrende dorn nr. {}: F = {:.2f} kN, alpha = {:.1f} "
                     "(side) / {:.1f} grader (midte)".format(
                         i_max + 1, gov["mags"][i_max],
                         angle_to_grain(f, side_g), angle_to_grain(f, mid)))
        else:
            L.append("Styrende dorn nr. {}: F = {:.2f} kN, alpha = {:.1f} "
                     "grader".format(i_max + 1, gov["mags"][i_max],
                                     angle_to_grain(f, grain)))
        L += ["f_h,0,k = 0.082(1-0.01d)rho_k = {:.2f} MPa, k90 = {:.3f}"
              .format(mid_["f_h0"], mid_["k90"]),
              "f_h,a,k: " + ", ".join("{} {:.2f} MPa".format(k, v)
                                      for k, v in mid_["f_h"].items()),
              "M_y,Rk = 0.3 f_u,k d^2.6 = {:.0f} Nmm".format(mid_["M_y"]),
              "Brudformer pr. snit: " + ", ".join(
                  "{} = {:.2f}".format(k, v / 1000)
                  for k, v in mid_["modes"].items()) + " kN",
              "F_v,Rk = 2 x {:.2f} = {:.2f} kN (brudform {})".format(
                  mid_["Rk"] / 2, mid_["Rk"], mid_["mode"]),
              "n_ef/n = {:.3f}".format(mid_["kef"]) if use_nef
              else "n_ef ikke medregnet",
              "F_v,Rd = {:.3f} x {:g} x {:.2f} / {:g} = {:.2f} kN".format(
                  mid_["kef"], k_mod, mid_["Rk"], gamma_M, rd)]
    L.append("eta = {:.2f} / {:.2f} = {:.2f}  {}".format(
        gov["mags"][i_max], rd, util, "OK" if util <= 1 else "IKKE OK"))
    L.append("Afstande ({}):".format("ugunstigste retning" if env
                                     else "pr. dorn efter kraftretning"))
    for n_, a, r, sok in spacing:
        L.append("  {} = {:.0f} mm >= {:.0f} mm  {}".format(
            n_, a * 1000, r * 1000, "OK" if sok else "IKKE OK"))
    L.append("SAMLET: " + ("OK" if ok else "IKKE OK"))

    out = dict(gov)
    out.update({"util": util, "i_max": i_max, "ok": ok, "spacing": spacing,
                "lines": L, "cases": results, "members": mems})
    return out


# ------------------------------------------------------- lokalt (VS Code)

def solve(x_size=0.333, y_size=0.369, dorn="M12", typ="A", grain="y",
          free_x=None, free_y=None, a_edge=4.0, a_end=7.0, s_par=5.0,
          s_perp=3.0, pts=None, **kw):
    """Placerer dornene og kører analyse(). Område fra (0, 0) i meter.
    Øvrige argumenter (N, V, M, rule, timber, t1 ...) går til analyse()."""
    typ = str(typ).strip().upper()
    grain = str(grain).strip().lower()
    d_mm = parse_dorn(dorn)
    mems = members(typ, grain, free_x, free_y)
    xs, ys, dist = layout(x_size, y_size, d_mm / 1000.0, mems,
                          a_edge, a_end, s_par, s_perp)
    if pts is None:
        pts = [(x, y) for y in ys for x in xs]
    if not pts:
        raise ValueError("Ingen dorne – området er for lille til "
                         "kant-/endeafstandene.")
    r = analyse(pts, (0.0, 0.0, x_size, y_size), d_mm, typ, grain, free_x,
                free_y, **kw)
    r.update({"pts": pts, "size": (x_size, y_size), "dist": dist,
              "d_mm": d_mm})
    return r


def side_label(side, mems):
    t = [side_type(g, side, fr) for g, fr in mems]
    if len(mems) == 1:
        return "{} {}".format(side, t[0])
    return "{} {}(x)/{}(y)".format(side, t[0], t[1])


def plot_mpl(r, scale=None, show=True, save=None):
    """Tegner samlingen: pile og kræfter fra det styrende lasttilfælde."""
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    Lx, Ly = r["size"]
    dist = r["dist"]
    Fmax = max(r["mags"])
    if not scale:
        scale = 0.4 * max(Lx, Ly) / Fmax if Fmax > 0 else 0.0

    fig, ax = plt.subplots(figsize=(8, 8))
    ax.add_patch(Rectangle((0, 0), Lx, Ly, fill=False, ec="#aa0000"))
    ix0, iy0 = dist[4], dist[1]
    iw, ih = Lx - dist[4] - dist[2], Ly - dist[1] - dist[3]
    if iw > 0 and ih > 0:
        ax.add_patch(Rectangle((ix0, iy0), iw, ih, fill=False, ec="grey",
                               ls=":"))
    pos = {1: (Lx / 2, 0), 2: (Lx, Ly / 2), 3: (Lx / 2, Ly), 4: (0, Ly / 2)}
    for s, (mx, my) in pos.items():
        ax.text(mx, my, side_label(s, r["members"]), color="#aa0000",
                ha="center", va="center", fontsize=8,
                rotation=90 if s in (2, 4) else 0,
                bbox=dict(fc="white", ec="none", pad=1))

    for i, ((x, y), (fx, fy), F, e) in enumerate(
            zip(r["pts"], r["forces"], r["mags"], r["eta"])):
        col = "#007828" if e <= 1.0 else "#aa0000"
        ax.plot(x, y, "x", color=col, ms=7, mew=2)
        if i == r["i_max"]:
            ax.plot(x, y, "o", mfc="none", mec="#0046a0", ms=15, mew=2)
        if F > 1e-9:
            ax.annotate("", xy=(x + fx * scale, y + fy * scale), xytext=(x, y),
                        arrowprops=dict(arrowstyle="-|>", color=col, lw=1.2))
        ax.text(x, y - 0.01, "{:.1f} kN ({:.2f})".format(F, e), color=col,
                ha="center", va="top", fontsize=7,
                bbox=dict(fc="white", ec="none", alpha=0.75, pad=1))

    cx, cy = r["centroid"]
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


class MyComponent(Grasshopper.Kernel.GH_ScriptInstance if IN_RHINO
                  else object):

    def RunScript(self, area, x_size, y_size, dorn, typ, grain, free_x,
                  free_y, a_edge, a_end, s_par, s_perp, pts, N, V, M,
                  load_pt, both_signs, rule, timber, t1, t2, mid, f_uk,
                  k_mod, gamma_M, use_nef, Fv_Rd, scale, plot):
        self._draw = None
        empty = (None,) * 15
        err = Grasshopper.Kernel.GH_RuntimeMessageLevel

        typ = str(typ or "A").strip().upper()
        grain = str(grain or "y").strip().lower()
        plot = _d(plot, True)
        u = _unit_to_m()                      # model-enhed -> m
        d_mm = parse_dorn(dorn)

        # --- område (regnes i meter, tegnes i model-enheder)
        crv = _coerce_curve(area)
        if crv is not None:
            bb = crv.GetBoundingBox(True)
            x0, y0, z = bb.Min.X, bb.Min.Y, bb.Min.Z
            Lx, Ly = bb.Max.X - x0, bb.Max.Y - y0
        else:
            x0, y0, z = 0.0, 0.0, 0.0
            Lx, Ly = float(_d(x_size, 0.333)), float(_d(y_size, 0.369))

        try:
            mems = members(typ, grain, free_x, free_y)
            xs, ys, dist = layout(Lx * u, Ly * u, d_mm / 1000.0, mems,
                                  _d(a_edge, 4.0), _d(a_end, 7.0),
                                  _d(s_par, 5.0), _d(s_perp, 3.0))
            if pts:
                Pm = [((p.X - x0) * u, (p.Y - y0) * u) for p in pts]
            else:
                Pm = [(x, y) for y in ys for x in xs]
            if not Pm:
                raise ValueError("Ingen dorne – området er for lille til "
                                 "kant-/endeafstandene.")
            lp = None
            if load_pt is not None:
                lp = ((load_pt.X - x0) * u, (load_pt.Y - y0) * u)
            r = analyse(Pm, (0.0, 0.0, Lx * u, Ly * u), d_mm, typ, grain,
                        free_x, free_y, N, V, M, lp, _d(both_signs, True),
                        rule, timber, _d(t1, 80.0), t2, mid,
                        _d(f_uk, 360.0), _d(k_mod, 0.8), _d(gamma_M, 1.3),
                        _d(use_nef, True), Fv_Rd)
        except ValueError as exc:
            self.Component.AddRuntimeMessage(err.Error, str(exc))
            return empty
        if not r["ok"]:
            self.Component.AddRuntimeMessage(
                err.Warning, "Kontrol IKKE OK – udnyttelse {:.2f}".format(
                    r["util"]))

        def to_model(p):
            return rg.Point3d(x0 + p[0] / u, y0 + p[1] / u, z)

        P = [to_model(p) for p in Pm]
        F_vec = [rg.Vector3d(fx, fy, 0) for fx, fy in r["forces"]]
        F = r["mags"]
        Fmax = max(F)
        c = to_model(r["centroid"])
        IC = to_model(r["ic"]) if r["ic"] is not None else None

        outline = rg.Rectangle3d(
            rg.Plane(rg.Point3d(x0, y0, z), rg.Vector3d.ZAxis), Lx, Ly)
        iw = Lx - (dist[4] + dist[2]) / u
        ih = Ly - (dist[1] + dist[3]) / u
        inner = None
        if iw > 0 and ih > 0:
            inner = rg.Rectangle3d(rg.Plane(
                rg.Point3d(x0 + dist[4] / u, y0 + dist[1] / u, z),
                rg.Vector3d.ZAxis), iw, ih)

        if not scale:
            scale = 0.4 * max(Lx, Ly) / Fmax if Fmax > 0 else 0.0
        arrows = [rg.Line(p, p + v * scale) for p, v in zip(P, F_vec)]

        n_, v_, m_ = r["case"]
        summary = [
            "Dorn: M{:g}, n = {}, typ {}".format(d_mm, len(P), typ),
            "Styrende: N = {:g}, V = {:g} kN, M = {:g} kNm".format(
                n_, v_, m_),
            "Ip = {:.5f} m2, Fmax = {:.2f} kN".format(r["Ip"], Fmax),
            "Udnyttelse = {:.2f}  {}".format(
                r["util"], "OK" if r["ok"] else "IKKE OK"),
        ]
        info = "\n".join(summary + [""] + r["lines"])

        if plot:
            self._draw = {
                "P": P, "F": F, "eta": r["eta"], "i_max": r["i_max"],
                "arrows": arrows, "outline": outline, "inner": inner,
                "c": c, "IC": IC, "info": summary, "ok": r["ok"],
                "labels": [side_label(s, mems) for s in sorted(SIDE_NAMES)],
                "x0": x0, "y0": y0, "Lx": Lx, "Ly": Ly, "z": z,
            }
            bb = outline.BoundingBox
            for a in arrows:
                bb.Union(a.BoundingBox)
            if IC is not None:
                bb.Union(IC)
            bb.Inflate(0.05 * max(Lx, Ly))
            self._bbox = bb

        return (P, F_vec, F, Fmax, r["Ip"], c, IC, arrows,
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

        dsp.DrawPolyline(dr["outline"].ToPolyline(), RED, 1)
        if dr["inner"] is not None:
            dsp.DrawDottedPolyline(dr["inner"].ToPolyline(), GREY, True)

        x0, y0, Lx, Ly, z = dr["x0"], dr["y0"], dr["Lx"], dr["Ly"], dr["z"]
        mids = [(x0 + Lx / 2, y0), (x0 + Lx, y0 + Ly / 2),
                (x0 + Lx / 2, y0 + Ly), (x0, y0 + Ly / 2)]
        for (mx, my), t in zip(mids, dr["labels"]):
            dsp.Draw2dText(t, RED, rg.Point3d(mx, my, z), True, 12)

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

        dy = 0.06 * max(Lx, Ly)
        n = len(dr["info"])
        for i, t in enumerate(dr["info"]):
            pt = rg.Point3d(x0, y0 + Ly + dy * (n - i), z)
            col = (GREEN if dr["ok"] else RED) if i == n - 1 else RED
            dsp.Draw2dText(t, col, pt, False, 14)


if __name__ == "__main__":
    r = solve(
        x_size=0.333, y_size=0.4,       # forbindelsesområde [m]
        dorn="M12",
        typ="A",                        # "A" stålplade, "B" træ-træ
        grain="y",                      # typ A: fiber; begge: N's retning
        free_x=None, free_y=None,       # sider hvor emnet fortsætter, "2,3"
        a_edge=4, a_end=7,              # placering: kant/ende [x d]
        s_par=5, s_perp=3,              # placering: dornafstand [x d]
        N=[27.42], V=[15.49], M=[43.55],  # lasttilfælde [kN], [kN], [kNm]
        both_signs=True,
        rule="omhyllende",              # eller "dorn"
        timber="GL24h", t1=80,          # typ B: også t2=..., mid="x"
        f_uk=360, k_mod=0.8, gamma_M=1.3,
    )
    print("\n".join(r["lines"]))
    plot_mpl(r)
