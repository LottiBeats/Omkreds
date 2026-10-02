"""
figurer.py — figurer til indeklimanotatet, tegnet direkte fra modellens data.

Stil: tynde mærker, diskret gitter, ingen top-/højrekant, Manrope som i notatet.
Farver: én hovedfarve (Holst-navy) til data, Holst-grøn som anden serie, grå til
kontekst og kravlinjer. Paletten er valideret (lyshed, kroma, farveblindhed, kontrast).
"""
import calendar
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                     # noqa: E402
from matplotlib import font_manager                 # noqa: E402

HER = Path(__file__).resolve().parent
for f in (HER / "fonts").glob("Manrope-*.ttf"):
    font_manager.fontManager.addfont(str(f))

SERIE1 = "#3b4aa0"     # Holst-navy, lysnet til datafarve
SERIE2 = "#2f9e8c"     # Holst-grøn, mørknet til datafarve
KONTEKST = "#c9c9c9"   # rum, der ikke er i fokus
KRAV = "#333333"       # kravlinjer
TEKST = "#1a1a1a"
DAEMPET = "#6b6b6b"
MAANEDER = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]

plt.rcParams.update({
    "font.family": "Manrope", "font.size": 8, "axes.titlesize": 8.5, "axes.titleweight": "bold",
    "axes.titlelocation": "left", "axes.labelsize": 8, "axes.labelcolor": DAEMPET,
    "axes.edgecolor": "#9a9a9a", "axes.linewidth": 0.6, "axes.spines.top": False,
    "axes.spines.right": False, "xtick.color": DAEMPET, "ytick.color": DAEMPET,
    "xtick.labelsize": 7.5, "ytick.labelsize": 7.5, "axes.grid": True, "grid.color": "#e6e6e6",
    "grid.linewidth": 0.6, "axes.axisbelow": True, "legend.fontsize": 7.5, "legend.frameon": False,
    "figure.dpi": 100, "savefig.dpi": 220, "text.color": TEKST,
})

CM = 1 / 2.54
BREDDE = 16.6 * CM       # notatets tekstbredde


def _gem(fig, sti):
    fig.savefig(sti, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return sti


def _tal(x):
    return ("%d" % round(x)).replace(",", ".")


def varmetab(vt, sti):
    """Varmetab pr. bygningsdel: projekt mod referenceramme (vandrette søjler)."""
    dele = [k for k in vt["projekt_W_K"] if (vt["projekt_W_K"][k] or vt["ramme_W_K"].get(k))]
    proj = [vt["projekt_W_K"][k] for k in dele]
    ramme = [vt["ramme_W_K"].get(k, 0) for k in dele]
    fig, ax = plt.subplots(figsize=(BREDDE, 0.62 * CM * len(dele) + 1.6 * CM))
    y = range(len(dele))
    h = 0.36
    ax.barh([i - h / 2 - 0.02 for i in y], proj, height=h, color=SERIE1, label="Projekt")
    ax.barh([i + h / 2 + 0.02 for i in y], ramme, height=h, color=SERIE2, label="Referenceramme")
    ax.set_yticks(list(y))
    ax.set_yticklabels([d.replace("0.", "0,") for d in dele])
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Varmetab [W/K]")
    ax.legend(loc="lower right")
    ax.tick_params(axis="y", length=0)
    return _gem(fig, sti)


def timer_pr_rum(ot, sti):
    """Timer over 27 og 28 °C pr. rum med kravet som stiplet linje (to paneler, samme rumorden)."""
    rum = [r["rum"] for r in ot["rum"]]
    graenser = ot["graenser"]
    fig, akser = plt.subplots(1, len(graenser), figsize=(BREDDE, 0.6 * CM * len(rum) + 2.0 * CM), sharey=True)
    if len(graenser) == 1:
        akser = [akser]
    for ax, g in zip(akser, graenser):
        noegle = "over_%g" % g["C"]
        vaerdier = [r["timer"].get(noegle, 0) for r in ot["rum"]]
        ax.barh(range(len(rum)), vaerdier, height=0.55, color=SERIE1)
        ax.axvline(g["maks_timer"], color=KRAV, linewidth=0.9, linestyle=(0, (4, 3)),
                   label="Krav %d timer" % g["maks_timer"])
        ax.legend(loc="lower right")
        ax.set_title("Timer over %s °C" % ("%g" % g["C"]).replace(".", ","))
        ax.set_xlim(0, max(max(vaerdier) * 1.1, g["maks_timer"] * 1.6))
        ax.grid(axis="y", visible=False)
        ax.tick_params(axis="y", length=0)
    akser[0].set_yticks(range(len(rum)))
    akser[0].set_yticklabels(rum)
    akser[0].invert_yaxis()
    fig.tight_layout(w_pad=2.5)
    return _gem(fig, sti)


def maaneder(serie, rumnavn, graense, sti):
    """Hvornår på året: timer over grænsen pr. måned for det varmeste rum."""
    if len(serie) != 8760:
        return None
    timer, start = [], 0
    for m in range(1, 13):
        n = calendar.monthrange(2017, m)[1] * 24
        timer.append(sum(1 for v in serie[start:start + n] if v > graense))
        start += n
    fig, ax = plt.subplots(figsize=(BREDDE, 5.2 * CM))
    ax.bar(MAANEDER, timer, width=0.6, color=SERIE1)
    ax.set_title("%s: timer over %s °C pr. måned" % (rumnavn, ("%g" % graense).replace(".", ",")))
    ax.grid(axis="x", visible=False)
    ax.tick_params(axis="x", length=0)
    return _gem(fig, sti)


def varighedskurve(serier, fokus, sti, timer=600):
    """De varmeste timer i året, sorteret. Fokusrummet fremhæves, de øvrige er grå."""
    fig, ax = plt.subplots(figsize=(BREDDE, 6 * CM))
    for navn, serie in serier.items():
        if navn == fokus:
            continue
        ax.plot(sorted(serie, reverse=True)[:timer], color=KONTEKST, linewidth=1.2)
    s = sorted(serier[fokus], reverse=True)[:timer]
    ax.plot(s, color=SERIE1, linewidth=2)
    for g, txt in ((27, "27 °C"), (28, "28 °C")):
        ax.axhline(g, color=KRAV, linewidth=0.8, linestyle=(0, (4, 3)))
        ax.text(timer, g, " " + txt, fontsize=7, color=KRAV, va="center")
    ax.set_xlim(0, timer)
    ax.set_xlabel("Antal timer pr. år (sorteret efter temperatur)")
    ax.set_ylabel("Operativ temperatur [°C]")
    if len(serier) > 1:
        ax.plot([], [], color=KONTEKST, linewidth=1.2, label="Øvrige rum")
        ax.plot([], [], color=SERIE1, linewidth=2, label=fokus)
        ax.legend(loc="upper right")
    return _gem(fig, sti)


def varmeste_uge(serie, ude, rumnavn, sti):
    """Den varmeste uge time for time: rummet og udetemperaturen på samme akse."""
    if len(serie) != 8760:
        return None
    top = max(range(len(serie)), key=lambda i: serie[i])
    a = max(0, min(8760 - 168, top - 84))
    x = [i / 24.0 for i in range(168)]
    fig, ax = plt.subplots(figsize=(BREDDE, 6 * CM))
    ax.plot(x, serie[a:a + 168], color=SERIE1, linewidth=1.8, label=rumnavn)
    if ude and len(ude) == 8760:
        ax.plot(x, ude[a:a + 168], color=SERIE2, linewidth=1.4, label="Ude")
    for g in (27, 28):
        ax.axhline(g, color=KRAV, linewidth=0.8, linestyle=(0, (4, 3)))
        ax.text(7.02, g, " %d °C" % g, fontsize=7, color=KRAV, va="bottom" if g == 28 else "top")
    ax.set_xlim(0, 7)
    dag0 = a // 24
    maaned = 0
    while dag0 >= calendar.monthrange(2017, maaned + 1)[1]:
        dag0 -= calendar.monthrange(2017, maaned + 1)[1]
        maaned += 1
    ax.set_xticks(range(8))
    labels = []
    for d in range(8):
        dd, mm = dag0 + d, maaned
        while dd >= calendar.monthrange(2017, mm + 1)[1]:
            dd -= calendar.monthrange(2017, mm + 1)[1]
            mm = (mm + 1) % 12
        labels.append("%d. %s" % (dd + 1, MAANEDER[mm].lower()))
    ax.set_xticklabels(labels)
    ax.set_ylabel("Temperatur [°C]")
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2)
    return _gem(fig, sti)


def scenarier(sc, sti, graense=27):
    """Timer over grænsen i det varmeste rum for hvert scenarie, med kravet som linje."""
    navne, vaerdier, maks = [], [], 100
    for s in sc:
        ot = s.get("overtemperatur") or {}
        if not ot.get("rum"):
            continue
        noegle = "over_%g" % graense
        navne.append(s["scenarie"])
        vaerdier.append(max(r["timer"].get(noegle, 0) for r in ot["rum"]))
        for g in ot.get("graenser", []):
            if g["C"] == graense:
                maks = g["maks_timer"]
    if not navne:
        return None
    fig, ax = plt.subplots(figsize=(BREDDE, 0.65 * CM * len(navne) + 1.8 * CM))
    ax.barh(range(len(navne)), vaerdier, height=0.55, color=SERIE1)
    ax.axvline(maks, color=KRAV, linewidth=0.9, linestyle=(0, (4, 3)), label="Krav %d timer" % maks)
    ax.legend(loc="lower right", bbox_to_anchor=(1, 1.0))
    ax.set_yticks(range(len(navne)))
    ax.set_yticklabels(navne)
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    ax.tick_params(axis="y", length=0)
    ax.set_xlabel("Timer over %d °C i det varmeste rum" % graense)
    ax.set_xlim(0, max(max(vaerdier) * 1.1, maks * 1.6))
    return _gem(fig, sti)


def energibehov_maaned(pr_maaned, sti):
    """Energibehov med energifaktorer pr. måned (kWh/m²) fra energirammeregnearket."""
    vaerdier = [pr_maaned.get(m.lower()) or 0 for m in MAANEDER]
    fig, ax = plt.subplots(figsize=(BREDDE, 5.2 * CM))
    ax.bar(MAANEDER, vaerdier, width=0.6, color=SERIE1)
    ax.set_title("Energibehov pr. måned, kWh/m²")
    ax.grid(axis="x", visible=False)
    ax.tick_params(axis="x", length=0)
    return _gem(fig, sti)


def energiramme_soejler(behov, rammer, sti):
    """Samlet energibehov mod energirammerne (vandrette søjler, kravlinjer stiplede)."""
    navne = list(rammer)
    fig, ax = plt.subplots(figsize=(BREDDE, 0.75 * CM * (len(navne) + 1) + 1.4 * CM))
    ax.barh(["Projektet"], [behov], height=0.45, color=SERIE1)
    for i, n in enumerate(navne):
        ax.barh([n], [rammer[n]], height=0.45, color=KONTEKST)
    ax.axvline(behov, color=KRAV, linewidth=0.9, linestyle="--")
    ax.invert_yaxis()
    ax.set_xlabel("kWh/m² år")
    ax.grid(axis="y", visible=False)
    ax.tick_params(axis="y", length=0)
    return _gem(fig, sti)
