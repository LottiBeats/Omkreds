"""Verify the packed bundle against the importer's record, point by point.

Fails loudly if any hole moved at all, or if any outline point moved further
than the declared tolerance. Run after every pack.
"""
import io
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SOURCE = os.path.join(ROOT, "component-library", "manufacturers", "simpson", "verified-geometry.generated.js")
PACKED = os.path.join(ROOT, "component-library", "manufacturers", "simpson", "geometry.packed.js")
MANUFACTURER = "simpson-strong-tie"


def load_source():
    raw = io.open(SOURCE, encoding="utf-8", errors="replace").read()
    start = raw.index("{")
    end = raw.find("window.omkredsGeneratedManufacturerFamilies")
    if end == -1:
        end = len(raw)
    return json.loads(raw[start:end].rstrip().rstrip(";").rstrip())[MANUFACTURER]


def load_packed():
    raw = io.open(PACKED, encoding="utf-8", errors="replace").read()
    start = raw.index("{", raw.index("window.omkredsPackedGeometry"))
    return json.loads(raw[start:].rstrip().rstrip(";").rstrip())


def point_to_polyline(px, py, pts):
    best = float("inf")
    for i in range(len(pts) - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        if L2 == 0:
            d = math.hypot(px - x1, py - y1)
        else:
            t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / L2))
            d = math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
        if d < best:
            best = d
    return best


def main():
    source = load_source()
    packed = load_packed()
    tol = packed.get("toleranceMm", 0.0)
    parts = packed["parts"]

    problems = []
    worst_outline = 0.0
    worst_hole = 0.0
    counted = {"parts": 0, "polylines": 0, "lines": 0, "circles": 0}

    for sku, record in source.items():
        if record.get("status") != "verified" or not record.get("elements"):
            continue
        if sku not in parts:
            problems.append("%s missing from packed bundle" % sku)
            continue
        counted["parts"] += 1
        prims = parts[sku]["g"]

        # The bundle names the view it ships in `d`. That is not always the view
        # the importer copied into record["elements"] -- a flat plate's elevation
        # is its 1.5 mm edge, so the packer picks the face instead. Compare the
        # packed geometry against the view it actually claims to be, or the check
        # measures the wrong pair and reports a 1200 mm deviation that is really
        # just two different views of the same part.
        shipped_view = parts[sku].get("d")
        views = record.get("views") or {}
        source_elements = (views.get(shipped_view) or {}).get("elements") or record["elements"]

        src_circles = [(e["attrs"]["cx"], e["attrs"]["cy"], e["attrs"]["r"])
                       for e in source_elements if e["type"] == "circle"]
        out_circles = [tuple(p[1]) for p in prims if p[0] == "c"]
        counted["circles"] += len(src_circles)
        if len(src_circles) != len(out_circles):
            problems.append("%s: %d holes in source, %d packed" % (sku, len(src_circles), len(out_circles)))
        else:
            for (a, b, c), (d, e, f) in zip(src_circles, out_circles):
                moved = max(abs(a - d), abs(b - e), abs(c - f))
                worst_hole = max(worst_hole, moved)

        src_lines = [(e["attrs"]["x1"], e["attrs"]["y1"], e["attrs"]["x2"], e["attrs"]["y2"])
                     for e in source_elements if e["type"] == "line"]
        out_lines = [tuple(p[1]) for p in prims if p[0] == "l"]
        counted["lines"] += len(src_lines)
        if len(src_lines) != len(out_lines):
            problems.append("%s: %d lines in source, %d packed" % (sku, len(src_lines), len(out_lines)))
        else:
            for s, o in zip(src_lines, out_lines):
                worst_outline = max(worst_outline, max(abs(x - y) for x, y in zip(s, o)))

        src_polys = [[tuple(p) for p in e["attrs"].get("points", [])]
                     for e in source_elements if e["type"] == "polyline"]
        out_polys = []
        for p in prims:
            if p[0] in ("p", "P"):
                flat = p[1]
                out_polys.append([(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)])
        counted["polylines"] += len(src_polys)
        if len(src_polys) != len(out_polys):
            problems.append("%s: %d polylines in source, %d packed" % (sku, len(src_polys), len(out_polys)))
        else:
            for s, o in zip(src_polys, out_polys):
                if len(o) < 2:
                    problems.append("%s: degenerate polyline" % sku)
                    continue
                for px, py in s:
                    worst_outline = max(worst_outline, point_to_polyline(px, py, o))

    # Deviation is a 2D distance, so rounding each ordinate by half a step
    # allows the diagonal: half_step * sqrt(2).
    half_step = 0.5 * 10 ** -packed.get("decimals", 3)
    allowed = tol + half_step * math.sqrt(2) + 1e-12
    print("verified parts   : %d" % counted["parts"])
    print("primitives       : %d polylines, %d lines, %d circles"
          % (counted["polylines"], counted["lines"], counted["circles"]))
    print("declared tolerance: %.4f mm (lossless=%s)" % (tol, packed.get("lossless")))
    print("max hole movement : %.6f mm  (must be 0)" % worst_hole)
    print("max outline dev   : %.6f mm  (allowed %.4f)" % (worst_outline, allowed))

    if worst_hole > 0:
        problems.append("holes moved by %.6f mm" % worst_hole)
    if worst_outline > allowed + 1e-9:
        problems.append("outline deviation %.6f exceeds %.6f" % (worst_outline, allowed))

    if problems:
        print("\nFAILED:")
        for p in problems[:20]:
            print("  - %s" % p)
        sys.exit(1)
    print("\nOK: packed geometry matches the manufacturer import.")


if __name__ == "__main__":
    main()
