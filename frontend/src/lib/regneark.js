/**
 * regneark.js — regnearket i Omkreds: celler, formler og henvisninger mellem ark.
 *
 * Opfører sig som dansk Excel, så det, man ved derfra, virker:
 *
 *   =B3*C3              formler starter med =
 *   =SUM(B3:B9)         områder
 *   =Opbygning!G12      celle i et andet ark i samme dokument
 *   ='Tag og vægge'!B2  arknavn med mellemrum i apostroffer
 *   1,5   =AFRUND(A1;2) decimalkomma og semikolon mellem argumenter
 *   =HVIS(A1>0;"tryk";"træk")
 *
 * Tomme celler tæller som 0. Fejl hedder som i Excel (#DIV/0!, #REF!, #NAVN?,
 * #VÆRDI!, #CYKLUS!) og føres videre til de celler, der bruger dem.
 *
 * Udtrykket læses af mathjs' parser, men regnes her: kun tal, tekst, celler,
 * operatorer og funktionerne i FUNK. Der er ingen vej til mathjs' øvrige
 * funktioner (import, evaluate …) fra et regneark.
 *
 * Rene funktioner uden React, så de kan testes for sig (tests/regneark.test.mjs).
 */
import { parse } from 'mathjs'

// ── Celleadresser ───────────────────────────────────────────────────────────

/** 0 → A, 25 → Z, 26 → AA. */
export function kolNavn(i) {
  let s = ''
  i += 1
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26) }
  return s
}

/** A → 0, AA → 26. */
export function kolNr(navn) {
  let n = 0
  for (const ch of navn.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export const adresse = (r, k) => `${kolNavn(k)}${r + 1}`

/** "B3" → { r: 2, k: 1 }. */
export function laesAdresse(a) {
  const m = /^\$?([A-Za-z]{1,2})\$?(\d+)$/.exec(String(a).trim())
  if (!m) return null
  return { r: Number(m[2]) - 1, k: kolNr(m[1]) }
}

// ── Værdier ─────────────────────────────────────────────────────────────────

export class Fejl {
  constructor(kode) { this.kode = kode }
  toString() { return this.kode }
}
const F = (k) => new Fejl(k)
export const erFejl = (v) => v instanceof Fejl

/**
 * Et tal som dansk Excel læser det: "1,5", "-7,4", "1 000", "1.000,5".
 * Uden komma er punktum decimaltegn ("1.5"). Ellers null.
 */
export function laesTal(s) {
  const t = String(s ?? '').trim().replace(/[   ]/g, '').replace(/−/g, '-')
  if (!t) return null
  let n
  if (t.includes(',')) {
    if (!/^[-+]?\d{1,3}(\.\d{3})*(,\d+)?$|^[-+]?\d+(,\d+)?$/.test(t)) return null
    n = Number(t.replace(/\./g, '').replace(',', '.'))
  } else {
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null
    n = Number(t)
  }
  return Number.isFinite(n) ? n : null
}

/** Råt celleindhold → konstant (tal, tekst eller tom). Formler håndteres for sig. */
function konstant(raw) {
  if (raw === null || raw === undefined || raw === '') return ''
  const s = String(raw)
  const n = laesTal(s)
  if (n !== null) return n
  if (/^sand$/i.test(s.trim())) return true
  if (/^falsk$/i.test(s.trim())) return false
  return s
}

const tilTal = (v) => {
  if (erFejl(v)) return v
  if (v === '' || v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = laesTal(v)
  return n === null ? F('#VÆRDI!') : n
}

// ── Funktioner ──────────────────────────────────────────────────────────────

const flad = (args) => args.flat(Infinity)
const tal = (args) => {
  // Som Excel: i områder springes tekst og tomme celler over; direkte argumenter regnes om.
  const ud = []
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const v of a.flat(Infinity)) {
        if (erFejl(v)) return v
        if (typeof v === 'number') ud.push(v)
        else if (typeof v === 'boolean') ud.push(v ? 1 : 0)
      }
    } else {
      const n = tilTal(a)
      if (erFejl(n)) return n
      ud.push(n)
    }
  }
  return ud
}
const medTal = (fn) => (...args) => { const t = tal(args); return erFejl(t) ? t : fn(t) }
const en = (fn) => (a, ...rest) => {
  const x = tilTal(a); if (erFejl(x)) return x
  const r = rest.map(tilTal); const f = r.find(erFejl); if (f) return f
  const v = fn(x, ...r)
  return Number.isFinite(v) ? v : F('#TAL!')
}

const FUNK = {
  SUM: medTal(t => t.reduce((s, x) => s + x, 0)),
  MIN: medTal(t => (t.length ? Math.min(...t) : 0)),
  MAKS: medTal(t => (t.length ? Math.max(...t) : 0)),
  MIDDEL: medTal(t => (t.length ? t.reduce((s, x) => s + x, 0) / t.length : F('#DIV/0!'))),
  ANTAL: medTal(t => t.length),
  SUMPRODUKT: (...args) => {
    const lister = args.map(a => flad([a]))
    const n = lister[0]?.length ?? 0
    if (lister.some(l => l.length !== n)) return F('#VÆRDI!')
    let s = 0
    for (let i = 0; i < n; i++) {
      let p = 1
      for (const l of lister) { const x = typeof l[i] === 'number' ? l[i] : (l[i] === '' ? 0 : tilTal(l[i])); if (erFejl(x)) return x; p *= x }
      s += p
    }
    return s
  },
  HVIS: (b, ja = true, nej = false) => {
    if (erFejl(b)) return b
    return (typeof b === 'boolean' ? b : tilTal(b) !== 0) ? ja : nej
  },
  OG: (...a) => { const t = tal(a); return erFejl(t) ? t : t.every(x => x !== 0) },
  ELLER: (...a) => { const t = tal(a); return erFejl(t) ? t : t.some(x => x !== 0) },
  IKKE: (a) => { const x = tilTal(a); return erFejl(x) ? x : x === 0 },
  AFRUND: en((x, d = 0) => { const f = 10 ** d; return Math.round(x * f + (x >= 0 ? 1e-9 : -1e-9)) / f }),
  RUND_OP: en((x, d = 0) => { const f = 10 ** d; return Math.sign(x) * Math.ceil(Math.abs(x) * f - 1e-9) / f }),
  RUND_NED: en((x, d = 0) => { const f = 10 ** d; return Math.sign(x) * Math.floor(Math.abs(x) * f + 1e-9) / f }),
  ABS: en(Math.abs),
  KVROD: en(x => (x < 0 ? NaN : Math.sqrt(x))),
  POTENS: en((x, y) => x ** y),
  EKSP: en(Math.exp),
  LN: en(x => (x <= 0 ? NaN : Math.log(x))),
  LOG10: en(x => (x <= 0 ? NaN : Math.log10(x))),
  PI: () => Math.PI,
  SIN: en(Math.sin), COS: en(Math.cos), TAN: en(Math.tan),
  ARCSIN: en(Math.asin), ARCCOS: en(Math.acos), ARCTAN: en(Math.atan),
  RADIANER: en(x => x * Math.PI / 180),
  GRADER: en(x => x * 180 / Math.PI),
}
// Engelske navne, som mange også skriver.
const ALIAS = {
  MAX: 'MAKS', AVERAGE: 'MIDDEL', COUNT: 'ANTAL', SUMPRODUCT: 'SUMPRODUKT', IF: 'HVIS', AND: 'OG',
  OR: 'ELLER', NOT: 'IKKE', ROUND: 'AFRUND', ROUNDUP: 'RUND_OP', ROUNDDOWN: 'RUND_NED', SQRT: 'KVROD',
  POWER: 'POTENS', EXP: 'EKSP', ASIN: 'ARCSIN', ACOS: 'ARCCOS', ATAN: 'ARCTAN', RADIANS: 'RADIANER',
  DEGREES: 'GRADER', 'AFRUND.OP': 'RUND_OP', 'AFRUND.NED': 'RUND_NED',
}
export const FUNKTIONER = Object.keys(FUNK)

// ── Formler ─────────────────────────────────────────────────────────────────

const ARK = `(?:'((?:[^']|'')+)'|([A-Za-zÆØÅæøå_][\\wÆØÅæøå.]*))!`
const REF = new RegExp(`(${ARK})?(\\$?[A-Za-z]{1,2}\\$?\\d+)(?::(\\$?[A-Za-z]{1,2}\\$?\\d+))?(?![\\w(])`, 'g')

/**
 * Formlen som mathjs-udtryk med pladsholdere for cellerne, og listen over
 * dem. Tekst i anførselstegn røres ikke.
 */
export function oversaet(formel) {
  const refs = []
  const dele = String(formel).split(/("(?:[^"]|"")*")/)
  const ud = dele.map((del, i) => {
    if (i % 2 === 1) return del.replace(/""/g, '\\"')                   // tekst
    let s = del.replace(REF, (hel, _a, arkQ, arkU, fra, til, pos, str) => {
      // Ikke en del af et navn (fx LOG10) og ikke et funktionskald.
      const foer = str[pos - 1]
      if (foer && /[\wÆØÅæøå]/.test(foer)) return hel
      const ark = arkQ ? arkQ.replace(/''/g, "'") : arkU || null
      const a = laesAdresse(fra), b = til ? laesAdresse(til) : null
      if (!a || (til && !b)) return hel
      refs.push({ ark, fra: a, til: b })
      return ` __R${refs.length - 1}x `
    })
    s = s.replace(/(\d),(\d)/g, '$1.$2')
      .replace(/;/g, ',')
      .replace(/<>/g, '!=')
      .replace(/([^<>!=])=(?!=)/g, '$1==')
      .replace(/^=(?!=)/, '==')
      .replace(/[·×]/g, '*').replace(/−/g, '-').replace(/²/g, '^2').replace(/³/g, '^3')
      .replace(/&/g, ' | ')   // & (tekst) → | i træet, se regnNode
    // Funktionsnavne: store bogstaver og danske navne.
    s = s.replace(/([A-Za-zÆØÅæøå_][\wÆØÅæøå.]*)\s*\(/g, (hel, navn) => {
      const N = navn.toUpperCase()
      const kanon = FUNK[N] ? N : ALIAS[N]
      return kanon ? `${kanon.replace('.', '_')}(` : `__UKENDT_${N.replace(/\W/g, '_')}(`
    })
    return s
  })
  return { udtryk: ud.join(''), refs }
}

// ── Evaluering af træet ─────────────────────────────────────────────────────

function regnNode(node, scope) {
  switch (node.type) {
    case 'ConstantNode': return node.value
    case 'ParenthesisNode': return regnNode(node.content, scope)
    case 'SymbolNode': {
      if (node.name in scope) return scope[node.name]
      if (/^pi$/i.test(node.name)) return Math.PI
      if (/^sand$/i.test(node.name) || node.name === 'true') return true
      if (/^falsk$/i.test(node.name) || node.name === 'false') return false
      return F('#NAVN?')
    }
    case 'FunctionNode': {
      const navn = node.fn.name
      if (navn.startsWith('__UKENDT_')) return F('#NAVN?')
      const fn = FUNK[navn]
      if (!fn) return F('#NAVN?')
      const args = node.args.map(a => regnNode(a, scope))
      // HVIS og fejl i ubrugte grene: Excel regner kun den valgte gren.
      if (navn === 'HVIS') {
        const b = args[0]
        if (erFejl(b)) return b
        const sand = typeof b === 'boolean' ? b : tilTal(b) !== 0
        const v = sand ? (args.length > 1 ? args[1] : true) : (args.length > 2 ? args[2] : false)
        return Array.isArray(v) ? F('#VÆRDI!') : v
      }
      const r = fn(...args)
      return r
    }
    case 'OperatorNode': {
      const a = node.args.map(x => regnNode(x, scope))
      if (a.some(Array.isArray)) return F('#VÆRDI!')
      const op = node.op
      if (op === '|') {                       // tekstsammensætning (&)
        const f = a.find(erFejl)
        if (f) return f
        return a.map(v => (typeof v === 'number' ? formatVaerdi(v) : v === true ? 'SAND' : v === false ? 'FALSK' : String(v ?? ''))).join('')
      }
      if (node.fn === 'unaryMinus') { const x = tilTal(a[0]); return erFejl(x) ? x : -x }
      if (node.fn === 'unaryPlus') return tilTal(a[0])
      const fejl = a.find(erFejl)
      if (fejl) return fejl
      if (['==', '!=', '<', '>', '<=', '>='].includes(op)) {
        let [x, y] = a
        const xt = typeof x === 'string' && laesTal(x) === null, yt = typeof y === 'string' && laesTal(y) === null
        if (!(xt && yt)) { x = tilTal(x); y = tilTal(y) } else { x = x.toLowerCase(); y = y.toLowerCase() }
        if (erFejl(x) || erFejl(y)) return erFejl(x) ? x : y
        return { '==': x === y, '!=': x !== y, '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y }[op]
      }
      const [x, y] = a.map(tilTal)
      if (erFejl(x)) return x
      if (erFejl(y)) return y
      switch (op) {
        case '+': return x + y
        case '-': return x - y
        case '*': return x * y
        case '/': return y === 0 ? F('#DIV/0!') : x / y
        case '^': { const v = x ** y; return Number.isFinite(v) ? v : F('#TAL!') }
        default: return F('#VÆRDI!')
      }
    }
    case 'ConditionalNode': return F('#VÆRDI!')
    default: return F('#VÆRDI!')
  }
}

function regnUdtryk(udtryk, scope) {
  let node
  try { node = parse(udtryk) } catch { return F('#NAVN?') }
  return regnNode(node, scope)
}

// ── Arbejdsbogen ────────────────────────────────────────────────────────────

/**
 * Regn alle ark. ark: [{ navn, celler: string[][] }].
 * Returnerer { [navn]: (string|number|boolean|Fejl)[][] } med samme form som cellerne.
 */
export function regnBog(ark) {
  const efterNavn = new Map()
  for (const a of ark) efterNavn.set(String(a.navn ?? '').trim().toLowerCase(), a)
  const cache = new Map()      // "ark|r|k" → værdi
  const igang = new Set()

  function celle(a, r, k) {
    const noegle = `${a.navn}|${r}|${k}`
    if (cache.has(noegle)) return cache.get(noegle)
    if (igang.has(noegle)) return F('#CYKLUS!')
    const raw = a.celler?.[r]?.[k]
    let v
    if (typeof raw === 'string' && raw.trim().startsWith('=') && raw.trim().length > 1) {
      igang.add(noegle)
      v = formel(a, raw.trim().slice(1))
      igang.delete(noegle)
    } else {
      v = konstant(raw)
    }
    if (Array.isArray(v)) v = F('#VÆRDI!')
    cache.set(noegle, v)
    return v
  }

  function formel(a, tekst) {
    const { udtryk, refs } = oversaet(tekst)
    const scope = {}
    for (const [i, ref] of refs.entries()) {
      const maal = ref.ark ? efterNavn.get(ref.ark.trim().toLowerCase()) : a
      if (!maal) { scope[`__R${i}x`] = F('#REF!'); continue }
      if (!ref.til) { scope[`__R${i}x`] = celle(maal, ref.fra.r, ref.fra.k); continue }
      const r0 = Math.min(ref.fra.r, ref.til.r), r1 = Math.max(ref.fra.r, ref.til.r)
      const k0 = Math.min(ref.fra.k, ref.til.k), k1 = Math.max(ref.fra.k, ref.til.k)
      const omr = []
      for (let r = r0; r <= r1; r++) { const raek = []; for (let k = k0; k <= k1; k++) raek.push(celle(maal, r, k)); omr.push(raek) }
      scope[`__R${i}x`] = omr
    }
    return regnUdtryk(udtryk, scope)
  }

  const ud = {}
  for (const a of ark) {
    ud[a.navn] = (a.celler ?? []).map((raek, r) => raek.map((_, k) => celle(a, r, k)))
  }
  return ud
}

// ── Visning ─────────────────────────────────────────────────────────────────

/**
 * En værdi som tekst. dec = antal decimaler; null = automatisk (op til 3, uden
 * efterstillede nuller). Decimaltegn er komma.
 */
export function formatVaerdi(v, dec = null) {
  if (v === '' || v === null || v === undefined) return ''
  if (erFejl(v)) return v.kode
  if (v === true) return 'SAND'
  if (v === false) return 'FALSK'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '#TAL!'
    let s
    if (dec === null || dec === undefined) {
      s = (Math.abs(v) >= 1e9 || (Math.abs(v) < 1e-4 && v !== 0)) ? v.toExponential(3) : String(Number(v.toFixed(3)))
    } else {
      s = v.toFixed(dec)
    }
    if (s === '-0' || /^-0[.,]0*$/.test(s)) s = s.slice(1)
    return s.replace('.', ',')
  }
  return String(v)
}

/** De viste tekster for et ark (til PDF og eksport). */
export function vistArk(vaerdier, dec = {}) {
  return vaerdier.map((raek, r) => raek.map((v, k) => formatVaerdi(v, dec[adresse(r, k)] ?? dec[kolNavn(k)] ?? null)))
}

// ── Kopiér og indsæt (Excel) ────────────────────────────────────────────────

/** Tabulatorsepareret tekst → 2D (som Excel lægger den på udklipsholderen). */
export function laesTsv(tekst) {
  const linjer = String(tekst).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  return linjer.map(l => l.split('\t'))
}

/** 2D → tabulatorsepareret tekst. */
export const skrivTsv = (rows) => rows.map(r => r.join('\t')).join('\n')

// ── Ændringer af gitteret ───────────────────────────────────────────────────

/** Gitteret med mindst `r` rækker og `k` kolonner. */
export function udvid(celler, r, k) {
  const ud = celler.map(raek => [...raek])
  const bredde = Math.max(k, ...ud.map(x => x.length))
  while (ud.length < r) ud.push([])
  return ud.map(raek => { while (raek.length < bredde) raek.push(''); return raek })
}

/**
 * Flyt henvisningerne i en formel, når rækker/kolonner indsættes eller
 * slettes i arket `ark` (kun henvisninger til det ark). akse 'r' eller 'k',
 * fra = første indeks, der flytter, n = antal (+ indsæt, − slet).
 */
export function flytHenvisninger(raw, egetArk, ark, akse, fra, n) {
  if (typeof raw !== 'string' || !raw.trim().startsWith('=')) return raw
  const tekst = raw.trim()
  const dele = tekst.split(/("(?:[^"]|"")*")/)
  return dele.map((del, i) => {
    if (i % 2 === 1) return del
    return del.replace(REF, (hel, arkDel, arkQ, arkU, a, b, pos, str) => {
      const foer = str[pos - 1]
      if (foer && /[\wÆØÅæøå]/.test(foer)) return hel
      const refArk = arkQ ? arkQ.replace(/''/g, "'") : arkU || egetArk
      if (String(refArk).toLowerCase() !== String(ark).toLowerCase()) return hel
      const flyt = (adr) => {
        const m = /^(\$?)([A-Za-z]{1,2})(\$?)(\d+)$/.exec(adr)
        let k = kolNr(m[2]), r = Number(m[4]) - 1
        if (akse === 'r' && r >= fra) { if (n < 0 && r < fra - n) return null; r += n }
        if (akse === 'k' && k >= fra) { if (n < 0 && k < fra - n) return null; k += n }
        return `${m[1]}${kolNavn(k)}${m[3]}${r + 1}`
      }
      const na = flyt(a), nb = b ? flyt(b) : undefined
      if (na === null || nb === null) return '#REF!'
      return `${arkDel ?? ''}${na}${b ? ':' + nb : ''}`
    })
  }).join('')
}

/**
 * En formel kopieret dr rækker ned og dk kolonner til højre: relative
 * henvisninger flytter med, $-låste gør ikke (som Excel ved kopiér/indsæt og
 * Ctrl+D). En henvisning, der ville ende uden for arket, bliver #REF!.
 */
export function forskydFormel(raw, dr, dk) {
  if (typeof raw !== 'string' || !raw.trim().startsWith('=') || (!dr && !dk)) return raw
  const dele = raw.split(/("(?:[^"]|"")*")/)
  return dele.map((del, i) => {
    if (i % 2 === 1) return del
    return del.replace(REF, (hel, arkDel, _q, _u, a, b, pos, str) => {
      const foer = str[pos - 1]
      if (foer && /[\wÆØÅæøå]/.test(foer)) return hel
      const flyt = (adr) => {
        const m = /^(\$?)([A-Za-z]{1,2})(\$?)(\d+)$/.exec(adr)
        let k = kolNr(m[2]), r = Number(m[4]) - 1
        if (!m[1]) k += dk
        if (!m[3]) r += dr
        if (k < 0 || r < 0) return null
        return `${m[1]}${kolNavn(k)}${m[3]}${r + 1}`
      }
      const na = flyt(a), nb = b ? flyt(b) : undefined
      if (na === null || nb === null) return '#REF!'
      return `${arkDel ?? ''}${na}${b ? ':' + nb : ''}`
    })
  }).join('')
}

/** Adresse-nøgler (fed, decimaler) flyttet ved indsæt/slet af rækker eller kolonner. */
export function flytNoegler(obj, akse, fra, n) {
  const ud = {}
  for (const [noegle, v] of Object.entries(obj ?? {})) {
    const a = laesAdresse(noegle)
    if (!a) { ud[noegle] = v; continue }
    let { r, k } = a
    if (akse === 'r' && r >= fra) { if (n < 0 && r < fra - n) continue; r += n }
    if (akse === 'k' && k >= fra) { if (n < 0 && k < fra - n) continue; k += n }
    ud[adresse(r, k)] = v
  }
  return ud
}

// ── Arbejdsbogen i et dokument ──────────────────────────────────────────────

export const erRegneark = (b) => b?.type === 'regneark'

/**
 * Regn alle regneark i et dokument og læg de viste tekster (_vist) ind i
 * hvert ark. ark: [{ id, data }]. Returnerer { bog, data: Map(id → data),
 * aendret: id[] } — aendret er de ark, hvis _vist er ny.
 */
export function synkBog(ark) {
  const bog = regnBog(ark.map(a => ({ navn: a.data.navn, celler: a.data.celler ?? [] })))
  const data = new Map()
  const aendret = []
  for (const a of ark) {
    const vist = vistArk(bog[a.data.navn] ?? [], a.data.dec)
    const gl = a.data._vist
    if (JSON.stringify(gl) !== JSON.stringify(vist)) aendret.push(a.id)
    data.set(a.id, { ...a.data, _vist: vist })
  }
  return { bog, data, aendret }
}

/** Et arknavn, der ikke er brugt: "Ark2", "Ark3" … */
export function ledigtNavn(brugte, onsket = 'Ark') {
  const sm = new Set(brugte.map(n => String(n).trim().toLowerCase()))
  if (!sm.has(onsket.trim().toLowerCase())) return onsket
  const stamme = onsket.replace(/\s*\d+$/, '')
  for (let i = 2; ; i++) { const n = `${stamme}${i}`; if (!sm.has(n.toLowerCase())) return n }
}

/** Arknavnet, som det skrives foran en henvisning: Laster! eller 'Stabilitet V1'!. */
export function arkPrefiks(navn) {
  const n = String(navn)
  return /^[A-Za-zÆØÅæøå_][\wÆØÅæøå.]*$/.test(n) ? `${n}!` : `'${n.replace(/'/g, "''")}'!`
}

/**
 * Formlen med henvisninger til arket `gammel` skrevet om til `ny` (når et
 * ark omdøbes). Henvisninger uden arknavn peger på eget ark og røres ikke.
 */
export function omdoebHenvisninger(raw, gammel, ny) {
  if (typeof raw !== 'string' || !raw.trim().startsWith('=')) return raw
  const dele = raw.split(/("(?:[^"]|"")*")/)
  return dele.map((del, i) => {
    if (i % 2 === 1) return del
    return del.replace(REF, (hel, arkDel, arkQ, arkU, a, b, pos, str) => {
      const foer = str[pos - 1]
      if (foer && /[\wÆØÅæøå]/.test(foer)) return hel
      if (!arkDel) return hel
      const refArk = arkQ ? arkQ.replace(/''/g, "'") : arkU
      if (String(refArk).trim().toLowerCase() !== String(gammel).trim().toLowerCase()) return hel
      return `${arkPrefiks(ny)}${a}${b ? ':' + b : ''}`
    })
  }).join('')
}

/** Navnene på de andre ark, formlen henviser til (små bogstaver). */
export function arkIFormel(raw) {
  if (typeof raw !== 'string' || !raw.trim().startsWith('=')) return []
  return [...new Set(oversaet(raw.trim().slice(1)).refs.filter(r => r.ark).map(r => r.ark.trim().toLowerCase()))]
}
