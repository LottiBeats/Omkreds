"""
beskaer.py - efterbehandling af skærmbilleder fra Grasshopper til notatet.

    trim(sti, ud)            skærer den tomme baggrund væk rundt om indholdet
    del_op(sti, mappe, n)    deler et billede med flere plots under hinanden (fx LB Hourly Plot
                             med ét plot pr. rum) op i ét billede pr. plot

Baggrunden er farven i øverste venstre hjørne (hvid i Arctic, grå i Shaded); en farvet
baggrund gøres hvid.
Kræver Pillow og numpy (kommer med matplotlib).
"""
from pathlib import Path

import numpy as np
from PIL import Image

TOLERANCE = 12      # hvor meget en pixel må afvige fra baggrunden og stadig tælle som tom


def _indhold(a):
    """Maske: True hvor pixlen ikke er baggrund."""
    bg = a[0, 0].astype(int)
    return (np.abs(a.astype(int) - bg) > TOLERANCE).any(axis=2)


def _laes(sti):
    """Billedet som array. En farvet baggrund (fx grå i Shaded) gøres hvid, så billedet
    står rent på siden."""
    a = np.array(Image.open(sti).convert("RGB"))
    bg = a[0, 0].astype(int)
    if (bg < 245).any():
        a[(np.abs(a.astype(int) - bg) <= TOLERANCE).all(axis=2)] = 255
    return a


def _ramme(maske, margen):
    rk = np.where(maske.any(axis=1))[0]
    kk = np.where(maske.any(axis=0))[0]
    if not len(rk) or not len(kk):
        return None
    h, w = maske.shape
    return (max(0, kk[0] - margen), max(0, rk[0] - margen),
            min(w, kk[-1] + 1 + margen), min(h, rk[-1] + 1 + margen))


def trim(sti, ud=None, margen=12):
    """Skær tom baggrund væk. Returnerer stien til det beskårne billede."""
    a = _laes(sti)
    r = _ramme(_indhold(a), margen)
    ud = Path(ud or sti)
    if r is None:
        return Path(sti)
    Image.fromarray(a[r[1]:r[3], r[0]:r[2]]).save(ud)
    return ud


def huller(maske):
    """Vandrette tomme bånd mellem indhold: liste af (start, slut) rækker."""
    tom = ~maske.any(axis=1)
    rk = np.where(~tom)[0]
    if not len(rk):
        return []
    ud, start = [], None
    for y in range(rk[0], rk[-1] + 1):
        if tom[y] and start is None:
            start = y
        elif not tom[y] and start is not None:
            ud.append((start, y))
            start = None
    return ud


def snit(maske, n=None, min_andel=0.012):
    """Rækker, hvor billedet skal deles. Med n: de n-1 største huller. Uden n: alle huller
    på mindst min_andel af højden, hvor begge dele bliver mindst 10 % af højden."""
    h = maske.shape[0]
    g = sorted(huller(maske), key=lambda x: x[1] - x[0], reverse=True)
    if n:
        valgt = g[:max(0, n - 1)]
    else:
        valgt = [x for x in g if x[1] - x[0] >= min_andel * h]
    ud = sorted((a + b) // 2 for a, b in valgt)
    if not n:     # drop snit, der giver for små dele
        rent, sidst = [], 0
        for y in ud:
            if y - sidst >= 0.1 * h:
                rent.append(y)
                sidst = y
        ud = rent
    return ud


def del_op(sti, mappe, n=None, margen=12):
    """Del et billede i plots under hinanden. Returnerer stierne (beskårne), øverst først."""
    a = _laes(sti)
    maske = _indhold(a)
    graenser = [0] + snit(maske, n) + [a.shape[0]]
    mappe = Path(mappe)
    mappe.mkdir(parents=True, exist_ok=True)
    ud = []
    for i in range(len(graenser) - 1):
        stykke = a[graenser[i]:graenser[i + 1]]
        r = _ramme(_indhold(stykke), margen)
        if r is None:
            continue
        f = mappe / ("%s_%d.png" % (Path(sti).stem, len(ud) + 1))
        Image.fromarray(stykke[r[1]:r[3], r[0]:r[2]]).save(f)
        ud.append(f)
    return ud
