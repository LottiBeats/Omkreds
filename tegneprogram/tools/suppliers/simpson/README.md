# Simpson Supplier Importer

This importer is intentionally conservative.

Omkreds must not insert hand-drawn manufacturer components as if they were exact supplier CAD. A Simpson component is insertable only when its variant has:

```json
{
  "geometry": {
    "status": "verified",
    "units": "mm",
    "elements": []
  }
}
```

Workflow:

1. Use `manifest.json` to track observed public Simpson product pages and CAD asset names.
2. Download permitted public CAD assets manually or with a future conservative downloader.
3. Convert DXF/DWG/PDF/SVG into normalized Omkreds geometry in millimetres.
4. Save converted geometry beside the source asset as `asset-name.omkreds.json`.
5. Run:

```bash
python tools/suppliers/simpson/build_library.py
```

The browser app consumes `component-library/manufacturers/simpson/library.json`.

Do not fabricate missing hole placement or product geometry. Leave components as `pending_import` until verified geometry exists.
