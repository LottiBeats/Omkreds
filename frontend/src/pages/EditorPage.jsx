/**
 * EditorPage.jsx — one project: rail, top bar and the open document.
 *
 * Where you are lives in the URL:
 *   /projects/:id/info     Projektbeskrivelse (metadata, project type, status)
 *   /projects/:id/A2       a document
 *   /projects/:id/A2/2     its second sub-document (A2.2)
 *   /projects/:id          → the last place you were, or the natural start
 *
 * so refresh, back/forward and a link sent to a colleague all land in the
 * same place.
 *
 * The pieces:
 *   useProjectPersistence  load, debounced save, conflicts          (hooks/)
 *   useBlockUndo           undo/redo per document                    (hooks/)
 *   docStatus / calcState  what state each document and block is in  (lib/)
 *   EditorRail, EditorTopBar, DocHeader, dialogs                     (components/editor/)
 *   DOC_TEMPLATES          "Start fra skabelon" per document         (templates/)
 */
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  generatePdf, generatePdfZip, generateWord, getCalcTemplates,
  saveProjectAsTemplate, createVersion, issueDocument,
} from '../api/client.js'
import { useConfirm, useToast } from '../ui/index.js'
import useProjectPersistence from '../hooks/useProjectPersistence.js'
import useBlockUndo from '../hooks/useBlockUndo.js'
import { blocksAt, withBlocks, withDoc, isProjectEmpty, locationKey } from '../lib/projectModel.js'
import { docCounts, docProblems } from '../lib/docStatus.js'
import { DOC_IDS, DOC_TITLES } from '../templates/docs.js'
import { DOC_TEMPLATES } from '../templates/docTemplates.js'
import { PROJECT_TYPES, makeProjectDocuments, optionsFor } from '../templates/projectTypes.js'

import BlockList from '../components/blocks/BlockList.jsx'
import EditorRail from '../components/editor/EditorRail.jsx'
import EditorTopBar from '../components/editor/EditorTopBar.jsx'
import DocHeader, { NameDialog } from '../components/editor/DocHeader.jsx'
import ExportCheckDialog from '../components/editor/ExportCheckDialog.jsx'
import { ConflictDialog, PdfPreview } from '../components/editor/EditorDialogs.jsx'
import ProjectInfoView from '../components/editor/ProjectInfoView.jsx'
import VersionHistoryModal from '../components/VersionHistoryModal.jsx'
import IssueDocumentModal from '../components/IssueDocumentModal.jsx'
import A1OptionsModal from '../components/A1OptionsModal.jsx'
import ProjectTypeModal from '../components/ProjectTypeModal.jsx'
// Opened rarely, and it renders calc results (KaTeX) — load it when needed.
const TemplateEditorModal = lazy(() => import('../components/TemplateEditorModal.jsx'))
import '../components/editor/editor.css'

const LAST_KEY = (id) => `omkreds.sidst.${id}`

/** Parse the part of the URL after /projects/:id into a location. */
function parseLocation(splat) {
  const [first, second] = (splat || '').split('/').filter(Boolean)
  if (!first) return { resolved: false }
  if (first === 'info') return { resolved: true, info: true, doc: null, sub: null }
  if (!DOC_IDS.includes(first)) return { resolved: false }
  const n = Number(second)
  const sub = second && Number.isInteger(n) && n >= 1 ? n - 1 : null
  return { resolved: true, info: false, doc: first, sub }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function isTextTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

const typeLabel = (b) => b.type

export default function EditorPage() {
  const { id: projectId, '*': splat } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const {
    project, loading, loadError, loadProject,
    save, saveSoon, flushSave, saveState,
    conflict, resolveConflictReload, resolveConflictOverwrite, adoptServerRev,
  } = useProjectPersistence(projectId)

  // ── Location ──────────────────────────────────────────────────────────────
  const parsed = parseLocation(splat)
  const docExists = !!(parsed.doc && project?.documents?.[parsed.doc])
  const subExists = parsed.sub === null || parsed.sub === undefined ||
                    !!project?.documents?.[parsed.doc]?.subdocs?.[parsed.sub]
  const loc = {
    info: !!parsed.info,
    doc:  parsed.doc ?? null,
    sub:  subExists ? (parsed.sub ?? null) : null,
  }
  const activeDoc = loc.doc
  const locKey = locationKey(loc)

  const go = useCallback((doc, sub = null, { replace = false } = {}) => {
    const path = doc === 'info' || !doc
      ? `/projects/${projectId}/info`
      : `/projects/${projectId}/${doc}${sub !== null && sub !== undefined ? `/${sub + 1}` : ''}`
    navigate(path, { replace })
  }, [navigate, projectId])

  const projectIsEmpty = useMemo(() => isProjectEmpty(project), [project])

  // Bare /projects/:id (or an unknown document): go to where the user was last,
  // or to the natural start — Projektbeskrivelse for a new project, A1 otherwise.
  useEffect(() => {
    if (!project) return
    if (parsed.resolved && (loc.info || docExists)) {
      // A sub-document index that no longer exists → its parent
      if (!subExists) go(loc.doc, null, { replace: true })
      return
    }
    let last = null
    try { last = localStorage.getItem(LAST_KEY(projectId)) } catch { /* private mode */ }
    const target = last && parseLocation(last).resolved ? last : (projectIsEmpty ? 'info' : 'A1')
    navigate(`/projects/${projectId}/${target}`, { replace: true })
  }, [project ? 1 : 0, splat])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!parsed.resolved) return
    try { localStorage.setItem(LAST_KEY(projectId), splat) } catch { /* private mode */ }
  }, [projectId, splat, parsed.resolved])

  // ── Calc templates ("Mine beregninger") ───────────────────────────────────
  const [calcTemplates, setCalcTemplates] = useState([])
  const loadCalcTemplates = useCallback(async () => {
    try { setCalcTemplates(await getCalcTemplates()) }
    catch (err) { console.warn('Could not load calc templates:', err) }
  }, [])
  useEffect(() => { loadCalcTemplates() }, [loadCalcTemplates])

  // ── Blocks, undo ──────────────────────────────────────────────────────────
  const undo = useBlockUndo(locKey)
  const currentBlocks = activeDoc ? blocksAt(project, loc) : []

  // The latest values for handlers that outlive a render (keyboard shortcuts,
  // the stable callbacks handed to BlockList).
  const live = useRef({})
  live.current = { project, loc, currentBlocks }

  const { record: undoRecord, undo: undoStep, redo: redoStep, clearAll: undoClear } = undo

  const updateBlocks = useCallback((newBlocks) => {
    const { project: p, loc: l, currentBlocks: cur } = live.current
    if (!p || !l.doc) return
    undoRecord(cur)
    saveSoon(withBlocks(p, l, newBlocks))
  }, [undoRecord, saveSoon])

  const handleUndo = useCallback(() => {
    const { project: p, loc: l, currentBlocks: cur } = live.current
    if (!p || !l.doc) return
    const prev = undoStep(cur)
    if (prev) save(withBlocks(p, l, prev))
  }, [undoStep, save])

  const handleRedo = useCallback(() => {
    const { project: p, loc: l, currentBlocks: cur } = live.current
    if (!p || !l.doc) return
    const next = redoStep(cur)
    if (next) save(withBlocks(p, l, next))
  }, [redoStep, save])

  // Keyboard: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for block undo — but inside a text
  // field the browser's own undo wins, so correcting a typo doesn't revert a
  // whole block edit. Ctrl+S saves now.
  useEffect(() => {
    function onKey(e) {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        flushSave(live.current.project).then(r => { if (r?.ok) toast.ok('Gemt') })
        return
      }
      if (isTextTarget(e.target)) return
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo, flushSave, toast])

  // ── Clipboard (copy a block, paste it into any document) ──────────────────
  const [clipboard, setClipboard] = useState(null)
  const onCopyBlock = useCallback((b) => {
    setClipboard(JSON.parse(JSON.stringify(b)))
    toast.info(`Kopieret: ${b.data?.title || b.type}. Indsæt med + mellem blokkene.`)
  }, [toast])

  // ── Jump to a block (from the export/issue checklists) ────────────────────
  const [focusRequest, setFocusRequest] = useState(null)
  const jumpTo = useCallback((problem) => {
    go(live.current.loc.doc, problem.sub)
    setFocusRequest({ id: problem.id, n: Date.now() })
  }, [go])

  // ── Metadata ──────────────────────────────────────────────────────────────
  const updateMeta = (newMeta) => project && save({ ...project, metadata: newMeta })

  // ── Sub-documents ─────────────────────────────────────────────────────────
  const [nameDialog, setNameDialog] = useState(null)   // { kind, docId, idx?, initial }

  function addSubdoc(docId, name) {
    const doc = project.documents[docId]
    const existingBlocks = doc.blocks ?? []
    const current = doc.subdocs ?? []
    // The first sub-document adopts the parent's blocks, as before
    const newSubdoc = { name, blocks: current.length === 0 ? existingBlocks : [] }
    const subdocs = [...current, newSubdoc]
    save(withDoc(project, docId, {
      ...doc,
      blocks: current.length === 0 ? [] : existingBlocks,
      subdocs,
    }))
    go(docId, subdocs.length - 1)
  }

  function renameSubdoc(docId, idx, name) {
    const doc = project.documents[docId]
    save(withDoc(project, docId, {
      ...doc,
      subdocs: (doc.subdocs ?? []).map((sd, i) => i === idx ? { ...sd, name } : sd),
    }))
  }

  async function deleteSubdoc(docId, idx) {
    const doc = project.documents[docId]
    const sd = doc.subdocs?.[idx]
    if (!sd) return
    const n = sd.blocks?.length ?? 0
    const ok = await confirm({
      title: `Slet underdokument "${sd.name}"?`,
      body: n ? `Det indeholder ${n} blok${n === 1 ? '' : 'ke'}. Den nuværende version kan hentes tilbage fra versionshistorikken.`
              : 'Underdokumentet er tomt.',
      confirmLabel: 'Slet underdokument',
      danger: true,
    })
    if (!ok) return
    save(withDoc(project, docId, { ...doc, subdocs: (doc.subdocs ?? []).filter((_, i) => i !== idx) }))
    if (loc.doc === docId && loc.sub !== null) {
      if (loc.sub === idx) go(docId)
      else if (loc.sub > idx) go(docId, loc.sub - 1, { replace: true })
    }
  }

  // ── Export & issue ────────────────────────────────────────────────────────
  const [busy, setBusy] = useState({ export: false, issue: false })
  const [exportCheck, setExportCheck] = useState(null)   // { what, run, problems }
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null)
  const [issueOpen, setIssueOpen] = useState(false)

  /** Run an export, but show the stale/unrun calculations by name first. */
  function withIntegrityCheck(what, run) {
    const problems = docProblems(project.documents[activeDoc], typeLabel)
    if (problems.length === 0) return run()
    setExportCheck({ what, run, problems })
  }

  async function saveBeforeExport(noun) {
    const res = await flushSave(project)
    if (!res?.ok && !res?.conflict) {
      toast.warn(`De seneste ændringer kunne ikke gemmes (${res?.error?.message ?? 'ukendt fejl'}). ${noun} laves fra den senest gemte version.`)
    }
    if (res?.recompressed) toast.info('Billederne er komprimeret, så projektet kunne gemmes.')
    return res
  }

  const fileBase = () => project.metadata.project_ref || projectId

  /** Shared wrapper for the four "get a file out" actions. */
  async function runExport(noun, failText, make) {
    setBusy(b => ({ ...b, export: true }))
    try {
      const res = await saveBeforeExport(noun)
      if (res?.conflict) return
      await make()
    } catch (err) {
      toast.fail(`${failText}: ${err.message}`)
    } finally {
      setBusy(b => ({ ...b, export: false }))
    }
  }

  const exportPdf = () => runExport('PDF\'en', 'PDF-generering fejlede', async () =>
    downloadBlob(await generatePdf(projectId, activeDoc), `${fileBase()}_${activeDoc}.pdf`))

  const exportZip = () => runExport('PDF\'erne', 'PDF-generering fejlede', async () =>
    downloadBlob(await generatePdfZip(projectId, activeDoc), `${fileBase()}_${activeDoc}_separate.zip`))

  const exportWord = () => runExport('Word-filen', 'Word-eksport fejlede', async () =>
    downloadBlob(await generateWord(projectId, activeDoc), `${fileBase()}_${activeDoc}.docx`))

  const previewPdf = () => runExport('Forhåndsvisningen', 'PDF-forhåndsvisning fejlede', async () => {
    const blob = await generatePdf(projectId, activeDoc)
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(URL.createObjectURL(blob))
  })

  function closePreview() {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(null)
  }

  /**
   * Issue the active document: record the revision, snapshot the project, then
   * download the PDF. The snapshot must be taken from the state the PDF is
   * generated from, or the revision row points at the wrong thing.
   */
  async function handleIssue(entry) {
    setBusy(b => ({ ...b, issue: true }))
    try {
      const res = await flushSave(project)
      if (!res?.ok) {
        if (!res?.conflict) {
          toast.fail('Kunne ikke gemme de seneste ændringer, så udstedelsen er afbrudt. ' +
                     'Et udstedt dokument skal svare til det, der er gemt.')
        }
        return
      }
      const { revision } = await issueDocument(projectId, activeDoc, entry)
      await loadProject()
      setIssueOpen(false)
      downloadBlob(await generatePdf(projectId, activeDoc), `${fileBase()}_${activeDoc}_rev${revision.rev}.pdf`)
      toast.ok(`${activeDoc} er udstedt som revision ${revision.rev} og gemt i versionshistorikken.`)
    } catch (err) {
      toast.fail(`Udstedelse fejlede: ${err.message}`)
    } finally {
      setBusy(b => ({ ...b, issue: false }))
    }
  }

  // ── Templates & project type ──────────────────────────────────────────────
  const [pendingTemplate, setPendingTemplate] = useState(null)
  const [projectTypeOpen, setProjectTypeOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [tmplEditor, setTmplEditor] = useState(null)   // { initialId } | null

  async function handleApplyTemplate(tpl) {
    if (currentBlocks.length > 0) {
      const ok = await confirm({
        title: `Erstat indholdet med "${tpl.label}"?`,
        body: 'Det nuværende indhold i dokumentet erstattes. Du kan fortryde med Ctrl+Z.',
        confirmLabel: 'Erstat indhold',
      })
      if (!ok) return
    }
    // Some templates are generated from a description of the project — ask first.
    if (tpl.needsOptions) { setPendingTemplate(tpl); return }
    updateBlocks(tpl.make())
  }

  /**
   * A project type was picked and described — write every document it covers
   * in one save. All of them or none: documents generated from the same
   * answers are only worth anything because they agree.
   */
  async function applyProjectType(typeKey, opts) {
    const metadata = { ...(project.metadata ?? {}), _doc_options: opts }
    const generated = makeProjectDocuments(typeKey, opts, metadata)
    if (!generated) return

    // Overwriting four documents needs a restore point that definitely exists.
    if (!projectIsEmpty) {
      try {
        await flushSave(project)
        const label = PROJECT_TYPES.find(t => t.key === typeKey)?.label ?? 'projekttype'
        await createVersion(projectId, `Før projekttype: ${label}`, 'manual')
      } catch (err) {
        toast.fail('Kunne ikke gemme en version før projekttypen blev anvendt, så intet er ændret. ' + (err?.message ?? ''))
        return
      }
    }

    // Undo works per document and cannot describe a change that rewrites four.
    // The whole project is recoverable from Versionshistorik instead.
    undoClear()

    const documents = { ...project.documents }
    for (const [docId, blocks] of Object.entries(generated)) {
      documents[docId] = { ...(documents[docId] ?? { title: DOC_TITLES[docId], subdocs: [] }), blocks }
    }
    save({ ...project, metadata, documents })
    go('A1')
    toast.ok(`${Object.keys(generated).sort().join(', ')} er skrevet ud fra projektbeskrivelsen.`)
  }

  function applyTemplateWithOptions(opts) {
    const tpl = pendingTemplate
    setPendingTemplate(null)
    if (!tpl || !project) return
    if (tpl.projectType) return applyProjectType(tpl.projectType, opts)
    if (!activeDoc) return
    const metadata = { ...(project.metadata ?? {}), _doc_options: opts }
    const blocks = tpl.make(opts, metadata)
    undoRecord(currentBlocks)
    save(withBlocks({ ...project, metadata }, loc, blocks))
  }

  async function handleSaveAsTemplate(name) {
    setNameDialog(null)
    try {
      await flushSave(project)
      await saveProjectAsTemplate(projectId, { name, description: '', visibility: 'personal' })
      toast.ok(`Gemt som skabelon "${name}". Du finder den på forsiden under Skabeloner.`)
    } catch (err) {
      toast.fail('Skabelonen kunne ikke gemmes: ' + err.message)
    }
  }

  function downloadLocalCopy() {
    const local = conflict?.local ?? project
    if (!local) return
    const name = (local.metadata?.project_name || 'projekt').replace(/[^\wæøåÆØÅ-]+/g, '_')
    downloadBlob(new Blob([JSON.stringify(local, null, 2)], { type: 'application/json' }), `${name}-lokal-kopi.json`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading && !project) return <div className="ed-loading">Indlæser projektet…</div>
  if (!project) {
    return (
      <div className="ed-loading">
        {loadError?.status === 404 ? 'Projektet blev ikke fundet.' : `Projektet kunne ikke hentes: ${loadError?.message ?? ''}`}
        {' '}<button className="ed-link" onClick={() => navigate('/')}>Til alle projekter</button>
      </div>
    )
  }

  const currentDoc = activeDoc ? project.documents[activeDoc] : null
  const subName = loc.sub !== null ? currentDoc?.subdocs?.[loc.sub]?.name : null
  const crumb = loc.info ? 'Projektbeskrivelse'
    : activeDoc ? `${activeDoc}${loc.sub !== null ? `.${loc.sub + 1}` : ''} ${subName ?? DOC_TITLES[activeDoc]}` : null
  const docTitle = subName || currentDoc?.title || DOC_TITLES[activeDoc]

  return (
    <div className="ed-shell">
      <EditorTopBar
        project={project}
        crumb={crumb}
        saveState={saveState}
        onRetrySave={() => flushSave(project)}
        onBack={() => navigate('/')}
        undo={undo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        activeDoc={activeDoc}
        hasSubdocs={(currentDoc?.subdocs?.length ?? 0) > 0}
        busy={busy}
        onPreview={previewPdf}
        onExportPdf={() => withIntegrityCheck('Hent PDF', exportPdf)}
        onExportZip={() => withIntegrityCheck('Hent PDF\'er', exportZip)}
        onExportWord={() => withIntegrityCheck('Hent Word', exportWord)}
        onIssue={() => setIssueOpen(true)}
        onHistory={() => setHistoryOpen(true)}
        onSaveAsTemplate={() => setNameDialog({ kind: 'template', initial: project.metadata?.project_name || '' })}
      />

      <EditorRail
        project={project}
        active={loc}
        onGo={(doc, sub) => go(doc, sub)}
        onAddSubdoc={(docId) => setNameDialog({ kind: 'add-subdoc', docId, initial: '' })}
      />

      <main className="ed-main">
        <div className="ed-main-inner">
          {loc.info || !activeDoc ? (
            <ProjectInfoView
              project={project}
              isEmpty={projectIsEmpty}
              onChooseType={() => setProjectTypeOpen(true)}
              onSaveMeta={updateMeta}
              onGo={(doc) => go(doc)}
            />
          ) : (
            <>
              <DocHeader
                docId={activeDoc}
                doc={currentDoc}
                sub={loc.sub}
                title={docTitle}
                templates={DOC_TEMPLATES[activeDoc] ?? []}
                clipboard={clipboard}
                onClearClipboard={() => setClipboard(null)}
                onApplyTemplate={handleApplyTemplate}
                onAddSubdoc={(docId) => setNameDialog({ kind: 'add-subdoc', docId, initial: '' })}
                onRenameSubdoc={(docId, idx) => setNameDialog({
                  kind: 'rename-subdoc', docId, idx, initial: project.documents[docId]?.subdocs?.[idx]?.name ?? '',
                })}
                onDeleteSubdoc={deleteSubdoc}
              />
              <BlockList
                key={locKey}
                blocks={currentBlocks}
                onChange={updateBlocks}
                project={project}
                templates={calcTemplates}
                onManageTemplates={() => setTmplEditor({ initialId: null })}
                onOpenTemplateEditor={(id) => setTmplEditor({ initialId: id })}
                clipboard={clipboard}
                onCopyBlock={onCopyBlock}
                focusRequest={focusRequest}
              />
            </>
          )}
        </div>
      </main>

      {/* ── Dialogs ── */}
      {conflict && (
        <ConflictDialog
          conflict={conflict}
          onDownload={downloadLocalCopy}
          onReload={async () => {
            await resolveConflictReload()
            toast.info('Projektet er genindlæst med den nyeste version fra serveren.')
          }}
          onKeepMine={async () => {
            try {
              const res = await resolveConflictOverwrite(project)
              if (res?.ok) toast.ok('Dine ændringer er gemt. Den anden version ligger i versionshistorikken.')
            } catch (err) {
              toast.fail(err.message)
            }
          }}
        />
      )}

      {exportCheck && (
        <ExportCheckDialog
          docId={activeDoc}
          problems={exportCheck.problems}
          what={exportCheck.what}
          onJump={jumpTo}
          onClose={() => setExportCheck(null)}
          onConfirm={() => { const run = exportCheck.run; setExportCheck(null); run() }}
        />
      )}

      {nameDialog?.kind === 'add-subdoc' && (
        <NameDialog
          title={`Nyt underdokument i ${nameDialog.docId}`}
          label="Navn, fx Tag eller Fundament"
          confirmLabel="Opret"
          onClose={() => setNameDialog(null)}
          onSubmit={(name) => { setNameDialog(null); addSubdoc(nameDialog.docId, name) }}
        />
      )}
      {nameDialog?.kind === 'rename-subdoc' && (
        <NameDialog
          title="Omdøb underdokument"
          label="Navn"
          initial={nameDialog.initial}
          onClose={() => setNameDialog(null)}
          onSubmit={(name) => { setNameDialog(null); renameSubdoc(nameDialog.docId, nameDialog.idx, name) }}
        />
      )}
      {nameDialog?.kind === 'template' && (
        <NameDialog
          title="Gem som projektskabelon"
          label="Skabelonens navn"
          initial={nameDialog.initial}
          confirmLabel="Gem skabelon"
          onClose={() => setNameDialog(null)}
          onSubmit={handleSaveAsTemplate}
        />
      )}

      {projectTypeOpen && (
        <ProjectTypeModal
          hasContent={!projectIsEmpty}
          onClose={() => setProjectTypeOpen(false)}
          onChoose={key => {
            setProjectTypeOpen(false)
            const t = PROJECT_TYPES.find(x => x.key === key)
            // Nothing is written until the description dialog is confirmed.
            setPendingTemplate({
              label: t?.label ?? 'Projekttype',
              needsOptions: 'a1',
              projectType: key,
              initialOptions: optionsFor(key),
            })
          }}
        />
      )}

      {pendingTemplate?.needsOptions === 'a1' && (
        <A1OptionsModal
          metadata={project.metadata ?? {}}
          initial={pendingTemplate.initialOptions ?? project.metadata?._doc_options}
          docId={pendingTemplate.projectType ? 'A1' : activeDoc}
          onGenerate={applyTemplateWithOptions}
          onClose={() => setPendingTemplate(null)}
        />
      )}

      {issueOpen && activeDoc && (
        <IssueDocumentModal
          docId={activeDoc}
          docTitle={currentDoc?.title ?? DOC_TITLES[activeDoc] ?? ''}
          metadata={project.metadata ?? {}}
          revisions={currentDoc?.revisions ?? []}
          integrity={docCounts(currentDoc)}
          problems={docProblems(currentDoc, typeLabel)}
          onJump={(p) => { setIssueOpen(false); jumpTo(p) }}
          busy={busy.issue}
          onIssue={handleIssue}
          onClose={() => { if (!busy.issue) setIssueOpen(false) }}
        />
      )}

      {historyOpen && (
        <VersionHistoryModal
          projectId={projectId}
          onClose={() => setHistoryOpen(false)}
          onRestored={(restored) => {
            adoptServerRev(restored?._rev)
            undoClear()
            loadProject()
            toast.ok('Projektet er gendannet til en tidligere version.')
          }}
        />
      )}

      {tmplEditor && (
        <Suspense fallback={null}>
          <TemplateEditorModal
            initialTemplateId={tmplEditor.initialId}
            onClose={() => setTmplEditor(null)}
            onTemplatesChanged={loadCalcTemplates}
          />
        </Suspense>
      )}

      {pdfPreviewUrl && (
        <PdfPreview
          url={pdfPreviewUrl}
          docId={activeDoc}
          busy={busy.export}
          onDownload={exportPdf}
          onClose={closePreview}
        />
      )}
    </div>
  )
}
