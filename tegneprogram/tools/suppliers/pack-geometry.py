"""Pack verified manufacturer geometry into the runtime bundle.

The importer's output is deliberately verbose -- one JSON object per primitive,
full float precision -- because it is the auditable record of what came out of
the manufacturer's DXF. That form is 17 KB per part gzipped, which does not
scale past a few hundred SKUs.

This script re-encodes it for the runtime. By default the transform is
LOSSLESS: same points, same holes, only a compact encoding and 3-decimal
coordinates (1 micron, far below the source data's meaningful precision).
Roughly 12x smaller with no geometry change.

An optional --tolerance runs Douglas-Peucker on the traced outlines to strip
the arc-flattening redundancy. Hole circles are NEVER simplified or rounded --
their centres and radii are dimensional data. Whatever tolerance is used is
recorded in the output so a drawing can always be traced back to it.

Usage:
    python pack-geometry.py                    # lossless
    python pack-geometry.py --tolerance 0.01   # <=0.01 mm outline deviation
"""
import argparse
import gzip
import io
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SOURCE = os.path.join(ROOT, "component-library", "manufacturers", "simpson", "verified-geometry.generated.js")
TARGET = os.path.join(ROOT, "component-library", "manufacturers", "simpson", "geometry.packed.js")
VIEWS_TARGET = os.path.join(ROOT, "component-library", "manufacturers", "simpson", "geometry.views.packed.js")
MANUFACTURER = "simpson-strong-tie"


def load_source(path):
    raw = io.open(path, encoding="utf-8", errors="replace").read()
    start = raw.index("{")
    marker = raw.find("window.omkredsGeneratedManufacturerFamilies")
    end = marker if marker != -1 else len(raw)
    payload = raw[start:end].rstrip().rstrip(";").rstrip()
    families = None
    if marker != -1:
        tail = raw[marker:]
        families = json.loads(tail[tail.index("{"):].rstrip().rstrip(";").rstrip())
    return json.loads(payload), families, raw


def simplify(points, tol):
    """Iterative Douglas-Peucker. Recursion overflows on 600-point outlines."""
    if tol <= 0 or len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i0, i1 = stack.pop()
        x1, y1 = points[i0]
        x2, y2 = points[i1]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        worst, wi = -1.0, -1
        for i in range(i0 + 1, i1):
            px, py = points[i]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm if norm else math.hypot(px - x1, py - y1)
            if d > worst:
                worst, wi = d, i
        if wi > 0 and worst > tol:
            keep[wi] = True
            stack.append((i0, wi))
            stack.append((wi, i1))
    return [p for p, k in zip(points, keep) if k]


def dominant_pen(elements):
    counts = {}
    for item in elements:
        w = item.get("attrs", {}).get("strokeWidth")
        if w is not None:
            counts[w] = counts.get(w, 0) + 1
    return max(counts, key=counts.get) if counts else 0.25


def pack_elements(elements, pen, tol, decimals):
    """Compact primitives: ["p", [x,y,...]] | ["l", [...]] | ["c", [cx,cy,r]].

    A trailing element on a primitive is its pen weight, present only when it
    differs from the part's dominant weight."""
    q = lambda v: round(float(v), decimals)
    prims = []
    for item in elements:
        attrs = item.get("attrs", {})
        kind = item.get("type")
        w = attrs.get("strokeWidth", pen)
        entry = None
        if kind == "polyline":
            pts = [(float(x), float(y)) for x, y in attrs.get("points", [])]
            pts = simplify(pts, tol)
            if len(pts) < 2:
                continue
            flat = []
            for x, y in pts:
                flat.append(q(x))
                flat.append(q(y))
            entry = ["p", flat]
            if attrs.get("closed"):
                entry[0] = "P"
        elif kind == "line":
            entry = ["l", [q(attrs["x1"]), q(attrs["y1"]), q(attrs["x2"]), q(attrs["y2"])]]
        elif kind == "circle":
            # Holes stay exact: no simplification, no rounding.
            entry = ["c", [float(attrs["cx"]), float(attrs["cy"]), float(attrs["r"])]]
        elif kind == "rect":
            entry = ["r", [q(attrs["x"]), q(attrs["y"]), q(attrs["width"]), q(attrs["height"])]]
        if entry is None:
            continue
        if w != pen:
            entry.append(w)
        prims.append(entry)
    return prims


def pack_bbox(bbox, decimals):
    if not bbox:
        return None
    q = lambda v: round(float(v), decimals)
    return [q(bbox.get("width", 0)), q(bbox.get("height", 0))]


def is_edge_on(view, widest):
    """A view that is essentially a line: the part seen along its own plane.

    A flat plate's `elevation` is its 1.5 mm edge -- geometrically correct and
    useless as the thing you drop into a drawing. NP15/100/140 shipped as a
    140 x 1.5 sliver with four entities in it, while the actual 140 x 100 face
    with all 36 hole circles sat unused in `top`.
    """
    bbox = view.get("bbox") or {}
    w = float(bbox.get("width", 0))
    h = float(bbox.get("height", 0))
    if not w or not h:
        return True
    return min(w, h) < 0.06 * widest


def default_view_key(views):
    """Which view represents the part when it is placed.

    Named preference first -- elevation is right for brackets and hangers -- but
    an edge-on candidate is skipped rather than shipped, and `top` is tried
    before the pictorial `symbol` so flat products land on their face.
    """
    usable = {k: v for k, v in views.items() if v.get("elements")}
    if not usable:
        return None
    widest = max(
        max(float((v.get("bbox") or {}).get("width", 0)),
            float((v.get("bbox") or {}).get("height", 0)))
        for v in usable.values()
    ) or 1.0

    order = ["elevation", "top", "symbol"] + [k for k in usable if k not in ("elevation", "top", "symbol")]
    for key in order:
        view = usable.get(key)
        if view and not is_edge_on(view, widest):
            return key
    # Everything looks edge-on: take the richest view rather than nothing.
    return max(usable, key=lambda k: len(usable[k]["elements"]))


def pack_part(record, tol, decimals):
    """One part, split for loading.

    The importer extracts up to six views per component (elevation, side,
    sideRight, top, bottom, symbol) and copies one of them into the record's
    own `elements` as the default. All six on the page at once is 1.2 MB
    gzipped and the app is unusable until it lands, so this returns two
    things: the part as the page needs it to draw immediately -- default view
    only, plus `vk` naming the views that exist -- and the remaining views,
    which ride in a companion bundle fetched the first time someone switches
    view.
    """
    views = record.get("views") or {}
    views = {k: v for k, v in views.items() if v.get("elements")}
    elements = record.get("elements", [])

    # One pen for the whole part, chosen over every view it draws: a side
    # elevation and its section are the same drawing at the same weight.
    all_elements = list(elements)
    for view in views.values():
        all_elements.extend(view["elements"])
    pen = dominant_pen(all_elements)

    default = default_view_key(views)
    shipped = views[default]["elements"] if default else elements
    shipped_bbox = (views[default].get("bbox") if default else None) or record.get("bbox")
    packed = {"w": pen, "g": pack_elements(shipped, pen, tol, decimals)}
    b = pack_bbox(shipped_bbox, decimals)
    if b:
        packed["b"] = b
    if record.get("units") and record["units"] != "mm":
        packed["u"] = record["units"]

    deferred = {}
    if views:
        # The dropdown has to list every view before the geometry for them is
        # on the page, so the names ship with the part and the outlines don't.
        packed["vk"] = sorted(views)
        if default:
            packed["d"] = default
        for key, view in views.items():
            if key == default:
                continue          # already on the page as `g`
            entry = {"g": pack_elements(view["elements"], pen, tol, decimals)}
            vb = pack_bbox(view.get("bbox"), decimals)
            if vb:
                entry["b"] = vb
            deferred[key] = entry
    return packed, deferred


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tolerance", type=float, default=0.0,
                        help="outline simplification in mm (0 = lossless, the default)")
    parser.add_argument("--decimals", type=int, default=3)
    args = parser.parse_args()

    library, families, raw = load_source(SOURCE)
    parts = library[MANUFACTURER]

    packed = {}
    extra_views = {}
    skipped = []
    for sku, record in parts.items():
        if record.get("status") != "verified" or not record.get("elements"):
            skipped.append(sku)
            continue
        packed[sku], deferred = pack_part(record, args.tolerance, args.decimals)
        if deferred:
            extra_views[sku] = deferred

    payload = {
        "format": 2,
        "manufacturer": MANUFACTURER,
        "toleranceMm": args.tolerance,
        "decimals": args.decimals,
        "lossless": args.tolerance == 0.0,
        "holesExact": True,
        "parts": packed,
        # The family/variant catalogue is only ~14 KB, so it rides along and
        # the 8 MB import no longer needs to be on the page at all.
        "families": families,
    }
    body = json.dumps(payload, separators=(",", ":"))
    out = (
        "/* Generated by tools/suppliers/pack-geometry.py -- do not edit.\n"
        "   Source of truth stays verified-geometry.generated.js and the DXFs.\n"
        "   tolerance=%s mm, holes exact, %d parts. */\n"
        "window.omkredsPackedGeometry = %s;\n" % (args.tolerance, len(packed), body)
    )
    io.open(TARGET, "w", encoding="utf-8", newline="").write(out)

    views_payload = {
        "format": 2,
        "manufacturer": MANUFACTURER,
        "toleranceMm": args.tolerance,
        "decimals": args.decimals,
        "parts": extra_views,
    }
    views_out = (
        "/* Generated by tools/suppliers/pack-geometry.py -- do not edit.\n"
        "   Non-default component views. Fetched on demand by the view picker;\n"
        "   the default view of every part is already in geometry.packed.js. */\n"
        "window.omkredsPackedGeometryViews = %s;\n"
        % json.dumps(views_payload, separators=(",", ":"))
    )
    io.open(VIEWS_TARGET, "w", encoding="utf-8", newline="").write(views_out)

    src_gz = len(gzip.compress(raw.encode("utf-8"), 9))
    out_gz = len(gzip.compress(out.encode("utf-8"), 9))
    views_gz = len(gzip.compress(views_out.encode("utf-8"), 9))
    n = max(1, len(packed))
    extra = sum(len(v) for v in extra_views.values())
    print("parts packed : %d (skipped %d unverified)" % (len(packed), len(skipped)))
    print("views        : %d deferred across %d parts (+1 default each, on the page)"
          % (extra, len(extra_views)))
    print("source       : %.2f MB raw, %.2f MB gz (%.1f KB/part gz)" % (len(raw) / 1048576, src_gz / 1048576, src_gz / n / 1024))
    print("packed       : %.2f MB raw, %.0f KB gz (%.0f B/part gz)  <- on page load" % (len(out) / 1048576, out_gz / 1024, out_gz / n))
    print("views bundle : %.2f MB raw, %.0f KB gz                    <- on demand" % (len(views_out) / 1048576, views_gz / 1024))
    print("reduction    : %.1fx gzipped on the load path" % (src_gz / out_gz))
    print("written      : %s" % TARGET)
    print("             : %s" % VIEWS_TARGET)


if __name__ == "__main__":
    main()
