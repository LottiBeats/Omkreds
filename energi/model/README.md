# Fra Rhino-tegning til Honeybee-model

Du tegner geometrien på faste lag i Rhino. Grasshopper eksporterer den til
`geometri.json`, og `byg_hbmodel.py` laver den færdige Honeybee-model
(`model.hbjson`) med rum, vinduer, skygger, konstruktioner, interne laster og
udluftning. Alt, der ikke er geometri, står i projektets `model.yaml`.

```
Rhino (lag)  ->  gh_eksport_geometri.py  ->  geometri.json  ->  byg_hbmodel.py  ->  model.hbjson
                 (Grasshopper)                                   (+ model.yaml)
```

## Tegnekonvention

| Lag | Hvad du tegner | Bemærk |
|---|---|---|
| `RUM::bolig` | Ét **lukket volumen** pr. rum | Objektnavn (Properties → Name) = rumnavn, fx "Soverum 1. sal". Rum skal røre hinanden, ikke overlappe |
| `GLAS::3lag_g050` | Vinduer som **flader i væg- eller tagfladen** | Lagnavnet efter `::` skal findes under `glas:` i `model.yaml` |
| `SKYGGE::traeer` | Træer som flader eller mesh | Lag der starter med `trae` får transmittans fra `model.yaml` |
| `SKYGGE::naboer`, `SKYGGE::udhaeng` | Naboer, udhæng, terrasseoverdækning | Helt tætte |
| `AFSKAERMNING::lameller` | Solafskærmning | Holdes adskilt, så den kan slås til og fra i scenarier |

Tips:
- Tegn rum til **indersiden af klimaskærmen**, med lofter og gulve, hvor de faktisk er.
- Et dobbelthøjt rum er **ét** volumen.
- Skrå tage (A-huset) regnes som tag, fordi `tag_vinkel: 70` i `model.yaml`.
- Lag, der ikke starter med RUM, GLAS, SKYGGE eller AFSKAERMNING, ignoreres. Arkitektens tegning kan blive liggende.

## Sådan kører du det

**Første gang** installeres yaml-læseren i Ladybug Tools' Python (kommandoprompt):
```
%USERPROFILE%\ladybug_tools\python\python.exe -m pip install pyyaml
```

**Hver gang:**
1. Grasshopper: sæt en **GhPython-komponent (IronPython 2)** på lærredet og indsæt koden fra `gh_eksport_geometri.py`.
   Lav inputs `_mappe` (tekst: projektmappen) og `_eksporter` (Boolean Toggle) og output `rapport` (Panel).
2. Sæt `_eksporter` til True. Rapporten viser antal rum, vinduer og skygger, og om noget gik galt.
3. Kommandoprompt:
   ```
   %USERPROFILE%\ladybug_tools\python\python.exe energi\model\byg_hbmodel.py energi\projekter\hjerlesvej
   ```
4. Modellen ligger nu som `model.hbjson` i projektmappen. Den kan åbnes i Grasshopper med **HB Model from HBJSON** for at se den.

## Test uden Rhino

```
python -m pytest energi/model/test_byg_hbmodel.py
```
Bygger to skoæske-rum med et vindue, et ovenlys og et træ og kontrollerer resultatet.

## Næste trin

- Kørsel af EnergyPlus-simuleringen og udtræk af timer over 27/28 °C pr. rum
- Scenarier (solafskærmning, glastype, udluftning) i én kørsel
- DS 418-varmetabsramme fra modellens arealer og længder
- Dagslys efter EN 17037
- Resultater ind i notatet via `energi/rapport/byg_notat.py`

## Varmetabsramme (DS 418) i Grasshopper

`ds418_varmetab.py` regner varmetabsrammen efter BR18 § 284, stk. 2 direkte på Honeybee-modellen.
Indsæt hele filen i en GhPython-komponent (IronPython 2) med inputs `_model`, `_psi_`, `_u_`,
`_gulvvarme_`, `_beregn` og outputs `tabel`, `projekt_W_K`, `ramme_W_K`, `glasandel`, `ok`, `data`.

- **Projekt:** modellens arealer og U-værdier + ψ × længder (vinduessamlinger, fundament, ovenlys).
- **Referenceramme:** samme geometri med tabel 4-værdier og glas begrænset til 30 % af etagearealet.
- **Dimensionerende varmetab pr. rum** ved −12 °C (20 °C inde, 24 °C i bad) inkl. frisk luft uden genvinding.

`_u_` (fx `ydervaeg=0.15, tag=0.10, terraendaek=0.10, vindue=0.80`) overskriver modellens U-værdier,
så DS 418-beregnede værdier for opbygninger med stolper/spær kan bruges.

## Materialebibliotek med rullemenu

`gh_materialer.py` erstatter HB Opaque Material. Sæt koden i en GhPython-komponent (IronPython 2)
med inputs `_materiale`, `_tykkelse_mm`, `_sol_absp_` og outputs `mat`, `info`.
Første gang laver komponenten selv en rullemenu med alle materialer på `_materiale`.
Én komponent pr. lag; `mat` går i `_materials` på HB Opaque Construction (udefra og ind).
Værdierne er typiske designværdier; brug lambda fra databladet for isolering, når den kendes.

## Standardopbygninger (én komponent i stedet for hele konstruktionskæden)

`gh_opbygninger.py` læser `energi/regler/opbygninger.txt` og laver et ConstructionSet som tekst.
Scriptet bruger ikke Honeybee selv, så det virker i alle script-komponenter i Rhino 8.
Inputs `_fil`, `_ydervaeg`, `_tag`, `_terraendaek`, `_vindue`; outputs `constr_set`, `info`.
Tomme opbygnings-inputs får selv en rullemenu.

    constr_set -> HB String to Object (_hb_str) -> _constr_set_ på HB Room from Solid
    mod_set    -> HB String to Object (_hb_str) -> _mod_set_    på HB Room from Solid

Samme vindue bruges i energi (U, g, LT) og Radiance (glasmodifier ud fra LT), så komfort- og
dagslysanalysen kører på samme model. `rad_mod_` og `ep_constr_` på HB Aperture skal stå tomme.

Nye opbygninger og materialer skrives i tekstfilen. `_fil` kan også få hele tekstfilens indhold
fra et Panel (sæt `_fil` til List Access); så ligger biblioteket i selve .gh-filen.
