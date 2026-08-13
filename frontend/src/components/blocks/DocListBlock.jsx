/**
 * DocListBlock.jsx — the document list required in B1 (BR18 § 501)
 *
 * This block has no content of its own. It reads the project's documents and
 * their issue history every time it renders, in the editor and in the PDF
 * alike, so the list can never disagree with what has actually been issued.
 * That is the whole point: a hand-maintained document list is wrong the moment
 * anything is re-issued, and a wrong document list is worse than none.
 */
import { DOC_TITLES } from '../../templates/docs.js'

export default function DocListBlock({ data, project }) {
  const documents = project?.documents ?? {}

  const rows = Object.entries(DOC_TITLES).map(([docId, defaultTitle]) => {
    const doc = documents[docId] ?? {}
    const revisions = doc.revisions ?? []
    const hasContent = (doc.blocks?.length ?? 0) > 0 ||
                       (doc.subdocs ?? []).some(sd => (sd.blocks?.length ?? 0) > 0)

    if (revisions.length) {
      const last = revisions[revisions.length - 1]
      return {
        docId, title: doc.title || defaultTitle,
        rev: last.rev, date: last.date,
        by: last.by || '', checked: last.checked || '',
        state: 'issued',
      }
    }
    return {
      docId, title: doc.title || defaultTitle,
      rev: '—', date: hasContent ? 'Under udarbejdelse' : 'Ikke udarbejdet',
      by: '', checked: '',
      state: hasContent ? 'draft' : 'empty',
    }
  })

  return (
    <div style={S.wrap}>
      <div style={S.caption}>Dokumentliste — statisk dokumentation (BR18 § 501)</div>
      <table style={S.table}>
        <thead>
          <tr>
            {['Dok.', 'Titel', 'Rev.', 'Dato', 'Udarbejdet af', 'Kontrolleret af'].map(h => (
              <th key={h} style={S.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.docId}>
              <td style={{ ...S.td, fontWeight: 700 }}>{r.docId}</td>
              <td style={S.td}>{r.title}</td>
              <td style={{ ...S.td, textAlign: 'center', fontWeight: r.state === 'issued' ? 700 : 400 }}>{r.rev}</td>
              <td style={{ ...S.td, color: r.state === 'issued' ? '#1c1c1e' : '#94a3b8' }}>{r.date}</td>
              <td style={S.td}>{r.by}</td>
              <td style={S.td}>{r.checked}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={S.note}>
        Opdateres automatisk — rækkerne følger dokumenternes udstedte revisioner.
      </div>
    </div>
  )
}

const S = {
  wrap:    { padding: '4px 2px' },
  caption: { fontSize: 11, fontStyle: 'italic', color: '#64748b', marginBottom: 6 },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left', padding: '6px 8px', background: '#f1f5f9',
    border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 11,
  },
  td:   { padding: '5px 8px', border: '1px solid #e2e8f0', color: '#1c1c1e' },
  note: { fontSize: 10.5, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' },
}
