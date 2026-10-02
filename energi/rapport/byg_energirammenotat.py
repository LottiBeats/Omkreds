# -*- coding: utf-8 -*-
"""
byg_energirammenotat.py - energirammenotat (PDF) i samme stil som indeklimanotatet.

Læser eksportmappen/energiramme.json, som gh_energiramme.py skriver:
    {"input": data til regnearket, "resultat": be_regneark.resultat(), "regneark": filnavn,
     "regneark_version": "...", "genberegnet_med": "Excel"/"LibreOffice"}

    python energi/rapport/byg_energirammenotat.py <eksportmappe> <projekt.yaml> [-o notat.pdf]
"""
import argparse
import json
from datetime import date
from html import escape
from pathlib import Path

import yaml
from reportlab.lib.units import mm
from reportlab.platypus import NextPageTemplate, PageBreak, Paragraph, Spacer

import byg_indeklimanotat as bi
import figurer
from byg_indeklimanotat import (BREDDE, H2, NOTE, PUNKT, Notat, Overskrift, TaelCanvas, figur, konklusion,
                                noegletal, p, side_info, status, tabel, tal)


def _udestaaende(e, prj):
    ud = ["Beregningen er udført med Social- og Boligstyrelsens regneark for den nye beregningsmetode "
          "(%s). Regnearket er betegnet som udkast. Det skal bekræftes, at metoden gælder for byggesagen, "
          "og hvordan kommunen ønsker beregningen dokumenteret." % e.get("regneark_version", "2026")]
    inp = e.get("input") or {}
    if (inp.get("forsyning") or "regneark") == "regneark":
        ud.append("Varmeforsyning, varmt brugsvand, pumper og vedvarende energi er regnearkets eksempel og "
                  "ikke projektets. De skal angives i projektets indstillinger.")
    else:
        ud.append("Detaljer om varmeforsyning (effekt, virkningsgrad/COP), varmt brugsvand og pumper er "
                  "regnearkets standardværdier, medmindre de er angivet. De skal kontrolleres mod projektet.")
    if not prj.get("u_vaerdier_endelige"):
        ud.append("U-værdier og vinduesdata er modellens værdier (homogene lag). Endelige værdier efter DS 418 "
                  "og producentdata skal indgå.")
    return ud + list((prj.get("energiramme") or {}).get("udestaaende") or [])


def byg(eksport, projekt_yaml, ud_fil=None):
    eksport, projekt_yaml = Path(eksport), Path(projekt_yaml)
    prj = yaml.safe_load(projekt_yaml.read_text(encoding="utf-8")) or {}
    e = json.loads((eksport / "energiramme.json").read_text(encoding="utf-8"))
    res, inp = e["resultat"], e.get("input") or {}
    revs = prj.get("revisioner") or []
    prj["_rev"] = revs[-1]["rev"] if revs else ""
    prj["_dato"] = revs[-1]["dato"] if revs else date.today().strftime("%d.%m.%Y")
    logo = prj.get("logo")
    if logo and not Path(logo).is_absolute():
        logo = projekt_yaml.parent / logo
    prj["_logo"] = logo
    prj["titel_linjer"] = ["Energiramme"]
    prj["kort_titel"] = "Energiramme, %s" % (prj.get("sag") or "")
    punkter = _udestaaende(e, prj)
    bi.FORELOEBIG[0] = bool(punkter)
    if punkter:
        prj["dokumenttype"] = "Foreløbigt notat"
        prj["kort_titel"] += " · foreløbig"
    bi._FIGNR[0] = 0
    figmappe = eksport / "_figurer"
    figmappe.mkdir(exist_ok=True)
    billeder = eksport / "billeder"
    omslag = billeder / ("%s.png" % (prj.get("omslag") or "model_iso"))
    prj["_omslag"] = bi.beskaer.trim(omslag, figmappe / ("trim_" + omslag.name)) if omslag.exists() else None

    br = res["energirammer"]["BR18"]
    lav = res["energirammer"].get("Lavenergi") or {}
    story = [NextPageTemplate("indhold"), PageBreak()] + side_info(prj)

    # 1 Indledning
    story.append(Overskrift("1.", "Indledning"))
    story.append(p("Notatet dokumenterer bygningens samlede energibehov i forhold til energirammen i BR18 "
                   "(kapitel 11). Energibehovet er beregnet med den nye beregningsmetode for bygningers "
                   "energimæssige ydeevne, som Social- og Boligstyrelsen har offentliggjort som bilag til "
                   "bygningsreglementet med tilhørende referenceregneark. Klimaskærmen er overført direkte fra "
                   "projektets 3D-model (Rhino/Grasshopper med Honeybee), og regnearket har udført beregningen."))

    # 2 Sammenfatning
    story.append(Overskrift("2.", "Sammenfatning"))
    felter = [(tal(br["behov"]), "kWh/m² år", "samlet energibehov med energifaktorer"),
              (tal(br["ramme"]), "kWh/m² år", "energiramme BR18%s" % ("" if br["opfyldt"] else
                                                                       " · <b>ikke overholdt</b>")),
              (tal(res.get("etageareal_m2"), 0), "m²", "opvarmet etageareal")]
    if lav.get("ramme"):
        felter.append((tal(lav["ramme"]), "kWh/m² år", "lavenergiramme"))
    story += noegletal(felter)
    margin = 100 * (1 - br["behov"] / br["ramme"]) if br["ramme"] else 0
    story += konklusion("<b>Energirammen er %s.</b> Det samlede energibehov er %s kWh/m² år mod en ramme på "
                        "%s kWh/m² år, %s %% %s rammen."
                        % (("foreløbigt overholdt" if bi.FORELOEBIG[0] else "overholdt") if br["opfyldt"]
                           else "ikke overholdt", tal(br["behov"]), tal(br["ramme"]), tal(abs(margin), 0),
                           "under" if margin >= 0 else "over"))
    rows = [["Energiramme", "Ramme [kWh/m² år]", "Tillæg", "Energibehov", "Status"]]
    for navn in ("BR18", "Lavenergi", "Renoveringsklasse 1", "Renoveringsklasse 2"):
        r = res["energirammer"].get(navn)
        if r and r.get("ramme") is not None:
            rows.append([navn, tal(r["ramme"]), tal(r["tillaeg"]), tal(r["behov"]), status(r["opfyldt"])])
    story.append(tabel(rows, [50 * mm, 36 * mm, 22 * mm, 28 * mm, 34 * mm], hoejre=(1, 2, 3)))
    story += bi.afsnit_udestaaende(punkter)

    # 3 Energibehov
    story.append(Overskrift("3.", "Energibehov"))
    nt = res.get("noegletal_kWh_m2") or {}
    rows = [["Post", "kWh/m² år"]] + [[k, tal(v)] for k, v in nt.items()]
    story.append(tabel(rows, [90 * mm, 30 * mm], hoejre=(1,)))
    story.append(p("Tallene er uden energifaktorer, undtagen samlet energibehov. Overtemperatur i rum er "
                   "metodens tillæg for risiko for overophedning; det er ikke en dokumentation af det termiske "
                   "indeklima efter § 386.", NOTE))
    story += figur(figurer.energiramme_soejler(br["behov"], {n: r["ramme"] for n, r in res["energirammer"].items()
                                                              if r.get("ramme")}, figmappe / "rammer.png"),
                   "Samlet energibehov mod energirammerne.", maks_h=60 * mm)
    if res.get("energibehov_pr_maaned_kWh_m2"):
        story += figur(figurer.energibehov_maaned(res["energibehov_pr_maaned_kWh_m2"], figmappe / "maaned.png"),
                       "Energibehov med energifaktorer pr. måned.", maks_h=60 * mm)

    # 4 Beregningsgrundlag
    story.append(Overskrift("4.", "Beregningsgrundlag"))
    b = inp.get("bygning") or {}
    rows = [["Forudsætning", "Værdi"],
            ["Bygningstype", {"F": "Fritliggende bolig", "S": "Sammenbygget bolig", "E": "Etagebolig",
                              "A": "Andet end bolig"}.get(b.get("type"), b.get("type") or "–")],
            ["Opvarmet etageareal", "%s m²" % tal(b.get("etageareal"))],
            ["Varmekapacitet", "%s Wh/K m²" % tal(b.get("varmekapacitet"), 0)],
            ["Normal brugstid", "%s timer/uge" % tal(b.get("brugstid"), 0)],
            ["Varmeforsyning", (inp.get("forsyning") or "regneark").replace("_", " ")],
            ["Regneark", "%s (genberegnet med %s)" % (e.get("regneark", "–"), e.get("genberegnet_med", "–"))]]
    story.append(tabel(rows, [55 * mm, BREDDE - 55 * mm]))
    if inp.get("konstruktioner"):
        story.append(p("Klimaskærm", H2))
        rows = [["Flade", "Areal [m²]", "U [W/m²K]", "b"]]
        for k in inp["konstruktioner"]:
            rows.append([k["navn"], tal(k["areal"]), tal(k["u"], 3), tal(k.get("b") or 1, 2)])
        story.append(tabel(rows, [100 * mm, 26 * mm, 26 * mm, 18 * mm], hoejre=(1, 2, 3)))
    if inp.get("linjetab"):
        story.append(p("Linjetab", H2))
        rows = [["Samling", "Længde [m]", "ψ [W/mK]"]]
        for k in inp["linjetab"]:
            rows.append([k["navn"], tal(k["laengde"]), tal(k["psi"], 2)])
        story.append(tabel(rows, [100 * mm, 30 * mm, 30 * mm], hoejre=(1, 2)))
    if inp.get("vinduer"):
        story.append(p("Vinduer og døre", H2))
        rows = [["Vindue", "Orient.", "Hældn.", "Areal [m²]", "U", "Rudeandel", "g"]]
        for v in inp["vinduer"]:
            rows.append([v["navn"], v["orientering"].upper(), "%d°" % v["haeldning"], tal(v["areal"]),
                         tal(v["u"], 2), tal(v.get("ff"), 2), tal(v.get("g"), 2)])
        story.append(tabel(rows, [62 * mm, 16 * mm, 16 * mm, 22 * mm, 16 * mm, 20 * mm, 16 * mm],
                           hoejre=(3, 4, 5, 6)))
    vent = (inp.get("ventilation") or [{}])[0]
    if vent:
        story.append(p("Ventilation og interne laster", H2))
        it = (inp.get("intern") or [{}])[0]
        rows = [["Parameter", "Værdi"],
                ["Mekanisk ventilation, vinter", "%s l/s m²" % tal(vent.get("qvm"), 2)],
                ["Varmegenvinding", "%s %%" % tal(100 * (vent.get("hvgv") or 0), 0)],
                ["SEL", "%s kJ/m³" % tal(vent.get("sel"), 2)],
                ["Infiltration", "%s l/s m²" % tal(vent.get("qid"), 2)],
                ["Udluftning, sommer", "%s l/s m²" % tal(vent.get("sommer_qid"), 2)],
                ["Personer / udstyr", "%s / %s W/m²" % (tal(it.get("personer")), tal(it.get("udstyr")))]]
        story.append(tabel(rows, [70 * mm, 40 * mm], hoejre=(1,)))

    # 5 Forbehold
    story.append(Overskrift("5.", "Forudsætninger og forbehold"))
    for t in ("Beregningen er udført i Social- og Boligstyrelsens referenceregneark. Data er overført "
              "automatisk fra projektets model; regnearket (%s) er vedlagt som bilag og kan efterprøves."
              % e.get("regneark", ""),
              "Arealer følger modellens geometri. Transmissionsarealer skal svare til DS 418.",
              "Notatet skal opdateres, hvis klimaskærm, ventilation eller forsyning ændres."):
        story.append(Paragraph(escape(t), PUNKT, bulletText="–"))

    ud_fil = Path(ud_fil) if ud_fil else eksport / ("Energirammenotat_%s.pdf" % (prj.get("sag") or "projekt"))
    Notat(ud_fil, prj).multiBuild(story, canvasmaker=TaelCanvas)
    return ud_fil


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    a.add_argument("eksport")
    a.add_argument("projekt")
    a.add_argument("-o", "--ud")
    args = a.parse_args()
    print(byg(args.eksport, args.projekt, args.ud))
