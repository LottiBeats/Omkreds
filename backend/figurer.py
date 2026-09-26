"""
Figurnumre til billedblokke, som Words "Indsæt billedtekst".

Billeder med nummerering (standard) får "Figur n" foran billedteksten i PDF
og Word. Nummeret regnes her, ét sted, så de to eksporter altid er enige.
"""


def figurtekst(nr, caption: str) -> str:
    caption = (caption or "").strip()
    if nr is None:
        return caption
    return f"Figur {nr}: {caption}" if caption else f"Figur {nr}"


def nummerer_figurer(blocks: list) -> list:
    ud, n = [], 0
    for b in blocks:
        d = b.get("data") or {}
        if b.get("type") == "image" and d.get("image_b64") and d.get("numbered", True):
            n += 1
            b = {**b, "data": {**d, "_figur_nr": n}}
        ud.append(b)
    return ud
