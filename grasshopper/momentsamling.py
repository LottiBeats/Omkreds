"""Momentsamling med dorne – elastisk kraftfordeling, EC5-kontrol og plot.

Grasshopper Python 3-komponent (Rhino 8). Erstatter scriptet med
"Dorn area", "Fiber direction", "Resultant force", "rotation center" og
"display resulting force", og eftervise dornene efter DS/EN 1995-1-1.

Opsætning i komponenten (højreklik på hver input):
  Geometri
    area      Curve,  Item Access   (valgfri – ellers bruges x_size/y_size)
    x_size    float,  Item Access   (model-enheder, fx 0.333)
    y_size    float,  Item Access   (model-enheder, fx 0.369)
    dorn      str,    Item Access   ("M12" eller 12, diameter i mm)
    a_edge    float,  Item Access   kantafstand  [x d]          (4)
    a_end     float,  Item Access   endeafstand  [x d]          (7)
    s_par     float,  Item Access   min. afstand mod fiber [x d] (5, a1 = 5d)
    s_perp    float,  Item Access   min. afstand vinkelret [x d] (3, a2 = 3d)
    grain     str,    Item Access   fiberretning "x" eller "y"   ("y")
    pts       Point3d, List Access  (valgfri – egne dornplaceringer)
  Last
    N         float,  Item Access   normalkraft [kN], virker langs fiberen
    V         float,  Item Access   forskydning [kN], vinkelret på fiberen
    M         float,  Item Access   moment [kNm], positiv mod uret
    load_pt   Point3d, Item Access  (valgfri – hvor N og V angriber;
                                     ellers i dorngruppens tyngdepunkt)
  Kontrol (EC5, indslidset stålplade, dorne i dobbeltsnit)
    timber    str,    Item Access   "GL24h", "C24" ... eller rho_k [kg/m3]
    t1        float,  Item Access   træets tykkelse på hver side af
                                     pladen [mm] (80)
    f_uk      float,  Item Access   dornens trækstyrke [MPa] (360, S235)
    k_mod     float,  Item Access   (0.8 – mellemlang last, klasse 1/2)
    gamma_M   float,  Item Access   (1.3 – samlinger, DK NA)
    use_nef   bool,   Item Access   n_ef for rækker langs fiberen (True)
    Fv_Rd     float,  Item Access   (valgfri – fast bæreevne pr. dorn [kN],
                                     overstyrer EC5-beregningen)
  Visning
    scale     float,  Item Access   pilelængde pr. kN (valgfri – auto)
    plot      bool,   Item Access   tegn pile og tekst i viewporten (True)

Outputs: pts, F_vec, F, Fmax, Ip, centroid, IC, arrows, outline, inner,
Rd, eta, util, ok, info.

Fortegn: N går i +fiberretning, V i +den anden akse (grain="y": N=+y,
V=+x; grain="x": N=+x, V=+y). Koordinater læses i modellens enheder og
regnes om til meter, så M i kNm og kræfter i kN passer sammen.

Kraftfordeling (elastisk, stiv plade):
    F_i = F/n + M_tot/Ip * (-y_i, x_i),   Ip = sum(x_i^2 + y_i^2)
hvor (x_i, y_i) måles fra dorngruppens tyngdepunkt. Det er det samme som
rotationscentret i GH-scriptet (xi = Ip/(n e), T = F e r / Ip), men
virker også ved rent moment (F = 0) uden "avoid null vector".

Kontrol pr. dorn i (EN 1995-1-1):
    alpha_i     vinkel mellem F_i og fiberen
    f_h,0,k   = 0.082 (1 - 0.01 d) rho_k                         (8.32)
    f_h,a,k   = f_h,0,k / (k90 sin^2 a + cos^2 a)                (8.31)
    M_y,Rk    = 0.3 f_u,k d^2.6                                  (8.30)
    F_v,Rk    = 2 * min(f, g, h) – stålplade som midterdel       (8.11)
    n_ef      = min(n, n^0.9 (a1 / 13d)^0.25), lineært til n ved 90 grader
    F_v,Rd,i  = n_ef,a/n * k_mod F_v,Rk / gamma_M
    eta_i     = F_i / F_v,Rd,i <= 1
Afstande kontrolleres mod tabel 8.5 for den ugunstigste kraftretning
(a1 >= 5d, a2 >= 3d, a3,t >= max(7d, 80 mm), a4,t >= 4d), da kraftens
retning skifter fra dorn til dorn.

Ikke med: stålpladens hulrandstryk (EC3), blokforskydning (EC5 bilag A),
kløvning vinkelret på fiberen (8.1.4) og flere indslidsede plader.
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
# Ren Python uden Rhino, så den kan testes udenfor Grasshopper.

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


def parse_dorn(dorn):
    """'M12', 'm12', '12' eller 12 -> 12.0 (mm)."""
    if dorn is None:
        return 12.0
    s = str(dorn).strip().upper().lstrip("M").replace(",", ".")
    return float(s)


def parse_timber(timber):
    """'GL24h' -> (385, 'GL24h', False); 420 -> (420, 'rho_k=420', False).
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


def grid_1d(length, edge, s_min):
    """Positioner langs én akse: kantafstand i begge ender, jævnt fordelt
    med mindst s_min imellem. Returnerer koordinater fra 0..length."""
    inner = length - 2.0 * edge
    if inner < -1e-12:
        return []
    n = int(math.floor(inner / s_min + 1e-9)) + 1 if s_min > 0 else 1
    if n == 1:
        return [length / 2.0]
    step = inner / (n - 1)
    return [edge + i * step for i in range(n)]


def distribute(points, Fx, Fy, M, load_pt=None):
    """Elastisk fordeling. points/load_pt i meter, kræfter i kN, M i kNm.

    Returnerer dict med centroid, Ip, M_tot, forces [(fx, fy)], mags,
    ic (rotationscenter eller None)."""
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
        fx = Fx / n
        fy = Fy / n
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


def johansen_steel_center(d, t1, rho_k, f_uk, alpha_deg, hardwood=False):
    """EC5 (8.11): stålplade som midterdel, dobbeltsnit, dorn (F_ax = 0).
    d, t1 i mm, rho_k i kg/m3, f_uk i MPa. Returnerer F_v,Rk pr. dorn [kN]
    og et dict med mellemregninger."""
    f_h0 = 0.082 * (1 - 0.01 * d) * rho_k
    k90 = (0.90 if hardwood else 1.35) + 0.015 * d
    a = math.radians(alpha_deg)
    f_ha = f_h0 / (k90 * math.sin(a) ** 2 + math.cos(a) ** 2)
    M_y = 0.3 * f_uk * d ** 2.6
    f = f_ha * t1 * d
    g = f_ha * t1 * d * (math.sqrt(2 + 4 * M_y / (f_ha * d * t1 ** 2)) - 1)
    h = 2.3 * math.sqrt(M_y * f_ha * d)
    modes = {"f": f, "g": g, "h": h}
    mode = min(modes, key=modes.get)
    return 2 * modes[mode] / 1000.0, {
        "f_h0": f_h0, "k90": k90, "f_ha": f_ha, "M_y": M_y,
        "modes": modes, "mode": mode}


def n_ef_factor(n, a1, d, alpha_deg):
    """n_ef,alpha / n for en række med n dorne og afstand a1 (samme enhed
    som d). EC5 (8.34) og 8.5.1.1(4)."""
    if n <= 1 or a1 <= 0:
        return 1.0
    nef0 = min(n, n ** 0.9 * (a1 / (13.0 * d)) ** 0.25)
    nef = nef0 + (n - nef0) * min(abs(alpha_deg), 90.0) / 90.0
    return nef / n


def rows_along_grain(points, grain, tol=1e-6):
    """Grupperer dorne i rækker langs fiberen. Returnerer for hver dorn
    (antal i rækken, mindste afstand i rækken) og listen af rækker."""
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
        s = sorted(points[i][gi] for i in r)
        gaps = [b - a for a, b in zip(s, s[1:]) if b - a > tol]
        a1 = min(gaps) if gaps else 0.0
        for i in r:
            info[i] = (len(r), a1)
    return info, rows


def check(points_m, mags, forces, grain, d_mm, t1, timber, f_uk, k_mod,
          gamma_M, use_nef=True, Fv_Rd=None, box_m=None):
    """EC5-kontrol af alle dorne. points_m/box_m i meter, kræfter i kN.
    Returnerer dict med Rd, eta, alpha, util, i_max, ok, spacing, lines."""
    rho_k, tname, hard = parse_timber(timber)
    d_m = d_mm / 1000.0
    g = (1.0, 0.0) if grain == "x" else (0.0, 1.0)
    rinfo, _ = rows_along_grain(points_m, grain)

    alpha, Rd, eta, Rk0 = [], [], [], None
    for (fx, fy), F, (nrow, a1) in zip(forces, mags, rinfo):
        a = 0.0 if F < 1e-12 else math.degrees(
            math.acos(min(1.0, abs(fx * g[0] + fy * g[1]) / F)))
        if Fv_Rd:
            rd = float(Fv_Rd)
        else:
            Rk, mid = johansen_steel_center(d_mm, t1, rho_k, f_uk, a, hard)
            kef = n_ef_factor(nrow, a1, d_m, a) if use_nef else 1.0
            rd = kef * k_mod * Rk / gamma_M
        alpha.append(a)
        Rd.append(rd)
        eta.append(F / rd if rd > 0 else float("inf"))
    i_max = max(range(len(eta)), key=lambda i: eta[i])
    util = eta[i_max]

    # afstande (tabel 8.5, ugunstigste retning)
    spacing = []
    if box_m is not None:
        gi, pi = (0, 1) if grain == "x" else (1, 0)
        _, rows = rows_along_grain(points_m, grain)
        a1s = [a for _, a in rinfo if a > 0]
        lines_p = sorted(set(round(points_m[r[0]][pi], 9) for r in rows))
        a2s = [b - a for a, b in zip(lines_p, lines_p[1:])]
        lo, hi = (box_m[0], box_m[1]), (box_m[2], box_m[3])
        a3 = min(min(p[gi] - lo[gi], hi[gi] - p[gi]) for p in points_m)
        a4 = min(min(p[pi] - lo[pi], hi[pi] - p[pi]) for p in points_m)
        if a1s:
            spacing.append(("a1", min(a1s), 5 * d_m))
        if a2s:
            spacing.append(("a2", min(a2s), 3 * d_m))
        spacing.append(("a3,t", a3, max(7 * d_m, 0.080)))
        spacing.append(("a4,t", a4, 4 * d_m))
        spacing = [(n, v, r, v >= r - 1e-9) for n, v, r in spacing]

    ok = util <= 1.0 and all(s[3] for s in spacing)

    # rapport for den styrende dorn
    a = alpha[i_max]
    L = ["KONTROL (DS/EN 1995-1-1, indslidset stålplade, dobbeltsnit)",
         "Træ: {}, rho_k = {:g} kg/m3; dorn d = {:g} mm, f_u,k = {:g} MPa"
         .format(tname, rho_k, d_mm, f_uk),
         "t1 = {:g} mm, k_mod = {:g}, gamma_M = {:g}"
         .format(t1, k_mod, gamma_M)]
    if Fv_Rd:
        L.append("F_v,Rd = {:.2f} kN (givet)".format(float(Fv_Rd)))
    else:
        Rk, mid = johansen_steel_center(d_mm, t1, rho_k, f_uk, a, hard)
        nrow, a1 = rinfo[i_max]
        kef = n_ef_factor(nrow, a1, d_m, a) if use_nef else 1.0
        L += [
            "Styrende dorn nr. {}: F = {:.2f} kN, alpha = {:.1f} grader"
            .format(i_max + 1, mags[i_max], a),
            "f_h,0,k = 0.082(1-0.01d)rho_k = {:.2f} MPa".format(mid["f_h0"]),
            "k90 = {:.3f}, f_h,a,k = {:.2f} MPa".format(mid["k90"],
                                                         mid["f_ha"]),
            "M_y,Rk = 0.3 f_u,k d^2.6 = {:.0f} Nmm".format(mid["M_y"]),
            "Brudformer pr. snit: f = {:.2f}, g = {:.2f}, h = {:.2f} kN"
            .format(*(mid["modes"][k] / 1000 for k in "fgh")),
            "F_v,Rk = 2 x {:.2f} = {:.2f} kN (brudform {})"
            .format(Rk / 2, Rk, mid["mode"]),
            "n_ef/n = {:.3f} (n = {} i rækken, a1 = {:.0f} mm)"
            .format(kef, nrow, a1 * 1000) if use_nef else "n_ef ikke medregnet",
            "F_v,Rd = {:.3f} x {:g} x {:.2f} / {:g} = {:.2f} kN"
            .format(kef, k_mod, Rk, gamma_M, Rd[i_max]),
        ]
    L.append("eta = {:.2f} / {:.2f} = {:.2f}  {}".format(
        mags[i_max], Rd[i_max], util, "OK" if util <= 1 else "IKKE OK"))
    for n, v, r, sok in spacing:
        L.append("{} = {:.0f} mm >= {:.0f} mm  {}".format(
            n, v * 1000, r * 1000, "OK" if sok else "IKKE OK"))
    L.append("SAMLET: " + ("OK" if ok else "IKKE OK"))

    return {"Rd": Rd, "eta": eta, "alpha": alpha, "util": util,
            "i_max": i_max, "ok": ok, "spacing": spacing, "lines": L}


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


def _fmt(v, dec=1):
    return ("{:." + str(dec) + "f}").format(v)


def _d(v, default):
    return default if v is None else v


if IN_RHINO:
    RED = sd.Color.FromArgb(170, 0, 0)
    GREEN = sd.Color.FromArgb(0, 120, 40)
    GREY = sd.Color.FromArgb(120, 120, 120)
    BLUE = sd.Color.FromArgb(0, 70, 160)


class MyComponent(Grasshopper.Kernel.GH_ScriptInstance if IN_RHINO
                  else object):

    def RunScript(self, area, x_size, y_size, dorn, a_edge, a_end, s_par,
                  s_perp, grain, pts, N, V, M, load_pt, timber, t1, f_uk,
                  k_mod, gamma_M, use_nef, Fv_Rd, scale, plot):
        self._draw = None
        empty = (None,) * 15

        # --- standardværdier (som i GH-scriptet)
        x_size = _d(x_size, 0.333)
        y_size = _d(y_size, 0.369)
        a_edge = _d(a_edge, 4.0)
        a_end = _d(a_end, 7.0)
        s_par = _d(s_par, 5.0)
        s_perp = _d(s_perp, 3.0)
        grain = (grain or "y").strip().lower()
        N, V, M = N or 0.0, V or 0.0, M or 0.0
        t1 = _d(t1, 80.0)
        f_uk = _d(f_uk, 360.0)
        k_mod = _d(k_mod, 0.8)
        gamma_M = _d(gamma_M, 1.3)
        use_nef = _d(use_nef, True)
        plot = _d(plot, True)

        u = _unit_to_m()                      # model-enhed -> m
        d_mm = parse_dorn(dorn)
        d = d_mm / 1000.0 / u                 # dorndiameter i model-enheder

        # --- område
        crv = _coerce_curve(area)
        if crv is not None:
            bb = crv.GetBoundingBox(True)
            x0, y0 = bb.Min.X, bb.Min.Y
            Lx, Ly = bb.Max.X - x0, bb.Max.Y - y0
            z = bb.Min.Z
        else:
            x0, y0, z = 0.0, 0.0, 0.0
            Lx, Ly = float(x_size), float(y_size)

        # kant-/endeafstand og min. afstand pr. akse
        if grain == "x":
            ex, ey = a_end * d, a_edge * d
            sx, sy = s_par * d, s_perp * d
        else:
            ex, ey = a_edge * d, a_end * d
            sx, sy = s_perp * d, s_par * d

        outline = rg.Rectangle3d(
            rg.Plane(rg.Point3d(x0, y0, z), rg.Vector3d.ZAxis), Lx, Ly)
        inner = None
        if Lx - 2 * ex > 0 and Ly - 2 * ey > 0:
            inner = rg.Rectangle3d(
                rg.Plane(rg.Point3d(x0 + ex, y0 + ey, z), rg.Vector3d.ZAxis),
                Lx - 2 * ex, Ly - 2 * ey)

        # --- dorne
        if pts:
            P = [rg.Point3d(p) for p in pts]
        else:
            xs = grid_1d(Lx, ex, sx)
            ys = grid_1d(Ly, ey, sy)
            P = [rg.Point3d(x0 + x, y0 + y, z) for y in ys for x in xs]
        if not P:
            self.Component.AddRuntimeMessage(
                Grasshopper.Kernel.GH_RuntimeMessageLevel.Error,
                "Ingen dorne – området er mindre end 2 x kant-/endeafstand.")
            return empty

        # --- kræfter: N langs fiber, V vinkelret
        Fx, Fy = (N, V) if grain == "x" else (V, N)
        Pm = [(p.X * u, p.Y * u) for p in P]
        lp = None if load_pt is None else (load_pt.X * u, load_pt.Y * u)
        res = distribute(Pm, Fx, Fy, M, lp)

        F_vec = [rg.Vector3d(fx, fy, 0) for fx, fy in res["forces"]]
        F = res["mags"]
        Fmax = max(F)
        c = rg.Point3d(res["centroid"][0] / u, res["centroid"][1] / u, z)
        IC = None
        if res["ic"] is not None:
            IC = rg.Point3d(res["ic"][0] / u, res["ic"][1] / u, z)

        # --- kontrol
        try:
            chk = check(Pm, F, res["forces"], grain, d_mm, t1, timber, f_uk,
                        k_mod, gamma_M, use_nef, Fv_Rd,
                        (x0 * u, y0 * u, (x0 + Lx) * u, (y0 + Ly) * u))
        except ValueError as exc:
            self.Component.AddRuntimeMessage(
                Grasshopper.Kernel.GH_RuntimeMessageLevel.Error, str(exc))
            return empty
        if not chk["ok"]:
            self.Component.AddRuntimeMessage(
                Grasshopper.Kernel.GH_RuntimeMessageLevel.Warning,
                "Kontrol IKKE OK – udnyttelse {:.2f}".format(chk["util"]))

        if not scale:
            scale = 0.4 * max(Lx, Ly) / Fmax if Fmax > 0 else 0.0
        arrows = [rg.Line(p, p + v * scale) for p, v in zip(P, F_vec)]

        F_res = math.hypot(Fx, Fy)
        summary = [
            "Dorn: M{:g}, n = {}".format(d_mm, len(P)),
            "F = {} kN, M_tot = {} kNm".format(_fmt(F_res, 1),
                                               _fmt(res["M_tot"], 2)),
            "Ip = {:.5f} m2".format(res["Ip"]),
            "Fmax = {} kN".format(_fmt(Fmax, 2)),
            "Udnyttelse = {:.2f}  {}".format(
                chk["util"], "OK" if chk["ok"] else "IKKE OK"),
        ]
        if F_res > 0:
            summary.insert(2, "e = M/F = {} m".format(
                _fmt(res["M_tot"] / F_res, 3)))
        info = "\n".join(summary + [""] + chk["lines"])

        if plot:
            self._draw = {
                "P": P, "F": F, "eta": chk["eta"], "i_max": chk["i_max"],
                "arrows": arrows, "outline": outline, "inner": inner,
                "c": c, "IC": IC, "info": summary, "ok": chk["ok"],
                "x0": x0, "y0": y0, "Lx": Lx, "Ly": Ly, "z": z,
            }
            bb = outline.BoundingBox
            for a in arrows:
                bb.Union(a.BoundingBox)
            if IC is not None:
                bb.Union(IC)
            bb.Inflate(0.05 * max(Lx, Ly))
            self._bbox = bb

        return (P, F_vec, F, Fmax, res["Ip"], c, IC, arrows,
                outline.ToNurbsCurve(),
                inner.ToNurbsCurve() if inner else None,
                chk["Rd"], chk["eta"], chk["util"], chk["ok"], info)

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

        # område og kantzone
        dsp.DrawPolyline(dr["outline"].ToPolyline(), RED, 1)
        if dr["inner"] is not None:
            dsp.DrawDottedPolyline(dr["inner"].ToPolyline(), GREY, True)

        # sidenumre 1..4 (bund, højre, top, venstre) som i GH-scriptet
        x0, y0, Lx, Ly, z = dr["x0"], dr["y0"], dr["Lx"], dr["Ly"], dr["z"]
        mids = [(x0 + Lx / 2, y0), (x0 + Lx, y0 + Ly / 2),
                (x0 + Lx / 2, y0 + Ly), (x0, y0 + Ly / 2)]
        for i, (mx, my) in enumerate(mids):
            dsp.Draw2dText(str(i + 1), RED, rg.Point3d(mx, my, z), True, 14)

        # dorne, pile og kræfter – grøn = OK, rød = overskredet,
        # blå ring om den styrende dorn
        for i, (p, f, e, ln) in enumerate(
                zip(dr["P"], dr["F"], dr["eta"], dr["arrows"])):
            col = GREEN if e <= 1.0 else RED
            dsp.DrawPoint(p, Rhino.Display.PointStyle.X, 5, col)
            if i == dr["i_max"]:
                dsp.DrawPoint(p, Rhino.Display.PointStyle.RoundActivePoint,
                              9, BLUE)
            if ln.Length > 1e-9:
                dsp.DrawArrow(ln, col)
            dsp.Draw2dText("{} kN ({:.2f})".format(_fmt(f, 1), e), col, p,
                           True, 13)

        # tyngdepunkt og rotationscenter
        dsp.DrawPoint(dr["c"], Rhino.Display.PointStyle.Circle, 4, GREY)
        if dr["IC"] is not None:
            dsp.DrawPoint(dr["IC"], Rhino.Display.PointStyle.ActivePoint,
                          5, BLUE)
            dsp.Draw2dText("rotationscenter", BLUE, dr["IC"], False, 12)

        # resumé over området
        dy = 0.06 * max(Lx, Ly)
        n = len(dr["info"])
        for i, t in enumerate(dr["info"]):
            pt = rg.Point3d(x0, y0 + Ly + dy * (n - i), z)
            col = (GREEN if dr["ok"] else RED) if i == n - 1 else RED
            dsp.Draw2dText(t, col, pt, False, 14)


# ------------------------------------------------------- lokalt (VS Code)
# Kør filen direkte:  python momentsamling.py
# Ret værdierne i bunden af filen. Kræver matplotlib (pip install matplotlib).
# Alle længder er i meter, dorn og t1 i mm, kræfter i kN, M i kNm.

def solve(x_size=0.333, y_size=0.369, dorn="M12", a_edge=4.0, a_end=7.0,
          s_par=5.0, s_perp=3.0, grain="y", pts=None, N=0.0, V=0.0, M=0.0,
          load_pt=None, timber="GL24h", t1=80.0, f_uk=360.0, k_mod=0.8,
          gamma_M=1.3, use_nef=True, Fv_Rd=None):
    """Samme beregning som komponenten, uden Rhino. Område fra (0, 0)."""
    grain = grain.strip().lower()
    d_mm = parse_dorn(dorn)
    d = d_mm / 1000.0
    if grain == "x":
        ex, ey, sx, sy = a_end * d, a_edge * d, s_par * d, s_perp * d
    else:
        ex, ey, sx, sy = a_edge * d, a_end * d, s_perp * d, s_par * d
    if pts is None:
        pts = [(x, y) for y in grid_1d(y_size, ey, sy)
               for x in grid_1d(x_size, ex, sx)]
    if not pts:
        raise ValueError("Ingen dorne – området er mindre end "
                         "2 x kant-/endeafstand.")
    Fx, Fy = (N, V) if grain == "x" else (V, N)
    res = distribute(pts, Fx, Fy, M, load_pt)
    chk = check(pts, res["mags"], res["forces"], grain, d_mm, t1, timber,
                f_uk, k_mod, gamma_M, use_nef, Fv_Rd,
                (0.0, 0.0, x_size, y_size))
    res.update(chk)
    res.update({"pts": pts, "size": (x_size, y_size), "edge": (ex, ey),
                "d_mm": d_mm, "F_res": math.hypot(Fx, Fy)})
    return res


def plot_mpl(r, scale=None, show=True, save=None):
    """Tegner samlingen som i viewporten: pile, kræfter og udnyttelse."""
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    Lx, Ly = r["size"]
    ex, ey = r["edge"]
    Fmax = max(r["mags"])
    if not scale:
        scale = 0.4 * max(Lx, Ly) / Fmax if Fmax > 0 else 0.0

    fig, ax = plt.subplots(figsize=(8, 8))
    ax.add_patch(Rectangle((0, 0), Lx, Ly, fill=False, ec="#aa0000"))
    if Lx > 2 * ex and Ly > 2 * ey:
        ax.add_patch(Rectangle((ex, ey), Lx - 2 * ex, Ly - 2 * ey,
                               fill=False, ec="grey", ls=":"))
    for i, (mx, my) in enumerate([(Lx / 2, 0), (Lx, Ly / 2),
                                  (Lx / 2, Ly), (0, Ly / 2)]):
        ax.text(mx, my, str(i + 1), color="#aa0000", ha="center",
                va="center", backgroundcolor="white")

    for i, ((x, y), (fx, fy), F, e) in enumerate(
            zip(r["pts"], r["forces"], r["mags"], r["eta"])):
        col = "#007828" if e <= 1.0 else "#aa0000"
        ax.plot(x, y, "x", color=col, ms=8, mew=2)
        if i == r["i_max"]:
            ax.plot(x, y, "o", mfc="none", mec="#0046a0", ms=16, mew=2)
        if F > 1e-9:
            ax.annotate("", xy=(x + fx * scale, y + fy * scale), xytext=(x, y),
                        arrowprops=dict(arrowstyle="-|>", color=col, lw=1.2))
        ax.text(x, y - 0.012, "{:.1f} kN ({:.2f})".format(F, e), color=col,
                ha="center", va="top", fontsize=8,
                bbox=dict(fc="white", ec="none", alpha=0.75, pad=1))

    cx, cy = r["centroid"]
    ax.plot(cx, cy, "o", color="grey", ms=4)
    if r["ic"] is not None:
        ax.plot(*r["ic"], "o", color="#0046a0", ms=6)
        ax.annotate("rotationscenter", r["ic"], color="#0046a0",
                    xytext=(5, 5), textcoords="offset points", fontsize=8)

    head = "M{:g}, n = {}   F = {:.1f} kN   M_tot = {:.2f} kNm   " \
           "Fmax = {:.2f} kN   udnyttelse = {:.2f}  {}".format(
               r["d_mm"], len(r["pts"]), r["F_res"], r["M_tot"], Fmax,
               r["util"], "OK" if r["ok"] else "IKKE OK")
    ax.set_title(head, fontsize=9,
                 color="#007828" if r["ok"] else "#aa0000")
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


if __name__ == "__main__":
    r = solve(
        x_size=0.333, y_size=0.369,     # forbindelsesområde [m]
        dorn="M12",
        a_edge=4, a_end=7,              # kant-/endeafstand [x d]
        s_par=5, s_perp=3,              # min. dornafstand [x d]
        grain="y",                      # fiberretning
        N=10.0, V=5.0, M=8.0,           # [kN], [kN], [kNm]
        timber="GL24h", t1=80,          # træ og sidetykkelse [mm]
        f_uk=360, k_mod=0.8, gamma_M=1.3,
    )
    print("\n".join(r["lines"]))
    plot_mpl(r)
