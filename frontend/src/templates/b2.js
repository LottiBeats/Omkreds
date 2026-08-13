/**
 * b2.js — B2 Statisk kontrolplan (DS 1140)
 *
 * Generated from the same answers as A1 and B1 when they are available, so the
 * control plan states the project's actual konstruktionsklasse instead of a
 * placeholder, and lists only the control points that apply to it.
 *
 * Called without options — from the standalone B2 template in the block
 * palette — it emits the full list with the class left blank, which is the
 * behaviour it has always had.
 */
import { suggestCC, suggestKK, DEFAULT_OPTIONS } from './a1.js'

const KK_LEVEL = { KK1: 1, KK2: 2, KK3: 3, KK4: 4 }

/**
 * The control points, each tagged with the lowest konstruktionsklasse that
 * requires it and, where relevant, what makes it apply to a given project.
 *
 * `when` is checked against the project description: a control plan for a
 * timber roof should not ask anyone to inspect reinforcement before casting.
 */
const PROJEKTERINGSKONTROL = [
  { pos: '1',  description: 'Konstruktionsgrundlag (A1) er gennemgået og godkendt',                      kk: 'KK1', reference: 'A1' },
  { pos: '2',  description: 'Gældende normer og nationale annekser er identificeret',                    kk: 'KK1', reference: 'A1' },
  { pos: '3',  description: 'Laster og lastkombinationer er korrekte',                                   kk: 'KK1', reference: 'A2' },
  { pos: '4',  description: 'Geometriske mål og tværsnitsparametre er korrekte',                         kk: 'KK1', reference: 'A2, A3' },
  { pos: '5',  description: 'Materialeparametre er korrekte og dokumenterede',                           kk: 'KK1', reference: 'A1, A2' },
  { pos: '6',  description: 'Beregningsmodeller er repræsentative for den faktiske konstruktion',        kk: 'KK2', reference: 'A2' },
  { pos: '7',  description: 'Brudgrænsetilstand (STR/GEO) er kontrolleret',                              kk: 'KK1', reference: 'A2' },
  { pos: '8',  description: 'Anvendelsesgrænsetilstand (SLS – nedbøjning, revnedannelse) er kontrolleret', kk: 'KK2', reference: 'A2' },
  { pos: '9',  description: 'Stabiliteten (lodret og vandret) er sikret',                                kk: 'KK1', reference: 'A2, B1' },
  { pos: '10', description: 'Funderingen er kontrolleret (EC7/DS 415)',                                  kk: 'KK1', reference: 'A2', when: o => o.geoteknisk },
  { pos: '11', description: 'Anvendelsesklasse og lastvarighed er fastlagt for træet (EN 1995-1-1)',     kk: 'KK1', reference: 'A1, A2', when: o => o.materialer?.trae },
  { pos: '12', description: 'Konstruktionstegninger er i overensstemmelse med beregningerne',            kk: 'KK2', reference: 'A3' },
  { pos: '13', description: 'Forudsætninger om eksisterende konstruktion er verificeret på stedet',      kk: 'KK1', reference: 'A1', when: o => o.eksisterende },
]

const UDFOERELSESKONTROL = [
  { pos: '1', description: 'Materialer kontrolleret (leverandørattester, CE-mærkning)',          kk: 'KK1', reference: '' },
  { pos: '2', description: 'Geometriske afvigelser er inden for tolerancer (DS/ISO 4463)',       kk: 'KK1', reference: '' },
  { pos: '3', description: 'Samlinger og forbindelser er udført korrekt',                        kk: 'KK1', reference: 'A3' },
  { pos: '4', description: 'Fundering og jordarbejder er udført og godkendt',                    kk: 'KK1', reference: 'A3', when: o => o.geoteknisk },
  { pos: '5', description: 'Armeringsplacering kontrolleret inden støbning',                     kk: 'KK2', reference: 'A3', when: o => o.materialer?.beton },
  { pos: '6', description: 'Træets fugtindhold ved indbygning svarer til anvendelsesklassen',    kk: 'KK1', reference: '',    when: o => o.materialer?.trae },
  { pos: '7', description: 'Konstruktionen er i overensstemmelse med tegningerne',               kk: 'KK1', reference: 'A3' },
]

/** Keep the points that this project's class and description call for. */
function selectItems(rows, options, kk) {
  const level = KK_LEVEL[kk] ?? 4     // no class known → keep everything
  return rows
    .filter(r => (KK_LEVEL[r.kk] ?? 1) <= level)
    .filter(r => (options ? (r.when ? r.when(options) : true) : true))
    .map((r, i) => ({
      pos:         String(i + 1),     // renumber, so gaps from filtering don't show
      description: r.description,
      kk:          r.kk,
      control:     'E',
      responsible: '',
      reference:   r.reference,
    }))
}

export function makeB2Template(options = null, metadata = {}) {
  const o  = options ? { ...DEFAULT_OPTIONS, ...options,
                         materialer: { ...DEFAULT_OPTIONS.materialer, ...(options.materialer || {}) } }
                     : null
  const cc = o ? suggestCC(o).cc : null
  const kk = o ? suggestKK({ ...o, cc }).kk : null
  const m  = metadata || {}

  let id = Date.now()
  const B = []
  const push = (type, data) => B.push({ id: id++, type, data })

  push('heading', { level: 1, text: 'Statisk kontrolplan' })

  push('text', { text:
    'Udarbejdet i henhold til DS 1140 og DS/EN 1990.\n' +
    `Konstruktionsklasse: ${kk ?? 'KK…'}` +
    (cc ? ` · Konsekvensklasse: CC${cc}` : '') +
    ` · Projekt: ${m.project_name || '…'}` +
    (kk
      ? '\n\nKontrolplanen omfatter de kontrolpunkter, der gælder for ' +
        `${kk}. Punkter, der først kræves i en højere konstruktionsklasse, er ` +
        'udeladt. Kontrolomfang pr. punkt: E = egenkontrol' +
        // Only name the levels this class actually uses — listing U and T in a
        // KK1 plan invites someone to tick a box the class does not ask for.
        (KK_LEVEL[kk] >= 2 ? ', U = uvildig kontrol' : '') +
        (KK_LEVEL[kk] >= 3 ? ', T = tredjepartskontrol' : '') + '.'
      : '') })

  push('heading', { level: 2, text: 'Projekteringskontrol' })
  push('control_plan', {
    title: 'Projekteringskontrol',
    mode:  'plan',
    items: selectItems(PROJEKTERINGSKONTROL, o, kk),
  })

  // Independent control is a requirement of the class, not a check on the
  // structure, so it is stated separately rather than as another row that
  // looks like something to tick off during design.
  if (kk && KK_LEVEL[kk] >= 2) {
    push('text', { text:
      `${kk} kræver uvildig kontrol af projekteringen. Kontrollen skal udføres af ` +
      'en person, der ikke har deltaget i projekteringen af det pågældende ' +
      'konstruktionsafsnit' +
      (KK_LEVEL[kk] >= 3
        ? ', og der skal desuden udføres tredjepartskontrol.'
        : '.') +
      '\n\nUvildig kontrollant: …' +
      (KK_LEVEL[kk] >= 3 ? '\nTredjepartskontrollant: …' : '') })
  }

  push('heading', { level: 2, text: 'Udførelseskontrol' })
  push('control_plan', {
    title: 'Udførelseskontrol',
    mode:  'plan',
    items: selectItems(UDFOERELSESKONTROL, o, kk),
  })

  return B
}
