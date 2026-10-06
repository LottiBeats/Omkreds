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
import { suggestCC, suggestKK, MATERIALER, DEFAULT_OPTIONS, baerendeSystem, ogListe } from './a1.js'

export function makeB1Template(options = {}, metadata = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options,
              materialer: { ...DEFAULT_OPTIONS.materialer, ...(options.materialer || {}) } }
  const m = metadata || {}

  const { cc, row, begrundelse } = suggestCC(o)
  const kkResult = suggestKK({ ...o, cc })
  const kk   = kkResult.kk
  const brug = MATERIALER.filter(x => o.materialer[x.key]).map(x => x.label)
  const { fund, stab, harTag, harDaek, dele } = baerendeSystem(o)
  const stabTekst = stab.length ? ogListe(stab.map(x => x.tekst)) : '[stabiliserende system]'

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
    `Projektets betegnelse: ${m.project_name || '[projektnavn]'}\n` +
    (m.project_ref ? `Sagsnr.: ${m.project_ref}\n` : '') +
    `Bygherre: ${m.client || '[bygherre]'}\n` +
    `Adresse/matrikel: ${m.address || '[adresse]'}, matr. ${m.matrikel || '[matrikelnummer]'}\n` +
    `Konstruktionstype: ${o.konstruktionstype}\n` +
    `Anvendelse: ${row.navn}`
  )

  H(2, '2. Konstruktivt system')
  T(
    `Bygningen er ${o.etager} etage${o.etager === 1 ? '' : 'r'} over terræn ` +
    `${o.kaelder ? 'med kælder' : 'uden kælder'}, udført i ` +
    `${brug.length ? ogListe(brug).toLowerCase() : '[materiale]'}. ` +
    `Største konstruktionsspændvidde er ${o.spaendvidde} m.\n\n` +
    `Det bærende system består af ${dele.length ? ogListe(dele) : '[bærende dele]'}. ` +
    `De lodrette laster føres ${harTag || harDaek ? `fra ${[harTag && 'tag', harDaek && 'dæk'].filter(Boolean).join(' og ')} ` : ''}` +
    `via bjælker, vægge og søjler til ${fund.bestemt}.\n\n` +
    'Uddybende beskrivelse findes i A1 Konstruktionsgrundlag, afsnit 1.2 og 4.1.'
  )

  H(2, '3. Fundering')
  T(
    `Funderingsprincip: ${o.fundering === 'pael' ? 'pælefundering' : o.fundering === 'eksisterende' ? 'eksisterende fundering' : 'direkte fundering'}\n` +
    `Fundamenttype: ${fund.label.toLowerCase()}\n\n` +
    (o.geoteknisk
      ? 'Funderingsforholdene, herunder fundamentskote og bæreevne, er fastlagt på grundlag af ' +
        'den geotekniske rapport, jf. A1 afsnit 3.2.'
      : 'Der foreligger ikke en geoteknisk rapport. Der funderes i frostfri dybde på intakt, ' +
        'bæredygtig jord, og forudsætningen kontrolleres ved besigtigelse af udgravningen, ' +
        'jf. A1 afsnit 3.2.')
  )

  H(2, '4. Stabilisering')
  T(
    `Vandret stabilisering: ${stabTekst}\n\n` +
    `Vindlasten føres via ${harTag ? 'tagfladen' : harDaek ? 'dækkene' : 'væggene'} til ${stabTekst}, ` +
    'som stabiliserer bygningen i begge hovedretninger og fører de vandrette kræfter til ' +
    'fundamenterne. Uddybes i A1 afsnit 4.1.2.'
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
    'Projekterende for de bærende konstruktioner: ' + (m.firm_name || '[firma]') + '\n' +
    'Udarbejdet af: ' + (m.engineer || '[udarbejdet af]') + '\n' +
    'Kontrol af projektering: ' + (m.checker || '[kontrolleret af]') +
    (kk === 'KK2' ? ' (en anden person end den, der har udført delen; BR18 kap. 30)'
      : kk === 'KK3' ? ' (certificeret statiker, der ikke har deltaget i projekteringen; BR18 kap. 30)'
      : kk === 'KK4' ? ' (certificeret statiker, der ikke har deltaget i projekteringen, samt tredjepartskontrol; BR18 kap. 30)'
      : '') + '\n' +
    (m.approver ? 'Godkendt af: ' + m.approver + '\n' : '') +
    // Certificeret statiker kræves i KK2–KK4, ikke kun ved CC3.
    (['KK2', 'KK3', 'KK4'].includes(kk) ? 'Certificeret statiker: …\n' : '') +
    (kk === 'KK4' ? 'Tredjepartskontrollant: …\n' : '') +
    '\nAnsvarsfordeling og grænseflader:\n' +
    `Alle bærende konstruktioner projekteres af ${m.firm_name || 'den statiske rådgiver'}. ` +
    'Projekteres dele af andre, fx leverandørprojekterede elementer, fremgår det af A1 tabel 1.1, ' +
    'og grænsefladerne koordineres af den statiske rådgiver.\n\n' +
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
        ? punkter.join('\n')
        : 'Der er ingen særlige konstruktive forhold ud over det, der er beskrevet i A1.')
    )
  }

  return B
}
