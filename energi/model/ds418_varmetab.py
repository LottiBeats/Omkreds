# -*- coding: utf-8 -*-
"""
ds418_varmetab.py - varmetabsramme (BR18 § 284, stk. 2) og dimensionerende
varmetab efter DS 418, regnet på en Honeybee-model.

Virker både som Grasshopper-komponent og som almindeligt Python-modul.

GRASSHOPPER (GhPython, IronPython 2) - indsæt hele filen. Inputs:
    _model        HB Model
    _psi_         linjetab, tekst "vindue=0.03, fundament=0.10, ovenlys=0.10"  (valgfri)
    _u_           U-værdier der erstatter modellens, fx "ydervaeg=0.15, tag=0.10" (valgfri)
    _gulvvarme_   True/False (standard True -> terrændæk vægtes 0,625)
    _beregn       True
Outputs:
    tabel         tekst til et Panel
    projekt_W_K, ramme_W_K, glasandel, ok
    data          dict til eksport (resultater.json)

Metode (som i H+H-notatet):
- Projekt: modellens arealer og U-værdier + psi * længder.
- Referenceramme: samme geometri med BR18 bilag 2, tabel 4, og glas/døre
  begrænset til 30 % af det opvarmede etageareal. Resten af glasset regnes som ydervæg.
- Terrændæk og fundament vægtes med (gulvtemp - 10) / (20 - (-12)).
- Dimensionerende varmetab pr. rum: transmission + frisk luft uden genvinding.

Forudsætninger: arealer følger modellens geometri (tegnet til vægmidte, ikke
udvendige mål). U-værdier fra Honeybee regner lagene som homogene; angiv DS 418-
beregnede værdier i _u_ for opbygninger med stolper/spær.
"""
from __future__ import division, unicode_literals

TABEL4 = {"ydervaeg": 0.25, "tag": 0.15, "terraendaek": 0.15, "gulv_ude": 0.15, "vindue": 1.80,
          "psi_fundament": 0.15, "psi_vindue": 0.03, "psi_ovenlys": 0.10}
STANDARD_PSI = {"vindue": 0.03, "fundament": 0.15, "ovenlys": 0.10}
TOL = 0.01


def _tolk(tekst):
    """'a=1, b=2' eller liste af 'a=1' -> {'a': 1.0, 'b': 2.0}"""
    if not tekst:
        return {}
    if isinstance(tekst, (list, tuple)):
        tekst = ",".join(str(t) for t in tekst if t)
    ud = {}
    for del_ in str(tekst).replace(";", ",").split(","):
        if "=" in del_:
            k, v = del_.split("=", 1)
            ud[k.strip().lower()] = float(v.strip().replace(",", "."))
    return ud


def _kategori(face):
    t, bc = face.type.name, face.boundary_condition.name
    if bc == "Ground":
        return "terraendaek" if t == "Floor" else ("ydervaeg" if t == "Wall" else "tag")
    if bc != "Outdoors":
        return None
    return {"Wall": "ydervaeg", "RoofCeiling": "tag", "Floor": "gulv_ude"}.get(t)


def _u(face_or_ap, kat, u_over):
    if kat in u_over:
        return u_over[kat]
    return face_or_ap.properties.energy.construction.u_factor


def _fundamentslaengde(room):
    """Længde af gulvkanter mod jord, der ligger langs en udvendig væg i samme rum."""
    laengde = 0.0
    vaegge = [f for f in room.faces if f.type.name == "Wall" and f.boundary_condition.name in ("Outdoors", "Ground")]
    for f in room.faces:
        if f.type.name != "Floor" or f.boundary_condition.name != "Ground":
            continue
        for seg in f.geometry.boundary_segments:
            mid = seg.midpoint
            for v in vaegge:
                if v.geometry.plane.distance_to_point(mid) < TOL and v.geometry.is_point_on_face(mid, TOL):
                    laengde += seg.length
                    break
    return laengde


def beregn(model, psi=None, u=None, gulvvarme=True, ti=20.0, te=-12.0, ti_bad=24.0, friskluft_l_s_m2=0.30):
    psi_v = dict(STANDARD_PSI)
    psi_v.update(_tolk(psi))
    u_over = _tolk(u)
    b_jord = ((30.0 if gulvvarme else ti) - 10.0) / (ti - te)

    areal = {"vindue": 0.0, "ydervaeg": 0.0, "tag": 0.0, "terraendaek": 0.0, "gulv_ude": 0.0}
    ua = dict((k, 0.0) for k in areal)
    laengde = {"vindue": 0.0, "fundament": 0.0, "ovenlys": 0.0}
    rum_ud = []
    A_et = 0.0

    for room in model.rooms:
        A_rum = room.floor_area
        A_et += A_rum
        h_rum = 0.0
        for f in room.faces:
            kat = _kategori(f)
            if kat is None:
                continue
            b = b_jord if kat == "terraendaek" else 1.0
            a_glas = sum(ap.area for ap in f.apertures) + sum(d.area for d in f.doors)
            a_opak = f.area - a_glas
            areal[kat] += a_opak
            ua[kat] += _u(f, kat, u_over) * a_opak * b
            h_rum += _u(f, kat, u_over) * a_opak * b
            for sub in list(f.apertures) + list(f.doors):
                uv = u_over.get("vindue", sub.properties.energy.construction.u_factor)
                areal["vindue"] += sub.area
                ua["vindue"] += uv * sub.area
                h_rum += uv * sub.area
                n = "ovenlys" if kat == "tag" else "vindue"
                laengde[n] += sub.geometry.perimeter
                h_rum += psi_v[n] * sub.geometry.perimeter
        l_fund = _fundamentslaengde(room)
        laengde["fundament"] += l_fund
        h_rum += psi_v["fundament"] * l_fund * b_jord
        t_inde = ti_bad if "bad" in (room.display_name or "").lower() else ti
        phi_t = h_rum * (t_inde - te)
        phi_v = 1.21 * friskluft_l_s_m2 * A_rum * (t_inde - te)
        rum_ud.append({"rum": room.display_name, "areal_m2": round(A_rum, 1), "H_T_W_K": round(h_rum, 1),
                       "transmission_W": round(phi_t), "ventilation_W": round(phi_v),
                       "i_alt_W": round(phi_t + phi_v), "W_m2": round((phi_t + phi_v) / A_rum, 1) if A_rum else None})

    # --- Projekt -------------------------------------------------------------
    projekt = {
        "Vinduer og glaspartier": ua["vindue"],
        "Ydervægge": ua["ydervaeg"],
        "Tag": ua["tag"],
        "Terrændæk (× %.3f)" % b_jord: ua["terraendaek"],
        "Gulv mod det fri": ua["gulv_ude"],
        "Fundament (× %.3f)" % b_jord: psi_v["fundament"] * laengde["fundament"] * b_jord,
        "Vinduessamlinger": psi_v["vindue"] * laengde["vindue"],
        "Ovenlyssamlinger": psi_v["ovenlys"] * laengde["ovenlys"],
    }

    # --- Referenceramme: tabel 4, glas maks. 30 % --------------------------
    a_glas_ref = min(areal["vindue"], 0.30 * A_et)
    overskud = areal["vindue"] - a_glas_ref
    skala = a_glas_ref / areal["vindue"] if areal["vindue"] else 1.0
    ramme = {
        "Vinduer og glaspartier": TABEL4["vindue"] * a_glas_ref,
        "Ydervægge": TABEL4["ydervaeg"] * (areal["ydervaeg"] + overskud),
        "Tag": TABEL4["tag"] * areal["tag"],
        "Terrændæk (× %.3f)" % b_jord: TABEL4["terraendaek"] * areal["terraendaek"] * b_jord,
        "Gulv mod det fri": TABEL4["gulv_ude"] * areal["gulv_ude"],
        "Fundament (× %.3f)" % b_jord: TABEL4["psi_fundament"] * laengde["fundament"] * b_jord,
        "Vinduessamlinger": TABEL4["psi_vindue"] * laengde["vindue"] * skala,
        "Ovenlyssamlinger": TABEL4["psi_ovenlys"] * laengde["ovenlys"] * skala,
    }

    sum_p, sum_r = sum(projekt.values()), sum(ramme.values())
    glasandel = areal["vindue"] / A_et if A_et else 0.0
    return {
        "opvarmet_etageareal_m2": round(A_et, 1),
        "glasareal_m2": round(areal["vindue"], 1),
        "glasandel": round(glasandel, 3),
        "glasandel_over_30": glasandel > 0.30,
        "arealer_m2": dict((k, round(v, 1)) for k, v in areal.items()),
        "laengder_m": dict((k, round(v, 1)) for k, v in laengde.items()),
        "psi_W_mK": psi_v,
        "jordfaktor": round(b_jord, 3),
        "projekt_W_K": dict((k, round(v, 1)) for k, v in projekt.items()),
        "ramme_W_K": dict((k, round(v, 1)) for k, v in ramme.items()),
        "projekt_sum_W_K": round(sum_p, 1),
        "ramme_sum_W_K": round(sum_r, 1),
        "overholdt": sum_p <= sum_r,
        "dim_varmetab_pr_rum": rum_ud,
        "dim_varmetab_i_alt_W": sum(r["i_alt_W"] for r in rum_ud),
    }


def tabeltekst(d):
    linjer = ["Opvarmet etageareal: %.1f m2   Glas: %.1f m2 (%.0f %%)" % (
        d["opvarmet_etageareal_m2"], d["glasareal_m2"], 100 * d["glasandel"]), ""]
    linjer.append("%-28s %10s %10s" % ("Bygningsdel", "Projekt", "Ramme"))
    for k in d["projekt_W_K"]:
        linjer.append("%-28s %10.1f %10.1f" % (k, d["projekt_W_K"][k], d["ramme_W_K"][k]))
    linjer.append("%-28s %10.1f %10.1f  W/K" % ("SAMLET", d["projekt_sum_W_K"], d["ramme_sum_W_K"]))
    linjer.append("")
    linjer.append("OVERHOLDT" if d["overholdt"] else "IKKE OVERHOLDT - projekt over rammen")
    linjer.append("")
    linjer.append("Dimensionerende varmetab: %d W i alt" % d["dim_varmetab_i_alt_W"])
    for r in d["dim_varmetab_pr_rum"]:
        linjer.append("  %-22s %6d W  (%s W/m2)" % (r["rum"], r["i_alt_W"], r["W_m2"]))
    return "\n".join(linjer)


# --- Grasshopper ------------------------------------------------------------
try:
    _model  # noqa: F821  (findes kun i Grasshopper)
    if _beregn and _model:  # noqa: F821
        gv = True if _gulvvarme_ is None else bool(_gulvvarme_)  # noqa: F821
        data = beregn(_model, _psi_, _u_, gv)  # noqa: F821
        tabel = tabeltekst(data)
        projekt_W_K, ramme_W_K = data["projekt_sum_W_K"], data["ramme_sum_W_K"]
        glasandel, ok = data["glasandel"], data["overholdt"]
except NameError:
    pass
