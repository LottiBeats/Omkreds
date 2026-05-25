/**
 * TemplateEditorModal.jsx — create and edit user-defined calculation templates
 *
 * Layout:
 *   Left panel  — list of saved templates + "New" button
 *   Right panel — editor: name / description / parameters / code + test run
 *
 * Props:
 *   initialTemplateId — open this template immediately (optional)
 *   onClose           — called when the user closes the modal
 *   onTemplatesChanged — called after create/update/delete so BlockList refreshes
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  getCalcTemplates, createCalcTemplate, updateCalcTemplate,
  deleteCalcTemplate, runCalcTemplate,
} from '../api/client.js'
import CalcResultView from './CalcResultView.jsx'
import { DEFAULT_ITEM, ItemRow } from './blocks/CustomCalcBlock.jsx'

// ── Starter code shown for new templates ─────────────────────────────────────
const STARTER_CODE = `# Available: S, T, N, CALC_ROW, MH, CheckContext, math, np
# Parameter values are injected as local variables.
# You MUST set:  blocks = [...]

chk = CheckContext()
blocks = []

# ── Your calculation ─────────────────────────────────────────────────
# Example — replace with your own:
# M_Ed = w_kNm * span_m**2 / 8
# blocks.append(MH(f"My Check — {span_m:.1f} m", "", "general"))
# blocks.append(CALC_ROW("M_Ed", "= w·L²/8", f"{M_Ed:.2f} kNm"))
# blocks.append(chk.check("M_Ed ≤ M_Rd", M_Ed, M_Rd_kNm))
`

const BLANK_TEMPLATE = {
  id: null,
  name: '',
  description: '',
  parameters: [],
  code: STARTER_CODE,
}

function newParam() {
  return { name: '', label: '', unit: '', type: 'number', default: 0, min: '', max: '', step: '' }
}

export default function TemplateEditorModal({ initialTemplateId, onClose, onTemplatesChanged }) {
  const [templates, setTemplates] = useState([])
  const [selected,  setSelected]  = useState(null)   // template being edited
  const [dirty,     setDirty]     = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [testResult, setTestResult] = useState(null)  // list of blocks
  const [testError,  setTestError]  = useState(null)
  const [testing,    setTesting]    = useState(false)

  // Load templates on open
  useEffect(() => {
    loadTemplates()
  }, [])

  async function loadTemplates() {
    try {
      const list = await getCalcTemplates()
      setTemplates(list)
      // If an initialTemplateId was provided, open it
      if (initialTemplateId) {
        const t = list.find(t => t.id === initialTemplateId)
        if (t) selectTemplate(t)
      }
    } catch (err) {
      console.error('Failed to load templates', err)
    }
  }

  function selectTemplate(tmpl) {
    setSelected(JSON.parse(JSON.stringify(tmpl)))  // deep copy
    setDirty(false)
    setTestResult(null)
    setTestError(null)
  }

  function handleNew() {
    setSelected({ ...BLANK_TEMPLATE, parameters: [] })
    setDirty(true)
    setTestResult(null)
    setTestError(null)
  }

  function update(changes) {
    setSelected(s => ({ ...s, ...changes }))
    setDirty(true)
  }

  // Items-based detection — templates saved from CustomCalcBlock have an items array
  const isItemsBased = Array.isArray(selected?.items)

  // ── Parameters ─────────────────────────────────────────────────────────────

  function addParam() {
    update({ parameters: [...(selected.parameters || []), newParam()] })
  }

  function removeParam(i) {
    const p = [...(selected.parameters || [])]
    p.splice(i, 1)
    update({ parameters: p })
  }

  function updateParam(i, field, value) {
    const p = [...(selected.parameters || [])]
    p[i] = { ...p[i], [field]: value }
    update({ parameters: p })
  }

  // ── Items (visual editor mode) ──────────────────────────────────────────────

  function addItem(type) {
    const next = [...(selected.items || []), { ...DEFAULT_ITEM[type] }]
    update({ items: next })
  }

  function removeItemAt(i) {
    const next = [...(selected.items || [])]
    next.splice(i, 1)
    update({ items: next })
  }

  function moveItemAt(i, dir) {
    const next = [...(selected.items || [])]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update({ items: next })
  }

  function updateItemAt(i, changes) {
    const next = [...(selected.items || [])]
    next[i] = { ...next[i], ...changes }
    update({ items: next })
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selected.name.trim()) {
      alert('Please give the template a name.')
      return
    }
    setSaving(true)
    try {
      // For items-based templates, auto-derive parameters from variable items
      const parameters = isItemsBased
        ? (selected.items || [])
            .filter(it => it.type === 'var' && it.name?.trim())
            .map(it => ({
              name:    it.name,
              label:   it.description || it.name,
              unit:    it.unit ?? '-',
              type:    'number',
              default: it.value ?? 0,
            }))
        : (selected.parameters || []).filter(p => p.name.trim())

      const payload = {
        name:        selected.name.trim(),
        description: selected.description,
        parameters,
        code:        isItemsBased ? '' : (selected.code || ''),
        items:       isItemsBased ? (selected.items || []) : [],
      }
      let saved
      if (selected.id) {
        saved = await updateCalcTemplate(selected.id, payload)
      } else {
        saved = await createCalcTemplate(payload)
      }
      setSelected(saved)
      setDirty(false)
      await loadTemplates()
      onTemplatesChanged?.()
    } catch (err) {
      alert(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!selected.id) return
    if (!window.confirm(`Delete "${selected.name}"? This cannot be undone.`)) return
    try {
      await deleteCalcTemplate(selected.id)
      setSelected(null)
      await loadTemplates()
      onTemplatesChanged?.()
    } catch (err) {
      alert(`Delete failed: ${err.message}`)
    }
  }

  // ── Test run ───────────────────────────────────────────────────────────────

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    setTestError(null)

    // Build params from defaults (or from var items for items-based templates)
    const testParams = {}
    if (isItemsBased) {
      for (const it of (selected.items || [])) {
        if (it.type === 'var' && it.name?.trim()) {
          testParams[it.name] = it.value ?? 0
        }
      }
    } else {
      for (const p of (selected.parameters || [])) {
        if (!p.name) continue
        testParams[p.name] = p.type === 'number' ? (parseFloat(p.default) || 0) : (p.default || '')
      }
    }

    try {
      // If template not saved yet, we can't run by ID — save first
      if (!selected.id) {
        setTestError('Save the template first, then you can test it.')
        return
      }
      const blocks = await runCalcTemplate(selected.id, testParams)
      setTestResult(blocks)
    } catch (err) {
      setTestError(err.message)
    } finally {
      setTesting(false)
    }
  }

  // ── Close guard ───────────────────────────────────────────────────────────

  function handleClose() {
    if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return
    onClose()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && handleClose()}>
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <span style={s.headerTitle}>⚙ My Calculations</span>
          <button style={s.closeBtn} onClick={handleClose}>✕</button>
        </div>

        <div style={s.body}>

          {/* ── Left: template list ── */}
          <div style={s.list}>
            <button style={s.newBtn} onClick={handleNew}>+ New template</button>

            {templates.length === 0 && (
              <div style={s.emptyList}>
                No templates yet.<br />Click "+ New template" to create your first custom calculation.
              </div>
            )}

            {templates.map(t => (
              <button
                key={t.id}
                style={{
                  ...s.listItem,
                  ...(selected?.id === t.id ? s.listItemActive : {}),
                }}
                onClick={() => {
                  if (dirty && selected?.id !== t.id) {
                    if (!window.confirm('Discard unsaved changes?')) return
                  }
                  selectTemplate(t)
                }}
              >
                <div style={s.listItemName}>{t.name || '(unnamed)'}</div>
                {t.description && (
                  <div style={s.listItemDesc}>{t.description}</div>
                )}
              </button>
            ))}
          </div>

          {/* ── Right: editor ── */}
          {selected ? (
            <div style={s.editor}>

              {/* Name + description */}
              <div style={s.row2}>
                <div style={s.field}>
                  <label style={s.label}>Template name *</label>
                  <input
                    style={s.input}
                    value={selected.name}
                    onChange={e => update({ name: e.target.value })}
                    placeholder="e.g. Custom Beam Check"
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Description</label>
                  <input
                    style={s.input}
                    value={selected.description}
                    onChange={e => update({ description: e.target.value })}
                    placeholder="Brief description"
                  />
                </div>
              </div>

              {/* ── Items-based (visual) editor ── */}
              {isItemsBased ? (
                <div style={s.paramSection}>
                  <div style={s.sectionHead}>
                    Calculation items
                    <span style={s.sectionHint}> — variables, formulas and checks (input fields are derived from variables)</span>
                  </div>

                  {(selected.items || []).length === 0 && (
                    <div style={{ color: '#bbb', fontSize: 12, padding: '10px 0' }}>
                      No items yet — use the buttons below to add variables, formulas and checks.
                    </div>
                  )}

                  {(selected.items || []).map((item, i) => (
                    <ItemRow
                      key={i}
                      item={item}
                      index={i}
                      total={(selected.items || []).length}
                      onChange={ch => updateItemAt(i, ch)}
                      onMoveUp={()  => moveItemAt(i, -1)}
                      onMoveDown={() => moveItemAt(i, +1)}
                      onDelete={()  => removeItemAt(i)}
                    />
                  ))}

                  {/* Add-item buttons */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#888', alignSelf: 'center' }}>Add:</span>
                    {[
                      ['heading',     '+ Heading'],
                      ['var',         '+ Variable'],
                      ['formula',     '+ Formula'],
                      ['conditional', '+ If/Else'],
                      ['check',       '+ Check'],
                      ['text',        '+ Text'],
                    ].map(([type, label]) => (
                      <button key={type} style={s.addParamBtn} onClick={() => addItem(type)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Parameters — only shown for Python-code templates */}
                  <div style={s.paramSection}>
                    <div style={s.sectionHead}>
                      Parameters
                      <span style={s.sectionHint}> — these become the input fields in the document</span>
                    </div>

                    {(selected.parameters || []).map((p, i) => (
                      <div key={i} style={s.paramCard}>
                        <div style={s.paramGrid}>

                          <div style={s.paramField}>
                            <label style={s.paramLabel}>Name (Python)</label>
                            <input style={s.paramInput} value={p.name}
                              placeholder="span_m"
                              onChange={e => updateParam(i, 'name', e.target.value)} />
                          </div>

                          <div style={s.paramField}>
                            <label style={s.paramLabel}>Label</label>
                            <input style={s.paramInput} value={p.label}
                              placeholder="Span"
                              onChange={e => updateParam(i, 'label', e.target.value)} />
                          </div>

                          <div style={s.paramField}>
                            <label style={s.paramLabel}>Unit</label>
                            <input style={s.paramInput} value={p.unit}
                              placeholder="m"
                              onChange={e => updateParam(i, 'unit', e.target.value)} />
                          </div>

                          <div style={s.paramField}>
                            <label style={s.paramLabel}>Type</label>
                            <select style={s.paramInput} value={p.type}
                              onChange={e => updateParam(i, 'type', e.target.value)}>
                              <option value="number">number</option>
                              <option value="select">select</option>
                            </select>
                          </div>

                          <div style={s.paramField}>
                            <label style={s.paramLabel}>
                              {p.type === 'select' ? 'Options (comma-sep.)' : 'Default'}
                            </label>
                            {p.type === 'select' ? (
                              <input style={s.paramInput} value={p.default}
                                placeholder="S235,S275,S355"
                                onChange={e => updateParam(i, 'default', e.target.value)} />
                            ) : (
                              <input style={s.paramInput} type="number" step="any"
                                value={p.default}
                                onChange={e => updateParam(i, 'default', parseFloat(e.target.value) || 0)} />
                            )}
                          </div>

                        </div>

                        <button style={s.removeBtn} onClick={() => removeParam(i)} title="Remove parameter">✕</button>
                      </div>
                    ))}

                    <button style={s.addParamBtn} onClick={addParam}>+ Add parameter</button>
                  </div>

                  {/* Code editor — only shown for Python-code templates */}
                  <div style={s.codeSection}>
                    <div style={s.sectionHead}>
                      Python code
                      <span style={s.sectionHint}> — must set <code>blocks = [...]</code></span>
                    </div>
                    <div style={s.codeHint}>
                      Available: <code>S</code>, <code>T</code>, <code>N</code>, <code>CALC_ROW</code>,{' '}
                      <code>MH</code>, <code>CheckContext</code>, <code>math</code>, <code>np</code>
                      {' — '}parameters injected as local variables ({(selected.parameters || []).filter(p => p.name).map(p => p.name).join(', ') || 'none yet'})
                    </div>
                    <textarea
                      style={s.code}
                      value={selected.code || ''}
                      onChange={e => update({ code: e.target.value })}
                      spellCheck={false}
                      rows={16}
                    />
                  </div>
                </>
              )}

              {/* Action bar */}
              <div style={s.actions}>
                <button style={s.testBtn} onClick={handleTest} disabled={testing || !selected.id}>
                  {testing ? '⏳ Running…' : '▶ Test run'}
                </button>
                {!selected.id && (
                  <span style={{ fontSize: 11, color: '#aaa' }}>Save first to test</span>
                )}
                <div style={{ flex: 1 }} />
                {selected.id && (
                  <button style={s.deleteBtn} onClick={handleDelete}>🗑 Delete</button>
                )}
                <button
                  style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : dirty ? '💾 Save *' : '💾 Saved'}
                </button>
              </div>

              {/* Test run output */}
              {(testResult || testError) && (
                <div style={s.testOutput}>
                  <div style={s.testOutputLabel}>Test run output</div>
                  {testError ? (
                    <pre style={s.testError}>{testError}</pre>
                  ) : (
                    <CalcResultView blocks={testResult} />
                  )}
                </div>
              )}

            </div>
          ) : (
            <div style={s.emptyEditor}>
              Select a template on the left, or create a new one.
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#fff',
    width: '92vw', maxWidth: 1100,
    height: '88vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center',
    padding: '14px 20px',
    borderBottom: '1px solid #e8e8e8',
    background: '#fafafa',
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 700, fontSize: 15, flex: 1,
  },
  closeBtn: {
    background: 'none', border: 'none',
    fontSize: 18, cursor: 'pointer', color: '#888',
    padding: '0 4px', fontFamily: 'inherit',
  },
  body: {
    display: 'flex', flex: 1, overflow: 'hidden',
  },

  // ── Left list ──
  list: {
    width: 220, flexShrink: 0,
    borderRight: '1px solid #e8e8e8',
    overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
    padding: '8px 0',
  },
  newBtn: {
    margin: '0 12px 8px',
    background: '#111', color: '#fff',
    border: 'none', padding: '8px 12px',
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  emptyList: {
    padding: '16px 12px',
    fontSize: 11, color: '#aaa', lineHeight: 1.5,
  },
  listItem: {
    display: 'block', width: '100%', textAlign: 'left',
    background: 'none', border: 'none',
    borderLeft: '3px solid transparent',
    padding: '8px 12px',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  listItemActive: {
    background: '#f5f5f7',
    borderLeft: '3px solid #111',
  },
  listItemName: {
    fontSize: 12, fontWeight: 600, color: '#111',
  },
  listItemDesc: {
    fontSize: 10, color: '#aaa', marginTop: 2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },

  // ── Right editor ──
  editor: {
    flex: 1, overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  emptyEditor: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#bbb', fontSize: 13,
  },
  row2: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  label: {
    fontSize: 11, fontWeight: 600, color: '#555', letterSpacing: '0.03em',
  },
  input: {
    border: '1px solid #e0e0e0', padding: '8px 10px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
  },

  // ── Parameters ──
  paramSection: {
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  sectionHead: {
    fontSize: 12, fontWeight: 700, color: '#111',
    paddingBottom: 6, borderBottom: '2px solid #111',
  },
  sectionHint: {
    fontWeight: 400, color: '#888', fontSize: 11,
  },
  // One card per parameter
  paramCard: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    padding: '10px 12px',
    background: '#fafafa',
    border: '1px solid #e8e8e8',
  },
  // Grid of labeled inputs inside the card
  paramGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1.6fr 1.6fr 0.7fr 0.9fr 1.1fr',
    gap: 10,
    alignItems: 'end',
  },
  // Single labeled field inside the card (mirrors Field.jsx)
  paramField: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  paramLabel: {
    fontSize: 11, fontWeight: 700, color: '#555',
    letterSpacing: '0.04em', textTransform: 'uppercase',
    userSelect: 'none',
  },
  paramInput: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  },
  removeBtn: {
    background: 'none', border: '1px solid #f5c6c6',
    color: '#c0392b', cursor: 'pointer',
    fontSize: 11, padding: '5px 8px', fontFamily: 'inherit',
    flexShrink: 0, alignSelf: 'flex-end',
    lineHeight: 1,
  },
  addParamBtn: {
    background: 'none', border: '1px dashed #ccc',
    padding: '7px 14px', fontSize: 12,
    cursor: 'pointer', fontFamily: 'inherit',
    alignSelf: 'flex-start', color: '#666',
  },

  // ── Code ──
  codeSection: {
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  codeHint: {
    fontSize: 11, color: '#888', lineHeight: 1.5,
  },
  code: {
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
    fontSize: 12,
    lineHeight: 1.55,
    border: '1px solid #e0e0e0',
    padding: '10px 12px',
    outline: 'none',
    resize: 'vertical',
    background: '#fafafa',
    color: '#1c1c1e',
    width: '100%',
    boxSizing: 'border-box',
    tabSize: 4,
  },

  // ── Actions ──
  actions: {
    display: 'flex', alignItems: 'center', gap: 10,
    paddingTop: 4,
  },
  testBtn: {
    background: '#f5f5f7', border: '1px solid #e0e0e0',
    padding: '7px 16px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  deleteBtn: {
    background: 'none', border: '1px solid #f5c6c6',
    color: '#c0392b', padding: '7px 14px',
    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  saveBtn: {
    background: '#111', color: '#fff',
    border: 'none', padding: '7px 20px',
    fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },

  // ── Test output ──
  testOutput: {
    border: '1px solid #e8e8e8',
    padding: '12px 14px',
  },
  testOutputLabel: {
    fontSize: 10, fontWeight: 700, color: '#aaa',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    marginBottom: 8,
  },
  testError: {
    background: '#1c1c1e', color: '#ff6b6b',
    padding: '12px 14px',
    fontSize: 11, fontFamily: 'monospace',
    lineHeight: 1.5, overflow: 'auto', margin: 0,
    whiteSpace: 'pre-wrap',
  },
}
