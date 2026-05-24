/**
 * CalcBlockShell.jsx — reusable wrapper for all Eurocode calc blocks
 *
 * The result panel is collapsible.  After a run it shows a one-line summary
 * (pass / fail counts) with a toggle to expand the full output.
 */
import React, { useState, useEffect } from 'react'
import CalcResultView from './CalcResultView.jsx'

// Map common Python/backend error strings to user-friendly messages
function friendlyError(msg) {
  if (!msg) return 'An unknown error occurred.'
  const m = msg.toLowerCase()
  if (m.includes('division by zero') || m.includes('zerodivisionerror'))
    return 'Division by zero — check that depth, span, and cross-section dimensions are not zero.'
  if (m.includes('not in catalog') || m.includes('section') && m.includes('not'))
    return `Section not found in the catalog. ${msg}`
  if (m.includes('sqrt') && m.includes('negative') || m.includes('math domain'))
    return 'Math error — the section is over-stressed. Increase depth or cross-section, then re-run.'
  if (m.includes('convergence') || m.includes('did not converge'))
    return 'The calculation did not converge. Check that inputs are within realistic ranges.'
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
  runLabel = '▶  Run check',
}) {
  // Collapse the result panel by default; auto-open when a new result arrives
  const [resultOpen, setResultOpen] = useState(false)

  useEffect(() => {
    if (result) setResultOpen(true)
  }, [result])

  const summary = summarise(result)

  return (
    <div style={styles.wrapper}>

      {/* Section title */}
      <input
        type="text"
        value={title ?? ''}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Section title"
        style={styles.titleInput}
      />

      {/* Material-specific inputs */}
      <div style={styles.inputs}>
        {children}
      </div>

      {/* Action bar */}
      <div style={styles.actionRow}>
        <button
          style={{ ...styles.btn, ...styles.btnRun }}
          onClick={onRun}
          disabled={running}
        >
          {running ? '⏳  Running…' : runLabel}
        </button>
        {result && (
          <button style={styles.btn} onClick={onClear} disabled={running}>
            ✕  Clear
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
            <span style={styles.summaryLabel}>
              {resultOpen ? 'Hide results' : 'Show results'}
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
