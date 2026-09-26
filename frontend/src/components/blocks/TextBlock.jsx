/**
 * TextBlock.jsx — the Word-like text block.
 *
 * Type straight into the page. Enter starts a new paragraph, Shift+Enter a
 * line break. A small toolbar appears while you write:
 *
 *   B  Fed (Ctrl+B)    I  Kursiv (Ctrl+I)    •  Punktliste    1.  Nummereret liste
 *
 * Typing "• " or "- " at the start of a line starts a bullet list, "1. " a
 * numbered one. Pasting from Word keeps bold, italic and lists.
 *
 * Unfilled template fields — [adresse], [matrikelnummer], a lone … — are
 * marked in yellow. Click one to select it and type the real value over it.
 *
 * Storage is unchanged: `data.text` is still a plain string (lib/richText.js
 * describes the format), so old documents, templates, PDF and Word all read
 * it as before.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { parseText, serializeDoc } from '../../lib/richText.js'
import { findPlaceholders } from '../../lib/placeholders.js'
import './TextBlock.css'

// joinPrev/indent keep the plain-text round trip exact (see richText.js).
// A new paragraph made with Enter is a real paragraph (blank line), so the
// attributes are not copied on split.
const LineLayout = Extension.create({
  name: 'lineLayout',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'bulletList', 'orderedList'],
      attributes: {
        joinPrev: {
          default: false,
          keepOnSplit: false,
          renderHTML: a => (a.joinPrev ? { 'data-join': '' } : {}),
          parseHTML: () => false,
        },
        indent: { default: '', keepOnSplit: false, rendered: false },
      },
    }]
  },
})

const placeholderKey = new PluginKey('placeholders')

function placeholderDecorations(doc) {
  const decos = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const p of findPlaceholders(node.text)) {
      decos.push(Decoration.inline(pos + p.from, pos + p.to, { class: 'rt-ph', title: 'Skal udfyldes — klik og skriv' }))
    }
  })
  return DecorationSet.create(doc, decos)
}

/** Yellow marks on unfilled fields; clicking one selects it, ready to type over. */
const Placeholders = Extension.create({
  name: 'placeholders',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: placeholderKey,
      state: {
        init: (_, { doc }) => placeholderDecorations(doc),
        apply: (tr, old) => (tr.docChanged ? placeholderDecorations(tr.doc) : old),
      },
      props: {
        decorations(state) { return placeholderKey.getState(state) },
        handleClick(view, pos) {
          const hit = placeholderKey.getState(view.state).find(pos, pos)
            .find(d => d.from <= pos && pos <= d.to)
          if (!hit) return false
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, hit.from, hit.to)))
          return true
        },
      },
    })]
  },
})

/** Tab / Shift+Tab indent and outdent list items, as in Word. */
const ListKeys = Extension.create({
  name: 'listKeys',
  addKeyboardShortcuts() {
    return {
      // Tab/Shift+Tab indent list items instead of leaving the editor
      Tab: () => this.editor.commands.sinkListItem('listItem'),
      'Shift-Tab': () => this.editor.commands.liftListItem('listItem'),
    }
  },
})

function ToolButton({ on, label, title, onRun, children }) {
  return (
    <button
      type="button"
      className={'rt-tool' + (on ? ' is-on' : '')}
      title={title}
      aria-label={label}
      aria-pressed={on}
      // mousedown, not click: keep the editor's selection and focus
      onMouseDown={e => { e.preventDefault(); onRun() }}
    >{children}</button>
  )
}

export default function TextBlock({ block, onChange }) {
  const text = block.data.text ?? ''
  const lastText = useRef(text)      // what the editor last emitted
  const blockRef = useRef(block)
  blockRef.current = block
  const [focused, setFocused] = useState(false)
  const [, rerender] = useState(0)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, codeBlock: false, code: false, blockquote: false,
        horizontalRule: false, strike: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      LineLayout,
      Placeholders,
      ListKeys,
    ],
    content: parseText(text),
    editorProps: {
      attributes: { class: 'rt', 'aria-label': 'Tekst', spellcheck: 'true', lang: 'da' },
    },
    onUpdate: ({ editor: ed }) => {
      const next = serializeDoc(ed.getJSON())
      if (next === lastText.current) return
      lastText.current = next
      const b = blockRef.current
      onChange({ ...b, data: { ...b.data, text: next } })
    },
    onSelectionUpdate: () => rerender(n => n + 1),   // keep the toolbar's on/off state current
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  })

  // Text changed from outside the editor (undo in the document, a template,
  // a restored version): load it, without echoing it back as an edit.
  useEffect(() => {
    if (!editor || text === lastText.current) return
    lastText.current = text
    editor.commands.setContent(parseText(text), false)
  }, [editor, text])

  const empty = !text.trim()

  return (
    <div className={'rt-wrap' + (focused ? ' is-focused' : '')}>
      {editor && focused && (
        <div className="rt-toolbar" role="toolbar" aria-label="Tekstformatering">
          <ToolButton on={editor.isActive('bold')} label="Fed" title="Fed (Ctrl+B)"
                      onRun={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolButton>
          <ToolButton on={editor.isActive('italic')} label="Kursiv" title="Kursiv (Ctrl+I)"
                      onRun={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolButton>
          <span className="rt-sep" />
          <ToolButton on={editor.isActive('bulletList')} label="Punktliste" title="Punktliste (skriv '- ' i starten af en linje)"
                      onRun={() => editor.chain().focus().toggleBulletList().run()}>•</ToolButton>
          <ToolButton on={editor.isActive('orderedList')} label="Nummereret liste" title="Nummereret liste (skriv '1. ' i starten af en linje)"
                      onRun={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolButton>
          <span className="rt-hint">Enter: nyt afsnit · Shift+Enter: linjeskift</span>
        </div>
      )}
      {empty && !focused && <div className="rt-empty">Skriv tekst her…</div>}
      <EditorContent editor={editor} />
    </div>
  )
}
