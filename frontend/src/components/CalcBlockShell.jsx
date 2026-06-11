/**
 * CalcBlockShell.jsx — reusable wrapper for all Eurocode calc blocks
 *
 * The result panel is collapsible.  After a run it shows a one-line summary
 * (pass / fail counts) with a toggle to expand the full output.
 */
import React, { useState, useEffect } from 'react'
import CalcResultView, { maxUtilization, utilColor } from './CalcResultView.jsx'

// Map common Python/backend error strings to user-friendly messages
function friendlyError(msg) {
  if (!msg) return 'Der opstod en ukendt fejl.'
  const m = msg.toLowerCase()
  if (m.includes('division by zero') || m.includes('zerodivisionerror'))
    return 'Division med nul — kontrollér at højde, spændvidde og tværsnitsmål ikke er nul.'
  if (m.includes('not in catalog') || m.includes('section') && m.includes('not'))
    return `Profilet findes ikke i kataloget. ${msg}`
  if (m.includes('sqrt') && m.includes('negative') || m.includes('math domain'))
    return 'Regnefejl — tværsnittet er overbelastet. Øg højden eller tværsnittet og kør igen.'
  if (m.includes('convergence') || m.includes('did not converge'))
    return 'Beregningen konvergerede ikke. Kontrollér at input ligger i realistiske intervaller.'
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'Ingen forbindelse til beregningsserveren. Kontrollér din internetforbindelse og prøv igen.'
  if (m.includes('422'))
    return msg.replace(/^\d+ ?:? ?/, '')   // strip leading HTTP status code
  // Fallback: strip Python type names and return clean message
  return msg.replace(/^\w+Error: /, '').replace(/\(.*\)$/, '').trim() || msg
}

// Count pass / fail checks in a result block list
function summarise(blocks) {
  if (!blocks) return null
  let pass = 0, fail = 0
  for (const b of blocks) {
    if (b.type === 'check') {
      b.passes !== false ? pass++ : fail++
    }
  }
  return { pass, fail, total: pass + fail }
}

export default function CalcBlockShell({
  title,
  onTitleChange,
  onRun,
  onClear,
  running,
  error,
  result,
  children,
  runLabel = '▶  Kør beregning',
  runDisabled = false,
}) {
  // Collapse the result panel by default; auto-open when a new result arrives
  const [resultOpen, setResultOpen] = useState(false)

  useEffect(() => {
    if (result) setResultOpen(true)
  }, [result])

  const summary = summarise(result)
  const util    = maxUtilization(result)

  // Ctrl/Cmd+Enter anywhere inside the block runs the calculation
  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !running && !runDisabled) {
      e.preventDefault()
      onRun()
    }
  }

  return (
    <div style={styles.wrapper} onKeyDown={onKeyDown}>

      {/* Section title */}
      <input
        type="text"
        value={title ?? ''}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Afsnitstitel"
        style={styles.titleInput}
      />

      {/* Material-specific inputs */}
      <div style={styles.inputs}>
        {children}
      </div>

      {/* Action bar */}
      <div style={styles.actionRow}>
        <button
          style={{ ...styles.btn, ...styles.btnRun, ...(runDisabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
          onClick={onRun}
          disabled={running || runDisabled}
          title={runDisabled ? 'Kør lastkombinations-blokken først' : 'Ctrl+Enter'}
        >
          {running ? '⏳  Beregner…' : runLabel}
        </button>
        {result && (
          <button style={styles.btn} onClick={onClear} disabled={running}>
            ✕  Ryd
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={styles.error}>
          <span style={styles.errorIcon}>⚠</span>
          {friendlyError(error)}
        </div>
      )}

      {/* Result panel */}
      {result && (
        <div style={styles.resultPanel}>

          {/* Summary bar — always visible */}
          <button
            style={styles.summaryBar}
            onClick={() => setResultOpen(o => !o)}
          >
            {/* Pass / fail badges */}
            {summary && summary.total > 0 && (
              <span style={styles.badges}>
                {summary.pass > 0 && (
                  <span style={{ ...styles.badge, ...styles.badgePass }}>
                    ✓ {summary.pass}
                  </span>
                )}
                {summary.fail > 0 && (
                  <span style={{ ...styles.badge, ...styles.badgeFail }}>
                    ✗ {summary.fail}
                  </span>
                )}
              </span>
            )}
            {util !== null && (
              <span
                title="Største udnyttelsesgrad"
                style={{ ...styles.util, color: utilColor(util) }}
              >
                η = {util.toFixed(2)}
              </span>
            )}
            <span style={styles.summaryLabel}>
              {resultOpen ? 'Skjul resultater' : 'Vis resultater'}
            </span>
            <span style={styles.summaryChevron}>{resultOpen ? '▲' : '▼'}</span>
          </button>

          {/* Full result — only when expanded */}
          {resultOpen && (
            <div style={styles.resultBody}>
              <CalcResultView blocks={result} />
            </div>
          )}

        </div>
      )}

    </div>
  )
}

const styles = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    gap:           10,
  },
  titleInput: {
    border:      'none',
    borderBottom: '2px solid #e2e8f0',
    padding:     '4px 0',
    fontSize:    14,
    fontWeight:  700,
    outline:     'none',
    fontFamily:  'inherit',
    width:       '100%',
    boxSizing:   'border-box',
    color:       '#0f172a',
    background:  'transparent',
    transition:  'border-color 0.15s',
  },
  inputs: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap:                 10,
    alignItems:          'end',
  },
  actionRow: {
    display: 'flex',
    gap:     8,
  },
  btn: {
    background:    '#f8fafc',
    border:        '1px solid #e2e8f0',
    padding:       '7px 14px',
    fontSize:      12,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    letterSpacing: '0.04em',
    color:         '#475569',
    transition:    'background 0.12s',
  },
  btnRun: {
    background:    '#1e3a5f',
    color:         '#fff',
    border:        '1px solid #1e3a5f',
    letterSpacing: '0.05em',
  },
  error: {
    background:  '#fdf3f2',
    border:      '1px solid #f5c6c6',
    padding:     '8px 12px',
    fontSize:    12,
    color:       '#c0392b',
    display:     'flex',
    gap:         8,
    alignItems:  'flex-start',
  },
  errorIcon: {
    flexShrink:  0,
    fontWeight:  700,
  },
  resultPanel: {
    border:    '1px solid #e8e8e8',
    marginTop: 2,
  },
  summaryBar: {
    display:         'flex',
    alignItems:      'center',
    gap:             8,
    width:           '100%',
    background:      '#f5f5f7',
    border:          'none',
    borderBottom:    '1px solid #e8e8e8',
    padding:         '7px 12px',
    cursor:          'pointer',
    fontFamily:      'inherit',
    textAlign:       'left',
  },
  badges: {
    display: 'flex',
    gap:     4,
  },
  badge: {
    fontSize:      10,
    fontWeight:    700,
    padding:       '2px 6px',
    borderRadius:  2,
    letterSpacing: '0.04em',
  },
  badgePass: {
    background: '#e8f8ef',
    color:      '#27ae60',
  },
  badgeFail: {
    background: '#fdf3f2',
    color:      '#c0392b',
  },
  util: {
    fontSize:   11,
    fontWeight: 700,
    fontFamily: 'var(--font-mono, monospace)',
  },
  summaryLabel: {
    fontSize: 11,
    color:    '#666',
    flex:     1,
  },
  summaryChevron: {
    fontSize: 9,
    color:    '#aaa',
  },
  resultBody: {
    padding: '8px 10px',
  },
}
