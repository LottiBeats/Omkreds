# Energi – energi-, varmetabs-, indeklima- og dagslysnotater

Genbrugelig opsætning til myndighedsnotater for enfamiliehuse og sommerhuse:
én parametrisk model, ét resultatdatasæt, én regelfil og en rapport i
Omkreds' rapportstil. Første projekt er Hjerlesvej.

```
energi/
├── README.md                      denne fil
├── research/
│   ├── 01_br18_regler_agent.md        research om BR18-krav (fra søgeresultater, se OBS øverst)
│   ├── 02_workflow_vaerktoejer_agent.md  research om Ladybug Tools, Be18, BSim, rapportgenerering
│   └── 03_br18_verificeret.md          kontrolleret mod bygningsreglementet.dk 2026-10-01
├── regler/
│   └── br18_energi.yaml           alle grænseværdier, versioneret efter gyldighedsdato
├── rapport/
│   ├── byg_notat.py               notat.md + projekt.yaml -> PDF (rådgivernotat-layout)
│   └── fonts/                     Titillium Web (SIL OFL)
└── projekter/
    └── hjerlesvej/
        ├── projekt.yaml           sagsoplysninger, revisioner, underskrifter
        ├── notat.md               notatets indhold
        ├── input/                 tegninger og referencenotat (ikke i git)
        └── ud/                    genereret PDF
```

## Lav PDF'en

```bash
pip install -r backend/requirements.txt pyyaml
python energi/rapport/byg_notat.py energi/projekter/hjerlesvej
```

## Nyt projekt

1. Kopiér `projekter/hjerlesvej` til `projekter/<sag>`.
2. Ret `projekt.yaml` (sag, titler, fase, revisioner, firmanavn og sidefod) og `notat.md`.
   `##` er en hovedoverskrift (nummereres og skrives med versaler), `###` en underoverskrift.
3. Kør `byg_notat.py` på mappen.

## Pipeline (plan)

```
Rhino/Grasshopper -> building.json + HBJSON -> beregninger -> results.json -> notat -> ingeniør-QA
                                                 ^
                                           regler/br18_energi.yaml
```

- **Grasshopper** bruges kun til geometri og kontrol. Rum, konstruktionstyper og vinduer tagges via lag.
- **Beregninger** kører uden Rhino: DS 418-varmetab (eget modul), EnergyPlus via
  honeybee-energy (overtemperatur), Radiance via lbt-recipes (dagslys, EN 17037, blænding).
- **results.json** er ét skema-valideret datasæt. Alle tal i notatet kommer herfra.
- **AI** skriver kun den beskrivende tekst ud fra results.json. Regeltjek er almindelig Python.
- **Ingeniøren** kontrollerer og underskriver altid.

## Regler, kort

Kontrolleret mod BR18 2026-10-01 – se `research/03_br18_verificeret.md`.

- Sommerhuse og tilbygninger hertil: tabel 4 + 30 %-reglen, ellers varmetabsramme (§ 283-284).
  De generelle tilbygnings- og ombygningsregler (§ 258-279) gælder ikke (§ 283, stk. 2).
- Ombygning af sommerhus: tabel 4, hvis rentabelt (faktor 1,33, helårsbrug) (§ 285).
- LCA: tilbygninger < 250 m² til sommer- og enfamiliehuse er undtaget (§ 297, stk. 3).
- Termisk indeklima (§ 386) og dagslys (§ 379) gælder også sommerhuse.
- Energiramme for boliger eftervises stadig efter SBi-anvisning 213 (Be18).

## Åbne punkter

- Opgøres 30 %-reglen på tilbygningens areal eller hele husets? (står i BR-vejledningen)
- Bekræft grænserne 100 h > 27 °C / 25 h > 28 °C i vejledningen om termisk indeklima.
- Spørg BUILD/kommunen, om EnergyPlus accepteres til § 386-dokumentation; lav intern validering mod BSim/Be18.
