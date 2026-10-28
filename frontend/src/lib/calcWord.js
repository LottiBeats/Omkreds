/**
 * calcWord.js — "Egen beregning" som Word-indhold (Word-tilføjelsesprogrammet).
 *
 * Linjerne regnes af calcEngine.evaluate, præcis som i Omkreds. Her bliver
 * rækkerne til Word: afsnit og tekst som almindelige afsnit, og formler og
 * eftervisninger som en tabel med tre kolonner
 *
 *   beskrivelse  |  M_Ed = q_d·L²/8 = (2,85 kN/m)·(4,5 m)²/8 =  |  7,21 kNm
 *
 * hvor formlen er en rigtig Word-ligning (OMML): sænket skrift, brøker,
 * rødder og potenser, variable i kursiv og tal og enheder opret. Tallene, der
 * sættes ind, er de samme tekster, som linjerne selv viser.
 *
 *   wordDele(titel, linjer, { subst })  → [{ type: 'heading'|'text'|'note'|'tabel', … }]
 *   ooxmlPakke(bodyXml)                 → en pakke til Word.Range.insertOoxml
 */
import {
  evaluate, parseExpr, displayName, fmtNum, fmtQty, medEnhed, unitLabel,
  isUnit, plain, isUnitTerm, usesVariables, GREEK,
} from './calcEngine.js'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

export const FARVE = { ok: '15803D', fejl: 'B91C1C', beskrivelse: '595959', linje: 'D9DEE5', note: 'B45309' }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── OMML ───────────────────────────────────────────────────────────────────

/**
 * Et stykke ligning. art: ingen = Words matematik (bogstaver kursiv, symboler
 * med matematisk luft), 'tekst' = almindelig opret tekst i ligningen (tal,
 * enheder, indekser -- så "4,5" ikke får luft efter kommaet), 'fed' = det samme
 * med fed skrift.
 */
function R(t, art, farve) {
  const tekst = art === 'tekst' || art === 'fed'
  const mpr = tekst ? '<m:rPr><m:nor/></m:rPr>' : ''
  const wpr = `<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>${art === 'fed' ? '<w:b/>' : ''}` +
    `${farve ? `<w:color w:val="${farve}"/>` : ''}</w:rPr>`
  return `<m:r>${mpr}${wpr}<m:t xml:space="preserve">${esc(t)}</m:t></m:r>`
}
const op = (t) => R(t)
const sSub = (e, s) => `<m:sSub><m:e>${e}</m:e><m:sub>${s}</m:sub></m:sSub>`
const sSup = (e, s) => `<m:sSup><m:e>${e}</m:e><m:sup>${s}</m:sup></m:sSup>`
const brok = (a, b) => `<m:f><m:num>${a}</m:num><m:den>${b}</m:den></m:f>`
const parentes = (x) => `<m:d><m:e>${x}</m:e></m:d>`
const rod = (x) => `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${x}</m:e></m:rad>`
const funktion = (n, x) => `<m:func><m:fName>${R(n, 'tekst')}</m:fName><m:e>${parentes(x)}</m:e></m:func>`
export const oMath = (x) => `<m:oMath>${x}</m:oMath>`

/** σ_m_d → σ med "m,d" sænket og opret (Eurocodes skriver indekser opret). */
export function navnOmml(n) {
  const vist = displayName(n)
  const i = vist.indexOf('_')
  if (i < 0) return R(vist)
  return sSub(R(vist.slice(0, i)), R(vist.slice(i + 1), 'tekst'))
}

/** "7,214 kNm", "2,78·10⁷ mm⁴", "30°": tal og enhed opret, med et hårdt mellemrum imellem. */
export function maengdeOmml(tekst, art = 'tekst', farve) {
  const t = String(tekst)
  const i = t.search(/ (?=[^\d\s−-])/)
  if (i < 0) return R(t, art, farve)
  return R(t.slice(0, i), art, farve) + R(' ' + t.slice(i + 1), art, farve)
}

const unwrap = (n) => (n.type === 'ParenthesisNode' ? n.content : n)
const SUP = { 2: '²', 3: '³', 4: '⁴' }

// Et indsat tal med enhed, eller et negativt tal, står i parentes, når det
// ganges eller opløftes: (2,85 kN/m)·(4,5 m)². I en brøk og alene gør det ikke.
function indsatMedEnhed(node, ctx) {
  if (!ctx.subst || node.type !== 'SymbolNode' || !Object.prototype.hasOwnProperty.call(ctx.scope, node.name)) return false
  const v = plain(ctx.scope[node.name])
  return isUnit(v) || (typeof v === 'number' && v < 0)
}

function faktor(node, ctx) {
  const x = omml(node, ctx)
  if (indsatMedEnhed(node, ctx)) return parentes(x)
  if (node.type === 'OperatorNode' && (node.op === '+' || node.op === '-') && node.args.length === 2) return parentes(x)
  return x
}

/** Et mathjs-træ som ligning. ctx: { scope, vist, subst }. */
export function omml(node, ctx) {
  switch (node.type) {
    case 'ConstantNode':
      return typeof node.value === 'number' ? R(fmtNum(node.value), 'tekst') : R(String(node.value), 'tekst')
    case 'SymbolNode': {
      if (Object.prototype.hasOwnProperty.call(ctx.scope, node.name)) {
        if (!ctx.subst) return navnOmml(node.name)
        return maengdeOmml(ctx.vist[node.name] ?? fmtNum(plain(ctx.scope[node.name])))
      }
      if (GREEK[node.name]) return R(GREEK[node.name])
      if (node.name === 'pi') return R('π')
      return R(unitLabel(node.name), 'tekst')
    }
    case 'ParenthesisNode': return parentes(omml(node.content, ctx))
    case 'OperatorNode': {
      const a = node.args
      if (node.fn === 'unaryMinus') return op('−') + faktor(a[0], ctx)
      if (node.fn === 'unaryPlus') return omml(a[0], ctx)
      if (node.op === '^') {
        const e = unwrap(a[1])
        const grund = faktor(a[0], ctx)
        if (isUnitTerm(a[0]) && !usesVariables(a[0], ctx.scope) && e.type === 'ConstantNode' && SUP[e.value]) return R(unitLabel(a[0].toString()) + SUP[e.value], 'tekst')
        return sSup(grund, omml(e, { ...ctx, subst: false }))
      }
      if (node.op === '*') {
        // 3 m, 10 kN: et tal med sin enhed, ikke et produkt.
        if (node.implicit && isUnitTerm(a[1]) && !usesVariables(a[1], ctx.scope)) {
          const enhed = unitLabel(a[1].toString())
          return omml(a[0], ctx) + R(enhed === '°' ? '°' : ' ' + enhed, 'tekst')
        }
        return faktor(a[0], ctx) + op('·') + faktor(a[1], ctx)
      }
      if (node.op === '/') {
        // 5 kN/m: enheden står på linjen, ikke som brøk.
        if (isUnitTerm(a[1]) && !usesVariables(a[1], ctx.scope) && !(isUnitTerm(a[0]) && !usesVariables(a[0], ctx.scope))) {
          return omml(a[0], ctx) + R('/' + unitLabel(a[1].toString()), 'tekst')
        }
        if (isUnitTerm(node) && !usesVariables(node, ctx.scope)) return R(unitLabel(node.toString()), 'tekst')
        return brok(omml(unwrap(a[0]), ctx), omml(unwrap(a[1]), ctx))
      }
      const sym = { '+': '+', '-': '−', '<=': '≤', '>=': '≥', '<': '<', '>': '>', '==': '=', and: ' og ', or: ' eller ' }[node.op] ?? node.op
      return omml(a[0], ctx) + op(sym) + omml(a[1], ctx)
    }
    case 'ConditionalNode':
      return omml(node.trueExpr, ctx) + R(' hvis ', 'tekst') + omml(node.condition, { ...ctx, subst: false }) +
        R(', ellers ', 'tekst') + omml(node.falseExpr, ctx)
    case 'FunctionNode': {
      const nm = node.fn.name ?? String(node.fn)
      const args = node.args.map(x => omml(unwrap(x), ctx)).join(op('; '))
      if (nm === 'sqrt') return rod(args)
      if (nm === 'abs') return `<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr><m:e>${args}</m:e></m:d>`
      return funktion(nm, args)
    }
    default: return R(node.toString(), 'tekst')
  }
}

// ── Rækker ─────────────────────────────────────────────────────────────────

/**
 * Linjerne som rækker til Word: { kind, a (beskrivelse), b (ligning), c (resultat) }
 * for formler og eftervisninger; afsnit, tekst og fejl som de er.
 */
export function wordRaekker(lines, { subst = true } = {}) {
  const rows = evaluate(lines)
  const scope = {}, vist = {}
  return rows.map((r, i) => {
    if (r.kind === 'blank') return { kind: 'blank' }
    if (r.kind === 'heading') return { kind: 'heading', text: r.text }
    if (r.kind === 'text') return { kind: 'text', text: r.text }
    if (r.error) return { kind: 'note', text: `Linje ${i + 1} kan ikke regnes: ${r.error} (${String(r.raw).trim()})` }
    if (r.kind === 'assign') {
      const resultat = medEnhed(...fmtQty(r.value, r.out, r.input))
      let b = navnOmml(r.name) + op('=')
      if (!r.input) {
        const node = parseExpr(r.expr)
        b += omml(node, { scope, vist, subst: false }) + op('=')
        const indsat = omml(node, { scope, vist, subst: true })
        const formel = omml(node, { scope, vist, subst: false })
        if (subst && indsat !== formel) b += indsat + op('=')
      }
      scope[r.name] = r.value
      vist[r.name] = resultat
      return { kind: 'calc', a: r.desc || '', b, c: maengdeOmml(resultat, 'fed') }
    }
    if (r.kind === 'check') {
      // η = virkning/bæreevne; ved ≥ er det højre side, der er virkningen.
      const le = r.op === '≤' || r.op === '<='
      const L = omml(parseExpr(r.lhs), { scope, vist, subst: false })
      const Rr = omml(parseExpr(r.rhs), { scope, vist, subst: false })
      const lv = maengdeOmml(r.lv), rv = maengdeOmml(r.rv)
      let b = R('η') + op('=') + (le ? brok(L, Rr) : brok(Rr, L)) + op('=')
      if (subst) b += (le ? brok(lv, rv) : brok(rv, lv)) + op('=')
      const eta = r.util.toFixed(2).replace('.', ',')
      const farve = r.ok ? FARVE.ok : FARVE.fejl
      const c = R(eta + (r.ok ? '  OK' : '  IKKE OK'), 'fed', farve)
      return { kind: 'check', a: r.desc || 'Eftervisning', b, c, ok: r.ok }
    }
    return { kind: 'blank' }
  })
}

// ── Word-indhold ───────────────────────────────────────────────────────────

// Kolonnebredder i halvtredsindstyvedele procent af sidebredden (5000 = 100 %):
// beskrivelse 22 % | ligning 58 % | resultat 20 %. Tabellen følger siden.
const KOL = [1100, 2900, 1000]

function celle(bredde, indhold, jc = 'left') {
  return `<w:tc><w:tcPr><w:tcW w:w="${bredde}" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>${indhold}</w:p></w:tc>`
}

const tekstLoeb = (t, { farve, kursiv, fed, str } = {}) =>
  `<w:r><w:rPr>${fed ? '<w:b/>' : ''}${kursiv ? '<w:i/>' : ''}${farve ? `<w:color w:val="${farve}"/>` : ''}${str ? `<w:sz w:val="${str}"/><w:szCs w:val="${str}"/>` : ''}</w:rPr>` +
  `<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`

/** Formler og eftervisninger i træk som én tabel uden lodrette streger. */
export function tabelXml(rows) {
  // Rækkefølgen af elementerne er skemaets (Word afviser andet): tblW,
  // tblBorders, tblLayout, tblCellMar, tblLook -- og kanterne top, left,
  // bottom, right, insideH, insideV.
  const ingen = (s) => `<w:${s} w:val="nil"/>`
  const tynd = (s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${FARVE.linje}"/>`
  const tr = rows.map(r => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
    celle(KOL[0], r.a ? tekstLoeb(r.a, { farve: FARVE.beskrivelse, str: 18 }) : '') +
    celle(KOL[1], oMath(r.b)) +
    celle(KOL[2], oMath(r.c), 'right') + '</w:tr>').join('')
  return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    `<w:tblBorders>${ingen('top')}${ingen('left')}${tynd('bottom')}${ingen('right')}${tynd('insideH')}${ingen('insideV')}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid>${KOL.map(w => `<w:gridCol w:w="${Math.round(w / 5000 * 9638)}"/>`).join('')}</w:tblGrid>${tr}</w:tbl>`
}

/** Et almindeligt afsnit (tekst eller note) som WordprocessingML. */
export function afsnitXml(tekst, { note = false } = {}) {
  return `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>${tekstLoeb(tekst, note ? { farve: FARVE.note, kursiv: true } : {})}</w:p>`
}

/**
 * Beregningen i rækkefølge som dele: overskrifter for sig (de får Words egne
 * overskriftstypografier, så de kommer med i indholdsfortegnelsen), og
 * resten som WordprocessingML.
 */
export function wordDele(titel, lines, { subst = true } = {}) {
  const dele = []
  if (titel) dele.push({ type: 'heading', level: 2, text: titel })
  let buf = []
  const toem = () => { if (buf.length) { dele.push({ type: 'tabel', xml: tabelXml(buf) }); buf = [] } }
  for (const r of wordRaekker(lines, { subst })) {
    if (r.kind === 'calc' || r.kind === 'check') { buf.push(r); continue }
    if (r.kind === 'blank') continue
    toem()
    if (r.kind === 'heading') dele.push({ type: 'heading', level: 3, text: r.text })
    else if (r.kind === 'text') dele.push({ type: 'text', xml: afsnitXml(r.text) })
    else if (r.kind === 'note') dele.push({ type: 'note', xml: afsnitXml(r.text, { note: true }) })
  }
  toem()
  return dele
}

/** Et stykke body-XML som pakke til Word.Range.insertOoxml. */
export function ooxmlPakke(bodyXml) {
  return '<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">' +
    '<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships></pkg:xmlData></pkg:part>' +
    '<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData>' +
    `<w:document xmlns:w="${W_NS}" xmlns:m="${M_NS}"><w:body>${bodyXml}</w:body></w:document>` +
    '</pkg:xmlData></pkg:part></pkg:package>'
}
