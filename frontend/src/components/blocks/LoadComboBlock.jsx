/**
 * LoadComboBlock.jsx — EN 1990 load combination calculator (Danish NA)
 *
 * Input: permanent G_k + list of variable actions with category.
 * Output: ULS/SLS design values.
 */
import React, { useState } from 'react'
import { calcLoadCombo } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const CATEGORIES = [
  { value: 'A', label: 'A — Domestic/residential' },
  { value: 'B', label: 'B — Office areas' },
  { value: 'C', label: 'C — Congregation areas' },
  { value: 'D', label: 'D — Shopping areas' },
  { value: 'E', label: 'E — Storage' },
  { value: 'F', label: 'F — Traffic ≤ 30 kN' },
  { value: 'G', label: 'G — Traffic 30–160 kN' },
  { value: 'H', label: 'H — Roof (not accessible)' },
  { value: 'S', label: 'S — Snow (DK)' },
  { value: 'W', label: 'W — Wind' },
  { value: 'T', label: 'T — Temperature' },
]

const CONSEQUENCE_CLASSES = [
  { value: 'CC1', label: 'CC1  (K_FI = 0.9) — Low consequence' },
  { value: 'CC2', label: 'CC2  (K_FI = 1.0) — Normal buildings' },
  { value: 'CC3', label: 'CC3  (K_FI = 1.1) — High consequence' },
]

export default function LoadComboBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  function setLoad(i, field, value) {
    const loads = [...(d.loads ?? [])]
    loads[i] = { ...loads[i], [field]: value }
    update({ loads })
  }

  function addLoad() {
    const loads = [...(d.loads ?? []), { label: `Q${(d.loads?.length ?? 0) + 1}`, Q_k: 2.0, category: 'B' }]
    update({ loads })
  }

  function removeLoad(i) {
    const loads = (d.loads ?? []).filter((_, j) => j !== i)
    update({ loads })
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const list = await calcLoadCombo({
        label:             d.label             ?? 'LC1',
        unit:              d.unit              ?? 'kN/m',
        G_k:               d.G_k               ?? 5.0,
        G_fav:             d.G_fav             ?? false,
        loads:             d.loads             ?? [],
        method:            d.method            ?? '6.10ab',
        consequence_class: d.consequence_class ?? 'CC2',
        A_d:               d.A_d               ?? 0.0,
        accidental_type:   d.accidental_type   ?? 'none',
      })
      // Backend returns a flat list; first element is a synthetic
      // {type:'_exports', exports:{...}} sentinel — extract it so
      // downstream steel/timber beam blocks can read E_d_uls + governing_duration.
      const sentinel = list.find(b => b.type === '_exports')
      const blocks   = list.filter(b => b.type !== '_exports')
      update({ _result: blocks, _exports: sentinel?.exports ?? null })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <CalcBlockShell
      title={d.title ?? 'Load Combinations'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
      runLabel="▶  Beregn"
    >
      {/* Row 1: label, unit, method */}
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'LC1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Unit">
        <input style={s.input} value={d.unit ?? 'kN/m'}
          placeholder="kN/m"
          onChange={e => update({ unit: e.target.value })} />
      </Field>
      <Field label="Method">
        <select style={s.input} value={d.method ?? '6.10ab'}
          onChange={e => update({ method: e.target.value })}>
          <option value="6.10ab">6.10a / 6.10b  (DK NA)</option>
          <option value="6.10">6.10  (conservative)</option>
        </select>
      </Field>
      <Field label="Consequence class" hint="K_FI">
        <select style={s.input} value={d.consequence_class ?? 'CC2'}
          onChange={e => update({ consequence_class: e.target.value })}>
          {CONSEQUENCE_CLASSES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </Field>

      {/* Permanent load */}
      <Field label="G_k  (permanent)" hint={d.unit ?? 'kN/m'}>
        <NumericInput style={s.input} value={d.G_k ?? 5.0}
          onChange={v => update({ G_k: v })} />
      </Field>
      <Field label="G favourable?">
        <label style={s.checkLabel}>
          <input type="checkbox" checked={!!d.G_fav}
            onChange={e => update({ G_fav: e.target.checked })} />
          {' '}Use γ_G = 1.0
        </label>
      </Field>

      {/* Accidental load */}
      <Field label="A_d  (accidental)" hint={d.unit ?? 'kN/m'}>
        <NumericInput style={s.input} value={d.A_d ?? 0.0}
          onChange={v => update({ A_d: v })} />
      </Field>
      {(d.A_d ?? 0) > 0 && (
        <Field label="Accident type">
          <select style={s.input} value={d.accidental_type ?? 'none'}
            onChange={e => update({ accidental_type: e.target.value })}>
            <option value="none">None</option>
            <option value="fire">Fire  (ψ₁ for lead)</option>
            <option value="other">Other accident  (ψ₂ for all)</option>
          </select>
        </Field>
      )}

      {/* Variable loads table */}
      <div style={{ gridColumn: '1/-1' }}>
        <div style={s.loadSectionLabel}>Variable actions</div>

        {(d.loads ?? []).length > 0 && (
          <div style={s.loadTable}>
            <div style={s.loadHeader}>
              {['Label', 'Q_k', 'Category', ''].map(h => (
                <div key={h} style={s.loadHeaderCell}>{h}</div>
              ))}
            </div>
            {(d.loads ?? []).map((load, i) => (
              <div key={i} style={s.loadRow}>
                <input style={s.loadInput} value={load.label ?? ''}
                  placeholder={`Q${i + 1}`}
                  onChange={e => setLoad(i, 'label', e.target.value)} />
                <NumericInput style={s.loadInput}
                  value={load.Q_k ?? 0}
                  onChange={v => setLoad(i, 'Q_k', v)} />
                <select style={s.loadInput} value={load.category ?? 'B'}
                  onChange={e => setLoad(i, 'category', e.target.value)}>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <button style={s.removeBtn} onClick={() => removeLoad(i)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <button style={s.addBtn} onClick={addLoad}>+ Add variable action</button>
      </div>
    </CalcBlockShell>
  )
}

const s = {
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  checkLabel: {
    fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 0', cursor: 'pointer',
  },
  loadSectionLabel: {
    fontSize: 11, fontWeight: 700, color: '#555',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    marginBottom: 6,
  },
  loadTable: {
    border: '1px solid #e8e8e8', marginBottom: 6,
  },
  loadHeader: {
    display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 2fr 28px',
    gap: 1, background: '#f5f5f7', padding: '4px 8px',
  },
  loadHeaderCell: {
    fontSize: 10, fontWeight: 700, color: '#888',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  loadRow: {
    display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 2fr 28px',
    gap: 4, padding: '4px 8px', borderTop: '1px solid #f0f0f0',
    alignItems: 'center',
  },
  loadInput: {
    border: '1px solid #e8e8e8', padding: '5px 6px',
    fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  removeBtn: {
    background: 'none', border: 'none',
    color: '#ccc', cursor: 'pointer', fontSize: 12,
    padding: '2px 4px',
  },
  addBtn: {
    background: 'none', border: '1px dashed #ccc',
    padding: '5px 12px', fontSize: 12,
    cursor: 'pointer', fontFamily: 'inherit', color: '#666',
  },
}
