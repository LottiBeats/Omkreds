"""Cross-check traced geometry against the manufacturer's published data.

verify-packed.py already proves the packed bundle is a faithful copy of what the
importer produced. It cannot tell you whether the importer produced the *right*
part -- a trace of the wrong DXF, a mis-parsed SKU, or a dropped entity all pass
it. This checks the geometry against Simpson's own datasheet instead:

  holes     circles in the traced outline vs the hole counts in library.json
  size      traced bounding box vs the published A / B / C dimensions

A part that disagrees is not necessarily wrong -- published dimensions are often
internal (the timber seat) while the trace is external (over the steel), so an
offset of one or two material thicknesses is expected and is reported as such.
What matters is that every part is *accounted for*, and that anything unexplained
is visible instead of silently shipping.

Usage:  python tools/suppliers/simpson/verify_against_datasheet.py
Exit code is non-zero if any part fails a check outright.
"""
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
LIB = os.path.join(ROOT, "component-library", "manufacturers", "simpson", "library.json")
GEOM = os.path.join(ROOT, "component-library", "manufacturers", "simpson", "verified-geometry.generated.js")
MANUFACTURER = "simpson-strong-tie"

# How far the traced box may sit outside the published size before it is called
# a mismatch. Published dimensions are nominal and often internal, so a couple of
# material thicknesses is normal; beyond this something is actually wrong.
SIZE_SLACK_MM = 6.0

# Families whose published dimensions describe the timber they receive rather
# than the part's own outline. For these the traced part must ENCLOSE the stated
# size, not equal it.
SEAT_CATEGORIES = {"joist_hanger", "post_base"}

# How much larger than the seat a part may be before it is worth a look. A
# hanger's flanges and top return add real size; a wrong part adds much more.
SEAT_MAX_OVER_MM = 120.0


def load_geometry():
    raw = io.open(GEOM, encoding="utf-8", errors="replace").read()
    start = raw.index("{")
    end = raw.find("window.omkredsGeneratedManufacturerFamilies")
    if end == -1:
        end = len(raw)
    return json.loads(raw[start:end].rstrip().rstrip(";").rstrip())[MANUFACTURER]


def shipped_view(views):
    """The view the packer ships -- named preference, skipping edge-on ones."""
    usable = {k: v for k, v in views.items() if v.get("elements")}
    if not usable:
        return None
    widest = max(max(float((v.get("bbox") or {}).get("width", 0)),
                     float((v.get("bbox") or {}).get("height", 0)))
                 for v in usable.values()) or 1.0
    order = ["elevation", "top", "symbol"] + [k for k in usable if k not in ("elevation", "top", "symbol")]
    for key in order:
        v = usable.get(key)
        if not v:
            continue
        b = v.get("bbox") or {}
        w, h = float(b.get("width", 0)), float(b.get("height", 0))
        if w and h and min(w, h) >= 0.06 * widest:
            return key
    return max(usable, key=lambda k: len(usable[k]["elements"]))


def count_circles(elements):
    return sum(1 for item in elements or [] if item.get("type") == "circle")


def published_holes(variant):
    """Total holes across every flange in the datasheet entry."""
    holes = variant.get("holes") or {}
    total = 0
    for flange in holes.values():
        if isinstance(flange, dict):
            total += sum(int(n) for n in flange.values())
        elif isinstance(flange, (int, float)):
            total += int(flange)
    return total


def load_generated_families():
    """The second catalogue.

    library.json only describes 11 hand-entered variants; the BSIN, BSNN and CSA
    ranges -- 89 of the 97 traced parts -- live in the generated families block
    at the tail of verified-geometry.generated.js. Checking only the first file
    left almost the whole library unverified.
    """
    raw = io.open(GEOM, encoding="utf-8", errors="replace").read()
    marker = raw.find("window.omkredsGeneratedManufacturerFamilies")
    if marker == -1:
        return []
    tail = raw[marker:]
    data = json.loads(tail[tail.index("{"):].rstrip().rstrip(";").rstrip())
    block = data.get(MANUFACTURER, data)
    return block if isinstance(block, list) else block.get("families", [])


def all_families(library):
    seen = set()
    families = []
    for family in list(library.get("families", [])) + load_generated_families():
        key = (family.get("family"), tuple(sorted(v.get("sku") for v in family.get("variants", []))))
        if key in seen:
            continue
        seen.add(key)
        families.append(family)
    return families


def main():
    library = json.load(io.open(LIB, encoding="utf-8"))
    geometry = load_geometry()

    rows = []
    for family in all_families(library):
        for variant in family.get("variants", []):
            sku = variant.get("sku")
            record = geometry.get(sku)
            if not record or record.get("status") != "verified":
                rows.append((family.get("family"), sku, "NO GEOMETRY", "", "", ""))
                continue

            views = record.get("views") or {}
            # Judge the view the app actually places, which is not always the one
            # the importer copied into `elements`: a flat plate's elevation is its
            # edge, and measuring that against the datasheet reports a 98 mm error
            # for a part that is perfectly correct on its face.
            shipped = shipped_view(views)
            bbox = ((views.get(shipped) or {}).get("bbox") if shipped else None) or record.get("bbox") or {}
            w = round(float(bbox.get("width", 0)), 1)
            h = round(float(bbox.get("height", 0)), 1)

            dims = variant.get("dimensions") or {}
            t = float(dims.get("t") or 0)
            sizes = sorted(float(v) for k, v in dims.items()
                           if k != "t" and isinstance(v, (int, float)))

            # Holes: compare the richest view, since one elevation rarely shows
            # every flange at once.
            traced = max([count_circles(record.get("elements"))] +
                         [count_circles(v.get("elements")) for v in views.values()])
            stated = published_holes(variant)

            # A single elevation shows one face, so the honest comparison is
            # against the largest flange, not the sum over every flange. Round
            # holes also under-count where the datasheet lists a keyhole or slot,
            # which the DXF draws as an arc rather than a circle.
            holes = variant.get("holes") or {}
            per_flange = [sum(int(n) for n in f.values())
                          for f in holes.values() if isinstance(f, dict)]
            biggest = max(per_flange) if per_flange else 0

            hole_note = ""
            if stated == 0:
                hole_note = "no hole data"
            elif traced == stated:
                hole_note = "OK %d (all faces)" % traced
            elif biggest and abs(traced - biggest) <= 1:
                hole_note = "OK %d of %d per face" % (traced, biggest)
            elif traced < biggest:
                hole_note = "TRACED %d < FACE %d" % (traced, biggest)
            elif traced < stated:
                hole_note = "traced %d, datasheet %d over %d faces" % (traced, stated, len(per_flange))
            else:
                hole_note = "traced %d > datasheet %d" % (traced, stated)

            size_note = ""
            if not sizes:
                size_note = "no dimensions"
            elif family.get("category") == "fastener_screw":
                # A screw is described by length and shank diameter, so the long
                # axis of the trace is the length and the short axis is at least
                # the shank -- the head makes it wider, never narrower.
                length = float(dims.get("length") or 0)
                diameter = float(dims.get("diameter") or 0)
                long_axis, short_axis = max(w, h), min(w, h)
                if not length:
                    size_note = "no length"
                elif abs(long_axis - length) > max(4.0, 0.12 * length):
                    size_note = "MISMATCH traced %.0f mm long vs %g mm stated" % (long_axis, length)
                elif diameter and short_axis + 0.5 < diameter:
                    size_note = "MISMATCH traced %.1f mm across vs %g mm shank" % (short_axis, diameter)
                else:
                    size_note = "OK %.0f mm long, %.1f across (shank %g)" % (long_axis, short_axis, diameter)
            elif SEAT_CATEGORIES and family.get("category") in SEAT_CATEGORIES:
                # Hangers and post bases publish the SEAT -- the timber they
                # receive -- not their own envelope. EWH195/47 means a 195x47
                # I-joist; the hanger itself is 211x237 over its nailing flanges.
                # The part must therefore be at least as big as the timber, and
                # not absurdly bigger. Comparing it as an envelope reported a
                # 42 mm error on a perfectly correct part.
                small, large = min(sizes), max(sizes)
                if w + 0.5 >= small and h + 0.5 >= small:
                    over = max(w, h) - large
                    if over > SEAT_MAX_OVER_MM:
                        size_note = "REVIEW seat %gx%g, traced %.0fx%.0f (+%.0f mm over)" % (small, large, w, h, over)
                    else:
                        size_note = "OK seat %gx%g inside %.0fx%.0f" % (small, large, w, h)
                else:
                    size_note = "MISMATCH traced %.0fx%.0f smaller than seat %gx%g" % (w, h, small, large)
            else:
                best = None
                for a in sizes:
                    for b in sizes:
                        err = max(abs(w - a), abs(h - b))
                        if best is None or err < best[0]:
                            best = (err, a, b)
                err, a, b = best
                if err <= max(SIZE_SLACK_MM, 3 * t):
                    size_note = "OK %.0fx%.0f vs %gx%g (+%.1f)" % (w, h, a, b, err)
                else:
                    size_note = "MISMATCH %.0fx%.0f vs published %gx%g (off %.1f mm)" % (w, h, a, b, err)

            rows.append((family.get("family"), sku, "verified", "%.0fx%.0f" % (w, h), hole_note, size_note))

    fails = [r for r in rows if r[2] == "NO GEOMETRY"
             or r[4].startswith("TRACED")
             or r[5].startswith("MISMATCH") or r[5].startswith("REVIEW")]

    print("%-14s %-16s %-10s %-12s %-32s %s" % ("FAMILY", "SKU", "STATUS", "TRACED", "HOLES", "SIZE"))
    print("-" * 130)
    for r in rows:
        print("%-14s %-16s %-10s %-12s %-32s %s" % r)

    print()
    print("parts checked : %d" % len(rows))
    print("clean         : %d" % (len(rows) - len(fails)))
    print("needs review  : %d" % len(fails))
    if fails:
        print()
        print("REVIEW:")
        for r in fails:
            print("  %-16s %s %s" % (r[1], r[4], r[5]))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
