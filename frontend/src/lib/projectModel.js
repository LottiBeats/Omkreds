/**
 * projectModel.js — pure helpers for reading and writing a project's blocks.
 *
 * A location is { doc: 'A2', sub: null | 0-based index }. Everything returns a
 * new project object and leaves untouched documents as they were, which the
 * status caches in docStatus.js rely on.
 */
import { DOC_TITLES } from '../templates/docs.js'

export function blocksAt(project, loc) {
  if (!project || !loc?.doc) return []
  const doc = project.documents?.[loc.doc]
  if (loc.sub !== null && loc.sub !== undefined) return doc?.subdocs?.[loc.sub]?.blocks ?? []
  return doc?.blocks ?? []
}

export function withBlocks(project, loc, blocks) {
  const doc = project.documents[loc.doc]
  const next = (loc.sub !== null && loc.sub !== undefined)
    ? { ...doc, subdocs: (doc.subdocs ?? []).map((sd, i) => i === loc.sub ? { ...sd, blocks } : sd) }
    : { ...doc, blocks }
  return { ...project, documents: { ...project.documents, [loc.doc]: next } }
}

export function withDoc(project, docId, doc) {
  return { ...project, documents: { ...project.documents, [docId]: doc } }
}

/** Older projects predate some document categories — fill in the missing ones. */
export function withAllDocuments(project) {
  const docs = { ...(project.documents || {}) }
  for (const [docId, title] of Object.entries(DOC_TITLES)) {
    if (!docs[docId]) docs[docId] = { title, blocks: [], subdocs: [] }
  }
  return { ...project, documents: docs }
}

/** True when no document or sub-document has a single block. */
export function isProjectEmpty(project) {
  const docs = Object.values(project?.documents ?? {})
  if (docs.length === 0) return false
  return docs.every(d =>
    (d?.blocks?.length ?? 0) === 0 &&
    (d?.subdocs ?? []).every(sd => (sd?.blocks?.length ?? 0) === 0))
}

export function locationKey(loc) {
  return loc?.doc ? `${loc.doc}:${loc.sub ?? ''}` : 'info'
}
