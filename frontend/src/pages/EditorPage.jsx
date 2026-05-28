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
    { id: id++, type: 'heading', data: { level: 1, text: 'A1 Projektgrundlag' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 1. KONSTRUKTIONSAFSNIT
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: '1. Konstruktionsafsnit' } },

    { id: id++, type: 'heading', data: { level: 3, text: '1.1 Bygvaerkets art og anvendelse' } },
    { id: id++, type: 'text', data: { text: 'Naervaerende statiske dokumentation vedroerer [nybyggeri / tilbygning / ombygning] af [bygningstype, fx etageboliger / kontorhus / hotel] beliggende [adresse], matr. [matrikelnummer].\n\nBygherren er: ...\nSags. nr.: ...\n\nBygningen er [antal] etager [med / uden] kaelder. Det samlede bebyggede areal er ca. ... m2 og det samlede etageareal er ca. ... m2.\n\n[Beskriv bygningens opdeling i konstruktionsafsnit og hvilke dele der er omfattet af naervaerende dokumentation. Indsaet oversigtstegning som billede.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '1.2 Konstruktioners art og opbygning' } },
    { id: id++, type: 'text', data: { text: 'Bygningens primaere baerende system er opbygget som [beskriv konstruktionsprincip, fx: CLT-daek baaret af limtraebjaelker og lette traeskeletvagge / in-situ betondaek med stalsojler og betonkerner / etc.].\n\nLodrette laster: daek -> bjaelker -> soejler/vaegge -> fundament -> undergrund\nVandret stabilisering: [skiver / rammer / kryds / kerne]\n\n[Beskriv spaendretning for daek, udkragninger, saerlige konstruktive forhold. Indsaet opstalt/snit som billede.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '1.3 Konstruktionsafsnit' } },
    { id: id++, type: 'text', data: { text: 'Opbygningen foelger SBI-anvisning 271, 3. udgave. Naervaerende dokumentation omhandler konstruktionsafsnit markeret med fed nedenfor.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 1.1 — Oversigt over konstruktionsafsnit',
      has_header: true,
      rows: [
        ['Afsnit nr.', 'Afsnit', 'CC / KK', 'Ansvarlig'],
        ['A2.1', '[fx CLT konstruktioner]', 'CC2/KK2', '[Firma]'],
        ['A2.2', '[fx Traeskeletvagge]', 'CC2/KK2', 'Leverandoer'],
        ['A2.3', '[fx In-situ konstruktioner / Beton]', 'CC2/KK2', '[Firma]'],
        ['A2.4', '[fx Stalkonstruktioner]', 'CC2/KK2', '[Firma]'],
        ['A2.5', '[fx Trapper og raekvark]', 'CC2/KK2', 'Leverandoer'],
        ['A2.6', '[fx Terrændaek og fundering]', 'CC2/KK2', '[Firma]'],
      ]
    }},

    // ─────────────────────────────────────────────────────────────────────────
    // 2. GRUNDLAG
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: '2. Grundlag' } },

    { id: id++, type: 'heading', data: { level: 3, text: '2.1 Normer og standarder' } },
    { id: id++, type: 'text', data: { text: 'Projektet er udarbejdet iht. Bygningsreglementet 2018 (BR18) og er i overensstemmelse med SBi-anvisning 271, 3. udgave. Slet de raekker der ikke er relevante for dette projekt.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 2.1 — Gaeldende normer og standarder',
      has_header: true,
      rows: [
        ['Standard', 'Titel', 'DK NA udgave'],
        ['BR18', 'Bygningsreglementet', '2018 inkl. aendringer'],
        ['DS/INF 1990', 'Vejledning til konsekvensklasser (Tabel 2)', '2021+Till.1:2022'],
        ['DS 1140', 'Dokumentation og kontrol af baerende konstruktioner', '2014'],
        ['DS/EN 1990', 'Projekteringsgrundlag (EC0)', 'DK NA:2024'],
        ['DS/EN 1991-1-1', 'Nyttelaster pa bygninger (EC1)', 'DK NA:2024'],
        ['DS/EN 1991-1-2', 'Brandlast (EC1)', 'DK NA:2014'],
        ['DS/EN 1991-1-3', 'Snelaster (EC1)', 'DK NA:2015 ver.2'],
        ['DS/EN 1991-1-4', 'Vindlaster (EC1)', 'DK NA:2015'],
        ['DS/EN 1991-1-5', 'Termiske laster (EC1)', 'DK NA:2012'],
        ['DS/EN 1991-1-7', 'Ulykkeslast (EC1)', 'DK NA:2013'],
        ['DS/EN 1992-1-1', 'Betonkonstruktioner (EC2)', 'DK NA:2021'],
        ['DS/EN 1992-1-2', 'Beton — brandteknisk dimensionering (EC2)', 'DK NA:2011'],
        ['DS/EN 1993-1-1', 'Stalkonstruktioner (EC3)', 'DK NA:2019'],
        ['DS/EN 1993-1-8', 'Stalsamlinger (EC3)', 'DK NA:2019'],
        ['DS/EN 1995-1-1', 'Traekonstruktioner (EC5)', 'DK NA:2019'],
        ['DS/EN 1995-1-2', 'Trae — brandteknisk dimensionering (EC5)', 'DK NA:2007'],
        ['DS/EN 1996-1-1', 'Murvaerkskonstruktioner (EC6)', 'DK NA:2019'],
        ['DS/EN 1997-1', 'Geoteknisk projektering (EC7)', 'DK NA:2021'],
        ['DS/EN 1997-2', 'Geoteknik — jordbundsundersoegelser (EC7)', 'DK NA:2013'],
      ]
    }},

    // ── 2.2 Konsekvensklasser ────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 3, text: '2.2 Konsekvensklasser og konstruktionsklasser' } },

    { id: id++, type: 'heading', data: { level: 3, text: '2.2.1 Konsekvensklasse — DS/INF 1990:2021 Tabel 2' } },
    { id: id++, type: 'text', data: { text: 'Konstruktioner henfoeres til konsekvensklasse iht. DS/INF 1990:2021+Till.1:2022 Tabel 2. Tabellen angiver maksimalt tilladt spaendvidde [m], hojde over/under terraen [m] og etageantal for CC1 og CC2. Vaerdier der overskrider CC2-graenserne kraever CC3.\n\nSymboler: * = ingen begraensning   -- = ikke relevant/ikke tilladt   Tal = max. tilladte vaerdi\nHojde: "o.t." = over terraen / "u.t." = under terraen' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 2.2 — Konsekvensklasse (DS/INF 1990:2021+Till.1:2022, Tabel 2)',
      has_header: true,
      rows: [
        ['Nr.', 'Bygningsanvendelse', 'Max spandv. CC1 [m]', 'Max spandv. CC2 [m]', 'Max hojde CC1 o.t./u.t. [m]', 'Max hojde CC2 o.t./u.t. [m]', 'Max etager CC1', 'Max etager CC2'],
        ['1',  'Laengere ophold: beboelse, kontor, hotel, dag-/doegninstitution, undervisning, klinik', '*',  '16',  '0 / 0',  '12 / 6',  '*',  '5'],
        ['2',  'Hospital',                                                                               '*',  '16',  '0 / 0',  '-- / 6',  '*',  '2'],
        ['3',  'Forsamling <=150 pers.: koncert, sport, kirke, auditorium, udstilling, teater, detailhandel, overdaekninger', '*', '16', '0 / 0', '12 / 6', '*', '2'],
        ['4',  'Forsamling >150 pers. (samme typer som nr. 3)',                                          '*',  '12',  '0 / 0',  '6 / 0',   '*',  '1'],
        ['5',  'Forsamling, tribuner >150 pers.',                                                        '--', '8',   '0 / 0',  '8 / 6',   '*',  '*'],
        ['6',  'Forsamling, overdaekninger og scener >150 pers.',                                        '--', '12',  '0 / --', '16 / --', '*',  '*'],
        ['7',  'Industri: sundhedsskadelige kemikalier — saerligt store konsekvenser',                   '*',  '--',  '0 / 0',  '0 / 0',   '*',  '*'],
        ['8',  'Industri: meget store konsekvenser (forurenende, samfundsmaessig bet. arkiver)',          '*',  '--',  '0 / 0',  '0 / 0',   '*',  '*'],
        ['9',  'Industri: kraftvarme, visse bygninger til vareproduktion — andre konsekvenser',           '*',  '40',  '0 / 0',  '12 / 6',  '*',  '*'],
        ['10', 'Industri/lager med ophold for fa personer: landbrug, vaeksthuse, siloanlæg',             '40', '*',   '20 / 3', '30 / 6',  '*',  '*'],
        ['11', 'Dyrehold med arbejdspladser',                                                            '20', '40',  '12 / 3', '16 / 6',  '*',  '*'],
        ['12', 'Parkeringsanlaeg',                                                                       '6',  '18',  '-- / 0', '20 / 6',  '1',  '6'],
        ['13', 'Master og skorstene (abent ubeboet landskab)',                                           '*',  '*',   '50 / --','200 / --', '*',  '*'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Projektets bygningsanvendelse: Raekke [nr.] — [beskrivelse]\nStorste spaendvidde: ... m   Hojde: ... m o.t. / ... m u.t.   Etager: ...\n\nValgt konsekvensklasse: CC[1/2/3]\nKFI-faktor (STR/GEO): [0,9 / 1,0 / 1,1]   Paalidelighedsklasse: RC[1/2/3]\n\nBegrundelse: [Beskriv kort hvordan bygningens anvendelse, spaendvidde, hojde og etageantal placerer den i den valgte CC-klasse med reference til ovenstaaende tabel]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '2.2.2 Konstruktionsklasse — DS 1140:2014 og BR18' } },
    { id: id++, type: 'text', data: { text: 'Konstruktioner henfoeres til konstruktionsklasse KK[2] iht. BR18.\n\nHovedreglen: KK-klassen foelger CC-klassen direkte (CC1->KK1, CC2->KK2, CC3->KK3).\n\nUndtagelse — BR18 §489 (CC3-bygning kan placeres i KK2 naar alle tre krav er opfyldt):\n  1. Simpel og traditionel ombygning/forandring af eksisterende enkel konstruktion\n  2. Etagebyggeri til laengere ophold (beboelse, kontor, hotel, dag-/doegninstitution)\n  3. Hojst 6 etager over terraen OG spaendvidde pa hojst 8 m\n\nValgt konstruktionsklasse: KK[2]\nBegrundelse: ...' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 2.3 — Krav pr. konstruktionsklasse (DS 1140:2014)',
      has_header: true,
      rows: [
        ['Klasse', 'CC', 'Projekteringskontrol', 'Udforelseskontrol', 'Dokumentation'],
        ['KK1', 'CC1', 'Egenkontrol af projekterende', 'Egenkontrol af udforende', 'Ingen saerlige krav'],
        ['KK2', 'CC2', 'Uvildig kontrol — anden person i firmaet er OK', 'Egenkontrol + stikprovekontrol', 'Kontrolplan B2 + kontrolrapport B3'],
        ['KK3', 'CC3', 'Ekstern uvildig kontrol (eksternt firma kraeves)', 'Udvidet uvildig udforelseskontrol', 'B2 + B3 + tredjepartsgodkendelse'],
        ['KK4', 'Saerlig', 'Saerlig kontrol — aftales individuelt', 'Saerlig kontrol — aftales', 'Individuel aftale med bygningsmyndighed'],
      ]
    }},

    // ── 2.3 Sikkerhed ────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 3, text: '2.3 Sikkerhed' } },
    { id: id++, type: 'text', data: { text: 'Bygningen henfoeres til foelgende sikkerhedsklasser:\n  Konsekvensklasse:    CC[2]\n  Konstruktionsklasse: KK[2]\n  Paalidelighedsklasse: RC[2]\n  KFI-faktor (STR/GEO): [1,0]\n  Geoteknisk kategori: GK[2]\n  Brandklasse (BR18):  BK[2]' } },

    // ── 2.4 IKT-vaerktoejer ──────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 3, text: '2.4 IKT-vaerktojer' } },
    { id: id++, type: 'text', data: { text: 'Foelgende software er anvendt i projekteringen:\n  [Beregningsprogram, fx Tekla Tedds / Robot Structural Analysis / RFEM / FEM-Design]\n  Microsoft Office 365 — Word / Excel\n  [BIM-program, fx Revit / Archicad]\n  [Evt. specialsoftware]' } },

    // ── 2.5 Referencer ───────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 3, text: '2.5 Referencer' } },
    { id: id++, type: 'text', data: { text: '[1] Bygningsreglement BR18, seneste udgave\n[2] SBi-anvisning 271, 3. udgave — Dokumentation og kontrol af baerende konstruktioner\n[3] DS/INF 1990:2021+Till.1:2022 — Vejledning til konsekvensklasser\n[4] [Geoteknisk rapport, firma, rapport nr., dato]\n[5] [Arkitekttegninger, tegningsliste, revisioner]\n[6] [Evt. andre referencer]' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 3. FORUNDERSOEGELSER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: '3. Forundersoegelser' } },

    { id: id++, type: 'heading', data: { level: 3, text: '3.1 Grunden og lokale forhold' } },
    { id: id++, type: 'text', data: { text: '[Beskriv grundens beskaffenhed, terrain, afvandingsforhold og lokale paavirkninger. Alternativt: Ikke relevant for denne dokumentation.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '3.2 Geotekniske forhold' } },
    { id: id++, type: 'text', data: { text: 'Geoteknisk kategori: GK[2] (DS/EN 1997-1)\n\nFunderingsforhold (fra geoteknisk rapport [ref.]):\n  Baeredygtig jordbundsydelse: sigma = ... kN/m2\n  Fundamentskote (underkant): +... m DVR90 (ca. ... m under terraen)\n  Frostfridybde: 0,9 m (DK NA til DS/EN 1997-1)\n  Grundvandskote: +... m DVR90\n\nJordparametre (karakteristiske vaerdier):\n  Friktionsvinkel: phi_k = ... grader\n  Kohaesion: c_k = ... kPa\n  Effektiv rumvaegt: gamma_k = ... kN/m3' } },

    { id: id++, type: 'heading', data: { level: 3, text: '3.3 Klima- og miljoetekniske forhold' } },
    { id: id++, type: 'text', data: { text: '[Beskriv relevante klima- og miljoetekniske paavirkninger, fx aggressivt miljo, kysteksponering, hoj luftfugtighed, forurenet jord. Alternativt: Ikke relevant for denne dokumentation.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '3.4 Eksisterende konstruktioner' } },
    { id: id++, type: 'text', data: { text: '[Beskriv eksisterende konstruktioner der er relevante for projektet. Alternativt: Ikke relevant for denne dokumentation.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '3.5 Tilstodende eksisterende bygvaerker' } },
    { id: id++, type: 'text', data: { text: '[Beskriv evt. nabobyggeriers indflydelse (saetninger, vibrationer, graevning). Alternativt: Ikke relevant for denne dokumentation.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '3.6 Tilstodende pataenkte bygvaerker' } },
    { id: id++, type: 'text', data: { text: '[Beskriv fremtidige planlagte byggerier i naerheden. Alternativt: Ikke relevant for denne dokumentation.]' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 4. KONSTRUKTIONER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: '4. Konstruktioner' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.1 Statisk virkemaade' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.1.1 Lodret lastnedfoering' } },
    { id: id++, type: 'text', data: { text: '[Beskriv lastvej for lodrette laster. Eksempel:\n"De lodrette laster fra egenlast, nyttelast og naturlaster paavirker daekkene som en fladelast, der fordeles til baerende elementer. CLT-daekkene fungerer som stive plader der fordeler fladelasterne til understotningerne, hvor lasterne omdannes til linjelaster/punktlaster og oeverfoeres til soejler/vaegge, fundament og undergrund."\n\nIndsaet evt. snit- eller skemasketegning som billede.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.1.2 Vandret lastfoering' } },
    { id: id++, type: 'text', data: { text: '[Beskriv stabiliseringssystemet. Eksempel:\n"Bygningens stabiliserende hovedsystem udfoeres som lette traevagge og CLT-vaegge der virker som skiver. Daekkene fungerer som stive plader der fordeler vandrette kraefter til stabiliseringselementerne."\n\nBeskriv hvilke vaegge/kerner der stabiliserer i x- og y-retning.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.2 Anvendelseskrav' } },
    { id: id++, type: 'text', data: { text: 'Der stilles krav til udbojning (SLS):\n  Daek og bjaelker generelt: L/300 for karakteristiske lastkombinationer\n  Daek med skroebelig belaegning (fliser, terrazzo): L/400\n  Tagelementer: L/200\n\n[Tilpas efter projektets krav og aftale med bygherre. Angiv evt. absolutte vaerdier for nedbojning i mm.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.3 Komfortkrav' } },
    { id: id++, type: 'text', data: { text: 'Der stilles krav til vibrationskomfort for etagedaek. Niveau IV er normalt tilfredsstillende for etagebygninger (boliger, kontorer, hoteller).' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 4.1 — Komfortniveauer for etagedaek (acceleration og hastighed)',
      has_header: true,
      rows: [
        ['Niveau', 'w_1kN [mm]', 'f1 >= 8 Hz: v_rms [m/s]', '4,5 Hz <= f1 < 8 Hz: a_rms [m/s2]', 'Typisk anvendelse'],
        ['I',  '0,25', '0,40 x 10-3', '0,020', 'Operationsrum, sensorlaboratorier'],
        ['II', '0,25', '0,80 x 10-3', '0,040', 'Soverum i hoteller (nat)'],
        ['III','0,50', '1,20 x 10-3', '0,060', 'Boliger'],
        ['IV', '0,80', '2,00 x 10-3', '0,100', 'Kontorer, hoteller (dag) — standard'],
        ['V',  '1,20', '3,00 x 10-3', '0,150', 'Industri, restauranter'],
        ['VI', '1,60', '4,00 x 10-3', '0,200', 'Robuste industribygninger'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Valgt komfortniveau: [IV]\nBegrundelse: [fx standard etagebygning med boliger/kontorer]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.4 Funktionskrav' } },
    { id: id++, type: 'text', data: { text: 'Byggeriet gennemfoeres iht. bestemmelserne i BR18 og gaeldende normer.\n[Beskriv saerlige funktionskrav — akustik, vandtaethed, brandadskillelsesvagge, adskillelse fra installationer, etc.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.5 Robusthed' } },
    { id: id++, type: 'text', data: { text: 'Konstruktionernes robusthed vurderes iht. DS/EN 1990 + DS/EN 1991-1-7. Minimumskrav for mekaniske forbindelser til sikring mod progrederende kollaps:' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 4.2 — Minimumskrav til robusthed (punkt- og linjelast)',
      has_header: true,
      rows: [
        ['Etageantal', 'Punktlast [kN]', 'Linjelast [kN/m]'],
        ['1-2 etager', '10 (20)', '2 (4)'],
        ['3-5 etager', '20', '4'],
        ['6-10 etager', '40', '8'],
        ['11-15 etager', '60', '12'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Vaerdier i parentes gaelder ved CC2 med mere end 2 etager.' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.6 Levetid' } },
    { id: id++, type: 'text', data: { text: 'Bygvaerket henfoeres til kategori 4 iht. DS/EN 1990 Tabel 2.1 — Almindelige konstruktioner med en vejledende forventet levetid pa 50 aar.\n[Kategori 5 (100 aar) ved monumentale bygninger, broer og anlaegskonstruktioner]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.7 Brand' } },
    { id: id++, type: 'text', data: { text: 'Brandklasse (BR18 §29): BK[2]\n\nBrandtekniske krav til baerende konstruktioner:\n  Dak, saerste etage: R[60]\n  Dak, stueetage: R[60] A2-s1,d0\n  [Tilpas efter brandklasse og konstruktionstype]\n\n[Brandteknisk dokumentation udarbejdes saerskilt / er ikke en del af denne A1]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.8 Udforelse' } },
    { id: id++, type: 'text', data: { text: 'Alle maal og koter er vejledende og skal kontrolleres paa stedet inden udforelse.\n\nEventuel midlertidig afstivning hoerer til den arbejdsudforende i fuld udstraekning, inkl. evt. udarbejdelse af midlertidigt afstivningsprojekt.\n\nDer regnes med god byggeskik og faglart arbejder paa byggepladsen. Det anbefales at der udfoeres tilsyn og kvalitetssikring med alle byggeriets faser.\n\n[Saerlige udforelseskrav — tolerancer, udstobningsraekkoelge, harde- og hviletider for beton, krav til montage af praefab elementer, etc.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '4.9 Drift og vedligehold' } },
    { id: id++, type: 'text', data: { text: '[Beskriv saerlige krav til drift og vedligehold, fx inspektion af expasionsbolte, vedligehold af overfladebehandling paa stalkonstruktioner, kontrol af taedaekningens taethed. Alternativt: Ikke relevant for denne dokumentation.]' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 5. KONSTRUKTIONSMATERIALER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: '5. Konstruktionsmaterialer' } },
    { id: id++, type: 'text', data: { text: 'Nedenstaaende karakteristiske materialeegenskaber laegges til grund for dimensioneringen. Slet de afsnit der ikke er relevante for dette projekt.' } },

    { id: id++, type: 'heading', data: { level: 3, text: '5.1 Grund og jord' } },
    { id: id++, type: 'text', data: { text: '[Se afsnit 3.2 Geotekniske forhold. Alternativt: Ikke relevant.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '5.2 Beton' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 5.1 — Karakteristiske betonstyrker (DS/EN 1992-1-1)',
      has_header: true,
      rows: [
        ['Klasse', 'fck [MPa]', 'fctm [MPa]', 'Ecm [GPa]', 'Rumvaegt [kN/m3]', 'Anvendelse i projektet'],
        ['C20/25', '20', '2,2', '30', '25', ''],
        ['C25/30', '25', '2,6', '31', '25', ''],
        ['C30/37', '30', '2,9', '33', '25', ''],
        ['C35/45', '35', '3,2', '34', '25', ''],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Armering: B500 NOR (duktilitetsklasse N), fyk = 500 MPa, Es = 200 GPa\nBetondaekningstykkelse: c_nom = [25 / 30 / 35] mm (afhaengig af eksponeringsklasse)\nEksponeringsklasse: XC[1/2/3/4]\nPartialkoefficienter: gamma_C = 1,50 (beton), gamma_S = 1,15 (armering)' } },

    { id: id++, type: 'heading', data: { level: 3, text: '5.3 Staal' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 5.2 — Karakteristiske staalstyrker (DS/EN 1993-1-1)',
      has_header: true,
      rows: [
        ['Kvalitet', 'Tykkelse t [mm]', 'fy [MPa]', 'fu [MPa]', 'E [GPa]', 'Rumvaegt [kN/m3]'],
        ['S235', 't <= 40',      '235', '360', '210', '78,5'],
        ['S235', '40 < t <= 80', '215', '360', '210', '78,5'],
        ['S355', 't <= 40',      '355', '510', '210', '78,5'],
        ['S355', '40 < t <= 80', '335', '470', '210', '78,5'],
        ['S420', 't <= 40',      '420', '520', '210', '78,5'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Partialkoefficienter: gamma_M0 = 1,00 (flydning), gamma_M1 = 1,00 (instabilitet), gamma_M2 = 1,25 (brud/forbindelser)\nUdforelsesklasse (EXC): EXC[2] iht. DS/EN 1090-1 (CC2, SC1, PC2)' } },

    { id: id++, type: 'heading', data: { level: 3, text: '5.4 Murvaerk' } },
    { id: id++, type: 'text', data: { text: '[Ikke relevant — slet dette afsnit]\n\nAlternativt:\nMurstenskvalitet: MU[20/30/50] iht. DS/EN 771-1\nMortel: M[5/10/15] iht. DS/EN 998-2\nPartialkoefficient: gamma_M = [2,3 / 2,5 / 3,0] afhaengig af mortelkategori' } },

    { id: id++, type: 'heading', data: { level: 3, text: '5.5 Trae' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 5.3 — Anvendelsesklasser for traekonstruktioner (DS/EN 1995-1-1)',
      has_header: true,
      rows: [
        ['Klasse', 'Beskrivelse', 'Eksempler'],
        ['1', 'Fugtindhold svarende til 20 grader C / 65% relativ luftfugtighed (aret rundt)', 'Opvarmede bygninger: boliger, kontorer, butikker'],
        ['2', 'Fugtindhold svarende til 20 grader C / 80% relativ luftfugtighed (aret rundt)', 'Ventilerede, ikke-permanent opvarmede bygninger. Fritidshuse, garager, lagre. Ventilerede tagkonstruktioner beskyttet mod nedbor'],
        ['3', 'Klimaforhold der kan fore til hojere fugtindhold end klasse 2', 'Konstruktioner udsat for nedbor eller vand. Underlag for tagpaptage'],
      ]
    }},
    { id: id++, type: 'table', data: {
      caption: 'Tabel 5.4 — Lastvarighed (DS/EN 1995-1-1)',
      has_header: true,
      rows: [
        ['Lastgruppe', 'Kode', 'Varighed', 'Eksempler'],
        ['Permanent',   'P', 'Mere end 10 aar',        'Egenlast'],
        ['Langtidslast','L', '6 maaneder til 10 aar',  'Oplagret gods'],
        ['Mellemlang',  'M', '1 uge til 6 maaneder',   'Variable laster, snelast'],
        ['Korttidslast','K', 'Mindre end 1 uge',        'Snelast, vindlast'],
        ['Ojebliksslig','O', 'Ojeblikkeig',             'Ulykkeslast, vindlast'],
      ]
    }},
    { id: id++, type: 'table', data: {
      caption: 'Tabel 5.5 — Modifikationsfaktor kmod og kdef (DS/EN 1995-1-1 Tabel 3.1 + 3.2)',
      has_header: true,
      rows: [
        ['Materiale', 'Anv.kl.', 'kmod Permanent', 'kmod Langtid', 'kmod Mellemlang', 'kmod Korttid', 'kmod Ojeblikslig', 'kdef'],
        ['Konstruktionstrae / Limtrae / LVL', '1', '0,60', '0,70', '0,80', '0,90', '1,10', '0,60'],
        ['Konstruktionstrae / Limtrae / LVL', '2', '0,60', '0,70', '0,80', '0,90', '1,10', '0,80'],
        ['Konstruktionstrae / Limtrae / LVL', '3', '0,40', '0,55', '0,65', '0,70', '0,90', '2,00'],
      ]
    }},
    { id: id++, type: 'table', data: {
      caption: 'Tabel 5.6 — Materialekvaliteter og karakteristiske vaerdier',
      has_header: true,
      rows: [
        ['Konstruktionsdel', 'Anv. klasse', 'Styrkeklasse', 'fm,k [MPa]', 'fc,0,k [MPa]', 'E0,mean [MPa]', 'Rumvaegt [kN/m3]'],
        ['Traeskeletvagge — indvendige', '1', 'Min. C18 (iht. leverandoer)', '18', '18', '9.000', '380'],
        ['Traeskeletvagge — udvendige',  '3', 'GL24c', '24', '21,5', '11.000', '420'],
        ['Bjaelker (limtrae) — indvendig','1', 'GL24c', '24', '21,5', '11.000', '365'],
        ['Bjaelker (limtrae) — udvendig', '3', 'GL24c', '24', '21,5', '11.000', '365'],
        ['CLT — tagdaek',     '1', 'CL24', '24', '21', '11.000', '420'],
        ['CLT — etagedaek',   '1', 'CL24', '24', '21', '11.000', '420'],
        ['CLT — vagge',       '1', 'CL24', '24', '21', '11.000', '420'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Partialkoefficienter (ULS, vedvarende og midlertidige tilstande):\n  Limtrae, LVL og pladematerialer: gamma_M = 1,30 x gamma_3\n  Konstruktionstrae:               gamma_M = 1,35 x gamma_3\n  Forbindelser (dornforbindelser): gamma_M = 1,35 x gamma_3\n  Forbindelser (limede bolte):     gamma_M = 1,50 x gamma_3\n\n  Saerpet kontrolklasse (KK3): gamma_3 = 0,95\n  Normal kontrolklasse (KK2):  gamma_3 = 1,00\n  Lempet kontrolklasse (KK1):  gamma_3 = 1,10\n\nFugtindhold ved levering:\n  Konstruktionstrae: max. 15% +/- 2%\n  CLT og limtrae: max. 12% +/- 2%' } },

    // ─────────────────────────────────────────────────────────────────────────
    // 6. LASTER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: '6. Laster' } },

    { id: id++, type: 'heading', data: { level: 3, text: '6.1 Lastkombinationer og lasttilfaelde' } },
    { id: id++, type: 'text', data: { text: 'Dimensionering udfoeres i brudgraensetilstand (ULS) og anvendelsesgraensetilstand (SLS) iht. DS/EN 1990 DK NA:2024.\n\nLAK 1: Anvendelsesgraensetilstand\nHaandteres under den enkelte bygningsdel med udgangspunkt i de opsummerede karakteristiske laster.\n\nLAK 2: Brudgraensetilstand (STR)\n  LAK 2.1 — Nyttelast dominerende:\n    KFI x (Gsup + 1,5 x (Qprim + psiQ,0 x Qsek + psiS,0 x S + psiV,0 x V))\n\n  LAK 2.2 — Snelast dominerende:\n    KFI x (Gsup + 1,5 x (psiQ,0 x Q + S + psiV,0 x V))\n\n  LAK 2.3 — Vindlast dominerende:\n    KFI x (Gsup + 1,5 x (psiQ,0 x Q + V))\n\n  LAK 2.4 — Vindlast dominerende (opvaeltning):\n    0,9 x Ginf + 1,5 x KFI x V\n\n  LAK 2.5 — Egenlast dominerende:\n    1,2 x KFI x Gsup\n\nLAK 3: Ulykkesgraensetilstand (brand)\n  LAK 3.1 — Nyttelast primaar:   Gsup + psiQ,1 x Q\n  LAK 3.2 — Snelast primaar:     Gsup + psiQ,2 x Q + psiS,1 x S\n  LAK 3.3 — Vindlast primaar:    Gsup + psiQ,2 x Q + psiV,1 x V\n\nOBS: I tilfaelde af afvigelse fra ovenstaande noteres dette ved den enkelte lastnedfoering.\nKonsekvensklasse CC2: KFI = 1,0' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 6.1 — ULS lastsikkerhedsfaktorer (DS/EN 1990 DK NA:2024, Tabel A1.2(B), STR/GEO)',
      has_header: true,
      rows: [
        ['Formel', 'Udtryk', 'gamma_G,sup', 'gamma_G,inf', 'gamma_Q,1', 'xi (DK NA)'],
        ['6.10a', 'gamma_G,sup x KFI x Gk + sum(gamma_Q,i x KFI x psi0,i x Qk,i)', '1,35', '1,00', '1,50 x psi0,i', '--'],
        ['6.10b', 'xi x gamma_G,sup x KFI x Gk + gamma_Q,1 x KFI x Qk,1 + sum(gamma_Q,i x KFI x psi0,i x Qk,i)', '1,35', '1,00', '1,50', '0,89'],
        ['EQU',   'gamma_G,sup x Gk + gamma_Q,1 x psi0,1 x Qk,1', '1,05', '0,95', '1,50 x psi0,1', '--'],
        ['GEO',   'Som STR 6.10a/b med geotekniske partialkoefficienter', '1,35', '1,00', '1,50', '0,89'],
      ]
    }},

    { id: id++, type: 'heading', data: { level: 3, text: '6.2 Permanente laster' } },
    { id: id++, type: 'text', data: { text: 'Egenlaster fremgaar generelt af tvaersnittets geometri og nedenstaaende materialevaegte (DS/EN 1991-1-1 Annex A).' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 6.2 — Materialevaegte (DS/EN 1991-1-1 Annex A)',
      has_header: true,
      rows: [
        ['Materiale / konstruktionselement', 'Rumvaegt / fladel.', 'Enhed'],
        ['Armeret beton (in-situ)', '25,0', 'kN/m3'],
        ['Uarmeret beton', '24,0', 'kN/m3'],
        ['Konstruktionsstaal', '78,5', 'kN/m3'],
        ['Konstruktionstrae C24 (gran/fyr)', '4,2', 'kN/m3'],
        ['Limtrae GL24c/GL28h', '4,5', 'kN/m3'],
        ['CLT CL24', '4,2', 'kN/m3'],
        ['Murvaerk, massivt tegl', '18,0-22,0', 'kN/m3'],
        ['Gipsplader 13 mm', '0,10', 'kN/m2'],
        ['Tagsten, beton', '0,50', 'kN/m2'],
        ['Tagsten, tegl', '0,60', 'kN/m2'],
        ['Tagpap + 200 mm isolering', '0,15-0,25', 'kN/m2'],
        ['Terrazzo/flisegulv 20 mm + mortel', '0,60-1,00', 'kN/m2'],
      ]
    }},

    { id: id++, type: 'heading', data: { level: 3, text: '6.3 Nyttelast' } },
    { id: id++, type: 'text', data: { text: 'Nyttelaster fastsaettes iht. DS/EN 1991-1-1 DK NA:2024. Nedenstaaende tabel angiver projektets valgte nyttelaster med psi-faktorer.' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 6.3 — Projektets nyttelaster (lodrette flade- og punktlaster)',
      has_header: true,
      rows: [
        ['Betegnelse', 'Beskrivelse / rum', 'Kat.', 'qk [kN/m2]', 'Qk [kN]', 'psi0', 'psi1 (brand)', 'psi2 (ulykke)'],
        ['Q01', '[fx Hotelvaerelser / boliger]', 'A', '1,5', '2', '0,5', '0,3', '0,2'],
        ['Q02', '[fx Altaner]', 'A', '2,5', '2', '0,5', '0,3', '0,2'],
        ['Q03', '[fx Loftsrum]', 'A', '1,0', '0,5', '0,5', '0,3', '0,2'],
        ['Q04', '[fx Administration / kontorer]', 'B', '2,5', '2,5', '0,6', '0,4', '0,2'],
        ['Q05', '[fx Lounge, trapper, gaenge, faelles]', 'C', '5,0', '4', '0,6', '0,6', '0,5'],
        ['Q06', '[fx Tag — ikke tilgaengeligt]', 'H', '0,5', '1,0', '0', '0', '0'],
      ]
    }},
    { id: id++, type: 'table', data: {
      caption: 'Tabel 6.4 — psi-faktorer for variable laster (DS/EN 1990 DK NA:2024, Tabel A1.1)',
      has_header: true,
      rows: [
        ['Lasttype', 'Lastkategori', 'psi0', 'psi1', 'psi2'],
        ['Nyttelast — Kat. A', 'Boliger og boligformaal', '0,5', '0,3', '0,2'],
        ['Nyttelast — Kat. B', 'Kontor og administrationsarealer', '0,6', '0,4', '0,2'],
        ['Nyttelast — Kat. C', 'Forsamlingslokaler (C1-C5)', '0,6', '0,6', '0,5'],
        ['Nyttelast — Kat. D', 'Butikker og forretningsarealer', '0,6', '0,6', '0,5'],
        ['Nyttelast — Kat. E', 'Lagerbygninger', '0,8', '0,8', '0,7'],
        ['Nyttelast — Kat. F', 'Let trafik <= 30 kN (parkering)', '0,6', '0,6', '0,5'],
        ['Nyttelast — Kat. H', 'Tage (ikke tilgaengeligt)', '0', '0', '0'],
        ['Snelast (DK)', 'Andre kombinationer', '0,3', '0,2', '0'],
        ['Snelast (DK)', 'Kombineret med vindlast', '0', '0', '0'],
        ['Vindlast (DK)', 'Andre kombinationer', '0,3', '0,2', '0'],
      ]
    }},

    { id: id++, type: 'heading', data: { level: 3, text: '6.4 Naturlaster' } },

    { id: id++, type: 'heading', data: { level: 3, text: '6.4.1 Snelast' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 6.5 — Snelastzoner i Danmark (DS/EN 1991-1-3 DK NA, Figur DK.1)',
      has_header: true,
      rows: [
        ['Zone', 'sk [kN/m2]', 'Geografisk daekkning'],
        ['1', '0,9', 'Sjaelland, Fyn, Lolland-Falster og de fleste oeer'],
        ['2', '1,0', 'Det meste af Jylland (ost og centrale dele)'],
        ['3', '1,1', 'Vest- og nordvestjylland'],
        ['4', '1,5', 'Bornholm og hojt beliggende lokaliteter'],
      ]
    }},
    { id: id++, type: 'text', data: { text: 'Grundet tagets udformning:\n  Snezone: Zone [1/2/3/4]   sk = ... kN/m2\n  Tagtype: [ensidig / tosidig / fladt]   Haeldning: alpha = ... grader\n  Formfaktor: my1 = ... (fra DK NA Figur DK.3)\n  Karakteristisk tagsnelast: s = my1 x Ce x Ct x sk = ... kN/m2\n\n[Beskriv evt. saerlige snelastforhold — snestriber, trug, etc.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '6.4.2 Vindlast' } },
    { id: id++, type: 'text', data: { text: 'Vindlast beregnes iht. DS/EN 1991-1-4 DK NA:2024.\n\n  Referencebasisvindhastighed: vb,0 = 24 m/s\n  Terrankategori: [0 / I / II / III / IV]   (0=hav, II=normal, IV=taet bybebyggelse)\n  Referencehojde: zref = ... m\n  Karakteristisk vindhastighedstryk: qp = ... kN/m2\n\nFormfaktorer og vindtryk fremgaar af A2. [Henvis evt. til bilag.]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '6.5 Geometriske imperfektioner' } },
    { id: id++, type: 'text', data: { text: '[Ikke relevant — slet / Alternativt: beskriv indledende kraengning phi_0 og reduktionsfaktor alpha_h iht. DS/EN 1993-1-1 §5.3 (staal) eller DS/EN 1992-1-1 §5.2 (beton)]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '6.6 Ulykkeslaster' } },
    { id: id++, type: 'text', data: { text: 'Uidentificerede ulykkeslaster (robusthed) er gennemgaaet i afsnit 4.5.\nKonstruktioner med krav om brandbaerevne undersoeges i ulykkesgraensetilstand (LAK 3).\n\nPaakorsels-/eksplosionslast: [Ikke relevant / Ad = ... kN ved parkering og gennemkorsel]' } },

    { id: id++, type: 'heading', data: { level: 3, text: '6.7 Seismisk last' } },
    { id: id++, type: 'text', data: { text: 'Ikke relevant — seismisk hazard er negligibel i Danmark.' } },

    { id: id++, type: 'heading', data: { level: 3, text: '6.8 Midlertidige laster' } },
    { id: id++, type: 'text', data: { text: '[Ikke relevant — slet / Alternativt: beskriv udforelseslaster iht. DS/EN 1991-1-6, fx last fra stilladser, kraner, stoebning af overliggende etage]' } },

    // ─────────────────────────────────────────────────────────────────────────
    // REFERENCEDOKUMENTER
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Referencedokumenter' } },
    { id: id++, type: 'table', data: {
      caption: 'Tabel 7.1 — Projektdokumenter og referencer',
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
        ['ARK-01', 'Arkitekttegninger', '', ''],
      ]
    }},

    // ─────────────────────────────────────────────────────────────────────────
    // GODKENDELSE
    // ─────────────────────────────────────────────────────────────────────────
    { id: id++, type: 'heading', data: { level: 2, text: 'Godkendelse' } },
    { id: id++, type: 'text', data: { text: 'Konstruktionsgrundlaget (A1) er udarbejdet og kontrolleret iht. DS 1140 og giver grundlag for de statiske beregninger (A2).\n\nUdarbejdet af:   ___________________________   Dato: ____________\n                Navn, titel\n\nKontrolleret af: ___________________________   Dato: ____________\n                Navn, titel (uvildig kontrollant, KK2)\n\nGodkendt af:    ___________________________   Dato: ____________\n                Navn, stilling' } },
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
