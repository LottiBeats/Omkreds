/**
 * EditorPage.jsx — document editor for one project
 *
 * Shows the A1–B3 document tabs on the left.
 * When no document is selected → shows the project metadata form.
 * When a document is open     → shows the block editor.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, saveProject, generatePdf, generatePdfZip, generateWord, getCalcTemplates, saveProjectAsTemplate } from '../api/client.js'
import BlockList            from '../components/blocks/BlockList.jsx'
import MetadataPanel        from '../components/MetadataPanel.jsx'
import TemplateEditorModal  from '../components/TemplateEditorModal.jsx'

const DOC_DEFS = {
  A1: 'Projektgrundlag',
  A2: 'Statiske beregninger',
  A3: 'Konstruktionstegninger og modeller',
  A4: 'Konstruktionsændringer',
  B1: 'Statisk projekteringsrapport',
  B2: 'Statisk kontrolrapport',
  B3: 'Statisk tilsynsrapport',
}

// ── Document templates ────────────────────────────────────────────────────────

function makeA1Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Projektgrundlag (A1)' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 1. PROJEKTBESKRIVELSE
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Projektbeskrivelse' } },
    { id: id++, type: 'text', data: { text: 'Projektet omhandler [nybyggeri / tilbygning / ombygning] af [bygningstype, fx etageboliger / kontorhus / industribygning] beliggende [adresse].\n\nBygherren er: …\nMatrikelnummer: …\n\nBygningen er [antal etager] etager [med / uden] kælder. Det samlede bebyggede areal er ca. … m² og det samlede etageareal er ca. … m².\n\nKonstruktionen er opbygget som [beskriv overordnet konstruktivt system, fx: et skelet­system af stålsøjler og betonbjælker med in-situ støbte dækelementer / et bærende murværkssystem med træbjælkelag og lette ydervægge].' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projektomfang' } },
    { id: id++, type: 'text', data: { text: 'Disse statiske beregninger (A2) og dette projektgrundlag (A1) omfatter:\n• Primære bærende konstruktioner: dæk, bjælker, søjler og vægge\n• Stabiliserende konstruktioner (vandret lastaflastning)\n• Fundament og funderingsforhold\n\nBeregningerne omfatter ikke:\n• Sekundære konstruktioner (trapper, facadeelementer, rækværk)\n• Brand­teknisk dimensionering (behandles særskilt)\n• VVS-, el- og ventilationsinstallationer' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 2. LOVGRUNDLAG OG NORMER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Lovgrundlag og gældende normer' } },
    { id: id++, type: 'text', data: { text: 'Projektet er udarbejdet i henhold til Bygningsreglementet 2018 (BR18) med tilhørende Eurocode-suite og danske nationale annekser (DK NA).' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 1 — Gældende normer og standarder',
      has_header: true,
      rows: [
        ['Standard', 'Titel', 'Udgave / DK NA'],
        ['BR18', 'Bygningsreglementet', '2018 inkl. ændringer'],
        ['DS/EN 1990', 'Projekteringsgrundlag (EC0)', 'DK NA:2024'],
        ['DS/EN 1991-1-1', 'Nyttelaster på bygninger (EC1)', 'DK NA:2007/A1:2014'],
        ['DS/EN 1991-1-3', 'Snelaster (EC1)', 'DK NA:2024'],
        ['DS/EN 1991-1-4', 'Vindlaster (EC1)', 'DK NA:2024'],
        ['DS/EN 1992-1-1', 'Betonkonstruktioner (EC2)', 'DK NA:2015'],
        ['DS/EN 1993-1-1', 'Stålkonstruktioner (EC3)', 'DK NA:2019'],
        ['DS/EN 1993-1-8', 'Stålsamlinger (EC3)', 'DK NA:2019'],
        ['DS/EN 1995-1-1', 'Trækonstruktioner (EC5)', 'DK NA:2015'],
        ['DS/EN 1996-1-1', 'Murkonstruktioner (EC6)', 'DK NA:2013'],
        ['DS/EN 1997-1', 'Geoteknisk projektering (EC7)', 'DK NA:2015'],
        ['DS 1140', 'Statisk dokumentation', '2014'],
        ['DS 409', 'Last på konstruktioner (ophævet, ref.)', '1998'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Slet de rækker der ikke er relevante for dette projekt.' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 3. KLASSIFIKATION OG PÅLIDELIGHED
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Klassifikation og pålidelighed' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 2 — Projektklassifikation',
      has_header: true,
      rows: [
        ['Parameter', 'Klasse', 'Begrundelse'],
        ['Konsekvensklasse (DS/EN 1990)', 'CC2', 'Normal konsekvens ved svigt — boliger, kontorer, erhverv'],
        ['Pålidelighedsklasse (DS/EN 1990)', 'RC2', 'Svarer til CC2'],
        ['Kontrolklasse (DS 1140)', 'KK2', 'Svarende til CC2 — projekteringskontrol kræves'],
        ['Geoteknisk kategori (DS/EN 1997)', 'GK2', 'Normale forhold — geoteknisk rapport kræves'],
        ['Brandklasse (BR18)', 'BK2', '[Tilpas: BK1 / BK2 / BK3 / BK4]'],
        ['KFI-faktor (STR/GEO)', '1,0', 'CC2 — se Tabel 3'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Begrundelse for CC2: Svigt af konstruktionen vil medføre middel risiko for personskade og betydelig økonomisk skade, men ikke katastrofale følger. Konsekvensklassen CC2 er valgt i henhold til DS/EN 1990 Bilag B og DS 1140.\n\nKravene til kontrolklasse KK2 indebærer uvildig projekteringskontrol af bærende konstruktioner (se B2 — Statisk kontrolplan).' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 3 — Konsekvensklasser og KFI-faktorer (DS/EN 1990 DK NA:2024, Tabel B1)',
      has_header: true,
      rows: [
        ['Klasse', 'Betegnelse', 'Typisk anvendelse', 'KFI (STR/GEO)', 'KFI (EQU)', 'DS 1140'],
        ['CC1', 'Lille konsekvens', 'Garager, drivhuse, landbrugsbygninger', '0,9', '1,0', 'KK1'],
        ['CC2', 'Normal konsekvens', 'Boliger, kontorer, erhvervsbygninger', '1,0', '1,0', 'KK2'],
        ['CC3', 'Stor konsekvens', 'Tribuner, koncertsale, hospitaler, broer', '1,1', '1,0', 'KK3'],
      ]
    }},

    // ─────────────────────────────────────────────────────────────────────────
    // 4. KONSTRUKTIVT SYSTEM
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Konstruktivt system' } },

    { id: id++, type: 'heading', data: { level: 3, text: 'Bærende system' } },
    { id: id++, type: 'text', data: { text: 'Bygningens primære bærende system består af:\n• Dæk: [betonelementdæk / in-situ beton / træbjælkelag / ståltrapdæk] — spændvidder op til … m\n• Bjælker: [stålbjælker HEA/IPE … / betonbjælker / limtræ]\n• Søjler / bærende vægge: [stålsøjler / in-situ betonvægge / præfab betonelementer / murværk]\n• Fundering: [punktfundamenter / stribefundamenter / pladefundament / pæle]\n\nLastaflastningsprincip: Lodrette laster overføres fra dæk → bjælker → søjler/vægge → fundament → undergrund.' } },

    { id: id++, type: 'heading', data: { level: 3, text: 'Stabilisering' } },
    { id: id++, type: 'text', data: { text: 'Vandret stabilisering mod vind- og ulykkeslaster sikres ved:\n• [Betonskiver / stålkryds / rammevirkning / murede skiver]\n• Placering: [beskriv hvilke vægge / kerner der stabiliserer i hvilken retning]\n\nDækkene fungerer som stive skiver der fordeler vandrette kræfter til stabiliserings­systemet.\n\nLodrette laster: Overvejende centrisk belastede søjler/vægge — ekscentricitet vurderes i A2.' } },

    { id: id++, type: 'heading', data: { level: 3, text: 'Fundering' } },
    { id: id++, type: 'text', data: { text: 'Funderingsprincip: [Direkte fundering / Pælfundering]\nFundamenttype: [Punktfundamenter / Stribefundamenter / Pladefundament]\nFundamenteringskote: ca. +… m DVR90 (dybde … m under terræn)\nBæredygtig jordbundsydelse: σ = … kN/m² (fra geoteknisk rapport)' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 5. LASTFORUDSÆTNINGER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Lastforudsætninger' } },

    // 5.1 Egenlaste
    { id: id++, type: 'heading', data: { level: 3, text: 'Egenlaste (G)' } },
    { id: id++, type: 'text', data: { text: 'Egenlast af konstruktionselementer bestemmes på basis af tværsnitsdimensioner og nedenstående materialevægte i henhold til DS/EN 1991-1-1 Annex A.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 4 — Materialevægte (DS/EN 1991-1-1 Annex A)',
      has_header: true,
      rows: [
        ['Material / konstruktionselement', 'Rumvægt / fladel.', 'Enhed', 'Kilde'],
        ['Armeret beton (in-situ)', '25,0', 'kN/m³', 'EC1 Tabel A.1'],
        ['Uarmeret beton', '24,0', 'kN/m³', 'EC1 Tabel A.1'],
        ['Letbeton (Leca-blokke, type afhænger)', '10,0 – 18,0', 'kN/m³', 'EC1 Tabel A.1'],
        ['Murværk, massivt tegl (brændt)', '18,0 – 22,0', 'kN/m³', 'EC1 Tabel A.1'],
        ['Murværk, porebeton / gasbeton', '5,0 – 9,0', 'kN/m³', 'EC1 Tabel A.1'],
        ['Konstruktionsstål', '78,5', 'kN/m³', 'EC1 Tabel A.1'],
        ['Konstruktionstræ C24 (gran/fyr)', '4,2', 'kN/m³', 'EC1 Tabel A.1'],
        ['Limtræ GL28h (homogen)', '4,5', 'kN/m³', 'EC1 Tabel A.1'],
        ['Gipsplader (standard)', '12,5', 'kN/m³', 'EC1 Tabel A.1'],
        ['Tagsten, beton', '0,50', 'kN/m²', 'EC1 Tabel A.12'],
        ['Tagsten, tegl', '0,60', 'kN/m²', 'EC1 Tabel A.12'],
        ['Tagpap + 200 mm isolering (EPS)', '0,15 – 0,25', 'kN/m²', 'Producent'],
        ['Terrazzo- / flisegulv (20 mm + mørtel)', '0,60 – 1,00', 'kN/m²', 'EC1 Tabel A.12'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Konstruktionsegenlasten specificeres i de individuelle beregningsafsnit (A2) for hvert element.\n\nPermanente installationer (VVS, ventilation): tillæg på … kN/m² medregnes som egenlast på dækkene.' } },

    // 5.2 Nyttelaster
    { id: id++, type: 'heading', data: { level: 3, text: 'Nyttelaster (Q)' } },
    { id: id++, type: 'text', data: { text: 'Nyttelaster fastsættes i henhold til DS/EN 1991-1-1 + DK NA. Nedenstående tabel viser karakteristiske værdier for de relevante lastkategorier.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 5 — Karakteristiske nyttelaster (DS/EN 1991-1-1 Tabel 6.2 + DK NA)',
      has_header: true,
      rows: [
        ['Kat.', 'Beskrivelse', 'qk [kN/m²]', 'Qk [kN]', 'Bemærkning'],
        ['A', 'Boliger og boligformål', '2,0', '2,0', ''],
        ['B', 'Kontorer og administrationsarealer', '2,5', '4,5', ''],
        ['C1', 'Arealer med borde og stole (skoler, restauranter)', '3,0', '4,0', ''],
        ['C2', 'Arealer med fast bestolning (kirker, biografer)', '4,0', '4,0', ''],
        ['C3', 'Arealer uden hindringer (museer, udstilling)', '5,0', '4,0', ''],
        ['C4', 'Arealer med fysisk aktivitet (sport, dans)', '5,0', '7,0', ''],
        ['C5', 'Arealer med store folkemasser (festivaler)', '5,0', '4,5', ''],
        ['D1', 'Forretningsarealer, supermarkeder', '4,0', '4,0', ''],
        ['D2', 'Varehuse, stormagasiner', '5,0', '7,0', ''],
        ['E1', 'Lagerbygninger, industri (generelt lager)', '7,5', '7,0', 'Verificér med bruger'],
        ['F', 'Parkering, let trafik ≤ 30 kN', '2,5', '10,0', 'Personbiler'],
        ['G', 'Parkering, tung trafik 30–160 kN', '5,0', '45,0', 'Lastbiler'],
        ['H', 'Tage — ikke tilgængeligt', '0,5', '1,0', 'DK NA'],
        ['I / Z', 'Tage — tilgængeligt (tagterrasse)', 'Som kat. A–D', '—', 'Aftales med bygherre'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Dette projekt anvender:\n• [Etagedæk]: Lastkategori [A/B/C/D] — qk = … kN/m²\n• [Tagdæk]: Lastkategori H — qk = 0,5 kN/m²\n• Skillevægsoverlast (fast opdeling): tillæg qk = 0,5 kN/m² (DS/EN 1991-1-1 §6.3.1.2)\n\nNyttelasten er den principale variable last (Qk,1) i lastkombinationerne, med undtagelse af vindlastdominerede situationer.' } },

    // 5.3 Snelast
    { id: id++, type: 'heading', data: { level: 3, text: 'Snelast (S)' } },
    { id: id++, type: 'text', data: { text: 'Snelast beregnes i henhold til DS/EN 1991-1-3 + DK NA:2024.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 6 — Snelastzoner i Danmark (DS/EN 1991-1-3 DK NA:2024, Figur DK.1)',
      has_header: true,
      rows: [
        ['Zone', 'sk ved havniveau [kN/m²]', 'Geografisk dækning'],
        ['Zone 1', '0,9', 'Sjælland, Fyn, Lolland-Falster og de fleste øer'],
        ['Zone 2', '1,0', 'Det meste af Jylland (øst og centrale dele)'],
        ['Zone 3', '1,1', 'Vest- og nordvestjylland'],
        ['Zone 4', '1,5', 'Bornholm og højtliggende lokaliteter'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Bemærkning: sk stiger med 0,1 kN/m² pr. 100 m over havets overflade for lokaliteter > 400 m o.h. (ikke relevant for DK under normale forhold).\n\nDette projekt (Zone [1/2/3/4]):\n  sk = … kN/m²  (karakteristisk terrænværdi)\n  Tagtype: [ensidig / tosidig / fladt] tag\n  Hældningsvinkel: α = … °\n  Formfaktor: μ1 = … (fra DK NA Figur DK.3)\n  Terrænafskærmning: Ce = 1,0 (normal eksponering)\n  Termisk koefficient: Ct = 1,0\n  Karakteristisk tagsnelast: s = μ1 · Ce · Ct · sk = … kN/m²' } },

    // 5.4 Vindlast
    { id: id++, type: 'heading', data: { level: 3, text: 'Vindlast (W)' } },
    { id: id++, type: 'text', data: { text: 'Vindlast beregnes i henhold til DS/EN 1991-1-4 + DK NA:2024.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 7 — Vindparametre (DS/EN 1991-1-4 DK NA:2024)',
      has_header: true,
      rows: [
        ['Parameter', 'Symbol', 'Værdi', 'Bemærkning'],
        ['Referencebasisvindhastighed', 'vb,0', '24 m/s', 'Gælder for langt de fleste steder i DK (DK NA:2024)'],
        ['Retningsfaktor', 'cdir', '1,0', 'Konservativ (kan reduceres jf. DK NA)'],
        ['Sæsonfaktor', 'cseason', '1,0', 'Konservativ'],
        ['Terrænkategori', '—', '[0 / I / II / III / IV]', 'Vælg: 0=hav, II=normal, IV=tæt bybebyggelse'],
        ['Referencehøjde', 'zref', '… m', 'Bygningens højde over terræn'],
        ['Terrænroughedsfaktor', 'cr(z)', '—', 'Beregnes fra terrænkategori og zref'],
        ['Orografifaktor', 'co(z)', '1,0', 'Korriger ved bakket terræn'],
        ['Turbulensintensitet', 'Iv(z)', '—', 'Afhænger af terrænkategori'],
        ['Karakteristisk vindhastighedstryk', 'qp(z)', '… kN/m²', 'Beregnes i A2'],
        ['Ydre trykkoefficient (lovert)', 'cpe,10', '0,8', 'Typisk for lodret facade, vindretning 0°'],
        ['Ydre trykkoefficient (læside)', 'cpe,10', '-0,5 til -0,6', 'Typisk for lodret facade'],
        ['Indvendig trykkoefficient', 'cpi', '+0,2 / -0,3', 'Konservativ, afhænger af åbninger'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Den dimensionsgivende vindlast beregnes detaljeret i beregningsafsnit A2 ved anvendelse af ovenstående parametre.\n\nKonkrete projektdata:\n  Terrænkategori: … · zref = … m · vb,0 = 24 m/s · qp = … kN/m²' } },

    // 5.5 Ulykkeslast
    { id: id++, type: 'heading', data: { level: 3, text: 'Ulykkeslaster' } },
    { id: id++, type: 'text', data: { text: 'Ulykkeslaster (DS/EN 1990 Afsnit 4 + DS/EN 1991-1-7):\n\n[Slet det der ikke er relevant]\n• Påkørselslast fra køretøjer: Ad = … kN (ved parkerings- og gennemkørselsniveauer)\n• Eksplosionslast: Behandles ikke — bygningen er ikke i eksplosionsrisikozone\n• Progrederende kollaps: Vurderes for CC2 — konstruktionen har fornøden robusthed via kontinuitet og alternativ lastvej\n• Jordskælv: Ikke relevant for Danmark (seismisk hazard negligibel)\n\nUlykkeskombination: Gk + Ad + ψ1,1·Qk,1 (DS/EN 1990 Formel 6.11b)' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 6. LASTKOMBINATIONER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Lastkombinationer' } },
    { id: id++, type: 'text', data: { text: 'Dimensionering udføres i brudgrænsetilstand (ULS) og anvendelsesgrænsetilstand (SLS) i henhold til DS/EN 1990 DK NA:2024.\n\nULS (STR): Den dimensionsgivende lastkombination bestemmes som det dimensionsgivende af 6.10a og 6.10b, multipliceret med KFI-faktoren for den gældende konsekvensklasse.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 8 — ULS lastsikkerhedsfaktorer (DS/EN 1990 DK NA:2024, Tabel A1.2(B), STR/GEO)',
      has_header: true,
      rows: [
        ['Formel', 'Udtryk', 'γG,sup', 'γG,inf', 'γQ,1', 'ξ (DK NA)'],
        ['6.10a', 'γG,sup·KFI·Gk + Σ(γQ,i·KFI·ψ0,i·Qk,i)', '1,35', '1,00', '1,50·ψ0,i', '—'],
        ['6.10b', 'ξ·γG,sup·KFI·Gk + γQ,1·KFI·Qk,1 + Σ(γQ,i·KFI·ψ0,i·Qk,i)', '1,35', '1,00', '1,50', '0,89'],
        ['EQU (ligevægt)', 'γG,sup·Gk + γQ,1·ψ0,1·Qk,1', '1,05', '0,95', '1,50·ψ0,1', '—'],
        ['GEO (jord)', 'Som STR 6.10a/b med geotekniske γ-faktorer', '1,35', '1,00', '1,50', '0,89'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'SLS lastkombinationer (DS/EN 1990 Tabel A1.4):\n• Karakteristisk:   Gk + Qk,1 + Σ(ψ0,i · Qk,i)   — bruges til irreversible SLS-tilstande\n• Hyppig:           Gk + ψ1,1·Qk,1 + Σ(ψ2,i · Qk,i) — bruges til reversible SLS-tilstande\n• Kvasi-permanent:  Gk + Σ(ψ2,i · Qk,i)             — bruges til krybning og nedbøjning' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 9 — ψ-faktorer for variable laster (DS/EN 1990 DK NA:2024, Tabel A1.1)',
      has_header: true,
      rows: [
        ['Lasttype', 'Lastkategori', 'ψ0', 'ψ1', 'ψ2'],
        ['Nyttelast — Kat. A', 'Boliger og boligformål', '0,5', '0,3', '0,2'],
        ['Nyttelast — Kat. B', 'Kontor og administrationsarealer', '0,6', '0,4', '0,2'],
        ['Nyttelast — Kat. C', 'Forsamlingslokaler (C1–C5)', '0,6', '0,6', '0,5'],
        ['Nyttelast — Kat. D', 'Butikker og forretningsarealer', '0,6', '0,6', '0,5'],
        ['Nyttelast — Kat. E', 'Lagerbygninger', '0,8', '0,8', '0,7'],
        ['Nyttelast — Kat. F', 'Let trafik ≤ 30 kN (parkering)', '0,6', '0,6', '0,5'],
        ['Nyttelast — Kat. G', 'Tung trafik > 30 kN', '0,6', '0,4', '0,2'],
        ['Nyttelast — Kat. H', 'Tage (ikke tilgængeligt)', '0', '0', '0'],
        ['Snelast (DK)', 'Kombineret m. temperatur / jordskælv', '0,6', '0,2', '0'],
        ['Snelast (DK)', 'Kombineret med vindlast', '0', '0', '0'],
        ['Snelast (DK)', 'Andre kombinationer', '0,3', '0,2', '0'],
        ['Vindlast (DK)', 'Kombineret med jordskælv', '0,6', '0,2', '0'],
        ['Vindlast (DK)', 'Andre kombinationer', '0,3', '0,2', '0'],
        ['Temperaturlast', 'Ikke-brandlast', '0,6', '0,5', '0'],
      ]
    }},

    // ─────────────────────────────────────────────────────────────────────────
    // 7. MATERIALEFORUDSÆTNINGER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Materialeforudsætninger' } },
    { id: id++, type: 'text', data: { text: 'Nedenstående karakteristiske materialeegenskaber lægges til grund for dimensioneringen. Slet de materialer der ikke anvendes i dette projekt.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 10 — Karakteristiske materialeegenskaber',
      has_header: true,
      rows: [
        ['Material', 'Type / Klasse', 'Styrke', 'E-modul', 'Rumvægt'],
        ['Beton (EC2)', 'C25/30', 'fck = 25 MPa', 'Ecm = 31 GPa', '25 kN/m³'],
        ['Beton (EC2)', 'C30/37', 'fck = 30 MPa', 'Ecm = 33 GPa', '25 kN/m³'],
        ['Beton (EC2)', 'C35/45', 'fck = 35 MPa', 'Ecm = 34 GPa', '25 kN/m³'],
        ['Armering (EC2)', 'B500 NOR (duktilitetsklasse N)', 'fyk = 500 MPa', 'Es = 200 GPa', '78,5 kN/m³'],
        ['Konstruktionsstål (EC3)', 'S235 (t ≤ 40 mm)', 'fy = 235 MPa, fu = 360 MPa', 'E = 210 GPa', '78,5 kN/m³'],
        ['Konstruktionsstål (EC3)', 'S355 (t ≤ 40 mm)', 'fy = 355 MPa, fu = 510 MPa', 'E = 210 GPa', '78,5 kN/m³'],
        ['Konstruktionsstål (EC3)', 'S355 (40 < t ≤ 80 mm)', 'fy = 335 MPa, fu = 470 MPa', 'E = 210 GPa', '78,5 kN/m³'],
        ['Konstruktionstræ (EC5)', 'C24 (gran/fyr)', 'fm,k = 24 MPa, fc,0,k = 21 MPa', 'E0,mean = 11 GPa', '4,2 kN/m³'],
        ['Limtræ (EC5)', 'GL28h (homogen)', 'fm,k = 28 MPa, fc,0,k = 26,5 MPa', 'E0,mean = 12,6 GPa', '4,5 kN/m³'],
        ['Murværk (EC6)', 'Tegl MU30 + M10', 'fk = K · fb^α · fm^β (beregnes)', '—', '18–22 kN/m³'],
      ]
    }},
    { id: id++, type: 'table', data: {
      caption: 'Tabel 11 — Materialepartialkoefficienter (ULS, DK NA)',
      has_header: true,
      rows: [
        ['Material', 'Koefficient', 'Anvendelse / tilstand', 'Værdi'],
        ['Beton', 'γC', 'Trykstyrke, bøjning, forskydning (ULS)', '1,50'],
        ['Armering (stålstænger)', 'γS', 'Flydestyrke (ULS)', '1,15'],
        ['Stål — tværsnitskapacitet', 'γM0', 'Plasticitet, flydning', '1,00'],
        ['Stål — instabilitet', 'γM1', 'Knækning, kipning, vipping', '1,00'],
        ['Stål — brud i nettotværsnit', 'γM2', 'Træk­brud, nettotværsnit ved huller', '1,25'],
        ['Stål — bolte og svejsning', 'γM2', 'Forbindelsesmidler', '1,25'],
        ['Stål — glidning (kat. B/C)', 'γM3', 'Friktionsforbindelser', '1,25'],
        ['Konstruktionstræ', 'γM', 'ULS, generelt', '1,30'],
        ['Limtræ', 'γM', 'ULS, generelt', '1,25'],
        ['Murværk (kat. I mørtel, anv.b.)', 'γM', 'Trykstyrke (ULS)', '2,50'],
        ['Murværk (kat. II mørtel)', 'γM', 'Trykstyrke (ULS)', '3,00'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Kryb og svind (beton): Krybtal φ = … og svindtøjning εcs = … fastsættes i henhold til DS/EN 1992-1-1 §3.1.4 baseret på beton­klasse, fugtforhold og belastningsalder.\n\nServiceklasse (træ, EC5): SC [1 / 2 / 3] — [indendørs tørt / indendørs fugtigt / udendørs].\nkmod-faktor: [0,6 / 0,7 / 0,8 / 0,9 / 1,1] afhænger af serviceklasse og lastens varighed.' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 8. GEOTEKNISKE FORUDSÆTNINGER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Geotekniske forudsætninger' } },
    { id: id++, type: 'text', data: { text: 'Geoteknisk kategori: GK[1/2/3] (DS/EN 1997-1)\nJordklasse: [JK0 / JK1 / JK2 / JK3 / JK4] (DS/EN 1997-1 DK NA, efter komprimering)\n\nFunderingsforhold:\n  Bæredygtig jordbundsydelse: σ = … kN/m² (fra geoteknisk rapport)\n  Fundamentskote (underkant): +… m DVR90 (ca. … m under eksisterende terræn)\n  Frostfridybde: 0,9 m (DK NA til DS/EN 1997-1)\n  Grundvandskote: +… m DVR90 (frihøjde: … m under fundamentunderkant)\n\nJordparametre (karakteristiske værdier fra geoteknisk rapport):\n  Friktionsvinkel: φk = … °\n  Kohæsion: ck = … kPa\n  Effektiv rumvægt: γk = … kN/m³  (over GVS) / … kN/m³  (nedsænket)\n\nReference: [Geoteknisk rapport, firma, rapport nr., dato]' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 12 — Geotekniske partialkoefficienter (DS/EN 1997-1 + DK NA, Tilgang 2)',
      has_header: true,
      rows: [
        ['Parameter', 'Symbol', 'A1 (ULS)', 'A2 (GEO)', 'Bemærkning'],
        ['Egenlast (ugunstig)', 'γG', '1,35', '1,00', 'Multiplier med KFI'],
        ['Variabel last (ugunstig)', 'γQ', '1,50', '1,30', 'Multiplier med KFI'],
        ['Friktionsvinkel (tan φ)', 'γφ', '1,00', '1,25', 'R2 modstandsfaktorer'],
        ['Kohæsion', 'γc', '1,00', '1,25', ''],
        ['Bæreevnemodstand', 'γRv', '—', '1,40', 'Tilgang 2 (DA2)'],
        ['Glidningsmodstand', 'γRh', '—', '1,10', 'Tilgang 2 (DA2)'],
      ]
    }},

    // ─────────────────────────────────────────────────────────────────────────
    // 9. SÆRLIGE FORUDSÆTNINGER OG BEGRÆNSNINGER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Særlige forudsætninger og begrænsninger' } },
    { id: id++, type: 'text', data: { text: 'Følgende særlige forudsætninger og begrænsninger gælder for projektet:\n\n1. Disse beregninger forudsætter, at samtlige konstruktionstegninger (A3) overholdes præcist under udførelsen. Afvigelser skal godkendes skriftligt af den projekterende.\n\n2. Fundaments­dimensioner og -kote forudsættes bekræftet af geoteknisk rådgiver inden udførelse.\n\n3. Ændringer i anvendelse (laststørrelse eller lastkategori) kræver ny statisk vurdering.\n\n4. Modifikationer af bærende konstruktioner under udførelse må ikke foretages uden godkendelse fra den projekterende ingeniør.\n\n5. [Eventuelle yderligere særlige forudsætninger beskrives her]' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 10. REFERENCEDOKUMENTER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Referencedokumenter' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 13 — Projektdokumenter og referencer',
      has_header: true,
      rows: [
        ['Dok. nr.', 'Titel', 'Udstedt af', 'Dato / Rev.'],
        ['A1', 'Projektgrundlag (dette dokument)', '', ''],
        ['A2', 'Statiske beregninger', '', ''],
        ['A3', 'Konstruktionstegninger', '', ''],
        ['B1', 'Statisk projekteringsrapport', '', ''],
        ['B2', 'Statisk kontrolplan', '', ''],
        ['B3', 'Statisk kontrolrapport', '', ''],
        ['GEO-01', 'Geoteknisk rapport', '', ''],
        ['ARK-01', 'Arkitekttegninger (grundlag)', '', ''],
      ]
    }},

    // ─────────────────────────────────────────────────────────────────────────
    // 11. GODKENDELSE
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Godkendelse' } },
    { id: id++, type: 'text', data: { text: 'Konstruktionsgrundlaget (A1) er udarbejdet og kontrolleret i henhold til DS 1140 og giver grundlag for de statiske beregninger (A2).\n\nUdarbejdet af:  ___________________________  Dato: ____________\n               Navn, titel\n\nKontrolleret af: ___________________________  Dato: ____________\n               Navn, titel (uvildig kontrollant, KK2)\n\nGodkendt af:   ___________________________  Dato: ____________\n               Navn, stilling' } },
  ]
}

function makeB1Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Statisk projekteringsrapport' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projekt- og konstruktionstype' } },
    { id: id++, type: 'text',    data: { text: 'Projektets betegnelse: …\nBygherre: …\nAdresse/matrikel: …\nKonstruktionstype: Nybyggeri / Ombygning / Tilbygning\nAnvendelse: Beboelse / Erhverv / Industri / Offentlig' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Konstruktivt system' } },
    { id: id++, type: 'text',    data: { text: 'Overordnet beskrivelse af det konstruktive system:\n• Bærende elementer (bjælker, søjler, dæk, vægge)\n• Primær bærende retning\n• Spændvidder og etageantal\n• Principper for lastaflastning' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Fundering' } },
    { id: id++, type: 'text',    data: { text: 'Funderingsprincip: Direkte / Pælfundering\nFundamenteringskote: +… m DVR90\nFundamenttype: Punktfundamenter / Stribefundamenter / Pladefundament\nBæredygtig jordbundsydelse: σ = … kN/m²' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Stabilisering' } },
    { id: id++, type: 'text',    data: { text: 'Vandret stabilisering: Skiver / Rammer / Kerner / Kryds\nLodrette laster: Bærende vægge / Søjlesystem\nTværvæggenes placering og funktion beskrives.' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Konsekvensklasse og kontrolklasse' } },
    { id: id++, type: 'text',    data: { text: 'Konsekvensklasse (DS/EN 1990 + DS 1140): CC… (KK1 / KK2 / KK3 / KK4)\nSikkerhedsklasse (DS 409): SK…\nKontrolklasse: Normal / Udvidet / Særlig\n\nBegrundelse for klassevalg:\n…' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projektmaterialets omfang' } },
    { id: id++, type: 'text',    data: { text: 'Det statiske projektmateriale består af:\n• A1: Projektgrundlag\n• A2: Statiske beregninger\n• A3: Konstruktionstegninger og modeller\n• B2: Statisk kontrolplan\n• B3: Statisk kontrolrapport' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Særlige konstruktive forhold og forudsætninger' } },
    { id: id++, type: 'text',    data: { text: 'Angiv eventuelle særlige forudsætninger, begrænsninger eller opmærksomhedspunkter:\n…' } },
  ]
}

function makeA3Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Konstruktionstegninger og modeller' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Tegneliste' } },
    { id: id++, type: 'text',    data: { text: 'Nedenstående tegninger indgår i det statiske projektmateriale.\n\nTegn.nr. | Emne                          | Mål   | Rev. | Dato\n---------|-------------------------------|-------|------|----------\n001      | Planer – etage 1              | 1:100 | A    | …\n002      | Snit A-A og B-B               | 1:50  | A    | …\n003      | Fundering – plan og detaljer  | 1:100 | A    | …\n004      | Bjælkeplaner                  | 1:100 | A    | …\n005      | Armeringsplaner – dæk         | 1:50  | A    | …\n006      | Detaljetegninger – samlinger  | 1:10  | A    | …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Beregningsmodeller' } },
    { id: id++, type: 'text',    data: { text: 'Software og modeller anvendt i projekteringen:\n\nProgram       | Version | Formål              | Fil\n--------------|---------|---------------------|--------\nRevit         | 2024    | BIM-model           | …\nRFEM / Robot  | …       | FEM-analyse         | …\nOther         | …       | …                   | …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Tegningsstatus' } },
    { id: id++, type: 'text',    data: { text: 'Tegningsstatus ved projektaflevering:\n□ Tegningerne er godkendt til udførelse\n□ Tegningerne er godkendt som bygget (A5)' } },
  ]
}

function makeA4Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Konstruktionsændringer' } },

    { id: id++, type: 'text',    data: { text: 'Dette afsnit dokumenterer alle godkendte ændringer til det statiske projektmateriale efter første udgivelse. Ændringerne er nummeret fortløbende og beskriver baggrund, omfang og konsekvenser for de øvrige dokumenter.' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Ændringslog' } },
    { id: id++, type: 'text',    data: { text: 'Æ-nr. | Dato       | Beskrivelse                     | Årsag              | Godkendt af | Berørte dokumenter\n------|------------|---------------------------------|--------------------|-------------|-------------------\nÆ-01  | …          | Ændring af søjle S3 fra IPE300  | Ændret last        | …           | A2, A3/003\n      |            | til IPE360 pga. øget last       | fra bygherre       |             |\nÆ-02  | …          | …                               | …                  | …           | …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Ændringsbeskrivelse' } },
    { id: id++, type: 'heading', data: { level: 3, text: 'Æ-01 — [Emne]' } },
    { id: id++, type: 'text',    data: { text: 'Dato: …\nBaggrund: …\nÆndringens omfang: …\nStatisk vurdering: …\nBerørte dokumenter opdateres med revision …\nGodkendt af: …' } },
  ]
}

function makeB2Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Statisk kontrolplan' } },

    { id: id++, type: 'text',    data: { text: 'Udarbejdet i henhold til DS 1140 og DS/EN 1990.\nKontrolklasse: KK… · Projekt: …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projekteringskontrol' } },
    { id: id++, type: 'control_plan', data: {
      title: 'Projekteringskontrol',
      mode: 'plan',
      items: [
        { pos: '1',  description: 'Konstruktionsgrundlag (A1) er gennemgået og godkendt', kk: 'KK1', control: 'E', responsible: '', reference: 'A1' },
        { pos: '2',  description: 'Gældende normer og nationale annekser er identificeret', kk: 'KK1', control: 'E', responsible: '', reference: 'A1' },
        { pos: '3',  description: 'Laster og lastkombinationer er korrekte', kk: 'KK1', control: 'E', responsible: '', reference: 'A2' },
        { pos: '4',  description: 'Geometriske mål og tværsnitsparametre er korrekte', kk: 'KK1', control: 'E', responsible: '', reference: 'A2, A3' },
        { pos: '5',  description: 'Materialeparametre er korrekte og dokumenterede', kk: 'KK1', control: 'E', responsible: '', reference: 'A1, A2' },
        { pos: '6',  description: 'Beregningsmodeller er repræsentative for den faktiske konstruktion', kk: 'KK2', control: 'E', responsible: '', reference: 'A2' },
        { pos: '7',  description: 'Brudgrænsetilstand (STR/GEO) er kontrolleret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2' },
        { pos: '8',  description: 'Anvendelsesgrænsetilstand (SLS – nedbøjning, revnedannelse) er kontrolleret', kk: 'KK2', control: 'E', responsible: '', reference: 'A2' },
        { pos: '9',  description: 'Stabiliteten (lodret og vandret) er sikret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2, B1' },
        { pos: '10', description: 'Funderingen er kontrolleret (EC7/DS 415)', kk: 'KK1', control: 'E', responsible: '', reference: 'A2' },
        { pos: '11', description: 'Konstruktionstegninger er i overensstemmelse med beregningerne', kk: 'KK2', control: 'E', responsible: '', reference: 'A3' },
        { pos: '12', description: 'Uvildig kontrol udført (kræves ved KK2+)', kk: 'KK2', control: 'U', responsible: '', reference: '' },
      ]
    }},

    { id: id++, type: 'heading', data: { level: 2, text: 'Udførelseskontrol' } },
    { id: id++, type: 'control_plan', data: {
      title: 'Udførelseskontrol',
      mode: 'plan',
      items: [
        { pos: '1', description: 'Materialer kontrolleret (leverandørattester, CE-mærkning)', kk: 'KK1', control: 'E', responsible: '', reference: '' },
        { pos: '2', description: 'Geometriske afvigelser er inden for tolerancer (DS/ISO 4463)', kk: 'KK1', control: 'E', responsible: '', reference: '' },
        { pos: '3', description: 'Samlinger og forbindelser er udført korrekt', kk: 'KK1', control: 'E', responsible: '', reference: 'A3' },
        { pos: '4', description: 'Fundering og jordarbejder er udført og godkendt', kk: 'KK1', control: 'E', responsible: '', reference: 'A3' },
        { pos: '5', description: 'Armeringsplacering kontrolleret inden støbning', kk: 'KK2', control: 'E', responsible: '', reference: 'A3' },
        { pos: '6', description: 'Konstruktionen er i overensstemmelse med tegningerne', kk: 'KK1', control: 'E', responsible: '', reference: 'A3' },
      ]
    }},
  ]
}

function makeB3Template() {
  let id = Date.now()
  return [
    { id: id++, type: 'heading', data: { level: 1, text: 'Statisk kontrolrapport' } },

    { id: id++, type: 'text',    data: { text: 'Udarbejdet i henhold til DS 1140.\nKontrolplan reference: B2 · Projekt: …\nKontrolperiode: … til …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projekteringskontrol — rapportering' } },
    { id: id++, type: 'control_plan', data: {
      title: 'Projekteringskontrol',
      mode: 'report',
      items: [
        { pos: '1',  description: 'Konstruktionsgrundlag (A1) er gennemgået og godkendt', kk: 'KK1', control: 'E', responsible: '', reference: 'A1',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '2',  description: 'Gældende normer og nationale annekser er identificeret', kk: 'KK1', control: 'E', responsible: '', reference: 'A1',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '3',  description: 'Laster og lastkombinationer er korrekte', kk: 'KK1', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '4',  description: 'Geometriske mål og tværsnitsparametre er korrekte', kk: 'KK1', control: 'E', responsible: '', reference: 'A2, A3', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '5',  description: 'Materialeparametre er korrekte og dokumenterede', kk: 'KK1', control: 'E', responsible: '', reference: 'A1, A2', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '6',  description: 'Beregningsmodeller er repræsentative for den faktiske konstruktion', kk: 'KK2', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '7',  description: 'Brudgrænsetilstand (STR/GEO) er kontrolleret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '8',  description: 'Anvendelsesgrænsetilstand (SLS) er kontrolleret', kk: 'KK2', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '9',  description: 'Stabiliteten (lodret og vandret) er sikret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2, B1', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '10', description: 'Funderingen er kontrolleret', kk: 'KK1', control: 'E', responsible: '', reference: 'A2',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '11', description: 'Konstruktionstegninger er i overensstemmelse med beregningerne', kk: 'KK2', control: 'E', responsible: '', reference: 'A3',    status: '', date: '', performed_by: '', remarks: '' },
        { pos: '12', description: 'Uvildig kontrol udført', kk: 'KK2', control: 'U', responsible: '', reference: '',      status: '', date: '', performed_by: '', remarks: '' },
      ]
    }},

    { id: id++, type: 'heading', data: { level: 2, text: 'Udførelseskontrol — rapportering' } },
    { id: id++, type: 'control_plan', data: {
      title: 'Udførelseskontrol',
      mode: 'report',
      items: [
        { pos: '1', description: 'Materialer kontrolleret (leverandørattester, CE-mærkning)', kk: 'KK1', control: 'E', responsible: '', reference: '',  status: '', date: '', performed_by: '', remarks: '' },
        { pos: '2', description: 'Geometriske afvigelser inden for tolerancer', kk: 'KK1', control: 'E', responsible: '', reference: '',  status: '', date: '', performed_by: '', remarks: '' },
        { pos: '3', description: 'Samlinger og forbindelser udført korrekt', kk: 'KK1', control: 'E', responsible: '', reference: 'A3', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '4', description: 'Fundering og jordarbejder udført og godkendt', kk: 'KK1', control: 'E', responsible: '', reference: 'A3', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '5', description: 'Armeringsplacering kontrolleret inden støbning', kk: 'KK2', control: 'E', responsible: '', reference: 'A3', status: '', date: '', performed_by: '', remarks: '' },
        { pos: '6', description: 'Konstruktionen er i overensstemmelse med tegningerne', kk: 'KK1', control: 'E', responsible: '', reference: 'A3', status: '', date: '', performed_by: '', remarks: '' },
      ]
    }},

    { id: id++, type: 'heading', data: { level: 2, text: 'Konklusion og underskrifter' } },
    { id: id++, type: 'text',    data: { text: 'Det er hermed bekræftet, at kontrollen er gennemført i henhold til kontrolplanen (B2) og at det statiske projektmateriale er i overensstemmelse med de gældende normer og standarder.\n\nProjekterende:  ________________  Dato: ________\n\nKontrollant:    ________________  Dato: ________' } },
  ]
}

const DOC_GROUPS = [
  { label: 'Konstruktionsdokumentation', docs: ['A1', 'A2', 'A3', 'A4'] },
  { label: 'Projektdokumentation',       docs: ['B1', 'B2', 'B3'] },
]

// ── Available templates per document ─────────────────────────────────────────
// Each entry: { label, description, make: () => blocks[] }
// Add new templates here as the app grows.

const DOC_TEMPLATES = {
  A1: [
    {
      label:       'Projektgrundlag',
      description: 'Projektbeskrivelse · Normer · CC-klasse · Laster · Materialer · Geoteknik',
      make:        makeA1Template,
    },
  ],
  A3: [
    {
      label:       'Tegneliste og modeller',
      description: 'Tegneliste med tegningsnumre · Beregningsmodeller og software · Tegningsstatus',
      make:        makeA3Template,
    },
  ],
  A4: [
    {
      label:       'Ændringslog',
      description: 'Fortløbende log over godkendte konstruktionsændringer med baggrund og konsekvenser',
      make:        makeA4Template,
    },
  ],
  B1: [
    {
      label:       'Statisk projekteringsrapport',
      description: 'Konstruktivt system · Fundering · Stabilisering · Konsekvensklasse · Projektomfang',
      make:        makeB1Template,
    },
  ],
  B2: [
    {
      label:       'Statisk kontrolplan (DS 1140)',
      description: 'Projekteringskontrol + udførelseskontrol med KK-krav og kontroltype (E/U/T)',
      make:        makeB2Template,
    },
  ],
  B3: [
    {
      label:       'Statisk kontrolrapport (DS 1140)',
      description: 'Udfyldes efter kontrol: status, dato, udøver og bemærkninger pr. kontrolpunkt',
      make:        makeB3Template,
    },
  ],
}

const BRAND    = '#d94a2b'   // Omkreds orange-red
const BRAND_LT = '#e05a3a'   // lighter variant

const styles = {
  layout: {
    display:  'flex',
    height:   '100vh',
    overflow: 'hidden',
  },
  sidebar: {
    width:         248,
    background:    '#fff',
    borderRight:   '1px solid #e2e8f0',
    display:       'flex',
    flexDirection: 'column',
    flexShrink:    0,
  },
  sidebarHeader: {
    padding:      '0 0 12px',
    borderBottom: '1px solid #e2e8f0',
  },
  // Logo stripe at top of sidebar
  sidebarBrand: {
    display:    'flex',
    alignItems: 'center',
    padding:    '0 16px',
    height:     46,
    overflow:   'hidden',
    background: '#fff',
    borderBottom: '1px solid #e8e4e0',
  },
  backBtn: {
    background:   'none',
    border:       'none',
    fontSize:     11,
    color:        '#94a3b8',
    padding:      '8px 16px 0',
    marginBottom: 2,
    display:      'flex',
    alignItems:   'center',
    gap:          4,
    cursor:       'pointer',
    fontFamily:   'inherit',
    transition:   'color 0.15s',
  },
  projectName: {
    fontWeight: 700,
    fontSize:   13,
    color:      '#0f172a',
    padding:    '0 16px',
    lineHeight: 1.3,
  },
  projectRef: {
    fontSize:      11,
    color:         '#94a3b8',
    letterSpacing: '0.03em',
    padding:       '2px 16px 0',
    fontFamily:    'var(--font-mono, monospace)',
  },
  sidebarNav: {
    flex:      1,
    overflowY: 'auto',
    padding:   '8px 0',
  },
  sidebarFooter: {
    borderTop: '1px solid #e2e8f0',
    padding:   '6px 0',
  },
  groupLabel: {
    fontSize:      9,
    fontWeight:    700,
    color:         '#94a3b8',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding:       '12px 16px 3px',
  },
  docBtn: (active) => ({
    display:     'flex',
    alignItems:  'center',
    width:       '100%',
    textAlign:   'left',
    background:  active ? '#eff6ff' : 'none',
    border:      'none',
    borderLeft:  active ? `3px solid ${BRAND}` : '3px solid transparent',
    padding:     '7px 16px',
    fontSize:    12,
    color:       active ? BRAND : '#475569',
    fontWeight:  active ? 600 : 400,
    cursor:      'pointer',
    fontFamily:  'inherit',
    transition:  'background 0.12s, color 0.12s',
  }),
  metaBtn: (active) => ({
    display:     'flex',
    alignItems:  'center',
    width:       '100%',
    textAlign:   'left',
    background:  active ? '#eff6ff' : 'none',
    border:      'none',
    borderLeft:  active ? `3px solid ${BRAND}` : '3px solid transparent',
    padding:     '8px 16px',
    fontSize:    11,
    color:       active ? BRAND : '#94a3b8',
    fontWeight:  active ? 600 : 400,
    cursor:      'pointer',
    fontFamily:  'inherit',
    transition:  'background 0.12s, color 0.12s',
    gap:         6,
  }),
  docId: {
    fontFamily:    'var(--font-mono, monospace)',
    marginRight:   8,
    fontSize:      10,
    fontWeight:    700,
    color:         '#94a3b8',
    background:    '#f1f5f9',
    padding:       '1px 5px',
    borderRadius:  2,
    letterSpacing: '0.04em',
  },
  main: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    overflow:      'hidden',
    background:    '#eef2f7',
  },
  toolbar: {
    background:   '#fff',
    borderBottom: '1px solid #e2e8f0',
    padding:      '9px 24px',
    display:      'flex',
    alignItems:   'center',
    gap:          10,
    minHeight:    48,
  },
  docTitle: {
    flex:       1,
    fontWeight: 600,
    fontSize:   13,
    color:      '#0f172a',
  },
  tplBtn: {
    background:    '#fff',
    color:         '#475569',
    border:        '1px solid #e2e8f0',
    padding:       '6px 12px',
    fontSize:      11,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    borderRadius:  0,
    transition:    'background 0.12s, color 0.12s',
    whiteSpace:    'nowrap',
  },
  tplDropdown: {
    position:   'absolute',
    top:        'calc(100% + 4px)',
    right:      0,
    zIndex:     400,
    background: '#fff',
    border:     '1px solid #e0e0e0',
    boxShadow:  '0 6px 20px rgba(0,0,0,0.12)',
    minWidth:   260,
    padding:    '4px 0',
  },
  tplItem: {
    display:    'block',
    width:      '100%',
    background: '#fff',
    border:     'none',
    padding:    '10px 16px',
    textAlign:  'left',
    cursor:     'pointer',
    fontFamily: 'inherit',
  },
  tplItemLabel: {
    fontSize:   13,
    fontWeight: 600,
    color:      '#1c1c1e',
    marginBottom: 2,
  },
  tplItemDesc: {
    fontSize:   11,
    color:      '#aaa',
    lineHeight: 1.4,
  },
  tplEmpty: {
    fontSize:  12,
    color:     '#bbb',
    padding:   '10px 16px',
    fontStyle: 'italic',
  },
  pdfBtn: {
    background:    BRAND,
    color:         '#fff',
    border:        'none',
    padding:       '7px 18px',
    fontSize:      11,
    fontWeight:    700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    cursor:        'pointer',
    fontFamily:    'inherit',
    transition:    'background 0.15s',
  },
  content: {
    flex:       1,
    overflowY:  'auto',
    padding:    '28px 32px 40px',
    background: '#eef2f7',
  },
  saving: {
    fontSize:   10,
    color:      '#94a3b8',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.04em',
  },
  error: {
    color:      '#dc2626',
    background: '#fef2f2',
    border:     '1px solid #fecaca',
    padding:    '10px 16px',
    fontSize:   12,
    margin:     '0 0 16px',
    borderLeft: '3px solid #dc2626',
  },

  // ── PDF preview modal ───────────────────────────────────────────────────────
  pdfOverlay: {
    position:       'fixed',
    inset:          0,
    background:     'rgba(0,0,0,0.6)',
    zIndex:         2000,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  },
  pdfModal: {
    width:          '90vw',
    height:         '92vh',
    background:     '#fff',
    display:        'flex',
    flexDirection:  'column',
    boxShadow:      '0 24px 80px rgba(0,0,0,0.35)',
    overflow:       'hidden',
  },
  pdfModalHeader: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '10px 16px',
    borderBottom:   '1px solid #e8e8e8',
    background:     '#fafafa',
    flexShrink:     0,
  },
  pdfIframe: {
    flex:           1,
    border:         'none',
    width:          '100%',
  },
  pdfDownloadBtn: {
    background:     BRAND,
    color:          '#fff',
    border:         'none',
    padding:        '6px 14px',
    fontSize:       11,
    fontWeight:     700,
    cursor:         'pointer',
    fontFamily:     'inherit',
    letterSpacing:  '0.05em',
  },
  pdfCloseBtn: {
    background:     'none',
    border:         '1px solid #ddd',
    padding:        '5px 10px',
    fontSize:       14,
    cursor:         'pointer',
    color:          '#666',
    fontFamily:     'inherit',
  },
}

export default function EditorPage() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()

  const [project,         setProject]         = useState(null)
  const [activeDoc,       setActiveDoc]       = useState(null)   // e.g. "A2", or null = show metadata
  const [activeSubdoc,    setActiveSubdoc]    = useState(null)   // index into subdocs[], or null
  const [loading,         setLoading]         = useState(true)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState(null)
  const [tplOpen,         setTplOpen]         = useState(false)
  const [templates,       setTemplates]       = useState([])
  const [tmplEditorOpen,  setTmplEditorOpen]  = useState(false)
  const [tmplEditorInitId,setTmplEditorInitId]= useState(null)
  const [clipboard,       setClipboard]       = useState(null)   // copied block
  const [canUndo,         setCanUndo]         = useState(false)
  const [canRedo,         setCanRedo]         = useState(false)
  const [pdfPreviewUrl,   setPdfPreviewUrl]   = useState(null)   // blob URL for preview modal
  const [pdfGenerating,   setPdfGenerating]   = useState(false)  // shared spinner for both buttons
  const [pdfZipGenerating,    setPdfZipGenerating]    = useState(false)  // spinner for separate-PDFs ZIP
  const [wordGenerating,      setWordGenerating]      = useState(false)  // spinner for Word export
  const [savingTemplate,      setSavingTemplate]      = useState(false)  // spinner for save-as-template
  const [tplNamePrompt,       setTplNamePrompt]       = useState(false)  // show name input
  const [tplNameInput,        setTplNameInput]        = useState('')     // template name
  // Adding sub-document: which parent doc is being expanded
  const [addingSubdocFor, setAddingSubdocFor] = useState(null)
  const [newSubdocName,   setNewSubdocName]   = useState('')
  const undoStack      = useRef([])   // past block arrays
  const redoStack      = useRef([])   // future block arrays
  const tplRef         = useRef(null)
  const subdocInputRef = useRef(null)
  const autoSaveTimer  = useRef(null)  // debounce handle for block saves

  // Close template dropdown on outside click
  useEffect(() => {
    if (!tplOpen) return
    const close = e => { if (tplRef.current && !tplRef.current.contains(e.target)) setTplOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [tplOpen])

  useEffect(() => {
    loadProject()
    loadTemplates()
  }, [projectId])

  async function loadProject() {
    try {
      setLoading(true)
      const data = await getProject(projectId)
      setProject(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadTemplates() {
    try {
      const data = await getCalcTemplates()
      setTemplates(data)
    } catch (err) {
      // Non-fatal — templates panel will just be empty
      console.warn('Could not load calc templates:', err)
    }
  }

  /**
   * Save the full project to the backend.
   */
  const save = useCallback(async (updatedProject) => {
    // Optimistic update first — state is correct immediately, no overwrite race
    setProject(updatedProject)
    try {
      setSaving(true)
      await saveProject(updatedProject)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }, [])

  /** Read the currently active blocks (parent doc OR active subdoc) */
  function _currentBlocks(p = project) {
    if (!activeDoc || !p) return []
    const doc = p.documents[activeDoc]
    if (activeSubdoc !== null) return doc?.subdocs?.[activeSubdoc]?.blocks ?? []
    return doc?.blocks ?? []
  }

  /** Low-level: write blocks to the active location without touching undo/redo */
  function _applyBlocks(newBlocks) {
    if (!activeDoc || !project) return
    const doc = project.documents[activeDoc]
    let updated
    if (activeSubdoc !== null) {
      const newSubdocs = (doc.subdocs ?? []).map((sd, i) =>
        i === activeSubdoc ? { ...sd, blocks: newBlocks } : sd
      )
      updated = {
        ...project,
        documents: { ...project.documents, [activeDoc]: { ...doc, subdocs: newSubdocs } },
      }
    } else {
      updated = {
        ...project,
        documents: { ...project.documents, [activeDoc]: { ...doc, blocks: newBlocks } },
      }
    }
    // Update state immediately so UI never lags or reverts while typing
    setProject(updated)
    // Debounce the API save — one request per typing pause, not per keystroke
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      setSaving(true)
      saveProject(updated)
        .catch(err => setError(err.message))
        .finally(() => setSaving(false))
    }, 800)
  }

  /** Called by BlockList when blocks change — pushes to undo stack */
  function updateBlocks(newBlocks) {
    if (!activeDoc || !project) return
    const current = _currentBlocks()
    undoStack.current = [...undoStack.current.slice(-49), current]
    redoStack.current = []
    setCanUndo(true)
    setCanRedo(false)
    _applyBlocks(newBlocks)
  }

  function _writeBlocks(p, newBlocks) {
    /** Pure helper: return updated project with newBlocks at the active location */
    const doc = p.documents[activeDoc]
    if (activeSubdoc !== null) {
      const newSubdocs = (doc.subdocs ?? []).map((sd, i) =>
        i === activeSubdoc ? { ...sd, blocks: newBlocks } : sd
      )
      return { ...p, documents: { ...p.documents, [activeDoc]: { ...doc, subdocs: newSubdocs } } }
    }
    return { ...p, documents: { ...p.documents, [activeDoc]: { ...doc, blocks: newBlocks } } }
  }

  function _readBlocks(p) {
    /** Pure helper: read blocks from active location in a given project snapshot */
    const doc = p.documents[activeDoc]
    if (activeSubdoc !== null) return doc?.subdocs?.[activeSubdoc]?.blocks ?? []
    return doc?.blocks ?? []
  }

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prev = undoStack.current[undoStack.current.length - 1]
    undoStack.current = undoStack.current.slice(0, -1)
    setProject(p => {
      if (!p || !activeDoc) return p
      redoStack.current = [...redoStack.current.slice(-49), _readBlocks(p)]
      setCanUndo(undoStack.current.length > 0)
      setCanRedo(true)
      const updated = _writeBlocks(p, prev)
      saveProject(updated).catch(() => {})
      return updated
    })
  }, [activeDoc, activeSubdoc])

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const next = redoStack.current[redoStack.current.length - 1]
    redoStack.current = redoStack.current.slice(0, -1)
    setProject(p => {
      if (!p || !activeDoc) return p
      undoStack.current = [...undoStack.current.slice(-49), _readBlocks(p)]
      setCanUndo(true)
      setCanRedo(redoStack.current.length > 0)
      const updated = _writeBlocks(p, next)
      saveProject(updated).catch(() => {})
      return updated
    })
  }, [activeDoc, activeSubdoc])

  // Reset undo/redo stacks when switching documents or sub-documents
  useEffect(() => {
    undoStack.current = []
    redoStack.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [activeDoc, activeSubdoc])

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    function onKey(e) {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  /** Called by MetadataPanel when any metadata field is committed */
  function updateMeta(newMeta) {
    if (!project) return
    const updated = { ...project, metadata: newMeta }
    save(updated)
  }

  // ── Sub-document management ────────────────────────────────────────────────

  function openAddSubdoc(docId) {
    setAddingSubdocFor(docId)
    setNewSubdocName('')
    // Focus the input on next tick
    setTimeout(() => subdocInputRef.current?.focus(), 50)
  }

  function confirmAddSubdoc() {
    const docId = addingSubdocFor
    const name  = newSubdocName.trim()
    if (!name || !docId || !project) { setAddingSubdocFor(null); return }
    const doc          = project.documents[docId]
    const existingBlocks = doc.blocks ?? []
    const currentSubdocs = doc.subdocs ?? []
    // If this is the first subdoc and there are existing blocks, adopt them
    const newSubdoc = { name, blocks: currentSubdocs.length === 0 ? existingBlocks : [] }
    const newSubdocs = [...currentSubdocs, newSubdoc]
    const updated = {
      ...project,
      documents: {
        ...project.documents,
        [docId]: {
          ...doc,
          blocks:  currentSubdocs.length === 0 ? [] : existingBlocks, // clear parent only on first
          subdocs: newSubdocs,
        },
      },
    }
    save(updated)
    setAddingSubdocFor(null)
    setNewSubdocName('')
    // Navigate into the new subdoc
    setActiveDoc(docId)
    setActiveSubdoc(newSubdocs.length - 1)
  }

  function deleteSubdoc(docId, idx) {
    const doc  = project.documents[docId]
    const sd   = doc.subdocs?.[idx]
    if (!sd) return
    if (!window.confirm(`Delete sub-document "${sd.name}"? This cannot be undone.`)) return
    const newSubdocs = (doc.subdocs ?? []).filter((_, i) => i !== idx)
    const updated = {
      ...project,
      documents: {
        ...project.documents,
        [docId]: { ...doc, subdocs: newSubdocs },
      },
    }
    save(updated)
    // If we were inside the deleted subdoc, go back to parent
    if (activeDoc === docId && activeSubdoc === idx) {
      setActiveSubdoc(null)
    } else if (activeDoc === docId && activeSubdoc > idx) {
      setActiveSubdoc(activeSubdoc - 1)
    }
  }

  function renameSubdoc(docId, idx, newName) {
    const doc = project.documents[docId]
    const newSubdocs = (doc.subdocs ?? []).map((sd, i) =>
      i === idx ? { ...sd, name: newName } : sd
    )
    const updated = {
      ...project,
      documents: { ...project.documents, [docId]: { ...doc, subdocs: newSubdocs } },
    }
    save(updated)
  }

  /**
   * Flush the pending debounced auto-save and wait for the explicit save to
   * complete.  Call this before any PDF/Word export so the backend always reads
   * the latest _result values from the database.
   */
  // Re-compress every image block in a project to JPEG 85% / 1920px max.
  // Returns a new project object — does not mutate the original.
  async function _recompressProjectImages(proj) {
    function recompressB64(dataUrl) {
      return new Promise((resolve) => {
        if (!dataUrl || dataUrl.includes('data:image/svg+xml')) {
          resolve(dataUrl)
          return
        }
        const img = new window.Image()
        img.onload = () => {
          let { width, height } = img
          const maxDim = 1920
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
            else { width = Math.round(width * maxDim / height); height = maxDim }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.onerror = () => resolve(dataUrl)
        img.src = dataUrl
      })
    }

    // Deep clone so we never mutate React state in place
    const clone = JSON.parse(JSON.stringify(proj))

    // Compress cover image
    if (clone.metadata?.cover_image_b64) {
      clone.metadata.cover_image_b64 = await recompressB64(clone.metadata.cover_image_b64)
    }

    // Compress image blocks in every document and sub-document
    for (const doc of Object.values(clone.documents || {})) {
      for (const block of doc.blocks || []) {
        if (block.type === 'image' && block.data?.image_b64) {
          block.data.image_b64 = await recompressB64(block.data.image_b64)
        }
      }
      for (const subdoc of doc.subdocs || []) {
        for (const block of subdoc.blocks || []) {
          if (block.type === 'image' && block.data?.image_b64) {
            block.data.image_b64 = await recompressB64(block.data.image_b64)
          }
        }
      }
    }

    return clone
  }

  // Flush pending auto-save before export.
  // Returns true if the save succeeded, false if it ultimately failed.
  // On 413 (project too large) it automatically recompresses all images
  // and retries — so the image actually makes it into the database.
  async function _flushSave() {
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = null
    if (!project) return true
    setSaving(true)
    try {
      await saveProject(project)
      return true
    } catch (err) {
      const is413 = err.message.includes('413') || err.message.toLowerCase().includes('too large')
      if (!is413) {
        console.warn('Pre-export save failed:', err.message)
        return false
      }
      // 413: recompress every image in the project and retry
      console.warn('Project too large — recompressing images and retrying save…')
      try {
        const compressed = await _recompressProjectImages(project)
        await saveProject(compressed)
        // Update React state so future saves also use compressed images
        setProject(compressed)
        return true
      } catch (err2) {
        console.warn('Recompressed save also failed — proceeding with DB state:', err2.message)
        return false
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleGeneratePdf() {
    if (!activeDoc) return
    setPdfGenerating(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Note: latest changes could not be saved (project may be too large). ' +
                 'Generating PDF from last saved version.')
      }
      const blob     = await generatePdf(projectId, activeDoc)
      const url      = URL.createObjectURL(blob)
      const anchor   = document.createElement('a')
      anchor.href    = url
      anchor.download = `${project.metadata.project_ref || projectId}_${activeDoc}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      if (saved) setError(null)
    } catch (err) {
      setError(`PDF generation failed: ${err.message}`)
    } finally {
      setPdfGenerating(false)
    }
  }

  async function handleGeneratePdfZip() {
    if (!activeDoc) return
    setPdfZipGenerating(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Note: latest changes could not be saved (project may be too large). ' +
                 'Generating PDFs from last saved version.')
      }
      const blob   = await generatePdfZip(projectId, activeDoc)
      const url    = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href  = url
      anchor.download = `${project.metadata.project_ref || projectId}_${activeDoc}_separate.zip`
      anchor.click()
      URL.revokeObjectURL(url)
      if (saved) setError(null)
    } catch (err) {
      setError(`PDF generation failed: ${err.message}`)
    } finally {
      setPdfZipGenerating(false)
    }
  }

  async function handleGenerateWord() {
    if (!activeDoc) return
    setWordGenerating(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Note: latest changes could not be saved (project may be too large). ' +
                 'Generating Word export from last saved version.')
      }
      const blob   = await generateWord(projectId, activeDoc)
      const url    = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href  = url
      anchor.download = `${project.metadata.project_ref || projectId}_${activeDoc}.docx`
      anchor.click()
      URL.revokeObjectURL(url)
      if (saved) setError(null)
    } catch (err) {
      setError(`Word export failed: ${err.message}`)
    } finally {
      setWordGenerating(false)
    }
  }

  async function handlePreviewPdf() {
    if (!activeDoc) return
    setPdfGenerating(true)
    setError(null)
    try {
      const saved = await _flushSave()
      if (!saved) {
        setError('Note: latest changes could not be saved (project may be too large). ' +
                 'Showing PDF from last saved version.')
      }
      const blob = await generatePdf(projectId, activeDoc)
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
      setPdfPreviewUrl(URL.createObjectURL(blob))
      if (saved) setError(null)
    } catch (err) {
      setError(`PDF preview failed: ${err.message}`)
    } finally {
      setPdfGenerating(false)
    }
  }

  function handleClosePdfPreview() {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(null)
  }

  function handleApplyTemplate(tpl) {
    setTplOpen(false)
    const existing = _currentBlocks()
    if (existing.length > 0) {
      if (!window.confirm(`Apply template "${tpl.label}"? This will replace the existing content.`)) return
    }
    updateBlocks(tpl.make())
  }

  async function handleSaveAsTemplate() {
    if (!project || !tplNameInput.trim()) return
    setSavingTemplate(true)
    setError(null)
    try {
      await _flushSave()
      await saveProjectAsTemplate(projectId, {
        name:       tplNameInput.trim(),
        description: '',
        visibility:  project.visibility || 'team',
      })
      setTplNamePrompt(false)
      setTplNameInput('')
      // Small confirmation without a blocking dialog
      setError('✓ Saved as template "' + tplNameInput.trim() + '". Find it on the home page → Templates.')
      setTimeout(() => setError(null), 4000)
    } catch (err) {
      setError('Could not save template: ' + err.message)
    } finally {
      setSavingTemplate(false)
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>
  if (!project) return <div style={{ padding: 40 }}>Project not found.</div>

  const currentDoc    = activeDoc ? project.documents[activeDoc] : null
  const currentBlocks = activeDoc
    ? (activeSubdoc !== null
        ? (currentDoc?.subdocs?.[activeSubdoc]?.blocks ?? [])
        : (currentDoc?.blocks ?? []))
    : []

  // Toolbar title
  const toolbarTitle = !activeDoc
    ? 'Project Information'
    : activeSubdoc !== null
      ? `${activeDoc}.${activeSubdoc + 1} — ${currentDoc?.subdocs?.[activeSubdoc]?.name || 'Sub-document'}`
      : `${activeDoc} — ${DOC_DEFS[activeDoc]}`

  return (
    <>
    <div style={styles.layout}>

      {/* ── Left sidebar ── */}
      <aside style={styles.sidebar}>

        {/* Brand stripe + project header */}
        <div style={styles.sidebarHeader}>
          {/* Logo row */}
          <div style={styles.sidebarBrand}>
            <img src="/logo.png" alt="Omkreds" style={{ height: 90, width: 'auto', marginTop: -22, marginBottom: -22 }} />
          </div>

          {/* Back link + project info */}
          <button
            style={styles.backBtn}
            onClick={() => navigate('/')}
            onMouseEnter={e => e.currentTarget.style.color = '#475569'}
            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
          >
            ← All projects
          </button>
          <div style={styles.projectName}>
            {project.metadata.project_name}
          </div>
          <div style={styles.projectRef}>
            {project.metadata.project_ref
              ? `${project.metadata.project_ref} · Rev ${project.metadata.revision}`
              : `Rev ${project.metadata.revision}`}
          </div>
        </div>

        {/* Document navigation */}
        <nav style={styles.sidebarNav}>
          {DOC_GROUPS.map(group => (
            <div key={group.label}>
              <div style={styles.groupLabel}>{group.label}</div>
              {group.docs.map(docId => {
                const doc     = project.documents[docId]
                const subdocs = doc?.subdocs ?? []
                const blocks  = doc?.blocks  ?? []
                const isParentActive = activeDoc === docId && activeSubdoc === null
                return (
                  <React.Fragment key={docId}>

                    {/* Parent doc button */}
                    <button
                      style={styles.docBtn(isParentActive)}
                      onClick={() => { setActiveDoc(docId); setActiveSubdoc(null) }}
                    >
                      <span style={styles.docId}>{docId}</span>
                      {DOC_DEFS[docId]}
                      {subdocs.length > 0
                        ? <span style={{ fontSize: 10, color: '#aaa', marginLeft: 'auto' }}>{subdocs.length} sub</span>
                        : blocks.length > 0
                          ? <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>({blocks.length})</span>
                          : null
                      }
                    </button>

                    {/* Sub-documents */}
                    {subdocs.map((sd, si) => (
                      <div key={si} style={{ display: 'flex', alignItems: 'center' }}>
                        <button
                          style={{
                            ...styles.docBtn(activeDoc === docId && activeSubdoc === si),
                            flex: 1,
                            paddingLeft: 28,
                            fontSize: 11,
                          }}
                          onClick={() => { setActiveDoc(docId); setActiveSubdoc(si) }}
                        >
                          <span style={{ ...styles.docId, fontSize: 9 }}>{docId}.{si + 1}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sd.name || `Sub-document ${si + 1}`}
                          </span>
                        </button>
                        <button
                          title="Delete sub-document"
                          onClick={() => deleteSubdoc(docId, si)}
                          style={{
                            flexShrink: 0, background: 'none', border: 'none',
                            color: '#ccc', cursor: 'pointer', padding: '0 6px',
                            fontSize: 12, lineHeight: 1,
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                          onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                        >✕</button>
                      </div>
                    ))}

                    {/* Add sub-document row */}
                    {addingSubdocFor === docId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 28px' }}>
                        <input
                          ref={subdocInputRef}
                          value={newSubdocName}
                          onChange={e => setNewSubdocName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmAddSubdoc()
                            if (e.key === 'Escape') setAddingSubdocFor(null)
                          }}
                          placeholder="Name…"
                          style={{
                            flex: 1, minWidth: 0, fontSize: 11, padding: '3px 6px',
                            border: '1px solid #cbd5e1', borderRadius: 3, outline: 'none',
                          }}
                        />
                        <button
                          onClick={confirmAddSubdoc}
                          style={{ fontSize: 11, padding: '3px 7px', background: BRAND, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                        >✓</button>
                        <button
                          onClick={() => setAddingSubdocFor(null)}
                          style={{ fontSize: 11, padding: '3px 6px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 3, cursor: 'pointer', color: '#94a3b8' }}
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openAddSubdoc(docId)}
                        style={{
                          display: 'block', width: '100%', background: 'none', border: 'none',
                          textAlign: 'left', paddingLeft: 28, paddingTop: 3, paddingBottom: 5,
                          fontSize: 11, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = BRAND}
                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                      >
                        + Add sub-document
                      </button>
                    )}

                  </React.Fragment>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer: project info + save-as-template */}
        <div style={styles.sidebarFooter}>
          <button
            style={styles.metaBtn(activeDoc === null)}
            onClick={() => setActiveDoc(null)}
          >
            ⚙ Project info
          </button>

          {/* ── Save as template ── */}
          {tplNamePrompt ? (
            <div style={{ padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <input
                value={tplNameInput}
                onChange={e => setTplNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveAsTemplate()
                  if (e.key === 'Escape') { setTplNamePrompt(false); setTplNameInput('') }
                }}
                placeholder="Template name…"
                autoFocus
                style={{
                  fontSize: 11, padding: '5px 7px', fontFamily: 'inherit',
                  border: '1px solid #cbd5e1', outline: 'none', color: '#1c1c1e',
                }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={savingTemplate || !tplNameInput.trim()}
                  style={{
                    flex: 1, background: '#6366f1', color: '#fff', border: 'none',
                    padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit', opacity: savingTemplate || !tplNameInput.trim() ? 0.5 : 1,
                  }}
                >
                  {savingTemplate ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setTplNamePrompt(false); setTplNameInput('') }}
                  style={{
                    background: 'none', border: '1px solid #e2e8f0', color: '#94a3b8',
                    padding: '5px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >✕</button>
              </div>
            </div>
          ) : (
            <button
              style={{ ...styles.metaBtn(false), color: '#6366f1' }}
              onClick={() => {
                setTplNameInput(project?.metadata?.project_name || '')
                setTplNamePrompt(true)
              }}
            >
              📋 Save as template
            </button>
          )}
        </div>

      </aside>

      {/* ── Main area ── */}
      <main style={styles.main}>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          {/* Back button when inside a sub-document */}
          {activeSubdoc !== null && (
            <button
              style={{ ...styles.tplBtn, marginRight: 4, color: BRAND, borderColor: '#c7d2fe' }}
              onClick={() => setActiveSubdoc(null)}
              title={`Back to ${activeDoc}`}
            >
              ← {activeDoc}
            </button>
          )}
          <span style={styles.docTitle}>{toolbarTitle}</span>
          {saving && <span style={styles.saving}>Saving…</span>}

          {/* Undo / Redo */}
          {activeDoc && (
            <span style={{ display: 'flex', gap: 2 }}>
              <button
                style={{ ...styles.tplBtn, padding: '6px 10px', opacity: canUndo ? 1 : 0.35 }}
                onClick={handleUndo} disabled={!canUndo} title="Undo  (Ctrl+Z)"
              >↩</button>
              <button
                style={{ ...styles.tplBtn, padding: '6px 10px', opacity: canRedo ? 1 : 0.35 }}
                onClick={handleRedo} disabled={!canRedo} title="Redo  (Ctrl+Y)"
              >↪</button>
            </span>
          )}

          {/* Clipboard paste indicator */}
          {clipboard && activeDoc && (
            <span style={{ fontSize: 11, color: '#4a90d9' }}>
              📋 {clipboard.type} copied
            </span>
          )}

          {/* Template dropdown — shown whenever a document is open */}
          {activeDoc && (
            <div ref={tplRef} style={{ position: 'relative' }}>
              <button
                style={styles.tplBtn}
                onClick={() => setTplOpen(o => !o)}
              >
                📋 Template ▾
              </button>

              {tplOpen && (
                <div style={styles.tplDropdown}>
                  {(DOC_TEMPLATES[activeDoc] ?? []).length > 0 ? (
                    (DOC_TEMPLATES[activeDoc]).map((tpl, i) => (
                      <button
                        key={i}
                        style={styles.tplItem}
                        onClick={() => handleApplyTemplate(tpl)}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f5f7'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        <div style={styles.tplItemLabel}>{tpl.label}</div>
                        <div style={styles.tplItemDesc}>{tpl.description}</div>
                      </button>
                    ))
                  ) : (
                    <div style={styles.tplEmpty}>
                      No templates for {activeDoc}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeDoc && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ ...styles.pdfBtn, background: '#4a5568' }}
                onClick={handlePreviewPdf}
                disabled={pdfGenerating}
                onMouseEnter={e => { if (!pdfGenerating) e.currentTarget.style.background = '#2d3748' }}
                onMouseLeave={e => { if (!pdfGenerating) e.currentTarget.style.background = '#4a5568' }}
                title="Preview PDF in browser"
              >
                {pdfGenerating ? '⏳' : '👁 Preview'}
              </button>
              <button
                style={{ ...styles.pdfBtn, opacity: pdfGenerating ? 0.6 : 1 }}
                onClick={handleGeneratePdf}
                disabled={pdfGenerating}
                onMouseEnter={e => { if (!pdfGenerating) e.currentTarget.style.background = BRAND_LT }}
                onMouseLeave={e => { if (!pdfGenerating) e.currentTarget.style.background = BRAND }}
                title="Export all sub-documents combined into one PDF"
              >
                ↓ Export PDF
              </button>
              {/* Separate PDFs button — only when the document has sub-documents */}
              {(project?.documents?.[activeDoc]?.subdocs?.length > 0) && (
                <button
                  style={{ ...styles.pdfBtn, background: '#6d4c9e', opacity: pdfZipGenerating ? 0.6 : 1 }}
                  onClick={handleGeneratePdfZip}
                  disabled={pdfZipGenerating}
                  onMouseEnter={e => { if (!pdfZipGenerating) e.currentTarget.style.background = '#4c2d72' }}
                  onMouseLeave={e => { if (!pdfZipGenerating) e.currentTarget.style.background = '#6d4c9e' }}
                  title="Download each sub-document as a separate PDF (ZIP archive)"
                >
                  {pdfZipGenerating ? '⏳' : '↓ Separate PDFs'}
                </button>
              )}
              <button
                style={{ ...styles.pdfBtn, background: '#2d6a4f', opacity: wordGenerating ? 0.6 : 1 }}
                onClick={handleGenerateWord}
                disabled={wordGenerating}
                onMouseEnter={e => { if (!wordGenerating) e.currentTarget.style.background = '#1b4332' }}
                onMouseLeave={e => { if (!wordGenerating) e.currentTarget.style.background = '#2d6a4f' }}
                title="Export as Word document (.docx)"
              >
                {wordGenerating ? '⏳' : '↓ Export Word'}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {error && (
            <div style={error.startsWith('✓')
              ? { ...styles.error, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '3px solid #16a34a' }
              : styles.error
            }>{error}</div>
          )}

          {activeDoc === null ? (
            // No document selected — show project metadata form
            <MetadataPanel
              project={project}
              onSave={updateMeta}
            />
          ) : (
            // Document selected — show block editor
            <BlockList
              blocks={currentBlocks}
              onChange={updateBlocks}
              templates={templates}
              onManageTemplates={() => { setTmplEditorInitId(null); setTmplEditorOpen(true) }}
              onOpenTemplateEditor={(id) => { setTmplEditorInitId(id); setTmplEditorOpen(true) }}
              clipboard={clipboard}
              onCopyBlock={(b) => setClipboard(JSON.parse(JSON.stringify(b)))}
            />
          )}
        </div>

      </main>

    </div>

    {/* ── Template editor modal ── */}
    {tmplEditorOpen && (
      <TemplateEditorModal
        initialTemplateId={tmplEditorInitId}
        onClose={() => { setTmplEditorOpen(false); setTmplEditorInitId(null) }}
        onTemplatesChanged={loadTemplates}
      />
    )}

    {/* ── PDF preview modal ── */}
    {pdfPreviewUrl && (
      <div style={styles.pdfOverlay} onClick={e => e.target === e.currentTarget && handleClosePdfPreview()}>
        <div style={styles.pdfModal}>
          {/* Header */}
          <div style={styles.pdfModalHeader}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              PDF Preview — {activeDoc}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                style={styles.pdfDownloadBtn}
                onClick={handleGeneratePdf}
              >
                ↓ Download
              </button>
              <button style={styles.pdfCloseBtn} onClick={handleClosePdfPreview}>✕</button>
            </div>
          </div>
          {/* PDF iframe — browsers render PDFs natively */}
          <iframe
            src={pdfPreviewUrl}
            style={styles.pdfIframe}
            title="PDF Preview"
          />
        </div>
      </div>
    )}
    </>
  )
}
