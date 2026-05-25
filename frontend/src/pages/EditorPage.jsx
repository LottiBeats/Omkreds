/**
 * EditorPage.jsx — document editor for one project
 *
 * Shows the A1–B3 document tabs on the left.
 * When no document is selected → shows the project metadata form.
 * When a document is open     → shows the block editor.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, saveProject, generatePdf, getCalcTemplates } from '../api/client.js'
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
    { id: id++, type: 'heading', data: { level: 1, text: 'Projektgrundlag' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projektbeskrivelse' } },
    { id: id++, type: 'text',    data: { text: 'Kort beskrivelse af det statiske projekt og de konstruktive hovedelementer.' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Projektomfang' } },
    { id: id++, type: 'text',    data: { text: 'Disse beregninger omfatter …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Gældende normer og standarder' } },
    { id: id++, type: 'text',    data: { text: 'Beregningerne er udført i henhold til:\n• DS/EN 1990 Eurocode 0 – Projekteringsgrundlag\n• DS/EN 1991 Eurocode 1 – Last på konstruktioner\n• DS/EN 1992 Eurocode 2 – Betonkonstruktioner\n• DS/EN 1993 Eurocode 3 – Stålkonstruktioner\n• DS/EN 1995 Eurocode 5 – Trækonstruktioner\n• DS/EN 1996 Eurocode 6 – Murkonstruktioner\nmed tilhørende nationale annekser (DK NA).' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Konsekvensklasse og pålidelighed' } },
    { id: id++, type: 'text',    data: { text: 'Konsekvensklasse: CC2\nPålidelighedsklasse: RC2\nKontrolklasse: Normal' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Lastforudsætninger' } },
    { id: id++, type: 'text',    data: { text: 'Egenlast (G):\n  Bestemmes på basis af dimensioner og materialevægte.\n\nNyttelast (Q):\n  I henhold til DS/EN 1991-1-1 og dansk NA.\n  Etageadskillelse: q = … kN/m²\n\nSnelast (S):\n  Geografisk zone: …\n  Karakteristisk terrænværdi: sk = … kN/m²\n\nVindlast (W):\n  Referencebasisvindhastighed: vb,0 = … m/s\n  Terrænkategori: …' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Materialeforudsætninger' } },
    { id: id++, type: 'text',    data: { text: 'Beton:   C25/30 – fck = 25 MPa\nArmering: B500 NOR – fyk = 500 MPa\nStål:    S355 – fy = 355 MPa\nTræ:     C24 – fm,k = 24 MPa' } },

    { id: id++, type: 'heading', data: { level: 2, text: 'Geotekniske forudsætninger' } },
    { id: id++, type: 'text',    data: { text: 'Bæredygtig jordbundsydelse: σ = … kN/m²\nFundamenteringskote: +… m DVR90\nGrundvandsstand: +… m DVR90' } },
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

const NAVY = '#1e3a5f'
const NAVY_LT = '#2a4f82'

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
  // Logo stripe at top of sidebar (matches landing page)
  sidebarBrand: {
    display:    'flex',
    alignItems: 'center',
    gap:        9,
    padding:    '14px 16px 10px',
    background: NAVY,
  },
  sidebarLogoBox: {
    width: 22, height: 22,
    background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sidebarLogoMark: {
    width: 9, height: 9,
    background: NAVY,
    clipPath: 'polygon(50% 0%,100% 100%,0% 100%)',
  },
  sidebarBrandName: {
    fontSize: 12, fontWeight: 700, color: '#fff',
    letterSpacing: '0.01em',
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
    borderLeft:  active ? `3px solid ${NAVY}` : '3px solid transparent',
    padding:     '7px 16px',
    fontSize:    12,
    color:       active ? NAVY : '#475569',
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
    borderLeft:  active ? `3px solid ${NAVY}` : '3px solid transparent',
    padding:     '8px 16px',
    fontSize:    11,
    color:       active ? NAVY : '#94a3b8',
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
    background:    NAVY,
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
    background:     NAVY,
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
  const undoStack = useRef([])   // past block arrays
  const redoStack = useRef([])   // future block arrays
  const tplRef = useRef(null)

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
    try {
      setSaving(true)
      await saveProject(updatedProject)
      setProject(updatedProject)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }, [])

  /** Low-level: save blocks without touching undo/redo history */
  function _applyBlocks(newBlocks) {
    if (!activeDoc || !project) return
    const updated = {
      ...project,
      documents: {
        ...project.documents,
        [activeDoc]: { ...project.documents[activeDoc], blocks: newBlocks },
      },
    }
    save(updated)
  }

  /** Called by BlockList when blocks change — pushes to undo stack */
  function updateBlocks(newBlocks) {
    if (!activeDoc || !project) return
    const current = project.documents[activeDoc]?.blocks ?? []
    undoStack.current = [...undoStack.current.slice(-49), current]
    redoStack.current = []
    setCanUndo(true)
    setCanRedo(false)
    _applyBlocks(newBlocks)
  }

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prev = undoStack.current[undoStack.current.length - 1]
    undoStack.current = undoStack.current.slice(0, -1)
    // Need access to current blocks — read from DOM project state via ref
    setProject(p => {
      if (!p || !activeDoc) return p
      const current = p.documents[activeDoc]?.blocks ?? []
      redoStack.current = [...redoStack.current.slice(-49), current]
      setCanUndo(undoStack.current.length > 0)
      setCanRedo(true)
      const updated = {
        ...p,
        documents: {
          ...p.documents,
          [activeDoc]: { ...p.documents[activeDoc], blocks: prev },
        },
      }
      // fire save asynchronously
      saveProject(updated).catch(() => {})
      return updated
    })
  }, [activeDoc])

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const next = redoStack.current[redoStack.current.length - 1]
    redoStack.current = redoStack.current.slice(0, -1)
    setProject(p => {
      if (!p || !activeDoc) return p
      const current = p.documents[activeDoc]?.blocks ?? []
      undoStack.current = [...undoStack.current.slice(-49), current]
      setCanUndo(true)
      setCanRedo(redoStack.current.length > 0)
      const updated = {
        ...p,
        documents: {
          ...p.documents,
          [activeDoc]: { ...p.documents[activeDoc], blocks: next },
        },
      }
      saveProject(updated).catch(() => {})
      return updated
    })
  }, [activeDoc])

  // Reset undo/redo stacks when switching documents
  useEffect(() => {
    undoStack.current = []
    redoStack.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [activeDoc])

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

  async function handleGeneratePdf() {
    if (!activeDoc) return
    setPdfGenerating(true)
    try {
      const blob     = await generatePdf(projectId, activeDoc)
      const url      = URL.createObjectURL(blob)
      const anchor   = document.createElement('a')
      anchor.href    = url
      anchor.download = `${project.metadata.project_ref || projectId}_${activeDoc}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(`PDF generation failed: ${err.message}`)
    } finally {
      setPdfGenerating(false)
    }
  }

  async function handlePreviewPdf() {
    if (!activeDoc) return
    setPdfGenerating(true)
    try {
      const blob = await generatePdf(projectId, activeDoc)
      // Revoke any previous preview URL to free memory
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
      setPdfPreviewUrl(URL.createObjectURL(blob))
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
    const existing = project.documents[activeDoc]?.blocks ?? []
    if (existing.length > 0) {
      if (!window.confirm(`Apply template "${tpl.label}"? This will replace the existing content.`)) return
    }
    updateBlocks(tpl.make())
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>
  if (!project) return <div style={{ padding: 40 }}>Project not found.</div>

  const currentDoc = activeDoc ? project.documents[activeDoc] : null

  // What to show in the toolbar title
  const toolbarTitle = activeDoc
    ? `${activeDoc} — ${DOC_DEFS[activeDoc]}`
    : 'Project Information'

  return (
    <>
    <div style={styles.layout}>

      {/* ── Left sidebar ── */}
      <aside style={styles.sidebar}>

        {/* Brand stripe + project header */}
        <div style={styles.sidebarHeader}>
          {/* Logo row */}
          <div style={styles.sidebarBrand}>
            <div style={styles.sidebarLogoBox}>
              <div style={styles.sidebarLogoMark} />
            </div>
            <span style={styles.sidebarBrandName}>Structural Calc</span>
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
                const doc    = project.documents[docId]
                const blocks = doc?.blocks ?? []
                return (
                  <button
                    key={docId}
                    style={styles.docBtn(activeDoc === docId)}
                    onClick={() => setActiveDoc(docId)}
                  >
                    <span style={styles.docId}>{docId}</span>
                    {DOC_DEFS[docId]}
                    {blocks.length > 0 && (
                      <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>
                        ({blocks.length})
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer: project info link */}
        <div style={styles.sidebarFooter}>
          <button
            style={styles.metaBtn(activeDoc === null)}
            onClick={() => setActiveDoc(null)}
          >
            ⚙ Project info
          </button>
        </div>

      </aside>

      {/* ── Main area ── */}
      <main style={styles.main}>

        {/* Toolbar */}
        <div style={styles.toolbar}>
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
                onMouseEnter={e => { if (!pdfGenerating) e.currentTarget.style.background = NAVY_LT }}
                onMouseLeave={e => { if (!pdfGenerating) e.currentTarget.style.background = NAVY }}
              >
                ↓ Export PDF
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {error && <div style={styles.error}>{error}</div>}

          {activeDoc === null ? (
            // No document selected — show project metadata form
            <MetadataPanel
              project={project}
              onSave={updateMeta}
            />
          ) : (
            // Document selected — show block editor
            <BlockList
              blocks={currentDoc?.blocks ?? []}
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
