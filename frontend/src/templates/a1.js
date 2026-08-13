/**
 * a1.js — A1 Konstruktionsgrundlag
 *
 * A1 is the document that varies most between projects: a timber house and a
 * concrete car park share a section structure but almost no content.  Emitting
 * the same 450-line template every time forces the engineer to delete two
 * thirds of it, and deleting is exactly where things get forgotten.
 *
 * So the template is generated from a short description of the project.  What
 * that changes:
 *
 *   · §1.1 is pre-filled from the project metadata and the chosen building type
 *   · §2.2 suggests a consequence class from DS/INF 1990:2024 Table 2 and
 *     highlights the row it came from, so the reasoning is visible
 *   · §3 and §5 keep every heading but fill the non-applicable ones with
 *     "Ikke relevant" instead of dropping them — the section numbers are
 *     cross-referenced from A2 and B1, so they must not shift
 *   · §5 only carries material data for the materials actually in use
 *
 * Section structure follows SBi-anvisning 271, 3. udgave; content requirements
 * follow BR18 §§ 494-505.
 */

// ── DS/INF 1990:2024 Table 2 ──────────────────────────────────────────────────
// Guideline limits for consequence class, as structured data so the printed
// table and the class suggestion cannot drift apart.
//
// Limit encoding, from the standard's own legend:
//   '+' no restriction on this criterion   '*' no upper limit
//   '0' the class is not attainable for this criterion
const NO_LIMIT = Infinity

function lim(v) {
  if (v === '+' || v === '*') return NO_LIMIT
  if (v === '0') return 0
  return Number(v)
}

/**
 * Each row: span [CC1, CC2, CC3], height as [over, under] per class,
 * storeys above terrain [CC1, CC2, CC3].
 */
export const ANVENDELSER = [
  { nr: 1, kort: 'en bygning til længere ophold', navn: 'Længere ophold: beboelse, kontor, hotel, feriehus, dag-/døgninstitution, undervisning, klinik',
    spaend: ['+', '16', '*'], hoejde: [['0','0'], ['12','6'], ['+','9']], etager: ['+', '5', '15'] },
  { nr: 2, kort: 'et hospital', navn: 'Hospital',
    spaend: ['+', '16', '*'], hoejde: [['0','0'], ['+','6'], ['+','9']], etager: ['+', '2', '5'] },
  { nr: 3, kort: 'en forsamlingsbygning (≤150 pers.)', navn: 'Forsamling ≤150 pers. (koncert, sport, kirke, udstilling, teater, scene, detailhandel, spisested)',
    spaend: ['+', '16', '36'], hoejde: [['0','0'], ['12','6'], ['20','9']], etager: ['+', '2', '5'] },
  { nr: 4, kort: 'en forsamlingsbygning (>150 pers.)', navn: 'Forsamling >150 pers. (koncert, sport, kirke, udstilling, teater, scene, detailhandel, spisested)',
    spaend: ['+', '12', '24'], hoejde: [['0','0'], ['6','0'], ['20','6']], etager: ['+', '1', '2'] },
  { nr: 5, kort: 'en tribunekonstruktion', navn: 'Forsamling, tribuner >150 pers.',
    spaend: ['0', '8', '12'], hoejde: [['0','0'], ['8','6'], ['16','9']], etager: ['+', '+', '+'] },
  { nr: 6, kort: 'en overdækning af udendørstribune/-scene', navn: 'Forsamling, overdækning af udendørstribuner og -scener (>150 pers.)',
    spaend: ['0', '12', '24'], hoejde: [['0','+'], ['16','+'], ['20','+']], etager: ['+', '+', '+'] },
  { nr: 7, kort: 'et industrianlæg med sundhedsskadelige kemikalier', navn: 'Industri — sundhedsskadelige kemikalier (særligt store konsekvenser)',
    spaend: ['+', '0', '0'], hoejde: [['0','0'], ['0','0'], ['0','0']], etager: ['+', '+', '+'] },
  { nr: 8, kort: 'et industri-/arkivanlæg', navn: 'Industri — forurenende produktion, arkiver af samfundsmæssig betydning (meget store konsekvenser)',
    spaend: ['+', '0', '40'], hoejde: [['0','0'], ['0','0'], ['12','6']], etager: ['+', '+', '3'] },
  { nr: 9, kort: 'et industrianlæg', navn: 'Industri — kraftvarme, visse typer vareproduktion (andre betydelige konsekvenser)',
    spaend: ['+', '40', '*'], hoejde: [['0','0'], ['12','6'], ['20','9']], etager: ['+', '+', '5'] },
  { nr: 10, kort: 'en industri-/lagerbygning', navn: 'Industri/lager med få personer: landbrug, væksthuse, siloanlæg',
    spaend: ['40', '*', '*'], hoejde: [['20','3'], ['30','6'], ['50','9']], etager: ['+', '+', '+'] },
  { nr: 11, kort: 'en landbrugsbygning med dyrehold', navn: 'Dyrehold med arbejdspladser',
    spaend: ['20', '40', '*'], hoejde: [['12','3'], ['16','6'], ['*','9']], etager: ['+', '+', '+'] },
  { nr: 12, kort: 'et parkeringsanlæg', navn: 'Parkeringsanlæg',
    spaend: ['6', '18', '*'], hoejde: [['+','0'], ['20','6'], ['+','9']], etager: ['1', '6', '15'] },
  { nr: 13, kort: 'en mast/skorsten', navn: 'Master og skorstene (åbent ubeboet landskab)',
    spaend: ['+', '+', '+'], hoejde: [['50','+'], ['200','+'], ['*','*']], etager: ['+', '+', '+'] },
]

/**
 * Suggest the lowest consequence class whose guideline limits the project fits
 * within, per DS/INF 1990:2024 Table 2.
 *
 * The standard is a *guideline* — the engineer's technical judgement governs —
 * so this returns the reasoning alongside the class, never just a verdict.
 */
export function suggestCC({ anvendelseNr = 1, spaendvidde = 0, hoejdeOver = 0, hoejdeUnder = 0, etager = 1 } = {}) {
  const row = ANVENDELSER.find(a => a.nr === Number(anvendelseNr)) ?? ANVENDELSER[0]
  const reasons = []

  for (let i = 0; i < 3; i++) {
    const cc = i + 1
    const maxSpaend = lim(row.spaend[i])
    const maxOver   = lim(row.hoejde[i][0])
    const maxUnder  = lim(row.hoejde[i][1])
    const maxEtager = lim(row.etager[i])

    const fejl = []
    if (spaendvidde > maxSpaend) fejl.push(`spændvidde ${spaendvidde} m > ${row.spaend[i]} m`)
    if (hoejdeOver  > maxOver)   fejl.push(`højde over terræn ${hoejdeOver} m > ${row.hoejde[i][0]} m`)
    if (hoejdeUnder > maxUnder)  fejl.push(`højde under terræn ${hoejdeUnder} m > ${row.hoejde[i][1]} m`)
    if (etager      > maxEtager) fejl.push(`${etager} etager > ${row.etager[i]}`)

    if (fejl.length === 0) {
      return {
        cc,
        row,
        begrundelse:
          `Bygningsanvendelse række ${row.nr} i DS/INF 1990:2024 Tabel 2. ` +
          `Med ${etager} etage${etager === 1 ? '' : 'r'} over terræn, største spændvidde ` +
          `${spaendvidde} m og højde ${hoejdeOver} m over / ${hoejdeUnder} m under terræn ` +
          `ligger konstruktionen inden for de vejledende grænseværdier for CC${cc}` +
          (reasons.length ? `, mens CC${cc - 1} overskrides (${reasons[reasons.length - 1]})` : '') +
          '.',
      }
    }
    reasons.push(fejl.join(', '))
  }

  return {
    cc: 3,
    row,
    begrundelse:
      `Bygningsanvendelse række ${row.nr} i DS/INF 1990:2024 Tabel 2. Projektet overskrider ` +
      `de vejledende grænseværdier for CC3 (${reasons[2]}). Indplaceringen kræver en ` +
      `særskilt teknisk-faglig vurdering — overvej CC4 / særlig kontrol i dialog med ` +
      `bygningsmyndigheden.`,
  }
}

// ── BR18 § 489 — konstruktionsklasse ──────────────────────────────────────────
// Construction class does NOT simply follow consequence class. § 489 puts a
// good deal of CC2 work in KK1 — a single-family house in two storeys is CC2
// but KK1 — and pushes complex or untraditional CC2 work up into KK3. Getting
// this wrong costs the user either an independent check they do not need, or
// one they do.
//
// Complexity (§ 487) and experience (§ 488) are judgements the engineer makes,
// so they are inputs here, never inferred.

export const BYGNINGSKATEGORIER = [
  { key: 'enfamiliehus', label: 'Enfamiliehus, rækkehus eller sommerhus (uden vandrette lejlighedsskel)' },
  { key: 'etagebyggeri', label: 'Etagebyggeri til længere ophold (bolig, kontor, hotel, institution)' },
  { key: 'landbrug',     label: 'Landbrugsbygning i én etage' },
  { key: 'industri',     label: 'Industri- eller lagerbygning i én etage' },
  { key: 'andet',        label: 'Andet' },
]

/**
 * Suggest a konstruktionsklasse per BR18 § 489.
 *
 * Returns the class, the rule that produced it, and — for the two "ombygning"
 * routes — the fact that documentation control still has to follow KK2 even
 * though the structure sits in a lower class. That condition is easy to miss
 * and is the whole reason those routes are allowed.
 */
export function suggestKK({
  cc = 2,
  simpel = true,
  traditionel = true,
  bygningskategori = 'andet',
  etager = 1,
  spaendvidde = 0,
  konstruktionstype = 'Nybyggeri',
} = {}) {
  const ombygning = konstruktionstype === 'Ombygning' || konstruktionstype === 'Tilbygning'
  const enkel = simpel && traditionel

  if (cc <= 1) {
    return { kk: 'KK1', regel: '§ 489', begrundelse:
      'Konstruktioner i lav konsekvensklasse (CC1) henføres til konstruktionsklasse 1.' }
  }

  if (cc === 2) {
    if (!enkel) {
      return { kk: 'KK3', regel: '§ 489', begrundelse:
        `Konstruktionen er angivet som ${!simpel ? 'kompleks' : 'utraditionel'}. ` +
        'CC2-konstruktioner, der er komplekse eller utraditionelle, henføres til ' +
        'konstruktionsklasse 3 — ikke KK2.' }
    }
    if (bygningskategori === 'enfamiliehus' && etager <= 2) {
      return { kk: 'KK1', regel: '§ 489', begrundelse:
        `Enfamiliehus/rækkehus/sommerhus uden vandrette lejlighedsskel i ${etager} etage` +
        `${etager === 1 ? '' : 'r'} henføres til konstruktionsklasse 1, selvom konstruktionen ` +
        'er i CC2.' }
    }
    if ((bygningskategori === 'landbrug' || bygningskategori === 'industri')
        && etager <= 1 && spaendvidde <= 40) {
      return { kk: 'KK1', regel: '§ 489', begrundelse:
        `Simpel og traditionel ${bygningskategori === 'landbrug' ? 'landbrugsbygning' : 'industri-/lagerbygning'} ` +
        `i én etage med spændvidde ${spaendvidde} m (højst 40 m) henføres til konstruktionsklasse 1.` }
    }
    if (ombygning) {
      return { kk: 'KK1', regel: '§ 489, stk. 2', begrundelse:
        'Simpel og traditionel ombygning/forandring i en eksisterende simpel og traditionel ' +
        'CC2-konstruktion kan henføres til konstruktionsklasse 1.',
        dokumentationskrav:
          'Kontrol af dokumentationen skal fortsat ske efter BR18 kapitel 30 svarende til ' +
          'konstruktionsklasse 2 — det er betingelsen for nedrykningen.',
        kraeverVurdering:
          'Forudsætter at både den eksisterende konstruktion og indgrebet er simple og ' +
          'traditionelle. Bekræft vurderingen her.' }
    }
    return { kk: 'KK2', regel: '§ 489', begrundelse:
      'CC2-konstruktion, der ikke er omfattet af konstruktionsklasse 1 eller 3.' }
  }

  // CC3
  if (ombygning && enkel && bygningskategori === 'etagebyggeri'
      && etager <= 6 && spaendvidde <= 8) {
    return { kk: 'KK2', regel: '§ 489, stk. 2', begrundelse:
      `Simpel og traditionel ombygning i en eksisterende simpel og traditionel CC3-konstruktion ` +
      `i etagebyggeri til længere ophold med ${etager} etager (højst 6) og spændvidde ` +
      `${spaendvidde} m (højst 8 m) kan henføres til konstruktionsklasse 2.`,
      dokumentationskrav:
        'Kontrol af dokumentationen skal ske efter BR18 kapitel 30 svarende til ' +
        'konstruktionsklasse 2.',
      kraeverVurdering:
        'Forudsætter at både den eksisterende konstruktion og indgrebet er simple og ' +
        'traditionelle. Bekræft vurderingen her.' }
  }
  return { kk: 'KK3', regel: '§ 489', begrundelse:
    'Konstruktioner i høj konsekvensklasse (CC3) henføres til konstruktionsklasse 3. ' +
    'Er svigtkonsekvenserne særligt alvorlige, skal KK4 overvejes i dialog med bygningsmyndigheden.' }
}

/** KFI per DS/EN 1990 DK NA:2024. CC1's 0,9 applies to STR/GEO only. */
function kfiFor(cc) {
  return cc === 1 ? '0,9' : cc === 3 ? '1,1' : '1,0'
}

/** γ3 per DS/EN 1995-1-1 DK NA — control class factor. */
function gamma3For(kk) {
  return kk === 'KK1' ? '1,10' : kk === 'KK3' ? '0,95' : '1,00'
}

// ── Building types ────────────────────────────────────────────────────────────

export const KONSTRUKTIONSTYPER = ['Nybyggeri', 'Tilbygning', 'Ombygning']

export const MATERIALER = [
  { key: 'beton',    label: 'Beton' },
  { key: 'staal',    label: 'Stål' },
  { key: 'murvaerk', label: 'Murværk' },
  { key: 'trae',     label: 'Træ' },
]

export const DEFAULT_OPTIONS = {
  konstruktionstype: 'Nybyggeri',
  anvendelseNr: 1,
  // BR18 §§ 487-489 — the engineer's judgement, not something we can infer
  bygningskategori: 'andet',
  simpel: true,
  traditionel: true,
  etager: 2,
  kaelder: false,
  spaendvidde: 6,
  hoejdeOver: 7,
  hoejdeUnder: 0,
  materialer: { beton: false, staal: false, murvaerk: false, trae: true },
  geoteknisk: true,
  eksisterende: false,
  naboer: false,
}

// ── Template ──────────────────────────────────────────────────────────────────

const IKKE_RELEVANT = 'Ikke relevant for dette projekt.'

/** Join a list the way Danish prose does: "beton, stål og træ". */
function ogListe(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} og ${items[items.length - 1]}`
}

export function makeA1Template(options = {}, metadata = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options,
              materialer: { ...DEFAULT_OPTIONS.materialer, ...(options.materialer || {}) } }
  const m = metadata || {}

  const { cc, row, begrundelse } = suggestCC(o)
  const kkResult = suggestKK({ ...o, cc })
  const kk   = kkResult.kk
  const rc   = `RC${cc}`
  const kfi  = kfiFor(cc)
  const g3   = gamma3For(kk)
  const brug = MATERIALER.filter(x => o.materialer[x.key]).map(x => x.label)

  let id = Date.now()
  const B = []
  const push = (type, data) => B.push({ id: id++, type, data })
  const H = (level, text) => push('heading', { level, text })
  const T = (text) => push('text', { text })
  const TBL = (caption, rows, extra = {}) =>
    push('table', { caption, has_header: true, rows, ...extra })

  H(1, 'A1 Konstruktionsgrundlag')

  // ── 1. Konstruktionsafsnit ──────────────────────────────────────────────────
  H(2, '1. Konstruktionsafsnit')

  H(3, '1.1 Bygværkets art og anvendelse')
  T(
    `Nærværende statiske dokumentation vedrører ${o.konstruktionstype.toLowerCase()} af ` +
    `${row.kort}` +
    `${m.address ? ` beliggende ${m.address}` : ' beliggende [adresse]'}, matr. [matrikelnummer].\n\n` +
    `Bygherren er: ${m.client || '…'}\n` +
    `Sagsnr.: ${m.project_ref || '…'}\n\n` +
    `Bygningen er ${o.etager} etage${o.etager === 1 ? '' : 'r'} over terræn ` +
    `${o.kaelder ? 'med kælder' : 'uden kælder'}. Det samlede bebyggede areal er ca. … m², ` +
    `og det samlede etageareal er ca. … m².\n\n` +
    `[Beskriv bygningens opdeling i konstruktionsafsnit og hvilke dele der er omfattet af ` +
    `nærværende dokumentation. Indsæt oversigtstegning som billede.]`
  )

  H(3, '1.2 Konstruktioners art og opbygning')
  T(
    `Bygningens primære bærende system er opbygget i ${brug.length ? ogListe(brug).toLowerCase() : '[materiale]'}.\n` +
    `[Beskriv konstruktionsprincippet, fx: CLT-dæk båret af limtræbjælker og lette træskeletvægge / ` +
    `in-situ betondæk med stålsøjler og betonkerner.]\n\n` +
    `Lodrette laster: dæk → bjælker → søjler/vægge → fundament → undergrund\n` +
    `Vandret stabilisering: [skiver / rammer / kryds / kerne]\n\n` +
    `[Beskriv spændretning for dæk, udkragninger og særlige konstruktive forhold. ` +
    `Indsæt opstalt/snit som billede.]`
  )

  H(3, '1.3 Konstruktionsafsnit')
  T('Opbygningen følger SBi-anvisning 271, 3. udgave. Nærværende dokumentation omhandler de konstruktionsafsnit der er markeret nedenfor.')
  TBL('Tabel 1.1 — Oversigt over konstruktionsafsnit', [
    ['Afsnit nr.', 'Afsnit', 'CC / KK', 'Ansvarlig'],
    ...brug.map((mat, i) => [`A2.${i + 1}`, `${mat}konstruktioner`, `CC${cc}/${kk}`, m.firm_name || '[Firma]']),
    [`A2.${brug.length + 1}`, 'Fundering og terrændæk', `CC${cc}/${kk}`, m.firm_name || '[Firma]'],
  ])

  // ── 2. Grundlag ─────────────────────────────────────────────────────────────
  H(2, '2. Grundlag')

  H(3, '2.1 Normer og standarder')
  T('Projektet er udarbejdet iht. Bygningsreglementet 2018 (BR18) og i overensstemmelse med SBi-anvisning 271, 3. udgave.')

  const normer = [
    ['Standard', 'Titel', 'DK NA udgave'],
    ['BR18', 'Bygningsreglementet', '2018 inkl. ændringer'],
    ['DS/INF 1990', 'Vejledning til konsekvensklasser (Tabel 2)', '2024'],
    ['DS 1140', 'Dokumentation og kontrol af bærende konstruktioner', '2014'],
    ['DS/EN 1990', 'Projekteringsgrundlag (EC0)', 'DK NA:2024'],
    ['DS/EN 1991-1-1', 'Nyttelaster på bygninger (EC1)', 'DK NA:2024'],
    ['DS/EN 1991-1-2', 'Brandlast (EC1)', 'DK NA:2014'],
    ['DS/EN 1991-1-3', 'Snelaster (EC1)', 'DK NA:2015 ver. 2'],
    ['DS/EN 1991-1-4', 'Vindlaster (EC1)', 'DK NA:2015'],
    ['DS/EN 1991-1-5', 'Termiske laster (EC1)', 'DK NA:2012'],
    ['DS/EN 1991-1-7', 'Ulykkeslast (EC1)', 'DK NA:2013'],
  ]
  if (o.materialer.beton) {
    normer.push(['DS/EN 1992-1-1', 'Betonkonstruktioner (EC2)', 'DK NA:2021'])
    normer.push(['DS/EN 1992-1-2', 'Beton — brandteknisk dimensionering (EC2)', 'DK NA:2019'])
  }
  if (o.materialer.staal) {
    normer.push(['DS/EN 1993-1-1', 'Stålkonstruktioner (EC3)', 'DK NA:2023'])
    normer.push(['DS/EN 1993-1-2', 'Stål — brandteknisk dimensionering (EC3)', 'DK NA:2019'])
  }
  if (o.materialer.trae) {
    normer.push(['DS/EN 1995-1-1', 'Trækonstruktioner (EC5)', 'DK NA:2023'])
    normer.push(['DS/EN 1995-1-2', 'Træ — brandteknisk dimensionering (EC5)', 'DK NA:2007'])
  }
  if (o.materialer.murvaerk) {
    normer.push(['DS/EN 1996-1-1', 'Murværkskonstruktioner (EC6)', 'DK NA:2019'])
  }
  normer.push(['DS/EN 1997-1', 'Geoteknisk projektering (EC7)', 'DK NA:2021'])
  if (o.geoteknisk) {
    normer.push(['DS/EN 1997-2', 'Geoteknik — jordbundsundersøgelser (EC7)', 'DK NA:2013'])
  }
  TBL('Tabel 2.1 — Gældende normer og standarder', normer)

  H(3, '2.2 Konsekvensklasser og konstruktionsklasser')

  H(3, '2.2.1 Konsekvensklasse — DS/INF 1990:2024 Tabel 2')
  T(
    'Konstruktioner henføres til konsekvensklasse iht. DS/INF 1990:2024 Tabel 2 (vejledende ' +
    'grænseværdier). Tabellen angiver maksimalt tilladt konstruktionsspændvidde [m], højde ' +
    'over/under terræn [m] jf. Figur 1, og etageantal over terræn for CC1, CC2 og CC3.\n\n' +
    'DS/INF 1990 er en vejledning — en teknisk-faglig vurdering lægges altid til grund for indplaceringen.\n' +
    'Symboler: + = ingen begrænsning for dette kriterium   * = ingen øvre grænse   0 = klassen er ikke opnåelig for dette kriterium\n' +
    'Højde angives som "over terræn / under terræn" (H_top / H_o jf. Figur 1 i DS/INF 1990:2024).'
  )

  // The chosen row is highlighted so a reader can see where the class came from
  // without re-deriving it. Row index +1 because row 0 is the header.
  const ccRowIndex = ANVENDELSER.findIndex(a => a.nr === row.nr) + 1
  TBL(
    'Tabel 2.2 — Vejledende grænseværdier for konsekvensklasse (DS/INF 1990:2024, Tabel 2)',
    [
      ['Nr.', 'Bygningsanvendelse', 'Spændv.\nCC1 [m]', 'Spændv.\nCC2 [m]', 'Spændv.\nCC3 [m]',
       'Højde CC1\no.t./u.t. [m]', 'Højde CC2\no.t./u.t. [m]', 'Højde CC3\no.t./u.t. [m]',
       'Etager\nCC1', 'Etager\nCC2', 'Etager\nCC3'],
      ...ANVENDELSER.map(a => [
        String(a.nr), a.navn,
        a.spaend[0], a.spaend[1], a.spaend[2],
        `${a.hoejde[0][0]} / ${a.hoejde[0][1]}`,
        `${a.hoejde[1][0]} / ${a.hoejde[1][1]}`,
        `${a.hoejde[2][0]} / ${a.hoejde[2][1]}`,
        a.etager[0], a.etager[1], a.etager[2],
      ]),
    ],
    {
      col_widths: [3.5, 35, 6.5, 6.5, 6.5, 9, 9, 9, 5, 5, 5],
      highlighted: Array.from({ length: 11 }, (_, ci) => `${ccRowIndex},${ci}`),
    }
  )
  T(
    `Projektets bygningsanvendelse: Række ${row.nr} — ${row.navn}\n` +
    `Største konstruktionsspændvidde: ${o.spaendvidde} m\n` +
    `Bygningshøjde: ${o.hoejdeOver} m over terræn (H_top) / ${o.hoejdeUnder} m under terræn (H_o)\n` +
    `Antal etager over terræn: ${o.etager}\n\n` +
    `Valgt konsekvensklasse: CC${cc}\n` +
    `Pålidelighedsklasse: ${rc}\n\n` +
    `Teknisk-faglig vurdering og begrundelse:\n${begrundelse}\n\n` +
    `[Kontrollér indplaceringen og suppler med projektets egne forhold. Afvigelse fra ` +
    `tabellens vejledende værdier skal begrundes her.]`
  )
  TBL('Tabel 2.2a — K_FI-faktorer pr. konsekvensklasse (DS/EN 1990 DK NA:2024)', [
    ['Konsekvensklasse', 'Pålidelighedsklasse', 'K_FI — STR/GEO (6.10a/b)', 'K_FI — EQU', 'K_FI — Geoteknisk'],
    ['CC1', 'RC1', '0,9', '1,0', '1,0'],
    ['CC2', 'RC2', '1,0', '1,0', '1,0'],
    ['CC3', 'RC3', '1,1', '1,1', '1,1'],
  ], { highlighted: Array.from({ length: 5 }, (_, ci) => `${cc},${ci}`) })
  T(
    'OBS: K_FI for CC1 = 0,9 gælder kun for STR/GEO-lasttilfælde (brudgrænse, styrke og ' +
    'stabilitet). For EQU (ligevægt) og geotekniske konstruktioner gælder K_FI = 1,0 også ' +
    'ved CC1 (DK NA:2024 Tabel A1.2, note).\n\n' +
    `Valgt K_FI-faktor for dette projekt (STR/GEO): ${kfi}`
  )

  H(3, '2.2.2 Konstruktionsklasse — BR18 § 489')
  T(
    'Konstruktionsklassen fastlægges iht. BR18 § 489 ud fra konsekvensklassen, ' +
    'konstruktionens kompleksitet (§ 487) og erfaringen med konstruktionstypen (§ 488). ' +
    'Klassen følger ikke konsekvensklassen automatisk: en række CC2-konstruktioner ' +
    'henføres til KK1, og komplekse eller utraditionelle CC2-konstruktioner til KK3.\n\n' +
    `Kompleksitet (§ 487): ${o.simpel ? 'Simpel konstruktion' : 'Kompleks konstruktion'}\n` +
    `Erfaring (§ 488): ${o.traditionel ? 'Traditionel konstruktion' : 'Utraditionel konstruktion'}\n` +
    `Bygningskategori: ${(BYGNINGSKATEGORIER.find(b => b.key === o.bygningskategori) || {}).label || '—'}\n\n` +
    `Valgt konstruktionsklasse: ${kk}   (${kkResult.regel})\n` +
    `Begrundelse: ${kkResult.begrundelse}` +
    (kkResult.dokumentationskrav ? `\n\nOBS: ${kkResult.dokumentationskrav}` : '') +
    (kkResult.kraeverVurdering ? `\n\n${kkResult.kraeverVurdering}` : '')
  )
  TBL('Tabel 2.3 — Indplacering i konstruktionsklasse (BR18 § 489)', [
    ['Klasse', 'Omfatter'],
    ['KK1', 'CC1-konstruktioner · CC2 i enfamiliehuse, rækkehuse og sommerhuse uden vandrette lejlighedsskel, højst 2 etager · simple og traditionelle CC2-konstruktioner i landbrugs-, industri- og lagerbygninger i én etage med spændvidde højst 40 m'],
    ['KK2', 'CC2-konstruktioner, der ikke er omfattet af KK1 eller KK3'],
    ['KK3', 'CC2-konstruktioner, der er komplekse eller utraditionelle · alle CC3-konstruktioner'],
    ['KK4', 'CC3-konstruktioner hvor svigtkonsekvenserne er særligt alvorlige — aftales individuelt med bygningsmyndigheden'],
  ], { col_widths: [10, 90], highlighted: (() => {
    const idx = ['KK1', 'KK2', 'KK3', 'KK4'].indexOf(kk) + 1
    return idx > 0 ? [`${idx},0`, `${idx},1`] : []
  })() })
  T(
    'Nedrykning ved ombygning (BR18 § 489, stk. 2) — begge forudsætter at både den ' +
    'eksisterende konstruktion og selve indgrebet er simple og traditionelle:\n' +
    '· CC2 → KK1 ved simpel og traditionel ombygning/forandring i en eksisterende simpel og traditionel konstruktion.\n' +
    '· CC3 → KK2 ved samme, i etagebyggeri til længere ophold med højst 6 etager over terræn og spændvidde på højst 8 m.\n\n' +
    'I begge tilfælde skal kontrollen af dokumentationen fortsat ske efter BR18 kapitel 30 ' +
    'svarende til konstruktionsklasse 2. Nedrykningen letter altså konstruktionsklassen, ' +
    'ikke dokumentationskontrollen.'
  )
  TBL('Tabel 2.3a — Kontrolkrav pr. konstruktionsklasse (DS 1140:2014)', [
    ['Klasse', 'Projekteringskontrol', 'Udførelseskontrol', 'Dokumentation'],
    ['KK1', 'Egenkontrol af projekterende', 'Egenkontrol af udførende', 'Ingen særlige krav'],
    ['KK2', 'Uafhængig kontrol: A1 skal kontrolleres af en anden person. Beregninger og tegninger kontrolleres af en person, der ikke har udført den pågældende del. Internt i samme firma er tilstrækkeligt.', 'Egenkontrol + systematisk stikprøvekontrol af udførende', 'Kontrolplan B2 + kontrolrapport B3'],
    ['KK3', 'Ekstern uvildig kontrol af alt projektmateriale — kræver eksternt firma', 'Udvidet ekstern uvildig udførelseskontrol', 'B2 + B3 + tredjepartsgodkendelse af projektgrundlag'],
    ['KK4', 'Særlig kontrol — aftales individuelt med bygningsmyndigheden', 'Særlig kontrol — aftales individuelt', 'Individuel aftale med bygningsmyndigheden'],
  ], { highlighted: (() => {
    const idx = ['KK1', 'KK2', 'KK3', 'KK4'].indexOf(kkResult.dokumentationskrav ? 'KK2' : kk) + 1
    return idx > 0 ? Array.from({ length: 4 }, (_, ci) => `${idx},${ci}`) : []
  })() })
  T(
    'Nærmere om KK2-kontrolkrav (DS 1140:2014 Tabel B4b, note 2):\n' +
    '· Konstruktionsgrundlag A1: krav om uafhængig kontrol (en anden person end den, der har udarbejdet den pågældende del).\n' +
    '· Statiske beregninger A2 og tegninger A3: kontrolleres af en person, der ikke har udført netop den pågældende delberegning eller tegning — internt i firmaet er tilstrækkeligt.\n' +
    '· Kontrollen dokumenteres i B2 (kontrolplan) og B3 (kontrolrapport).'
  )

  H(3, '2.3 Sikkerhed')
  T(
    'Bygningen henføres til følgende klasser:\n' +
    `  Konsekvensklasse:            CC${cc}\n` +
    `  Konstruktionsklasse:         ${kk}\n` +
    `  Pålidelighedsklasse:         ${rc}\n` +
    `  K_FI-faktor (STR/GEO):       ${kfi}   (se Tabel 2.2a for CC-afhængighed)\n` +
    '  K_FI-faktor (EQU/geoteknik): 1,0    (gælder uafhængigt af CC iht. DK NA:2024)\n' +
    `  Geoteknisk kategori:         GK[${cc}]\n` +
    '  Brandklasse (BR18):          BK[…]'
  )

  H(3, '2.4 IKT-værktøjer')
  T(
    'Følgende software er anvendt i projekteringen:\n' +
    '  Omkreds — statisk dokumentation og eftervisninger\n' +
    '  [Evt. øvrigt beregningsprogram, fx Tekla Tedds / FEM-Design / RFEM]\n' +
    '  [BIM-program, fx Revit / Archicad]'
  )

  H(3, '2.5 Referencer')
  {
    const refs = [
      '[1] Bygningsreglement BR18, seneste udgave',
      '[2] SBi-anvisning 271, 3. udgave — Dokumentation og kontrol af bærende konstruktioner',
      '[3] DS/INF 1990:2024 — Vejledning til konsekvensklasser',
    ]
    if (o.geoteknisk)   refs.push(`[${refs.length + 1}] [Geoteknisk rapport — firma, rapportnr., dato]`)
    if (o.eksisterende) refs.push(`[${refs.length + 1}] [Dokumentation for eksisterende konstruktioner]`)
    refs.push(`[${refs.length + 1}] [Arkitekttegninger — tegningsliste, revisioner]`)
    T(refs.join('\n'))
  }

  // ── 3. Forundersøgelser ─────────────────────────────────────────────────────
  // Every heading is kept even when it does not apply: A2 and B1 reference
  // these numbers, and a checker reads "ikke relevant" as an answer, whereas a
  // missing section reads as an omission.
  H(2, '3. Forundersøgelser')

  H(3, '3.1 Grunden og lokale forhold')
  T('[Beskriv grundens beskaffenhed, terræn, afvandingsforhold og lokale påvirkninger.]')

  H(3, '3.2 Geotekniske forhold')
  T(o.geoteknisk
    ? `Geoteknisk kategori: GK[${cc}] (DS/EN 1997-1)\n\n` +
      'Funderingsforhold (fra geoteknisk rapport [ref.]):\n' +
      '  Bæredygtig jordbundsydelse: σ = … kN/m²\n' +
      '  Fundamentskote (underkant): +… m DVR90 (ca. … m under terræn)\n' +
      '  Frostfri dybde: 0,9 m (DK NA til DS/EN 1997-1)\n' +
      '  Grundvandskote: +… m DVR90\n\n' +
      'Jordparametre (karakteristiske værdier):\n' +
      '  Friktionsvinkel: φ_k = … °\n' +
      '  Kohæsion: c_k = … kPa\n' +
      '  Effektiv rumvægt: γ_k = … kN/m³'
    : 'Der foreligger ikke en geoteknisk rapport for projektet. Funderingsforholdene ' +
      'fastlægges på baggrund af [grundlag] — vurderingen skal bekræftes inden udførelse.')

  H(3, '3.3 Klima- og miljøtekniske forhold')
  T('[Beskriv relevante klima- og miljøtekniske påvirkninger, fx aggressivt miljø, kysteksponering, høj luftfugtighed eller forurenet jord.]')

  H(3, '3.4 Eksisterende konstruktioner')
  T(o.eksisterende
    ? '[Beskriv de eksisterende konstruktioner, deres bæreevne og tilstand, samt hvilket ' +
      'grundlag vurderingen hviler på (opmåling, arkivmateriale, prøvning).]'
    : IKKE_RELEVANT)

  H(3, '3.5 Tilstødende eksisterende bygværker')
  T(o.naboer
    ? '[Beskriv nabobyggeriers indflydelse — sætninger, vibrationer, udgravning tæt på fundamenter.]'
    : IKKE_RELEVANT)

  H(3, '3.6 Tilstødende påtænkte bygværker')
  T(o.naboer
    ? '[Beskriv fremtidige planlagte byggerier i nærheden og deres mulige påvirkning.]'
    : IKKE_RELEVANT)

  // ── 4. Konstruktioner ───────────────────────────────────────────────────────
  H(2, '4. Konstruktioner')

  H(3, '4.1 Statisk virkemåde')

  H(3, '4.1.1 Lodret lastnedføring')
  T(
    '[Beskriv lastvejen for lodrette laster. Eksempel:\n' +
    '"De lodrette laster fra egenlast, nyttelast og naturlaster påvirker dækkene som en ' +
    'fladelast, der fordeles til de bærende elementer. Dækkene fungerer som stive plader, ' +
    'der fordeler fladelasterne til understøtningerne, hvor lasterne omdannes til ' +
    'linjelaster/punktlaster og overføres til søjler/vægge, fundament og undergrund."\n\n' +
    'Indsæt evt. snit- eller principskitse som billede.]'
  )

  H(3, '4.1.2 Vandret lastføring')
  T(
    '[Beskriv stabiliseringssystemet, og hvilke vægge/kerner der stabiliserer i x- og ' +
    'y-retningen. Eksempel:\n"Bygningens stabiliserende hovedsystem udføres som vægge, der ' +
    'virker som skiver. Dækkene fungerer som stive plader, der fordeler de vandrette kræfter ' +
    'til stabiliseringselementerne."]'
  )

  H(3, '4.2 Anvendelseskrav')
  T(
    'Der stilles følgende krav til udbøjning (SLS):\n' +
    '  Dæk og bjælker generelt: L/300 for karakteristiske lastkombinationer\n' +
    '  Dæk med skrøbelig belægning (fliser, terrazzo): L/400\n' +
    '  Tagelementer: L/200\n\n' +
    '[Tilpas efter projektets krav og aftale med bygherren. Angiv evt. absolutte værdier i mm.]'
  )

  H(3, '4.3 Komfortkrav')
  T('Der stilles krav til vibrationskomfort for etagedæk iht. DS/EN 1990 DK NA:2024 Tabel A1.4. Kravene angiver minimumsegenfrekvens og maksimal RMS-acceleration.')
  TBL('Tabel 4.1 — Krav til vibrationskomfort for etagedæk (DS/EN 1990 DK NA:2024, Tabel A1.4)', [
    ['Konstruktionstype / rum', 'Min. egenfrekvens f₁ [Hz]', 'Maks. RMS-acceleration a_rms [% g]', 'a_rms ca. [m/s²]'],
    ['Tribuner med fikserede sæder', '3,4', '5,0', '~0,49'],
    ['Boliger og hotelværelser', '8,0', '0,5', '~0,049'],
    ['Kontorlokaler', '4,0', '1,0', '~0,098'],
  ])
  T('Egenfrekvens og acceleration kontrolleres for den dominerende fodgængerfrekvens (typisk 2 Hz lodrette trin) iht. bilag til DS/EN 1990.\n\nValgt anvendelse: […] — krav: f₁ ≥ […] Hz og a_rms ≤ […] % g\nBeregnede værdier eftervises i A2.')

  H(3, '4.4 Funktionskrav')
  T('Byggeriet gennemføres iht. bestemmelserne i BR18 og gældende normer.\n[Beskriv særlige funktionskrav — akustik, vandtæthed, brandadskillende vægge, adskillelse fra installationer.]')

  H(3, '4.5 Robusthed')
  T('Konstruktionernes robusthed vurderes iht. DS/EN 1990 og DS/EN 1991-1-7. Minimumskrav for mekaniske forbindelser til sikring mod progressivt kollaps:')
  TBL('Tabel 4.2 — Minimumskrav til robusthed (punkt- og linjelast)', [
    ['Etageantal', 'Punktlast [kN]', 'Linjelast [kN/m]'],
    ['1-2 etager', '10 (20)', '2 (4)'],
    ['3-5 etager', '20', '4'],
    ['6-10 etager', '40', '8'],
    ['11-15 etager', '60', '12'],
  ])
  T('Værdier i parentes gælder ved CC2 med mere end 2 etager.')

  H(3, '4.6 Levetid')
  T('Bygværket henføres til kategori 4 iht. DS/EN 1990 Tabel 2.1 — almindelige konstruktioner med en vejledende forventet levetid på 50 år.\n[Kategori 5 (100 år) ved monumentale bygninger, broer og anlægskonstruktioner.]')

  H(3, '4.7 Brand')
  T('Brandklasse (BR18 § 29): BK[…]\n\nBrandtekniske krav til bærende konstruktioner:\n  Dæk, øverste etage: R[…]\n  Dæk, stueetage: R[…] A2-s1,d0\n  [Tilpas efter brandklasse og konstruktionstype.]\n\n[Brandteknisk dokumentation udarbejdes særskilt og er ikke en del af denne A1.]')

  H(3, '4.8 Udførelse')
  T(
    'Alle mål og koter er vejledende og skal kontrolleres på stedet inden udførelse.\n\n' +
    'Eventuel midlertidig afstivning hører til den arbejdsudførende i fuld udstrækning, ' +
    'inkl. evt. udarbejdelse af midlertidigt afstivningsprojekt.\n\n' +
    'Der regnes med god byggeskik og faglært arbejde på byggepladsen. Det anbefales, at der ' +
    'udføres tilsyn og kvalitetssikring i alle byggeriets faser.\n\n' +
    '[Særlige udførelseskrav — tolerancer, udstøbningsrækkefølge, hærde- og hviletider for ' +
    'beton, krav til montage af præfabrikerede elementer.]'
  )

  H(3, '4.9 Drift og vedligehold')
  T('[Beskriv særlige krav til drift og vedligehold, fx inspektion af ekspansionsbolte, vedligehold af overfladebehandling på stålkonstruktioner, kontrol af tagdækningens tæthed.]')

  // ── 5. Konstruktionsmaterialer ──────────────────────────────────────────────
  H(2, '5. Konstruktionsmaterialer')
  T(`Nedenstående karakteristiske materialeegenskaber lægges til grund for dimensioneringen. Projektet udføres i ${brug.length ? ogListe(brug).toLowerCase() : '[materiale]'}.`)

  H(3, '5.1 Grund og jord')
  T('Se afsnit 3.2 Geotekniske forhold.')

  H(3, '5.2 Beton')
  if (o.materialer.beton) {
    TBL('Tabel 5.1 — Karakteristiske betonstyrker (DS/EN 1992-1-1)', [
      ['Klasse', 'f_ck [MPa]', 'f_ctm [MPa]', 'E_cm [GPa]', 'Rumvægt [kN/m³]', 'Anvendelse i projektet'],
      ['C20/25', '20', '2,2', '30', '25', ''],
      ['C25/30', '25', '2,6', '31', '25', ''],
      ['C30/37', '30', '2,9', '33', '25', ''],
      ['C35/45', '35', '3,2', '34', '25', ''],
    ])
    T('Armering: B500 NOR (duktilitetsklasse N), f_yk = 500 MPa, E_s = 200 GPa\nBetondækningstykkelse: c_nom = [25 / 30 / 35] mm (afhængig af eksponeringsklasse)\nEksponeringsklasse: XC[1/2/3/4]\nPartialkoefficienter: γ_C = 1,50 (beton), γ_S = 1,15 (armering)')
  } else {
    T('Ikke anvendt i dette projekt.')
  }

  H(3, '5.3 Stål')
  if (o.materialer.staal) {
    TBL('Tabel 5.2 — Karakteristiske stålstyrker (DS/EN 1993-1-1)', [
      ['Kvalitet', 'Tykkelse t [mm]', 'f_y [MPa]', 'f_u [MPa]', 'E [GPa]', 'Rumvægt [kN/m³]'],
      ['S235', 't ≤ 40', '235', '360', '210', '78,5'],
      ['S235', '40 < t ≤ 80', '215', '360', '210', '78,5'],
      ['S355', 't ≤ 40', '355', '510', '210', '78,5'],
      ['S355', '40 < t ≤ 80', '335', '470', '210', '78,5'],
      ['S420', 't ≤ 40', '420', '520', '210', '78,5'],
    ])
    T(`Partialkoefficienter: γ_M0 = 1,00 (flydning), γ_M1 = 1,00 (instabilitet), γ_M2 = 1,25 (brud/forbindelser)\nUdførelsesklasse: EXC[2] iht. DS/EN 1090-2 (CC${cc}, SC1, PC2)`)
  } else {
    T('Ikke anvendt i dette projekt.')
  }

  H(3, '5.4 Murværk')
  if (o.materialer.murvaerk) {
    T('Murstenskvalitet: MU[20/30/50] iht. DS/EN 771-1\nMørtel: M[5/10/15] iht. DS/EN 998-2\nPartialkoefficient: γ_M = [2,3 / 2,5 / 3,0] afhængig af mørtelkategori')
  } else {
    T('Ikke anvendt i dette projekt.')
  }

  H(3, '5.5 Træ')
  if (o.materialer.trae) {
    TBL('Tabel 5.3 — Anvendelsesklasser for trækonstruktioner (DS/EN 1995-1-1)', [
      ['Klasse', 'Beskrivelse', 'Eksempler'],
      ['1', 'Fugtindhold svarende til 20 °C / 65 % relativ luftfugtighed (året rundt)', 'Opvarmede bygninger: boliger, kontorer, butikker'],
      ['2', 'Fugtindhold svarende til 20 °C / 80 % relativ luftfugtighed (året rundt)', 'Ventilerede, ikke permanent opvarmede bygninger. Fritidshuse, garager, lagre. Ventilerede tagkonstruktioner beskyttet mod nedbør'],
      ['3', 'Klimaforhold der kan føre til højere fugtindhold end klasse 2', 'Konstruktioner udsat for nedbør eller vand. Underlag for tagpaptage'],
    ])
    TBL('Tabel 5.4 — Lastvarighed (DS/EN 1995-1-1)', [
      ['Lastgruppe', 'Kode', 'Varighed', 'Eksempler'],
      ['Permanent', 'P', 'Mere end 10 år', 'Egenlast'],
      ['Langtidslast', 'L', '6 måneder til 10 år', 'Oplagret gods'],
      ['Mellemlang', 'M', '1 uge til 6 måneder', 'Variable laster, snelast'],
      ['Korttidslast', 'K', 'Mindre end 1 uge', 'Snelast, vindlast'],
      ['Øjeblikkelig', 'Ø', 'Øjeblikkelig', 'Ulykkeslast, vindlast'],
    ])
    TBL('Tabel 5.5 — Modifikationsfaktor k_mod og k_def (DS/EN 1995-1-1 Tabel 3.1 + 3.2)', [
      ['Materiale', 'Anv.kl.', 'k_mod Permanent', 'k_mod Langtid', 'k_mod Mellemlang', 'k_mod Korttid', 'k_mod Øjeblikkelig', 'k_def'],
      ['Konstruktionstræ / limtræ / LVL', '1', '0,60', '0,70', '0,80', '0,90', '1,10', '0,60'],
      ['Konstruktionstræ / limtræ / LVL', '2', '0,60', '0,70', '0,80', '0,90', '1,10', '0,80'],
      ['Konstruktionstræ / limtræ / LVL', '3', '0,40', '0,55', '0,65', '0,70', '0,90', '2,00'],
    ])
    TBL('Tabel 5.6 — Materialekvaliteter og karakteristiske værdier', [
      ['Konstruktionsdel', 'Anv. klasse', 'Styrkeklasse', 'f_m,k [MPa]', 'f_c,0,k [MPa]', 'E_0,mean [MPa]', 'Densitet ρ_k [kg/m³]'],
      ['Træskeletvægge — indvendige', '1', 'Min. C18 (iht. leverandør)', '18', '18', '9.000', '380'],
      ['Træskeletvægge — udvendige', '3', 'GL24c', '24', '21,5', '11.000', '420'],
      ['Bjælker (limtræ) — indvendige', '1', 'GL24c', '24', '21,5', '11.000', '365'],
      ['Bjælker (limtræ) — udvendige', '3', 'GL24c', '24', '21,5', '11.000', '365'],
      ['CLT — tagdæk', '1', 'CL24', '24', '21', '11.000', '420'],
      ['CLT — etagedæk', '1', 'CL24', '24', '21', '11.000', '420'],
      ['CLT — vægge', '1', 'CL24', '24', '21', '11.000', '420'],
    ])
    T(
      `Partialkoefficienter (ULS, vedvarende og midlertidige tilstande), med γ₃ = ${g3} for ${kk}:\n` +
      `  Limtræ, LVL og pladematerialer: γ_M = 1,30 × ${g3} = ${(1.30 * Number(g3.replace(',', '.'))).toFixed(2).replace('.', ',')}\n` +
      `  Konstruktionstræ:               γ_M = 1,35 × ${g3} = ${(1.35 * Number(g3.replace(',', '.'))).toFixed(2).replace('.', ',')}\n` +
      `  Forbindelser (dornforbindelser): γ_M = 1,35 × ${g3} = ${(1.35 * Number(g3.replace(',', '.'))).toFixed(2).replace('.', ',')}\n` +
      `  Forbindelser (limede bolte):     γ_M = 1,50 × ${g3} = ${(1.50 * Number(g3.replace(',', '.'))).toFixed(2).replace('.', ',')}\n\n` +
      'γ₃ efter kontrolklasse: skærpet (KK3) = 0,95 · normal (KK2) = 1,00 · lempet (KK1) = 1,10\n\n' +
      'Fugtindhold ved levering:\n' +
      '  Konstruktionstræ: maks. 15 % ± 2 %\n' +
      '  CLT og limtræ: maks. 12 % ± 2 %'
    )
  } else {
    T('Ikke anvendt i dette projekt.')
  }

  // ── 6. Laster ───────────────────────────────────────────────────────────────
  H(2, '6. Laster')

  H(3, '6.1 Lastkombinationer og lasttilfælde')
  T(
    'Dimensionering udføres i brudgrænsetilstand (ULS) og anvendelsesgrænsetilstand (SLS) iht. DS/EN 1990 DK NA:2024.\n\n' +
    'LAK 1: Anvendelsesgrænsetilstand\nHåndteres under den enkelte bygningsdel med udgangspunkt i de opsummerede karakteristiske laster.\n\n' +
    'LAK 2: Brudgrænsetilstand (STR)\n' +
    '  LAK 2.1 — Nyttelast dominerende:\n    K_FI × (G_sup + 1,5 × (Q_prim + ψ_Q,0 × Q_sek + ψ_S,0 × S + ψ_V,0 × V))\n\n' +
    '  LAK 2.2 — Snelast dominerende:\n    K_FI × (G_sup + 1,5 × (ψ_Q,0 × Q + S + ψ_V,0 × V))\n\n' +
    '  LAK 2.3 — Vindlast dominerende:\n    K_FI × (G_sup + 1,5 × (ψ_Q,0 × Q + V))\n\n' +
    '  LAK 2.4 — Vindlast dominerende (opvæltning):\n    0,9 × G_inf + 1,5 × K_FI × V\n\n' +
    '  LAK 2.5 — Egenlast dominerende:\n    1,2 × K_FI × G_sup\n\n' +
    'LAK 3: Ulykkesgrænsetilstand (brand)\n' +
    '  LAK 3.1 — Nyttelast primær:  G_sup + ψ_Q,1 × Q\n' +
    '  LAK 3.2 — Snelast primær:    G_sup + ψ_Q,2 × Q + ψ_S,1 × S\n' +
    '  LAK 3.3 — Vindlast primær:   G_sup + ψ_Q,2 × Q + ψ_V,1 × V\n\n' +
    'OBS: Ved afvigelse fra ovenstående noteres dette ved den enkelte lastnedføring.\n' +
    `Konsekvensklasse CC${cc}: K_FI = ${kfi}`
  )
  TBL('Tabel 6.1 — ULS-lastsikkerhedsfaktorer (DS/EN 1990 DK NA:2024, Tabel A1.2(B), STR/GEO)', [
    ['Formel', 'Udtryk', 'γ_G,sup', 'γ_G,inf', 'γ_Q,1', 'ξ (DK NA)'],
    ['6.10a', 'γ_G,sup × K_FI × G_k + Σ(γ_Q,i × K_FI × ψ_0,i × Q_k,i)', '1,35', '1,00', '1,50 × ψ_0,i', '—'],
    ['6.10b', 'ξ × γ_G,sup × K_FI × G_k + γ_Q,1 × K_FI × Q_k,1 + Σ(γ_Q,i × K_FI × ψ_0,i × Q_k,i)', '1,35', '1,00', '1,50', '0,89'],
    ['EQU', 'γ_G,sup × G_k + γ_Q,1 × ψ_0,1 × Q_k,1', '1,05', '0,95', '1,50 × ψ_0,1', '—'],
    ['GEO', 'Som STR 6.10a/b med geotekniske partialkoefficienter', '1,35', '1,00', '1,50', '0,89'],
  ], { col_widths: [8, 52, 10, 10, 12, 8] })

  H(3, '6.2 Permanente laster')
  T('Egenlaster fremgår generelt af tværsnittets geometri og nedenstående materialevægte (DS/EN 1991-1-1 Annex A).')
  {
    const alle = [
      ['Materiale / konstruktionselement', 'Rumvægt / fladelast', 'Enhed'],
      ...(o.materialer.beton ? [
        ['Armeret beton (in-situ)', '25,0', 'kN/m³'],
        ['Uarmeret beton', '24,0', 'kN/m³'],
      ] : []),
      ...(o.materialer.staal ? [['Konstruktionsstål', '78,5', 'kN/m³']] : []),
      ...(o.materialer.trae ? [
        ['Konstruktionstræ C24 (gran/fyr)', '4,2', 'kN/m³'],
        ['Limtræ GL24c/GL28h', '4,5', 'kN/m³'],
        ['CLT CL24', '4,2', 'kN/m³'],
      ] : []),
      ...(o.materialer.murvaerk ? [['Murværk, massivt tegl', '18,0-22,0', 'kN/m³']] : []),
      ['Gipsplader 13 mm', '0,10', 'kN/m²'],
      ['Tagsten, beton', '0,50', 'kN/m²'],
      ['Tagsten, tegl', '0,60', 'kN/m²'],
      ['Tagpap + 200 mm isolering', '0,15-0,25', 'kN/m²'],
      ['Terrazzo-/flisegulv 20 mm + mørtel', '0,60-1,00', 'kN/m²'],
    ]
    TBL('Tabel 6.2 — Materialevægte (DS/EN 1991-1-1 Annex A)', alle)
  }

  H(3, '6.3 Nyttelast')
  T('Nyttelaster fastsættes iht. DS/EN 1991-1-1 DK NA:2024. Nedenstående tabel angiver projektets valgte nyttelaster med ψ-faktorer.')
  TBL('Tabel 6.3 — Projektets nyttelaster (lodrette flade- og punktlaster)', [
    ['Betegnelse', 'Beskrivelse / rum', 'Kat.', 'q_k [kN/m²]', 'Q_k [kN]', 'ψ_0', 'ψ_1 (brand)', 'ψ_2 (ulykke)'],
    ['Q01', '[fx boliger / hotelværelser]', 'A', '1,5', '2', '0,5', '0,3', '0,2'],
    ['Q02', '[fx altaner]', 'A', '2,5', '2', '0,5', '0,3', '0,2'],
    ['Q03', '[fx loftsrum]', 'A', '1,0', '0,5', '0,5', '0,3', '0,2'],
    ['Q04', '[fx kontorer / administration]', 'B', '2,5', '2,5', '0,6', '0,4', '0,2'],
    ['Q05', '[fx trapper, gange, fællesarealer]', 'C', '5,0', '4', '0,6', '0,6', '0,5'],
    ['Q06', '[fx tag — ikke tilgængeligt]', 'H', '0,5', '1,0', '0', '0', '0'],
  ])
  TBL('Tabel 6.4 — ψ-faktorer for variable laster (DS/EN 1990 DK NA:2024, Tabel A1.1)', [
    ['Lasttype', 'Lastkategori / anvendelse', 'ψ_0', 'ψ_1', 'ψ_2'],
    ['Nyttelast — kat. A', 'Boliger og boligformål', '0,5', '0,3', '0,2'],
    ['Nyttelast — kat. B', 'Kontor- og administrationsarealer', '0,6', '0,4', '0,2'],
    ['Nyttelast — kat. C1-C4', 'Forsamlingslokaler, biografer, kirker, museer, restauranter', '0,6', '0,6', '0,5'],
    ['Nyttelast — kat. C5', 'Forsamlingslokaler med risiko for trængsel (stadioner, koncerter)', '0,8', '0,7', '0,6'],
    ['Nyttelast — kat. D', 'Butikker og forretningsarealer', '0,6', '0,6', '0,5'],
    ['Nyttelast — kat. E', 'Lagerbygninger', '0,8', '0,8', '0,7'],
    ['Nyttelast — kat. F', 'Trafiklast ≤ 30 kN (lette køretøjer, parkering)', '0,6', '0,6', '0,5'],
    ['Nyttelast — kat. G', 'Trafiklast 30-160 kN (tunge køretøjer)', '0,6', '0,5', '0,3'],
    ['Nyttelast — kat. H', 'Tage (ikke tilgængelige)', '0', '0', '0'],
    ['Snelast (DK)', 'Kombineret med andre variable laster (primær/sekundær)', '0,3', '0,2', '0'],
    ['Snelast (DK)', 'Kombineret med vindlast som primær', '0', '—', '—'],
    ['Vindlast (DK)', 'Kombineret med andre variable laster', '0,3', '0,2', '0'],
    ['Temperaturlast (DK)', 'Termiske deformationer (ikke brand)', '0,6', '0,5', '0'],
  ], { col_widths: [28, 52, 7, 7, 6] })

  H(3, '6.4 Naturlaster')

  H(3, '6.4.1 Snelast')
  TBL('Tabel 6.5 — Snelastzoner i Danmark (DS/EN 1991-1-3 DK NA, Figur DK.1)', [
    ['Zone', 's_k [kN/m²]', 'Geografisk dækning'],
    ['1', '0,9', 'Sjælland, Fyn, Lolland-Falster og de fleste øer'],
    ['2', '1,0', 'Det meste af Jylland (øst og centrale dele)'],
    ['3', '1,1', 'Vest- og nordvestjylland'],
    ['4', '1,5', 'Bornholm og højt beliggende lokaliteter'],
  ])
  T(
    'Grundet tagets udformning:\n' +
    '  Snezone: Zone […]   s_k = … kN/m²\n' +
    '  Tagtype: [ensidig / tosidig / fladt]   Hældning: α = … °\n' +
    '  Formfaktor: μ₁ = … (fra DK NA Figur DK.3)\n' +
    '  Karakteristisk tagsnelast: s = μ₁ × C_e × C_t × s_k = … kN/m²\n\n' +
    '[Beskriv evt. særlige snelastforhold — snefygning, snelommer ved højdespring.]'
  )

  H(3, '6.4.2 Vindlast')
  T(
    'Vindlast beregnes iht. DS/EN 1991-1-4 DK NA:2024.\n\n' +
    '  Basisvindhastighed: v_b,0 = 24 m/s\n' +
    '  Terrænkategori: [0 / I / II / III / IV]   (0 = hav, II = normal, IV = tæt bybebyggelse)\n' +
    `  Referencehøjde: z_ref = ${o.hoejdeOver || '…'} m\n` +
    '  Karakteristisk vindhastighedstryk: q_p = … kN/m²\n\n' +
    'Formfaktorer og vindtryk fremgår af A2.'
  )

  H(3, '6.5 Geometriske imperfektioner')
  T(o.materialer.staal || o.materialer.beton
    ? '[Beskriv indledende krængning φ₀ og reduktionsfaktor α_h iht. DS/EN 1993-1-1 § 5.3 (stål) ' +
      'eller DS/EN 1992-1-1 § 5.2 (beton).]'
    : IKKE_RELEVANT)

  H(3, '6.6 Ulykkeslaster')
  T(
    'Uidentificerede ulykkeslaster (robusthed) er gennemgået i afsnit 4.5.\n' +
    'Konstruktioner med krav om brandbæreevne undersøges i ulykkesgrænsetilstand (LAK 3).\n\n' +
    `Påkørsels-/eksplosionslast: ${Number(o.anvendelseNr) === 12
      ? 'A_d = … kN ved parkering og gennemkørsel (DS/EN 1991-1-7)'
      : IKKE_RELEVANT}`
  )

  H(3, '6.7 Seismisk last')
  T('Ikke relevant — den seismiske påvirkning er forsvindende i Danmark.')

  H(3, '6.8 Midlertidige laster')
  T('[Beskriv udførelseslaster iht. DS/EN 1991-1-6, fx last fra stilladser, kraner eller støbning af overliggende etage. Alternativt: ikke relevant.]')

  // ── Referencedokumenter ─────────────────────────────────────────────────────
  H(2, 'Referencedokumenter')
  TBL('Tabel 7.1 — Projektdokumenter og referencer', [
    ['Dok. nr.', 'Titel', 'Udstedt af', 'Dato / rev.'],
    ['A1', 'Konstruktionsgrundlag (dette dokument)', m.firm_name || '', ''],
    ['A2', 'Statiske beregninger', m.firm_name || '', ''],
    ['A3', 'Konstruktionstegninger', '', ''],
    ['B1', 'Statisk projektredegørelse', m.firm_name || '', ''],
    ['B2', 'Statisk kontrolplan', m.firm_name || '', ''],
    ['B3', 'Statisk kontrolrapport', m.firm_name || '', ''],
    ...(o.geoteknisk ? [['GEO-01', 'Geoteknisk rapport', '', '']] : []),
    ['ARK-01', 'Arkitekttegninger', '', ''],
  ])

  // ── Godkendelse ─────────────────────────────────────────────────────────────
  H(2, 'Godkendelse')
  T(
    'Konstruktionsgrundlaget (A1) er udarbejdet og kontrolleret iht. DS 1140 og udgør grundlaget for de statiske beregninger (A2).\n\n' +
    `Udarbejdet af:   ___________________________   Dato: ____________\n                 ${m.engineer || 'Navn, titel'}\n\n` +
    `Kontrolleret af: ___________________________   Dato: ____________\n                 ${m.checker || 'Navn, titel'}` +
    (kk === 'KK2' ? ' (uafhængig kontrollant, KK2)' : kk === 'KK3' ? ' (ekstern uvildig kontrollant, KK3)' : '') +
    `\n\nGodkendt af:     ___________________________   Dato: ____________\n                 ${m.approver || 'Navn, stilling'}`
  )

  return B
}
