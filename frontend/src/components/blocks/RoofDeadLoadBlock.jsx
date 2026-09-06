/**
 * RoofDeadLoadBlock.jsx — EN 1991-1-1 roof permanent load
 *
 * Computes g_k per rafter [kN/m, horizontal projection] from a user-defined
 * layer table (kN/m² on roof surface) plus rafter self-weight.
 */
import React, { useState, useEffect } from 'react'
import { calcRoofDeadLoad, fetchMaterialDensities } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const DEFAULT_LAYERS = [
  { description: 'Tegltagsten (monier)',        g_kNm2: 0.55 },
  { description: 'Lægte + kontralägte (38 mm)', g_kNm2: 0.04 },
  { description: 'Undertag (vindspærrepap)',     g_kNm2: 0.03 },
  { description: 'Krydsfinérsarking 12 mm',     g_kNm2: 0.07 },
  { description: 'Isolering 200 mm (glasuld)',   g_kNm2: 0.04 },
  { description: 'Dampspærre',                  g_kNm2: 0.01 },
]

export default function RoofDeadLoadBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  const layers = d.layers ?? DEFAULT_LAYERS

  // EN 1991-1-1 bilag A. Hentes én gang; feltet virker uden den, man skriver
  // bare fladelasten selv som før.
  const [materials, setMaterials] = useState(null)
  useEffect(() => {
    let alive = true
    fetchMaterialDensities()
      .then(res => { if (alive) setMaterials(res.groups) })
      .catch(() => { if (alive) setMaterials([]) })
    return () => { alive = false }
  }, [])

  const byKey = {}
  for (const g of materials ?? []) for (const m of g.materials) byKey[m.key] = m

  // g = γ·t. Regnes også her, så totalen nedenfor er rigtig før man kører.
  function layerLoad(l) {
    if (l.material && l.thickness_mm != null) {
      const m = byKey[l.material]
      const gamma = l.density_kNm3 ?? m?.default_kNm3
      if (gamma != null) return gamma * l.thickness_mm / 1000
    }
    return l.g_kNm2 ?? 0
  }

  function pickMaterial(i, key) {
    if (!key) {
      // Tilbage til direkte indtastning — behold det tal, der stod.
      updateLayer(i, { material: null, thickness_mm: null, density_kNm3: null,
                       g_kNm2: layerLoad(layers[i]) })
      return
    }
    const m = byKey[key]
    updateLayer(i, {
      material: key,
      thickness_mm: layers[i].thickness_mm ?? 0,
      density_kNm3: null,
      description: layers[i].description || m?.name || '',
    })
  }

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  function updateLayer(i, changes) {
    const next = layers.map((l, j) => j === i ? { ...l, ...changes } : l)
    update({ layers: next })
  }

  function addLayer() {
    update({ layers: [...layers, { description: '', g_kNm2: 0.0 }] })
  }

  function removeLayer(i) {
    update({ layers: layers.filter((_, j) => j !== i) })
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const res = await calcRoofDeadLoad({
        title:     d.title     ?? 'Roof Dead Load',
        label:     d.label     ?? 'G1',
        alpha_deg: d.alpha_deg ?? 30.0,
        a_m:       d.a_m       ?? 1.0,
        layers:    layers,
        b_mm:      d.b_mm      ?? 45.0,
        h_mm:      d.h_mm      ?? 145.0,
        rho_kgm3:  d.rho_kgm3  ?? 380.0,
      })
      update({ _result: res._result })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const g_tag = layers.reduce((s, l) => s + layerLoad(l), 0)

  return (
    <CalcBlockShell
      title={d.title ?? 'Tagets egenlast'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <div style={s.row}>
        <Field label="Betegnelse">
          <input style={s.input} value={d.label ?? 'G1'}
            onChange={e => update({ label: e.target.value })} />
        </Field>
        <Field label="Taghældning (°)" hint="α">
          <NumericInput style={s.input} value={d.alpha_deg ?? 30.0}
            onChange={v => update({ alpha_deg: v })} />
        </Field>
        <Field label="Spærafstand (m)" hint="c/c">
          <NumericInput style={s.input} value={d.a_m ?? 1.0}
            onChange={v => update({ a_m: v })} />
        </Field>
      </div>

      {/* Layer table */}
      <div style={s.tableWrap}>
        <div style={s.tableHeader}>
          <span>Lag i tagopbygningen</span>
        </div>
        {layers.map((l, i) => {
          const chosen = l.material ? byKey[l.material] : null
          return (
            <div key={i} style={s.layerCard}>
              <div style={s.tableRow}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={l.description}
                  placeholder="fx tegltagsten"
                  onChange={e => updateLayer(i, { description: e.target.value })}
                />
                <button style={s.removeBtn} onClick={() => removeLayer(i)}>✕</button>
              </div>
              {/* Materialevaelgeren faar sin egen linje. Ved siden af to
                  talfelter i et 320 px panel bliver den klemt til en pil
                  uden tekst, og saa kan man ikke se hvad man har valgt. */}
              <select
                style={{ ...s.input, width: '100%', marginBottom: 4 }}
                value={l.material ?? ''}
                onChange={e => pickMaterial(i, e.target.value)}
              >
                <option value="">— indtast last selv —</option>
                {(materials ?? []).map(g => (
                  <optgroup key={g.table} label={`Tabel ${g.table} — ${g.title}`}>
                    {g.materials.map(m => (
                      <option key={m.key} value={m.key}>
                        {m.name} · {m.is_range
                          ? `${m.min_kNm3}–${m.max_kNm3}`
                          : m.default_kNm3} kN/m³
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div style={s.tableRow}>
                {chosen ? (
                  <>
                    <span style={s.enhed}>t</span>
                    <NumericInput
                      style={{ ...s.input, width: 62, textAlign: 'right' }}
                      value={l.thickness_mm ?? 0}
                      onChange={v => updateLayer(i, { thickness_mm: v })}
                    />
                    <span style={s.enhed}>mm</span>
                    <span style={s.lig}>=</span>
                    <span style={s.derived}>{layerLoad(l).toFixed(3)}</span>
                    <span style={s.enhed}>kN/m²</span>
                  </>
                ) : (
                  <>
                    <span style={s.enhed}>g_k</span>
                    <NumericInput
                      style={{ ...s.input, width: 78, textAlign: 'right' }}
                      value={l.g_kNm2}
                      onChange={v => updateLayer(i, { g_kNm2: v })}
                    />
                    <span style={s.enhed}>kN/m² af tagfladen</span>
                  </>
                )}
              </div>
              {chosen && (
                <div style={s.layerHint}>
                  {`${l.density_kNm3 ?? chosen.default_kNm3} kN/m³ · ${chosen.table}`}
                </div>
              )}
            </div>
          )
        })}
        <div style={s.tableRow}>
          <span style={{ flex: 3, fontWeight: 600, fontSize: 12, color: '#374151' }}>
            I alt  g_tag
          </span>
          <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 12 }}>
            {g_tag.toFixed(3)} kN/m²
          </span>
          <span style={{ width: 28 }} />
        </div>
        <button style={s.addBtn} onClick={addLayer}>+ Tilføj lag</button>
      </div>

      {/* Rafter self-weight */}
      <div style={s.sectionLabel}>Spærets egenlast</div>
      <div style={s.row}>
        <Field label="Spær, bredde (mm)">
          <NumericInput style={s.input} value={d.b_mm ?? 45.0}
            onChange={v => update({ b_mm: v })} />
        </Field>
        <Field label="Spær, højde (mm)">
          <NumericInput style={s.input} value={d.h_mm ?? 145.0}
            onChange={v => update({ h_mm: v })} />
        </Field>
        <Field label="Densitet (kg/m³)">
          <NumericInput style={s.input} value={d.rho_kgm3 ?? 380.0}
            onChange={v => update({ rho_kgm3: v })} />
        </Field>
      </div>
    </CalcBlockShell>
  )
}

const s = {
  row: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  tableWrap: { marginBottom: 8 },
  tableHeader: {
    display: 'flex', gap: 6, alignItems: 'center',
    fontSize: 11, color: '#6b7280', fontWeight: 600,
    padding: '2px 4px', borderBottom: '1px solid #e5e7eb', marginBottom: 2,
  },
  tableRow: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 },
  layerCard: {
    border: '1px solid #eee', borderRadius: 4, padding: '6px 6px 4px',
    marginBottom: 6,
  },
  layerHint: { fontSize: 10, color: '#6b7280', paddingTop: 3 },
  enhed: { fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' },
  lig:   { fontSize: 12, color: '#9ca3af', padding: '0 2px' },
  derived: {
    fontSize: 12, color: '#111827', fontWeight: 600, whiteSpace: 'nowrap',
  },
  removeBtn: {
    width: 22, height: 22, border: 'none', background: 'none',
    cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    marginTop: 4, border: '1px dashed #d1d5db', background: 'none',
    cursor: 'pointer', fontSize: 12, color: '#6b7280', padding: '4px 10px',
    borderRadius: 4,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: 4, marginTop: 4,
  },
}
