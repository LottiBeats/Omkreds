/**
 * ProjectsPage.jsx  —  SaaS landing page + project dashboard
 *
 * Sticky nav → dark hero (headline + app preview) → stats strip →
 * features grid → how-it-works → CTA → projects dashboard
 */
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserButton, useUser } from '@clerk/react'
import { getProjects, deleteProject } from '../api/client.js'
import CreateProjectModal from '../components/CreateProjectModal.jsx'

// ── tokens ────────────────────────────────────────────────────────────────────
const DARK   = '#0a0f1a'
const NAVY   = '#1e3a5f'
const BLUE   = '#2563eb'
const WHITE  = '#ffffff'
const OFF    = '#f8fafc'
const BORDER = '#e2e8f0'
const TEXT   = '#0f172a'
const MUTED  = '#64748b'
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
      background:     scrolled ? 'rgba(10,15,26,0.95)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom:   scrolled ? '1px solid rgba(255,255,255,0.07)' : 'none',
      transition:     'background 0.3s, border-color 0.3s',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'default' }}>
        <div style={{ width: 26, height: 26, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 11, height: 11, background: DARK, clipPath: 'polygon(50% 0%,100% 100%,0% 100%)' }} />
        </div>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: WHITE, letterSpacing: '0.01em' }}>
          Structural Calc
        </span>
      </div>

      {/* Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {[['Features', 'features'], ['How it works', 'how-it-works'], ['Projects', 'projects-section']].map(([label, id]) => (
          <button key={id} onClick={() => scroll(id)} style={{
            background: 'none', border: 'none', fontFamily: SANS, fontSize: 13,
            color: 'rgba(255,255,255,0.65)', cursor: 'pointer', padding: 0,
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = WHITE}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.65)'}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Right: New Project + Clerk UserButton (avatar + sign-out dropdown) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {user && (
          <span style={{ fontFamily: SANS, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            {user.fullName || user.primaryEmailAddress?.emailAddress}
          </span>
        )}
        <button
          onClick={onNew}
          style={{
            background: WHITE, color: DARK, border: 'none',
            padding: '8px 20px', fontFamily: SANS, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.01em',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.background = WHITE}
        >
          New Project
        </button>
        {/* Clerk's UserButton: shows avatar, opens a popover with
            profile settings, sign-out, etc. */}
        <UserButton afterSignOutUrl="/sign-in" />
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
      borderTop:    '3px solid ' + NAVY,
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
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid ' + NAVY, paddingBottom: 5, marginBottom: 10 }}>
            <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid ' + NAVY, paddingBottom: 5, marginBottom: 10 }}>
            <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
          width: '100%', background: NAVY, color: WHITE, border: 'none',
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
      background:    DARK,
      minHeight:     '100vh',
      display:       'flex',
      alignItems:    'center',
      padding:       '100px 40px 80px',
      position:      'relative',
      overflow:      'hidden',
    }}>
      {/* Subtle grid pattern */}
      <div style={{
        position:   'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
      }} />

      <div style={{
        maxWidth:            1100,
        margin:              '0 auto',
        width:               '100%',
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 64,
        alignItems:          'center',
        position:            'relative',
      }}>

        {/* Left: copy */}
        <div>
          <div style={{ ...show(0.1) }}>
            <span style={{
              display:       'inline-block',
              background:    'rgba(37,99,235,0.15)',
              border:        '1px solid rgba(37,99,235,0.3)',
              color:         '#93c5fd',
              fontFamily:    SANS,
              fontSize:      12,
              fontWeight:    600,
              padding:       '4px 12px',
              letterSpacing: '0.04em',
              marginBottom:  24,
            }}>
              Eurocode Structural Calculations
            </span>
          </div>

          <h1 style={{ ...show(0.2), fontFamily: SANS, fontSize: 'clamp(36px, 4.5vw, 54px)', fontWeight: 800, color: WHITE, lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 24 }}>
            Engineering<br />
            calculations,<br />
            <span style={{ color: '#93c5fd' }}>documented.</span>
          </h1>

          <p style={{ ...show(0.32), fontFamily: SANS, fontSize: 16, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, marginBottom: 40, maxWidth: 420 }}>
            Stop spending hours formatting calculation reports.
            Run Eurocode checks automatically — EC2, EC3, EC5, EC6 —
            and export a professional PDF in seconds. Built for
            structural engineering teams.
          </p>

          <div style={{ ...show(0.42), display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={onNew}
              style={{
                background: WHITE, color: DARK, border: 'none',
                padding: '13px 28px', fontFamily: SANS, fontSize: 14, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
              onMouseLeave={e => e.currentTarget.style.background = WHITE}
            >
              Start for free →
            </button>
            <button
              onClick={() => scroll('how-it-works')}
              style={{
                background: 'transparent', color: 'rgba(255,255,255,0.65)',
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '13px 24px', fontFamily: SANS, fontSize: 14,
                cursor: 'pointer', transition: 'color 0.2s, border-color 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = WHITE; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
            >
              See how it works
            </button>
          </div>

          <div style={{ ...show(0.55), marginTop: 48, display: 'flex', gap: 32 }}>
            {[['16+', 'Calc modules'], ['< 2 sec', 'PDF export'], ['100%', 'Eurocode refs']].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 800, color: WHITE }}>{v}</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: app preview */}
        <div style={{ ...show(0.35), display: 'flex', justifyContent: 'center' }}>
          <AppPreview />
        </div>

      </div>
    </section>
  )
}

// ── stats strip ───────────────────────────────────────────────────────────────
function StatsSection() {
  const STATS = [
    { value: '3×',      label: 'Faster reports',       sub: 'vs. manual workflow'           },
    { value: '87%',     label: 'Less manual work',     sub: 'Checks run automatically'      },
    { value: '< 2 sec', label: 'PDF generation',       sub: 'Cover, TOC, all calculations'  },
    { value: '100%',    label: 'Eurocode compliant',   sub: 'Every check clause-referenced' },
  ]
  return (
    <section style={{ background: OFF, borderTop: '1px solid ' + BORDER, borderBottom: '1px solid ' + BORDER }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.07}>
            <div style={{
              padding:     '36px 32px',
              borderRight: i < 3 ? '1px solid ' + BORDER : 'none',
            }}>
              <div style={{ fontFamily: SANS, fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: '-0.02em' }}>
                {s.value}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: TEXT, marginTop: 8 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: MUTED, marginTop: 3 }}>
                {s.sub}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ── features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    abbr: 'SB',  color: '#1e3a5f',
    title: 'Steel Beams & Columns',
    tag: 'EC3',
    desc: 'Full cross-section and stability checks — bending, shear, LTB, axial buckling — for all standard I, H, and hollow sections.',
  },
  {
    abbr: 'PG',  color: '#1e3a5f',
    title: 'Plate Girders',
    tag: 'EC3 / EC3-1-5',
    desc: 'Shear buckling, effective Class 4 section, and M+V interaction checks for welded plate girders to EN 1993-1-5.',
  },
  {
    abbr: 'BC',  color: '#2a4f82',
    title: 'Beam-Column Interaction',
    tag: 'EC3 Annex B',
    desc: 'Method 2 interaction formulae for combined bending and axial compression — k_yy, k_yz, k_zy, k_zz interaction factors.',
  },
  {
    abbr: 'RCB', color: '#374151',
    title: 'RC Beams & Slabs',
    tag: 'EC2',
    desc: 'Flexure, shear, deflection, and detailing checks. Reinforcement areas computed automatically with bar selection.',
  },
  {
    abbr: 'RCC', color: '#374151',
    title: 'RC Columns',
    tag: 'EC2',
    desc: 'Biaxial bending and axial force checks including second-order effects, slenderness, and minimum eccentricity.',
  },
  {
    abbr: 'TB',  color: '#92400e',
    title: 'Timber Beams & Columns',
    tag: 'EC5',
    desc: 'Bending, compression, buckling, combined loading, and fire design. Service class and load duration handled automatically.',
  },
  {
    abbr: 'MW',  color: '#78350f',
    title: 'Masonry Walls',
    tag: 'EC6',
    desc: 'Axial load, eccentricity, and slenderness checks for unreinforced masonry walls. Multiple unit/mortar combinations.',
  },
  {
    abbr: 'FEM', color: '#0f766e',
    title: 'Beam FEM Analysis',
    tag: 'FEM',
    desc: 'Multi-span continuous beams with arbitrary loading. Live moment, shear, and deflection diagrams export straight into the PDF.',
  },
  {
    abbr: 'PY',  color: '#1d4ed8',
    title: 'Custom Calculations',
    tag: 'Python',
    desc: 'Write Python scripts with rendered equations via handcalcs. Results and plots are captured and included in the PDF automatically.',
  },
]

function FeaturesSection() {
  return (
    <section id="features" style={{ background: WHITE, padding: '96px 40px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <Reveal style={{ marginBottom: 56, maxWidth: 560 }}>
          <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Calculation Modules
          </div>
          <h2 style={{ fontFamily: SANS, fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, color: TEXT, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 16 }}>
            Every Eurocode check your team needs
          </h2>
          <p style={{ fontFamily: SANS, fontSize: 15, color: MUTED, lineHeight: 1.7 }}>
            16+ calculation modules covering steel, concrete, timber, masonry, geotechnical, and loading —
            all producing structured output that flows directly into your PDF report.
          </p>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: BORDER }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.05}>
              <div
                style={{
                  background:  WHITE,
                  padding:     '28px 26px',
                  transition:  'background 0.2s',
                  height:      '100%',
                  boxSizing:   'border-box',
                }}
                onMouseEnter={e => e.currentTarget.style.background = OFF}
                onMouseLeave={e => e.currentTarget.style.background = WHITE}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  {/* Colored module badge matching the editor block panel */}
                  <span style={{
                    display:       'inline-flex',
                    alignItems:    'center',
                    justifyContent: 'center',
                    width:          40,
                    height:         24,
                    background:     f.color,
                    color:          '#fff',
                    fontFamily:     MONO,
                    fontSize:       9,
                    fontWeight:     700,
                    letterSpacing:  '0.06em',
                    flexShrink:     0,
                  }}>
                    {f.abbr}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: BLUE, background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 7px', letterSpacing: '0.06em' }}>
                    {f.tag}
                  </span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
                  {f.title}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: MUTED, lineHeight: 1.65 }}>
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
      title: 'Create a project',
      desc: 'Enter project name, reference, engineer, date, and applicable standard. Use the A1 Projektgrundlag template to fill in Eurocode references, consequence class, and load assumptions in seconds.',
    },
    {
      n: '02',
      title: 'Add your calculations',
      desc: 'Add calculation blocks in document order — steel beams, plate girders, RC sections, timber columns, foundations, wind loads, FEM analysis, custom Python. Each block runs the full Eurocode check the moment you click Run.',
    },
    {
      n: '03',
      title: 'Export a professional PDF',
      desc: 'One click generates a complete PDF: cover page, auto-generated table of contents, all calculation sections with Eurocode clause references, and revision tracking. Ready in under two seconds.',
    },
  ]

  return (
    <section id="how-it-works" style={{ background: OFF, padding: '96px 40px', borderTop: '1px solid ' + BORDER }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <Reveal style={{ marginBottom: 64, maxWidth: 480 }}>
          <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            How it works
          </div>
          <h2 style={{ fontFamily: SANS, fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, color: TEXT, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 16 }}>
            From inputs to PDF<br />in three steps
          </h2>
          <p style={{ fontFamily: SANS, fontSize: 15, color: MUTED, lineHeight: 1.7 }}>
            No learning curve. Most engineers complete their first
            calculation and PDF export within 15 minutes.
          </p>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color: BORDER, lineHeight: 1, marginBottom: 20 }}>
                  {s.n}
                </div>
                <div style={{ width: 32, height: 2, background: NAVY, marginBottom: 20 }} />
                <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 12 }}>
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
    <section style={{ background: DARK, padding: '96px 40px' }}>
      <div style={{
        maxWidth:   1100,
        margin:     '0 auto',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap:        40,
        flexWrap:   'wrap',
      }}>
        <Reveal style={{ flex: '1 1 400px' }}>
          <h2 style={{
            fontFamily:    SANS,
            fontSize:      'clamp(28px, 3.5vw, 42px)',
            fontWeight:    800,
            color:         WHITE,
            lineHeight:    1.15,
            letterSpacing: '-0.025em',
            marginBottom:  16,
          }}>
            Ready to transform your<br />documentation workflow?
          </h2>
          <p style={{ fontFamily: SANS, fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 440 }}>
            Join structural engineers who spend their time calculating —
            not formatting. Your first project is ready in under two minutes.
          </p>
        </Reveal>

        <Reveal delay={0.15} style={{ flex: '0 0 auto' }}>
          <button
            onClick={onNew}
            style={{
              background: WHITE, color: DARK, border: 'none',
              padding: '16px 36px', fontFamily: SANS, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.01em', display: 'block',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = WHITE}
          >
            Start your first project →
          </button>
          <div style={{ fontFamily: SANS, fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 10, textAlign: 'center' }}>
            No installation required
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ── projects dashboard ────────────────────────────────────────────────────────
function ProjectsSection({ projects, loading, error, onOpen, onDelete, onNew }) {
  return (
    <section id="projects-section" style={{ background: OFF, borderTop: '1px solid ' + BORDER, padding: '64px 40px 96px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h2 style={{ fontFamily: SANS, fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>
              Your Projects
            </h2>
            {projects.length > 0 && (
              <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, marginTop: 4 }}>
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          <button
            onClick={onNew}
            style={{
              background: NAVY, color: WHITE, border: 'none',
              padding: '10px 22px', fontFamily: SANS, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.02em',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = DARK}
            onMouseLeave={e => e.currentTarget.style.background = NAVY}
          >
            + New Project
          </button>
        </div>

        {error && (
          <div style={{ color: '#c0392b', background: '#fdf3f2', border: '1px solid #f5c6c3', padding: '12px 16px', marginBottom: 24, fontSize: 13, fontFamily: SANS }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px 0', color: MUTED, fontFamily: SANS, fontSize: 13 }}>Loading…</div>
        ) : projects.length === 0 ? (
          <div style={{
            background: WHITE, border: '1px solid ' + BORDER, padding: '56px 32px',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: SANS, fontSize: 32, marginBottom: 16 }}>📐</div>
            <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
              No projects yet
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
              Create your first project and start generating Eurocode-compliant documentation.
            </div>
            <button
              onClick={onNew}
              style={{ background: NAVY, color: WHITE, border: 'none', padding: '10px 24px', fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              + New Project
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {projects.map(project => (
              <div
                key={project.id}
                className="project-card"
                style={{
                  background: WHITE, border: '1px solid ' + BORDER,
                  borderTop: '2px solid ' + NAVY,
                  padding: '20px', cursor: 'pointer',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                }}
                onClick={() => onOpen(project.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: TEXT, flex: 1, marginRight: 8, lineHeight: 1.3 }}>
                    {project.metadata.project_name || 'Untitled project'}
                  </div>
                  {project.metadata.revision && (
                    <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: MUTED, background: OFF, padding: '2px 6px', border: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>
                      Rev {project.metadata.revision}
                    </span>
                  )}
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
                    style={{ flex: 1, background: NAVY, color: WHITE, border: 'none', padding: '8px 0', fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); onOpen(project.id) }}
                  >
                    Open
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
        )}
      </div>
    </section>
  )
}

// ── root ──────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const [projects,  setProjects]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { load() }, [])
  async function load() {
    try { setLoading(true); setProjects(await getProjects()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const onCreated  = (p) => navigate(`/projects/${p.id}`)
  const onDelete = async (project, e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${project.metadata.project_name}"?`)) return
    try { await deleteProject(project.id); setProjects(projects.filter(p => p.id !== project.id)) }
    catch (e) { setError(e.message) }
  }

  const openModal = () => setShowModal(true)

  return (
    <div style={{ background: WHITE, minHeight: '100vh' }}>
      <NavBar onNew={openModal} />
      <HeroSection onNew={openModal} />
      <StatsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CtaSection onNew={openModal} />
      <ProjectsSection
        projects={projects} loading={loading} error={error}
        onOpen={(id) => navigate(`/projects/${id}`)}
        onDelete={onDelete} onNew={openModal}
      />
      {showModal && (
        <CreateProjectModal onCreated={onCreated} onCancel={() => setShowModal(false)} />
      )}
    </div>
  )
}
