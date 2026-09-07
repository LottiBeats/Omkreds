import json
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MANIFEST = Path(__file__).with_name("manifest.json")
LIBRARY = ROOT / "component-library" / "manufacturers" / "simpson" / "library.json"
ASSETS = ROOT / "component-library" / "manufacturers" / "simpson" / "assets"
REPORT = ROOT / "component-library" / "manufacturers" / "simpson" / "import-report.md"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def parse_native_geometry(source_path):
    """Placeholder for the real CAD conversion output parser.

    The current browser runtime expects normalized native elements in millimetres:
    {"type": "line", "attrs": {"x1": 0, "y1": 0, "x2": 10, "y2": 0}}

    Keep this intentionally strict: if conversion has not produced normalized
    geometry, the component stays pending_import instead of becoming fake CAD.
    """
    geometry_path = source_path.with_suffix(".omkreds.json")
    if not geometry_path.exists():
        return None
    data = load_json(geometry_path)
    elements = data.get("elements")
    if not isinstance(elements, list) or not elements:
        return None
    geometry = {
        "status": "verified",
        "sourceAsset": source_path.name,
        "importedAt": data.get("importedAt", date.today().isoformat()),
        "units": data.get("units", "mm"),
        "bbox": data.get("bbox"),
        "elements": elements,
    }
    if isinstance(data.get("views"), dict):
        geometry["views"] = data["views"]
    return geometry


def source_asset_for_variant(variant):
    explicit = variant.get("geometry", {}).get("sourceAsset")
    if explicit:
        return explicit
    for asset in variant.get("assets", []):
        if asset.get("format", "").upper() == "DXF" and asset.get("name"):
            return asset["name"]
    return None


def main():
    manifest = load_json(MANIFEST)
    library = load_json(LIBRARY)
    verified = 0
    pending = 0
    missing = []

    for family in library.get("families", []):
        for variant in family.get("variants", []):
            asset_name = source_asset_for_variant(variant)
            if not asset_name:
                pending += 1
                missing.append(f"{family.get('family')} {variant.get('sku')}: no source asset")
                continue
            source = ASSETS / asset_name
            native = parse_native_geometry(source)
            if native:
                variant["geometry"] = native
                verified += 1
            else:
                variant["geometry"] = {
                    **variant.get("geometry", {}),
                    "status": "pending_import",
                    "sourceAsset": asset_name,
                }
                pending += 1
                missing.append(f"{family.get('family')} {variant.get('sku')}: missing {source.with_suffix('.omkreds.json').name}")

    LIBRARY.write_text(json.dumps(library, indent=2, ensure_ascii=False), encoding="utf-8")
    REPORT.write_text(
        "\n".join([
            "# Simpson Strong-Tie Import Report",
            "",
            f"Date: {date.today().isoformat()}",
            "",
            f"Families in manifest: {len(manifest.get('products', []))}",
            f"Verified native geometries: {verified}",
            f"Pending geometries: {pending}",
            "",
            "Missing / pending:",
            *[f"- {item}" for item in missing],
            "",
            "No values were fabricated. Supplier components remain blocked in Omkreds until verified native geometry exists.",
            "",
        ]),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
