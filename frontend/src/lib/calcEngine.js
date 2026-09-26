/**
 * calcEngine.js — "Egen beregning": linje for linje, med enheder.
 *
 * Hver linje er én af:
 *
 *   # Overskrift                         et nyt afsnit
 *   L = 2,4 m | spændvidde               et input (tal med enhed)
 *   M_Ed = q_d·L²/8 → kNm | EN …         en formel, vist i kNm
 *   σ_m_d ≤ f_m_d | Bøjning (6.11)       en eftervisning; η regnes selv
 *   alt andet                            brødtekst
 *
 * Alt efter | er beskrivelse eller henvisning. Danske decimalkommaer, ·, ²,
 * √ og ≤ virker; argumenter adskilles med semikolon: max(a; b).
 *
 * Regningen sker her i browseren med mathjs, som har enheder og en parser,
 * der kun kan regne -- ingen eval. Resultatet bliver til de samme
 * rapportrækker, som resten af beregningerne bruger (section, text,
 * calc_row, check, note), så PDF og Word tegner dem ens.
 */
import { create, all } from 'mathjs'

const math = create(all)

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', eta: 'η', theta: 'θ',
  kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ',
  phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω',
}

export const SYMBOLS = ['·', '²', '³', '√', '≤', '→', '|', 'γ', 'σ', 'τ', 'λ', 'η', 'ψ', 'χ', 'ρ', 'α']

// ── Parsing ────────────────────────────────────────────────────────────────

export function pre(expr) {
  return String(expr)
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/;/g, ',')
    .replace(/[·×]/g, '*').replace(/−/g, '-')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4')
    .replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([A-Za-zͰ-Ͽ_][\wͰ-Ͽ]*|\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/\bkNm\b/g, '(kN m)').replace(/\bNmm\b/g, '(N mm)')
}

const NAME = '[A-Za-z\\u0370-\\u03ff][\\w\\u0370-\\u03ff]*'

export function classify(raw) {
  const t = String(raw ?? '').trim()
  if (!t) return { kind: 'blank' }
  if (t.startsWith('#')) return { kind: 'heading', text: t.replace(/^#+\s*/, '') }
  let body = t, desc = ''
  const bar = t.indexOf('|')
  if (bar >= 0) { body = t.slice(0, bar).trim(); desc = t.slice(bar + 1).trim() }
  const asg = body.match(new RegExp(`^(${NAME})\\s*=(?!=)\\s*(.+)$`))
  if (asg) {
    let expr = asg[2], out = null
    const arrow = expr.split(/→|->/)
    if (arrow.length > 1) { expr = arrow[0].trim(); out = arrow.slice(1).join('').trim() }
    return { kind: 'assign', name: asg[1], expr, out, desc }
  }
  const cmp = body.match(/^(.+?)(≤|<=|≥|>=)(.+)$/)
  if (cmp && /[A-Za-zͰ-Ͽ\d]/.test(cmp[1])) {
    return { kind: 'check', lhs: cmp[1].trim(), op: cmp[2], rhs: cmp[3].trim(), desc }
  }
  return { kind: 'text', text: t }
}

// ── Quantities ─────────────────────────────────────────────────────────────

const isUnit = (v) => v && typeof v === 'object' && v.type === 'Unit'
function plain(v) {
  if (isUnit(v) && v.dimensions.every(d => Math.abs(d) < 1e-12)) return v.value
  return v
}

const PREFERRED = [
  ['kN', 'kN'], ['kN / m', 'kN/m'], ['kN m', 'kNm'], ['kN / m^3', 'kN/m³'],
  ['mm^2', 'mm²'], ['mm^3', 'mm³'], ['mm^4', 'mm⁴'], ['kg', 'kg'],
]

export function unitLabel(s) {
  return String(s).replace(/\s*\/\s*/g, '/').replace(/\^2/g, '²').replace(/\^3/g, '³')
    .replace(/\^4/g, '⁴').replace(/kN m\b/g, 'kNm').replace(/[()]/g, '').replace(/\s+/g, '·')
}

function pick(u) {
  if (u.equalBase(math.unit('MPa'))) {
    return Math.abs(u.toNumber('MPa')) >= 0.05 ? ['MPa', 'MPa'] : ['kN / m^2', 'kN/m²']
  }
  if (u.equalBase(math.unit('m'))) return Math.abs(u.toNumber('m')) < 1 ? ['mm', 'mm'] : ['m', 'm']
  for (const [c, l] of PREFERRED) if (u.equalBase(math.unit(c))) return [c, l]
  return null
}

export function fmtNum(x) {
  if (typeof x !== 'number' || !isFinite(x)) return '—'
  if (x === 0) return '0'
  const a = Math.abs(x)
  if (a >= 1e7 || a < 1e-3) {
    const [m, e] = x.toExponential(2).split('e')
    const sup = String(Number(e)).replace(/-/g, '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])
    return m.replace('.', ',').replace('-', '−') + '·10' + sup
  }
  const dec = Math.max(0, 3 - Math.floor(Math.log10(a)))
  let s = x.toFixed(dec)
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  let [i, f] = s.split('.')
  const neg = i.startsWith('-'); if (neg) i = i.slice(1)
  if (i.length > 4) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (neg ? '−' : '') + i + (f ? ',' + f : '')
}

/** [number text, unit text] for a value, in `out` if given. */
export function fmtQty(v, out, keepOwn) {
  v = plain(v)
  if (typeof v === 'number') return [fmtNum(v), '']
  if (typeof v === 'boolean') return [v ? 'sand' : 'falsk', '']
  if (!isUnit(v)) return [String(v), '']
  if (out) return [fmtNum(v.toNumber(pre(out))), unitLabel(out.replace(/\bkNm\b/, 'kN m'))]
  if (keepOwn) {
    const own = v.formatUnits()
    if (own) return [fmtNum(v.toNumber(own)), unitLabel(own)]
  }
  const p = pick(v)
  if (p) return [fmtNum(v.toNumber(p[0])), p[1]]
  const own = v.formatUnits()
  return [fmtNum(v.toNumber(own)), unitLabel(own)]
}

const qtyText = (v, keepOwn = true) => {
  const [n, u] = fmtQty(v, null, keepOwn)
  return u ? `${n} ${u}` : n
}

// ── Names and formulas as report text ──────────────────────────────────────
//
// The report rows are plain text that the PDF/Word renderer typesets: an
// underscore starts a subscript and ^ a superscript. f_m_k is written f_m,k,
// gamma_M is γ_M.

export function displayName(n) {
  const parts = String(n).split('_')
  const g = (p) => GREEK[p] ?? p
  const base = g(parts[0])
  const sub = parts.slice(1).map(g).join(',')
  return sub ? `${base}_${sub}` : base
}

const unwrap = (n) => (n.type === 'ParenthesisNode' ? n.content : n)
const SUP = { 2: '²', 3: '³', 4: '⁴' }

function linear(node, scope, subst) {
  switch (node.type) {
    case 'ConstantNode': return fmtNum(node.value)
    case 'SymbolNode': {
      if (Object.prototype.hasOwnProperty.call(scope, node.name)) {
        if (!subst) return displayName(node.name)
        const v = plain(scope[node.name])
        const txt = qtyText(v)
        const neg = (typeof v === 'number' ? v : (isUnit(v) ? v.value : 0)) < 0
        return isUnit(v) || neg ? `(${txt})` : txt
      }
      if (GREEK[node.name]) return GREEK[node.name]
      if (node.name === 'pi') return 'π'
      return unitLabel(node.name)
    }
    case 'ParenthesisNode': return `(${linear(node.content, scope, subst)})`
    case 'OperatorNode': {
      const a = node.args
      if (node.fn === 'unaryMinus') return `−${linear(a[0], scope, subst)}`
      if (node.fn === 'unaryPlus') return linear(a[0], scope, subst)
      if (node.op === '^') {
        const e = unwrap(a[1])
        const base = linear(a[0], scope, subst)
        if (e.type === 'ConstantNode' && SUP[e.value]) return base + SUP[e.value]
        return `${base}^(${linear(e, scope, false)})`
      }
      if (node.op === '*') {
        if (node.implicit && a[1].type === 'SymbolNode' && !(a[1].name in scope)) {
          return `${linear(a[0], scope, subst)} ${linear(a[1], scope, subst)}`
        }
        return `${linear(a[0], scope, subst)}·${linear(a[1], scope, subst)}`
      }
      // " / " med mellemrum tegnes som en brøk på skærmen. Med tal og
      // enheder indsat ville brøkstregen skære midt gennem "(4 m)", så dér
      // står skråstregen uden mellemrum.
      if (node.op === '/') {
        const sp = subst ? '' : ' '
        return `${linear(a[0], scope, subst)}${sp}/${sp}${linear(a[1], scope, subst)}`
      }
      const sym = { '+': '+', '-': '−', '<=': '≤', '>=': '≥', '<': '<', '>': '>', '==': '=', 'and': 'og', 'or': 'eller' }[node.op] ?? node.op
      return `${linear(a[0], scope, subst)} ${sym} ${linear(a[1], scope, subst)}`
    }
    case 'ConditionalNode':
      return `${linear(node.trueExpr, scope, subst)} hvis ${linear(node.condition, scope, false)}, ellers ${linear(node.falseExpr, scope, subst)}`
    case 'FunctionNode': {
      const nm = node.fn.name ?? String(node.fn)
      if (nm === 'sqrt') return `√(${linear(unwrap(node.args[0]), scope, subst)})`
      return `${nm}(${node.args.map(x => linear(x, scope, subst)).join('; ')})`
    }
    default: return node.toString()
  }
}

function usesVariables(n, scope) {
  let hit = false
  n.traverse(x => { if (x.type === 'SymbolNode' && Object.prototype.hasOwnProperty.call(scope, x.name)) hit = true })
  return hit
}

function danish(msg) {
  let m
  if ((m = String(msg).match(/Undefined symbol (\S+)/))) return `${m[1]} er ikke defineret endnu.`
  if (/Units do not match/.test(msg)) return 'Enhederne passer ikke sammen, fx kN lagt til m.'
  if (/Unit .*not found/.test(msg)) return 'Kender ikke enheden.'
  if (/Cannot convert|do not match/.test(msg)) return 'Kan ikke vises i den enhed; den er en anden slags størrelse.'
  if (/Unexpected|Parenthesis|Value expected|Syntax/.test(msg)) return 'Kan ikke læse udtrykket.'
  return String(msg)
}

// ── Evaluate ───────────────────────────────────────────────────────────────

/**
 * Every line → a row: { kind, raw, …, value?, error?, ok?, util? } plus the
 * report text for it. Lines are regnet i rækkefølge; en linje kan kun bruge
 * navne, der er defineret over den.
 */
export function evaluate(lines) {
  const scope = {}
  return (lines ?? []).map((raw) => {
    const c = classify(raw)
    if (c.kind === 'assign') {
      if (/^(…|\.\.\.)?(\s|$)/.test(c.expr.trim())) {
        return { ...c, raw, error: `${displayName(c.name)} mangler en værdi.`, missing: true }
      }
      try {
        const node = math.parse(pre(c.expr))
        let v = node.evaluate(scope)
        if (c.out) {
          if (!isUnit(v)) throw new Error(`Resultatet har ingen enhed at vise i ${c.out}.`)
          const target = math.unit(pre(c.out))
          if (!v.equalBase(target)) throw new Error('Cannot convert')
          v = v.to(pre(c.out))
        }
        // Et input er en linje uden navne fra linjerne over: et tal med
        // enhed, også når enheden er sammensat (1,6 kN/m er (1,6 kN)/m).
        // Regnes der med flere tal (45 mm·(195 mm)²/6), er det en formel.
        let tal = 0
        node.traverse(x => { if (x.type === 'ConstantNode') tal++ })
        const input = !usesVariables(node, scope) && tal <= 1
        const formula = input ? null : linear(node, scope, false)
        const subst = input ? null : linear(node, scope, true)
        scope[c.name] = v
        return { ...c, raw, value: v, input, formula, subst }
      } catch (e) { return { ...c, raw, error: danish(e.message) } }
    }
    if (c.kind === 'check') {
      try {
        const L = math.parse(pre(c.lhs)), R = math.parse(pre(c.rhs))
        const lv = plain(L.evaluate(scope)), rv = plain(R.evaluate(scope))
        if (isUnit(lv) !== isUnit(rv) || (isUnit(lv) && !lv.equalBase(rv))) throw new Error('Units do not match')
        const eta = plain(math.divide(lv, rv))
        if (typeof eta !== 'number' || !isFinite(eta)) throw new Error('Kan ikke danne forholdet.')
        const le = c.op === '≤' || c.op === '<='
        const util = le ? eta : 1 / eta
        // Venstre side vises i højre sides enhed: M_Ed/W er et tryk, og det
        // skal stå i MPa som f_m,d -- ikke i kNm/mm³.
        let lvText, rvText
        if (isUnit(lv) && isUnit(rv)) {
          const [rn, ru] = fmtQty(rv, null, false)
          const unitStr = rv.formatUnits() || null
          rvText = ru ? `${rn} ${ru}` : rn
          const p = pick(rv)
          const [ln, lu] = p ? [fmtNum(lv.toNumber(p[0])), p[1]]
                             : unitStr ? [fmtNum(lv.toNumber(unitStr)), unitLabel(unitStr)] : fmtQty(lv)
          lvText = lu ? `${ln} ${lu}` : ln
          if (p) rvText = `${fmtNum(rv.toNumber(p[0]))} ${p[1]}`
        } else {
          lvText = qtyText(lv); rvText = qtyText(rv)
        }
        return { ...c, raw, ok: util <= 1 && util >= 0, util,
          lText: linear(L, scope, false), rText: linear(R, scope, false),
          lv: lvText, rv: rvText }
      } catch (e) { return { ...c, raw, error: danish(e.message) } }
    }
    return { ...c, raw }
  })
}

/** Short result text for the editor, next to a line. */
export function chip(r) {
  if (r.error) return ['err', r.error]
  if (r.kind === 'assign') {
    const [n, u] = fmtQty(r.value, r.out, r.input)
    return ['', `= ${n}${u ? ' ' + u : ''}`]
  }
  if (r.kind === 'check') return [r.ok ? 'ok' : 'fail', `η ${r.util.toFixed(2).replace('.', ',')} ${r.ok ? 'OK' : 'IKKE OK'}`]
  if (r.kind === 'heading') return ['muted', 'afsnit']
  if (r.kind === 'text') return ['muted', 'tekst']
  return ['muted', '']
}

/**
 * The rows as report blocks — the same types every other calculation
 * produces, so the PDF and Word output share one layout.
 */
export function toReportBlocks(title, rows, { subst = true } = {}) {
  const out = []
  if (title) out.push({ type: 'section', content: title })
  rows.forEach((r, i) => {
    if (r.kind === 'blank') return
    if (r.kind === 'heading') { out.push({ type: 'section', content: r.text }); return }
    if (r.kind === 'text') { out.push({ type: 'text', content: r.text }); return }
    if (r.error) {
      out.push({ type: 'note', content: `Linje ${i + 1} kan ikke regnes: ${r.error} (${r.raw.trim()})` })
      return
    }
    if (r.kind === 'assign') {
      const [n, u] = fmtQty(r.value, r.out, r.input)
      const result = u ? `${n} ${u}` : n
      let formula
      if (r.input) formula = r.desc || ''
      else formula = subst && r.subst !== r.formula ? `${r.formula} = ${r.subst}` : r.formula
      out.push({ type: 'calc_row', name: displayName(r.name), formula, result,
                 label: !r.input && r.desc ? r.desc : '' })
      return
    }
    if (r.kind === 'check') {
      const u = r.util.toFixed(3)
      const detail = subst ? `η = ${r.lText} / ${r.rText} = ${r.lv} / ${r.rv}` : `η = ${r.lText} / ${r.rText}`
      out.push({ type: 'check', label: `${r.desc || 'Eftervisning'}: ${detail}`,
                 passes: r.ok, ratio: Number(u),
                 value: r.ok ? `${u} < 1.0   OK` : `${u} > 1.0   FAIL` })
    }
  })
  return out
}

// ── Old format → lines ─────────────────────────────────────────────────────
//
// Egen beregning var en liste af rækker med felter (var/formula/check/...).
// De bliver til linjer én gang, første gang blokken åbnes.

const OLD_UNIT = (u) => (!u || u === '-' ? '' : String(u)
  .replace(/\*\*2/g, '²').replace(/\*\*3/g, '³').replace(/\*\*4/g, '⁴')
  .replace(/kN\*m/g, 'kNm').replace(/N\*m/g, 'Nm').replace(/\*/g, '·'))

const OLD_EXPR = (e) => String(e ?? '').trim()
  .replace(/\*\*/g, '^').replace(/,\s*/g, '; ').replace(/\*/g, '·')

export function itemsToLines(items) {
  const out = []
  for (const it of items ?? []) {
    const d = it.description ? ` | ${it.description}` : ''
    switch (it.type) {
      case 'heading': out.push(`# ${it.content ?? ''}`); break
      case 'text': out.push(String(it.content ?? '').replace(/\n+/g, ' ')); break
      case 'var': {
        const v = it.value == null || it.value === '' ? '…' : String(it.value).replace('.', ',')
        const u = OLD_UNIT(it.unit)
        out.push(`${it.name} = ${v}${u ? ' ' + u : ''}${d}`)
        break
      }
      case 'formula': {
        const u = OLD_UNIT(it.unit)
        out.push(`${OLD_EXPR(it.expr)}${u ? ' → ' + u : ''}`)
        break
      }
      case 'check': {
        const cap = String(it.capacity ?? '').trim()
        const isNum = cap !== '' && !isNaN(Number(cap))
        const u = OLD_UNIT(it.unit)
        const rhs = isNum ? `${cap.replace('.', ',')}${u ? ' ' + u : ''}` : OLD_EXPR(cap)
        out.push(`${OLD_EXPR(it.demand)} ≤ ${rhs} | ${it.label ?? 'Eftervisning'}`)
        break
      }
      case 'conditional': {
        const u = OLD_UNIT(it.unit)
        out.push(`${it.name} = (${OLD_EXPR(it.condition)}) ? (${OLD_EXPR(it.true_expr)}) : (${OLD_EXPR(it.false_expr)})${u ? ' → ' + u : ''}`)
        break
      }
      default: break
    }
  }
  return out
}
