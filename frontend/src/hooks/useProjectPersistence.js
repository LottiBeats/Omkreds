/**
 * useProjectPersistence — load a project and keep the server in step with it.
 *
 * Moved out of EditorPage; the write path behaves as before:
 *
 *   Serialised writes.  Saves are chained, so two in-flight requests can never
 *   reach the server out of order (which would look like a conflict against
 *   ourselves and could resurrect older content).
 *
 *   Revision tracking.  We send the rev we last saw and store the rev the
 *   server hands back.  If somebody else saved in between, the backend answers
 *   409 and writes stop until the user has chosen what to keep.
 *
 * New: a save state the top bar can show ("Gemmer…" / "Gemt 14:02" / "Ikke
 * gemt"), and a warning when the tab is closed with changes still pending.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getProject, saveProject, createVersion } from '../api/client.js'
import { withAllDocuments } from '../lib/projectModel.js'

const DEBOUNCE_MS = 800

export default function useProjectPersistence(projectId) {
  const [project,   setProject]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [saveState, setSaveState] = useState({ status: 'idle', at: null, error: null })
  const [conflict,  setConflict]  = useState(null)

  const revRef       = useRef(null)
  const saveQueue    = useRef(Promise.resolve())
  const conflictRef  = useRef(false)
  const timerRef     = useRef(null)
  const pendingRef   = useRef(null)   // project waiting for the debounce to fire
  const inFlightRef  = useRef(0)

  const loadProject = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const data = await getProject(projectId)
      revRef.current = typeof data._rev === 'number' ? data._rev : null
      setProject(withAllDocuments(data))
      return true
    } catch (err) {
      setLoadError(err)
      return false
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadProject() }, [loadProject])

  const persist = useCallback((updated) => {
    const run = async () => {
      if (conflictRef.current) return { ok: false, conflict: true }
      inFlightRef.current++
      setSaveState(s => ({ ...s, status: 'saving' }))
      try {
        const payload = revRef.current == null ? updated : { ...updated, _rev: revRef.current }
        const res = await saveProject(payload)
        if (typeof res?._rev === 'number') revRef.current = res._rev
        setSaveState({ status: 'saved', at: new Date(), error: null })
        return { ok: true }
      } catch (err) {
        if (err?.status === 409) {
          conflictRef.current = true
          setConflict({
            updatedBy: err.detail?.updated_by || '',
            updatedAt: err.detail?.updated_at || '',
            local:     updated,
          })
          setSaveState(s => ({ ...s, status: 'conflict', error: err }))
          return { ok: false, conflict: true, error: err }
        }
        setSaveState(s => ({ ...s, status: 'error', error: err }))
        return { ok: false, error: err }
      } finally {
        inFlightRef.current--
      }
    }
    saveQueue.current = saveQueue.current.then(run, run)
    return saveQueue.current
  }, [])

  /** Replace the project and save it now. */
  const save = useCallback((updated) => {
    clearTimeout(timerRef.current)
    pendingRef.current = null
    setProject(updated)
    return persist(updated)
  }, [persist])

  /** Replace the project and save it once typing pauses. */
  const saveSoon = useCallback((updated) => {
    setProject(updated)
    pendingRef.current = updated
    setSaveState(s => (s.status === 'saving' ? s : { ...s, status: 'pending' }))
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const p = pendingRef.current
      pendingRef.current = null
      if (p) persist(p)
    }, DEBOUNCE_MS)
  }, [persist])

  /**
   * Save whatever is pending now and wait for it. Used before export and
   * issue so the backend reads the latest results. On 413 (project too large)
   * images are recompressed and the save retried, so the report still gets them.
   */
  const flushSave = useCallback(async (current) => {
    clearTimeout(timerRef.current)
    const target = pendingRef.current ?? current
    pendingRef.current = null
    if (!target) return { ok: true }

    const res = await persist(target)
    if (res?.ok || res?.conflict) return res

    const msg = res?.error?.message ?? ''
    const is413 = res?.error?.status === 413 || msg.includes('413') || msg.toLowerCase().includes('too large')
    if (!is413) return res
    try {
      const compressed = await recompressProjectImages(target)
      const retry = await persist(compressed)
      if (retry?.ok) setProject(compressed)
      return retry?.ok ? { ok: true, recompressed: true } : retry
    } catch (err) {
      return { ok: false, error: err }
    }
  }, [persist])

  // Warn before closing the tab with changes that haven't reached the server.
  useEffect(() => {
    const onUnload = (e) => {
      if (pendingRef.current || inFlightRef.current > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // Leaving the editor inside the app (back to the dashboard) must not drop
  // the last edit that is still waiting for its debounce.
  useEffect(() => () => {
    clearTimeout(timerRef.current)
    if (pendingRef.current) persist(pendingRef.current)
  }, [persist])

  // ── Save conflict resolution ─────────────────────────────────────────────
  // Writes stay frozen until the user picks a side — the one thing we must
  // never do is guess.

  /** Discard our unsaved changes and load the version that is on the server. */
  const resolveConflictReload = useCallback(async () => {
    conflictRef.current = false
    setConflict(null)
    pendingRef.current = null
    await loadProject()
    setSaveState({ status: 'saved', at: new Date(), error: null })
  }, [loadProject])

  /** Keep our version. The other version is snapshotted first, never lost. */
  const resolveConflictOverwrite = useCallback(async (fallback) => {
    const local = conflict?.local ?? fallback
    // Snapshot what is currently on the server, so their work is recoverable
    // from the version history even though we are about to replace it.
    await createVersion(projectId, 'Før overskrivning', 'manual')
    const server = await getProject(projectId)
    revRef.current = typeof server._rev === 'number' ? server._rev : null
    conflictRef.current = false
    setConflict(null)
    setProject(local)
    return persist(local)
  }, [conflict, persist, projectId])

  /** Take the server's rev after a restore from the version history. */
  const adoptServerRev = useCallback((rev) => {
    revRef.current = typeof rev === 'number' ? rev : null
  }, [])

  return {
    project, setProject, loading, loadError, loadProject,
    save, saveSoon, flushSave, saveState,
    conflict, resolveConflictReload, resolveConflictOverwrite, adoptServerRev,
  }
}

// ── Image recompression (413 fallback) ────────────────────────────────────────
// Re-compress every image in a project to JPEG 85 % / 1920 px max.
// Returns a new project object — never mutates the original.

function recompressB64(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || dataUrl.includes('data:image/svg+xml')) { resolve(dataUrl); return }
    const img = new window.Image()
    img.onload = () => {
      let { width, height } = img
      const maxDim = 1920
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
        else { width = Math.round(width * maxDim / height); height = maxDim }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function recompressProjectImages(proj) {
  const clone = JSON.parse(JSON.stringify(proj))
  if (clone.metadata?.cover_image_b64) {
    clone.metadata.cover_image_b64 = await recompressB64(clone.metadata.cover_image_b64)
  }
  for (const doc of Object.values(clone.documents || {})) {
    const lists = [doc.blocks || [], ...(doc.subdocs || []).map(sd => sd.blocks || [])]
    for (const blocks of lists) {
      for (const block of blocks) {
        if (block.type === 'image' && block.data?.image_b64) {
          block.data.image_b64 = await recompressB64(block.data.image_b64)
        }
      }
    }
  }
  return clone
}
