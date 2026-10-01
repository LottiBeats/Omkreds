# Notat – Energi, varmetab, termisk indeklima og dagslys

<!--
  Kilden til notatet. rapport/byg_notat.py laver PDF'en herfra i Omkreds' rapportstil.
  Overskrifter nummereres automatisk. [afventer ...] er felter, der udfyldes fra beregningen.
-->

## Indledende bemærkninger

Notatet dokumenterer energi, varmetab, termisk indeklima og dagslys for ombygning og tilbygning af sommerhuset på Hjerlesvej, og hvilke krav i BR18 projektet udløser. Projektet består af et eksisterende A-hus, en eksisterende fløj med soveværelser (blok B), en ny mellembygning med hal og ovenlys og en ny soveværelsesfløj mod sydvest.

Notatet går videre end den lovpligtige dokumentation på tre punkter:

- **Termisk indeklima** beregnes rum for rum med dynamisk simulering, ikke kun i ét antaget kritisk rum.
- **Dagslys** vurderes som kvalitet (dagslysautonomi, blænding, udsyn), ikke kun som 10 %-reglen.
- **Afvejningen** mellem solafskærmning, dagslys og varmetab vises samlet, så bygherren kan se konsekvensen af hvert valg.

Beregningerne laves i en parametrisk model (Rhino/Grasshopper med Ladybug Tools), så tiltag og ændringer i arkitekturen kan regnes igennem hurtigt. Tallene er størrelsesordener på myndighedsniveau og ikke endelige dimensioneringer.

## Sammenfatning og anbefaling

Huset kan dokumenteres som sommerhus efter BR18 § 283-286 uden energiramme. Den største risiko er overophedning i rummene bag de store sydvestvendte glaspartier, ikke varmetabet. Vurderingen nedenfor er foreløbig og opdateres, når beregningerne er kørt.

| Emne | Krav | Foreløbig vurdering | Fokus |
| --- | --- | --- | --- |
| Energi / varmetab | § 283-284, tabel 4 eller varmetabsramme (DS 418) | Gul – glasandel over 30 % forventes | 3-lags glas, U ≈ 0,8; isolering i tag og terrændæk |
| Dimensionerende varmetab | DS 418 / DS 469 | Grøn | Kuldenedfald ved A-gavl, varmepumpens størrelse |
| Termisk indeklima | § 386: kritiske rum, DRY 2013 | Rød – største risiko | Udvendig solafskærmning, oplukkelige vinduer i gavltop, natkøling |
| Dagslys | § 379 | Grøn – rigeligt glas | Blænding i SV-gavl og hal |
| Ventilation | Kap. 22 | Grøn | Emhætte, udsugning i bad og sauna |
| Klimapåvirkning (LCA) | § 297-298 | Grøn – forventet undtaget | Bekræft opvarmet areal af tilbygning < 250 m² |

**Kritiske rum (foreløbig rangering)**

1. Soveværelse på 1. sal i A-huset – under tag, øverst i rummets varme luft, gavl mod SV.
2. Ophold, spisestue og køkken i A-huset – næsten hele SV-gavlen er glas.
3. Hal (40 m²) i mellembygningen – glasfacade mod SV og ovenlys.
4. Nyt soveværelse (17,4 m²) i sydfløjen – mod SV, brugt om natten.
5. Eksisterende soveværelser i blok B – glas mod både NØ og SV.

**Anbefaling:** Fasthold sommerhusvejen. Planlæg fra start udvendig solafskærmning mod SV, oplukkelige vinduer i toppen af A-gavlen og automatisk natkøling i hallen. Afklar tidligt med kommunen, hvordan 30 %-reglen opgøres for tilbygningen.

## Regelgrundlag: sommerhus, tilbygning og ombygning

Både tilbygningen og ændringerne i det eksisterende hus følger sommerhusreglerne i § 283-286, ikke de generelle regler for tilbygning og ombygning. § 283, stk. 2 siger, at sommerhuse og tilbygninger hertil ikke er omfattet af §§ 258-279 og §§ 293-295.

| Bygningsdel | Krav | Hjemmel |
| --- | --- | --- |
| Ny tilbygning (mellembygning og sydfløj) | U-værdier og linjetab efter bilag 2, tabel 4. Glas ≤ 30 % af opvarmet etageareal, ellers varmetabsramme | § 283, § 284 |
| Ændringer i eksisterende hus | Tabel 4 gælder, hvis det er rentabelt (besparelse × levetid / investering > 1,33). Huset regnes som brugt hele året | § 285, § 275 |
| Massive ydervægge | U < 0,50 tilladt, hvis det samlede transmissionstab ikke bliver større | § 286 |
| Termisk indeklima | Beregning i de kritiske rum, DRY 2013. Forenklet beregning tilladt for boliger. Ingen undtagelse for sommerhuse | § 386 |
| Dagslys | 10 %-reglen (korrigeret) eller 300 lux på halvdelen af gulvarealet i halvdelen af dagslystimerne | § 379 |
| Klimapåvirkning | Tilbygning til sommerhus med opvarmet areal < 250 m² er undtaget | § 297, stk. 3 |
| Ventilation | Samme krav som enfamiliehuse | Kap. 22 |

**Det gælder ikke for projektet:** energiramme (§ 259), Eref-krav til vinduer (§ 258), tæthedskrav (§ 263), dimensionerende transmissionstab (§ 264), de generelle tilbygningsregler (§ 271-273: 22 %-reglen, tabel 2) og ombygningstabellen (§ 279, tabel 3).

Regelteksten er kontrolleret på bygningsreglementet.dk, kapitel 11, 18 og 19, den 1. oktober 2026.

## Energi og varmetabsramme

Glasandelen ventes at overstige 30 %, så projektet dokumenteres med en varmetabsramme efter § 284, stk. 2 og DS 418. Projektets samlede transmissionstab i W/K skal være mindre end eller lig med referencerammen.

### Mindstekrav, bilag 2, tabel 4

| Bygningsdel | Krav | Projekteret | Status |
| --- | --- | --- | --- |
| Ydervægge, U [W/m²K] | 0,25 | [afventer opbygning] | |
| Terrændæk / gulv over kryberum, U [W/m²K] | 0,15 | [afventer opbygning] | |
| Loft og tag, U [W/m²K] | 0,15 | [afventer opbygning] | |
| Vinduer, døre, ovenlys, glasvægge, U [W/m²K] | 1,80 | 0,80 (anbefalet) | |
| Skillevæg mod uopvarmet rum, U [W/m²K] | 0,40 | [afventer] | |
| Linjetab fundament [W/mK] | 0,15 | [afventer] | |
| Linjetab vindue/dør-samling [W/mK] | 0,03 | [afventer] | |
| Linjetab ovenlys-samling [W/mK] | 0,10 | [afventer] | |

### 30 %-reglen

| Størrelse | Værdi |
| --- | --- |
| Opvarmet etageareal [m²] | [opmåles i model] |
| Areal af vinduer, døre, ovenlys og glasvægge [m²] | [opmåles i model] |
| Glasandel [%] | [beregnes] |
| 30 %-grænse [m²] | [beregnes] |

### Varmetabsramme (DS 418)

Tabellen udfyldes automatisk fra modellen. Terrændæk og fundament vægtes med 0,625 ved gulvvarme.

| Bygningsdel | 1. Tabel 4, glas som tegnet [W/K] | 2. Referenceramme, glas = 30 % [W/K] | 3. Projekteret [W/K] |
| --- | --- | --- | --- |
| Vinduer og glaspartier | | | |
| Yderdøre | | | |
| Ydervægge | | | |
| Tag | | | |
| Terrændæk (× 0,625) | | | |
| Fundament (× 0,625) | | | |
| Vinduessamlinger | | | |
| **Samlet transmissionstab** | | **ramme** | |

## Dimensionerende varmetab og varmeanlæg

Det dimensionerende varmetab beregnes rum for rum efter DS 418 ved −12 °C ude og 20 °C inde (badeværelser 24 °C). Det bruges til at dimensionere varmepumpen og tjekke gulvvarmen, så kunden får det varmt nok uden at betale for et unødigt stort varmetab.

| Rum | Areal [m²] | Transmission [W] | Ventilation [W] | I alt [W] | W/m² |
| --- | --- | --- | --- | --- | --- |
| Ophold / spisestue / køkken (A-hus) | | | | | |
| Soveværelse 1. sal (A-hus) | | | | | |
| Hal (mellembygning) | | | | | |
| Soveværelser (blok B) | | | | | |
| Soveværelse (sydfløj) | | | | | |
| Bad, sauna, fitness | | | | | |
| **Hele huset** | | | | | |

- **Kuldenedfald ved A-gavlen.** Glasgavlen er ca. 7 m høj. Ved U ≈ 0,8 er risikoen lille, men den vurderes for opholdszonen. Hvis det er nødvendigt, lægges gulvvarme eller en konvektor langs glasset.
- **Varmepumpe.** Effekt fastsættes ud fra det samlede varmetab plus varmt brugsvand (DS 469). Elmåler kræves ved forbrug > 3.000 kWh/år (§ 327).
- **Sauna** regnes som et separat rum med egen el-opvarmning og indgår ikke i varmepumpens dimensionering.

## Termisk indeklima

Overophedning er projektets største risiko og løses med solafskærmning og udluftning, ikke med køling. Alle opholdsrum simuleres time for time over et år, så det kritiske rum findes ved beregning og ikke ved antagelse.

| Kriterium | Grænse | Kilde |
| --- | --- | --- |
| Timer over 27 °C i brugstiden | ≤ 100 h/år | BR18-vejledning om termisk indeklima |
| Timer over 28 °C i brugstiden | ≤ 25 h/år | BR18-vejledning om termisk indeklima |
| Soveværelser om natten (kl. 22-07) | Rapporteres særskilt | Kvalitetsmål, ikke lovkrav |
| Adaptiv komfort | Kategori II | DS/EN 16798-1, kvalitetsmål |

**Metode:** dynamisk simulering i EnergyPlus via Honeybee med DRY 2013. Interne belastninger efter SBi-anvisning 213 for boliger, infiltration og vinduesudluftning styret af inde- og udetemperatur. Skorstenseffekt og tværventilation i A-huset regnes med AirflowNetwork. Træer medtages som skygge, og der køres en følsomhedsberegning uden træer.

### Tiltagstrappe pr. kritisk rum (timer over 27 °C / over 28 °C)

| Scenarie | 1. sal A-hus | Ophold A-hus | Hal | Sovev. sydfløj | Sovev. blok B |
| --- | --- | --- | --- | --- | --- |
| 0. Som tegnet: 3-lags glas g 0,50, ingen afskærmning | | | | | |
| 1. + udvendig solafskærmning mod SV (Fc 0,3) | | | | | |
| 2. + oplukkelige vinduer i gavltop | | | | | |
| 3. + automatisk natkøling, hal og ovenlys | | | | | |
| 4. + solafskærmende glas (g 0,35) i SV-gavl | | | | | |

## Dagslys

Kravet i § 379 er let at opfylde med projektets glasarealer. Afsnittet dokumenterer derfor også dagslyskvaliteten og blændingsrisikoen.

**Lovkrav (§ 379), beboelsesrum og køkken:** 300 lux på mindst halvdelen af gulvarealet i mindst halvdelen af dagslystimerne, eller glasareal ≥ 10 % af gulvarealet korrigeret efter vejledningen.

| Rum | 300 lux-krav [% af gulv] | sDA 300/50 [%] | UDI [%] | Blænding [% af timer] | Opfyldt |
| --- | --- | --- | --- | --- | --- |
| Ophold / spisestue (A-hus) | | | | | |
| Køkken (A-hus) | | | | | |
| Soveværelse 1. sal | | | | | |
| Hal | | | | | |
| Soveværelser (blok B, sydfløj) | | | | | |

- **Dagslysautonomi og nyttigt dagslys** (DA, sDA, UDI): hvor meget af året rummet klarer sig uden kunstlys, og hvor der er for meget lys.
- **Blænding** (DGP) ved SV-gavlen og under ovenlyset i hallen.
- **Udsyn og soltimer** efter EN 17037.

**Afvejning mod overophedning.** Solafskærmende glas med lav g-værdi sænker også lystransmittansen. Hvert scenarie fra afsnittet om termisk indeklima vises derfor i én figur med timer over 27 °C mod sDA.

## Ventilation

Naturlig ventilation er tilladt for sommerhuse og har ingen energimæssig konsekvens for dokumentationen. Kravene i kapitel 22 gælder som for enfamiliehuse.

| Krav | Værdi | Hjemmel |
| --- | --- | --- |
| Frisklufttilførsel | 0,30 l/s pr. m² opvarmet etageareal | § 443 |
| Køkken | Emhætte med afkast til det fri | § 443 |
| Bad og toilet | Udsugning (mekanisk eller naturligt aftræk) | § 443 |
| Naturlig eller hybrid ventilation | Tilladt i enfamiliehuse | § 446 |
| Mekanisk anlæg, hvis valgt | Varmegenvinding ≥ 80 %, SEL ≤ 1.000 J/m³ | § 435, § 438 |

- **Sauna** skal have tilstrækkelig udsugning og friskluft efter leverandørens anvisning.
- **Tværventilation og skorstenseffekt** i A-huset bruges både til luftkvalitet og til sommerkøling.
- **Ovenlyset i hallen** modelleres som en åbning i en lodret flade i lanternen, hvis det er oplukkeligt.

## Klimapåvirkning (LCA)

Tilbygningen forventes undtaget fra LCA-kravet, fordi tilbygninger til sommerhuse med et opvarmet etageareal under 250 m² er undtaget (§ 297, stk. 3). Det er en forudsætning, at tilbygningens opvarmede areal bekræftes under 250 m².

Til orientering er grænseværdierne i § 298: 4,0 kg CO₂-ækv./m²/år for sommerhuse under 150 m² og 6,7 for sommerhuse på mindst 150 m². Byggeprocessen (A4-A5) må højst udlede 1,5.

## Energiforsyning

- **Elmåler** på varmepumpen, hvis elforbruget overstiger 3.000 kWh/år (§ 327).
- **Funktionsafprøvning** af varmepumpe og solceller før ibrugtagning (§ 327a) og af varmeanlægget (§ 391).
- **Drifts- og vedligeholdelsesmanual** før ibrugtagning (§ 328, § 392).
- **Varmeanlæg** projekteres efter DS 469 (§ 387).
- **Krav om vedvarende energi** til opvarmning (§ 293) gælder ikke for sommerhuse (§ 283, stk. 2).
- **Jordvarme** kræver desuden tilladelse efter jordvarmebekendtgørelsen.

## Risikovurdering og fokus i den videre proces

Overophedning og opgørelsen af 30 %-reglen er de to punkter, der kan ændre projektet. Resten er detaljering.

| Emne | Risiko | Fokus fremover |
| --- | --- | --- |
| Overophedning i A-hus, hal og SV-soveværelser | Høj | Udvendig solafskærmning, oplukkelige vinduer i gavltop, natkøling |
| Opgørelse af 30 %-reglen for tilbygningen | Middel | Afklares med kommunen og BR-vejledningen før ansøgning |
| Varmetabsramme ved stort glasareal | Middel | 3-lags glas U ≈ 0,8, ψ ≤ 0,03; ekstra isolering i tag og terrændæk |
| Blænding ved SV-gavl og ovenlys | Middel | Blændingsanalyse; afskærmning, der også tager lavt eftermiddagslys |
| Kuldenedfald ved høj glasgavl | Lav | Vurderes i varmetabsberegningen |
| Ændringer i eksisterende hus (§ 285) | Lav-middel | Rentabilitetsberegning for de bygningsdele, der røres |
| Træer som solafskærmning | Middel | Dokumentationen må ikke afhænge af træer, der kan fældes |

## Uafklarede punkter og nødvendige input

- **Kommunen/BR-vejledningen:** Opgøres 30 %-reglen på tilbygningens areal eller hele husets?
- **BBR:** Er huset registreret som sommerhus, og ligger grunden i sommerhusområde?
- **Kommunen:** Accepteres dynamisk simulering (EnergyPlus) som dokumentation efter § 386?
- **Arkitekt:** DWG eller 3D-model, konstruktionsopbygninger, vinduesdata (Uw, Ug, g, LT, ψ, oplukkelige arealer), solafskærmningens geometri, afgrænsning af eksisterende/nyt/ændret.
- **Bygherre:** varmeanlæg (jordvarme, luft/vand, gulvvarme, brændeovn) og brug af huset.

## Forudsætninger og metode

Alle tal i notatet kommer fra én parametrisk model og ét samlet resultatdatasæt, så beregningerne kan genkøres, når arkitekturen ændres. AI bruges kun til at formulere teksten ud fra resultaterne. Regelkontrol og tal er almindelig beregning, og en ingeniør kontrollerer og underskriver.

| Forudsætning | Værdi |
| --- | --- |
| Klimadata | DRY 2013, kalenderår 2010 (§ 386); kendt fejl i dugpunktsfeltet i EPW-filen rettes |
| Robusthedstest | Dansk Referenceår 2025 / fremtidsklima, kun som følsomhed |
| Interne belastninger | SBi-anvisning 213, boliger |
| Dimensionerende temperaturer | −12 °C ude; 20 °C inde (bad 24 °C) |
| Termisk simulering | EnergyPlus via Honeybee (Ladybug Tools); AirflowNetwork til naturlig ventilation |
| Dagslys | Radiance via Honeybee: 300 lux-metoden (EN 17037), DA, sDA, UDI, årlig blænding |
| Varmetab | DS 418; arealer direkte fra modellen |
| Validering | Intern sammenligning mod BSim / Be18 på typehuse |

## Bilag A – Relevante krav fra BR18

| § | Emne | Ny tilbygning | Ændringer i eksist. hus |
| --- | --- | --- | --- |
| § 250 | Formål: unødigt energiforbrug undgås | Gælder | Gælder |
| § 255-256 | Beregningsforudsætninger, DS 418, kuldebroer | Gælder | Gælder |
| § 257-279 | Energiramme, Eref, tæthed, § 264, generelle tilbygnings- og ombygningsregler | Gælder ikke (§ 283, stk. 2) | Gælder ikke (§ 283, stk. 2) |
| § 283 | Tabel 4: U-værdier og linjetab | Gælder | Via § 285 |
| § 284 | 30 %-reglen; varmetabsramme | Gælder | Via § 285 |
| § 285 | Ombygning: tabel 4, hvis rentabelt | – | Gælder |
| § 286 | Massive ydervægge U < 0,50 | Mulighed | Mulighed |
| § 293-295 | Vedvarende energi, bygningsautomatik | Gælder ikke | Gælder ikke |
| § 297-298 | Klimapåvirkning (LCA) | Undtaget, hvis < 250 m² | – |
| § 325-328 | Solceller, varmepumpe, elmåler, D&V | Gælder | Gælder |
| § 379 | Dagslys i beboelsesrum og køkken | Gælder | Nye og ændrede rum |
| § 385-386 | Termisk indeklima, DRY 2013 | Gælder | Gælder |
| § 387-392 | Varmeanlæg efter DS 469, D&V | Gælder | Gælder |
| § 420-452 | Ventilation, boliger | Gælder | Gælder |
