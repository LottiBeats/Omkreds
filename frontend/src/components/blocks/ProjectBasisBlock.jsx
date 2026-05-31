/**
 * ProjectBasisBlock — A1 project basis parameters
 *
 * Stores consequence class, wind/snow zones, terrain category and partial
 * factors in one place.  Every field change instantly updates _exports so
 * downstream blocks can read these values without re-entry.
 *
 * No backend call required — all logic is client-side.
 */
import React from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const CC_MAP = {
  CC1: { rc: 'RC1', kk: 'KK1', kfi: 0.9 },
  CC2: { rc: 'RC2', kk: 'KK2', kfi: 1.0 },
  CC3: { rc: 'RC3', kk: 'KK3', kfi: 1.1 },
}

// ── Tiny style helpers ────────────────────────────────────────────────────────

const s = {
  wrapper:   { fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif", fontSize: 13 },
  section:   { marginBottom: 18 },
  label:     { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
               letterSpacing: '0.06em', marginBottom: 8 },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px 16px' },
  field:     { display: 'flex', flexDirection: 'column', gap: 3 },
  fieldLabel:{ fontSize: 11, color: '#475569' },
  input:     { border: '1px solid #d1d5db', borderRadius: 3, padding: '4px 7px', fontSize: 13,
               fontFamily: 'inherit', background: '#fff' },
  select:    { border: '1px solid #d1d5db', borderRadius: 3, padding: '4px 7px', fontSize: 13,
               fontFamily: 'inherit', background: '#fff' },
  derived:   { fontSize: 12, color: '#1e3a5f', fontWeight: 700, padding: '4px 0' },
  divider:   { border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' },
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={s.field}>
      <span style={s.fieldLabel}>{label}</span>
      {children}
    </div>
  )
}

function NumInput({ value, onChange, step = 0.01, min }) {
  return (
    <input
      type="number"
      style={s.input}
      value={value ?? ''}
      step={step}
      min={min}
      onChange={e => onChange(parseFloat(e.target.value))}
    />
  )
}

// ── Main block ────────────────────────────────────────────────────────────────

export default function ProjectBasisBlock({ block, onChange }) {
  const d = block.data

  function update(changes) {
    const nd = { ...d, ...changes }
    const cc  = nd.consequence_class ?? 'CC2'
    const cfg = CC_MAP[cc] ?? CC_MAP.CC2
    onChange({
      ...block,
      data: {
        ...nd,
        _exports: {
          consequence_class: cc,
          reliability_class: cfg.rc,
          construction_class: cfg.kk,
          KFI:              cfg.kfi,
          wind_zone:        nd.wind_zone        ?? 2,
          terrain_category: nd.terrain_category ?? 'II',
          snow_zone:        nd.snow_zone        ?? 1,
          gamma_M0:         nd.gamma_M0         ?? 1.00,
          gamma_M1:         nd.gamma_M1         ?? 1.00,
          gamma_M2:         nd.gamma_M2         ?? 1.25,
          gamma_c:          nd.gamma_c          ?? 1.50,
          gamma_s:          nd.gamma_s          ?? 1.15,
          gamma_M_timber:   nd.gamma_M_timber   ?? 1.30,
        },
      },
    })
  }

  const cc  = d.consequence_class ?? 'CC2'
  const cfg = CC_MAP[cc] ?? CC_MAP.CC2

  return (
    <div style={s.wrapper}>

      {/* ── Safety classification ── */}
      <div style={s.section}>
        <div style={s.label}>Safety classification</div>
        <div style={s.grid}>
          <Field label="Consequence class">
            <select style={s.select} value={cc} onChange={e => update({ consequence_class: e.target.value })}>
              <option value="CC1">CC1 — Low</option>
              <option value="CC2">CC2 — Medium</option>
              <option value="CC3">CC3 — High</option>
            </select>
          </Field>
          <Field label="Reliability class (auto)">
            <div style={s.derived}>{cfg.rc}</div>
          </Field>
          <Field label="Construction class (auto)">
            <div style={s.derived}>{cfg.kk}</div>
          </Field>
          <Field label="K_FI factor (auto)">
            <div style={s.derived}>{cfg.kfi.toFixed(1)}</div>
          </Field>
        </div>
      </div>

      <hr style={s.divider} />

      {/* ── Climate parameters ── */}
      <div style={s.section}>
        <div style={s.label}>Climate parameters (DK)</div>
        <div style={s.grid}>
          <Field label="Wind zone (1–4)">
            <select style={s.select}
              value={d.wind_zone ?? 2}
              onChange={e => update({ wind_zone: parseInt(e.target.value) })}>
              <option value={1}>Zone 1 — v_b0 = 22 m/s</option>
              <option value={2}>Zone 2 — v_b0 = 24 m/s</option>
              <option value={3}>Zone 3 — v_b0 = 27 m/s</option>
              <option value={4}>Zone 4 — v_b0 = 27+ m/s (Bornholm)</option>
            </select>
          </Field>
          <Field label="Terrain category">
            <select style={s.select}
              value={d.terrain_category ?? 'II'}
              onChange={e => update({ terrain_category: e.target.value })}>
              <option value="0">0 — Sea / open water</option>
              <option value="I">I — Open flat (airports)</option>
              <option value="II">II — Fields, low hedges (normal)</option>
              <option value="III">III — Suburban, forests</option>
              <option value="IV">IV — Dense urban</option>
            </select>
          </Field>
          <Field label="Snow zone (DK)">
            <select style={s.select}
              value={d.snow_zone ?? 1}
              onChange={e => update({ snow_zone: parseInt(e.target.value) })}>
              <option value={1}>Zone 1 — s_k = 0.9 kN/m² (Sjælland, Fyn)</option>
              <option value={2}>Zone 2 — s_k = 1.0 kN/m² (East Jutland)</option>
              <option value={3}>Zone 3 — s_k = 1.1 kN/m² (West Jutland)</option>
              <option value={4}>Zone 4 — s_k = 1.5 kN/m² (Bornholm / elevated)</option>
            </select>
          </Field>
        </div>
      </div>

      <hr style={s.divider} />

      {/* ── Partial factors ── */}
      <div style={s.section}>
        <div style={s.label}>Partial factors</div>
        <div style={s.grid}>
          <Field label="γ_M0 — Steel yield (EC3)">
            <NumInput value={d.gamma_M0 ?? 1.00} onChange={v => update({ gamma_M0: v })} step={0.05} min={0} />
          </Field>
          <Field label="γ_M1 — Steel buckling (EC3)">
            <NumInput value={d.gamma_M1 ?? 1.00} onChange={v => update({ gamma_M1: v })} step={0.05} min={0} />
          </Field>
          <Field label="γ_M2 — Steel connections (EC3)">
            <NumInput value={d.gamma_M2 ?? 1.25} onChange={v => update({ gamma_M2: v })} step={0.05} min={0} />
          </Field>
          <Field label="γ_c — Concrete (EC2)">
            <NumInput value={d.gamma_c ?? 1.50} onChange={v => update({ gamma_c: v })} step={0.05} min={0} />
          </Field>
          <Field label="γ_s — Reinforcement (EC2)">
            <NumInput value={d.gamma_s ?? 1.15} onChange={v => update({ gamma_s: v })} step={0.05} min={0} />
          </Field>
          <Field label="γ_M — Timber (EC5)">
            <NumInput value={d.gamma_M_timber ?? 1.30} onChange={v => update({ gamma_M_timber: v })} step={0.05} min={0} />
          </Field>
        </div>
      </div>

    </div>
  )
}
