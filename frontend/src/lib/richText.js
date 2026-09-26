/**
 * richText.js — plain text ⇄ the Word-like editor's document.
 *
 * A text block still stores one plain string in `data.text`; the backend and
 * every existing document read it as before (see backend/rich_text.py). The
 * editor shows it formatted:
 *
 *   **fed**  *kursiv*  ***begge***         inline marks
 *   • punkt                                 bullet list line (the templates' own convention)
 *   1. punkt                                numbered list line
 *   blank line                              new paragraph
 *   single newline                          line break inside a paragraph,
 *                                           or a list right under a paragraph
 *
 * Round trip is exact for anything the editor didn't touch: parse → serialize
 * gives back the same string, so opening a document never rewrites it.
 * Two node attributes carry what the document model would otherwise lose:
 *   joinPrev — this block follows the previous one after "\n", not "\n\n"
 *   indent   — leading spaces before the list markers ("  1. …")
 */

// ── Inline ────────────────────────────────────────────────────────────────────

// Same rules as backend/rich_text.py — keep them in step. A single star only
// opens after start/space/bracket and only closes before a non-word, so
// "1,35*G_k*1,5" stays arithmetic.
const INLINE = /\*\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*\*|\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*|(?:(?<=^)|(?<=[\s(\[„"']))\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}_*])/gmu

function textNode(text, marks) {
  return marks.length ? { type: 'text', text, marks: marks.map(type => ({ type })) } : { type: 'text', text }
}

/** One line of text → inline nodes. */
function parseInline(line) {
  const out = []
  let pos = 0
  for (const m of line.matchAll(INLINE)) {
    if (m.index > pos) out.push(textNode(line.slice(pos, m.index), []))
    if (m[1] !== undefined)      out.push(textNode(m[1], ['bold', 'italic']))
    else if (m[2] !== undefined) out.push(textNode(m[2], ['bold']))
    else                         out.push(textNode(m[3], ['italic']))
    pos = m.index + m[0].length
  }
  if (pos < line.length) out.push(textNode(line.slice(pos), []))
  return out
}

function serializeInline(nodes = []) {
  let s = ''
  for (const n of nodes) {
    if (n.type === 'hardBreak') { s += '\n'; continue }
    if (n.type !== 'text') continue
    const marks = new Set((n.marks ?? []).map(m => m.type))
    const b = marks.has('bold'), i = marks.has('italic')
    if (!b && !i) { s += n.text; continue }
    // Keep spaces outside the markers: "** fed **" would not read back as bold.
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.text)
    if (!core) { s += n.text; continue }
    const mk = b && i ? '***' : b ? '**' : '*'
    s += `${lead}${mk}${core}${mk}${trail}`
  }
  return s
}

// ── Blocks ────────────────────────────────────────────────────────────────────

const BULLET  = /^(\s*)•\s+(.*)$/
const ORDERED = /^(\s*)(\d+)\.\s+(.*)$/

function paragraph(lines, joinPrev) {
  const content = []
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' })
    content.push(...parseInline(line))
  })
  return { type: 'paragraph', attrs: { joinPrev }, ...(content.length ? { content } : {}) }
}

function listItem(text) {
  const content = parseInline(text)
  return { type: 'listItem', content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }] }
}

/** Plain text → editor document (ProseMirror JSON). */
export function parseText(text) {
  const blocks = []
  const chunks = String(text ?? '').split('\n\n')
  chunks.forEach((chunk) => {
    const lines = chunk.split('\n')
    let firstInChunk = true
    let i = 0
    while (i < lines.length) {
      const joinPrev = !firstInChunk
      const b = BULLET.exec(lines[i])
      const o = !b && ORDERED.exec(lines[i])
      if (b) {
        const indent = b[1]
        const items = []
        while (i < lines.length && BULLET.test(lines[i])) items.push(listItem(BULLET.exec(lines[i++])[2]))
        blocks.push({ type: 'bulletList', attrs: { joinPrev, indent }, content: items })
      } else if (o) {
        const indent = o[1]
        const start = Number(o[2])
        const items = []
        let expected = start
        // Consecutive numbering only — "1. …" then "3. …" are two lists.
        while (i < lines.length) {
          const m = ORDERED.exec(lines[i])
          if (!m || Number(m[2]) !== expected) break
          items.push(listItem(m[3])); i++; expected++
        }
        blocks.push({ type: 'orderedList', attrs: { joinPrev, indent, start }, content: items })
      } else {
        const para = []
        while (i < lines.length && !BULLET.test(lines[i]) && !ORDERED.test(lines[i])) para.push(lines[i++])
        blocks.push(paragraph(para, joinPrev))
      }
      firstInChunk = false
    }
  })
  if (!blocks.length) blocks.push({ type: 'paragraph', attrs: { joinPrev: false } })
  return { type: 'doc', content: blocks }
}

function itemText(item) {
  // A list item holds paragraphs; nested lists are flattened to their text.
  return (item.content ?? []).map(p =>
    p.type === 'paragraph' ? serializeInline(p.content)
      : (p.content ?? []).map(itemText).join(' ')
  ).join(' ')
}

function serializeBlock(b) {
  const indent = b.attrs?.indent ?? ''
  if (b.type === 'bulletList') {
    return (b.content ?? []).map(it => `${indent}• ${itemText(it)}`).join('\n')
  }
  if (b.type === 'orderedList') {
    const start = Number(b.attrs?.start ?? 1)
    return (b.content ?? []).map((it, k) => `${indent}${start + k}. ${itemText(it)}`).join('\n')
  }
  return serializeInline(b.content)
}

/** Editor document → plain text. */
export function serializeDoc(doc) {
  let s = ''
  ;(doc?.content ?? []).forEach((b, i) => {
    if (i > 0) s += b.attrs?.joinPrev ? '\n' : '\n\n'
    s += serializeBlock(b)
  })
  return s
}
