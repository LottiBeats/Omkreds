/**
 * CalcResultView.jsx — renders a list of calc blocks from the backend
 *
 * Every Eurocode calc module (steel, concrete, timber, masonry) returns
 * a list of blocks. Each block is a plain dict with a "type" field.
 * This component knows how to render each type.
 *
 * Block types:
 *   module_header  — coloured banner with module name + material
 *   section        — bold heading within the calculation
 *   text           — normal paragraph
 *   note           — amber warning / information callout
 *   table          — data table (headers + rows)
 *   handcalc       — LaTeX equation rendered with KaTeX
 *   check          — pass/fail check result with utilisation ratio
 *   calc_row       — pre-formatted single calculation row (fallback)
 *
 * Usage:
 *   <CalcResultView blocks={result.blocks} />
 *
 * where result.blocks is the JSON array returned by e.g. POST /calc/steel-beam.
 */
import React, { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// Material → accent colour mapping (matches the PDF module headers)
const MATERIAL_COLOURS = {
  steel:    { bg: '#1a3a5c', text: '#fff', accent: '#4a90d9' },
  concrete: { bg: '#4a4a4a', text: '#fff', accent: '#b0b0b0' },
  timber:   { bg: '#5c3a1a', text: '#fff', accent: '#c8843a' },
  masonry:  { bg: '#5c4a1a', text: '#fff', accent: '#c8a83a' },
  general:  { bg: '#111',    text: '#fff', accent: '#888' },
}

export default function CalcResultView({ blocks }) {
  if (!blocks || blocks.length === 0) return null

  return (
    <div style={styles.wrapper}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  )
}

// Dispatch to the right renderer based on block.type
function Block({ block }) {
  switch (block.type) {
    case 'module_header': return <ModuleHeader block={block} />
    case 'section':       return <Section block={block} />
    case 'text':          return <TextBlock block={block} />
    case 'note':          return <Note block={block} />
    case 'table':         return <DataTable block={block} />
    case 'handcalc':      return <Handcalc block={block} />
    case 'check':         return <Check block={block} />
    case 'calc_row':      return <CalcRow block={block} />
    default:
      return (
        <div style={styles.unknown}>
          Unknown block type: <code>{block.type}</code>
        </div>
      )
  }
}

// ── Module header ─────────────────────────────────────────────────────────────
function ModuleHeader({ block }) {
  const c = MATERIAL_COLOURS[block.material] ?? MATERIAL_COLOURS.general
  return (
    <div style={{ ...styles.moduleHeader, background: c.bg }}>
      <div style={{ ...styles.moduleTitle, color: c.text }}>{block.title}</div>
      {block.subtitle && (
        <div style={{ ...styles.moduleSubtitle, color: c.accent }}>{block.subtitle}</div>
      )}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
function Section({ block }) {
  return (
    <div style={styles.section}>
      <span style={styles.sectionMark} />
      {block.content}
    </div>
  )
}

// ── Text paragraph ────────────────────────────────────────────────────────────
function TextBlock({ block }) {
  return <p style={styles.text}>{block.content}</p>
}

// ── Amber note / warning ──────────────────────────────────────────────────────
function Note({ block }) {
  return (
    <div style={styles.note}>
      <span style={styles.noteIcon}>⚠</span>
      {block.content}
    </div>
  )
}

// ── Data table ────────────────────────────────────────────────────────────────
function DataTable({ block }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        {block.headers && block.headers.length > 0 && (
          <thead>
            <tr>
              {block.headers.map((h, i) => (
                <th key={i} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {(block.rows ?? []).map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={styles.td}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Handcalc helpers ──────────────────────────────────────────────────────────

/** Render a LaTeX string as inline (not display) KaTeX HTML. */
function renderInline(latex) {
  if (!latex || !latex.trim()) return ''
  try {
    return katex.renderToString(latex.trim(), {
      displayMode:  false,
      throwOnError: false,
      errorColor:   '#c0392b',
      trust:        true,
      strict:       false,
    })
  } catch {
    return `<span style="font-family:monospace;font-size:12px">${
      latex.replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]))
    }</span>`
  }
}

/**
 * Parse handcalcs \begin{aligned}...\end{aligned} LaTeX into rows.
 * Each row: { symbol, formula, result }
 * handcalcs "long" format:  symbol &= formula_symbolic &= formula_substituted &= result
 * We show symbol, formula (symbolic), result — skipping the substituted column.
 * Returns null if the LaTeX is not in aligned format (fallback to display mode).
 */
function parseAligned(rawLatex) {
  let latex = (rawLatex ?? '').trim()
  if (latex.startsWith('$$') && latex.endsWith('$$')) latex = latex.slice(2, -2).trim()
  else if (latex.startsWith('$') && latex.endsWith('$')) latex = latex.slice(1, -1).trim()

  const m = latex.match(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/)
  if (!m) return null

  const lines = m[1].split('\\\\').map(r => r.trim()).filter(r => r.length > 0)
  if (!lines.length) return null

  return lines.map(line => {
    // split on &= (the alignment column separator handcalcs uses)
    const parts = line.split('&=')
    const symbol  = (parts[0] ?? '').trim()
    const formula = parts.length >= 3 ? (parts[1] ?? '').trim() : ''
    const result  = (parts[parts.length - 1] ?? '').trim()
    return { symbol, formula, result }
  })
}

// ── Handcalc — LaTeX rendered with KaTeX ─────────────────────────────────────
function Handcalc({ block }) {
  // Try to parse into compact rows first; fall back to full display mode
  const rows = useMemo(() => parseAligned(block.latex ?? ''), [block.latex])

  const displayHtml = useMemo(() => {
    if (rows) return null   // using compact mode, no need for display render
    try {
      let latex = (block.latex ?? '').trim()
      if (latex.startsWith('$$') && latex.endsWith('$$')) latex = latex.slice(2, -2).trim()
      else if (latex.startsWith('$') && latex.endsWith('$')) latex = latex.slice(1, -1).trim()
      return katex.renderToString(latex, {
        displayMode: true, throwOnError: false, trust: true, strict: false,
      })
    } catch (err) {
      return `<span style="color:#c0392b">LaTeX error: ${err.message}</span>`
    }
  }, [block.latex, rows])

  return (
    <div style={styles.handcalcWrap}>
      {block.label && <div style={styles.handcalcLabel}>{block.label}</div>}

      {rows ? (
        // ── Compact tabular mode ─────────────────────────────────────────────
        <div>
          {rows.map((row, i) => (
            <div key={i} style={styles.hcRow}>
              {/* Symbol — e.g. M_Ed */}
              <span
                style={styles.hcSymbol}
                dangerouslySetInnerHTML={{ __html: renderInline(row.symbol) }}
              />
              {/* Symbolic formula — e.g. w_Ed · L² / 8  (only if present) */}
              {row.formula ? (
                <>
                  <span style={styles.hcEq}>=</span>
                  <span
                    style={styles.hcFormula}
                    dangerouslySetInnerHTML={{ __html: renderInline(row.formula) }}
                  />
                </>
              ) : (
                <span />   /* keep grid aligned when formula is absent */
              )}
              {/* Result — e.g. 14.1 kNm */}
              <span style={styles.hcEq}>=</span>
              <span
                style={styles.hcResult}
                dangerouslySetInnerHTML={{ __html: renderInline(row.result) }}
              />
            </div>
          ))}
        </div>
      ) : (
        // ── Fallback: full display-mode LaTeX ────────────────────────────────
        <div style={styles.handcalcEquation} dangerouslySetInnerHTML={{ __html: displayHtml }} />
      )}
    </div>
  )
}

// ── Check result ──────────────────────────────────────────────────────────────
function Check({ block }) {
  const passes = block.passes !== false   // treat undefined as pass
  const clr  = passes ? '#16a34a' : '#dc2626'
  const bg   = passes ? '#f0fdf4' : '#fef2f2'
  const bd   = passes ? '#bbf7d0' : '#fecaca'
  return (
    <div style={{
      display:     'flex',
      alignItems:  'center',
      justifyContent: 'space-between',
      gap:         12,
      padding:     '8px 12px',
      background:  bg,
      border:      `1px solid ${bd}`,
      borderLeft:  `4px solid ${clr}`,
      margin:      '4px 0',
      flexWrap:    'wrap',
    }}>
      <span style={{ fontSize: 12, color: '#334155', flex: 1, lineHeight: 1.4 }}>
        {block.label}
      </span>
      <span style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        5,
        fontSize:   11,
        fontWeight: 700,
        color:      clr,
        fontFamily: 'var(--font-mono, monospace)',
        flexShrink: 0,
        background: '#fff',
        border:     `1px solid ${bd}`,
        padding:    '2px 8px',
      }}>
        {passes ? '✓ PASS' : '✗ FAIL'}&ensp;{block.value}
      </span>
    </div>
  )
}

// ── Calc text formatter — converts _x → <sub>x</sub>, ^x → <sup>x</sup>,
// and " a / b " (space-padded slash) → stacked horizontal fraction.
// Subscript/superscript stops at whitespace, operators, or brackets so that
// e.g. N_Ed/A → N<sub>Ed</sub>/A  (no spaces = not a fraction, left as-is).
// Handles multiple fractions per formula and (num / den)suffix patterns.
//
// Vault pattern: step 3a stores generated HTML under \x02N\x02 placeholders
// so step 3b never re-matches fragments inside an already-rendered fraction.
// (Without this, e.g. "(L_cr,y / i_y) / λ₁" produces a second fraction
// whose "numerator" is just ")" — leaking raw CSS text into the display.)
function fmtCalcText(text) {
  if (!text) return ''
  // 1. sub / superscripts
  // Exclusion set: whitespace, operators (+, -, −(U+2212), *, /, ×, ÷, ·),
  // comparison signs, brackets, and the control chars _^<>= so that
  // e.g. λ̄_y−0.2 only subscripts "y", stopping at the Unicode minus sign.
  let s = text
    .replace(/_([^\s_^<>=+\-−*/×÷·()[\]{}]+)/g, '<sub>$1</sub>')
    .replace(/\^([^\s_^<>=+\-−*/×÷·()[\]{}]+)/g, '<sup>$1</sup>')
  // 2. Extract leading "= " so it stays outside the fraction
  const eqMatch = s.match(/^(=\s*)/)
  const prefix = eqMatch ? eqMatch[1] : ''
  let body = prefix ? s.slice(prefix.length) : s

  // Helper: build one stacked fraction span
  const frac = (num, den) =>
    '<span style="display:inline-flex;flex-direction:column;' +
    'align-items:center;vertical-align:middle;margin:0 3px;font-size:0.9em">' +
      '<span style="border-bottom:1.5px solid currentColor;padding:1px 5px;' +
      'line-height:1.3;white-space:nowrap">' + num + '</span>' +
      '<span style="padding:1px 5px;line-height:1.3;white-space:nowrap">' +
      den + '</span>' +
    '</span>'

  // Vault: stash generated HTML under placeholder tokens (\x02N\x02)
  // so step 3b regex never sees — or partially re-matches — already-built HTML.
  const vault  = []
  const stash  = (html) => { vault.push(html); return `\x02${vault.length - 1}\x02` }
  const unstash = (s)   => s.replace(/\x02(\d+)\x02/g, (_, i) => vault[+i])

  // 3a. Handle  (num / den)suffix  — e.g. (σ_c,0,d / f_c,0,d)²
  //     Keeps the outer parens and any trailing suffix (², ³, …) outside the fraction.
  //     numerator/denominator must not themselves contain parens or whitespace.
  body = body.replace(
    /\(([^\s()]+)\s+\/\s+([^\s()]+)\)([\S]*)/g,
    (_, num, den, suffix) => stash('(' + frac(num, den) + ')' + suffix)
  )

  // 3b. Replace every remaining  token / token  with a stacked fraction.
  //     Slashes without surrounding spaces (kN/m, b·h²/6) are left untouched.
  //     \x02 is excluded from token chars so placeholders from 3a are never
  //     split and their closing ")" never becomes a dangling numerator.
  body = body.replace(
    /([^\s\x02]+)\s+\/\s+([^\s\x02]+)/g,
    (_, num, den) => stash(frac(num, den))
  )

  return prefix + unstash(body)
}

// ── Calc row (pre-formatted single equation row) ──────────────────────────────
function CalcRow({ block }) {
  return (
    <div style={styles.calcRow}>
      <span style={styles.calcRowName}
        dangerouslySetInnerHTML={{ __html: fmtCalcText(block.name) }} />
      <span style={styles.calcRowFormula}
        dangerouslySetInnerHTML={{ __html: fmtCalcText(block.formula) }} />
      <span style={styles.calcRowResult}
        dangerouslySetInnerHTML={{ __html: fmtCalcText(block.result) }} />
      {block.label && <span style={styles.calcRowNote}>{block.label}</span>}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    gap:           0,
  },
  moduleHeader: {
    padding:      '14px 20px',
    marginBottom: 0,
  },
  moduleTitle: {
    fontSize:   15,
    fontWeight: 700,
  },
  moduleSubtitle: {
    fontSize:  11,
    marginTop: 2,
    opacity:   0.85,
  },
  section: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    fontSize:     11,
    fontWeight:   700,
    color:        '#1e3a5f',
    padding:      '14px 0 5px',
    borderBottom: '1px solid #e2e8f0',
    marginTop:    18,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  sectionMark: {
    display:    'inline-block',
    width:      3,
    height:     12,
    background: '#1e3a5f',
    flexShrink: 0,
  },
  text: {
    fontSize:   12,
    color:      '#475569',
    lineHeight: 1.65,
    margin:     '5px 0',
    fontFamily: 'inherit',
  },
  note: {
    display:      'flex',
    gap:          8,
    background:   '#fffbf2',
    border:       '1px solid #f5c842',
    borderLeft:   '4px solid #f5c842',
    padding:      '8px 12px',
    fontSize:     12,
    color:        '#6b5a00',
    lineHeight:   1.5,
    margin:       '6px 0',
  },
  noteIcon: {
    flexShrink: 0,
    fontSize:   13,
  },
  tableWrap: {
    overflowX: 'auto',
    margin:    '8px 0',
  },
  table: {
    width:          '100%',
    borderCollapse: 'collapse',
    fontSize:       12,
  },
  th: {
    textAlign:    'left',
    fontWeight:   600,
    color:        '#555',
    padding:      '5px 10px',
    borderBottom: '2px solid #e8e8e8',
    background:   '#fafafa',
    fontSize:     11,
  },
  td: {
    padding:      '4px 10px',
    borderBottom: '1px solid #f0f0f0',
    color:        '#333',
    fontFamily:   'monospace',
    fontSize:     12,
  },
  handcalcWrap: {
    borderLeft: '3px solid #dde5f0',
    margin:     '3px 0',
    padding:    '3px 8px',
    overflowX:  'auto',
    fontSize:   '13px',
  },
  handcalcLabel: {
    fontSize:      10,
    color:         '#94a3b8',
    fontWeight:    600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom:  2,
  },
  // ── Compact tabular row (mirrors calcRow but uses inline KaTeX) ─────────────
  hcRow: {
    display:    'flex',
    alignItems: 'baseline',
    flexWrap:   'nowrap',
    gap:        '0 2px',
    padding:    '1px 0',
    borderBottom: '1px solid #f8fafc',
    minHeight:  20,
    overflowX:  'auto',
  },
  hcSymbol: {
    fontWeight:  600,
    color:       '#1e3a5f',
    minWidth:    70,
    flexShrink:  0,
    lineHeight:  1,
  },
  hcEq: {
    color:      '#94a3b8',
    padding:    '0 4px',
    fontSize:   12,
    flexShrink: 0,
    lineHeight: 1,
  },
  hcFormula: {
    color:      '#475569',
    flex:       '1 1 auto',
    lineHeight: 1,
  },
  hcResult: {
    fontWeight:  700,
    color:       '#0f172a',
    marginLeft:  'auto',
    paddingLeft: 8,
    flexShrink:  0,
    lineHeight:  1,
    whiteSpace:  'nowrap',
  },
  // ── Fallback full display equation ─────────────────────────────────────────
  handcalcEquation: {
    textAlign: 'center',
    fontSize:  '13px',
  },
  check: {
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
    padding:      '8px 12px',
    background:   '#fafafa',
    margin:       '3px 0',
    gap:          12,
    flexWrap:     'wrap',
  },
  checkLabel: {
    fontSize: 12,
    color:    '#444',
    flex:     1,
  },
  checkValue: {
    fontSize:   12,
    fontWeight: 700,
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  calcRow: {
    display:             'grid',
    gridTemplateColumns: '120px 1fr auto auto',
    gap:                 '0 12px',
    alignItems:          'center',
    padding:             '3px 0',
    fontSize:            12,
    fontFamily:          'var(--font-mono, monospace)',
    color:               '#334155',
    borderBottom:        '1px solid #f8fafc',
  },
  calcRowName: {
    fontWeight:   600,
    color:        '#1e3a5f',
    overflow:     'hidden',
    whiteSpace:   'nowrap',
    textOverflow: 'ellipsis',
  },
  calcRowFormula: {
    color:    '#64748b',
    fontSize: 11,
  },
  calcRowResult: {
    fontWeight:  700,
    color:       '#0f172a',
    textAlign:   'right',
    whiteSpace:  'nowrap',
  },
  calcRowNote: {
    color:     '#94a3b8',
    fontSize:  10,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  unknown: {
    fontSize: 11,
    color:    '#c0392b',
    padding:  4,
  },
}
