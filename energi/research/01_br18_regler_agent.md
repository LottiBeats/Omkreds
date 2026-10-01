# Research 1 – Danske regler for energi-/indeklimanotater (enfamiliehuse og sommerhuse)

> **OBS (tilføjet efter kontrol mod bygningsreglementet.dk 2026-10-01):** Denne rapport bygger på søgeresultater.
> To fund holdt ikke: (1) Be18/SBi 213 er stadig krævet i den gældende tekst – ingen ændring pr. 29. maj 2026 fundet;
> (2) LCA-trappen 2027/2029 står ikke i den gældende § 298. Se `03_br18_verificeret.md` for de kontrollerede regler.

**Formål:** Sikre at en parametrisk Rhino/Grasshopper + Ladybug Tools-pipeline med AI-genereret notat ikke overser krav eller dokumentationstrin.
**Dato for research:** 2026-10-01

---

## 0. Metode og forbehold (LÆS FØRST)

- **WebFetch var blokeret** af netværks-proxyen for alle relevante domæner (bygningsreglementet.dk, retsinformation.dk, byggeriogenergi.dk, bolius.dk, build.dk, rockwool.com, elov.dk, kommunale sider). Primærteksterne kunne derfor **ikke læses direkte**.
- Alle påstande herunder bygger på **sammendrag fra WebSearch** (søgemaskinens uddrag af de anførte URL'er) og er markeret med kilde-URL. Sammendragene var i flere tilfælde **modstridende** (fx U-værdier i Bilag 2, tabel 2). Det er markeret.
- Markering:
  - **[V]** = bekræftet af mindst én søgning med entydigt sammendrag fra en primærkilde (bygningsreglementet.dk/sbst.dk/retsinformation) eller flere enslydende kilder.
  - **[U]** = usikkert/modstridende/kun sekundærkilde. **Skal verificeres mod gældende BR-tekst før det bruges i pipelinen.**
  - **[B]** = baggrundsviden (ikke verificeret i denne research).
- **Anbefaling:** Før pipelinen bruges i produktion, skal alle tal i afsnit 1–7 tjekkes manuelt mod den **gældende konsoliderede version** på https://bygningsreglementet.dk (BR18 er ændret mange gange, senest juli 2025 og (sandsynligvis) 29. maj 2026). Gem versionsnummer/dato på BR-teksten i hvert notat.

---

## 1. BR18 kap. 11 – Energiforbrug

### 1.1 Energiramme for nye boliger (§§ 250–266)

| Krav | Værdi | Status | Kilde |
|---|---|---|---|
| Energiramme boliger (§ 259) | **30,0 kWh/m²·år + 1.000 kWh/år / A** (A = opvarmet etageareal) | [V] | https://bygningsreglementet.dk/Tekniske-bestemmelser/11/Krav/280_282?Layout=ShowAll ; https://byggeriogenergi.dk/sites/default/files/download/2024-12/VE-Kvikguide-BR18-DK_0.pdf |
| Frivillig lavenergiklasse | ca. **27 kWh/m²·år + 800/A** og tæthed 0,7 l/s·m² | [U] tal for "+800/A" ikke bekræftet; 27 og 0,7 nævnt | https://prembyg.dk/index.php/2026/08/10/ny-byggelov-2027-br27-nulemissionsbygninger-solenergi-lavenergiklasse/ ; https://www.building-supply.dk/announcement/view/95439/bygningsreglementet_2018_og_energiklasse_2020 |
| Tæthed nybyggeri (§ 263) | **1,0 l/s·m²** opv. etageareal ved 50 Pa (lavenergiklasse 0,7) | [V/U] – kilder angiver begge tal, 1,0 = standardkrav | https://eksempelsamling.bygningsreglementet.dk/fokus_taethed/0/56 ; https://ljungdahl.dk/forside/brancher/toemrer/dampspaerre/br18/ |
| Trykprøvning | DS/EN ISO 9972 (blower door) | [V] | https://dtks.dk/trykproevning-reglement/ |
| Tæthedsdokumentation ved færdigmelding | Kun nybyggeri af **helårsboliger** (ikke sommerhuse) | [V] (kommunal vejledning) | https://www.rksk.dk/Files/Files/Borger/Bolig-byggeri-flytning/BR18%20Vejledning%20ved%20ans%C3%B8gning%20og%20f%C3%A6rdigmelding.pdf |
| Mindste varmeisolering nybyggeri (Bilag 2, tabel 1) | Ydervæg 0,30; tag/loft 0,20 W/m²K; linjetab fundament 0,40 W/mK | [U] – kun sekundær kilde | https://rockwool.dk/vaerd-at-vide/bygningsreglement/projekttyper/nybyggeri |
| Kælder/opvarmet areal (§ 266) | Opvarmet kælder skal indgå i opvarmet etageareal/energiberegning | [U] | https://www.bygningsreglementet.dk/Historisk/BR18_Version7/Tekniske-bestemmelser/11/BRV/Energiforbrug/Kap-1_6?Layout=ShowAll |
| VE-fradrag (solceller/vind) | Fra (forventet) 29.5.2026: max **25 kWh/m²·år** kan fratrækkes i energirammen | [U] – fra høringsudkast | https://www.energiforumdanmark.dk/nyheder/17-02-2026-i-hoering-aendring-af-bekendtgoerelse-om-bygningsreglement-2018/ |

**Beregningsværktøj:** Be18 (SBi-anvisning 213 / BUILD) har været obligatorisk. **Fra 29. maj 2026 er Be18 ikke længere obligatorisk**; energirammen skal beregnes efter en ny metodebeskrivelse (BUILD, baseret på europæiske standarder) som er **bilag til bygningsreglementet**, og implementeringen er dokumenteret i et regneark på SBST's hjemmeside. [V]
- https://www.sbst.dk/nyheder/2025/ny-metode-til-beregning-af-bygningers-energibehov
- https://www.sbst.dk/materialer/2026/metode-for-beregning-af-bygningers-energimaessige-ydeevne-epbd
- **Konsekvens for pipelinen:** Pipelinen kan principielt implementere metoden selv, men skal kunne validere mod SBST's referenceregneark. [U] Om overgangsregler tillader Be18 for sager ansøgt før/efter skæringsdato er ikke verificeret.

### 1.2 Renoveringsklasser (alternativ ved ombygning/ændret anvendelse)

| Klasse | Boliger | Status | Kilde |
|---|---|---|---|
| Renoveringsklasse 1 | **52,5 kWh/m²·år + 1.650/A** | [V] | https://krav.byggeriogenergi.dk/Renoveringsklasser (via søgesammendrag) |
| Renoveringsklasse 2 | **70,0 kWh/m²·år + 2.200/A** | [V] | samme |

Efter ændringen 1. juli 2025 kan energikravet ved **ændret anvendelse** opfyldes med **renoveringsklasse 2** i stedet for energirammen [V/U]: https://www.danskindustri.dk/globalassets/medlemsforeninger/di-ejendom/25-10-2024-di-ejendoms-konkrete-bemarkninger-i-horingsskema-om-andringer-af-br-18-som-folge-af-tillagsaftale-af-30.-maj-2024.pdf?v=260517

### 1.3 Ændret anvendelse (§§ 267–270)

- § 267: Ved ændret anvendelse, der medfører **væsentligt større energiforbrug** (fx sommerhus → helårsbolig, uopvarmet → opvarmet), skal energikravene opfyldes via energiramme (§§ 259–266) **eller** U-værdikravene i § 268 (Bilag 2, tabel 2) — og efter 2025 også renoveringsklasse 2. [V/U] https://www.retsinformation.dk/eli/lta/2019/1399 (via søgesammendrag); DI-høringsdokument ovenfor.
- § 268: U-værdikrav (Bilag 2, tabel 2) forudsætter at samlet areal af vinduer/yderdøre/ovenlys/glasvægge/glastage **højst er 22 % af opvarmet etageareal**. [V] https://www.bygningsreglementet.dk/historisk/br18_version3/tekniske-bestemmelser/11/krav/?Layout=ShowAll
- **NB:** §§ 267–272 blev **omformuleret pr. 1. juli 2025** (ændringsbekendtgørelse BEK nr. 271 af 2025). Den præcise nye ordlyd kunne ikke hentes. [U] https://www.retsinformation.dk/eli/lta/2025/271/pdf
- Ændring fra sommerhus til helårsbolig kræver desuden planlovsmæssig tilladelse (ikke en BR-sag alene). [B] https://www.borger.dk/bolig-og-flytning/Ejerbolig/Sommerhus

### 1.4 Tilbygninger (§§ 271–273) – helårshuse

- § 271: Tilbygninger skal overholde energirammen. Efter 2025-ændringen: når energirammen bruges for tilbygningen gælder den **kun for tilbygningen, men rammens størrelse beregnes ud fra bygningens samlede areal** (dvs. 1.000/A-tillægget beregnes med samlet A). [U] – fra DI-høringsdokument/udkast; skal verificeres i endelig tekst. https://www.danskindustri.dk/globalassets/medlemsforeninger/di-ejendom/25-10-2024-di-ejendoms-konkrete-bemarkninger-i-horingsskema-om-andringer-af-br-18-som-folge-af-tillagsaftale-af-30.-maj-2024.pdf?v=260517
- § 272: Alternativt **varmetabsramme**: tilbygningens varmetab må ikke blive større end hvis U-værdikravene i § 268 (Bilag 2, tabel 2, 22 % vinduer) var opfyldt. Varmetabsrammen omfatter **kun tilbygningen**, men **50 % af det tidligere varmetab gennem den del af eksisterende facade, som tilbygningen dækker**, må medregnes i rammen. [V] https://www.bygningsreglementet.dk/Historisk/BR18_Version1/Tekniske-bestemmelser/11/Krav/271_273
- § 273: Vinduer i tilbygningen kan i varmetabsrammen indregnes som de **faktiske vinduer eller som vinduer med U = 1,2 W/m²K** [V – men formuleringen er tvetydig i sammendraget; tjek original]. samme kilde.
- U-værdier Bilag 2, tabel 2 (tilbygning, rum > 15 °C): ydervæg **0,15**, tag/loft **0,12**, terrændæk **0,10** W/m²K (ovenlyskupler 1,4). [U – modstridende kilder; en kilde nævner ydervæg 0,18] https://www.bygningsreglementet.dk/bilag/b2/bilag_2/?Layout=ShowAll
- Referencebygningen i varmetabsrammen (helårs-tilbygning): reference-U-værdier fra tabellen og vindues-/dørareal = **22 % af opvarmet etageareal**. [U] https://www.vinduesindustrien.dk/fileadmin/documents/brochurer/Krav_og_Konsekvenser-7_PRINT.pdf
- Varmetabsramme beregnes efter **DS 418** (transmissionsarealer, transmissionstab). [V] https://nextworld.dk/tin/index.php/dk/manualer/varme/77-krav-til-varmetabsramme-iht-br18

### 1.5 Ombygninger (§§ 274–279)

- § 274: Ved ombygning skal energibesparelser gennemføres **i det omfang de er rentable** og ikke medfører risiko for fugtskader. [V] https://sparenergi.dk/skal-du-renovere-din-bolig/bygningsreglementets-energikrav/rentabilitet-i-bygningsreglementet
- § 275: Rentabel når **(årlig besparelse × levetid) / investering > 1,33**. Kun materialer og arbejdsløn til selve energibesparelsen medregnes (ikke tagdækning, stillads mv.). Er hele tiltaget ikke rentabelt, skal mindre tiltag undersøges. [V] samme + https://www.bygningsreglementet.dk/media/ji5l1byv/vejledning-ofte-rentable-konstruktioner_br18_januar21.pdf
- Krav ved udskiftning/ombygning efter Bilag 2 (tabel 2/3) – "ofte rentable konstruktioner"-vejledningen kan bruges som opslag. [V] samme vejledning.
- Vinduer ved udskiftning/ombygning (§ 257): Eref ≥ **0 kWh/m²·år** for facadevinduer/glasydervægge, ≥ **10 kWh/m²·år** for ovenlys/glastage. Eref = 196,4·g_w − 90,36·U_w (facade) / 345·g_w − 90,36·U_w (ovenlys). [V/U – formel og grænser fra vinduesbranchens quickguide] https://www.vinduesindustrien.dk/fileadmin/documents/brochurer/112994_Quickguide_vinduer_148_5x210mm_laesevenlig.pdf

### 1.6 Sommerhuse (§§ 283–286) – kernen for pipelinen

| § | Indhold | Status | Kilde |
|---|---|---|---|
| § 283 | Sommerhuse, campinghytter og lign. ferieboliger **samt tilbygninger hertil** skal overholde U-værdier og linjetab i **Bilag 2, tabel 4** | [V] | https://www.bygningsreglementet.dk/Historisk/BR18_Version5/Tekniske-bestemmelser/11/Krav/283_286 |
| § 284 | Tabel 4-værdierne gælder **under forudsætning af** at samlet areal af vinduer og yderdøre inkl. ovenlys/ovenlyskupler, glasydervægge, glastage og lemme mod det fri **højst udgør 30 % af det opvarmede etageareal**. Overskrides 30 %, eller ønskes fleksibilitet → **varmetabsramme** der viser at varmetabet ikke bliver større end ved § 283-kravene | [V] | samme + https://byggeriogenergi.dk/br18-opslagsvaerk/krav-til-sommerhuse/tilbygning-til-sommerhus |
| § 285 | Ved **ombygning, andre forandringer og udskiftning** gælder § 283-kravene **hvis de er rentable** (rentabilitet som § 275). Ved rentabilitetsvurderingen betragtes ferieboligen **som i brug som bolig også i vinterhalvåret** | [V] | https://www.bygningsreglementet.dk/Historisk/BR18_Version6/Tekniske-bestemmelser/11/Krav/283_286 |
| § 286 | Massive ydervægge (træ, letbeton, blokke) med **U < 0,50 W/m²K** kan bruges, hvis samlet transmissionstab ikke overstiger tabel 4-niveauet | [V/U] | søgesammendrag af BR18 version 8: https://www.bygningsreglementet.dk/historisk/br18_version8/tekniske-bestemmelser/11/krav/?Layout=ShowAll |

**Bilag 2, tabel 4 (sommerhuse)** [V/U – flere enslydende sekundærkilder, primær ikke læst]:
- Ydervægge og kældervægge mod jord: **0,25 W/m²K**
- Loft- og tagkonstruktioner inkl. skunk og flade tage: **0,15 W/m²K**
- Terrændæk, kældergulve mod jord, etageadskillelser over det fri/ventileret kryberum: **0,15 W/m²K**
- Vinduer, yderdøre, ovenlys, glasydervægge, glastage, ovenlyskupler: **1,80 W/m²K**
- Linjetab: fundamenter **0,15 W/mK**; samling ydervæg/vindue-dør **0,03 W/mK**; samling tag/ovenlys **0,10 W/mK**
- Kilder: https://bygningsreglementet.dk/Historisk/BR18_Version1/Bilag/B2/Bilag_2/Tabel_4 ; https://www.rockwool.com/dk/downloads-og-tools/bygningsreglement/projekttyper/sommerhuse/

**Vinduer i sommerhuse:** Energiklasse B / **Eref ≥ −17 kWh/m²·år** accepteres (sommerhuse er undtaget fra A-krav). [V/U] https://www.vinduesindustrien.dk/fileadmin/documents/brochurer/112994_Quickguide_vinduer_148_5x210mm_laesevenlig.pdf ; https://byggeriogenergi.dk/br-overblikket/krav-til-sommerhuse/udskiftning-af-vinduer-eller-yderdoere

#### 1.6.1 30 %-reglen og varmetabsrammen ved TILBYGNING til eksisterende sommerhus

Det fremgår af Byggeri og Energis (Energistyrelsen-finansieret) opslagsværk [V]:
1. **30 %-reglen opgøres for tilbygningen alene**: "Hvis det samlede areal af vinduer, yderdøre, ovenlysvinduer m.m. **i tilbygningen** udgør mindre end 30 pct. af det samlede opvarmede etageareal **i tilbygningen**, så kan energikravene opfyldes ved at overholde U-værdi-kravene i § 283." https://byggeriogenergi.dk/br-overblikket/krav-til-sommerhuse/tilbygning-til-sommerhus
2. Er glasandelen > 30 % (eller ønskes fleksibilitet) → **varmetabsramme** for tilbygningen: dokumentér at tilbygningens transmissionstab (DS 418) ≤ referencetilbygningens tab med tabel 4-U-værdier/linjetab. [V] samme kilde.
3. Ved tilbygning må **50 % af det tidligere varmetab gennem den del af eksisterende facade, som tilbygningen dækker**, medregnes i rammen. [V for § 272 helårs-tilbygninger; **[U]** om det gælder direkte for sommerhus-tilbygninger – én sekundærkilde (vinduesindustrien) anfører det også for sommerhuse]. https://www.vinduesindustrien.dk/fileadmin/documents/brochurer/Krav_og_Konsekvenser-7_PRINT.pdf
4. **Referencebygningens glasareal [U – VIGTIG at verificere]:** Kilderne er uklare om referencen for sommerhuse sættes til de faktiske glasarealer begrænset til 30 % af etagearealet (med U = 1,80) – hvilket er den naturlige læsning af § 284 – eller noget andet. Vejledningen til kap. 11 (kap. 6 om varmetabsramme) bør læses: https://www.bygningsreglementet.dk/Historisk/BR18_Version3/Tekniske-bestemmelser/11/BRV/Energiforbrug/Kap-6_0
5. **Mindstekrav:** Selv med varmetabsramme skal mindste-varmeisolering overholdes (BR-vejledning: "varmetabsramme sammen med overholdelse af mindstekrav til varmeisolering"). Hvilken tabel der er mindstekrav for sommerhuse (tabel 1 eller særlige værdier) er **[U]**.
6. Vinduer i sommerhustilbygningen skal fortsat opfylde §§ 257/258 (Eref-krav, sommerhuse klasse B/−17). [U]
7. **LCA:** Tilbygning < 250 m² til sommerhus er undtaget (se afsnit 2). [V]

**Pipeline-logik (forslag):**
```
glasandel_tilb = sum(A_vindue+dør+ovenlys+glasvæg i tilbygning) / A_opv_tilbygning
hvis glasandel_tilb ≤ 0,30 og alle U/ψ ≤ tabel 4 → OK (§283/284)
ellers → varmetabsramme: H_T,proj(tilb) ≤ H_T,ref(tilb) + 0,5·H_T,eksist.facade_dækket
         (H_T,ref med tabel 4-værdier og glasareal = min(faktisk, 30 % af A_opv_tilb)  [U])
       + kontrol af mindstekrav + Eref på vinduer
```

#### 1.6.2 Ombygning af eksisterende sommerhus (fx nye vinduer / glasvægge)

- Udskiftning af vinduer/yderdøre i sommerhus: skal opfylde tabel 4 (**U ≤ 1,80**) hvis rentabelt (§ 285 → § 275), og klasse B/Eref ≥ −17. [V] https://byggeriogenergi.dk/br-overblikket/krav-til-sommerhuse/udskiftning-af-vinduer-eller-yderdoere ; https://eksempelsamling.bygningsreglementet.dk/vinduers_energibalance_ved_udskiftning
- Rentabilitet regnes med **helårsbrug** som forudsætning (§ 285). [V]
- Nye/større glaspartier ved ombygning: BR18 har ikke en eksplicit "30 %-regel" for ombygning; ved udvidelse af glasareal bør det dokumenteres at varmetabet ikke øges, eller at ombygningen behandles som "anden forandring" med rentable tiltag. **[U] – ingen entydig kilde fundet; kommunal praksis varierer.** Anbefaling: lav altid en varmetabsramme-sammenligning før/efter ved øget glasareal.
- Ved ombygning skal der også tænkes på **termisk indeklima (§ 381 blænding/overophedning)** og **kuldenedfald** ved høje glasvægge (se afsnit 6).

---

## 2. Klimapåvirkning / LCA (§§ 297–298)

| Bygningstype (nybyggeri) | 2025 (1/7) | 2027 | 2029 | Status | Kilde |
|---|---|---|---|---|---|
| Fritliggende enfamiliehuse, række-/kæde-/dobbelthuse, stuehuse | **6,7** | **6,0** | **5,4** kg CO₂e/m²·år | [V] | https://www.sbst.dk/byggeri/baeredygtigt-byggeri/videncenter-for-bygningers-klimapaavirkning/faq ; https://jurainfo.dk/artikel/nye-skaerpede-klimakrav-i-br18-hvad-betyder-de-for-byggeriet |
| Sommerhuse/ferieboliger < 150 m² | **4,0** | **3,6** | **3,2** | [V] | samme |
| Sommerhuse/ferieboliger ≥ 150 m² | **6,7** | **6,0** | **5,4** | [V] | samme |
| Byggeproces (A4–A5), selvstændig grænse | **1,5** | ? | **1,1** | [V/U – 2027-værdi ikke fundet; om den gælder alle bygningstyper inkl. enfamiliehuse er sandsynligt men ikke 100 % verificeret] | https://www.sbst.dk/Media/638731490173267243/VCBK_Guide_Byggeprocessen_fra_1._juli_2025-a[1].pdf |

- Krav gælder for byggetilladelser ansøgt **fra 1. juli 2025** (BEK nr. 271/2025). [V] https://www.retsinformation.dk/eli/lta/2025/271/pdf ; https://www.mazanti.dk/en/news/skaerpede-klimakrav-i-bygningsreglementet-vaesentlige-aendringer-til-br18-er-traadt-i-kraft-1-juli-2025/
- **Undtagelse – tilbygninger:** Tilbygninger med opvarmet etageareal **< 250 m²** til stuehuse, enfamiliehuse, række-/kæde-/dobbelthuse og sommerhuse er **undtaget** både fra grænseværdi og dokumentation. Tilbygninger ≥ 250 m² skal overholde grænseværdien for den bygningstype, de tilbygges. [V] https://www.sbst.dk/byggeri/baeredygtigt-byggeri/videncenter-for-bygningers-klimapaavirkning/faq ; https://konstruktoeren.dk/lca-ved-tilbygning/
- Uopvarmede bygninger < 50 m² undtaget. [V/U] https://www.innova-law.com/nyheder/skaerpet-lca-krav-pr-1-juli-2025/
- Krav til LCA for **alt nybyggeri** (uanset størrelse) siden 1.1.2023. [V] https://denmark.dlapiper.com/da/nyhed/aendringer-til-klimakrav-ved-nybyggeri
- Værktøj: **LCAbyg er ikke obligatorisk**; andre værktøjer må bruges hvis de følger BR18's beregningsregler. Data: generiske data eller EPD'er. [V] https://www.danskindustri.dk/brancher/di-byggeri/viden-og-vejledning/baredygtighed-esg/baeredygtighed-i-byggeriet/faq-om-br-18-og-klimaberegning/
- Indsendes **ved færdigmelding** (mangler blokerer ibrugtagningstilladelse). [V/U – kilde fra før 2025; tjek om 2025-ændringen kræver foreløbig beregning ved ansøgning] https://denmark.dlapiper.com/da/nyhed/aendringer-til-klimakrav-ved-nybyggeri
- Ombygning og ændret anvendelse: ingen LCA-krav fundet. [U]
- **Pipeline:** LCA er et separat modul (mængder fra Rhino-geometri → LCAbyg/egen motor). Notatet skal angive: bygningstype, areal-kategori (<150/≥150 m² for sommerhuse), gældende årstal for grænseværdi (bestemt af **ansøgningsdato**), byggeproces-delen separat.

---

## 3. Termisk indeklima (kap. 19, §§ 385–386 + vejledning)

- § 385: Bygninger skal have et sundheds- og komforttilfredsstillende termisk indeklima. [V] https://bygningsreglementet.dk/Tekniske-bestemmelser/19/Krav/386
- **Boliger:** Krav normalt opfyldt når det ved beregning eftervises **højst 100 timer/år > 27 °C og højst 25 timer/år > 28 °C** (brugstid). Forudsætning: mulighed for at åbne vinduer/udlufte. [V] https://www.glasfakta.dk/viden/vinduer/doere/energi-og-miljoe/indeklima-termisk-indeklima-i-henhold-til-br18/
- **Dokumentation:** ved beregning af forholdene i de **kritiske rum**, med **DRY 2013 (kalenderår 2010)**. **For boliger kan en forenklet beregning anvendes** (SBi-anvisning 213/Be18's overtemperaturberegning). [V] samme + https://www.bygningsreglementet.dk/media/ncpjhogw/vejledning-dokumentation-af-bygningsreglementets-tekniske-bestemmelser-i-forbindelse-med-frdigmeldi-2025.pdf
- **Be18-begrænsning:** Be18's forenklede metode regner typisk boligen som én zone, ikke det enkelte kritiske rum. Ved store sydvendte/vestvendte glaspartier bør dynamisk enkeltrumssimulering bruges. [U – fagpraksis; der findes et studenterprojekt der analyserer den forenklede metodes svagheder] https://buildingdesign.arteliagroup.dk/student-projects/analyse-af-den-forenklede-metode-til-beregning-af-overtemperatur-i-boliger/
- **Værktøjer (EnergyPlus/Honeybee):** BR18 og vejledningen **foreskriver ikke et bestemt program**; BSim og IDA ICE er de hyppigt anvendte. **Der blev ikke fundet nogen officiel godkendelse eller afvisning af EnergyPlus/Honeybee.** [U] Da kravet er "eftervises ved beregning" med DRY 2013, bør EnergyPlus være acceptabelt hvis forudsætningerne dokumenteres; men pipelinen skal kunne levere **fuld forudsætningsliste**, og det anbefales at validere mod BSim/IDA ICE på et par cases. https://www.ladybug.tools/honeybee.html ; https://jodan.dk/simulering-af-indeklima-og-energiforbrug-af-bygninger-i-ida-ice/
- **Vejrdata:** DRY 2013 skal bruges (findes i EPW-format via DMI/BUILD – **[U]** verificér at den rigtige DRY2013-fil, ikke en generisk Copenhagen-EPW, bruges).
- **Forudsætninger, der skal dokumenteres** [B/U – vejledningens præcise værdier kunne ikke læses]:
  - Interne laster: Be18/SBi 213 bruger for boliger ca. **5 W/m²** samlet internt tilskud døgnet rundt [B]. (En søgning nævnte 6 W/m²/45 t/uge – det er kontor-forudsætninger, ikke bolig.) https://www.build.aau.dk/til-byggebranchen/software/be18/faq
  - Udluftning: vinduesåbning/natudluftning – én kilde nævner typisk **8 h⁻¹** luftskifte på varmeste dage i kritisk rum (dagligstue) som forudsætning i eksempel. [U] https://historisk.bygningsreglementet.dk/br15_03_id91/0/42 (BR15-kilde)
  - Solafskærmning: kun regnes med hvis den er **fast eller automatisk**; manuel afskærmning bør ikke medregnes [B – typisk praksis, ikke verificeret].
  - Brugstid: boliger 24/7 [B].
- **Sommerhuse:** Om kap. 19-dokumentationskravet gælder fuldt for sommerhuse kunne ikke verificeres entydigt. Én sekundær kilde siger at 27/28 °C-kriteriet også gælder ferieboliger. **[U]** Anbefaling: dokumentér altid.
- **Tilbygninger:** Færdigmeldingsvejledningen 2025 angiver at termisk indeklima "altid skal tjekkes" for enfamiliehuse **og tilbygninger hertil**. [V/U] https://www.bygningsreglementet.dk/media/0o1nbejw/dokumentation-af-bygningsreglementets-tekniske-bestemmelser-i-forbindelse-med-faerdigmelding-af-byggeriet-2025.pdf
- Relevante standarder: DS 474, DS/EN ISO 7730. [V] https://www.glasfakta.dk/viden/vinduer/doere/energi-og-miljoe/indeklima-termisk-indeklima-i-henhold-til-br18/

---

## 4. Dagslys og udsyn (kap. 18, §§ 377–381)

- § 379: Arbejdsrum, opholdsrum i institutioner, undervisningslokaler, spiserum samt **beboelsesrum og køkkener** skal have tilstrækkelig dagslysadgang. [V] https://www.elov.dk/bygningsreglementet/paragraf/379/ (via sammendrag) ; https://www.bygningsreglementet.dk/historisk/br18_version2/tekniske-bestemmelser/18/krav/379_381/
- **Metode A – 10 %-reglen:** glasareal (uden skygge) ≥ **10 % af relevant gulvareal**. Glasarealet **skal korrigeres** for skyggende omgivelser og reduceret lystransmittans iht. "Bygningsreglementets vejledning om korrektioner til 10 pct.-reglen for dagslys". [V] https://www.bygningsreglementet.dk/media/akxpf4xm/vejledning-dagslys-10-pct-regel-tbst_110119-a.pdf
  - Korrektionsfaktorer: **F_LT** (lystransmittans; F_LT = LT_faktisk / LT_ref, LT_ref = **0,75**), **F_VÆG** (vægtykkelse/lysning), **F_OMG** (omgivende bebyggelse, tabel 0°–60° afskærmningsvinkel, faktor 1,00 → 0,50), **F_OH** (udhæng over vindue), **F_SF** (sideskærme), **F_AFS** (fast solafskærmning) m.fl. [V for faktor-navne; præcise tabelværdier ikke læst] samme kilde.
  - Ovenlysets særlige vægtning (fx faktor 1,4) **kunne ikke verificeres**. [U]
  - For boliger er relevant gulvareal = **hele rummets gulvareal**. [V] https://www.belysningsberegner.com/standardtabeller/dagslyskrav-br18/
- **Metode B – 300 lux:** dagslysbelysningsstyrke **≥ 300 lux i mindst halvdelen af det relevante gulvareal i mindst halvdelen af dagslystimerne** (dagslystimer = den halvdel af årets timer med mest dagslys). Beregnes efter principperne i **DS/EN 17037**. [V] https://danvak.dk/dagslysberegning-br18/
  - Svarer (iht. SBi) til **median dagslysfaktor ≈ 2,1 %** for Danmark. [V] https://www.glasfakta.dk/viden/vinduer/doere/lys/belysning/ds-en-17037-dagslysstandarden-introducerer-en-klimabaseret-dagslysfaktor/ ; https://ing.dk/ny-dagslysstandard-hvordan-maaler-man-lige-mindst-300-lux-halvdelen-rummet-halvdelen-dagslystimerne
  - **Vejrdata:** Der findes et særligt datasæt (2001–2010, EnergyPlus-format) til eftervisning af 300 lux-kravet i BR18. [V] https://vbn.aau.dk/en/publications/vejrdata-til-brug-for-eftervisning-af-krav-vedr-dagslys-i-br18-in/ → Pipelinen skal bruge dette datasæt (eller DF-metoden med 2,1 %), ikke DRY2013 ukritisk. [U om hvilket der kræves]
  - Refleksionsfaktorer, grid-højde (0,85 m), kantzone, Radiance-parametre: **ikke verificeret** i BR-vejledning. [U] Typisk praksis efter DS/EN 17037: målepunkter 0,85 m over gulv, grid ≤ 0,5 m, 0,5 m kantzone fra vægge. [B]
- **Ladybug/Honeybee (Radiance)** bruges i branchen til BR18-dagslys (fx MOE, ClimateStudio). Ingen officiel værktøjsgodkendelse findes – kravet er metodebaseret. [U] https://www.xn--bredygtighedsklasse-lxb.dk/Media/637993647574259558/03_Opl%C3%A6g%20om%20dagslys_MOE.pdf
- **Udsyn (§ 380):** rum til længerevarende ophold skal have udsyn [U – paragrafnummer og detaljer ikke verificeret]. DS/EN 17037 har også udsynskriterier. https://www.bygningsreglementet.dk/tekniske-bestemmelser/18/krav/?Layout=ShowAll
- **§ 381:** Vinduer skal udføres/placeres/afskærmes så solindfald ikke giver overophedning, og direkte blænding kan undgås. [V] https://www.bygningsreglementet.dk/historisk/br18_version2/tekniske-bestemmelser/18/krav/379_381/
- **Faldgrube ved tilbygning:** En tilbygning kan reducere dagslyset i eksisterende rum bag den. Disse rum bør også eftervises. [B/U]
- Sommerhuse: ingen undtagelse fundet – behandles som boliger. [U]

---

## 5. Ventilation (kap. 22) – boliger

- Udeluftskifte min. **0,30 l/s pr. m²** opvarmet etageareal (bolig og opholdsrum). [V] https://www.bygningsreglementet.dk/Historisk/BR18_Version7/Tekniske-bestemmelser/22/Krav/443_446
- Udsugning: **køkken 20 l/s**, **bad/wc 15 l/s** (forceret). Bryggers/kælderrum typisk 10 l/s [B]. [V for 20/15] samme.
- **§ 446:** Enfamiliehuse (og sommerhuse [U]) **må ventileres naturligt** eller hybrid (friskluftventiler i ydervæg + naturligt aftræk fra køkken/bad over tag). [V] https://eksempelsamling.bygningsreglementet.dk/ventprincipper ; https://www.windowmaster.dk/ekspertise/nyheder-og-trends/guide-hvad-du-bor-vide-om-naturlig-ventilation-og-br18s-energikrav/
- Mekanisk ventilation med ind- og udblæsning for én bolig: **varmegenvinding ≥ 80 % tør temperaturvirkningsgrad**, **SEL ≤ 1.000 J/m³** ved maks. trykfald. [V/U – paragrafnumre (§§ 447/448) ikke verificeret] https://byggeriogenergi.dk/br18-opslagsvaerk/krav-til-enfamiliehuse/ventilationsanlaeg
- Dimensionering iht. **DS 447**. [V] https://www.genvex.com/videnscenter/byggeloven-br18-og-standarder-for-ventilation
- **Konsekvens:** Naturlig ventilation er lovlig, men gør det meget svært at overholde energirammen (ingen varmegenvinding). [V] WindowMaster-guide ovenfor. Ventilationsstrategien skal være **konsistent** mellem energiramme, termisk indeklima (udluftning) og ventilationsnotat.
- Funktionsafprøvning/indregulering af luftmængder dokumenteres ved færdigmelding. [U] https://www.bygningsreglementet.dk/historisk/br18_version1/tekniske-bestemmelser/11/brv/funktionsafprovning/luftmaengder/

---

## 6. Dimensionerende varmetab (DS 418) og varmeanlæg (DS 469), kuldenedfald

- **DS 418:2011 + Till.1:2020** "Beregning af bygningers varmetab": dimensionerende udetemperatur **−12 °C**. Bruges til transmissionsarealer, transmissionstab og varmetabsramme. [V] https://webstore.ansi.org/preview-pages/DS/preview_M251829CUR.pdf ; https://vbn.aau.dk/da/publications/ds-4182011-beregning-af-bygningers-varmetab/
- **DS 469** (varme- og køleanlæg): dimensionerende varmetab bestemmes efter DS 418 (DS 469 afsn. 6.3). [V] https://www.forsyningen.dk/media/mbpljeqc/installationsvejledning-frederikshavn-varme-a_s.pdf
- Kap. 19 (§§ 385–392) henviser til DS 469 for varmeanlæg. [U for præcis §-nummer]
- **Kuldenedfald:** BR/DS 474 stiller komfortkrav (træk, operativ temperatur 20–24 °C vinter). Der er **ikke fundet en eksplicit BR-regel** om en grænsehøjde for glasfacader; i praksis vurderes kuldenedfald ved glas > ca. 2 m højde, og afhjælpes med lav U-værdi, konvektorer/gulvkonvektorer eller kantvarme. [U – ingen primærkilde fundet] https://byggeriogenergi.dk/sites/default/files/download/2024-01/Guide_indeklima_og_komfort.pdf
  - **Anbefaling:** Notatet bør indeholde en eksplicit kuldenedfaldsvurdering (fx empirisk formel for lufthastighed ved gulv som funktion af glashøjde og Δθ mellem rumluft og indvendig glasoverflade; kriterie fx ≤ 0,15 m/s i opholdszonen iht. DS 474 / DS/EN ISO 7730-kategori). [B]
  - Gulvvarme alene er ofte utilstrækkelig mod kuldenedfald fra meget høje glasvægge. [B]
- Rumvis varmetab efter DS 418 bør leveres i notatet som grundlag for VVS-dimensionering (særligt i sommerhuse med store glasarealer). [B]

---

## 7. Energimærkning, tæthed, færdigmelding, kommunal praksis og kommende ændringer

### 7.1 Energimærkning
- Nybyggeri: energimærke skal foreligge **før ibrugtagning**. [V] https://www.retsinformation.dk/eli/lta/2023/549/pdf (via sammendrag)
- **Sommerhuse er undtaget energimærkning siden september 2017.** [V] https://www.bolius.dk/energimaerkning-af-boliger-17155 . (En kilde hævder at nye sommerhuse alligevel skal mærkes "for at dokumentere BR-overholdelse" – **[U], sandsynligvis fejl**; kommuner kan dog kræve dokumentation af energikrav, jf. https://www.bolius.dk/tilbygning-sommerhus-kan-kommunen-kraeve-energimaerke-88524)
- Nye helårsboliger: energirammeberegning + energimærke indsendes ved færdigmelding. [V] https://www.rksk.dk/Files/Files/Borger/Bolig-byggeri-flytning/BR18%20Vejledning%20ved%20ans%C3%B8gning%20og%20f%C3%A6rdigmelding.pdf

### 7.2 Færdigmelding / kommunens krav
- Officiel vejledning: "Dokumentation af bygningsreglementets tekniske bestemmelser i forbindelse med færdigmelding" (dateret **01.07.2025**, 35 s.). [V] https://www.bygningsreglementet.dk/media/ncpjhogw/vejledning-dokumentation-af-bygningsreglementets-tekniske-bestemmelser-i-forbindelse-med-frdigmeldi-2025.pdf
- Ved ansøgning afgives en **teknisk erklæring** om hvilke kapitler der dokumenteres; ved færdigmelding indsendes dokumentationen. [V] https://www.naestved.dk/media/vknbcg0j/vejledning_byg-teknisk-erklaering-ansoegning-br18_ekstern_v2020-09-24.pdf ; https://aarhus.dk/media/okgl2zai/vejledning-til-10-erklaering-samt-dokumentation-ved-faerdigmeldning.pdf?format=noformat
- Enfamiliehuse/sommerhuse er **ikke omfattet af stikprøvekontrol**, men dokumentationen skal foreligge. [V] samme kilder.
- Typisk dokumentationsliste (enfamiliehus nybyg) [V/U, sammensat fra kommunale vejledninger]: energirammeberegning, energimærke, trykprøvningsrapport, ventilation (luftmængder/indregulering), termisk indeklima-beregning, dagslysdokumentation, LCA (klimaberegning), statik (konstruktionsklasse), brand (brandklasse), fugt, lyd, radon. https://silkeborg.dk/p/Silkeborgdk/Borger/Byggeri/Vejledning-til-dokumentation-frdigmelding-af-enfamiliehuse-mm---Silkeborg-Kommune.pdf ; https://norddjurs.dk/Media/638127638679392064/BR18%20Vejledning%20til%20dokumentation%20ved%20f%C3%A6rdigmelding%20-%20Enfamiliehus%20ol.-%20NORDDJURS%202023.pdf ; https://www.aalborg.dk/mit-liv/min-bolig/byggeri/vejledning-til-dokumentation-ved-faerdigmelding/
- Sommerhus: ingen trykprøvning og intet energimærke; men energidokumentation (§ 283/284-tjek eller varmetabsramme) og LCA (for nybyg) kræves. [V/U]

### 7.3 Kommende/nylige ændringer pipelinen skal kunne opdateres til

| Ændring | Tidspunkt | Status | Kilde |
|---|---|---|---|
| Skærpede LCA-grænser, differentieret pr. bygningstype, byggeprocesgrænse, tilbygninger ≥ 250 m² omfattet; §§ 267–272 omformuleret | 1. juli 2025 | [V] i kraft | https://www.retsinformation.dk/eli/lta/2025/271/pdf |
| LCA-trin 2027 og 2029 (se tabel afsnit 2) | 1.1.2027 / 1.1.2029 [U præcis dato] | [V] vedtaget | https://dakofa.dk/nyhed/klimakrav-til-nybyggeri-2025-2029-politisk-aftale-er-paa-plads |
| EPBD-implementering: nulemissionsbygninger (offentlige 2028, alle nye 2030), ingen fossil CO₂ på stedet, solenergikrav (fra 1.1.2027), bygningsautomation, VE-fradrag max 25 kWh/m² | Ikrafttræden 29. maj 2026, krav indfases 2027–2031 | [U] – høring feb.–mar. 2026; endelig vedtagelse ikke verificeret | https://hoeringsportalen.dk/Hearing/Details/71068 ; https://byensejendom.dk/article/29-maj-nyt-bygningsreglement---alle-nybyggerier-skal-vaere-0-byggerier-fra-2028-og-2030-43613 |
| Ny beregningsmetode for energibehov; Be18 ikke længere obligatorisk | 29. maj 2026 | [V] annonceret af SBST | https://www.sbst.dk/nyheder/2025/ny-metode-til-beregning-af-bygningers-energibehov |
| Ny byggelov + **BR27**; frivillig lavenergiklasse udfases | Forventet 2027 | [U] under udarbejdelse | https://byensejendom.dk/article/saadan-bliver-br-27-43846 ; https://prembyg.dk/index.php/2026/08/10/ny-byggelov-2027-br27-nulemissionsbygninger-solenergi-lavenergiklasse/ |

**Arkitektur-anbefaling:** Lad alle grænseværdier (energiramme-formel, tabel 4, LCA-tabel, 100/25 h, 10 %/300 lux, ventilationsværdier) ligge i en **versioneret regelfil** (fx YAML/JSON) med gyldighedsperiode og kilde-URL, og lad notatet vælge regelsæt efter **dato for ansøgning om byggetilladelse**.

---

## 8. Faldgruber / typiske fejl

1. **Forkert regelsæt pga. dato:** Gældende krav bestemmes af ansøgningsdato (fx LCA 2025 vs 2027-grænse; Be18 vs ny metode efter 29.5.2026). [V] https://www.retsinformation.dk/eli/lta/2025/271/pdf
2. **30 %-reglen regnet på hele huset i stedet for på tilbygningen** (eller omvendt). Byggeri og Energi: opgøres i tilbygningen. [V] https://byggeriogenergi.dk/br-overblikket/krav-til-sommerhuse/tilbygning-til-sommerhus
3. **Glasareal-definition:** 30 %/22 % omfatter vinduer, yderdøre, ovenlys, ovenlyskupler, glasydervægge, glastage **og lemme mod det fri** – ofte glemmes døre og ovenlys. Arealet er typisk karm-ydermål (lysningsmål) – **[U]** verificér DS 418-definition. [V for listen] https://www.bygningsreglementet.dk/Historisk/BR18_Version5/Tekniske-bestemmelser/11/Krav/283_286
4. **Opvarmet etageareal** opgjort forkert (brutto ydermål iht. BBR-regler; opvarmet kælder skal med). [U] https://www.bygningsreglementet.dk/Historisk/BR18_Version7/Tekniske-bestemmelser/11/BRV/Energiforbrug/Kap-1_6?Layout=ShowAll
5. **Linjetab glemt** (fundament, vindue/væg, ovenlys) i varmetabsrammen. [V] tabel 4-kravene inkl. ψ.
6. **Varmtvandscirkulation ikke medregnet**; for optimistisk tæthed; vinduesareal/orientering matcher ikke tegning; ventilationstype udokumenteret. [V] https://konstruktoeren.dk/energiramme/
7. **Overtemperatur kun for hele boligen (Be18 én zone)** mens kritiske rum (store syd/vest-glaspartier, tagrum) ikke eftervises. [U] https://buildingdesign.arteliagroup.dk/student-projects/analyse-af-den-forenklede-metode-til-beregning-af-overtemperatur-i-boliger/
8. **Forkert vejrfil:** DRY2013 til termisk indeklima; særligt 2001–2010-datasæt (eller DF 2,1 %) til 300 lux. [V] se afsnit 3–4.
9. **10 %-reglen uden korrektioner** (LT, omgivelser, udhæng, vægtykkelse). [V] https://www.bygningsreglementet.dk/media/akxpf4xm/vejledning-dagslys-10-pct-regel-tbst_110119-a.pdf
10. **Solafskærmning medregnet uden at være fast/automatisk**; udluftning medregnet uden at vinduer reelt kan åbnes (indbrud/regn/nat). [B]
11. **Inkonsistens** mellem energiramme, indeklima- og ventilationsforudsætninger (fx mekanisk ventilation i Be18 men naturlig i indeklimasimulering). [B]
12. **Sommerhus-vinduer:** U ≤ 1,80 *og* Eref-klasse B; ved udskiftning skal rentabilitet vurderes med helårsbrug (§ 285). [V]
13. **LCA-undtagelse misforstået:** tilbygning < 250 m² til sommerhus/enfamiliehus er undtaget, men **nyt** sommerhus skal altid have LCA (fra 1.1.2023) og overholde grænse (fra 1.7.2025). [V]
14. **Kuldenedfald ved høje glasvægge** ikke behandlet. [B]
15. **Dagslys i eksisterende rum** forringet af tilbygning ikke vurderet. [B]
16. **AI-genereret tekst:** risiko for at notatet citerer paragraffer/tal der ikke passer til den aktuelle BR-version. Lad AI'en **kun** indsætte tal fra den versionerede regelfil og beregningsresultater; ingen fri gengivelse af lovtekst. [B]

---

## 9. Åbne punkter der SKAL verificeres manuelt (prioriteret)

1. Endelig ordlyd af §§ 267–273 efter 1.7.2025 (energiramme for tilbygning beregnet med samlet areal?).
2. Om 50 %-reglen for dækket eksisterende facade også gælder ved varmetabsramme for **sommerhus**-tilbygninger, og præcis hvordan referencens glasareal fastsættes for sommerhuse (faktisk areal, maks. 30 %?).
3. Bilag 2 tabel 1, 2 og 4 – alle værdier (modstridende kilder for tabel 2).
4. Om ændringen pr. 29.5.2026 (EPBD) er vedtaget som foreslået, og overgangsregler for Be18.
5. Om termisk-indeklima-dokumentation (kap. 19) kræves for sommerhuse.
6. Vejledningens præcise forudsætninger for overtemperaturberegning (interne laster, udluftning, afskærmning) og dagslysberegning (refleksioner, grid, vejrdata).
7. Kuldenedfald – om BR-vejledningen til kap. 19 har konkret kriterium.
8. Om LCA nu også skal indsendes (foreløbig) ved ansøgning.

Primære dokumenter at hente manuelt (blokeret i denne session):
- https://bygningsreglementet.dk/Tekniske-bestemmelser/11/Krav?Layout=ShowAll
- https://www.bygningsreglementet.dk/bilag/b2/bilag_2/?Layout=ShowAll
- https://www.bygningsreglementet.dk/Tekniske-bestemmelser/18/Vejledninger/Generel_vejledning/Dagslys
- https://www.bygningsreglementet.dk/media/akxpf4xm/vejledning-dagslys-10-pct-regel-tbst_110119-a.pdf
- Kap. 19-vejledning termisk indeklima (bygningsreglementet.dk/Tekniske-bestemmelser/19/Vejledninger)
- https://www.bygningsreglementet.dk/media/ncpjhogw/vejledning-dokumentation-af-bygningsreglementets-tekniske-bestemmelser-i-forbindelse-med-frdigmeldi-2025.pdf
- https://www.sbst.dk/materialer/2026/metode-for-beregning-af-bygningers-energimaessige-ydeevne-epbd
- https://www.retsinformation.dk/eli/lta/2025/271/pdf
