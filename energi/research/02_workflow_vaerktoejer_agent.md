# Parametrisk Rhino/Grasshopper-pipeline til energi-, varmetabs-, indeklima- og dagslysnotater for enfamiliehuse og sommerhuse

*Research-notat, 1. oktober 2026. Sproget er dansk. Hver påstand har en kilde-URL. Usikkerheder er markeret med **[USIKKER]**.*

**Metodenote:** Webadgangen var delvist begrænset. discourse.ladybug.tools, docs.ladybug.tools, build.aau.dk, bygningsreglementet.dk, projekter.aau.dk og arteliagroup.dk kunne **ikke** hentes direkte. Påstande om dem bygger på søgemaskinens uddrag, ikke på at hele siden er læst. Ladybug Tools-kildekoden er derimod klonet og læst direkte fra GitHub (komponent-docstrings, CLI, EN 17037-tærskler), og pakkeversionerne er slået op på PyPI den 1.10.2026.

---

## 0. Kort konklusion

| Leverance | Anbefalet motor | Myndighedsstatus | Automatiseringsgrad |
|---|---|---|---|
| Energiramme | **Be18** (BUILD/AAU). Pipeline skriver beXML | Be18 er standardværktøjet | Delvis: generér beXML, åbn/beregn i Be18 manuelt **[USIKKER: ingen kendt CLI]** |
| Varmetab DS 418 (rumvis dimensionerende) | Eget Python-modul efter DS 418 + Excel/Word-output | DS 418 er referencen | Fuld |
| Overtemperatur (BR §386 / termisk indeklima) | Honeybee-Energy (EnergyPlus 25.1 via OpenStudio 3.10). Be18's forenklede sommerkomfort som krydstjek | Dynamisk simulering med DRY er accepteret i vejledningen. Intet værktøj er "godkendt" ved navn **[USIKKER]** | Fuld (headless CLI) |
| Dagslys (BR §379, 300 lux-metoden) | Honeybee-Radiance, recipe `annual-daylight-en17037` | DS/EN 17037 er den metode, BR henviser til | Fuld (headless) |
| Blænding/DA/UDI (frivilligt, kvalitet) | Honeybee-Radiance `annual-daylight` + `imageless-annual-glare` | Ikke krav i BR for boliger | Fuld |

---

## 1. Ladybug Tools: versioner, komponenter og faldgruber

### 1.1 Versioner (status pr. 1.10.2026)

- **LBT for Grasshopper 1.10.x** er den aktuelle hovedversion. Komponenterne i `honeybee-grasshopper-energy` har `ghenv.Component.Message = '1.10.0'` (læst i kildekoden: https://github.com/ladybug-tools/honeybee-grasshopper-energy). PyPI-pakken `ladybug-grasshopper` er på 1.72.5 (21.5.2026): https://pypi.org/project/ladybug-grasshopper/
- Kompatibilitetsmatrix (https://github.com/ladybug-tools/lbt-grasshopper/wiki/1.4-Compatibility-Matrix):
  - LBT 1.10.0: Python 3.10.10, Radiance 5.4 (2023-11-05), **OpenStudio 3.10.0**, Rhino 8.28.
  - DEV: OpenStudio 3.11.0.
  - EnergyPlus-versionen følger af OpenStudio. Forumtråden "The installed EnergyPlus must be version 25.1.0 or greater" peger på **EnergyPlus 25.1** til 1.10: https://discourse.ladybug.tools/t/the-installed-energyplus-must-be-version-25-1-0-or-greater/40480
- 1.9.0 var den forrige stabile version, med fokus på store modeller. Windows-installer via Pollination, OpenStudio 3.9: https://discourse.ladybug.tools/t/ladybug-tools-for-grasshopper-1-9-0-release/36907
- Core-SDK'er på PyPI (opslag 1.10.2026, alle opdateret inden for de seneste uger):
  - `honeybee-energy` 1.126.0
  - `honeybee-radiance` 1.66.295
  - `honeybee-core` 1.64.75
  - `ladybug-core` 0.44.62
  - `lbt-recipes` 0.29.1
  - `honeybee-radiance-postprocess` 0.5.21
  - `honeybee-openstudio` 0.9.0, som oversætter HBJSON til OSM/IDF/gbXML i Python
  - `dragonfly-energy` 1.46.41

  Kilde: https://pypi.org/user/ladybug-tools/
- **Faldgrube:** Der er rapporteret installationsproblemer i Rhino 8, hvor 1.8 indlæses i stedet for 1.10. Løsningen er at rydde cachede filer og geninstallere: https://discourse.ladybug.tools/t/ladybug-1-10-is-not-loading-in-rhino-8/40807
- **Anbefaling:** Lås hele værktøjskæden pr. projektår, så LBT-version, OpenStudio/EnergyPlus, Radiance og Python-pakker er fastlagt (se §7).

### 1.2 Relevante Grasshopper-komponenter (verificeret i kildekoden)

Komponentlister er læst direkte i `honeybee-grasshopper-energy/src` og `honeybee-grasshopper-radiance/src` (GitHub-repoerne ovenfor).

| Opgave | Komponenter | Bemærkning |
|---|---|---|
| Rum fra geometri | `HB Room from Solid`, `HB Rooms from Solids`, `HB Solve Adjacency`, `HB Model`, `HB Apertures by Ratio` (core). Alternativ: Dragonfly `DF Room2D` fra plantegninger | For enfamiliehuse giver Dragonfly (2D-plan + etagehøjde) robuste, gentagelige modeller. Kilde: dragonfly-energy på PyPI ovenfor |
| Konstruktioner/materialer | `HB Opaque Material`, `HB Opaque Material No Mass`, `HB Opaque Construction`, `HB ConstructionSet`, `HB Apply ConstructionSet`, `HB Apply Opaque Construction`, `HB Internal Mass` | Byg et dansk bibliotek (JSON) med U-værdier efter BR, og verificér U-værdien efter oversættelse |
| Vinduer med g-værdi/LT | `HB Window Material`, en "SimpleGlazingSystem" med `_u_factor`, `_shgc` (= g-værdi) og `_t_vis_` (= LT). Alternativt lagvis `HB Glass Material` + `HB Window Gap Material` + `HB Window Frame` | Docstring: SHGC "includes both directly transmitted solar heat as well as solar heat that is absorbed by the glazing system". **Faldgrube:** Simple glazing har kendte vinkelafhængighedsafvigelser i EnergyPlus **[USIKKER: ikke verificeret i dette notat]** |
| Udvendig solafskærmning, fast | Shade-geometri (`HB Shade`, `HB Louver Shades`, `HB Extruded Border Shades`) + `HB Apply Shade Construction` | Udhæng og nabobygninger påvirker både energi og Radiance |
| Dynamisk solafskærmning | `HB Window Construction Shade` med `_shd_location_` Interior/Between/**Exterior** og `_control_type_`: 0 AlwaysOn, 1 OnIfHighSolarOnWindow (W/m²), 2 OnIfHighHorizontalSolar, 3 OnIfHighOutdoorAirTemperature, 4 OnIfHighZoneAirTemperature … + schedule. `HB Window Construction Dynamic` til vilkårlige tilstande via skema. `HB Shade Material`, `HB Blind Material` | Kontrollogikken er EnergyPlus' `WindowShadingControl`. Til Radiance: `HB Dynamic Aperture Group` / `HB Dynamic Shade Group` / `HB Dynamic State` |
| Vinduesåbning / naturlig ventilation | `HB Window Opening` (oper. areal/højdefraktion, discharge- og vindkoefficienter) + `HB Ventilation Control` (min/max inde- og udetemperatur, delta-T, schedule) | Standard: `ZoneVentilation:WindandStackOpenArea` pr. rum. Vind- og stakledet kombineres som √(Vw²+Vs²). NPL-højde = ¼ af vindueshøjden (docstring) |
| AirflowNetwork (tværventilation, skorstenseffekt) | `HB Airflow Network` (sic: filnavnet er `HB Airflow Newtwork.py`) | Erstatter infiltration med AFN Crack pr. flade, air-boundaries med Crack og operable vinduer med AFN SimpleOpening. Vinduesstyring skrives som EMS-program. Docstring: "considerably longer to run … significant when the Model contains operable windows" |
| Interne laster | `HB People`, `HB Lighting`, `HB Equipment`, `HB Infiltration`, `HB Ventilation`, `HB Setpoint`, `HB ProgramType`, `HB Apply Load Values`, skema-komponenter (`HB Weekly Schedule`, `HB Fixed Interval Schedule`) | Danske standardlaster (fx SBi 213-forudsætninger) skal oversættes til egne ProgramTypes. Lav dem én gang som JSON-bibliotek |
| HVAC/opvarmning | `HB IdealAir` eller `HB HeatCool HVAC` | Til overtemperatur: ideal-air med opvarmning, uden køling |
| Output: operativ temperatur | `HB Read Room Comfort Result` → `oper_temp`, `air_temp`, `rad_temp`, `rel_humidity` (pr. rum, timeværdier fra SQL) | Overtemperaturtimer tælles i efterbehandling (ladybug `HourlyContinuousCollection`) mod 27/28 °C i brugstiden |
| Komfortkort | `HB Adaptive Comfort Map`, `HB PMV Comfort Map` (recipes) | Valgfrit |
| Årligt dagslys (DA, sDA, UDI) | `HB Sensor Grid from Rooms`, `HB Annual Daylight` (enhanced 2-phase, egnet til ASE og dynamiske afskærmninger) → `HB Annual Daylight Metrics` (DA, cDA, UDI) og `HB Spatial Daylight Autonomy`, `HB Annual Sunlight Exposure` | Kilde: komponentlisten i GitHub-repoet. Metodebeskrivelse: https://docs.ladybug.tools/hb-radiance-primer/components/3_recipes/annual_daylight |
| EN 17037 | `HB Annual Daylight EN17037` → `summary` (sDA for "minimum" og "target illuminance"), `daylight_hours` (halvdelen af året med mest dagslys, fra EPW's diffuse horisontale belysningsstyrke) | Default `-ab 2 -ad 5000 -lw 2e-05`. Postprocessering har target 300/500/750 lux og minimum 100/300/500 lux for niveauerne minimum/medium/high (læst i `honeybee_radiance_postprocess/en17037.py`) |
| Årlig blænding (DGP) | `HB Imageless Annual Glare` → `HB Annual Glare Metrics` (Glare Autonomy, threshold 0.4, luminance-faktor 2000 cd/m²). Til punktvise billeder: `HB Point-In-Time View-Based` + `HB Glare Postprocess` | Bygger på Nathaniel Jones' imageless-metode: https://github.com/nljones/Accelerad/wiki/The-Imageless-Method-for-Spatial-and-Annual-Glare-Analysis. **[USIKKER]** Metoden er en tilnærmelse: radiale sensorer, kun himmel- og solkilder. Den erstatter ikke fuld billedbaseret DGP |
| Daylight factor | `HB Daylight Factor` | Til hurtig screening |

### 1.3 Kendte faldgruber (Ladybug Tools / EnergyPlus)

1. **AFN understøtter ikke vandrette (tag)vinduer som operable.** Det er en reel begrænsning for ovenlys i sommerhuse: https://discourse.ladybug.tools/t/hb-airflow-network-operable-horizontal-windows/40315. Med simpel `ZoneVentilation` kan ovenlys modelleres. Alternativt kan man vippe fladen let, men det skal dokumenteres. **[USIKKER: om det er løst i 1.10/dev]**
2. **Valget af ventilationsmodel ændrer resultatet markant.** Petrou et al. fandt, at EnergyPlus forudsagde høj overophedningsrisiko (TM59) i 7 af 9 varianter af en London-lejlighed, mens IES VE gav lav risiko i alle. Hovedårsagerne var vinddrevet ventilation og konvektionsalgoritmer: https://discovery.ucl.ac.uk/id/eprint/10055228/. **Konsekvens:** Dokumentér altid åbningsareal, Cd, vindkoefficient, styring og konvektionsalgoritme, og kør en følsomhedsanalyse.
3. **Den danske DRY-EPW (2001–2010) gav "out of range"-fejl i EnergyPlus.** Dugpunkt var angivet som 99 i stedet for "missing" 99.9. Et Python-script, der retter filen, er delt på forummet: https://discourse.ladybug.tools/t/danish-reference-year-dry-2001-2010-epw-file-errors/24907. Lav en valideret, versionsstyret kopi af vejrfilen.
4. **Rhino.Compute/headless:** Den gamle Honeybee brugte `sc.doc` og fejlede headless: https://discourse.ladybug.tools/t/running-hb-example-on-rhino-compute/11131. Brug i stedet SDK/CLI uden Rhino (§2).
5. **Grid/aperture-modellering:** sDA og EN 17037 er følsomme over for grid-højde (0,85 m), afstand til væg og møblering/refleksionsfaktorer. Radiance-parametre bør dokumenteres. Der findes en empirisk validering af Honeybee/Radiance-parametre: https://www.researchgate.net/publication/343108739
6. **Simple glazing vs. lagvis rude:** Brug producentens U, g og LT konsekvent i både Be18 og Honeybee. Radiance bruger `t_vis` til modifier-konvertering, så det skal tjekkes, at LT er ens i begge modeller (QA-regel).
7. **Brugstid:** BR's 100 h > 27 °C / 25 h > 28 °C gælder i "brugstiden". Tælleren skal derfor maskes med samme brugstidsskema som de interne laster (se §5).

---

## 2. Headless/automatiseret kørsel

### 2.1 Python-SDK og CLI uden Rhino (anbefalet kerne)

- Alle core-biblioteker kan installeres med pip (`pip install honeybee-energy honeybee-radiance lbt-recipes ...`): https://pypi.org/project/honeybee-energy/. De kræver OpenStudio/EnergyPlus og Radiance installeret lokalt i de versioner, kompatibilitetsmatrixen angiver.
- **Energi-CLI** (læst i `honeybee_energy/cli/simulate.py`): `honeybee-energy simulate model MODEL.hbjson WEATHER.epw --sim-par-json simpar.json --folder out/`. Den har også muligheder for `--measures`, `--additional-idf` og `--viz-variable`. Resultatudtræk sker med `honeybee-energy result data-by-outputs` og `output-csv` m.fl. (`cli/result.py`). Oversættelse: `honeybee-energy translate model-to-osm | model-to-idf | model-to-gbxml`.
- **Radiance-recipes headless:** `lbt-recipes run annual-daylight-en17037 inputs.json --workers N`. Det kører Pollination/queenbee-recipe lokalt via luigi (læst i `lbt_recipes/cli/__init__.py` og `recipe.py`). Recipes i pakken: `annual_daylight`, `annual_daylight_en17037`, `annual_daylight_enhanced`, `imageless_annual_glare`, `daylight_factor`, `direct_sun_hours`, `adaptive_comfort_map`, `annual_energy_use` m.fl.
- **Datamodellen HBJSON** er et JSON-skema for Honeybee-modellen, med energi- og radiance-egenskaber på samme objekter. Byg den med `honeybee.model.Model` / `Room.from_box` / `Face`, eller via Dragonfly `Building` → `to_honeybee()`, og gem med `model.to_hbjson()`. **[Generel viden om API'et. Metodenavnene bør verificeres mod den låste version.]**

### 2.2 Rhino 8 Python 3 (ScriptEditor)

- Rhino 8 har CPython 3 i ScriptEditor og kan installere PyPI-pakker: https://www.rhino3d.com/features/developer/scripting/ og COMPAS-guiden https://compas.dev/compas/2.8.1/userguide/cad.rhino8.html
- `ladybug-rhino` er ikke beregnet til CPython, undtagen til CLI og Rhino 8's CPython: https://pypi.org/project/ladybug-rhino. LBT's Python-version er 3.10.10 ifølge kompatibilitetsmatrixen.
- **Anbefaling:** Brug Grasshopper udelukkende som *geometri- og QA-front-end*, der skriver HBJSON plus en "projekt-JSON" med parametre. Selve simuleringen og rapporten kører i en separat Python 3-proces (samme kode i GH, på en build-server og i CI).

### 2.3 Pollination

- Rhino-plugin koster 1.375 USD/år. Grasshopper-plugin er gratis. Cloud-simulering kræver en separat plan: https://www.pollination.solutions/pricing
- Fordel: cloud-skalering af mange huse/varianter og samme recipes som lokalt. Ulempe: data i skyen (GDPR/kontrakt) og løbende licens.

### 2.4 Rhino.Compute / Hops

- Hops sender GH-definitioner til en headless Rhino/Grasshopper-server: https://developer.rhino3d.com/guides/compute/what-is-hops/. Deployment på IIS: https://developer.rhino3d.com/guides/compute/deploy-to-iis/
- Plugins med UI-krav giver problemer headless (se tråden ovenfor). Compute giver mest mening til *geometri-generering* (fx web-konfigurator). Simuleringen bør køre direkte i Python.

### 2.5 Parametriske scenarier

- **Colibri + Design Explorer** (Thornton Tomasetti CORE studio) itererer over GH-sliders, skriver CSV med input og output og viser det interaktivt: https://www.food4rhino.com/en/app/colibri og https://tt-acm.github.io/DesignExplorer/. Brugt med Honeybee til hundredvis af permutationer: https://www.csemag.com/articles/how-computational-design-modeling-are-changing-engineering/
- **Egne loops (anbefalet til produktion):** Lav en Python-scenariegenerator, fx med `itertools.product` over g-værdi, afskærmning, åbningsareal og orientering. Hver variant får en deterministisk ID (hash af input-JSON), simuleres parallelt (`concurrent.futures`) og caches, så identiske input ikke genberegnes.
- **TRNLizard** (Transsolar, TRNSYS 18) er et alternativ til termisk/dagslys i GH: https://www.food4rhino.com/app/trnlizard. **"Termite"** er *ikke* et termisk værktøj. Det er et agentbaseret layout-plugin (Termite Nest): https://www.food4rhino.com/en/app/termite-nest

---

## 3. Danske beregningsværktøjer og kobling

### 3.1 Be18

- Be18 udvikles af BUILD/AAU og hentes og opdateres via https://be18.sbi.dk/be/ (licens og login): https://www.build.aau.dk/til-byggebranchen/software/be18
- **Filformat:** Be18 læser og skriver **beXML** (`*.bexml`). Ifølge Be18-FAQ kan filen rettes i en teksteditor, men en XML-editor anbefales. Resultater og nøgletal gemmes som XML-filer med suffikserne `_RES` og `_KEY` i samme mappe: https://www.build.aau.dk/til-byggebranchen/software/be18/faq (fra søgeuddrag)
- XML-strukturen har elementer som `OPAQUE_CONST` med attributter for navn, areal, U-værdi osv. Et AAU-kandidatspeciale har brugt Python/ElementTree til at generere Be18-XML og automatisere transmissionstab fra BIM (Revit/Dynamo): https://projekter.aau.dk/projekter/files/459938600/Kandidatspeciale_Allan_og_Alexander.pdf (kun søgeuddrag)
- **Be18 kan ikke importere direkte fra fx Revit** (samme speciale). Den praktiske vej er derfor at **skrive beXML programmatisk** ud fra en skabelon, som er gemt fra Be18 med firmaets standardinstallationer, og så åbne og beregne i Be18.
- **Batch/CLI:** Jeg har ikke fundet dokumentation for en kommandolinje- eller batchtilstand i Be18. **[USIKKER]** Spørg BUILD direkte. Hvis der ikke findes en, er beregningen en manuel "åbn → beregn → gem"-handling pr. hus. `_RES`/`_KEY`-XML kan derefter læses automatisk tilbage i pipelinen.
- **ROCKWOOL Energy Design (RED)** bruger samme beregningskerne som Be18 og kan importere og eksportere beXML: https://www.rockwool.com/dk/downloads-og-tools/beregningsprogrammer/energibereginger-energy-design/ og manualen https://www.rockwool.com/siteassets/o2-rockwool/dokumentation-og-certifikater/dokumentation/beregningsprogrammer/rockwool-energy-design-manual.pdf. RED kan bruges til validering af genereret beXML.
- **Be18's forenklede sommerkomfort/overtemperatur:** Boliger kan dokumenteres med en forenklet beregning efter SBi-anvisning 213. Metoden tjekker det mest solbelastede rum. Kilder: https://www.aaudxp-cms.aau.dk/media/1u5p5xbb/%C3%A6kvivalensberegning_2022_03_15_build_sbi.pdf og https://nrgisystems.dk/hjaelp-til-energy10/nybyggeri/beregning-af-sommerkomfort-rum-med-stoerst-solpaavirkning/. Et studieprojekt hos Artelia har analyseret den forenklede metode: https://buildingdesign.arteliagroup.dk/student-projects/analyse-af-den-forenklede-metode-til-beregning-af-overtemperatur-i-boliger/ (indholdet er ikke læst)
- **Eksisterende Be18-eksportværktøjer:**
  - **Artelia BIM-EBI tools** (Revit/Dynamo/Excel → Be15/Be18, dagslys og sommerkomfort) er "under opdatering og ikke tilgængelige": https://buildingdesign.arteliagroup.dk/tools/bim/
  - **BIM-LINK** (Revit-plugin/beXML) ser ud til at være udgået (kun søgeuddrag).
  - **FocusRat** (norsk) har en "Eksport til energiberegning": https://focusrathjelp.focus.no/2021/Documents/eksporttilenergiberegning.htm. **[USIKKER: om den skriver beXML]**
  - **Energy10** (nrgisystems) er et Be18-kompatibelt energirammeprogram med sommerkomfort (link ovenfor).
  - Jeg fandt **ingen Rhino/Grasshopper → Be18-plugin**. Det er en reel markedsmulighed og bekræfter, at en egen beXML-writer er nødvendig.
- **BR25:** Ændringerne til BR18 med virkning 1.7.2025 ("BR25") handler primært om skærpede CO₂e/LCA-krav, fx 6,7 kg CO₂e/m²/år for enfamiliehuse. Energiramme og LCA skal nu begge dokumenteres: https://www.mazanti.dk/en/news/skaerpede-klimakrav-i-bygningsreglementet-vaesentlige-aendringer-til-br18-er-traadt-i-kraft-1-juli-2025/ og https://kielberg.com/er-du-klar-til-br25/. Jeg fandt **ingen "Be25"**. Be18 er stadig navnet på programmet: https://www.bolius.dk/energiberegning-af-nye-huse-19092. **[USIKKER]** Pipelinen bør desuden eksportere mængder til **LCAbyg**. Det er ikke undersøgt her.

### 3.2 BSim

- BSim er BUILD's dynamiske simuleringsværktøj (indeklima, energi, dagslys, fugt og naturlig ventilation) og bruges typisk til større bygninger: https://www.glasfakta.dk/viden/vinduer/doere/energi-og-miljoe/indeklima-termisk-indeklima-i-henhold-til-br18/
- Jeg har ikke fundet dokumentation for scripting/batch eller IFC/gbXML-import i aktuelle BSim-versioner. **[USIKKER]** BSim egner sig derfor dårligt som automatiseret motor, men kan bruges til stikprøve-validering (§5).

### 3.3 DS 418 varmetab

- DS 418:2011 (+ tillæg 1:2020) er metoden for dimensionerende varmetab og skal bruges for at sikre ensartede beregninger: https://www.ds.dk/da/standarder-fns-verdensmaal/varmetab og prøvesiderne https://webstore.ansi.org/preview-pages/DS/preview_M251829CUR.pdf. Beregninger kan laves i programmer eller regneark: https://www.mur-tag.dk/projektering/varmetabsberegning/
- **Anbefaling:** Implementér DS 418 som et rent Python-modul (rumvis transmission Σ U·A·ΔT + linjetab ψ·l + ventilation/infiltration). Input skal komme direkte fra *samme* geometri-JSON som Honeybee-modellen. Skriv til en låst Excel-skabelon (openpyxl), så eksisterende QA-kultur bevares, og til Word-bilag. Rumtemperaturer og dimensionerende udetemperatur (−12 °C) skal hentes fra DS 418, som skal købes. Indtast ikke tal fra hukommelsen. Kuldebroer (ψ-værdier) er afgørende ifølge DS 418-uddrag: https://webstore.ansi.org/preview-pages/DS/preview_M251829CUR.pdf
- **Varmetabsramme (BR §259) og transmissionstab** kan beregnes i samme modul og krydstjekkes mod Be18's `_KEY`-output.

### 3.4 Geometri → arealer

- Fra Grasshopper/Honeybee-modellen kan følgende udtrækkes automatisk:
  - bruttoarealer pr. bygningsdel og orientering, som Be18 typisk kræver pr. orientering/hældning
  - vinduesareal og glasandel
  - fundamentlængder og linjetab
  - etageareal (opvarmet)
  - rumvise arealer til DS 418

  Dragonfly/Honeybee giver `Face.area`, `normal` og `boundary_condition` direkte.
- **Faldgrube:** Be18 regner *udvendige* mål for klimaskærmsarealer, mens energimodellen typisk bruger centerlinje eller indvendige mål. Der skal en eksplicit målkonvention og en korrektionsfaktor eller offset-geometri i datamodellen. **[USIKKER: præcis Be18/SBi 213-målkonvention skal verificeres i SBi-anvisning 213]**

---

## 4. Klimadata

- **DRY 2013 (måleperiode 2001–2010)** er BR's reference til termisk indeklima. "Dokumentation … baseret på Design Reference Year, DRY 2013 for kalenderåret 2010": https://www.glasfakta.dk/viden/vinduer/doere/energi-og-miljoe/indeklima-termisk-indeklima-i-henhold-til-br18/
- Data er publiceret af DMI med DTU og SBi. Filen "Danmark 2013" (Sjælsmark/Holbæk, 55,793 N / 12,16 Ø) kan hentes på BUILD's klimadataside: https://www.build.aau.dk/til-byggebranchen/software/bsim/klimadata og DMI's rapport https://www.dmi.dk/fileadmin/Rapporter/2018/DMI_report_18-20.pdf
- **EPW til dagslys (BR18):** AAU-notat af Kjeld Johnsen (2019) med et DRY 2001–2010-datasæt i EPW-format til 300 lux-metoden efter DS/EN 17037: https://vbn.aau.dk/en/publications/vejrdata-til-brug-for-eftervisning-af-krav-vedr-dagslys-i-br18-in/
- **Kendt EPW-fejl** (dugpunkt 99 i stedet for 99.9) og en rettelse: https://discourse.ladybug.tools/t/danish-reference-year-dry-2001-2010-epw-file-errors/24907
- **NYT: Dansk Referenceår 2025** (DMI Rapport 25-14) bygger på observationer 2011–2023 plus 12 fremtidsscenarier. Fem EPW-filer følger med, fx `DRY_2011-2023_epw-fil.epw` og `DRY_rcp45_2035_2054_epw-fil.epw`: https://www.dmi.dk/fileadmin/Rapporter/2025/DMI_Rapport_25-14_Dansk_Reference%C3%A5r_2025.pdf. **[USIKKER]** Om og hvornår BR/Be18 skifter til DRY 2025. Indtil videre: Brug DRY 2013 til myndighedsdokumentation og DRY 2025 plus RCP4.5 som *robusthedsanalyse*.
- **Andre fremtidsfiler:** Projicerede vejrdata for 2050 og 2090 (TMY) har været tilgængelige siden 2021 (AAU/Saxhoff): https://www.saxhoffondenbyg.dk/projekter/nye-vejrdata-til-termisk-bygningssimulering, https://vbn.aau.dk/en/publications/vejrdata-til-fremtidens-byggeri/ og https://www.aaudxp-cms.aau.dk/media/1m1h5l1d/rapport-om-erdy-v3.pdf. Vejrdata-applikationen fra Aarhus Universitet: http://vejrdatafiler.dk/

---

## 5. Validering og accept i Danmark

- **Kravet:** For boliger med mulighed for vinduesudluftning er kravet normalt opfyldt ved højst 100 timer/år over 27 °C og 25 timer/år over 28 °C i brugstiden. Dokumentationen kan ske ved forenklet beregning (SBi 213/Be18) eller ved simulering af kritiske rum med DRY: https://www.glasfakta.dk/viden/vinduer/doere/energi-og-miljoe/indeklima-termisk-indeklima-i-henhold-til-br18/ og BR-vejledningen https://www.bygningsreglementet.dk/historisk/br18_version6/tekniske-bestemmelser/19/vejledninger/termisk-indeklima/?Layout=ShowAll (ikke læst direkte)
- **Værktøjsneutralitet:** Ud fra søgeuddragene er BR-vejledningen funktionsbaseret. Den nævner "dynamisk simulering" og DRY, ikke et bestemt program. **Branchevejledning for indeklimaberegninger** (2017, InnoBYG/BUILD) nævner BSim, IDA-ICE og IES-VE som eksempler på detaljerede værktøjer: https://vbn.aau.dk/da/publications/branchevejledning-for-indeklimaberegninger/ og præsentationen https://www.danvak.dk/wp-content/uploads/2017/05/Steffen-Maagaard-MOE.pdf. Branchevejledningens bilag med best-practice-indeklimarapport for boliger er en god skabelon for rapportindhold: https://www.innobyg.dk/media/75418/bilag-2-best-practice-indeklimarapport-bolig.pdf
- **[USIKKER – vigtig]:** Jeg har ikke fundet en eksplicit udtalelse om, at EnergyPlus/Honeybee er accepteret (eller afvist) af danske kommuner til §386-dokumentation. Kommunerne foretager normalt ikke teknisk kontrol af indeklimaberegninger. Ansvaret ligger hos den certificerede/rådgivende ingeniør, og dokumentationen skal kunne efterprøves. **Anbefaling:**
  1. Følg branchevejledningens forudsætninger (laster, brugstid, udluftningsstrategi, solafskærmning) 1:1, og skriv dem i rapporten.
  2. Lav en *intern valideringsrapport* på 3–5 typehuse: Honeybee/EnergyPlus mod BSim og/eller Be18's forenklede metode. Accepter en afvigelse inden for et defineret bånd. Gentag ved hvert versionsskift af LBT/EnergyPlus.
  3. Kør en følsomhedsanalyse på åbningsgrad, Cd og afskærmningsstyring (Petrou et al.: https://discovery.ucl.ac.uk/id/eprint/10055228/).
- **Sammenlignende litteratur:** EnergyPlus, IDA ICE og TRNSYS er valideret mod forsøg i testbokse: https://www.researchgate.net/publication/338765526. Inter-model-sammenligning for engelske boliger: https://discovery.ucl.ac.uk/id/eprint/10075254/1/Davies_Inter-model%20comparison%20of%20indoor%20overheating%20risk%20prediction%20for%20English%20dwellings_AAM2.pdf. Jeg fandt ingen publiceret direkte sammenligning af EnergyPlus og BSim for danske enfamiliehuse. **[Hul i litteraturen]**
- **Dagslys:** BR §379 kan dokumenteres med 10 % glasareal (korrigeret) eller med ≥300 lux på ≥50 % af gulvarealet i ≥50 % af dagslystimerne efter DS/EN 17037: https://www.bygningsreglementet.dk/Tekniske-bestemmelser/18/Vejledninger/Generel_vejledning/Dagslys og https://www.glasfakta.dk/viden/vinduer/doere/lys/belysning/dagslys-krav-i-br-og-dagslysfaktor/. Honeybee's `annual-daylight-en17037` beregner netop "target 300 lux / 50 % af arealet / 50 % af dagslystimerne" (kildekoden). **Bemærk:** BR's krav svarer til target-delen af EN 17037's minimumsniveau. Minimum-illuminance-delen (100 lux på 95 %) er ikke BR-krav. **[USIKKER: verificér i gældende vejledning]**
- **CIBSE TM59:2026** er en ny britisk metode med partielt begrænset vinduesåbning (50 %) og en TM59-styringsregel 22–26 °C: https://buildingenergyexperts.co.uk/resources/tm59-2026-overheating-methodology/ og https://designbuilder.co.uk/helpv2025.1/Content/CIBSE_TM59_2026.htm. Den kan inspirere til danske udluftningsregler, men er ikke dansk krav.

---

## 6. Rapportgenerering og LLM

### 6.1 Figurer

- **matplotlib** 3.11 til statiske figurer i rapportkvalitet, **plotly** 7.1 + **kaleido** 1.4 til interaktive figurer og PNG/SVG-eksport (PyPI, opslag 1.10.2026).
- **Typiske figurer:**
  - årligt **heatmap** (dag × time) af operativ temperatur pr. kritisk rum med 27/28 °C-konturer
  - varighedskurve
  - søjler med timer > 27/28 °C pr. rum mod grænse
  - sDA/EN 17037-grids
  - energibalance (ladybug `HB Thermal Load Balance`)
- **Plantegninger farvet efter resultat:** Brug `ladybug-geometry`/`honeybee` (`Room.floor_area`, gulvpolygoner) → matplotlib `PolyCollection`. Brug ét farvekort med tre klasser: bestået, grænse og ikke bestået. Ladybug har også `ladybug-display`/`honeybee-display` (VisualizationSet) og `ladybug-charts` (PyPI-summary).
- Sensor-grid-resultater kan plottes som trianguleret mesh på plan med `tripcolor`.

### 6.2 Dokumentsamling

| Værktøj | Styrke | Svaghed |
|---|---|---|
| **docxtpl** 0.20 (Jinja2 i Word-skabelon) + python-docx 1.2 | Firmaets Word-skabelon bevares, og kollegaer kan redigere efterfølgende | Kompleks layoutkontrol er svær |
| **Quarto** | Markdown + Python → DOCX/PDF/HTML fra samme kilde | Endnu en toolchain (Pandoc/LaTeX) |
| **Typst** (Python-binding `typst` 0.15) | Hurtig, deterministisk PDF og simpel skabelonsyntaks | Mindre udbredt, ingen Word-output |
| LaTeX | Maksimal typografisk kontrol | Tung at vedligeholde |
| WeasyPrint 70 (HTML/CSS → PDF) | Webteknologi til layout | — |

- **Anbefaling:** **docxtpl** til myndighedsnotater, fordi kunder og kommuner forventer Word/PDF og manuelle rettelser skal være mulige. Konvertér til PDF med LibreOffice headless. Typst er et godt alternativ til ren PDF-masseproduktion.

### 6.3 LLM (Claude via API), sikkert indlejret

**Princip: LLM'en må aldrig beregne eller opfinde tal.** Alle tal kommer fra resultat-JSON. LLM'en formulerer kun tekst.

1. **Struktureret input:** Resultat-JSON (valideret med pydantic 2.13) + forudsætninger + regel-tjek-resultater.
2. **Structured outputs:** Lad modellen returnere JSON efter et skema (`output_config.format` i Messages API) med felter som `afsnit_sammenfatning`, `afsnit_forudsætninger` og `afvigelser[]`. Hvert tal i teksten indsættes som *placeholder*, fx `{{rum.stue.h_over_27}}`, og flettes af koden. Modellen skriver aldrig selve tallet.
3. **Deterministiske regel-tjek i Python, ikke i LLM'en:**
   - h>27 ≤ 100 og h>28 ≤ 25
   - sDA300 ≥ 50 %
   - vinduesareal ≥ 10 %
   - U-værdier ≤ BR-krav
   - LT og g ens i Be18 og Honeybee
   - arealsum Be18 = arealsum model (±1 %)

   LLM'en må gerne foreslå *ekstra* opmærksomhedspunkter ("rum X ligger tæt på grænsen; overvej afskærmning"). De markeres som forslag.
4. **Efterkontrol:** Et script verificerer, at ingen tal i LLM-teksten afviger fra JSON (regex over tal) og at alle placeholders er løst. Ved fejl afvises teksten.
5. **Menneskelig QA:** Ingen rapport frigives uden underskrift fra en ansvarlig ingeniør. Diff mellem LLM-udkast og endelig tekst logges.
6. **Praktisk om API'et** (fra Anthropic-dokumentationen pr. 9/2026):
   - Prompt caching af den faste systemprompt og skabelontekst sparer omkostninger ved mange huse.
   - Message Batches API giver 50 % rabat til ikke-tidskritiske natkørsler.
   - Aktuelle modeller er bl.a. `claude-opus-5-5` og `claude-sonnet-5-5`.
   - Brug `stop_reason`-tjek.
   - Overvej databehandleraftale og data retention-indstillinger, fordi adresser og kundedata er persondata (GDPR). Send kun anonymiserede, strukturerede resultater.
   - Kilde: Anthropic API-dokumentation (platform.claude.com). **[Detaljer om retention afhænger af kontrakt]**

### 6.4 Kommercielle produkter og læring

| Produkt | Hvad det gør | Læring |
|---|---|---|
| **cove.tool** | Energi, dagslys/blænding og compliance-tjek, "AI performance analysis" (USA/UK/AU). Kilde: https://cove.inc/newsroom/aia-2030-ddx-reporting-commitment-energy/ og https://www.energy.gov/cmei/buildings/articles/covetool-officiates-perfect-marriage-between-reduced-order-modeling-and | Faser: hurtig tidlig feedback og detaljeret compliance senere. Automatiske kodetjek |
| **ClimateStudio** (Solemma) | Hurtig Radiance/EnergyPlus i Rhino/GH, parametrisk. Kilde: https://www.solemma.com/climatestudio | Brugervenlige standard-workflows (LEED/EN 17037-lignende) |
| **Pollination** | Rhino/Revit-plugin + cloud-recipes. Kilde: https://www.pollination.solutions/pricing | Samme recipe lokalt og i skyen, og versionerede recipes |
| **Autodesk Forma** | Daylight potential og operational energy i tidlig fase. Kilde: https://www.autodesk.com/products/forma/product-details | Øjeblikkelig visuel feedback, ikke myndighedsdokumentation |
| **VELUX EIC Visualizer** | Enfamiliehuse: energi, ventilation og indeklima (IDA ICE 4.0-motor), timer > 26/27/28 °C. Kilde: https://www.researchgate.net/publication/261831124 | Simpel, typehusorienteret UI. Netop målgruppen |
| **Artelia BIM-EBI** | Revit → Be18, dagslys og sommerkomfort (dansk). Kilde: https://buildingdesign.arteliagroup.dk/tools/bim/ | Dansk efterspørgsel bekræftet. Værktøjet er p.t. utilgængeligt |
| **Energy10 / RED** | Be18-kerne-baserede energirammeværktøjer | beXML er de facto udvekslingsformatet |
| **IDA ICE** | Har BBR-støtte (Sverige) og kundetilpasning. Kilde: http://equaonline.com/iceuser/pdf/Guide_BBR-stod_i_IDA_ICE.pdf | Model for "lovkravsmodul" oven på en generel motor |

**Fælles læring:**
1. Standardiserede forudsætningspakker pr. regelsæt.
2. Automatiske bestået/ikke bestået-tabeller.
3. Reproducerbarhed via versionerede beregningskerner.
4. Rapporten genereres fra data, ikke skrives manuelt.

---

## 7. Foreslået arkitektur

### 7.1 Overblik

```
┌─────────────────────────┐
│ 1. INPUT                │  Rhino 8 / Grasshopper (geometri: plan, snit, vinduer)
│   project.yaml          │  + project.yaml (adresse→klima, orientering, BR-version,
│   geometry.3dm/gh       │    konstruktions-/vindues-IDs fra bibliotek, brugsmønstre)
└──────────┬──────────────┘
           ▼  (GH-script / Rhino 8 CPython)  ─── QA-1: geometri-validering
┌─────────────────────────┐   (lukkede rum, adjacency, normaler, vinduer i flader)
│ 2. DATAMODEL            │
│   model.hbjson          │  Honeybee/Dragonfly-model (energi + radiance)
│   building.json         │  Egen "kanonisk" bygningsmodel: arealer pr. bygningsdel,
│                         │  orientering, ψ-linjer, rum, opvarmet areal (pydantic-skema)
└──────────┬──────────────┘
           ▼  ─── QA-2: regel-lint (U≤krav, g/LT ens, arealsum, målkonvention)
┌─────────────────────────────────────────────────────────────┐
│ 3. SIMULERING (headless Python, Docker-image med låste versioner)
│  a) honeybee-energy simulate model  (EnergyPlus 25.1, DRY2013) → sql
│     + varianter (afskærmning, åbningsgrad) + robusthed (DRY2025/RCP4.5)
│  b) lbt-recipes run annual-daylight-en17037  (+ annual-daylight, glare)
│  c) ds418.py  → rumvist dimensionerende varmetab
│  d) bexml_writer.py → projekt.bexml  → [manuelt/RPA: Be18 beregn] → _RES/_KEY.xml
└──────────┬──────────────────────────────────────────────────┘
           ▼  ─── QA-3: plausibilitet (energibalance, ubehandlede timer, Be18 vs E+ transmission)
┌─────────────────────────┐
│ 4. RESULTAT-JSON        │  results.json (skema-valideret): pr. rum h>27, h>28,
│                         │  sDA300, DA, UDI, GA; varmetab W; Be18 nøgletal; pass/fail;
│                         │  metadata: input-hash, softwareversioner, vejrfil-SHA
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 5. RAPPORT              │  figurer (matplotlib) → docxtpl-skabelon → DOCX/PDF
│                         │  LLM-tekstudkast (structured output, placeholders)
└──────────┬──────────────┘
           ▼  ─── QA-4: tal-kontrol af tekst + menneskelig review + underskrift
       Frigivet notat (PDF) + arkiv (input, model, results, log)
```

### 7.2 Versionsstyring og reproducerbarhed

- **Git-monorepo** med følgende mapper:
  - `lib/` med konstruktioner, vinduer, ProgramTypes og skemaer som JSON
  - `pipeline/` med Python-pakken
  - `templates/` med docx-skabeloner
  - `weather/` med EPW-filer og SHA-256 og den rettede DRY-fil
  - `tests/`
- **Projekter** i separat repo eller mappe pr. sag. Gem kun input (yaml, 3dm/gh) og `results.json`. Store simuleringsmapper ligger i objektlager med hash-nøgle.
- **Låsning:** `requirements.lock` (uv/pip-tools) for alle `honeybee-*`/`ladybug-*`-pakker. Docker-image med OpenStudio 3.10 / EnergyPlus 25.1 og Radiance 5.4 (jf. kompatibilitetsmatrixen). Versionerne skrives ind i `results.json` og i rapportens bilag.
- **Regressionstests:** 3–5 referencehuse med kendte resultater, fx:
  - et parcelhus 150 m²
  - et sommerhus med ovenlys
  - et 1½-plan

  Testene køres i CI ved hver opdatering. En afvigelse over tolerance blokerer release. Testsuiten bruges også til den interne valideringsrapport mod BSim/Be18 (§5).
- **Deterministiske varianter:** Variant-ID = hash(input). Cache-hit springer simuleringen over.

### 7.3 QA-trin (konkret tjekliste)

1. **Geometri:** lukkede rum, korrekte normaler, ingen overlappende vinduer, korrekt nordretning, opvarmet areal ±2 % mod arkitektens areal.
2. **Datamodel:** alle bygningsdele har bibliotek-ID, og U, g og LT læses fra ét sted. Kuldebroer er komplette (fundament, vindueslysninger).
3. **Simulering:** EnergyPlus-advarsler (`.err`) parses. Severe/fatal giver stop. Ubehandlede timer, energibalance og antal timer med åbne vinduer er plausible.
4. **Krydstjek:** transmissionstab fra DS 418-modul, Be18 `_KEY` og Honeybee-arealer stemmer inden for tolerancen.
5. **Rapport:** alle placeholders er løst, ingen tal er "opfundet", forudsætningsafsnittet er genereret fra input, og den ansvarlige ingeniør har signeret.

### 7.4 Implementeringsrækkefølge (forslag)

1. Biblioteker (JSON) + `building.json`-skema + DS 418-modul + docx-skabelon. Hurtig gevinst, uafhængig af simulering.
2. beXML-writer ud fra en Be18-gemt skabelon. Test round-trip i Be18 og RED.
3. Overtemperatur med Honeybee-Energy for kritiske rum. Intern validering mod BSim/Be18 forenklet.
4. EN 17037 med Honeybee-Radiance.
5. Varianter/robusthed + LLM-tekst + Design Explorer-dashboard.

---

## 8. Samlet liste over usikkerheder

1. Om Be18 har en batch- eller CLI-tilstand. Ikke fundet, så spørg BUILD.
2. Om kommuner eller vejledning eksplicit accepterer EnergyPlus/Honeybee til §386. Vejledningen ser værktøjsneutral ud, men er ikke læst direkte.
3. Hvornår DRY 2025 erstatter DRY 2013 i BR/Be18.
4. Den præcise målkonvention for arealer i Be18 i forhold til modelgeometri (SBi 213).
5. Om AFN-begrænsningen for vandrette operable vinduer stadig gælder i LBT 1.10/dev.
6. Imageless DGP er en tilnærmelse og ikke ækvivalent med fuld billedbaseret DGP.
7. Om BR's 300 lux-krav kun svarer til EN 17037-target (ikke minimum-delen). Bør verificeres i aktuel vejledning.
8. Flere kilder (discourse, AAU, BR-vejledning) er kun læst som søgeuddrag på grund af netværksbegrænsning.
