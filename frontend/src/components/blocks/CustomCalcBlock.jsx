/**
 * CustomCalcBlock.jsx — free-form "template calculation" block
 *
 * The user builds a sequence of items (mixed in any order):
 *   text    — narrative paragraph / assumptions
 *   var     — named variable with numeric value + unit
 *   formula — arithmetic expression  e.g.  F_Ed = g_k * L
 *   check   — pass/fail comparison: eval(demand_expr) vs capacity value+unit
 *
 * Clicking "Run" sends the items list to /calc/custom-calc on the backend.
 * Results are shown via CalcResultView and saved to block.data._result for PDF export.
 *
 * Templates can be saved to / loaded from localStorage (per browser).
 *
 * Props:
 *   block    — { id, type: "custom_calc", data: { title, items, _result } }
 *   onChange — function(updatedBlock)
 */
import React, { useState, useEffect, useRef } from 'react'
import { calcCustomCalc } from '../../api/client.js'
import CalcResultView from '../CalcResultView.jsx'

// ── Template storage (localStorage) ──────────────────────────────────────────

const TEMPLATE_KEY = 'struct_calc_custom_templates'

function readTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '{}') } catch { return {} }
}
function writeTemplates(t) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t))
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

function summarise(blocks) {
  if (!blocks) return null
  let pass = 0, fail = 0
  for (const b of blocks) {
    if (b.type === 'check') b.passes !== false ? pass++ : fail++
  }
  return { pass, fail, total: pass + fail }
}

// ── Unit choices (must match the backend _UNIT_NS) ────────────────────────────
const UNIT_OPTIONS = [
  { v: '-',        l: '—'       },
  { v: 'm',        l: 'm'       },
  { v: 'mm',       l: 'mm'      },
  { v: 'cm',       l: 'cm'      },
  { v: 'kN',       l: 'kN'      },
  { v: 'N',        l: 'N'       },
  { v: 'MN',       l: 'MN'      },
  { v: 'kN/m',     l: 'kN/m'   },
  { v: 'N/m',      l: 'N/m'    },
  { v: 'kN/m**2',  l: 'kN/m²'  },
  { v: 'MPa',      l: 'MPa'     },
  { v: 'GPa',      l: 'GPa'     },
  { v: 'kPa',      l: 'kPa'    },
  { v: 'kN*m',     l: 'kN·m'   },
  { v: 'N*m',      l: 'N·m'    },
  { v: 'mm**2',    l: 'mm²'     },
  { v: 'cm**2',    l: 'cm²'     },
  { v: 'm**2',     l: 'm²'      },
  { v: 'mm**3',    l: 'mm³'     },
  { v: 'cm**3',    l: 'cm³'     },
  { v: 'mm**4',    l: 'mm⁴'     },
  { v: 'cm**4',    l: 'cm⁴'     },
  { v: 'kg',       l: 'kg'      },
  { v: 'kN/m**3',  l: 'kN/m³'  },
]

// Badge colour per item type
const TYPE_BADGE = {
  text:    { label: 'TXT', bg: '#6E6E73' },
  heading: { label: 'HDG', bg: '#1e3a5f' },
  var:     { label: 'VAR', bg: '#12788E' },
  formula: { label: 'FML', bg: '#032E38' },
  check:   { label: 'CHK', bg: '#E74825' },
}

const DEFAULT_ITEM = {
  text:    { type: 'text',    content: '' },
  heading: { type: 'heading', content: '' },
  var:     { type: 'var',     name: '',  value: 0,   unit: '-', description: '' },
  formula: { type: 'formula', expr: '' },
  check:   { type: 'check',   label: 'Check', demand: '', capacity: '1.0', unit: 'kN' },
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CustomCalcBlock({ block, onChange }) {
  const d = block.data
  const [running,      setRunning]      = useState(false)
  const [error,        setError]        = useState('')
  const [resultOpen,   setResultOpen]   = useState(false)
  const [tplOpen,      setTplOpen]      = useState(false)
  const [templates,    setTemplatesState] = useState(readTemplates)
  const tplRef = useRef(null)

  useEffect(() => { if (d._result) setResultOpen(true) }, [d._result])

  // Close template dropdown on outside click
  useEffect(() => {
    if (!tplOpen) return
    const close = e => { if (tplRef.current && !tplRef.current.contains(e.target)) setTplOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [tplOpen])

  const items = d.items ?? []

  // ── Data helpers ──────────────────────────────────────────────────────────

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  function updateItem(index, changes) {
    const next = [...items]
    next[index] = { ...next[index], ...changes }
    update({ items: next })
  }

  function addItem(type) {
    update({ items: [...items, { ...DEFAULT_ITEM[type] }] })
  }

  function removeItem(index) {
    const next = [...items]
    next.splice(index, 1)
    update({ items: next })
  }

  function moveItem(index, dir) {
    const next = [...items]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    update({ items: next })
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  function handleSaveTemplate() {
    const name = window.prompt('Save template as:', d.title?.trim() || 'My Calculation')
    if (!name?.trim()) return
    const updated = { ...readTemplates(), [name.trim()]: { title: d.title, items: d.items } }
    writeTemplates(updated)
    setTemplatesState(updated)
    setTplOpen(false)
  }

  function handleLoadTemplate(name) {
    const tpl = readTemplates()[name]
    if (!tpl) return
    if (items.length > 0 && !window.confirm(`Replace current items with template "${name}"?`)) return
    update({ title: tpl.title, items: tpl.items, _result: null })
    setTplOpen(false)
  }

  function handleDeleteTemplate(name, e) {
    e.stopPropagation()
    if (!window.confirm(`Delete template "${name}"?`)) return
    const updated = { ...readTemplates() }
    delete updated[name]
    writeTemplates(updated)
    setTemplatesState({ ...updated })
  }

  // ── Run / Clear ───────────────────────────────────────────────────────────

  async function handleRun() {
    setRunning(true)
    setError('')
    try {
      const blocks = await calcCustomCalc({
        title: d.title ?? 'Custom Calculation',
        items: items,
      })
      update({ _result: blocks })
    } catch (err) {
      setError(err.message ?? 'Calculation failed')
    } finally {
      setRunning(false)
    }
  }

  function handleClear() {
    update({ _result: null })
    setError('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const tplNames = Object.keys(templates)

  return (
    <div style={s.wrapper}>

      {/* Title row + Templates button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          type="text"
          value={d.title ?? 'Custom Calculation'}
          onChange={e => update({ title: e.target.value })}
          placeholder="Section title"
          style={{ ...s.titleInput, flex: 1 }}
        />

        {/* Templates dropdown */}
        <div ref={tplRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            style={s.tplToggle}
            onClick={() => setTplOpen(o => !o)}
            title="Save or load a template"
          >
            📋 Templates ▾
          </button>

          {tplOpen && (
            <div style={s.tplDropdown}>
              {/* Save current */}
              <button style={s.tplSaveBtn} onClick={handleSaveTemplate}>
                💾 Save current as template
              </button>

              {/* Saved templates list */}
              {tplNames.length > 0 ? (
                <>
                  <div style={s.tplDivider}>Saved templates</div>
                  {tplNames.map(name => (
                    <div key={name} style={s.tplItem}>
                      <button
                        style={s.tplLoadBtn}
                        onClick={() => handleLoadTemplate(name)}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f5f7'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        {name}
                      </button>
                      <button
                        style={s.tplDelBtn}
                        onClick={e => handleDeleteTemplate(name, e)}
                        title="Delete template"
                      >✕</button>
                    </div>
                  ))}
                </>
              ) : (
                <div style={s.tplEmpty}>No saved templates yet</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Item list */}
      {items.length === 0 && (
        <div style={s.emptyMsg}>
          No items yet — use the buttons below to add variables, formulas and checks.
        </div>
      )}

      {items.map((item, i) => (
        <ItemRow
          key={i}
          item={item}
          index={i}
          total={items.length}
          onChange={ch => updateItem(i, ch)}
          onMoveUp={()   => moveItem(i, -1)}
          onMoveDown={()  => moveItem(i, +1)}
          onDelete={()    => removeItem(i)}
        />
      ))}

      {/* Add-item buttons */}
      <div style={s.addRow}>
        <span style={s.addLabel}>Add:</span>
        {[
          ['heading', '+ Heading'],
          ['var',     '+ Variable'],
          ['formula', '+ Formula'],
          ['check',   '+ Check'],
          ['text',    '+ Text'],
        ].map(([type, label]) => (
          <button key={type} style={s.addBtn} onClick={() => addItem(type)}>
            {label}
          </button>
        ))}
      </div>

      {/* Run / Clear */}
      <div style={s.actionRow}>
        <button
          style={{ ...s.btn, ...s.btnRun }}
          onClick={handleRun}
          disabled={running}
        >
          {running ? '⏳ Running…' : '▶ Run'}
        </button>
        {d._result && (
          <button style={s.btn} onClick={handleClear} disabled={running}>
            ✕ Clear results
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={s.errorBox}>{error}</div>
      )}

      {/* Results — collapsible */}
      {d._result && d._result.length > 0 && (() => {
        const sum = summarise(d._result)
        return (
          <div style={s.resultPanel}>
            <button style={s.summaryBar} onClick={() => setResultOpen(o => !o)}>
              {sum && sum.total > 0 && (
                <span style={{ display: 'flex', gap: 4 }}>
                  {sum.pass > 0 && <span style={{ ...s.badge, background: '#e8f8ef', color: '#27ae60' }}>✓ {sum.pass}</span>}
                  {sum.fail > 0 && <span style={{ ...s.badge, background: '#fdf3f2', color: '#c0392b' }}>✗ {sum.fail}</span>}
                </span>
              )}
              <span style={{ fontSize: 11, color: '#666', flex: 1 }}>{resultOpen ? 'Hide results' : 'Show results'}</span>
              <span style={{ fontSize: 9, color: '#aaa' }}>{resultOpen ? '▲' : '▼'}</span>
            </button>
            {resultOpen && (
              <div style={s.resultBody}>
                <CalcResultView blocks={d._result} />
              </div>
            )}
          </div>
        )
      })()}

    </div>
  )
}

// ── ItemRow ───────────────────────────────────────────────────────────────────

function ItemRow({ item, index, total, onChange, onMoveUp, onMoveDown, onDelete }) {
  const itype  = item.type ?? 'text'
  const badge  = TYPE_BADGE[itype] ?? { label: '?', bg: '#999' }

  return (
    <div style={s.itemRow}>

      {/* Control strip */}
      <div style={s.itemControls}>
        <button
          style={{ ...s.ctrlBtn, opacity: index === 0 ? 0.3 : 1 }}
          onClick={onMoveUp}
          disabled={index === 0}
          title="Move up"
        >↑</button>
        <button
          style={{ ...s.ctrlBtn, opacity: index === total - 1 ? 0.3 : 1 }}
          onClick={onMoveDown}
          disabled={index === total - 1}
          title="Move down"
        >↓</button>

        {/* Type badge */}
        <span style={{ ...s.badge, background: badge.bg }}>{badge.label}</span>

        {/* Delete */}
        <button style={{ ...s.ctrlBtn, ...s.deleteBtn, marginLeft: 'auto' }} onClick={onDelete} title="Remove">✕</button>
      </div>

      {/* Type-specific fields */}
      <div style={s.itemContent}>
        {itype === 'text'    && <TextItem    item={item} onChange={onChange} />}
        {itype === 'heading' && <HeadingItem item={item} onChange={onChange} />}
        {itype === 'var'     && <VarItem     item={item} onChange={onChange} />}
        {itype === 'formula' && <FormulaItem item={item} onChange={onChange} />}
        {itype === 'check'   && <CheckItem   item={item} onChange={onChange} />}
      </div>

    </div>
  )
}

// ── Item type renderers ───────────────────────────────────────────────────────

function TextItem({ item, onChange }) {
  return (
    <textarea
      value={item.content ?? ''}
      onChange={e => onChange({ content: e.target.value })}
      rows={3}
      placeholder="Assumptions, description, references…"
      style={s.textarea}
    />
  )
}

function HeadingItem({ item, onChange }) {
  return (
    <input
      style={{ ...s.input, fontWeight: 700, fontSize: 13, letterSpacing: '0.01em' }}
      value={item.content ?? ''}
      onChange={e => onChange({ content: e.target.value })}
      placeholder="Section heading, e.g. Loads  or  Section check"
      spellCheck={false}
    />
  )
}

function VarItem({ item, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* Name / value / unit row */}
      <div style={s.varRow}>
        <div style={s.varField}>
          <label style={s.fieldLabel}>Symbol</label>
          <input
            style={{ ...s.input, fontFamily: 'monospace' }}
            value={item.name ?? ''}
            onChange={e => onChange({ name: e.target.value })}
            placeholder="e.g. g_k"
            spellCheck={false}
          />
        </div>
        <div style={{ ...s.varField, maxWidth: 130 }}>
          <label style={s.fieldLabel}>Value</label>
          <input
            style={s.input}
            type="number"
            value={item.value ?? 0}
            onChange={e => onChange({ value: parseFloat(e.target.value) || 0 })}
            step="any"
          />
        </div>
        <div style={{ ...s.varField, maxWidth: 110 }}>
          <label style={s.fieldLabel}>Unit</label>
          <UnitSelect value={item.unit ?? '-'} onChange={v => onChange({ unit: v })} />
        </div>
      </div>
      {/* Optional description */}
      <input
        style={{ ...s.input, color: '#666', fontSize: 11 }}
        value={item.description ?? ''}
        onChange={e => onChange({ description: e.target.value })}
        placeholder="Description (optional) — e.g. Characteristic dead load"
        spellCheck={false}
      />
    </div>
  )
}

function FormulaItem({ item, onChange }) {
  return (
    <div>
      <label style={s.fieldLabel}>Expression  (lhs = rhs)</label>
      <input
        style={{ ...s.input, fontFamily: 'monospace', fontSize: 13 }}
        value={item.expr ?? ''}
        onChange={e => onChange({ expr: e.target.value })}
        placeholder="e.g.  M_Ed = q * L^2 / 8   or   sigma = N_Ed / A"
        spellCheck={false}
      />
      <div style={s.hint}>
        Reference any variable defined above. Power: <code>^</code>.&ensp;
        Multiply: <code>*</code> or <code>×</code>.&ensp;
        Functions: <code>sqrt &nbsp;sin &nbsp;cos &nbsp;tan &nbsp;log &nbsp;exp &nbsp;abs &nbsp;min &nbsp;max</code>.&ensp;
        Constants: <code>pi &nbsp;e</code>.&ensp;
        Units are carried automatically.
      </div>
    </div>
  )
}

function CheckItem({ item, onChange }) {
  return (
    <div style={s.checkGrid}>
      <div style={s.varField}>
        <label style={s.fieldLabel}>Label</label>
        <input
          style={s.input}
          value={item.label ?? 'Check'}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Check label"
        />
      </div>
      <div style={s.varField}>
        <label style={s.fieldLabel}>Demand (expression)</label>
        <input
          style={{ ...s.input, fontFamily: 'monospace' }}
          value={item.demand ?? ''}
          onChange={e => onChange({ demand: e.target.value })}
          placeholder="e.g.  sigma  or  N_Ed / A"
          spellCheck={false}
        />
      </div>
      <div style={s.varField}>
        <label style={s.fieldLabel}>Capacity (value or expression)</label>
        <input
          style={{ ...s.input, fontFamily: 'monospace' }}
          value={String(item.capacity ?? '1.0')}
          onChange={e => onChange({ capacity: e.target.value })}
          placeholder="e.g.  160  or  f_cd  or  kmod * f_ck / gamma_M"
          spellCheck={false}
        />
      </div>
      <div style={{ ...s.varField, maxWidth: 110 }}>
        <label style={s.fieldLabel}>Unit (if number)</label>
        <UnitSelect value={item.unit ?? 'kN'} onChange={v => onChange({ unit: v })} />
      </div>
    </div>
  )
}

// ── Shared unit select ────────────────────────────────────────────────────────

function UnitSelect({ value, onChange }) {
  return (
    <select style={s.input} value={value} onChange={e => onChange(e.target.value)}>
      {UNIT_OPTIONS.map(u => (
        <option key={u.v} value={u.v}>{u.l}</option>
      ))}
    </select>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    gap:           10,
  },
  titleInput: {
    border:     '1px solid #e8e8e8',
    padding:    '6px 10px',
    fontSize:   13,
    fontWeight: 600,
    outline:    'none',
    fontFamily: 'inherit',
    boxSizing:  'border-box',
  },

  // ── Templates dropdown ────────────────────────────────────────────────
  tplToggle: {
    background:    '#f5f5f7',
    border:        '1px solid #e8e8e8',
    padding:       '6px 10px',
    fontSize:      11,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    whiteSpace:    'nowrap',
    height:        '100%',
    boxSizing:     'border-box',
  },
  tplDropdown: {
    position:   'absolute',
    top:        '100%',
    right:      0,
    zIndex:     300,
    background: '#fff',
    border:     '1px solid #e0e0e0',
    boxShadow:  '0 6px 20px rgba(0,0,0,0.12)',
    minWidth:   220,
    padding:    '4px 0',
  },
  tplSaveBtn: {
    display:    'block',
    width:      '100%',
    background: 'none',
    border:     'none',
    borderBottom: '1px solid #f0f0f0',
    padding:    '8px 14px',
    fontSize:   12,
    fontWeight: 600,
    color:      '#333',
    textAlign:  'left',
    cursor:     'pointer',
    fontFamily: 'inherit',
  },
  tplDivider: {
    fontSize:      9,
    fontWeight:    700,
    color:         '#bbb',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding:       '8px 14px 4px',
  },
  tplItem: {
    display:    'flex',
    alignItems: 'center',
  },
  tplLoadBtn: {
    flex:       1,
    background: 'none',
    border:     'none',
    padding:    '6px 14px',
    fontSize:   12,
    color:      '#333',
    textAlign:  'left',
    cursor:     'pointer',
    fontFamily: 'inherit',
  },
  tplDelBtn: {
    background: 'none',
    border:     'none',
    padding:    '4px 10px',
    fontSize:   11,
    color:      '#c0392b',
    cursor:     'pointer',
    flexShrink: 0,
  },
  tplEmpty: {
    fontSize: 11,
    color:    '#bbb',
    padding:  '8px 14px',
  },

  // ── Items ─────────────────────────────────────────────────────────────
  emptyMsg: {
    color:     '#bbb',
    fontSize:  12,
    padding:   '12px 0',
    textAlign: 'center',
  },
  itemRow: {
    border:     '1px solid #e8e8e8',
    background: '#fff',
  },
  itemControls: {
    display:      'flex',
    alignItems:   'center',
    gap:          4,
    padding:      '5px 8px',
    background:   '#fafafa',
    borderBottom: '1px solid #f0f0f0',
  },
  ctrlBtn: {
    background:  'none',
    border:      '1px solid #e8e8e8',
    padding:     '2px 6px',
    fontSize:    11,
    color:       '#666',
    cursor:      'pointer',
    lineHeight:  1.4,
  },
  deleteBtn: {
    color:  '#c0392b',
    border: '1px solid #f5c6c6',
  },
  badge: {
    display:       'inline-block',
    color:         '#fff',
    fontSize:      9,
    fontWeight:    700,
    letterSpacing: '0.05em',
    padding:       '2px 5px',
    borderRadius:  3,
  },
  itemContent: {
    padding: '10px 12px',
  },
  varRow: {
    display:  'flex',
    gap:      10,
    flexWrap: 'wrap',
  },
  varField: {
    display:       'flex',
    flexDirection: 'column',
    gap:           3,
    flex:          1,
    minWidth:      80,
  },
  checkGrid: {
    display:  'flex',
    gap:      10,
    flexWrap: 'wrap',
  },
  fieldLabel: {
    fontSize:      10,
    color:         '#888',
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    border:     '1px solid #e8e8e8',
    padding:    '5px 8px',
    fontSize:   12,
    fontFamily: 'inherit',
    outline:    'none',
    width:      '100%',
    boxSizing:  'border-box',
  },
  textarea: {
    border:     '1px solid #e8e8e8',
    padding:    '6px 8px',
    fontSize:   12,
    fontFamily: 'inherit',
    outline:    'none',
    width:      '100%',
    boxSizing:  'border-box',
    resize:     'vertical',
    lineHeight: 1.5,
  },
  hint: {
    fontSize:   10,
    color:      '#aaa',
    marginTop:  4,
    lineHeight: 1.4,
  },
  addRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        6,
    padding:    '6px 0 2px',
    borderTop:  '1px solid #f0f0f0',
  },
  addLabel: {
    fontSize:      10,
    color:         '#aaa',
    fontWeight:    700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginRight:   2,
  },
  addBtn: {
    background:  '#f5f5f7',
    border:      '1px solid #e8e8e8',
    padding:     '4px 10px',
    fontSize:    11,
    fontWeight:  600,
    cursor:      'pointer',
    fontFamily:  'inherit',
  },
  actionRow: {
    display: 'flex',
    gap:     8,
  },
  btn: {
    background:    '#f5f5f7',
    border:        '1px solid #e8e8e8',
    padding:       '7px 14px',
    fontSize:      12,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    letterSpacing: '0.04em',
  },
  btnRun: {
    background: '#111',
    color:      '#fff',
    border:     '1px solid #111',
  },
  errorBox: {
    background:  '#fdf3f2',
    border:      '1px solid #f5c6c6',
    padding:     '8px 12px',
    fontSize:    12,
    color:       '#c0392b',
  },
  resultPanel: {
    border:    '1px solid #e8e8e8',
    marginTop: 2,
  },
  summaryBar: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    width:        '100%',
    background:   '#f5f5f7',
    border:       'none',
    borderBottom: '1px solid #e8e8e8',
    padding:      '7px 12px',
    cursor:       'pointer',
    fontFamily:   'inherit',
    textAlign:    'left',
  },
  resultBody: {
    padding: '12px 14px',
  },
}
