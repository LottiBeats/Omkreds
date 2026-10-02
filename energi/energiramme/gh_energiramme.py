# r: openpyxl, pyyaml, honeybee-energy, reportlab, matplotlib, pywin32
"""
gh_energiramme.py - energiramme i Grasshopper med Social- og Boligstyrelsens regneark.

Sæt koden i en Python 3 Script-komponent (Rhino 8). Første kørsel henter pakkerne
(linjen øverst) og regnearket fra sbst.dk.

Inputs (Item Access):
    _pakke      mappen med energi-pakken (den, der indeholder energiramme, model og rapport)
    _model      file_path fra HB Dump Objects (.hbjson) - samme model som indeklimaet
    _projekt    projekt.yaml; afsnittet  energiramme:  giver bygningstype, ventilation, forsyning osv.
    _eksport    eksportmappen (samme som gh_eksport); her skrives Energiramme.xlsx og energiramme.json
    _nord_      nordretning i grader (som Ladybugs north), standard 0
    _notat_     True for også at bygge energirammenotatet (PDF)
    _beregn     True
Outputs:
    regneark    stien til det udfyldte og genberegnede regneark
    resultat    tekst til et Panel
    pdf         energirammenotatet (hvis _notat_)

Genberegningen sker i Excel (via pywin32) eller LibreOffice. Har du ingen af dem, så åbn
regnearket i Excel, gem det, og kør igen med _beregn.
"""
import os
import sys

regneark = resultat = pdf = None
if not (_pakke and _model and _eksport):  # noqa: F821
    print("Forbind _pakke, _model og _eksport")
elif not _beregn:  # noqa: F821
    print("Sæt _beregn til True")
else:
    for d in ("energiramme", "model", "rapport"):
        sti = os.path.join(str(_pakke), d)  # noqa: F821
        if sti not in sys.path:
            sys.path.insert(0, sti)
    import importlib
    import yaml
    import be_regneark, be_model, energiramme  # noqa: E401
    for m in (be_regneark, be_model, energiramme):
        importlib.reload(m)
    from honeybee.model import Model
    m = Model.from_hbjson(str(_model))  # noqa: F821
    prj = {}
    if _projekt:  # noqa: F821
        with open(str(_projekt), encoding="utf-8") as f:  # noqa: F821
            prj = yaml.safe_load(f) or {}
    ind = dict(prj.get("energiramme") or {})
    ind.setdefault("navn", prj.get("sag") or "Projekt")
    ud = energiramme.koer(m, ind, str(_eksport), nord=float(_nord_ or 0))  # noqa: F821
    regneark = os.path.join(str(_eksport), ud["regneark"])  # noqa: F821
    br = ud["resultat"]["energirammer"]["BR18"]
    resultat = ("Energibehov %.1f kWh/m2 år   Ramme BR18 %.1f   %s\n(genberegnet med %s)"
                % (br["behov"], br["ramme"], "OVERHOLDT" if br["opfyldt"] else "IKKE OVERHOLDT",
                   ud["genberegnet_med"]))
    print(resultat)
    if _notat_ and _projekt:  # noqa: F821
        import byg_energirammenotat
        importlib.reload(byg_energirammenotat)
        pdf = str(byg_energirammenotat.byg(str(_eksport), str(_projekt)))  # noqa: F821
        print("Notat: %s" % pdf)
