"""
doc_defs.py — the DS 1140 / BR18 document set, defined once.

These names are printed on every cover page, in the header's "Afsnit" field and
in B1's document list, so they are the official ones from BR18 §§ 494-505 —
spelled in Danish. They were previously transliterated (ae/oe) in main.py and
spelled correctly elsewhere, which put "Statisk projektredegoerelse" on issued
documents. One definition, imported by everything that needs it.
"""

DOC_DEFS: dict[str, str] = {
    "A1": "Konstruktionsgrundlag",
    "A2": "Statiske beregninger",
    "A3": "Konstruktionstegninger og modeller",
    "A4": "Konstruktionsændringer",
    "A5": "Konstruktion som udført",
    "B1": "Statisk projektredegørelse",
    "B2": "Statisk kontrolplan",
    "B3": "Statisk kontrolrapport",
}

# The transliterated names shipped before 2026-08-12. Used by the migration
# that repairs stored projects — and only for documents whose title is still
# one of these, so a title the user has edited is never overwritten.
LEGACY_DOC_DEFS: dict[str, str] = {
    "A1": "Konstruktionsgrundlag",
    "A2": "Statiske beregninger",
    "A3": "Konstruktionstegninger og modeller",
    "A4": "Konstruktionsaendringer",
    "A5": "Konstruktion som udfoert",
    "B1": "Statisk projektredegoerelse",
    "B2": "Statisk kontrolplan",
    "B3": "Statisk kontrolrapport",
}
