/**
 * ProjectTypeModal.jsx — pick the kind of job, before describing it
 *
 * Choosing a type here only decides which documents get generated and what
 * they start from; the A1 dialog opens next with the type's answers filled in,
 * and nothing is written until that dialog is confirmed.
 */
import React, { useState } from 'react'
import { PROJECT_TYPES } from '../templates/projectTypes.js'

const BRAND = '#d94a2b'

export default function ProjectTypeModal({ onChoose, onClose, hasContent = false }) {
  const [sel, setSel] = useState(PROJECT_TYPES[0]?.key ?? null)

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        <div style={S.header}>
          <div>
            <div style={S.title}>Vælg projekttype</div>
            <div style={S.subtitle}>
              Udfylder A1, A2, B1 og B2 ud fra én beskrivelse af opgaven
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {PROJECT_TYPES.map(t => {
            const on = t.key === sel
            return (
              <button
                key={t.key}
                onClick={() => setSel(t.key)}
                style={{
                  ...S.card,
                  borderColor: on ? BRAND : '#e5e7eb',
                  background:  on ? '#fffaf8' : '#fff',
                }}
              >
                <div style={S.cardHead}>
                  <span style={{ ...S.radio, borderColor: on ? BRAND : '#cbd5e1' }}>
                    {on && <span style={S.radioDot} />}
                  </span>
                  <span style={S.cardTitle}>{t.label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={S.docs}>{t.docs.join(' · ')}</span>
                </div>
                <div style={S.summary}>{t.summary}</div>
                {t.detail && <div style={S.detail}>{t.detail}</div>}
              </button>
            )
          })}

          {hasContent && (
            <div style={S.warn}>
              Projektet indeholder allerede tekst i et eller flere af dokumenterne.
              De bliver erstattet. Der gemmes en version af projektet, som det
              ser ud nu, så det kan hentes tilbage under Versionshistorik —
              men ikke med Fortryd, som kun dækker ét dokument ad gangen.
            </div>
          )}

          <div style={S.note}>
            Næste skridt er beskrivelsen af projektet — bygningsanvendelse,
            etager, spændvidde og materialer. Konsekvens- og konstruktionsklasse
            udledes derfra, og de samme svar bruges i alle fire dokumenter.
          </div>
        </div>

        <div style={S.footer}>
          <button style={S.cancel} onClick={onClose}>Annullér</button>
          <button
            style={{ ...S.apply, opacity: sel ? 1 : 0.5, cursor: sel ? 'pointer' : 'default' }}
            disabled={!sel}
            onClick={() => sel && onChoose(sel)}
          >
            Beskriv projektet →
          </button>
        </div>

      </div>
    </div>
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
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  card: {
    border: '1px solid #e5e7eb', padding: '14px 16px', textAlign: 'left',
    fontFamily: 'inherit', cursor: 'pointer', display: 'block', width: '100%',
    transition: 'border-color 0.15s, background 0.15s',
  },
  cardHead:  { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 },
  radio: {
    width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #cbd5e1',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  radioDot:  { width: 7, height: 7, borderRadius: '50%', background: BRAND },
  cardTitle: { fontSize: 13.5, fontWeight: 700, color: '#1c1c1e' },
  docs: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8',
    fontFamily: "'Courier New', Courier, monospace",
  },
  summary: { fontSize: 12.5, color: '#475569', lineHeight: 1.6, marginLeft: 23 },
  detail:  { fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6, marginLeft: 23, marginTop: 5 },
  warn: {
    background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c',
    fontSize: 12, padding: '9px 12px', lineHeight: 1.6,
  },
  note: { fontSize: 11.5, color: '#94a3b8', lineHeight: 1.65 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '12px 20px', borderTop: '1px solid #e5e7eb',
  },
  cancel: {
    background: 'none', border: '1px solid #e5e7eb', padding: '8px 16px',
    fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', color: '#64748b',
  },
  apply: {
    background: BRAND, color: '#fff', border: 'none', padding: '8px 18px',
    fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
  },
}
