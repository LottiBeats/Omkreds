/**
 * SavedCalcBlock.jsx — user-defined calculation template block
 *
 * Fetches the template definition on mount, renders its parameters as
 * labelled inputs (exactly like the built-in blocks), and runs the
 * template's Python code on the backend.
 */
import React, { useState, useEffect } from 'react'
import { getCalcTemplate, runCalcTemplate } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

export default function SavedCalcBlock({ block, onChange, onOpenTemplateEditor }) {
  const d = block.data

  const [tmpl,    setTmpl]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  // Fetch template definition whenever template_id changes
  useEffect(() => {
    if (!d.template_id) {
      setLoading(false)
      return
    }
    setLoading(true)
    getCalcTemplate(d.template_id)
      .then(t => { setTmpl(t); setLoading(false) })
      .catch(() => { setTmpl(null); setLoading(false) })
  }, [d.template_id])

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  function setParam(name, value) {
    update({ params: { ...(d.params ?? {}), [name]: value } })
  }

  async function handleRun() {
    if (!tmpl) return
    setRunning(true)
    setError(null)
    try {
      // Merge stored param values over template defaults
      const merged = {}
      for (const p of (tmpl.parameters || [])) {
        const stored = d.params?.[p.name]
        merged[p.name] = stored !== undefined ? stored : p.default
      }
      const blocks = await runCalcTemplate(d.template_id, merged)
      update({ _result: blocks })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  // ── States ────────────────────────────────────────────────────────────────

  if (!d.template_id) {
    return (
      <div style={s.noTemplate}>
        No template linked. Delete this block and add a new one from "My Calculations".
      </div>
    )
  }

  if (loading) {
    return <div style={s.loading}>Loading template…</div>
  }

  if (!tmpl) {
    return (
      <div style={s.noTemplate}>
        Template not found (it may have been deleted).
        <br />
        <span style={{ color: '#aaa', fontSize: 11 }}>ID: {d.template_id}</span>
      </div>
    )
  }

  const params = d.params ?? {}

  return (
    <CalcBlockShell
      title={d.title ?? tmpl.name}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >

      {/* Template badge + edit link */}
      <div style={{ gridColumn: '1/-1', ...s.badge }}>
        <span style={s.badgeIcon}>⚙</span>
        <span style={s.badgeName}>{tmpl.name}</span>
        {onOpenTemplateEditor && (
          <button
            style={s.editLink}
            onClick={() => onOpenTemplateEditor(tmpl.id)}
          >
            Edit template ✏
          </button>
        )}
      </div>

      {/* Dynamic parameter inputs */}
      {(tmpl.parameters || []).map(param => {
        const val = params[param.name] !== undefined ? params[param.name] : param.default
        return (
          <Field
            key={param.name}
            label={param.label || param.name}
            hint={param.unit || ''}
          >
            {param.type === 'select' ? (
              <select
                style={s.input}
                value={val ?? ''}
                onChange={e => setParam(param.name, e.target.value)}
              >
                {(param.options || []).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                style={s.input}
                type="number"
                step={param.step ?? 'any'}
                min={param.min ?? undefined}
                max={param.max ?? undefined}
                value={val ?? ''}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  setParam(param.name, isNaN(v) ? e.target.value : v)
                }}
              />
            )}
          </Field>
        )
      })}

      {(tmpl.parameters || []).length === 0 && (
        <div style={{ gridColumn: '1/-1', color: '#aaa', fontSize: 12, fontStyle: 'italic' }}>
          No parameters defined. Open the template editor to add inputs.
        </div>
      )}

    </CalcBlockShell>
  )
}

const s = {
  loading: {
    padding: '20px 0',
    fontSize: 12,
    color: '#aaa',
  },
  noTemplate: {
    padding: '16px 12px',
    background: '#fdf3f2',
    border: '1px solid #f5c6c6',
    fontSize: 12,
    color: '#c0392b',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 8px',
    background: '#f5f5f7',
    border: '1px solid #e8e8e8',
    fontSize: 11,
    marginBottom: 2,
  },
  badgeIcon: {
    fontSize: 12,
  },
  badgeName: {
    fontWeight: 600,
    color: '#555',
    flex: 1,
  },
  editLink: {
    background: 'none',
    border: 'none',
    fontSize: 11,
    color: '#888',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
  },
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
}
