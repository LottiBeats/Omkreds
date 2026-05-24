/**
 * PythonBlock.jsx — Python script block
 *
 * Lets the user write Python code that runs on the backend.
 * Shows stdout output and matplotlib figures inline.
 *
 * Workflow:
 *   1. User writes code in the <textarea>
 *   2. User clicks "Run" → we POST the code to /calc/python-script
 *   3. Backend executes it with numpy/scipy/matplotlib available
 *   4. Backend returns { output, figures, error }
 *   5. We store the results in block.data and call onChange() to save them
 *
 * Props:
 *   block    — { id, type: "python_calc", data: { title, code, _output_text, _figs_b64, _error } }
 *   onChange — function(updatedBlock)
 */
import React, { useState, useEffect } from 'react'
import { runPythonScript } from '../../api/client.js'

export default function PythonBlock({ block, onChange }) {
  const d = block.data

  // `running` is local UI state — no need to store it in the block data.
  // When this component re-mounts, running will reset to false automatically.
  const [running,    setRunning]    = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)
  const hasOutput = !!(d._output_text || d._figs_b64?.length || d._error)
  useEffect(() => { if (hasOutput) setOutputOpen(true) }, [d._output_text, d._error])

  // Update one or more data fields and propagate to parent
  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  async function handleRun() {
    setRunning(true)
    try {
      const result = await runPythonScript(d.code)
      update({
        _output_text: result.output  ?? '',
        _figs_b64:    result.figures ?? [],
        _error:       result.error   ?? '',
      })
    } catch (err) {
      update({ _error: err.message, _output_text: '', _figs_b64: [] })
    } finally {
      setRunning(false)
    }
  }

  function handleClear() {
    update({ _output_text: '', _figs_b64: [], _error: '' })
  }

  return (
    <div style={styles.wrapper}>

      {/* Section title */}
      <input
        type="text"
        value={d.title ?? 'Python Script'}
        onChange={e => update({ title: e.target.value })}
        placeholder="Section title"
        style={styles.titleInput}
      />

      {/* Code editor — monospace textarea */}
      <textarea
        value={d.code ?? ''}
        onChange={e => update({ code: e.target.value })}
        rows={14}
        spellCheck={false}
        style={styles.codeArea}
      />

      {/* Action bar */}
      <div style={styles.actionRow}>
        <button
          style={{ ...styles.btn, ...styles.btnRun }}
          onClick={handleRun}
          disabled={running}
        >
          {running ? '⏳  Running…' : '▶  Run'}
        </button>
        <button
          style={styles.btn}
          onClick={handleClear}
          disabled={running}
        >
          ✕  Clear output
        </button>
      </div>

      {/* Output — collapsible summary bar */}
      {hasOutput && (
        <div style={styles.outputPanel}>
          <button style={styles.summaryBar} onClick={() => setOutputOpen(o => !o)}>
            {d._error
              ? <span style={{ fontSize: 10, fontWeight: 700, color: '#c0392b' }}>✗ Error</span>
              : <span style={{ fontSize: 10, fontWeight: 700, color: '#27ae60' }}>✓ Done</span>
            }
            <span style={{ fontSize: 11, color: '#666', flex: 1, marginLeft: 6 }}>
              {outputOpen ? 'Hide output' : 'Show output'}
            </span>
            <span style={{ fontSize: 9, color: '#aaa' }}>{outputOpen ? '▲' : '▼'}</span>
          </button>

          {outputOpen && (
            <div style={styles.outputBody}>
              {d._error && (
                <div style={styles.errorBox}>
                  <strong>Error:</strong>
                  <pre style={styles.errorPre}>{d._error}</pre>
                </div>
              )}
              {d._output_text && (
                <pre style={styles.outputPre}>{d._output_text}</pre>
              )}
              {(d._figs_b64 ?? []).map((b64, i) => (
                <img
                  key={i}
                  src={`data:image/png;base64,${b64}`}
                  alt={`Figure ${i + 1}`}
                  style={styles.figure}
                />
              ))}
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
    border:      '1px solid #e8e8e8',
    padding:     '6px 10px',
    fontSize:    13,
    fontWeight:  600,
    outline:     'none',
    fontFamily:  'inherit',
    width:       '100%',
  },
  codeArea: {
    width:       '100%',
    fontFamily:  '"Fira Code", "Cascadia Code", Consolas, monospace',
    fontSize:    12,
    lineHeight:  1.55,
    border:      '1px solid #e8e8e8',
    background:  '#1e1e2e',    // dark code editor background
    color:       '#cdd6f4',    // light text
    padding:     '12px 14px',
    resize:      'vertical',
    outline:     'none',
    tabSize:     4,
    minHeight:   200,
  },
  actionRow: {
    display: 'flex',
    gap:     8,
  },
  btn: {
    background:    '#f5f5f7',
    border:        '1px solid #e8e8e8',
    padding:       '7px 14px',
    fontSize:      12,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    letterSpacing: '0.04em',
  },
  btnRun: {
    background: '#111',
    color:      '#fff',
    border:     '1px solid #111',
  },
  outputPre: {
    background:  '#f5f5f7',
    border:      '1px solid #e8e8e8',
    padding:     '10px 12px',
    fontSize:    12,
    fontFamily:  'monospace',
    whiteSpace:  'pre-wrap',
    wordBreak:   'break-word',
    margin:      0,
  },
  errorBox: {
    background:  '#fdf3f2',
    border:      '1px solid #f5c6c6',
    padding:     '10px 12px',
    fontSize:    12,
    color:       '#c0392b',
  },
  errorPre: {
    margin:      '4px 0 0',
    fontFamily:  'monospace',
    fontSize:    11,
    whiteSpace:  'pre-wrap',
    wordBreak:   'break-word',
  },
  figure: {
    maxWidth:  '100%',
    border:    '1px solid #e8e8e8',
    display:   'block',
  },
  outputPanel: {
    border:    '1px solid #e8e8e8',
    marginTop: 2,
  },
  summaryBar: {
    display:      'flex',
    alignItems:   'center',
    width:        '100%',
    background:   '#f5f5f7',
    border:       'none',
    borderBottom: '1px solid #e8e8e8',
    padding:      '7px 12px',
    cursor:       'pointer',
    fontFamily:   'inherit',
    textAlign:    'left',
  },
  outputBody: {
    padding:       '10px 12px',
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
  },
}
