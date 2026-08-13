/**
 * A1OptionsModal.jsx — describe the project before generating A1
 *
 * A1 Konstruktionsgrundlag varies more between projects than any other
 * document. Rather than emitting everything and asking the engineer to delete
 * two thirds of it, we ask six questions and generate what applies.
 *
 * The consequence class is *suggested* live from DS/INF 1990:2024 Table 2 as
 * the numbers are typed, with the reasoning shown — the standard is a guideline
 * and the engineer's judgement governs, so the suggestion has to be arguable,
 * not just asserted.
 */
import { useMemo, useState } from 'react'
import {
  ANVENDELSER, KONSTRUKTIONSTYPER, MATERIALER, DEFAULT_OPTIONS, suggestCC,
} from '../templates/a1.js'

const BRAND = '#d94a2b'

export default function A1OptionsModal({ metadata = {}, initial, docId = 'A1', onGenerate, onClose }) {
  // A project describes itself once. If A1 has already been generated, B1
  // starts from the same answers — that is what keeps the two documents from
  // stating different consequence classes.
  const [o, setO] = useState(() => ({
    ...DEFAULT_OPTIONS,
    ...(initial || {}),
    materialer: { ...DEFAULT_OPTIONS.materialer, ...(initial?.materialer || {}) },
  }))
  const reused = !!initial

  const set   = (k, v) => setO(prev => ({ ...prev, [k]: v }))
  const setNum = (k, v) => set(k, v === '' ? '' : Number(v))
  const toggleMat = (key) =>
    setO(prev => ({ ...prev, materialer: { ...prev.materialer, [key]: !prev.materialer[key] } }))

  const { cc, begrundelse } = useMemo(() => suggestCC(o), [o])
  const valgteMaterialer = MATERIALER.filter(m => o.materialer[m.key])

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        <div style={S.header}>
          <div>
            <div style={S.title}>
              {docId === 'B1' ? 'B1 Statisk projektredegørelse' : 'A1 Konstruktionsgrundlag'}
            </div>
            <div style={S.subtitle}>
              {reused
                ? 'Beskrivelsen er hentet fra projektet — ret den, hvis noget har ændret sig'
                : 'Beskriv projektet — så genereres kun de afsnit, der er relevante'}
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>

          <div style={S.row}>
            <Field label="Konstruktionstype" flex="1 1 160px">
              <select style={S.input} value={o.konstruktionstype}
                      onChange={e => set('konstruktionstype', e.target.value)}>
                {KONSTRUKTIONSTYPER.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Bygningsanvendelse — DS/INF 1990:2024 Tabel 2">
            <select style={S.input} value={o.anvendelseNr}
                    onChange={e => setNum('anvendelseNr', e.target.value)}>
              {ANVENDELSER.map(a => (
                <option key={a.nr} value={a.nr}>{a.nr}. {a.navn}</option>
              ))}
            </select>
          </Field>

          <div style={S.row}>
            <Field label="Etager over terræn" flex="1 1 110px">
              <input style={S.input} type="number" min="1" value={o.etager}
                     onChange={e => setNum('etager', e.target.value)} />
            </Field>
            <Field label="Største spændvidde [m]" flex="1 1 130px">
              <input style={S.input} type="number" min="0" step="0.5" value={o.spaendvidde}
                     onChange={e => setNum('spaendvidde', e.target.value)} />
            </Field>
            <Field label="Højde o. terræn [m]" flex="1 1 130px">
              <input style={S.input} type="number" min="0" step="0.5" value={o.hoejdeOver}
                     onChange={e => setNum('hoejdeOver', e.target.value)} />
            </Field>
            <Field label="Højde u. terræn [m]" flex="1 1 130px">
              <input style={S.input} type="number" min="0" step="0.5" value={o.hoejdeUnder}
                     onChange={e => setNum('hoejdeUnder', e.target.value)} />
            </Field>
          </div>

          {/* The suggestion, with its reasoning — the engineer overrides it in
              the document if the technical judgement differs. */}
          <div style={S.ccBox}>
            <div style={S.ccHead}>
              Foreslået konsekvensklasse: <strong style={{ fontSize: 15 }}>CC{cc}</strong>
              <span style={S.ccKk}>→ konstruktionsklasse KK{cc}, K_FI = {cc === 1 ? '0,9' : cc === 3 ? '1,1' : '1,0'}</span>
            </div>
            <div style={S.ccWhy}>{begrundelse}</div>
          </div>

          <Field label="Bærende materialer">
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', paddingTop: 2 }}>
              {MATERIALER.map(mat => (
                <label key={mat.key} style={S.check}>
                  <input type="checkbox" checked={!!o.materialer[mat.key]}
                         onChange={() => toggleMat(mat.key)} />
                  <span>{mat.label}</span>
                </label>
              ))}
            </div>
            {valgteMaterialer.length === 0 && (
              <div style={S.warn}>Vælg mindst ét materiale — afsnit 5 og normlisten bygger på det.</div>
            )}
          </Field>

          <Field label="Forhold der skal beskrives">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 2 }}>
              <label style={S.check}>
                <input type="checkbox" checked={o.kaelder} onChange={() => set('kaelder', !o.kaelder)} />
                <span>Bygningen har kælder</span>
              </label>
              <label style={S.check}>
                <input type="checkbox" checked={o.geoteknisk} onChange={() => set('geoteknisk', !o.geoteknisk)} />
                <span>Der foreligger en geoteknisk rapport</span>
              </label>
              <label style={S.check}>
                <input type="checkbox" checked={o.eksisterende} onChange={() => set('eksisterende', !o.eksisterende)} />
                <span>Eksisterende konstruktioner indgår i projektet</span>
              </label>
              <label style={S.check}>
                <input type="checkbox" checked={o.naboer} onChange={() => set('naboer', !o.naboer)} />
                <span>Tilstødende bygværker påvirker eller påvirkes</span>
              </label>
            </div>
          </Field>

          <div style={S.note}>
            Afsnitsnummereringen følger SBi-anvisning 271 og bevares fuldt ud —
            fravalgte afsnit får teksten “ikke relevant”, så numrene stadig passer
            med henvisninger fra A2 og B1.
            {(metadata.project_name || metadata.client) && (
              <> Projektnavn, bygherre og adresse hentes fra projektoplysningerne.</>
            )}
          </div>
        </div>

        <div style={S.footer}>
          <button style={S.ghostBtn} onClick={onClose}>Annullér</button>
          <button
            style={{ ...S.primaryBtn, opacity: valgteMaterialer.length ? 1 : 0.45,
                     cursor: valgteMaterialer.length ? 'pointer' : 'not-allowed' }}
            onClick={() => valgteMaterialer.length && onGenerate(o)}
            disabled={!valgteMaterialer.length}
          >
            Generér {docId}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, flex }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex, minWidth: 0 }}>
      <span style={S.label}>{label}</span>
      {children}
    </label>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    width: 'min(660px, 94vw)', maxHeight: '90vh', background: '#fff',
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
    padding: '16px 20px', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  label: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: '#64748b',
  },
  input: {
    padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit',
    border: '1px solid #d1d5db', background: '#fff', color: '#1c1c1e',
    width: '100%', boxSizing: 'border-box',
  },
  check: { display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' },
  ccBox: {
    background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `3px solid ${BRAND}`,
    padding: '11px 13px',
  },
  ccHead: { fontSize: 13, color: '#1c1c1e', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' },
  ccKk:   { fontSize: 11, color: '#64748b' },
  ccWhy:  { fontSize: 11.5, color: '#475569', lineHeight: 1.55, marginTop: 6 },
  warn:   { fontSize: 11, color: '#b45309', marginTop: 6 },
  note:   { fontSize: 11, color: '#94a3b8', lineHeight: 1.55, borderTop: '1px solid #f1f5f9', paddingTop: 12 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '12px 20px', borderTop: '1px solid #e5e7eb', background: '#f8fafc',
  },
  primaryBtn: {
    background: BRAND, color: '#fff', border: 'none', padding: '9px 18px',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', fontFamily: 'inherit',
  },
  ghostBtn: {
    background: '#fff', color: '#475569', border: '1px solid #d1d5db',
    padding: '9px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
