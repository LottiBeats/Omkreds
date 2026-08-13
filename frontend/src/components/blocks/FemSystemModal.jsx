/**
 * FemSystemModal.jsx — vælg et statisk system i stedet for at taste koordinater
 *
 * Geometrien tegnes mens der skrues på målene, så man ser konstruktionen før
 * den indsættes — ikke en liste med knude 3 på (1,8 · 1,2).
 *
 * Tværsnittet vælges pr. gruppe (spær, hanebånd, søjler, rigel) og lægges på
 * som en *reference*. Det er den eneste grund til at gruppen findes: et element
 * med rå E/A/I har intet materiale, og eftervisningen der genereres fra det
 * falder tilbage på stål.
 */
import React, { useMemo, useState } from 'react'
import { FEM_SYSTEMS, defaultParams, buildSystem, validateParams } from '../../templates/femSystems.js'
import ModelSketch from './ModelSketch.jsx'

const BRAND = '#d94a2b'

const MATERIALS = [
  { key: 'timber', label: 'Træ',  grades: ['C18', 'C24', 'C30', 'GL24c', 'GL24h', 'GL28c', 'GL28h', 'GL30c'] },
  { key: 'steel',  label: 'Stål', grades: ['S235', 'S275', 'S355', 'S420'] },
]
const STEEL_SECTIONS = [
  'IPE200', 'IPE240', 'IPE270', 'IPE300', 'IPE360', 'IPE400', 'IPE450', 'IPE500',
  'HEA200', 'HEA300', 'HEB200', 'HEB300',
]

const emptySection = () => ({ material: 'timber', section: '45x145', grade: 'C24' })


function SectionPicker({ label, value, onChange }) {
  const mat = value.material ?? 'timber'
  const grades = MATERIALS.find(m => m.key === mat)?.grades ?? []

  function setMaterial(key) {
    onChange(key === 'steel'
      ? { material: 'steel',  section: 'IPE300',  grade: 'S355' }
      : { material: 'timber', section: '45x145',  grade: 'C24'  })
  }

  return (
    <div style={S.secRow}>
      <div style={S.secLabel}>{label}</div>
      <select style={S.input} value={mat} onChange={e => setMaterial(e.target.value)}>
        {MATERIALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      {mat === 'steel' ? (
        <select style={S.input} value={value.section}
                onChange={e => onChange({ ...value, section: e.target.value })}>
          {STEEL_SECTIONS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      ) : (
        <input style={{ ...S.input, width: 96 }} value={value.section}
               placeholder="b×h i mm"
               onChange={e => onChange({ ...value, section: e.target.value })} />
      )}
      <select style={S.input} value={value.grade}
              onChange={e => onChange({ ...value, grade: e.target.value })}>
        {grades.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
    </div>
  )
}


export default function FemSystemModal({ onInsert, onClose, hasModel = false }) {
  const [key, setKey]         = useState(FEM_SYSTEMS[0].key)
  const [params, setParams]   = useState(() => defaultParams(FEM_SYSTEMS[0].key))
  const [sections, setSections] = useState({})

  const system = FEM_SYSTEMS.find(s => s.key === key)

  function pick(k) {
    setKey(k)
    setParams(defaultParams(k))
    setSections({})
  }

  const sectionFor = (g) => sections[g] ?? emptySection()

  // Rebuilt on every change — it is a few dozen nodes, not a mesh.
  const model = useMemo(() => {
    try {
      return buildSystem(key, params,
        Object.fromEntries((system?.groups ?? []).map(g => [g.key, sectionFor(g.key)])))
    } catch { return null }
  }, [key, params, sections])   // eslint-disable-line

  const bad = (system?.params ?? []).some(p =>
    p.type !== 'bool' && !Number.isFinite(Number(params[p.key])))
  const complaint = bad ? null : validateParams(key, params)
  const blocked = bad || (complaint && complaint.startsWith('Hanebåndet skal'))

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        <div style={S.header}>
          <div>
            <div style={S.title}>Statisk system</div>
            <div style={S.subtitle}>
              Geometri, understøtninger og charnierer genereres ud fra målene
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          <div style={S.list}>
            {FEM_SYSTEMS.map(s => {
              const on = s.key === key
              return (
                <button key={s.key} onClick={() => pick(s.key)}
                        style={{ ...S.card,
                                 borderColor: on ? BRAND : '#e5e7eb',
                                 background:  on ? '#fffaf8' : '#fff' }}>
                  <div style={S.cardTitle}>{s.label}</div>
                  <div style={S.cardHint}>{s.hint}</div>
                </button>
              )
            })}
          </div>

          <div style={S.right}>
            <div style={S.params}>
              {(system?.params ?? []).map(p => (
                <div key={p.key} style={S.param}>
                  <label style={S.paramLabel}>
                    {p.label}{p.unit ? ` [${p.unit}]` : ''}
                  </label>
                  {p.type === 'bool' ? (
                    <label style={S.checkRow}>
                      <input type="checkbox" checked={!!params[p.key]}
                             onChange={e => setParams({ ...params, [p.key]: e.target.checked })} />
                      <span style={S.paramHint}>{p.hint}</span>
                    </label>
                  ) : (
                    <>
                      <input style={S.input} type="number"
                             min={p.min} max={p.max} step={p.step ?? 0.1}
                             value={params[p.key]}
                             onChange={e => setParams({
                               ...params,
                               [p.key]: p.int ? Math.round(Number(e.target.value))
                                              : Number(e.target.value),
                             })} />
                      {p.hint && <span style={S.paramHint}>{p.hint}</span>}
                    </>
                  )}
                </div>
              ))}
            </div>

            {(system?.groups ?? []).map(g => (
              <SectionPicker key={g.key} label={g.label}
                             value={sectionFor(g.key)}
                             onChange={v => setSections({ ...sections, [g.key]: v })} />
            ))}

            <div style={S.preview}>
              {model && !bad
                ? <ModelSketch nodes={model.nodes} elements={model.elements}
                               supports={model.supports} equalDofs={model.equal_dofs} />
                : <div style={S.badParams}>Udfyld målene for at se systemet</div>}
            </div>

            {complaint && <div style={S.complaint}>{complaint}</div>}

            {model && !bad && (
              <div style={S.counts}>
                {model.nodes.length} knuder · {model.elements.length} elementer ·{' '}
                {model.supports.length} understøtninger
                {model.equal_dofs?.length
                  ? ` · ${model.equal_dofs.length} charnier` : ''}
                {'  —  opdelingen sker automatisk, så nedbøjningen aflæses inde i fagene'}
              </div>
            )}
          </div>
        </div>

        <div style={S.footer}>
          {hasModel && (
            <span style={S.warn}>Erstatter den nuværende model</span>
          )}
          <span style={{ flex: 1 }} />
          <button style={S.cancel} onClick={onClose}>Annullér</button>
          <button style={{ ...S.apply, opacity: model && !blocked ? 1 : 0.5,
                           cursor: model && !blocked ? 'pointer' : 'default' }}
                  disabled={!model || blocked}
                  onClick={() => model && onInsert(model, system.label)}>
            Indsæt system →
          </button>
        </div>

      </div>
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2400,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    width: 'min(880px, 96vw)', maxHeight: '92vh', background: '#fff',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.35)', borderTop: `3px solid ${BRAND}`,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '16px 20px 12px', borderBottom: '1px solid #e5e7eb',
  },
  title:    { fontSize: 15, fontWeight: 700, color: '#1c1c1e' },
  subtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 15, cursor: 'pointer',
    color: '#64748b', fontFamily: 'inherit', padding: 4,
  },
  body: {
    display: 'flex', gap: 16, padding: '14px 20px', overflowY: 'auto',
    alignItems: 'flex-start', flexWrap: 'wrap',
  },
  list:  { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 210px', minWidth: 200 },
  right: { flex: '2 1 380px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    border: '1px solid #e5e7eb', padding: '9px 12px', textAlign: 'left',
    fontFamily: 'inherit', cursor: 'pointer', width: '100%',
  },
  cardTitle: { fontSize: 12.5, fontWeight: 700, color: '#1c1c1e' },
  cardHint:  { fontSize: 11, color: '#94a3b8', marginTop: 2, lineHeight: 1.5 },
  params: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  param:  { display: 'flex', flexDirection: 'column', gap: 3 },
  paramLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: '#64748b',
  },
  paramHint: { fontSize: 10.5, color: '#94a3b8', lineHeight: 1.5, maxWidth: 230 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingTop: 4 },
  input: {
    padding: '6px 8px', fontSize: 12.5, fontFamily: 'inherit',
    border: '1px solid #e2e8f0', background: '#fff', width: 110,
  },
  secRow: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    borderTop: '1px solid #f1f5f9', paddingTop: 8,
  },
  secLabel: {
    fontSize: 11, fontWeight: 700, color: '#475569', width: 74, flexShrink: 0,
  },
  preview:   { marginTop: 2 },
  badParams: {
    border: '1px dashed #e0e0e0', background: '#fcfcfb', padding: '28px 12px',
    fontSize: 12, color: '#bbb', textAlign: 'center',
  },
  counts: { fontSize: 10.5, color: '#94a3b8', lineHeight: 1.6 },
  complaint: {
    background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '3px solid #c2410c',
    color: '#c2410c', fontSize: 11.5, padding: '7px 10px', lineHeight: 1.5,
  },
  footer: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 20px', borderTop: '1px solid #e5e7eb',
  },
  warn:   { fontSize: 11.5, color: '#c2410c' },
  cancel: {
    background: 'none', border: '1px solid #e5e7eb', padding: '8px 16px',
    fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', color: '#64748b',
  },
  apply: {
    background: BRAND, color: '#fff', border: 'none', padding: '8px 18px',
    fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  },
}
