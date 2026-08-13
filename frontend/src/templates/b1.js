/**
 * b1.js — B1 Statisk projektredegørelse
 *
 * B1 describes the same building A1 does, from a different angle. Today the two
 * are typed independently, which means a project can — and in practice does —
 * end up stating CC2 in A1 and CC3 in B1. Generating both from one set of
 * answers removes that failure mode entirely.
 *
 * BR18 § 501 requires B1 to contain a building description, the construction
 * class selection, the project organisation, and a **document list**. The old
 * template had a hardcoded bullet list of document names that was identical in
 * every project and said nothing about revisions — so the document list is now
 * a live `doclist` block that reads the project's actual documents and their
 * issued revisions when it renders.
 */
import { suggestCC, suggestKK, ANVENDELSER, MATERIALER, DEFAULT_OPTIONS } from './a1.js'

/** Join a list the way Danish prose does: "beton, stål og træ". */
function ogListe(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} og ${items[items.length - 1]}`
}

export function makeB1Template(options = {}, metadata = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options,
              materialer: { ...DEFAULT_OPTIONS.materialer, ...(options.materialer || {}) } }
  const m = metadata || {}

  const { cc, row, begrundelse } = suggestCC(o)
  const kkResult = suggestKK({ ...o, cc })
  const kk   = kkResult.kk
  const brug = MATERIALER.filter(x => o.materialer[x.key]).map(x => x.label)

  let id = Date.now()
  const B = []
  const push = (type, data) => B.push({ id: id++, type, data })
  const H = (level, text) => push('heading', { level, text })
  const T = (text) => push('text', { text })

  H(1, 'B1 Statisk projektredegørelse')
  T(
    'Nærværende projektredegørelse beskriver projekteringen og udførelsen af de bærende ' +
    'konstruktioner iht. BR18 § 501 og SBi-anvisning 271, 3. udgave.'
  )

  H(2, '1. Projekt- og konstruktionstype')
  T(
    `Projektets betegnelse: ${m.project_name || '…'}\n` +
    `Sagsnr.: ${m.project_ref || '…'}\n` +
    `Bygherre: ${m.client || '…'}\n` +
    `Adresse/matrikel: ${m.address || '…'}\n` +
    `Konstruktionstype: ${o.konstruktionstype}\n` +
    `Anvendelse: ${row.navn}`
  )

  H(2, '2. Konstruktivt system')
  T(
    `Bygningen er ${o.etager} etage${o.etager === 1 ? '' : 'r'} over terræn ` +
    `${o.kaelder ? 'med kælder' : 'uden kælder'}, udført i ` +
    `${brug.length ? ogListe(brug).toLowerCase() : '[materiale]'}. ` +
    `Største konstruktionsspændvidde er ${o.spaendvidde} m.\n\n` +
    'Overordnet beskrivelse af det bærende system:\n' +
    '• Bærende elementer (bjælker, søjler, dæk, vægge): …\n' +
    '• Primær bærende retning: …\n' +
    '• Spændvidder og etagehøjder: …\n' +
    '• Principper for lastnedføring: …\n\n' +
    'Uddybende beskrivelse findes i A1 Konstruktionsgrundlag, afsnit 1.2 og 4.1.'
  )

  H(2, '3. Fundering')
  T(
    'Funderingsprincip: [direkte fundering / pælefundering]\n' +
    'Fundamenttype: [punktfundamenter / stribefundamenter / pladefundament]\n' +
    'Fundamentskote: +… m DVR90\n' +
    'Bæredygtig jordbundsydelse: sigma = … kN/m²\n\n' +
    (o.geoteknisk
      ? 'Funderingsforholdene er fastlagt på grundlag af den geotekniske rapport, jf. A1 afsnit 3.2.'
      : 'Der foreligger ikke en geoteknisk rapport. Funderingsforholdene er fastlagt på ' +
        'grundlag af [grundlag] og skal bekræftes inden udførelse, jf. A1 afsnit 3.2.')
  )

  H(2, '4. Stabilisering')
  T(
    'Vandret stabilisering: [skiver / rammer / kerner / kryds]\n' +
    'Lodret lastnedføring: [bærende vægge / søjlesystem]\n\n' +
    'Beskriv de stabiliserende elementers placering og funktion i både x- og y-retningen, ' +
    'samt hvordan de vandrette kræfter føres til fundamentet. Uddybes i A1 afsnit 4.1.2.'
  )

  H(2, '5. Konsekvensklasse og konstruktionsklasse')
  T(
    `Konsekvensklasse: CC${cc}\n` +
    `Konstruktionsklasse: ${kk}   (BR18 ${kkResult.regel})\n` +
    `Pålidelighedsklasse: RC${cc}\n` +
    `K_FI-faktor (STR/GEO): ${cc === 1 ? '0,9' : cc === 3 ? '1,1' : '1,0'}\n\n` +
    `Begrundelse for konsekvensklasse:\n${begrundelse}\n\n` +
    `Begrundelse for konstruktionsklasse:\n${kkResult.begrundelse}` +
    (kkResult.dokumentationskrav ? `\n\nOBS: ${kkResult.dokumentationskrav}` : '') +
    (kkResult.kraeverVurdering ? `\n\n${kkResult.kraeverVurdering}` : '') +
    `\n\nIndplaceringen er den samme som i A1 afsnit 2.2 og skal følges ad ved ændringer.`
  )

  H(2, '6. Organisation og koordinering')
  T(
    'Projekterende for de bærende konstruktioner: ' + (m.firm_name || '…') + '\n' +
    'Udarbejdet af: ' + (m.engineer || '…') + '\n' +
    'Kontrol af projektering: ' + (m.checker || '…') +
    (kk === 'KK2' ? ' (uafhængig kontrol, jf. DS 1140 for KK2)'
      : kk === 'KK3' ? ' (ekstern uvildig kontrol, jf. DS 1140 for KK3)' : '') + '\n' +
    'Godkendt af: ' + (m.approver || '…') + '\n' +
    (cc >= 3 ? 'Certificeret statiker: …\n' : '') +
    '\nAnsvarsfordeling og grænseflader:\n' +
    '[Beskriv hvilke konstruktionsafsnit der projekteres af andre (fx leverandørprojekterede ' +
    'elementer, trapper, altaner), og hvordan grænsefladerne koordineres. Se A1 tabel 1.1.]\n\n' +
    'Kontrollen planlægges i B2 Statisk kontrolplan og dokumenteres i B3 Statisk kontrolrapport.'
  )

  H(2, '7. Dokumentliste')
  T('Det statiske projektmateriale omfatter nedenstående dokumenter med deres senest udstedte revision.')
  // Live block: reads the project's documents and revision history when it
  // renders, so the list cannot fall out of step with what has been issued.
  push('doclist', {})

  H(2, '8. Særlige konstruktive forhold og forudsætninger')
  {
    const punkter = []
    if (o.eksisterende) punkter.push('• Eksisterende konstruktioner indgår i projektet — bæreevne og tilstand er beskrevet i A1 afsnit 3.4.')
    if (o.naboer)       punkter.push('• Tilstødende bygværker påvirker eller påvirkes af projektet — se A1 afsnit 3.5 og 3.6.')
    if (!o.geoteknisk)  punkter.push('• Der foreligger ikke en geoteknisk rapport — funderingsforudsætningerne skal bekræftes inden udførelse.')
    if (Number(o.anvendelseNr) === 12) punkter.push('• Påkørselslast skal eftervises for parkeringsdækket, jf. DS/EN 1991-1-7.')
    T(
      (punkter.length
        ? punkter.join('\n') + '\n\n'
        : '') +
      'Angiv øvrige særlige forudsætninger, begrænsninger eller opmærksomhedspunkter:\n…'
    )
  }

  return B
}
