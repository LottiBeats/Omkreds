# -*- coding: utf-8 -*-
"""
energiramme.py - samler det hele: Honeybee-model -> udfyldt regneark -> genberegning ->
eksportmappe/energiramme.json (+ regnearket), som byg_energirammenotat.py læser.

    from energiramme import koer
    koer(model, indstillinger, "eksportmappe")
"""
from __future__ import unicode_literals

import json
import os

import be_model
import be_regneark as be


def koer(model, indstillinger, eksport, skabelon_mappe=None, nord=0.0, navn="Energiramme.xlsx"):
    skabelon = be.hent_skabelon(skabelon_mappe or os.path.join(eksport, "_skabelon"))
    data = be_model.fra_model(model, indstillinger, nord)
    if not os.path.isdir(eksport):
        os.makedirs(eksport)
    fil = os.path.join(eksport, navn)
    be.udfyld(skabelon, fil, data)
    metode = be.genberegn(fil)
    res = be.resultat(fil)
    ud = {"input": data, "resultat": res, "regneark": navn, "genberegnet_med": metode,
          "regneark_version": "Be05 ver. 02.02.2026, SBST/BUILD"}
    with open(os.path.join(eksport, "energiramme.json"), "w") as f:
        json.dump(ud, f, indent=1)
    return ud
