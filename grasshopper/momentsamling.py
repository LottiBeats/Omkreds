"""Momentsamling med dorne – elastisk kraftfordeling og plot.

Grasshopper Python 3-komponent (Rhino 8). Erstatter scriptet med
"Dorn area", "Fiber direction", "Resultant force", "rotation center" og
"display resulting force".

Opsætning i komponenten (højreklik på hver input):
    area      Curve,  Item Access   (valgfri – ellers bruges x_size/y_size)
    x_size    float,  Item Access   (model-enheder, fx 0.333)
    y_size    float,  Item Access   (model-enheder, fx 0.369)
    dorn      str,    Item Access   ("M12" eller 12, diameter i mm)
    a_edge    float,  Item Access   kantafstand  [x d]          (4)
    a_end     float,  Item Access   endeafstand  [x d]          (7)
    s_par     float,  Item Access   min. afstand mod fiber [x d] (5)
    s_perp    float,  Item Access   min. afstand vinkelret [x d] (5)
    grain     str,    Item Access   fiberretning "x" eller "y"   ("y")
    pts       Point3d, List Access  (valgfri – egne dornplaceringer)
    N         float,  Item Access   normalkraft [kN], virker langs fiberen
    V         float,  Item Access   forskydning [kN], vinkelret på fiberen
    M         float,  Item Access   moment [kNm], positiv mod uret
    load_pt   Point3d, Item Access  (valgfri – hvor N og V angriber;
                                     ellers i dorngruppens tyngdepunkt)
    scale     float,  Item Access   pilelængde pr. kN (valgfri – auto)
    Fv_Rd     float,  Item Access   bæreevne pr. dorn [kN] (valgfri)
    plot      bool,   Item Access   tegn pile og tekst i viewporten (True)

Outputs: pts, F_vec, F, Fmax, util, Ip, centroid, IC, arrows, outline,
inner, info.

Fortegn: N går i +fiberretning, V i +den anden akse (grain="y": N=+y,
V=+x; grain="x": N=+x, V=+y). Koordinater læses i modellens enheder og
regnes om til meter, så M i kNm og kræfter i kN passer sammen.

Metode (elastisk, stiv plade):
    F_i = F/n + M_tot/Ip * (-y_i, x_i),   Ip = sum(x_i^2 + y_i^2)
hvor (x_i, y_i) måles fra dorngruppens tyngdepunkt. Det er det samme som
rotationscentret i GH-scriptet (xi = Ip/(n e), T = F e r / Ip), men
virker også ved rent moment (F = 0) uden "avoid null vector".
"""

import math

import Grasshopper
import Rhino
import Rhino.Geometry as rg
import System.Drawing as sd


# ---------------------------------------------------------------- beregning
# Ren Python uden Rhino, så den kan testes udenfor Grasshopper.

def parse_dorn(dorn):
    """'M12', 'm12', '12' eller 12 -> 12.0 (mm)."""
    if dorn is None:
        return 12.0
    s = str(dorn).strip().upper().lstrip("M").replace(",", ".")
    return float(s)


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


RED = sd.Color.FromArgb(160, 0, 0)
GREY = sd.Color.FromArgb(120, 120, 120)
BLUE = sd.Color.FromArgb(0, 70, 160)


class MyComponent(Grasshopper.Kernel.GH_ScriptInstance):

    def RunScript(self, area, x_size, y_size, dorn, a_edge, a_end, s_par,
                  s_perp, grain, pts, N, V, M, load_pt, scale, Fv_Rd, plot):
        self._draw = None

        # --- standardværdier (som i GH-scriptet)
        x_size = 0.333 if x_size is None else x_size
        y_size = 0.369 if y_size is None else y_size
        a_edge = 4.0 if a_edge is None else a_edge
        a_end = 7.0 if a_end is None else a_end
        s_par = 5.0 if s_par is None else s_par
        s_perp = 5.0 if s_perp is None else s_perp
        grain = (grain or "y").strip().lower()
        N = N or 0.0
        V = V or 0.0
        M = M or 0.0
        plot = True if plot is None else plot

        u = _unit_to_m()                      # model-enhed -> m
        d = parse_dorn(dorn) / 1000.0 / u     # dorndiameter i model-enheder

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
            return (None,) * 12

        # --- kræfter: N langs fiber, V vinkelret
        Fx, Fy = (N, V) if grain == "x" else (V, N)
        lp = None if load_pt is None else (load_pt.X * u, load_pt.Y * u)
        res = distribute([(p.X * u, p.Y * u) for p in P], Fx, Fy, M, lp)

        F_vec = [rg.Vector3d(fx, fy, 0) for fx, fy in res["forces"]]
        F = res["mags"]
        Fmax = max(F)
        util = Fmax / Fv_Rd if Fv_Rd else None
        c = rg.Point3d(res["centroid"][0] / u, res["centroid"][1] / u, z)
        IC = None
        if res["ic"] is not None:
            IC = rg.Point3d(res["ic"][0] / u, res["ic"][1] / u, z)

        if not scale:
            scale = 0.4 * max(Lx, Ly) / Fmax if Fmax > 0 else 0.0
        arrows = [rg.Line(p, p + v * scale) for p, v in zip(P, F_vec)]

        F_res = math.hypot(Fx, Fy)
        lines = [
            "Dorn: M{:g}, n = {}".format(d * u * 1000, len(P)),
            "F = {} kN, M_tot = {} kNm".format(_fmt(F_res, 1),
                                               _fmt(res["M_tot"], 2)),
            "Ip = {:.5f} m2".format(res["Ip"]),
            "Fmax = {} kN".format(_fmt(Fmax, 2)),
        ]
        if F_res > 0:
            lines.insert(2, "e = M/F = {} m".format(
                _fmt(res["M_tot"] / F_res, 3)))
        if util is not None:
            lines.append("Udnyttelse = {} / {} = {}".format(
                _fmt(Fmax, 2), _fmt(Fv_Rd, 2), _fmt(util, 2)))
        info = "\n".join(lines)

        if plot:
            self._draw = {
                "P": P, "F": F, "arrows": arrows, "outline": outline,
                "inner": inner, "c": c, "IC": IC, "info": lines,
                "x0": x0, "y0": y0, "Lx": Lx, "Ly": Ly, "z": z, "Fmax": Fmax,
            }
            bb = outline.BoundingBox
            for a in arrows:
                bb.Union(a.BoundingBox)
            if IC is not None:
                bb.Union(IC)
            bb.Inflate(0.05 * max(Lx, Ly))
            self._bbox = bb

        return (P, F_vec, F, Fmax, util, res["Ip"], c, IC, arrows,
                outline.ToNurbsCurve(),
                inner.ToNurbsCurve() if inner else None, info)

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

        # dorne, pile og kræfter
        for p, f, ln in zip(dr["P"], dr["F"], dr["arrows"]):
            col = BLUE if abs(f - dr["Fmax"]) < 1e-9 else RED
            dsp.DrawPoint(p, Rhino.Display.PointStyle.X, 5, col)
            if ln.Length > 1e-9:
                dsp.DrawArrow(ln, col)
            dsp.Draw2dText(_fmt(f, 1) + " kN", col, p, True, 14)

        # tyngdepunkt og rotationscenter
        dsp.DrawPoint(dr["c"], Rhino.Display.PointStyle.Circle, 4, GREY)
        if dr["IC"] is not None:
            dsp.DrawPoint(dr["IC"], Rhino.Display.PointStyle.ActivePoint,
                          5, BLUE)
            dsp.Draw2dText("rotationscenter", BLUE, dr["IC"], False, 12)

        # resumé øverst til venstre for området
        dy = 0.06 * max(Lx, Ly)
        for i, t in enumerate(dr["info"]):
            pt = rg.Point3d(x0, y0 + Ly + dy * (len(dr["info"]) - i), z)
            dsp.Draw2dText(t, RED, pt, False, 14)
