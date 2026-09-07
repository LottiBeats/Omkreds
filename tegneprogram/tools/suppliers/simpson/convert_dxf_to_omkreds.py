import json
import math
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "component-library" / "manufacturers" / "simpson" / "assets"
GENERATED_JS = ROOT / "component-library" / "manufacturers" / "simpson" / "verified-geometry.generated.js"

SKU_BY_ASSET = {
    "c-abr7015-2do-cad-mult-prod-2.dxf": "ABR7015",
    "c-abr9020-2do-cad-mult-prod.dxf": "ABR9020",
    "c-abr10525-2do-cad-mult-prod.dxf": "ABR10525",
    "c-ewh195-47-2do-cad-mult-prod.dxf": "EWH195/47",
    "c-ewh195-47-bent-2do-cad-mult-prod.dxf": "EWH195/47-BENT",
    "c-np15-100-140-2do-cad-mult-prod.dxf": "NP15/100/140",
    "c-np20-100-1200-2do-cad-mult-prod.dxf": "NP20/100/1200",
    "C_PPB70G_2DO_CAD_MULT_Prod.dxf": "PPB70G",
}

GENERATED_FAMILIES = {
    "CSA": {
        "id": "simpson-csa",
        "family": "CSA",
        "name": "Beslagskruer",
        "category": "fastener_screw",
        "sourceUrl": "https://www.strongtie.dk/da-DK/produkter/beslagskruer-csa",
        "fasteners": [],
        "representations": ["symbol", "top", "side", "section", "elevation"],
    },
    "BSIN": {
        "id": "simpson-bsin",
        "family": "BSIN",
        "name": "Bjaelkesko med indadvendte flige",
        "category": "joist_hanger",
        "sourceUrl": "https://www.strongtie.dk/da-DK/produkter/bjaelkesko-bsin",
        "fasteners": ["CNA4.0", "CSA5.0"],
        "representations": ["symbol", "top", "side", "section", "elevation"],
    },
    "BSNN": {
        "id": "simpson-bsnn",
        "family": "BSNN",
        "name": "Bjaelkesko med udvendige flige",
        "category": "joist_hanger",
        "sourceUrl": "https://www.strongtie.dk/da-DK/produkter/bjaelkesko-bsnn",
        "fasteners": ["CNA4.0", "CSA5.0"],
        "representations": ["symbol", "top", "side", "section", "elevation"],
    },
}

VIEW_SUFFIXES = {
    "front": "elevation",
    "top": "top",
    "left": "side",
    "right": "sideRight",
    "bottom": "bottom",
    "iso": "symbol",
}


def read_pairs(path):
    lines = path.read_text(encoding="latin-1", errors="ignore").splitlines()
    return [(lines[i].strip(), lines[i + 1].strip()) for i in range(0, len(lines) - 1, 2)]


def collect_entity(pairs, index):
    kind = pairs[index][1]
    data = []
    index += 1
    while index < len(pairs) and pairs[index][0] != "0":
        data.append(pairs[index])
        index += 1
    return {"kind": kind, "data": data}, index


def sections(pairs):
    result = {}
    index = 0
    while index < len(pairs):
        code, value = pairs[index]
        if code == "0" and value == "SECTION" and index + 1 < len(pairs) and pairs[index + 1][0] == "2":
            name = pairs[index + 1][1]
            index += 2
            start = index
            while index < len(pairs) and not (pairs[index][0] == "0" and pairs[index][1] == "ENDSEC"):
                index += 1
            result[name] = pairs[start:index]
        index += 1
    return result


def block_entities(block_pairs):
    blocks = {}
    index = 0
    while index < len(block_pairs):
        code, value = block_pairs[index]
        if code == "0" and value == "BLOCK":
            index += 1
            name = None
            entities = []
            while index < len(block_pairs):
                code, value = block_pairs[index]
                if code == "2" and name is None:
                    name = value
                if code == "0" and value == "ENDBLK":
                    break
                if code == "0" and value not in {"BLOCK", "ENDBLK"}:
                    entity, index = collect_entity(block_pairs, index)
                    entities.append(entity)
                    continue
                index += 1
            if name:
                blocks[name] = entities
        index += 1
    return blocks


def entity_list(entity_pairs):
    entities = []
    index = 0
    while index < len(entity_pairs):
        if entity_pairs[index][0] == "0":
            entity, index = collect_entity(entity_pairs, index)
            entities.append(entity)
            continue
        index += 1
    return entities


def floats(entity, code):
    values = []
    for key, value in entity["data"]:
        if key == code:
            try:
                values.append(float(value))
            except ValueError:
                pass
    return values


def first_float(entity, code, default=0.0):
    values = floats(entity, code)
    return values[0] if values else default


def first_text(entity, code, default=""):
    for key, value in entity["data"]:
        if key == code:
            return value
    return default


def transform_point(point, transform):
    x, y = point
    x *= transform["sx"]
    y *= transform["sy"]
    radians = math.radians(transform["rotation"])
    rx = x * math.cos(radians) - y * math.sin(radians)
    ry = x * math.sin(radians) + y * math.cos(radians)
    return rx + transform["x"], ry + transform["y"]


def arc_points(cx, cy, radius, start, end, steps=24):
    while end < start:
        end += 360
    count = max(8, int(abs(end - start) / 8), steps)
    return [
        (
            cx + math.cos(math.radians(start + (end - start) * i / count)) * radius,
            cy + math.sin(math.radians(start + (end - start) * i / count)) * radius,
        )
        for i in range(count + 1)
    ]


def ellipse_points(entity, steps=40):
    cx = first_float(entity, "10")
    cy = first_float(entity, "20")
    major_x = first_float(entity, "11")
    major_y = first_float(entity, "21")
    ratio = first_float(entity, "40", 1.0)
    start = first_float(entity, "41")
    end = first_float(entity, "42", math.tau)
    while end < start:
        end += math.tau
    length = math.hypot(major_x, major_y)
    if length == 0:
        return []
    minor_x = -major_y * ratio
    minor_y = major_x * ratio
    count = max(12, int(abs(end - start) / math.tau * steps))
    points = []
    for i in range(count + 1):
        t = start + (end - start) * i / count
        points.append((cx + math.cos(t) * major_x + math.sin(t) * minor_x, cy + math.cos(t) * major_y + math.sin(t) * minor_y))
    return points


def spline_points(entity):
    xs = floats(entity, "10")
    ys = floats(entity, "20")
    return list(zip(xs, ys))


def convert_entity(entity, blocks, transform, output, ignored):
    kind = entity["kind"]
    if kind == "INSERT":
        name = first_text(entity, "2")
        child_transform = {
            "x": transform["x"] + first_float(entity, "10") * transform["sx"],
            "y": transform["y"] + first_float(entity, "20") * transform["sy"],
            "sx": transform["sx"] * first_float(entity, "41", 1.0),
            "sy": transform["sy"] * first_float(entity, "42", 1.0),
            "rotation": transform["rotation"] + first_float(entity, "50", 0.0),
        }
        for child in blocks.get(name, []):
            convert_entity(child, blocks, child_transform, output, ignored)
        return

    if kind == "LINE":
        p1 = transform_point((first_float(entity, "10"), first_float(entity, "20")), transform)
        p2 = transform_point((first_float(entity, "11"), first_float(entity, "21")), transform)
        output.append({"type": "line", "attrs": {"x1": p1[0], "y1": p1[1], "x2": p2[0], "y2": p2[1], "strokeWidth": 0.35}})
        return

    if kind == "CIRCLE":
        center = transform_point((first_float(entity, "10"), first_float(entity, "20")), transform)
        radius = first_float(entity, "40") * (abs(transform["sx"]) + abs(transform["sy"])) / 2
        output.append({"type": "circle", "attrs": {"cx": center[0], "cy": center[1], "r": radius, "strokeWidth": 0.35}})
        return

    if kind == "ARC":
        points = arc_points(first_float(entity, "10"), first_float(entity, "20"), first_float(entity, "40"), first_float(entity, "50"), first_float(entity, "51"))
        output.append({"type": "polyline", "attrs": {"points": [transform_point(point, transform) for point in points], "strokeWidth": 0.35}})
        return

    if kind == "ELLIPSE":
        points = ellipse_points(entity)
        if points:
            output.append({"type": "polyline", "attrs": {"points": [transform_point(point, transform) for point in points], "strokeWidth": 0.35}})
        return

    if kind == "SPLINE":
        points = spline_points(entity)
        if len(points) > 1:
            output.append({"type": "polyline", "attrs": {"points": [transform_point(point, transform) for point in points], "strokeWidth": 0.35}})
        return

    if kind not in {"ENDBLK"}:
        ignored[kind] += 1


def normalize(elements):
    if not elements:
        return {"width": 0, "height": 0}
    points = []
    for element in elements:
        attrs = element["attrs"]
        if element["type"] == "line":
            points.extend([(attrs["x1"], attrs["y1"]), (attrs["x2"], attrs["y2"])])
        elif element["type"] == "circle":
            points.extend([(attrs["cx"] - attrs["r"], attrs["cy"] - attrs["r"]), (attrs["cx"] + attrs["r"], attrs["cy"] + attrs["r"])])
        elif element["type"] == "polyline":
            points.extend(attrs["points"])
    min_x = min(x for x, _ in points)
    max_x = max(x for x, _ in points)
    min_y = min(y for _, y in points)
    max_y = max(y for _, y in points)
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    for element in elements:
        attrs = element["attrs"]
        if element["type"] == "line":
            attrs["x1"], attrs["y1"] = round(attrs["x1"] - cx, 4), round(-(attrs["y1"] - cy), 4)
            attrs["x2"], attrs["y2"] = round(attrs["x2"] - cx, 4), round(-(attrs["y2"] - cy), 4)
        elif element["type"] == "circle":
            attrs["cx"], attrs["cy"] = round(attrs["cx"] - cx, 4), round(-(attrs["cy"] - cy), 4)
            attrs["r"] = round(attrs["r"], 4)
        elif element["type"] == "polyline":
            attrs["points"] = [[round(x - cx, 4), round(-(y - cy), 4)] for x, y in attrs["points"]]
    return {"width": round(max_x - min_x, 4), "height": round(max_y - min_y, 4)}


def view_key_from_block(block_name):
    suffix = block_name.rsplit("-", 1)[-1].lower()
    return VIEW_SUFFIXES.get(suffix)


def sku_from_asset(source):
    if source.name in SKU_BY_ASSET:
        return SKU_BY_ASSET[source.name]
    match = re.match(r"^F_CSA(\d+)X(\d+)_2DO", source.name, re.IGNORECASE)
    if match:
        diameter = f"{int(match.group(1)) / 10:.1f}"
        return f"CSA{diameter}X{int(match.group(2))}"
    match = re.match(r"^C_([A-Z]+)(\d+)_(\d+)_2DO", source.name, re.IGNORECASE)
    if match:
        return f"{match.group(1).upper()}{match.group(2)}/{match.group(3)}"
    match = re.match(r"^c-([a-z]+)(\d+)-(\d+)-2do", source.name, re.IGNORECASE)
    if match:
        return f"{match.group(1).upper()}{match.group(2)}/{match.group(3)}"
    return source.stem.upper()


def family_from_sku(sku):
    match = re.match(r"^([A-Z]+)", sku)
    return match.group(1) if match else ""


def dimensions_from_sku(sku):
    match = re.match(r"^CSA(\d+(?:\.\d+)?)X(\d+)", sku)
    if match:
        return {"diameter": float(match.group(1)), "length": int(match.group(2))}
    match = re.match(r"^[A-Z]+(\d+)/(\d+)", sku)
    if not match:
        return {}
    return {"width": int(match.group(1)), "height": int(match.group(2))}


def write_generated_js(converted):
    payload = {"simpson-strong-tie": {}}
    generated_families = {"simpson-strong-tie": []}
    family_variants = {}
    for data in converted:
        payload["simpson-strong-tie"][data["sku"]] = {
            "status": "verified",
            "sourceAsset": data["sourceAsset"],
            "importedAt": data["importedAt"],
            "units": data["units"],
            "bbox": data["bbox"],
            "elements": data["elements"],
            "views": data["views"],
        }
        family_key = family_from_sku(data["sku"])
        if family_key in GENERATED_FAMILIES:
            family_variants.setdefault(family_key, []).append({
                "sku": data["sku"],
                "dimensions": data.get("dimensions", {}),
                "geometry": {"status": "pending_import", "sourceAsset": data["sourceAsset"]},
            })
    for family_key, variants in family_variants.items():
        family = {**GENERATED_FAMILIES[family_key], "variants": sorted(variants, key=lambda item: item["sku"])}
        generated_families["simpson-strong-tie"].append(family)
    GENERATED_JS.write_text("window.omkredsVerifiedManufacturerGeometry = " + json.dumps(payload, separators=(",", ":")) + ";\n", encoding="utf-8")
    with GENERATED_JS.open("a", encoding="utf-8") as file:
        file.write("window.omkredsGeneratedManufacturerFamilies = " + json.dumps(generated_families, separators=(",", ":")) + ";\n")


def convert_file(source):
    sku = sku_from_asset(source)
    target = source.with_suffix(".omkreds.json")
    pairs = read_pairs(source)
    dxf_sections = sections(pairs)
    blocks = block_entities(dxf_sections["BLOCKS"])
    ignored = Counter()
    views = {}
    total_count = 0
    fallback_elements = []
    for entity in entity_list(dxf_sections["ENTITIES"]):
        block_name = first_text(entity, "2")
        view_key = view_key_from_block(block_name)
        elements = []
        convert_entity(entity, blocks, {"x": 0, "y": 0, "sx": 1, "sy": 1, "rotation": 0}, elements, ignored)
        if view_key:
            bbox = normalize(elements)
            views[view_key] = {"sourceBlock": block_name, "bbox": bbox, "elements": elements}
        else:
            fallback_elements.extend(elements)
        total_count += len(elements)
    if fallback_elements:
        normalize(fallback_elements)
    # A flat product's `elevation` is its edge -- 140 x 1.5 mm with four entities
    # in it, while the real face sits in `top`. Prefer a named view, but never a
    # degenerate one, or the part is imported as a sliver.
    def _usable(view):
        bbox = view.get("bbox") or {}
        w, h = float(bbox.get("width", 0)), float(bbox.get("height", 0))
        if not (w and h):
            return False
        widest = max(max(float((v.get("bbox") or {}).get("width", 0)),
                         float((v.get("bbox") or {}).get("height", 0)))
                     for v in views.values()) or 1.0
        return min(w, h) >= 0.06 * widest

    default_view = None
    for _key in ["elevation", "top", "symbol"] + list(views):
        _candidate = views.get(_key)
        if _candidate and _candidate.get("elements") and _usable(_candidate):
            default_view = _candidate
            break
    if default_view is None:
        default_view = views.get("elevation") or views.get("symbol") or next(iter(views.values()), None)
    default_elements = default_view["elements"] if default_view else fallback_elements
    bbox = default_view["bbox"] if default_view else {"width": 0, "height": 0}
    data = {
        "schemaVersion": 1,
        "sku": sku,
        "sourceAsset": source.name,
        "units": "mm",
        "importedAt": "2026-08-14",
        "bbox": bbox,
        "elements": default_elements,
        "views": views,
        "entityCount": total_count,
        "ignoredEntityTypes": dict(ignored),
        "dimensions": dimensions_from_sku(sku),
    }
    target.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"\n{sku}: converted {total_count} elements to {target.name}")
    for view_name, view in views.items():
        print(f"{view_name}: {len(view['elements'])} elements, {view['bbox']['width']} x {view['bbox']['height']} mm")
    print(f"Bounding box: {bbox['width']} x {bbox['height']} mm")
    if ignored:
        print(f"Ignored: {dict(ignored)}")
    return data


def main():
    source_paths = [
        *sorted(ASSETS.glob("*.dxf")),
        *sorted((ASSETS / "csa-dxf").glob("*.dxf")),
        *sorted((ASSETS / "bsin-dxf").glob("*.dxf")),
        *sorted((ASSETS / "bsnn-dxf").glob("*.dxf")),
    ]
    converted = [convert_file(path) for path in source_paths]
    write_generated_js(converted)
    print(f"\nWrote {GENERATED_JS.name} with {len(converted)} verified geometries.")


if __name__ == "__main__":
    main()
