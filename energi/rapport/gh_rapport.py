# r: reportlab, pyyaml
"""
gh_rapport.py - bygger indeklimanotatet (PDF) i Grasshopper med ét klik.

Sæt koden i en Python 3 Script-komponent (Rhino 8). Første gang henter Rhino
reportlab og pyyaml (linjen øverst); det tager et minut.

Inputs (Item Access):
    _pakke      mappen med rapportpakken (den, der indeholder mapperne rapport og regler)
    _eksport    eksportmappen fra gh_eksport (med resultater.json og billeder)
    _projekt    sti til projekt.yaml (sagsoplysninger, logo, antagelser)
    _byg        True for at bygge notatet
Outputs:
    pdf         stien til det færdige notat
"""
import os
import sys

pdf = None
if not (_pakke and _eksport and _projekt):  # noqa: F821
    print("Forbind _pakke, _eksport og _projekt")
elif not _byg:  # noqa: F821
    print("Sæt _byg til True")
else:
    sti = os.path.join(str(_pakke), "rapport")  # noqa: F821
    if sti not in sys.path:
        sys.path.insert(0, sti)
    import importlib
    import byg_indeklimanotat
    importlib.reload(byg_indeklimanotat)  # brug altid den nyeste udgave af filen
    pdf = str(byg_indeklimanotat.byg(str(_eksport), str(_projekt)))  # noqa: F821
    print("Notat skrevet: %s" % pdf)
