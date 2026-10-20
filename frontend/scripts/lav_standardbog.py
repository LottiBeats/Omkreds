"""
lav_standardbog.py — standardbogen: regnearksbogen, et nyt byggeri starter med.

    python3 scripts/lav_standardbog.py src/templates/bog/standard.js

Arkene:
  Forudsætninger   K_FI, sne (C_e·C_t·s_k) og q_p fra v_b, terrænkategori og højde
  Materialer       densiteter og fladelaster, slået op ved navn
  Opbygninger      én blok pr. ID: lag (g_k,inf / g_k,sup), hældning, nyttelast-
                   kategori, sne og vind → 13 lasttyper pr. m² vandret projektion
  Lastoversigt     nyttelastkategorierne (DK NA) og ψ pr. lasttype
  Lodret lastnedføring
                   elementerne oppefra og ned: spær/dæk/bjælker (R_A, R_B), vægge
                   og fundamenter (N, M, plastisk fordeling) og søjler (N). Hver
                   lasttype føres for sig; kombinationerne står i hver resultatrække.
  Vandret lastnedføring
                   vinden fordelt på de stabiliserende vægge efter stivhed

Eksemplet er et sommerhus på 12 × 8 m med sadeltag og hems. Store bygninger
bruger de samme blokke: kopiér en blok, ret ID og laster.
"""
import json
import sys

UD = sys.argv[1]


def kol(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


class Ark:
    def __init__(self, navn, titel, bredder, overskrift=True):
        self.navn, self.titel, self.bredder, self.overskrift = navn, titel, bredder, overskrift
        self.celler, self.fed, self.dec, self.fmt = [], {}, {}, {}
        self.nul, self.skjulte = None, []           # "–" for 0 og skjulte hjælpekolonner

    @property
    def n(self):
        return len(self.celler) + 1

    def r(self, *v, fed=False, dec=None, fedkol=None):
        self.celler.append(["" if x is None else str(x) for x in v])
        n = len(self.celler)
        for i in range(len(v)):
            if fed or (fedkol and kol(i) in fedkol):
                if str(v[i]) != "":
                    self.fed[f"{kol(i)}{n}"] = True
        for k, d in (dec or {}).items():
            self.dec[f"{k}{n}"] = d
        return n

    def sektion(self, tekst):
        self.tom_hvis_noedvendigt()
        return self.r(tekst, fed=True)

    def hoved(self, *v):
        n = self.r(*v, fed=True)
        self.form(n, range(len(v)), b=1)
        return n

    def form(self, n, kolonner, fyld=None, kursiv=False, graa=False, **ramme):
        """Formatering af rækken n i kolonnerne (indeks): fyld, kursiv, grå skrift og rammer (t/b/l/r = 1 tynd, 2 tyk)."""
        for i in kolonner:
            f = self.fmt.setdefault(f"{kol(i)}{n}", {})
            if fyld:
                f["fyld"] = fyld
            if kursiv:
                f["kursiv"] = True
            if graa:
                f["graa"] = True
            if ramme:
                f.setdefault("ramme", {}).update(ramme)

    def note(self, tekst):
        n = self.r(tekst)
        self.fmt[f"A{n}"] = {"kursiv": True}
        return n

    def tom(self):
        self.celler.append([])
        return len(self.celler)

    def tom_hvis_noedvendigt(self):
        if self.celler and any(self.celler[-1]):
            self.tom()

    def data(self):
        return {"navn": self.navn, "titel": self.titel, "overskrift": self.overskrift, "celler": self.celler,
                "bredder": self.bredder, "dec": self.dec, "fed": self.fed, "fmt": self.fmt,
                **({"nul": self.nul} if self.nul else {}), **({"skjulte": self.skjulte} if self.skjulte else {})}


ark = []
NAVNE = {}


def navn(n, a, celle, enhed=""):
    NAVNE[n] = {"ark": a.navn, "celle": celle, "enhed": enhed}


LODRET = "Lodret lastnedføring"
VANDRET = "Vandret lastnedføring"

# ── Forudsætninger ───────────────────────────────────────────────────────────
fo = Ark("Forudsætninger", "Forudsætninger — sag, sikkerhed, sne og vind", [330, 90, 70, 340])
fo.hoved("Størrelse", "Værdi", "Enhed", "Kilde / note")
fo.note("Blå tal er input. Ret dem her — resten af bogen følger med.")
fo.sektion("Sagen")
fo.r("Sag", "Nyt byggeri", "", "")
fo.r("Sagsnummer", "", "", "")
fo.r("Afsnit", "A2.1 Lastnedføring", "", "")
fo.r("Beregnet / kontrolleret", "", "", "initialer og dato")
fo.sektion("Sikkerhed (DS/EN 1990 DK NA)")
F = {}
F["cc"] = fo.r("Konsekvensklasse", "CC2", "", "CC1, CC2 eller CC3")
F["kfi"] = fo.r("K_FI", f'=HVIS(B{fo.n - 1}="CC1";0,9;HVIS(B{fo.n - 1}="CC3";1,1;1,0))', "", "ganges på de ugunstige laster")
navn("KFI", fo, f"B{F['kfi']}")
fo.sektion("Sne (DS/EN 1991-1-3 DK NA)")
F["sk"] = fo.r("Terrænværdi s_k", "1,0", "kN/m²", "")
F["ce"] = fo.r("Eksponeringskoefficient C_e", "1,0", "", "normal eksponering")
F["ct"] = fo.r("Termisk koefficient C_t", "1,0", "", "")
F["s0"] = fo.r("C_e·C_t·s_k", f"=B{F['ce']}*B{F['ct']}*B{F['sk']}", "kN/m²",
              "ganges med μ₁ for hvert tag i Opbygninger (μ₁ efter taghældningen, tabel 5.2)", fed=True, dec={"B": 2})
navn("s_0", fo, f"B{F['s0']}", "kN/m²")
fo.sektion("Vind (DS/EN 1991-1-4 DK NA)")
F["vb0"] = fo.r("Basisvindhastighed v_b,0", "24", "m/s", "DK NA (Vestjylland: se kort)")
F["cdir"] = fo.r("Retningsfaktor c_dir", "1,0", "", "")
F["cs"] = fo.r("Årstidsfaktor c_season", "1,0", "", "")
F["vb"] = fo.r("v_b = c_dir·c_season·v_b,0", f"=B{F['cdir']}*B{F['cs']}*B{F['vb0']}", "m/s", "", dec={"B": 1})
F["tk"] = fo.r("Terrænkategori", "II", "", "0, I, II, III eller IV — se tabellen nederst")
F["z"] = fo.r("Referencehøjde z_e", f"=h_byg", "m", f"bygningens højde fra {VANDRET}", dec={"B": 2})
F["co"] = fo.r("Orografifaktor c_o", "1,0", "", "1,0 på fladt terræn")
TK = "Forudsætninger!$A$TK0:$C$TK1"   # erstattes, når tabellen er lagt ud
F["z0"] = fo.r("Ruhedslængde z_0", f"=LOPSLAG(B{F['tk']};{TK};2;FALSK)", "m", "", dec={"B": 3})
F["zmin"] = fo.r("z_min", f"=LOPSLAG(B{F['tk']};{TK};3;FALSK)", "m", "")
zz = f"MAKS(B{F['z']};B{F['zmin']})"
F["kr"] = fo.r("Terrænfaktor k_r = 0,19·(z_0/0,05)^0,07", f"=0,19*(B{F['z0']}/0,05)^0,07", "", "", dec={"B": 3})
F["cr"] = fo.r("Ruhedsfaktor c_r = k_r·ln(z/z_0)", f"=B{F['kr']}*LN({zz}/B{F['z0']})", "", "z ≥ z_min", dec={"B": 3})
F["vm"] = fo.r("Middelvindhastighed v_m = c_r·c_o·v_b", f"=B{F['cr']}*B{F['co']}*B{F['vb']}", "m/s", "", dec={"B": 2})
F["iv"] = fo.r("Turbulensintensitet I_v = 1/(c_o·ln(z/z_0))", f"=1/(B{F['co']}*LN({zz}/B{F['z0']}))", "", "", dec={"B": 3})
F["qp"] = fo.r("Peakhastighedstryk q_p = (1 + 7·I_v)·½·ρ·v_m²",
               f"=(1+7*B{F['iv']})*0,5*1,25*B{F['vm']}^2/1000", "kN/m²", "ρ = 1,25 kg/m³", fed=True, dec={"B": 3})
navn("q_p", fo, f"B{F['qp']}", "kN/m²")
fo.sektion("Terrænkategorier (DS/EN 1991-1-4 tabel 4.1)")
fo.hoved("Kategori", "z_0 [m]", "z_min [m]", "")
tk0 = fo.r("0", "0,003", "1", "hav, kystnært")
fo.r("I", "0,01", "1", "søer, flade områder uden forhindringer")
fo.r("II", "0,05", "2", "lav bevoksning, spredte forhindringer")
fo.r("III", "0,3", "5", "landsbyer, forstæder, skov")
tk1 = fo.r("IV", "1,0", "10", "byer, mindst 15 % bebygget, høje bygninger")
for rr in fo.celler:
    for i, c in enumerate(rr):
        rr[i] = c.replace("TK0", str(tk0)).replace("TK1", str(tk1))
ark.append(fo)

# ── Materialer ───────────────────────────────────────────────────────────────
ma = Ark("Materialer", "Materialer — densiteter og fladelaster", [320, 90, 70, 300])
ma.hoved("Materiale", "Værdi", "Enhed", "Note")
ma.note("Opbygninger slår op her ved navn. kN/m³ ganges med lagets tykkelse; kN/m² bruges, som den er.")
MAT = [
    ("Beton og mur", [
        ("Beton", "24", "kN/m³", "uarmeret; armeret 25"),
        ("Beton, armeret", "25", "kN/m³", ""),
        ("Letbeton", "6", "kN/m³", "fx gasbeton/Lecablokke"),
        ("Porebeton", "5,75", "kN/m³", ""),
        ("Tegl, massiv mur", "18", "kN/m³", ""),
        ("Kalksandsten", "20", "kN/m³", ""),
        ("Murpuds, 10 mm", "0,20", "kN/m²", ""),
        ("Huldæk 220", "3,10", "kN/m²", "inkl. fuger"),
        ("Huldæk 270", "3,70", "kN/m²", "inkl. fuger"),
        ("Huldæk 320", "4,10", "kN/m²", "inkl. fuger"),
        ("Afretningslag", "22", "kN/m³", ""),
        ("Sand/grus", "18", "kN/m³", ""),
    ]),
    ("Træ og plader", [
        ("Konstruktionstræ C24", "4,2", "kN/m³", "ved 12 % fugt; 5–6 inkl. beslag"),
        ("Limtræ GL30", "4,6", "kN/m³", ""),
        ("Krydsfiner", "5", "kN/m³", ""),
        ("OSB", "6,5", "kN/m³", ""),
        ("Spånplade", "5,5", "kN/m³", ""),
        ("Gips", "9", "kN/m³", "alm. gipsplade"),
        ("Fibergips", "12", "kN/m³", ""),
        ("Træbeklædning", "3,9", "kN/m³", ""),
        ("Lamelparket", "5", "kN/m³", ""),
        ("Spredt forskalling", "0,05", "kN/m²", ""),
        ("Strøer og lydopklodsning", "0,10", "kN/m²", ""),
    ]),
    ("Isolering og folier", [
        ("Mineraluld, blød", "0,5", "kN/m³", ""),
        ("Isolering, hård (trykfast)", "1,35", "kN/m³", ""),
        ("Papiruld", "0,6", "kN/m³", ""),
        ("Dampspærre/folie", "0,01", "kN/m²", ""),
    ]),
    ("Tag", [
        ("Tegltagsten", "0,60", "kN/m²", "inkl. lægter 0,05"),
        ("Betontagsten", "0,40", "kN/m²", ""),
        ("Naturskifer", "0,36", "kN/m²", ""),
        ("Cementbølgeplader", "0,17", "kN/m²", ""),
        ("Tagpap, 2 lag", "0,08", "kN/m²", ""),
        ("Tagstål", "0,10", "kN/m²", ""),
        ("Lægter", "0,05", "kN/m²", ""),
        ("Fast undertag", "0,15", "kN/m²", ""),
        ("Stråtag, 200 mm", "0,50", "kN/m²", ""),
    ]),
    ("Øvrigt", [
        ("Stål", "78,5", "kN/m³", ""),
        ("Glas", "26", "kN/m³", ""),
        ("Installationer", "0,20", "kN/m²", ""),
        ("Nedhængt loft", "0,15", "kN/m²", ""),
    ]),
]
m0 = None
for sek, rows in MAT:
    ma.sektion(sek)
    for row in rows:
        n = ma.r(*row)
        m0 = m0 or n
for _ in range(4):   # plads til egne materialer
    ma.r("", "", "", "")
m1 = ma.n - 1
MATOMR = f"Materialer!$A$2:$C${m1 + 10}"
ark.append(ma)

BLAA, GROEN, GUL = "#ddebf7", "#e2efda", "#fff2cc"   # ID-rækker / dimensionerende resultater / inddata (regnearkFormat.js)

# ── Lasttyperne ─────────────────────────────────────────────────────────────
# De 13 kolonner, lasterne føres ned i. Hver lasttype holdes for sig hele vejen
# ned; kombinationerne regnes først i resultatrækkerne (kolonne V–Z).
TYPER = ["g_k,inf", "g_k,sup", "q_k,A", "q_k,B", "q_k,C", "q_k,D", "q_k,E", "q_k,F", "q_k,G", "q_k,H", "s_k", "w_k,ned", "w_k,op"]
BOGST = "ABCDEFGH"

# ── Lastoversigt: nyttelaster og ψ ──────────────────────────────────────────
lo = Ark("Lastoversigt", "Lastoversigt — nyttelaster og ψ pr. lasttype", [300, 76, 76, 56, 56, 56, 76, 300])
lo.hoved("Kategori", "q_k [kN/m²]", "Q_k [kN]", "ψ0", "ψ1", "ψ2", "Lasttype", "Note")
lo.note("Opbygninger vælger kategorien ved navn. Lasten føres ned i kolonnen for kategoriens bogstav (q_k,A … q_k,H), "
        "så ψ og den dominerende last vælges rigtigt, når et element får last fra flere kategorier.")
lo.sektion("Nyttelaster (DS/EN 1991-1-1 DK NA)")
NYTTE = [
    ("A1 Bolig og interne adgangsveje", "1,5", "2,0", "0,5", "0,3", "0,2"),
    ("A2 Tagrum", "0,5", "0,5", "0,5", "0,3", "0,2"),
    ("A3 Loftsrum", "1,0", "0,5", "0,5", "0,3", "0,2"),
    ("A4 Adgangsveje, boliger", "3,0", "2,0", "0,5", "0,3", "0,2"),
    ("A5 Balkoner og altaner", "2,5", "2,0", "0,5", "0,3", "0,2"),
    ("B Kontor", "2,5", "2,5", "0,6", "0,4", "0,2"),
    ("C1 Samlingsrum", "2,5", "3,0", "0,6", "0,6", "0,5"),
    ("C2 Samlingsrum", "4,0", "3,0", "0,6", "0,6", "0,5"),
    ("C3 Samlingsrum", "5,0", "4,0", "0,6", "0,6", "0,5"),
    ("C4 Samlingsrum", "5,0", "4,0", "0,6", "0,6", "0,5"),
    ("C5 Samlingsrum", "5,0", "4,0", "0,6", "0,6", "0,5"),
    ("D1 Butiksarealer", "4,0", "4,0", "0,6", "0,6", "0,5"),
    ("D2 Butiksarealer", "5,0", "7,0", "0,6", "0,6", "0,5"),
    ("B Lokale adgangsveje", "3,0", "3,0", "0,6", "0,4", "0,2"),
    ("C1 Lokale adgangsveje", "3,0", "3,0", "0,6", "0,6", "0,5"),
    ("B Fælles adgangsveje", "5,0", "4,0", "0,6", "0,4", "0,2"),
    ("C1 Fælles adgangsveje", "5,0", "4,0", "0,6", "0,6", "0,5"),
    ("C2-C5 Adgangsveje", "5,0", "4,0", "0,6", "0,6", "0,5"),
    ("C2-D Adgangsveje", "5,0", "4,0", "0,6", "0,6", "0,5"),
    ("E Erhverv og lagerarealer", "7,5", "7,0", "0,8", "0,8", "0,7"),
    ("F Trafikareal, bruttovægt ≤ 35 kN", "3,0", "20,0", "0,6", "0,6", "0,6"),
    ("G Trafikareal, 35 kN < bruttovægt ≤ 160 kN", "5,0", "90,0", "0,6", "0,4", "0,2"),
    ("H Nyttelast på tage", "0,0", "1,5", "0,0", "0,0", "0,0"),
    ("Ingen nyttelast", "0", "0", "0", "0", "0"),
    ("A4 Depotrum/affaldsrum", "3,0", "2,0", "0,5", "0,3", "0,2"),
    ("A4 Teknikrum", "3,0", "2,0", "0,5", "0,3", "0,2"),
    ("Elevatorlåg", "0", "10", "0,5", "0,3", "0,2"),
]
D_NYT = {"B": 1, "C": 1, "D": 1, "E": 1, "F": 1}
ny0 = lo.n
for navn_, q, Q, p0, p1, p2 in NYTTE:
    b = "" if navn_.startswith("Ingen") else "A" if navn_.startswith("Elevator") else navn_[0]
    lo.r(navn_, q, Q, p0, p1, p2, b, "som kategori A" if navn_.startswith("Elevator") else "", dec=D_NYT)
for _ in range(4):
    lo.r("", "", "", "", "", "", "", "")
NYT = f"Lastoversigt!$A${ny0}:$G${lo.n - 1}"
lo.sektion("ψ pr. lasttype i lastnedføringen (DS/EN 1990 DK NA, tabel A1.1)")
lo.hoved("Lasttype", "", "", "ψ0", "ψ1", "ψ2", "Kolonne", "Note")
PSI = {}
PSI_V = {"A": ("0,5", "0,3", "0,2", "boliger"), "B": ("0,6", "0,4", "0,2", "kontorer"),
         "C": ("0,6", "0,6", "0,5", "samlingsrum"), "D": ("0,6", "0,6", "0,5", "butikker"),
         "E": ("0,8", "0,8", "0,7", "lager og erhverv"), "F": ("0,6", "0,6", "0,6", "trafik ≤ 35 kN"),
         "G": ("0,6", "0,4", "0,2", "trafik ≤ 160 kN"), "H": ("0", "0", "0", "tage")}
for i, t in enumerate(TYPER):
    if i < 2:
        PSI[i] = lo.r(t, "", "", "", "", "", t, "permanent")
    elif i < 10:
        b = BOGST[i - 2]
        p0, p1, p2, note = PSI_V[b]
        PSI[i] = lo.r(f"Nyttelast, kategori {b}", "", "", p0, p1, p2, t, note, dec=D_NYT)
    elif i == 10:
        PSI[i] = lo.r("Sne", "", "", "0,3", "0,2", "0", t, "", dec=D_NYT)
    else:
        PSI[i] = lo.r("Vind, " + ("nedad" if i == 11 else "opad (sug, negativ)"), "", "", "0,3", "0,2", "0", t, "", dec=D_NYT)

# ── Opbygninger ──────────────────────────────────────────────────────────────
# Én blok pr. opbygning: ID og navn, lagene, Σ, hældning, nyttelast, sne og vind.
# ID-rækken samler de 13 lasttyper i kolonne I–U (pr. m² vandret projektion),
# og det er dem, Lodret lastnedføring slår op ved ID. Ny opbygning: kopiér en blok.
op = Ark("Opbygninger", "Opbygninger — egenlast lag for lag og laster pr. m²",
         [64, 270, 92, 40, 78, 78, 66, 66] + [66] * 13)
op.nul = "–"
op.hoved("ID", "Opbygning / lag", "t [mm] / valg", "Fri", "Egen g_k,inf", "Egen g_k,sup",
         "g_k,inf", "g_k,sup", *TYPER)
op.note("Gule felter er inddata. Lag: materiale (som i Materialer) og tykkelse, eller en egen værdi i kN/m². "
        "x i Fri = laget kan fjernes og tæller ikke i g_k,inf.")
op.note("ID-rækken (kolonne I–U) er det, Lodret lastnedføring henter: pr. m² vandret projektion. "
        "Vind på taget: netto c_pe nedad og opad, w = c·q_p (opad negativ).")
D_OP = {"C": 1, "E": 2, "F": 2, "G": 2, "H": 2, **{kol(8 + i): 2 for i in range(13)}}
OPB = {}


def opbygning(id_, navn_, lagliste, alfa="0", kategori="Ingen nyttelast", tag="Nej", c_ned="0", c_op="0", note=""):
    h = op.n
    nl = len(lagliste) + 1                     # + en ledig række til et ekstra lag
    sig, al, ny, sn, vi = h + nl + 1, h + nl + 2, h + nl + 3, h + nl + 4, h + nl + 5
    hoved = [id_, navn_, "", "", "", "", "", "",
             f"=G{al}", f"=H{al}",
             *[f'=HVIS(G{ny}="{b}";H{ny};0)' for b in BOGST],
             f"=H{sn}", f"=G{vi}", f"=H{vi}"]
    op.r(*hoved, dec=D_OP, fedkol="AB")
    for lagr in list(lagliste) + [("",)]:
        navn_l, t, fri, ei, es = (list(lagr) + ["", "", "", ""])[:5]
        n = op.n
        mat = (f'HVIS.FEJL(HVIS(LOPSLAG(B{n};{MATOMR};3;FALSK)="kN/m³";LOPSLAG(B{n};{MATOMR};2;FALSK)*C{n}/1000;'
               f'LOPSLAG(B{n};{MATOMR};2;FALSK));0)')
        op.r("", navn_l, t, fri, ei, es,
             f'=HVIS(B{n}="";"";HVIS(D{n}="x";0;HVIS(E{n}<>"";E{n};{mat})))',
             f'=HVIS(B{n}="";"";HVIS(F{n}<>"";F{n};{mat}))', dec=D_OP)
    op.r("", "Σ pr. m² flade", "", "", "", "", f"=SUM(G{h + 1}:G{sig - 1})", f"=SUM(H{h + 1}:H{sig - 1})",
         dec=D_OP, fedkol="BGH")
    op.r("", "Hældning α [°] → pr. m² vandret", alfa, "", "", "",
         f"=G{sig}/COS(RADIANER(C{al}))", f"=H{sig}/COS(RADIANER(C{al}))", dec=D_OP, fedkol="GH")
    op.r("", "Nyttelast: kategori → bogstav, q_k", kategori, "", "", "",
         f'=HVIS(C{ny}="";"";HVIS.FEJL(LOPSLAG(C{ny};{NYT};7;FALSK);"?"))',
         f'=HVIS(E{ny}<>"";E{ny};HVIS.FEJL(LOPSLAG(C{ny};{NYT};2;FALSK);0))', dec=D_OP)
    op.r("", "Sne: tag? (Ja/Nej) → μ₁, s", tag, "", "", "",
         f'=HVIS(C{sn}<>"Ja";"";HVIS(C{al}<=30;0,8;HVIS(C{al}<60;0,8*(60-C{al})/30;0)))',
         f'=HVIS(E{sn}<>"";E{sn};HVIS(C{sn}="Ja";G{sn}*s_0;0))', dec={**D_OP, "G": 2})
    op.r("", "Vind: c_pe ned / op → w", c_ned, c_op, "", "",
         f"=C{vi}*q_p", f"=D{vi}*q_p", dec={**D_OP, "C": 2, "D": 2})
    slut = vi
    for n in range(h + 1, sig):
        op.form(n, range(1, 6), fyld=GUL)                     # lagene: inddata
    op.form(al, [2], fyld=GUL)
    op.form(ny, [2, 4], fyld=GUL)
    op.form(sn, [2, 4], fyld=GUL)
    op.form(vi, [2, 3], fyld=GUL)
    op.form(ny, [6], graa=True)
    op.form(sn, [6], graa=True)
    op.form(h, range(21), fyld=BLAA, t=2)                     # ID-rækken: tyk streg over, blå
    op.form(sig, [6, 7], t=1)                                 # Σ
    for n in range(h, slut + 1):
        op.form(n, [6], l=1)                                  # g_k-kolonnerne
        op.form(n, [8], l=1)                                  # de 13 lasttyper
    op.form(slut, range(21), b=1)
    if note:
        op.note(note)
    op.tom()
    OPB[id_] = h


tr = lambda b, h, cc: f"=4,2*{b}*{h}/{cc}"          # konstruktionstræ pr. m²
opbygning("TAG1", "Tag — tagpap på krydsfiner, træspær 45×220 c/c 600", [
    ("Tagpap, 2 lag",),
    ("Krydsfiner", "18"),
    ("Konstruktionstræ C24", "", "", tr("0,045", "0,22", "0,6"), tr("0,045", "0,22", "0,6")),
    ("Mineraluld, blød", "250"),
    ("Dampspærre/folie",),
    ("Spredt forskalling",),
    ("Gips", "13", "x"),
], alfa="25", kategori="H Nyttelast på tage", tag="Ja", c_ned="0,3", c_op="-0,8",
    note="Spær 45×220 c/c 600: egen værdi = 4,2 kN/m³ · 0,045 · 0,22 / 0,6. Vind: c_pe for zone H/G inkl. c_pi — ret efter taget.")
opbygning("HEMS", "Hems — bjælkelag 45×195 c/c 600 med gulv og loft", [
    ("Træbeklædning", "22", "x"),
    ("Krydsfiner", "18"),
    ("Konstruktionstræ C24", "", "", tr("0,045", "0,195", "0,6"), tr("0,045", "0,195", "0,6")),
    ("Gips", "13", "x"),
], kategori="A1 Bolig og interne adgangsveje")
opbygning("YV1", "Ydervæg — let træskelet med træbeklædning (pr. m² væg)", [
    ("Træbeklædning", "22", "x"),
    ("Spredt forskalling", "", "x"),
    ("Fibergips", "15"),
    ("Konstruktionstræ C24", "", "", tr("0,045", "0,195", "0,6"), tr("0,045", "0,195", "0,6")),
    ("Mineraluld, blød", "195"),
    ("Dampspærre/folie",),
    ("Gips", "13", "x"),
])
opbygning("IV1", "Indervæg — bærende træskelet, gips på begge sider (pr. m² væg)", [
    ("Gips", "13", "x"),
    ("Konstruktionstræ C24", "", "", tr("0,045", "0,095", "0,6"), tr("0,045", "0,095", "0,6")),
    ("Mineraluld, blød", "95"),
    ("Gips", "13", "x"),
])
opbygning("SOK1", "Sokkel — letklinkerblokke 290 mm (pr. m² lodret snit)", [
    ("Letbeton", "290"),
])
opbygning("KIP1", "Kipbjælke — limtræ GL30h 115×405 (kN/m)", [
    ("Limtræ GL30", "", "", "=4,6*0,115*0,405", "=4,6*0,115*0,405"),
])
opbygning("OL1", "Overligger — limtræ GL30h 90×270 (kN/m)", [
    ("Limtræ GL30", "", "", "=4,6*0,09*0,27", "=4,6*0,09*0,27"),
])
opbygning("ST1", "Stolpe — limtræ GL30h 115×115 (kN/m)", [
    ("Limtræ GL30", "", "", "=4,6*0,115*0,115", "=4,6*0,115*0,115"),
])
opbygning("PF1", "Punktfundament — beton 0,6 × 0,6 × 0,9 m (kN pr. stk.)", [
    ("Beton", "", "", "=24*0,6*0,6*0,9", "=24*0,6*0,6*0,9"),
])
OPB_N = op.n + 60                      # plads til flere opbygninger
OPB_A = f"Opbygninger!$A$2:$A${OPB_N}"

# ── Lodret lastnedføring ─────────────────────────────────────────────────────
# Elementerne står oppefra og ned. Hvert element er en blok:
#   ID-række    ID · art · x_A/x₁ · x_B/x₂ · ovenover · L · beskrivelse
#   laster      kilde (opbygning eller element ovenfor) · del · x₁ · x₂ · faktor
#   resultater  R_A, R_B (spænd) eller N, M, x_start, x_slut, q (væg) eller N (søjle)
# En last slår kilden op ved navn: først i Opbygninger (× faktor), ellers i
# resultatrækkerne ovenfor (nøglen "ID/del", kolonne U). Kun rækker ovenfor
# bruges, så der aldrig opstår cykler, og en blok kan kopieres ned.
ln = Ark(LODRET, "Lodret lastnedføring — element for element, lasttype for lasttype",
         [84, 92, 78, 78, 76, 56, 56] + [64] * 13 + [70, 58, 58, 62, 62, 62] + [40] * 8)
ln.nul = "–"
ln.skjulte = list(range(26, 34))              # AA–AH: hjælpeformler (ID-række, x_A, x_B, art, opslag)
TK = [kol(7 + i) for i in range(13)]          # H … T
VAR = TK[2:12]                                # nyttelast A–H, sne, vind nedad
ln.hoved("ID", "Art", "x_A / x₁ [m]", "x_B / x₂ [m]", "Ovenover", "L [m]", "",
         *TYPER, "Nøgle", "6.10a", "6.10b", "Dim.", "Løft", "SLS kar.", "hoved", "art", "ID-række", "x_A", "x_B", "art", "opb.", "kilde")
PSI0 = ln.n
ln.r("ψ0", "", "", "", "", "", "", "", "",
     *[f"=Lastoversigt!$D${PSI[i]}" for i in range(2, 13)], dec={c: 1 for c in TK})
ln.form(PSI0, range(26), b=1)
ln.note("Gule felter er inddata. Kilde: et ID fra Opbygninger (× faktor, fx væghøjde) eller et element ovenfor "
        "med del A/B, N eller q. x₂ tom = punktlast. Ovenover: væggen eller søjlen, hvis N og M føres med ned.")
ln.note("Dim. = største af 6.10a = K_FI·1,2·G og 6.10b = G + K_FI·1,5·(dominerende + Σψ0·øvrige).  "
        "Løft = 0,9·G_inf + K_FI·1,5·W_op (negativ = løft).")
S = ln.n - 1                                  # globale områder starter her (en noterække)
D_LN = {**{c: 2 for c in TK}, "C": 2, "D": 2, "E": 2, "F": 2, "G": 2, "V": 1, "W": 1, "X": 1, "Y": 1, "Z": 1}
KEY = lambda n: f"$U${S}:$U{n}"
OVER = lambda c, n: f"{c}${S}:{c}{n}"


def komb(n):
    """Kombinationerne for resultatrækken n (kolonne V–Z)."""
    acc = "+".join(f"{c}$2*MAKS(0;{c}{n})" for c in VAR)
    lead = "MAKS(" + ";".join(f"(1-{c}$2)*MAKS(0;{c}{n})" for c in VAR) + ")"
    return [f"=KFI*1,2*I{n}", f"=I{n}+KFI*1,5*({acc}+{lead})", f"=MAKS(V{n};W{n})",
            f"=0,9*H{n}+KFI*1,5*MIN(0;T{n})", f"=I{n}+{acc}+{lead}"]


def lastraekke(kilde="", del_="", x1="", x2="", fak=""):
    n = ln.n
    lng = f"HVIS(D{n}>C{n};D{n}-C{n};1)"
    xc = f"HVIS(D{n}>C{n};(C{n}+D{n})/2;C{n})"
    typer = [f'=HVIS($A{n}="";"";HVIS($E{n}="";1;$E{n})*HVIS($AG{n}>0;INDEKS(Opbygninger!{kol(8 + i)}$2:{kol(8 + i)}${OPB_N};$AG{n});'
             f'HVIS($AH{n}>0;INDEKS({OVER(c, n - 1)};$AH{n});0)))'
             for i, c in enumerate(TK)]
    ln.r(kilde, del_, x1, x2, fak,
         f'=HVIS($A{n}="";"";HVIS(AF{n}=1;{lng}*(AE{n}-{xc})/(AE{n}-AD{n});{lng}))',
         f'=HVIS($A{n}="";"";HVIS(AF{n}=1;{lng}*({xc}-AD{n})/(AE{n}-AD{n});HVIS(AF{n}=2;{lng}*{xc};0)))',
         *typer,
         f'=HVIS($A{n}="";"";HVIS($AG{n}+HVIS.FEJL($AH{n};0)=0;"? ukendt kilde";""))',
         "", "", "", "", "", "", "",
         f"=SAMMENLIGN(9E+9;$AA${S}:AA{n - 1};1)",          # elementets ID-række (den sidste ovenfor)
         f"=INDEKS($C${S}:C{n - 1};AC{n})", f"=INDEKS($D${S}:D{n - 1};AC{n})", f"=INDEKS($AB${S}:AB{n - 1};AC{n})",
         f'=HVIS($A{n}="";0;HVIS.FEJL(SAMMENLIGN($A{n};{OPB_A};0);0))',
         # en kilde, der hverken er en opbygning eller et element ovenfor, giver #I/T hele vejen ned
         f'=HVIS(ELLER($A{n}="";$AG{n}>0);0;SAMMENLIGN($A{n}&"/"&$B{n};{KEY(n - 1)};0))', dec=D_LN)
    ln.form(n, range(5), fyld=GUL)                # kilde, del, x₁, x₂, faktor
    ln.form(n, [5, 6], graa=True)                 # andele / arm: mellemregninger
    return n


ELEMENT = {}


def element(id_, art, xa, xb, beskr, laster, ovenover=""):
    ln.tom_hvis_noedvendigt()
    h = ln.n
    ln.r(id_, art, xa, xb, ovenover, f'=HVIS(D{h}>C{h};D{h}-C{h};"")', "", beskr, *[""] * 12, f"=$A{h}",
         "", "", "", "", "",
         "1",
         f'=HVIS(ELLER(B{h}="Væg";B{h}="Fundament");2;HVIS(ELLER(B{h}="Søjle";B{h}="Punktfundament");3;1))',
         fed=True, dec={"C": 2, "D": 2, "F": 2})
    mode = 2 if art in ("Væg", "Fundament") else 3 if art in ("Søjle", "Punktfundament") else 1
    ln.r("Kilde", "Del", "x₁ [m]", "x₂ [m]", "Faktor", "→ A" if mode == 1 else "P", "→ B" if mode == 1 else "P·x",
         *TYPER, "Kontrol")
    ln.fmt[f"A{ln.n - 1}"] = {"kursiv": True}
    a = ln.n - 1                              # fra underoverskriften (tekst tæller som 0), så en
                                              # række indsat over den ledige række altid er med
    for last in laster:
        lastraekke(*last)
    b = lastraekke()                          # ledig række: indsæt nye laster over den
    res = {}

    def resultat(tekst, enhed, celler, noegle, kombi=True, hjaelp=None):
        n = ln.n
        rk = [tekst, enhed, "", "", "", "", "", *[celler(n, c) for c in TK], f'=$A{h}&"/{noegle}"', *(komb(n) if kombi else [""] * 5)]
        if hjaelp:
            rk += [""] * (34 - len(rk))
            for k, v in hjaelp(n).items():
                rk[k] = v
        ln.r(*rk, fedkol="A", dec=D_LN)
        ln.form(n, [1, 20], graa=True)
        res[noegle] = n
        return n

    sp = lambda kol_: (lambda n, c: f"=SUMPRODUKT(${kol_}{a}:${kol_}{b};{c}{a}:{c}{b})")
    find = lambda tekst: (lambda n: f'=HVIS.FEJL(SAMMENLIGN({tekst};{KEY(n - 1)};0);0)')
    ovenfra = lambda n, c, r: f"HVIS($AH{r}>0;INDEKS({OVER(c, n - 1)};$AH{r});0)"
    N_ = lambda n, c: f"=SUMPRODUKT($F{a}:$F{b};{c}{a}:{c}{b})+{ovenfra(n, c, n)}"
    AH, AG = 33, 32
    if mode == 1:
        enhed = "kN" if art == "Bjælke" else "kN/m"
        resultat("R_A", enhed, sp("F"), "A")
        resultat("R_B", enhed, sp("G"), "B")
    elif mode == 3:
        resultat("N", "kN", N_, "N", hjaelp=lambda n: {AH: find(f'$E{h}&"/N"')(n)})
    else:
        rN = resultat("N", "kN", N_, "N", hjaelp=lambda n: {AH: find(f'$E{h}&"/N"')(n)})
        xm = f"($C{h}+$D{h})/2"
        # M om væggens midte: egne laster + M ovenover + N ovenover flyttet fra dens midte til denne
        xm_o = lambda n: f"HVIS($AG{n}>0;(INDEKS($C${S}:$C{n - 1};$AG{n})+INDEKS($D${S}:$D{n - 1};$AG{n}))/2;0)"
        rM = resultat("M", "kNm", lambda n, c: (
            f"=SUMPRODUKT($G{a}:$G{b};{c}{a}:{c}{b})+{ovenfra(n, c, n)}+{ovenfra(n, c, rN)}*{xm_o(n)}-{xm}*{c}{rN}"),
            "M", kombi=False, hjaelp=lambda n: {AH: find(f'$E{h}&"/M"')(n), AG: find(f"$E{h}")(n)})
        xr = lambda c: f"({xm}+{c}{rM}/{c}{rN})"
        rs = resultat("x_start", "m", lambda n, c: (
            f'=HVIS({c}{rN}<=0;"";HVIS({xr(c)}<={xm};$C{h};MIN($D{h};$D{h}-2*($D{h}-{xr(c)}))))'), "xs", kombi=False)
        re = resultat("x_slut", "m", lambda n, c: (
            f'=HVIS({c}{rN}<=0;"";HVIS({xr(c)}<={xm};MAKS($C{h};$C{h}+2*({xr(c)}-$C{h}));$D{h}))'), "xe", kombi=False)
        resultat("q", "kN/m", lambda n, c: (
            f'=HVIS({c}{rN}=0;"";HVIS({c}{rN}<0;{c}{rN}/($D{h}-$C{h});HVIS.FEJL({c}{rN}/({c}{re}-{c}{rs});"e > L/2")))'), "q")
    # Rammer som i Excel-arkene: tyk streg og blå ID-række øverst, streg under
    # underoverskriften, lodrette streger før lasttyperne, nøglen og kombinationerne,
    # streg over resultaterne og grøn Dim.
    sidste = ln.n - 1
    ln.form(h, range(26), fyld=BLAA, t=2)
    ln.form(h + 1, range(21), b=1, kursiv=True)
    for n in range(h, sidste + 1):
        ln.form(n, [7, 20, 21], l=1)
    ln.form(min(res.values()), range(26), t=1)
    for d_, n in res.items():
        if d_ in ("A", "B", "N", "q"):
            ln.form(n, [23], fyld=GROEN)
            ln.fed[f"X{n}"] = True
    ln.form(sidste, range(26), b=1)
    ELEMENT[id_] = res
    return res


element("T1", "Spær", "0", "4,0", "Spær, sydside: rem (x = 0) → kipbjælke (x = 4,0), udhæng 0,5 m. Nordsiden er spejlet.", [
    ("TAG1", "", "-0,5", "4,0"),
])
element("D1", "Dæk", "0", "3,0", "Hems: ydervæg syd (x = 0) → indervæg V2 (x = 3,0)", [
    ("HEMS", "", "0", "3,0"),
])
element("B1", "Bjælke", "0", "6,0", "Kipbjælke, gavl (x = 0) → midterstolpe S1 (x = 6,0). Østre fag er spejlet.", [
    ("T1", "B", "0", "6,0"),
    ("T1", "B", "0", "6,0"),
    ("KIP1", "", "0", "6,0"),
])
element("B2", "Bjælke", "4,0", "7,0", "Overligger over terrassedør i ydervæg syd", [
    ("T1", "A", "4,0", "7,0"),
    ("YV1", "", "4,0", "7,0", "0,4"),
    ("OL1", "", "4,0", "7,0"),
])
element("S1", "Søjle", "6,0", "", "Midterstolpe under kipbjælken, x = 6,0", [
    ("B1", "B", "6,0"),
    ("B1", "B", "6,0"),
    ("ST1", "", "6,0", "", "4,4"),
])
element("V1", "Væg", "0", "12,0", "Ydervæg syd, x = 0–12 (terrassedør 4,0–7,0 bæres af B2)", [
    ("T1", "A", "0", "4,0"),
    ("T1", "A", "7,0", "12,0"),
    ("B2", "A", "4,0"),
    ("B2", "B", "7,0"),
    ("YV1", "", "0", "4,0", "2,6"),
    ("YV1", "", "7,0", "12,0", "2,6"),
    ("D1", "A", "0", "4,0"),
])
element("V2", "Væg", "0", "4,0", "Indervæg under hemsen, x = 0–4,0", [
    ("D1", "B", "0", "4,0"),
    ("IV1", "", "0", "4,0", "2,4"),
])
element("F1", "Fundament", "0", "12,0", "Stribefundament under V1", [
    ("SOK1", "", "0", "12,0", "0,8"),
], ovenover="V1")
element("F2", "Fundament", "0", "4,0", "Fundament under V2", [
    ("SOK1", "", "0", "4,0", "0,8"),
], ovenover="V2")
element("F3", "Punktfundament", "6,0", "", "Punktfundament under midterstolpen S1", [
    ("PF1", "", "6,0"),
], ovenover="S1")
ln.tom()
SLUT = ln.n - 1                               # en tom række efter sidste element: et nyt element sættes
                                              # ind her, inden for områderne i oversigten

ln.sektion("Oversigt — dimensionerende laster (skriv nøglen ID/del; del = A, B, N eller q)")
ov_h = ln.r("Nøgle", "Enhed", "", "", "", "", "", *TYPER, "", "6.10a", "6.10b", "Dim.", "0,9G + 1,5W op", "Kar. (SLS)", fed=True)
ln.form(ov_h, range(26), fyld=BLAA, t=2, b=1)
OVERSIGT = [("T1/A", "kN/m"), ("T1/B", "kN/m"), ("D1/A", "kN/m"), ("D1/B", "kN/m"), ("B1/A", "kN"), ("B1/B", "kN"),
            ("B2/A", "kN"), ("B2/B", "kN"), ("S1/N", "kN"), ("V1/q", "kN/m"), ("V2/q", "kN/m"),
            ("F1/q", "kN/m"), ("F2/q", "kN/m"), ("F3/N", "kN"), ("", ""), ("", "")]
OV = {}
for k, e in OVERSIGT:
    n = ln.n
    sh = lambda c: f'=HVIS($AH{n}=0;"";INDEKS({c}${S}:{c}${SLUT};$AH{n}))'
    ln.r(k, e, "", "", "", "", "", *[sh(c) for c in TK], "", *[sh(c) for c in "VWXYZ"], *[""] * 7,
         f'=HVIS($A{n}="";0;HVIS.FEJL(SAMMENLIGN($A{n};$U${S}:$U${SLUT};0);0))', dec=D_LN, fedkol="X")
    ln.form(n, [7, 20, 21], l=1)
    ln.form(n, [23], fyld=GROEN)
    OV[k] = n
ark_ln = ln

for nm, k, c, e in [("T1_RA_d", "T1/A", "X", "kN/m"), ("T1_RB_d", "T1/B", "X", "kN/m"),
                    ("B1_RB_d", "B1/B", "X", "kN"), ("B2_RA_d", "B2/A", "X", "kN"),
                    ("S1_N_d", "S1/N", "X", "kN"), ("V1_q_d", "V1/q", "X", "kN/m"),
                    ("V1_q_ginf", "V1/q", "H", "kN/m"), ("F1_q_d", "F1/q", "X", "kN/m"),
                    ("F3_N_d", "F3/N", "X", "kN"), ("T1_RA_loeft", "T1/A", "Y", "kN/m")]:
    navn(nm, ln, f"{c}{OV[k]}", e)

ark.extend([op, lo, ln])

# ── Vandret lastnedføring ────────────────────────────────────────────────────
va = Ark(VANDRET, "Vandret lastnedføring — vind på bygningen, fordelt på de stabiliserende vægge",
         [300, 128, 116, 96, 92, 84, 84, 92, 104, 140, 104])
va.hoved("Størrelse", "Værdi", "", "Enhed", "Note")
va.note("Vinden samles i etageskiverne og føres ned til de stabiliserende vægge i stueetagen. "
        "Begge retninger regnes: vind på langfacaden (y) og vind på gavlen (x).")
V = {}
va.sektion("Bygningen")
V["L"] = va.r("Længde L (langfacade, langs x)", "12,0", "", "m", "")
V["B"] = va.r("Bredde B (gavl, langs y)", "8,0", "", "m", "")
V["ht"] = va.r("Tagets vindhøjde over øverste skive", "0,9", "", "m", "fx tagfod–kip / 2 for sadeltag")
va.sektion("Etager — skiverne nedefra (ledige etager: højde 0)")
va.hoved("Skive", "Etagehøjde under [m]", "Kote z [m]", "Opland [m]", "F_y [kN]", "F_x [kN]", "F_y·z [kNm]", "F_x·z [kNm]")
E0 = va.n
SKIVER = [("Tagskive", "2,6"), ("(ledig)", "0"), ("(ledig)", "0"), ("(ledig)", "0")]
E1 = E0 + len(SKIVER) - 1
for i, (sk, h) in enumerate(SKIVER):
    n = E0 + i
    z = f"=B{n}" if i == 0 else f"=C{n - 1}+B{n}"
    if i < len(SKIVER) - 1:
        opl = f"=B{n}/2+HVIS(B{n + 1}>0;B{n + 1}/2;HVIS(B{n}>0;$B${V['ht']};0))"
    else:
        opl = f"=B{n}/2+HVIS(B{n}>0;$B${V['ht']};0)"
    va.r(sk, h, z, opl, f"=$B$WY*$B${V['L']}*D{n}", f"=$C$WY*$B${V['B']}*D{n}", f"=E{n}*C{n}", f"=F{n}*C{n}",
         dec={"C": 2, "D": 2, "E": 1, "F": 1, "G": 0, "H": 0})
V["sum"] = va.r("Σ ved terræn", "", "", "", f"=SUM(E{E0}:E{E1})", f"=SUM(F{E0}:F{E1})", f"=SUM(G{E0}:G{E1})", f"=SUM(H{E0}:H{E1})",
                fed=True, dec={"E": 1, "F": 1, "G": 0, "H": 0})
V["h"] = va.r("Bygningens højde h = øverste kote + tagets vindhøjde", f"=MAKS(C{E0}:C{E1})+B{V['ht']}", "", "m", "", dec={"B": 2})
navn("h_byg", va, f"B{V['h']}", "m")

va.sektion("Vindtryk på facaderne (DS/EN 1991-1-4, 7.2.2)")
va.hoved("Størrelse", "Vind på langfacade (y)", "Vind på gavl (x)", "Enhed", "Note")
V["qp"] = va.r("q_p(z_e)", "=q_p", "=q_p", "kN/m²", "Forudsætninger", dec={"B": 3, "C": 3})
V["b"] = va.r("Facadebredde b (vinkelret på vinden)", f"=B{V['L']}", f"=B{V['B']}", "m", "")
V["d"] = va.r("Dybde d (langs vinden)", f"=B{V['B']}", f"=B{V['L']}", "m", "")
V["hd"] = va.r("h/d", f"=$B${V['h']}/B{va.n - 1}", f"=$B${V['h']}/C{va.n - 1}", "", "", dec={"B": 2, "C": 2})


def cD(k):
    x = f"{k}{V['hd']}"
    return f"=HVIS({x}<=0,25;0,7;HVIS({x}<=1;0,7+({x}-0,25)/0,75*0,1;0,8))"


def cE(k):
    x = f"{k}{V['hd']}"
    return f"=HVIS({x}<=0,25;-0,3;HVIS({x}<=1;-0,3-({x}-0,25)/0,75*0,2;HVIS({x}<=5;-0,5-({x}-1)/4*0,2;-0,7)))"


def rho(k):
    x = f"{k}{V['hd']}"
    return f"=HVIS({x}<=1;0,85;HVIS({x}>=5;1;0,85+({x}-1)/4*0,15))"


V["cD"] = va.r("c_pe,10 zone D (luv)", cD("B"), cD("C"), "", "tabel 7.1, interpoleret", dec={"B": 2, "C": 2})
V["cE"] = va.r("c_pe,10 zone E (læ)", cE("B"), cE("C"), "", "tabel 7.1, interpoleret", dec={"B": 2, "C": 2})
V["rho"] = va.r("Korrelationsfaktor (luv og læ samtidig)", rho("B"), rho("C"), "", "7.2.2(3): 0,85 ved h/d ≤ 1", dec={"B": 2, "C": 2})
V["w"] = va.r("Nettotryk w = ρ·(c_D − c_E)·q_p", f"=B{V['rho']}*(B{V['cD']}-B{V['cE']})*B{V['qp']}",
              f"=C{V['rho']}*(C{V['cD']}-C{V['cE']})*C{V['qp']}", "kN/m²", "", fed=True, dec={"B": 3, "C": 3})
V["V"] = va.r("Samlet vandret last ved terræn V", f"=E{V['sum']}", f"=F{V['sum']}", "kN", "Σ over skiverne", fed=True, dec={"B": 1, "C": 1})
V["M"] = va.r("Væltende moment ved terræn M", f"=G{V['sum']}", f"=H{V['sum']}", "kNm", "", dec={"B": 0, "C": 0})
V["hr"] = va.r("Resultantens højde M/V", f"=HVIS(B{V['V']}>0;B{V['M']}/B{V['V']};0)", f"=HVIS(C{V['V']}>0;C{V['M']}/C{V['V']};0)", "m", "",
               dec={"B": 2, "C": 2})
for rr in va.celler:
    for i, c in enumerate(rr):
        rr[i] = c.replace("$B$WY", f"$B${V['w']}").replace("$C$WY", f"$C${V['w']}")
navn("V_y", va, f"B{V['V']}", "kN")
navn("V_x", va, f"C{V['V']}", "kN")


def vaegge(ret, titel, kolV, laengde, vaegliste):
    """Fordeling efter stivhed I = t·L³/12 med tillæg for vridning. Returnerer rækken med første væg."""
    va.sektion(titel)
    va.note("Stiv etageskive: F_i = V·(I_i/ΣI + e·I_i·|x_i − x_s|/Σ I·(x − x_s)²), e = |x_V − x_s| + 0,05·L. "
            "Vridningsbidraget lægges til alle vægge (på den sikre side).")
    va.note("Væltning: M_d = 1,5·K_FI·F_i·h_res mod M_stab = N·L²/2, hvor N er den stabiliserende lodrette last pr. m "
            "(0,9·G_inf — fx fra Lodret lastnedføring). Forankring R_d = (M_d − M_stab)/L i væggens ende.")
    va.hoved("Væg", "Position [m]", "Længde L [m]", "Tykkelse t [m]", "I [m⁴]", "Andel", "F_i [kN]", "M_d [kNm]",
             "N stab. [kN/m]", "Forankring R_d [kN]", "M_d/M_stab")
    w0 = va.n
    rows = vaegliste + [("", "", "", "", "")]
    w1 = w0 + len(rows) - 1
    # hjælperækker efter tabellen: ΣI, x_s, e, ΣI(x−x_s)²
    sI, xs, e, sI2 = w1 + 1, w1 + 2, w1 + 3, w1 + 4
    for i, (vn, pos, L, t, N) in enumerate(rows):
        n = w0 + i
        tom = f'$A{n}=""'
        va.r(vn, pos, L, t,
             f'=HVIS({tom};"";D{n}*C{n}^3/12)',
             f'=HVIS({tom};"";E{n}/$B${sI}+$B${e}*E{n}*ABS(B{n}-$B${xs})/HVIS($B${sI2}>0;$B${sI2};1))',
             f'=HVIS({tom};"";F{n}*{kolV}{V["V"]})',
             f'=HVIS({tom};"";1,5*KFI*G{n}*{kolV}{V["hr"]})',
             N,
             f'=HVIS({tom};"";MAKS(0;(H{n}-I{n}*C{n}^2/2)/C{n}))',
             f'=HVIS({tom};"";H{n}/(I{n}*C{n}^2/2))',
             dec={"E": 3, "F": 3, "G": 1, "H": 0, "I": 1, "J": 1, "K": 2}, fedkol="JK")
    va.r("Σ I", f"=SUM(E{w0}:E{w1})", "", "m⁴", "", dec={"B": 3})
    va.r("Stivhedscentrum x_s = Σ I·x / ΣI", f"=SUMPRODUKT(E{w0}:E{w1};B{w0}:B{w1})/B{sI}", "", "m", "", dec={"B": 2})
    va.r("Excentricitet e = |L/2 − x_s| + 0,05·L", f"=ABS({laengde}/2-B{xs})+0,05*{laengde}", "", "m",
         "lasten angriber midt på facaden + utilsigtet 5 %", dec={"B": 2})
    va.r("Σ I·(x − x_s)²", f"=SUMPRODUKT(E{w0}:E{w1};B{w0}:B{w1};B{w0}:B{w1})-B{sI}*B{xs}^2", "", "m⁶", "", dec={"B": 2})
    va.r("Σ andele (kontrol ≥ 1)", f"=SUM(F{w0}:F{w1})", "", "", "", dec={"B": 2})
    return w0


Lr = f"$B${V['L']}"
Br = f"$B${V['B']}"
def N_stab(noegle):
    """0,9·G_inf pr. m for væggen fra Lodret lastnedføring (nøglen ID/q)."""
    return f"=0,9*SUMHVIS('{LODRET}'!$U${S}:$U${SLUT};\"{noegle}\";'{LODRET}'!$H${S}:$H${SLUT})"


wy = vaegge("y", "Stabiliserende vægge — vind på langfacaden (vægge langs y, position x)", "$B$", Lr, [
    ("Gavl vest", "0", "8,0", "0,10", "1,5"),
    ("Skillevæg", "4,0", "3,0", "0,10", "1,0"),
    ("Gavl øst (vinduer fratrukket)", "12,0", "5,0", "0,10", "1,5"),
])
wx = vaegge("x", "Stabiliserende vægge — vind på gavlen (vægge langs x, position y)", "$C$", Br, [
    ("Facade nord", "0", "6,0", "0,10", "1,5"),
    ("Indervæg V2", "5,0", "4,0", "0,10", N_stab("V2/q")),
    ("Facade syd V1 (dør fratrukket)", "8,0", "4,0", "0,10", N_stab("V1/q")),
])
ark.append(va)
navn("stab_y_R_gavl", va, f"J{wy}", "kN")
navn("stab_x_R_V2", va, f"J{wx + 1}", "kN")

OMR = {"lodret_oversigt": f"A{ov_h}:Z{max(OV.values()) - 2}", "vandret_y": f"A{wy - 1}:K{wy + 9}", "vandret_x": f"A{wx - 1}:K{wx + 8}"}
# ── Skabeloner til nye elementer (knappen "+ Element", lib/lastnedfoering.js) ──
# Hver art som en blok med en tom lastrække, lagt i række PROTO; formlerne
# flyttes ned til den række, blokken sættes ind i.
PROTO = 1001
PROTOTYPER = {}
for art_ in ["Spær", "Dæk", "Bjælke", "Væg", "Fundament", "Søjle", "Punktfundament"]:
    gem = ln
    ln = Ark(LODRET, "", [])
    ln.celler = [[] for _ in range(PROTO - 1)]
    element("NY", art_, "", "", "", [])
    rk = lambda key: int("".join(ch for ch in key if ch.isdigit()))
    PROTOTYPER[art_] = {"fra": PROTO, "celler": ln.celler[PROTO - 1:],
                        **{m: {k: v for k, v in getattr(ln, m).items() if rk(k) >= PROTO} for m in ("fed", "dec", "fmt")}}
    ln = gem
ELEMENT.pop("NY", None)

ud = {"titel": "Standard — lodret og vandret lastnedføring", "ark": [a.data() for a in ark], "navne": NAVNE, "omraader": OMR,
      "lastnedfoering": {"S": S, "slut": SLUT, "opbygninger": {"navn": "Opbygninger", "fra": 2, "til": OPB_N},
                         "prototyper": PROTOTYPER}}
if UD.endswith(".js"):
    open(UD, "w", encoding="utf-8").write(
        "/** Genereret af scripts/lav_standardbog.py — standardbogen til nye byggerier. Se lib/bogSkabeloner.js. */\n"
        "export default " + json.dumps(ud, ensure_ascii=False) + "\n")
else:
    json.dump(ud, open(UD, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ark:", [(a.navn, len(a.celler)) for a in ark])
