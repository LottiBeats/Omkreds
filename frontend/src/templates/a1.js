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

import { skrivAfsnit } from './a1Afsnit/index.js'
import robusthed from './a1Afsnit/robusthed.js'
import vandret from './a1Afsnit/vandretLastfoering.js'
import geoteknik from './a1Afsnit/geoteknik.js'
import udfoerelse from './a1Afsnit/udfoerelse.js'

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

// ── Brand ─────────────────────────────────────────────────────────────────────
//
// Brandklasse and anvendelseskategori are the fire consultant's determination,
// not something to derive from the structural description: they follow from the
// fire strategy, and getting them wrong in A1 would put a claim in a signed
// document that the fire documentation then contradicts. So they are recorded
// here, with what each one means, and the A1 states them as given.
//
// Deliberately no paragraph citations: the numbering in BR18 kapitel 5 has
// moved between revisions, and the section that used to be generated cited
// "§ 29" for brandklasse, which is not where it lives. A wrong reference in a
// document somebody signs is worse than none.

export const BRANDKLASSER = [
  { key: '',    label: 'Ikke fastlagt endnu',
    kort: 'fastlægges af brandrådgiveren' },
  { key: 'BK1', label: 'BK1 — simpelt, traditionelt byggeri',
    kort: 'brandforholdene dokumenteres ved præaccepterede løsninger, uden certificeret brandrådgiver' },
  { key: 'BK2', label: 'BK2 — præaccepterede løsninger',
    kort: 'dokumenteres ved præaccepterede løsninger med certificeret brandrådgiver' },
  { key: 'BK3', label: 'BK3 — brandteknisk dimensionering',
    kort: 'der afviges fra de præaccepterede løsninger, eller byggeriet er komplekst' },
  { key: 'BK4', label: 'BK4 — kompleks brandteknisk dimensionering',
    kort: 'brandteknisk dimensionering med uafhængig kontrol' },
]

export const ANVENDELSESKATEGORIER = [
  { key: '',  label: 'Ikke fastlagt endnu',   kort: 'fastlægges af brandrådgiveren' },
  { key: '1', label: '1 — kontor, industri o.l.',
    kort: 'dagophold, personer har kendskab til flugtvejene og kan selv bringe sig i sikkerhed' },
  { key: '2', label: '2 — undervisning, daginstitution o.l.',
    kort: 'dagophold, personer kender ikke nødvendigvis flugtvejene, men kan selv bringe sig i sikkerhed' },
  { key: '3', label: '3 — forsamlingslokale, butik o.l.',
    kort: 'dagophold med mange personer, som ikke kender flugtvejene, men selv kan bringe sig i sikkerhed' },
  { key: '4', label: '4 — bolig',
    kort: 'natophold, personer har kendskab til flugtvejene og kan selv bringe sig i sikkerhed' },
  { key: '5', label: '5 — hotel, kollegium o.l.',
    kort: 'natophold, personer kender ikke flugtvejene, men kan selv bringe sig i sikkerhed' },
  { key: '6', label: '6 — plejeinstitution, hospital o.l.',
    kort: 'personer kan ikke selv bringe sig i sikkerhed' },
]

export const KONSTRUKTIONSTYPER = ['Nybyggeri', 'Tilbygning', 'Ombygning']

export const MATERIALER = [
  { key: 'beton',    label: 'Beton' },
  { key: 'staal',    label: 'Stål' },
  { key: 'murvaerk', label: 'Murværk' },
  { key: 'trae',     label: 'Træ' },
]

// ── Valg, der erstatter fritekst ──────────────────────────────────────────────
//
// Det meste af et A1 er det samme fra sag til sag. Hvor det varierer, er det
// typisk ét af få svar -- saddeltag eller fladt tag, skiver eller rammer,
// stribe- eller punktfundamenter. Så er det et valg i beskrivelsen og ikke en
// tekst i firkantede parenteser, der skal skrives om i hvert dokument.

export const TAGFORMER = [
  { key: 'saddel',  label: 'Saddeltag' },
  { key: 'ensidig', label: 'Ensidigt tag' },
  { key: 'fladt',   label: 'Fladt tag' },
  { key: 'ingen',   label: 'Ingen tagkonstruktion i projektet' },
]

export const STABILISERING = [
  { key: 'skiver', label: 'Vægskiver',  tekst: 'vægge, der virker som skiver' },
  { key: 'rammer', label: 'Rammer',     tekst: 'momentstive rammer' },
  { key: 'kryds',  label: 'Vindkryds',  tekst: 'vindkryds' },
  { key: 'kerne',  label: 'Kerner',     tekst: 'stabiliserende kerner' },
]

export const FUNDERINGER = [
  { key: 'stribe',       label: 'Stribefundamenter',        tekst: 'stribefundamenter',           bestemt: 'stribefundamenterne' },
  { key: 'punkt',        label: 'Punktfundamenter',         tekst: 'punktfundamenter',           bestemt: 'punktfundamenterne' },
  { key: 'plade',        label: 'Pladefundament',           tekst: 'et pladefundament',         bestemt: 'pladefundamentet' },
  { key: 'pael',         label: 'Pælefundering',            tekst: 'pæle',                      bestemt: 'pælene' },
  { key: 'eksisterende', label: 'Eksisterende fundamenter', tekst: 'de eksisterende fundamenter', bestemt: 'de eksisterende fundamenter' },
]

export const TERRAENKATEGORIER = [
  { key: '0',   label: '0 — hav og kyst' },
  { key: 'I',   label: 'I — søer, flade åbne områder' },
  { key: 'II',  label: 'II — åbent land, lav bevoksning' },
  { key: 'III', label: 'III — forstæder, landsbyer, skov' },
  { key: 'IV',  label: 'IV — tæt bybebyggelse' },
]

export const MILJOER = [
  { key: 'normal',    label: 'Almindeligt indlandsmiljø' },
  { key: 'kyst',      label: 'Kystnært (salt i luften)' },
  { key: 'aggressiv', label: 'Aggressivt miljø (forurenet jord, kemikalier)' },
]

/** μ₁ for saddel-, ensidige og flade tage, DS/EN 1991-1-3 Tabel 5.2. */
export function mu1(alpha) {
  const a = Math.max(0, Number(alpha) || 0)
  if (a <= 30) return 0.8
  if (a < 60) return 0.8 * (60 - a) / 30
  return 0
}

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
  brandklasse: '',
  anvendelseskategori: '',
  tagform: 'saddel',
  taghaeldning: 30,
  stabilisering: { skiver: true, rammer: false, kryds: false, kerne: false },
  fundering: 'stribe',
  terraenkategori: 'II',
  miljoe: 'normal',
  geoRapport: '',
  software: '',
}

// ── Template ──────────────────────────────────────────────────────────────────

const IKKE_RELEVANT = 'Ikke relevant for dette projekt.'

/** Join a list the way Danish prose does: "beton, stål og træ". */
export function ogListe(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} og ${items[items.length - 1]}`
}

/**
 * Det bærende system, sagt ud fra beskrivelsen. A1 og B1 bruger den samme,
 * så de to dokumenter beskriver bygningen med de samme ord.
 */
export function baerendeSystem(o) {
  const mat = { ...DEFAULT_OPTIONS.materialer, ...(o.materialer || {}) }
  const stabValg = { ...DEFAULT_OPTIONS.stabilisering, ...(o.stabilisering || {}) }
  const fund = FUNDERINGER.find(f => f.key === o.fundering) ?? FUNDERINGER[0]
  const stab = STABILISERING.filter(x => stabValg[x.key])
  const harTag  = (o.tagform ?? DEFAULT_OPTIONS.tagform) !== 'ingen'
  const harDaek = (o.etager ?? 1) > 1 || !!o.kaelder
  // De bærende dele, sagt som de er: "træskeletvægge og spær i træ".
  const dele = []
  if (mat.murvaerk) dele.push('bærende murværksvægge')
  if (mat.beton)    dele.push(harDaek ? 'betonvægge og betondæk' : 'betonvægge')
  if (mat.staal)    dele.push('stålsøjler og stålbjælker')
  if (mat.trae)     dele.push(harTag ? (harDaek ? 'træskeletvægge, træbjælkelag og spær i træ' : 'træskeletvægge og spær i træ')
                                     : (harDaek ? 'træskeletvægge og træbjælkelag' : 'træskeletvægge'))
  return { mat, fund, stab, harTag, harDaek, dele }
}

export function makeA1Template(options = {}, metadata = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options,
              materialer: { ...DEFAULT_OPTIONS.materialer, ...(options.materialer || {}) },
              stabilisering: { ...DEFAULT_OPTIONS.stabilisering, ...(options.stabilisering || {}) } }
  const m = metadata || {}

  const { cc, row, begrundelse } = suggestCC(o)
  const kkResult = suggestKK({ ...o, cc })
  const kk   = kkResult.kk
  const rc   = `RC${cc}`
  const kfi  = kfiFor(cc)
  const g3   = gamma3For(kk)
  const brug = MATERIALER.filter(x => o.materialer[x.key]).map(x => x.label)
  const { mat, fund, stab, harTag, harDaek, dele } = baerendeSystem(o)

  let id = Date.now()
  const B = []
  const push = (type, data) => B.push({ id: id++, type, data })
  const H = (level, text, afsnit) => push('heading', afsnit ? { level, text, afsnit } : { level, text })
  const T = (text) => push('text', { text })
  const TBL = (caption, rows, extra = {}) =>
    push('table', { caption, has_header: true, rows, ...extra })
  // Afsnit, som hjælperen også kan skrive (templates/a1Afsnit): overskriften
  // får afsnittets nøgle, og teksten kommer fra samme definition -- med de
  // svar, der er valgt i hjælperen, hvis sagen har dem.
  const ktx = { ...o, cc, mat, fund, stab, harTag, harDaek, dele, kendt: true }
  const AFSNIT = (level, text, afsnit) => {
    H(level, text, afsnit.key)
    for (const b of skrivAfsnit(afsnit, ktx, m._afsnit?.[afsnit.key])) push(b.type, b.data)
  }

  H(1, 'A1 Konstruktionsgrundlag')

  // ── 1. Konstruktionsafsnit ──────────────────────────────────────────────────
  H(2, '1. Konstruktionsafsnit')

  H(3, '1.1 Bygværkets art og anvendelse')
  T(
    `Nærværende statiske dokumentation vedrører ${o.konstruktionstype.toLowerCase()} af ` +
    `${row.kort}` +
    `${m.address ? ` beliggende ${m.address}` : ' beliggende [adresse]'}, ` +
    `matr. ${m.matrikel || '[matrikelnummer]'}.\n\n` +
    `Bygherren er: ${m.client || '[bygherre]'}\n` +
    (m.project_ref ? `Sagsnr.: ${m.project_ref}\n` : '') + '\n' +
    `Bygningen er ${o.etager} etage${o.etager === 1 ? '' : 'r'} over terræn ` +
    `${o.kaelder ? 'med kælder' : 'uden kælder'}. Dokumentationen omfatter de bærende ` +
    `konstruktioner i de konstruktionsafsnit, der er listet i afsnit 1.3, og de elementer, ` +
    `der eftervises i A2.`
  )
  push('image', { image_b64: null, caption: 'Oversigtstegning', width_pct: 100 })

  H(3, '1.2 Konstruktioners art og opbygning')
  T(
    `Bygningens primære bærende system består af ${dele.length ? ogListe(dele) : '[bærende dele]'}, ` +
    `funderet på ${fund.tekst}.\n\n` +
    `Lodrette laster: ${harTag ? 'tag → ' : ''}${harDaek ? 'dæk → ' : ''}bjælker → søjler/vægge → fundament → undergrund\n` +
    `Vandret stabilisering: ${stab.length ? ogListe(stab.map(x => x.tekst)) : '[stabiliserende system]'}`
  )
  push('image', { image_b64: null, caption: 'Snit / opstalt', width_pct: 100 })

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
    ['DS 1140', 'Udførelseskontrol af bærende konstruktioner', '2019'],
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
    `Teknisk-faglig vurdering og begrundelse:\n${begrundelse}`
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
  TBL('Tabel 2.3a — Kontrol af den statiske dokumentation pr. konstruktionsklasse (BR18 kap. 30)', [
    ['Klasse', 'Kontrol af projekteringen', 'Udførelse'],
    ['KK1', 'Egenkontrol. Ingen krav om certificeret statiker.', 'Egenkontrol af den udførende'],
    ['KK2', 'Den statiske dokumentation kontrolleres af en certificeret statiker. Hver del kontrolleres af en anden person end den, der har udført den.', 'Almen kontrol efter DS 1140; bygherren erklærer, at den er udført'],
    ['KK3', 'Som KK2, og kontrollen udføres af en certificeret statiker, der ikke har deltaget i projekteringen af konstruktionen.', 'Som KK2'],
    ['KK4', 'Som KK3 og desuden tredjepartskontrol af en certificeret statiker, der er uafhængig af den projekterende virksomhed.', 'Som KK2 — omfanget aftales med bygningsmyndigheden'],
  ], { highlighted: (() => {
    const idx = ['KK1', 'KK2', 'KK3', 'KK4'].indexOf(kkResult.dokumentationskrav ? 'KK2' : kk) + 1
    return idx > 0 ? Array.from({ length: 3 }, (_, ci) => `${idx},${ci}`) : []
  })() })
  T(
    'Kravene følger BR18 kapitel 30 og Vejledning om statisk dokumentation. ' +
    'Tredjepartskontrol hører kun til konstruktionsklasse 4. Fra 2025 kontrollerer den ' +
    'certificerede statiker ikke længere udførelsesdokumentationen; bygherren erklærer i stedet, ' +
    'at der er udført almen kontrol efter DS 1140.\n' +
    '· Kontrollen af projekteringen planlægges i B2 (kontrolplan) og dokumenteres i B3 (kontrolrapport).'
  )

  H(3, '2.3 Sikkerhed')
  T(
    'Bygningen henføres til følgende klasser:\n' +
    `  Konsekvensklasse:            CC${cc}\n` +
    `  Konstruktionsklasse:         ${kk}\n` +
    `  Pålidelighedsklasse:         ${rc}\n` +
    `  K_FI-faktor (STR/GEO):       ${kfi}   (se Tabel 2.2a for CC-afhængighed)\n` +
    '  K_FI-faktor (EQU/geoteknik): 1,0    (gælder uafhængigt af CC iht. DK NA:2024)\n' +
    // Geoteknisk kategori følger ikke CC (DS/EN 1997-1 DK NA, K.3); GK2 med
    // mindre der er valgt andet i hjælperen til 3.2.
    `  Geoteknisk kategori:         GK${m._afsnit?.['a1.geoteknik']?.svar?.gk ?? '2'}\n` +
    `  Brandklasse:                 ${o.brandklasse || 'fastlægges af brandrådgiveren, se afsnit 4.7'}\n` +
    `  Anvendelseskategori:         ${o.anvendelseskategori || 'fastlægges af brandrådgiveren, se afsnit 4.7'}`
  )

  H(3, '2.4 IKT-værktøjer')
  T(
    'Følgende software er anvendt i projekteringen:\n' +
    '  Omkreds — statisk dokumentation og eftervisninger' +
    String(o.software || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean).map(x => `\n  ${x}`).join('')
  )

  H(3, '2.5 Referencer')
  {
    const refs = [
      '[1] Bygningsreglement BR18, seneste udgave',
      '[2] SBi-anvisning 271, 3. udgave — Dokumentation og kontrol af bærende konstruktioner',
      '[3] DS/INF 1990:2024 — Vejledning til konsekvensklasser',
    ]
    if (o.geoteknisk)   refs.push(`[${refs.length + 1}] ${String(o.geoRapport || '').trim() ? `Geoteknisk rapport: ${o.geoRapport.trim()}` : '[Geoteknisk rapport — firma, rapportnr., dato]'}`)
    if (o.eksisterende) refs.push(`[${refs.length + 1}] [Dokumentation for eksisterende konstruktioner]`)
    refs.push(`[${refs.length + 1}] Arkitekttegninger, jf. tegningslisten`)
    T(refs.join('\n'))
  }

  // ── 3. Forundersøgelser ─────────────────────────────────────────────────────
  // Every heading is kept even when it does not apply: A2 and B1 reference
  // these numbers, and a checker reads "ikke relevant" as an answer, whereas a
  // missing section reads as an omission.
  H(2, '3. Forundersøgelser')

  H(3, '3.1 Grunden og lokale forhold')
  T(o.geoteknisk
    ? 'Grundens beskaffenhed og jordbundsforhold fremgår af den geotekniske rapport, se afsnit 3.2. ' +
      'Overfladevand bortledes fra fundamenterne.'
    : 'Der er ikke kendskab til særlige forhold ved grunden. Overfladevand bortledes fra ' +
      'fundamenterne.')

  AFSNIT(3, '3.2 Geotekniske forhold', geoteknik)

  H(3, '3.3 Klima- og miljøtekniske forhold')
  T({
    normal: 'Bygværket ligger i et almindeligt indlandsmiljø uden aggressive påvirkninger, ' +
            'kysteksponering eller forurenet jord.',
    kyst: 'Bygværket ligger kystnært og er udsat for salt i luften. Udvendige stålkonstruktioner ' +
          'og samlingsmidler korrosionsbeskyttes for korrosivitetskategori C4 iht. DS/EN ISO 12944.',
    aggressiv: 'Bygværket er udsat for et aggressivt miljø. Konstruktioner i kontakt med jord ' +
               'eller kemikalier dimensioneres for den aktuelle eksponering: ' +
               '[beskriv påvirkningen og de valgte beskyttelsesforanstaltninger].',
  }[o.miljoe] ?? '')

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
    `De lodrette laster fra egenlast, nyttelast${harTag ? ' og snelast' : ''} virker som fladelaster ` +
    `på ${harTag && harDaek ? 'tag og dæk' : harTag ? 'taget' : 'dækkene'}. ` +
    (harTag ? `${mat.trae ? 'Spærene' : 'Tagkonstruktionen'} fører tagets laster til de bærende vægge og bjælker. ` : '') +
    (harDaek ? 'Dækkene spænder mellem understøtningerne og fører lasten videre som linje- og punktlaster. ' : '') +
    `Væggene og søjlerne fører lasterne ned til ${fund.bestemt}, som overfører dem til undergrunden.`
  )

  AFSNIT(3, '4.1.2 Vandret lastføring', vandret)

  H(3, '4.2 Anvendelseskrav')
  T(
    'Der stilles følgende krav til udbøjning (SLS):\n' +
    '  Dæk og bjælker generelt: L/300 for karakteristiske lastkombinationer\n' +
    '  Dæk med skrøbelig belægning (fliser, terrazzo): L/400\n' +
    '  Tagelementer: L/200\n\n' +
    'Kravene gælder, medmindre andet er aftalt med bygherren.'
  )

  H(3, '4.3 Komfortkrav')
  if (!harDaek) {
    T('Ikke relevant — bygningen har ingen etagedæk, der kan give gener fra svingninger.')
  } else {
    const kontor = o.anvendelseskategori === '1'
    T('Der stilles krav til vibrationskomfort for etagedæk iht. DS/EN 1990 DK NA:2024 Tabel A1.4. Kravene angiver minimumsegenfrekvens og maksimal RMS-acceleration.')
    TBL('Tabel 4.1 — Krav til vibrationskomfort for etagedæk (DS/EN 1990 DK NA:2024, Tabel A1.4)', [
      ['Konstruktionstype / rum', 'Min. egenfrekvens f₁ [Hz]', 'Maks. RMS-acceleration a_rms [% g]', 'a_rms ca. [m/s²]'],
      ['Tribuner med fikserede sæder', '3,4', '5,0', '~0,49'],
      ['Boliger og hotelværelser', '8,0', '0,5', '~0,049'],
      ['Kontorlokaler', '4,0', '1,0', '~0,098'],
    ], { highlighted: Array.from({ length: 4 }, (_, ci) => `${kontor ? 3 : 2},${ci}`) })
    T('Egenfrekvens og acceleration kontrolleres for den dominerende fodgængerfrekvens (typisk 2 Hz lodrette trin) iht. bilag til DS/EN 1990.\n\n' +
      `Valgt anvendelse: ${kontor ? 'kontorlokaler — krav: f₁ ≥ 4,0 Hz og a_rms ≤ 1,0 % g' : 'boliger — krav: f₁ ≥ 8,0 Hz og a_rms ≤ 0,5 % g'}\n` +
      'Beregnede værdier eftervises i A2.')
  }

  H(3, '4.4 Funktionskrav')
  T('Byggeriet gennemføres iht. bestemmelserne i BR18 og gældende normer. Der stilles ikke ' +
    'funktionskrav til de bærende konstruktioner ud over styrke, stabilitet og anvendelseskravene ' +
    'i afsnit 4.2 og 4.3.')

  AFSNIT(3, '4.5 Robusthed', robusthed)

  H(3, '4.6 Levetid')
  T('Bygværket henføres til kategori 4 iht. DS/EN 1990 Tabel 2.1 — almindelige konstruktioner med en vejledende forventet levetid på 50 år.')

  H(3, '4.7 Brand')
  {
    const bk  = BRANDKLASSER.find(x => x.key === o.brandklasse) ?? BRANDKLASSER[0]
    const ak  = ANVENDELSESKATEGORIER.find(x => x.key === o.anvendelseskategori)
                ?? ANVENDELSESKATEGORIER[0]
    T(
      `Brandklasse: ${bk.key || 'ikke fastlagt'} — ${bk.kort}.\n` +
      `Anvendelseskategori: ${ak.key || 'ikke fastlagt'} — ${ak.kort}.\n\n` +
      'Den brandtekniske dokumentation udarbejdes særskilt og er ikke en del af ' +
      'denne A1. Grænsefladen er, at brandstrategien fastlægger den krævede ' +
      'brandmodstandsevne for hver bygningsdel, og at de bærende konstruktioner ' +
      'herefter eftervises for den i A2 — i ulykkesgrænsetilstanden (LAK 3), med ' +
      'ψ-værdier som angivet i afsnit 5.'
    )

    // The load-bearing parts this project actually has, so the fire consultant
    // fills in a list that matches the building instead of two fixed lines.
    const dele = []
    if (o.kaelder) dele.push(['Dæk over kælder', 'R…', 'Adskillelse mod kælder'])
    for (let i = 1; i <= Math.max(1, o.etager); i++) {
      // Storey 1 is stueetagen, so the deck above storey i is the one over
      // "(i-1). sal" — with three storeys the top deck is over 2. sal, not 3.
      dele.push([
        i === 1 ? 'Dæk over stueetage' : `Dæk over ${i - 1}. sal`,
        'R…',
        i === o.etager ? 'Øverste etageadskillelse' : 'Etageadskillelse',
      ])
    }
    dele.push(['Tagkonstruktion',            'R…', 'Bærende tagkonstruktion'])
    dele.push(['Bærende vægge og søjler',    'R…', 'Lodret bærende system'])
    dele.push(['Afstivende konstruktioner',  'R…', 'Skal bevare stabiliteten i brandsituationen'])
    if (o.kaelder) dele.push(['Kælderydervægge', 'R…', 'Jordtryk virker fortsat under brand'])
    dele.push(['Fundamenter', '—', 'Normalt intet krav — vurderes ved brandudsat fundament'])

    TBL('Brandmodstandsevne for bærende konstruktioner', [
      ['Bygningsdel', 'Krav', 'Bemærkning'],
      ...dele,
    ])
    T('Kravene udfyldes fra brandstrategien. Hvor der stilles krav om ubrændbart ' +
      'materiale, suppleres med klassifikationen (fx A2-s1,d0).')

    // Only the materials the project is actually built from — a fire note about
    // concrete cover in an all-timber roof is noise the reader has to filter.
    const brandnoter = []
    if (o.materialer.trae) brandnoter.push(
      'Træ eftervises efter DS/EN 1995-1-2 med den reducerede tværsnitsmetode. ' +
      'Forkulningshastighed β_n = 0,80 mm/min for massivt nåletræ og 0,70 mm/min ' +
      'for limtræ (Tabel 3.1), hvortil lægges et nulstyrkelag d_0 = 7 mm. ' +
      'Beskyttede flader forkuller først efter beklædningens svigt.')
    if (o.materialer.staal) brandnoter.push(
      'Stål eftervises efter DS/EN 1993-1-2. Ubeskyttet stål når sjældent R30, ' +
      'da bæreevnen falder markant omkring 500–600 °C; kravet opnås normalt ved ' +
      'brandbeskyttelse (isolering, plade eller brandmaling) dimensioneret efter ' +
      'profilets massivitetsforhold A_m/V.')
    if (o.materialer.beton) brandnoter.push(
      'Beton eftervises efter DS/EN 1992-1-2, normalt ved tabelmetoden, hvor ' +
      'kravet omsættes til mindste tværsnitsdimension og afstand fra ' +
      'armeringens centrum til overfladen.')
    if (o.materialer.murvaerk) brandnoter.push(
      'Murværk eftervises efter DS/EN 1996-1-2 på grundlag af vægtykkelse, ' +
      'udnyttelsesgrad og eventuel pudslag.')
    if (brandnoter.length) T('Eftervisning pr. materiale:\n\n' + brandnoter.join('\n\n'))
  }

  AFSNIT(3, '4.8 Udførelse', udfoerelse)

  H(3, '4.9 Drift og vedligehold')
  T(['De bærende konstruktioner kræver ikke særlig drift ud over almindeligt vedligehold.',
     harTag && 'Tagdækningens tæthed kontrolleres jævnligt, så de bærende dele ikke opfugtes.',
     mat.trae && 'Trækonstruktioner holdes tørre; fugtskader og råd udbedres straks.',
     mat.staal && 'Overfladebehandling og brandbeskyttelse af stål efterses og udbedres ved skader.',
     mat.beton && 'Revner og afskalninger i beton efterses, så armeringen ikke korroderer.',
    ].filter(Boolean).join(' '))

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
    T(`Partialkoefficienter: γ_M0 = 1,00 (flydning), γ_M1 = 1,00 (instabilitet), γ_M2 = 1,25 (brud/forbindelser)\nUdførelsesklasse: EXC${Math.min(cc, 3)} iht. DS/EN 1090-2 (CC${cc}, SC1, PC2)`)
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
  {
    // Rækkerne efter bygningen: et A1 for et enfamiliehus skal ikke liste
    // kontorer og fællesarealer, som så skal slettes igen.
    const kat = o.bygningskategori
    const kontor = o.anvendelseskategori === '1'
    const rk = {
      bolig:  ['Boliger', 'A', '1,5', '2', '0,5', '0,3', '0,2'],
      altan:  ['Altaner', 'A', '2,5', '2', '0,5', '0,3', '0,2'],
      loft:   ['Loftsrum (ikke til beboelse)', 'A', '1,0', '0,5', '0,5', '0,3', '0,2'],
      kontor: ['Kontorer og administration', 'B', '2,5', '2,5', '0,6', '0,4', '0,2'],
      trappe: ['Trapper, gange og fællesarealer', 'C', '5,0', '4', '0,6', '0,6', '0,5'],
      tag:    ['Tag — ikke tilgængeligt', 'H', '0,5', '1,0', '0', '0', '0'],
    }
    const valgt =
      kat === 'enfamiliehus' ? [...(harDaek ? ['bolig'] : []), ...(harTag ? ['loft', 'tag'] : [])]
      : kat === 'etagebyggeri' ? [kontor ? 'kontor' : 'bolig', ...(kontor ? [] : ['altan']), 'trappe', ...(harTag ? ['tag'] : [])]
      : kat === 'landbrug' || kat === 'industri' ? (harTag ? ['tag'] : [])
      : ['bolig', 'altan', 'loft', 'kontor', 'trappe', ...(harTag ? ['tag'] : [])]
    TBL('Tabel 6.3 — Projektets nyttelaster (lodrette flade- og punktlaster)', [
      ['Betegnelse', 'Beskrivelse / rum', 'Kat.', 'q_k [kN/m²]', 'Q_k [kN]', 'ψ_0', 'ψ_1 (brand)', 'ψ_2 (ulykke)'],
      ...valgt.map((k, i) => [`Q${String(i + 1).padStart(2, '0')}`, ...rk[k]]),
    ])
    if (kat === 'landbrug' || kat === 'industri') {
      T('Nyttelaster fra oplag, maskiner og dyrehold fastsættes efter den konkrete anvendelse iht. DS/EN 1991-1-1 og angives ved de berørte konstruktionsdele i A2.')
    }
  }
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
  T(
    'Den karakteristiske terrænsnelast er s_k = 1,0 kN/m² i hele Danmark ' +
    '(DS/EN 1991-1-3 DK NA). En højere værdi, fx for en højtliggende eller ' +
    'særligt snebelastet lokalitet, begrundes her.'
  )
  if (!harTag) {
    T('Projektet omfatter ingen tagkonstruktion. Snelast indgår kun, hvor den føres videre til de konstruktioner, der eftervises.')
  } else {
    const alpha = o.tagform === 'fladt' ? 0 : Number(o.taghaeldning) || 0
    const m1 = mu1(alpha)
    const k = (x, d = 2) => x.toFixed(d).replace('.', ',')
    const form = (TAGFORMER.find(t => t.key === o.tagform)?.label ?? 'Tag').toLowerCase()
    T(
      'Grundet tagets udformning:\n' +
      '  s_k = 1,0 kN/m² (DK NA)\n' +
      `  Tagtype: ${form}   Hældning: α = ${k(alpha, 0)}°\n` +
      `  Formfaktor: μ₁ = ${k(m1)} (DS/EN 1991-1-3 Tabel 5.2)\n` +
      '  C_e = 1,0 (normal topografi), C_t = 1,0\n' +
      `  Karakteristisk tagsnelast: s = μ₁ × C_e × C_t × s_k = ${k(m1)} kN/m²` +
      (o.tagform === 'saddel'
        ? `\n\nFor saddeltaget undersøges desuden skæv fordeling med ${k(0.5 * m1)} kN/m² (0,5·μ₁) på den ene tagflade (DS/EN 1991-1-3 Figur 5.3).`
        : '') +
      '\n\nDer er ikke højdespring eller tilstødende højere bygninger, der giver snelommer. ' +
      'Opstår de, eftervises de særskilt i A2.'
    )
  }

  H(3, '6.4.2 Vindlast')
  T(
    'Vindlast beregnes iht. DS/EN 1991-1-4 DK NA:2024.\n\n' +
    '  Basisvindhastighed: v_b,0 = 24 m/s\n' +
    `  Terrænkategori: ${TERRAENKATEGORIER.find(t => t.key === o.terraenkategori)?.label ?? o.terraenkategori}\n` +
    `  Referencehøjde: z_ref = ${o.hoejdeOver || '[højde]'} m\n\n` +
    'Det karakteristiske vindhastighedstryk q_p, formfaktorer og vindtryk fremgår af vindberegningen i A2.'
  )

  H(3, '6.5 Geometriske imperfektioner')
  T(o.materialer.staal || o.materialer.beton
    ? [
        mat.staal && 'Stål: Globale imperfektioner medtages som en indledende krængning φ = φ₀·α_h·α_m ' +
          'med φ₀ = 1/200 iht. DS/EN 1993-1-1 § 5.3.2.',
        mat.beton && 'Beton: Geometriske imperfektioner medtages som en hældning θ_i = θ₀·α_h·α_m ' +
          'med θ₀ = 1/200 iht. DS/EN 1992-1-1 § 5.2.',
      ].filter(Boolean).join('\n')
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
  T('Laster i udførelsesfasen iht. DS/EN 1991-1-6 håndteres af den udførende ved midlertidig ' +
    'afstivning og understøtning, jf. afsnit 4.8. De permanente konstruktioner er ikke ' +
    'dimensioneret for særlige udførelseslaster' +
    (mat.beton && harDaek ? ', bortset fra støbning af overliggende dæk, som eftervises i A2.' : '.'))

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
    'Konstruktionsgrundlaget (A1) er udarbejdet og kontrolleret iht. BR18 kapitel 30 og udgør grundlaget for de statiske beregninger (A2).\n\n' +
    `Udarbejdet af:   ___________________________   Dato: ____________\n                 ${m.engineer || 'Navn, titel'}\n\n` +
    `Kontrolleret af: ___________________________   Dato: ____________\n                 ${m.checker || 'Navn, titel'}` +
    (kk === 'KK2' ? ' (uafhængig kontrollant, KK2)' : kk === 'KK3' ? ' (ekstern uvildig kontrollant, KK3)' : '') +
    `\n\nGodkendt af:     ___________________________   Dato: ____________\n                 ${m.approver || 'Navn, stilling'}`
  )

  return B
}
