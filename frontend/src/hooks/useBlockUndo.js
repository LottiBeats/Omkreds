/**
 * useBlockUndo — undo/redo of block edits, kept per document.
 *
 * Before, the stacks were cleared whenever you switched document, so looking
 * something up in A1 cost you the undo history of A2. Now each location
 * (document or sub-document) keeps its own 50 steps for as long as the editor
 * is open.
 */
import { useCallback, useRef, useState } from 'react'

const LIMIT = 50

export default function useBlockUndo(locKey) {
  const stacks = useRef(new Map())   // key → { undo: [], redo: [] }
  const [, bump] = useState(0)

  const get = (key) => {
    let s = stacks.current.get(key)
    if (!s) { s = { undo: [], redo: [] }; stacks.current.set(key, s) }
    return s
  }

  /** Record the blocks as they were before an edit. */
  const record = useCallback((prevBlocks) => {
    const s = get(locKey)
    s.undo = [...s.undo.slice(-(LIMIT - 1)), prevBlocks]
    s.redo = []
    bump(n => n + 1)
  }, [locKey])

  /** Step back: returns the blocks to restore, or null. */
  const undo = useCallback((currentBlocks) => {
    const s = get(locKey)
    if (!s.undo.length) return null
    const prev = s.undo[s.undo.length - 1]
    s.undo = s.undo.slice(0, -1)
    s.redo = [...s.redo.slice(-(LIMIT - 1)), currentBlocks]
    bump(n => n + 1)
    return prev
  }, [locKey])

  const redo = useCallback((currentBlocks) => {
    const s = get(locKey)
    if (!s.redo.length) return null
    const next = s.redo[s.redo.length - 1]
    s.redo = s.redo.slice(0, -1)
    s.undo = [...s.undo.slice(-(LIMIT - 1)), currentBlocks]
    bump(n => n + 1)
    return next
  }, [locKey])

  /** Forget everything — for changes that rewrite several documents at once. */
  const clearAll = useCallback(() => { stacks.current = new Map(); bump(n => n + 1) }, [])

  const s = stacks.current.get(locKey)
  return {
    record, undo, redo, clearAll,
    canUndo: !!s?.undo.length,
    canRedo: !!s?.redo.length,
  }
}
