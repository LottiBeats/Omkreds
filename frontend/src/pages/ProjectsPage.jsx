/**
 * ProjectsPage.jsx  —  SaaS landing page + project dashboard
 *
 * Sticky nav → dark hero (headline + app preview) → stats strip →
 * features grid → how-it-works → CTA → projects dashboard
 */
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserButton, useUser, useClerk, SignInButton, SignUpButton } from '@clerk/react'
import { getProjects, deleteProject, getProjectTemplates, deleteProjectTemplate } from '../api/client.js'
import CreateProjectModal from '../components/CreateProjectModal.jsx'

// ── tokens ────────────────────────────────────────────────────────────────────
const BRAND      = '#d94a2b'   // Omkreds orange-red
const BRAND_DARK = '#b83d22'   // hover / pressed
const WHITE  = '#ffffff'
const OFF    = '#faf9f8'       // warm off-white to complement the brand
const BORDER = '#e8e4e0'       // warm border
const TEXT   = '#1a1614'       // warm near-black
const MUTED  = '#78716c'       // warm muted
const GREEN  = '#16a34a'
const SANS   = "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
const MONO   = "'Courier New', Courier, monospace"

// ── scroll-reveal ─────────────────────────────────────────────────────────────
function useReveal(threshold = 0.12) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setOn(true) }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, []) // eslint-disable-line
  return [ref, on]
}

function Reveal({ children, delay = 0, style = {} }) {
  const [ref, on] = useReveal(0.1)
  return (
    <div ref={ref} style={{
      opacity: on ? 1 : 0,
      transform: on ? 'none' : 'translateY(24px)',
      transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── nav ───────────────────────────────────────────────────────────────────────
function NavBar({ onNew }) {
  const [scrolled, setScrolled] = useState(false)
  const { user } = useUser()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const scroll = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <nav style={{
      position:       'fixed',
      top:            0,
      left:           0,
      right:          0,
      zIndex:         200,
      height:         60,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '0 40px',
      background:     scrolled ? 'rgba(255,255,255,0.97)' : WHITE,
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom:   '1px solid ' + BORDER,
      transition:     'background 0.3s',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', cursor: 'default', overflow: 'hidden', height: 60 }}>
        <img src="/logo.png" alt="Omkreds" style={{ height: 120, width: 'auto', marginTop: -30, marginBottom: -30 }} />
      </div>

      {/* Links — marketing anchors only exist for signed-out visitors */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {(user ? [] : [['Funktioner', 'features'], ['Sådan virker det', 'how-it-works'], ['Projekter', 'projects-section']]).map(([label, id]) => (
          <button key={id} onClick={() => scroll(id)} style={{
            background: 'none', border: 'none', fontFamily: SANS, fontSize: 13,
            color: MUTED, cursor: 'pointer', padding: 0, transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = TEXT}
          onMouseLeave={e => e.currentTarget.style.color = MUTED}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Right: auth-aware controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {user ? (
          <>
            <span style={{ fontFamily: SANS, fontSize: 12, color: MUTED }}>
              {user.fullName || user.primaryEmailAddress?.emailAddress}
            </span>
            <button
              onClick={onNew}
              style={{
                background: BRAND, color: WHITE, border: 'none',
                padding: '8px 20px', fontFamily: SANS, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = BRAND_DARK}
              onMouseLeave={e => e.currentTarget.style.background = BRAND}
            >
              Nyt projekt
            </button>
            <UserButton afterSignOutUrl="/" />
          </>
        ) : (
          <>
            <SignInButton mode="modal">
              <button style={{
                background: 'transparent', color: TEXT, border: '1px solid ' + BORDER,
                padding: '8px 20px', fontFamily: SANS, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', letterSpacing: '0.01em', transition: 'border-color 0.2s',
              }}>
                Log ind
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button style={{
                background: BRAND, color: WHITE, border: 'none',
                padding: '8px 20px', fontFamily: SANS, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.2s',
              }}>
                Kom i gang
              </button>
            </SignUpButton>
          </>
        )}
      </div>
    </nav>
  )
}

// ── app preview card (shown in hero) ─────────────────────────────────────────
function AppPreview() {
  return (
    <div style={{
      background:   WHITE,
      border:       '1px solid ' + BORDER,
      borderTop:    '3px solid ' + BRAND,
      boxShadow:    '0 24px 64px rgba(0,0,0,0.5)',
      fontFamily:   SANS,
      overflow:     'hidden',
      width:        '100%',
      maxWidth:     400,
    }}>
      {/* App chrome */}
      <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#ef4444','#f59e0b','#22c55e'].map(c => (
            <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <span style={{ marginLeft: 8, fontSize: 11, color: '#6b7280', fontFamily: MONO }}>
          Havnefront Kolding — A2 Superstruktur
        </span>
      </div>

      <div style={{ padding: '18px 20px' }}>

        {/* Steel section */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid ' + BRAND, paddingBottom: 5, marginBottom: 10 }}>
            <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: BRAND, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Steel Beam Design
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>EC3 §6.3.3</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.9, color: '#334155' }}>
            <div>IPE 450 · S355 · L = 8.0 m</div>
            <div>M_Ed = 360.0 kNm</div>
            <div>M_Rd = 604.0 kNm</div>
            <div style={{ color: MUTED }}>η = M_Ed / M_Rd = <strong style={{ color: TEXT }}>0.60</strong></div>
          </div>
          <div style={{
            marginTop: 8, background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderLeft: '3px solid ' + GREEN, padding: '5px 10px',
            fontFamily: MONO, fontSize: 10, color: '#15803d', fontWeight: 700,
          }}>
            ✓&ensp;BENDING: PASS&ensp;(η = 0.60 &lt; 1.0)
          </div>
        </div>

        {/* RC section */}
        <div style={{ borderTop: '1px solid ' + BORDER, paddingTop: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid ' + BRAND, paddingBottom: 5, marginBottom: 10 }}>
            <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: BRAND, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              RC Beam Design
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>EC2 §6.1</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.9, color: '#334155' }}>
            <div>300×600 mm · C30/37 · B500</div>
            <div>As,req = 1913 mm²</div>
            <div>Valgt: 4ø25 → As = 1963 mm²</div>
          </div>
          <div style={{
            marginTop: 8, background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderLeft: '3px solid ' + GREEN, padding: '5px 10px',
            fontFamily: MONO, fontSize: 10, color: '#15803d', fontWeight: 700,
          }}>
            ✓&ensp;FLEXURE: PASS
          </div>
        </div>

        {/* Export button */}
        <button style={{
          width: '100%', background: BRAND, color: WHITE, border: 'none',
          padding: '9px 0', fontFamily: SANS, fontSize: 12, fontWeight: 700,
          letterSpacing: '0.04em', cursor: 'pointer',
        }}>
          Export PDF →
        </button>
      </div>
    </div>
  )
}

// ── hero ──────────────────────────────────────────────────────────────────────
function HeroSection({ onNew }) {
  const [on, setOn] = useState(false)
  useEffect(() => { setTimeout(() => setOn(true), 100) }, [])

  const show = (d) => ({
    opacity: on ? 1 : 0,
    transform: on ? 'none' : 'translateY(20px)',
    transition: `opacity 0.7s ease ${d}s, transform 0.7s ease ${d}s`,
  })

  const scroll = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section style={{
      background:  OFF,
      minHeight:   '100vh',
      display:     'flex',
      alignItems:  'center',
      padding:     '100px 40px 80px',
      borderBottom: '1px solid ' + BORDER,
    }}>
      <div style={{
        maxWidth:            1100,
        margin:              '0 auto',
        width:               '100%',
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 64,
        alignItems:          'center',
      }}>

        {/* Left: copy */}
        <div>
          <h1 style={{ ...show(0.1), fontFamily: SANS, fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 800, color: TEXT, lineHeight: 1.15, letterSpacing: '-0.025em', marginBottom: 20 }}>
            Beregninger og<br />dokumentation —<br />samlet ét sted
          </h1>

          <p style={{ ...show(0.22), fontFamily: SANS, fontSize: 15, color: MUTED, lineHeight: 1.8, marginBottom: 36, maxWidth: 400 }}>
            Et simpelt værktøj til konstruktionsingeniører.
            Opret projekter, kør beregninger og eksporter
            PDF-rapporter direkte fra browseren.
          </p>

          <div style={{ ...show(0.32), display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={onNew}
              style={{
                background: BRAND, color: WHITE, border: 'none',
                padding: '12px 28px', fontFamily: SANS, fontSize: 14, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = BRAND_DARK}
              onMouseLeave={e => e.currentTarget.style.background = BRAND}
            >
              Kom i gang →
            </button>
            <button
              onClick={() => scroll('how-it-works')}
              style={{
                background: 'transparent', color: MUTED,
                border: '1px solid ' + BORDER,
                padding: '12px 24px', fontFamily: SANS, fontSize: 14,
                cursor: 'pointer', transition: 'color 0.2s, border-color 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = TEXT; e.currentTarget.style.borderColor = '#94a3b8' }}
              onMouseLeave={e => { e.currentTarget.style.color = MUTED; e.currentTarget.style.borderColor = BORDER }}
            >
              Sådan virker det
            </button>
          </div>
        </div>

        {/* Right: app preview */}
        <div style={{ ...show(0.25), display: 'flex', justifyContent: 'center' }}>
          <AppPreview />
        </div>

      </div>
    </section>
  )
}

// ── stats strip (removed) ─────────────────────────────────────────────────────
function StatsSection() { return null }

// ── features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    title: 'Beregningsmoduler',
    desc:  'Stål, beton, træ, murværk og FEM. Vælg beregningstype, udfyld parametrene og kør beregningen.',
  },
  {
    title: 'PDF-rapporter',
    desc:  'Eksporter dine beregninger som en færdig rapport med forside, indholdsfortegnelse og alle beregningsafsnit.',
  },
  {
    title: 'Projektorganisering',
    desc:  'Saml alle beregninger i projekter. Strukturer dokumentationen og find nemt frem i dine beregninger.',
  },
]

function FeaturesSection() {
  return (
    <section id="features" style={{ background: WHITE, padding: '80px 40px', borderBottom: '1px solid ' + BORDER }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.1}>
              <div style={{ borderTop: '2px solid ' + BRAND, paddingTop: 24 }}>
                <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 10 }}>
                  {f.title}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.75 }}>
                  {f.desc}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── how it works ──────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const STEPS = [
    {
      n: '01',
      title: 'Opret et projekt',
      desc:  'Giv projektet et navn og en reference og gå i gang.',
    },
    {
      n: '02',
      title: 'Tilføj beregninger',
      desc:  'Vælg beregningstype, udfyld parametrene og tryk Kør. Resultater vises med det samme.',
    },
    {
      n: '03',
      title: 'Eksporter PDF',
      desc:  'Ét klik genererer en komplet beregningsrapport klar til aflevering.',
    },
  ]

  return (
    <section id="how-it-works" style={{ background: OFF, padding: '80px 40px', borderBottom: '1px solid ' + BORDER }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal style={{ marginBottom: 56 }}>
          <h2 style={{ fontFamily: SANS, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, color: TEXT, letterSpacing: '-0.02em' }}>
            Sådan virker det
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: BORDER, lineHeight: 1, marginBottom: 16 }}>
                  {s.n}
                </div>
                <div style={{ width: 28, height: 2, background: BRAND, marginBottom: 16 }} />
                <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 10 }}>
                  {s.title}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.75 }}>
                  {s.desc}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────────
function CtaSection({ onNew }) {
  return (
    <section style={{ background: WHITE, padding: '80px 40px', borderBottom: '1px solid ' + BORDER }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
        <Reveal>
          <h2 style={{ fontFamily: SANS, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, color: TEXT, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Klar til at komme i gang?
          </h2>
          <p style={{ fontFamily: SANS, fontSize: 14, color: MUTED, lineHeight: 1.7 }}>
            Kræver ikke installation. Virker i browseren.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <button
            onClick={onNew}
            style={{
              background: BRAND, color: WHITE, border: 'none',
              padding: '14px 32px', fontFamily: SANS, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = BRAND_DARK}
            onMouseLeave={e => e.currentTarget.style.background = BRAND}
          >
            Opret dit første projekt →
          </button>
        </Reveal>
      </div>
    </section>
  )
}

// ── template library ─────────────────────────────────────────────────────────
function TemplatesSection({ templates, loading, onUseTemplate, onDeleteTemplate }) {
  if (loading) return (
    <div style={{ padding: '20px 0', color: MUTED, fontFamily: SANS, fontSize: 13 }}>Indlæser skabeloner…</div>
  )
  if (templates.length === 0) return (
    <div style={{
      background: WHITE, border: '1px dashed ' + BORDER, padding: '40px 32px',
      textAlign: 'center',
    }}>
      <div style={{ fontFamily: SANS, fontSize: 28, marginBottom: 12 }}>📋</div>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 6 }}>
        Ingen skabeloner endnu
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.7, maxWidth: 340, margin: '0 auto' }}>
        Åbn et projekt og klik på <strong>Gem som skabelon</strong> for at genbruge
        dokumentstrukturen i fremtidige projekter.
      </div>
    </div>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      {templates.map(tmpl => (
        <div
          key={tmpl.id}
          style={{
            background: WHITE, border: '1px solid ' + BORDER,
            borderTop: '2px solid #6366f1',   // indigo — distinguishes templates from projects
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📋</span>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: TEXT, flex: 1, lineHeight: 1.3 }}>
              {tmpl._template_name || tmpl.metadata?.project_name || 'Unavngiven skabelon'}
            </div>
          </div>
          {tmpl._template_description && (
            <div style={{ fontFamily: SANS, fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 1.5 }}>
              {tmpl._template_description}
            </div>
          )}
          <div style={{ fontFamily: SANS, fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
            {/* List which documents have content */}
            {Object.entries(tmpl.documents || {})
              .filter(([, doc]) => (doc.blocks?.length || 0) + (doc.subdocs?.length || 0) > 0)
              .map(([id]) => id)
              .join(' · ') || 'Tom skabelon'}
          </div>
          <div style={{ borderTop: '1px solid ' + BORDER, paddingTop: 12, display: 'flex', gap: 8 }}>
            <button
              style={{
                flex: 1, background: '#6366f1', color: WHITE, border: 'none',
                padding: '8px 0', fontFamily: SANS, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer',
              }}
              onClick={() => onUseTemplate(tmpl)}
            >
              Brug skabelon
            </button>
            <button
              style={{ background: 'none', border: '1px solid ' + BORDER, color: '#94a3b8', padding: '8px 14px', fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}
              onClick={() => onDeleteTemplate(tmpl)}
            >
              Slet
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── projects dashboard ────────────────────────────────────────────────────────
function ProjectsSection({ projects, templates, templatesLoading, loading, error, onOpen, onDelete, onNew, onUseTemplate, onDeleteTemplate, isSignedIn }) {
  const [tab, setTab] = useState('projects')   // 'projects' | 'templates'

  if (!isSignedIn) return (
    <section id="projects-section" style={{ background: OFF, borderTop: '1px solid ' + BORDER, padding: '80px 40px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: SANS, fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 12 }}>Dine projekter</h2>
        <p style={{ fontFamily: SANS, fontSize: 14, color: MUTED, marginBottom: 28, lineHeight: 1.7 }}>
          Log ind for at se og arbejde med dine projekter.
        </p>
        <SignInButton mode="modal">
          <button style={{
            background: BRAND, color: WHITE, border: 'none',
            padding: '12px 32px', fontFamily: SANS, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.02em',
          }}>
            Log ind →
          </button>
        </SignInButton>
      </div>
    </section>
  )

  return (
    <section id="projects-section" style={{ background: OFF, borderTop: '1px solid ' + BORDER, padding: '64px 40px 96px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header row: title + tabs + new-project button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <h2 style={{ fontFamily: SANS, fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em', margin: 0 }}>
              {tab === 'projects' ? 'Dine projekter' : 'Skabeloner'}
            </h2>
            {/* Tab toggle */}
            <div style={{ display: 'flex', border: '1px solid ' + BORDER, background: WHITE, overflow: 'hidden' }}>
              {[['projects', 'Projekter'], ['templates', 'Skabeloner']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    background:  tab === key ? BRAND : 'transparent',
                    color:       tab === key ? WHITE : MUTED,
                    border:      'none',
                    padding:     '6px 14px',
                    fontFamily:  SANS,
                    fontSize:    12,
                    fontWeight:  tab === key ? 700 : 400,
                    cursor:      'pointer',
                    transition:  'background 0.15s, color 0.15s',
                  }}
                >
                  {label}
                  {key === 'templates' && templates.length > 0 && (
                    <span style={{
                      marginLeft: 5, background: tab === 'templates' ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                      color: tab === 'templates' ? WHITE : MUTED,
                      fontSize: 10, fontWeight: 700,
                      padding: '1px 5px', borderRadius: 8,
                    }}>
                      {templates.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {tab === 'projects' && (
            <button
              onClick={onNew}
              style={{
                background: BRAND, color: WHITE, border: 'none',
                padding: '10px 22px', fontFamily: SANS, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.02em', transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = BRAND_DARK}
              onMouseLeave={e => e.currentTarget.style.background = BRAND}
            >
              + Nyt projekt
            </button>
          )}
        </div>

        {error && (
          <div style={{ color: '#c0392b', background: '#fdf3f2', border: '1px solid #f5c6c3', padding: '12px 16px', marginBottom: 24, fontSize: 13, fontFamily: SANS }}>
            {error}
          </div>
        )}

        {/* ── Projects tab ── */}
        {tab === 'projects' && (
          loading ? (
            <div style={{ padding: '40px 0', color: MUTED, fontFamily: SANS, fontSize: 13 }}>Indlæser…</div>
          ) : projects.length === 0 ? (
            <div style={{ background: WHITE, border: '1px solid ' + BORDER, padding: '56px 32px', textAlign: 'center' }}>
              <div style={{ fontFamily: SANS, fontSize: 32, marginBottom: 16 }}>📐</div>
              <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
                Ingen projekter endnu
              </div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
                Opret dit første projekt og kom i gang med den statiske dokumentation.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={onNew}
                  style={{ background: BRAND, color: WHITE, border: 'none', padding: '10px 24px', fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  + Nyt projekt
                </button>
                {templates.length > 0 && (
                  <button
                    onClick={() => setTab('templates')}
                    style={{ background: 'transparent', color: MUTED, border: '1px solid ' + BORDER, padding: '10px 24px', fontFamily: SANS, fontSize: 13, cursor: 'pointer' }}
                  >
                    Se skabeloner →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {projects.map(project => (
                <div
                  key={project.id}
                  className="project-card"
                  style={{
                    background: WHITE, border: '1px solid ' + BORDER,
                    borderTop: '2px solid ' + BRAND,
                    padding: '20px', cursor: 'pointer',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                  }}
                  onClick={() => onOpen(project.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: TEXT, flex: 1, marginRight: 8, lineHeight: 1.3 }}>
                      {project.metadata.project_name || 'Unavngivet projekt'}
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                      {project.visibility === 'personal' && (
                        <span title="Privat — kun synlig for dig" style={{
                          fontFamily: SANS, fontSize: 10, fontWeight: 700, color: '#4b5563',
                          background: '#f3f4f6', border: '1px solid #d1d5db',
                          padding: '2px 6px', whiteSpace: 'nowrap',
                        }}>
                          Personal
                        </span>
                      )}
                      {project.metadata.revision && (
                        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: MUTED, background: OFF, padding: '2px 6px', border: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>
                          Rev {project.metadata.revision}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 12, color: MUTED, marginBottom: 12 }}>
                    {project.metadata.project_ref || '—'}
                    {project.metadata.client ? ` · ${project.metadata.client}` : ''}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
                    {project.metadata.engineer ? `${project.metadata.engineer} · ` : ''}
                    {project.created}
                  </div>
                  <div style={{ borderTop: '1px solid ' + BORDER, paddingTop: 12, display: 'flex', gap: 8 }}>
                    <button
                      style={{ flex: 1, background: BRAND, color: WHITE, border: 'none', padding: '8px 0', fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); onOpen(project.id) }}
                    >
                      Åbn
                    </button>
                    <button
                      style={{ background: 'none', border: '1px solid ' + BORDER, color: '#94a3b8', padding: '8px 14px', fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); onDelete(project, e) }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Templates tab ── */}
        {tab === 'templates' && (
          <TemplatesSection
            templates={templates}
            loading={templatesLoading}
            onUseTemplate={onUseTemplate}
            onDeleteTemplate={onDeleteTemplate}
          />
        )}

      </div>
    </section>
  )
}

// ── root ──────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const { user, isSignedIn, isLoaded } = useUser()
  const { openSignIn } = useClerk()
  const [projects,          setProjects]          = useState([])
  const [templates,         setTemplates]         = useState([])
  const [loading,           setLoading]           = useState(true)
  const [templatesLoading,  setTemplatesLoading]  = useState(false)
  const [error,             setError]             = useState(null)
  const [showModal,         setShowModal]         = useState(false)
  // { id, name } when creating from a template; null for blank new project
  const [selectedTemplate,  setSelectedTemplate]  = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) { load(); loadTemplates() }
    else setLoading(false)
  }, [isSignedIn, isLoaded])

  async function load() {
    try { setLoading(true); setProjects(await getProjects()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function loadTemplates() {
    try { setTemplatesLoading(true); setTemplates(await getProjectTemplates()) }
    catch (e) { /* non-fatal */ }
    finally { setTemplatesLoading(false) }
  }

  const onCreated = (p) => navigate(`/projects/${p.id}`)

  const onDelete = async (project, e) => {
    e.stopPropagation()
    if (!window.confirm(`Slet "${project.metadata.project_name}"?`)) return
    try { await deleteProject(project.id); setProjects(projects.filter(p => p.id !== project.id)) }
    catch (e) { setError(e.message) }
  }

  const onDeleteTemplate = async (tmpl) => {
    const name = tmpl._template_name || tmpl.metadata?.project_name || 'denne skabelon'
    if (!window.confirm(`Slet skabelonen "${name}"?`)) return
    try {
      await deleteProject(tmpl.id)
      setTemplates(templates.filter(t => t.id !== tmpl.id))
    } catch (e) { setError(e.message) }
  }

  const openModal = () => {
    if (!isSignedIn) { openSignIn(); return }
    setSelectedTemplate(null)
    setShowModal(true)
  }

  const useTemplate = (tmpl) => {
    setSelectedTemplate({
      id:   tmpl.id,
      name: tmpl._template_name || tmpl.metadata?.project_name || 'Template',
    })
    setShowModal(true)
  }

  const projectsSection = (
    <ProjectsSection
      projects={projects} loading={loading} error={error}
      templates={templates} templatesLoading={templatesLoading}
      onOpen={(id) => navigate(`/projects/${id}`)}
      onDelete={onDelete}
      onNew={openModal}
      onUseTemplate={useTemplate}
      onDeleteTemplate={onDeleteTemplate}
      isSignedIn={isSignedIn}
    />
  )

  // Avoid flashing the marketing page while Clerk determines auth state
  if (!isLoaded) return <div style={{ background: WHITE, minHeight: '100vh' }} />

  return (
    <div style={{ background: WHITE, minHeight: '100vh' }}>
      <NavBar onNew={openModal} />
      {isSignedIn ? (
        // Daily users land straight on their dashboard — no marketing scroll
        <div style={{ paddingTop: 60, minHeight: '100vh' }}>
          {projectsSection}
        </div>
      ) : (
        <>
          <HeroSection onNew={openModal} />
          <StatsSection />
          <FeaturesSection />
          <HowItWorksSection />
          <CtaSection onNew={openModal} />
          {projectsSection}
        </>
      )}
      {showModal && (
        <CreateProjectModal
          onCreated={onCreated}
          onCancel={() => { setShowModal(false); setSelectedTemplate(null) }}
          templateId={selectedTemplate?.id ?? null}
          templateName={selectedTemplate?.name ?? ''}
        />
      )}
    </div>
  )
}
