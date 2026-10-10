/**
 * udfoerelse.js — A1 afsnit 4.8 Udførelse.
 *
 * Skrevet efter, hvordan offentlige A1'ere beskriver udførelsen:
 *   - konstruktionerne er dimensioneret for den færdige tilstand, og
 *     stabilitet og påvirkninger i byggeperioden er entreprenørens ansvar
 *     (PlusBolig-orangeriet, Naturstyrelsens shelters)
 *   - systemprodukter udføres efter leverandørens anvisninger
 *   - ved ombygning: midlertidig understøtning med jokker og soldater efter
 *     en afstivningstegning, før bærende dele fjernes (Nemingeniør), og
 *     kontrol af det eksisterende, når det blotlægges (DTU/BUILD: "Mindre
 *     indgreb i eksisterende konstruktioner", 2025)
 * og med udførelsesklasser og kontrol efter DS/INF 1140 og DS/EN 1990 DK NA,
 * anneks B5 (egenkontrol altid; uafhængig kontrol efter kontrolplanen).
 */
const T = (text) => ({ type: 'text', data: { text } })

const AFSTIVNING = [
  { key: 'entreprenoer', label: 'Entreprenøren har ansvaret i byggeperioden' },
  { key: 'raadgiver',    label: 'Montagerækkefølge og afstivning fremgår af tegningerne' },
]
const TILSYN = [
  { key: 'anbefales',   label: 'Egenkontrol; tilsyn anbefales' },
  { key: 'kontrolplan', label: 'Uafhængig kontrol efter kontrolplanen (B2)' },
]

function materialer(o) {
  return [
    o.mat.trae && '\n\nTræ: Konstruktionstræ indbygges med et fugtindhold på højst 18 % og beskyttes ' +
      'mod nedbør i byggeperioden. Samlinger udføres med de beslag og forbindelsesmidler, der er ' +
      'angivet på tegningerne, og med de angivne kant- og endeafstande.',
    o.mat.staal && `\n\nStål: Stålkonstruktioner udføres i udførelsesklasse EXC${Math.min(o.cc, 3)} iht. DS/EN 1090-2.`,
    o.mat.beton && '\n\nBeton: Betonarbejder udføres iht. DS/EN 13670. Afforskalling sker først, ' +
      'når betonen har opnået tilstrækkelig styrke.',
    o.mat.murvaerk && '\n\nMurværk: Murværk udføres iht. DS/EN 1996-2, og bærende vægge afstives ' +
      'midlertidigt, indtil dæk og tag er monteret.',
  ].filter(Boolean).join('')
}

function afstivning(svar) {
  return svar.afstivning === 'raadgiver'
    ? 'Montagerækkefølge og midlertidig afstivning fremgår af tegningerne. Afvigelser aftales med den ' +
      'statiske rådgiver, inden de udføres.'
    : 'Med mindre andet er angivet, er konstruktionerne dimensioneret for den virkemåde, de har i den færdige ' +
      'konstruktion. Den udførende er ansvarlig for konstruktionernes stabilitet og ydeevne i byggeperioden og ' +
      'under transport, herunder midlertidig afstivning og eventuelt afstivningsprojekt. Udførelsesrækkefølgen ' +
      'vælges af den udførende.'
}

function tilsyn(svar) {
  return svar.tilsyn === 'kontrolplan'
    ? 'Udførelsen kontrolleres efter kontrolplanen (B2) og DS 1140: den udførende udfører og dokumenterer ' +
      'egenkontrol, og den uafhængige kontrol udføres og dokumenteres i kontrolrapporten (B3).'
    : 'Den udførende udfører og dokumenterer egenkontrol (DS/EN 1990 DK NA, anneks B5). Der regnes med god ' +
      'byggeskik og faglært arbejde, og det anbefales, at der føres tilsyn i alle byggeriets faser.'
}

export default {
  key: 'a1.udfoerelse',
  titel: 'Udførelse',

  spoergsmaal: [
    { key: 'afstivning', label: 'Stabilitet i byggeperioden', type: 'valg', valg: AFSTIVNING },
    { key: 'tilsyn', label: 'Kontrol af udførelsen', type: 'valg', valg: TILSYN },
    { key: 'tegning', label: 'Tegning med afstivningsprincip', type: 'tekst', pladsholder: 'fx K-103',
      hvis: (svar, o, v) => v === 'ombygning' },
  ],

  standardSvar: () => ({ afstivning: 'entreprenoer', tilsyn: 'anbefales', tegning: '' }),

  varianter: [
    {
      key: 'nybyggeri',
      titel: 'Nybyggeri — ansvar, kontrol og pr. materiale',
      passer: (o) => o.konstruktionstype !== 'Ombygning',
      skriv: (o, svar) => [T(
        'Bygværket udføres efter tegninger og beskrivelser. Alle mål og koter kontrolleres på stedet inden ' +
        'udførelse, og systemprodukter (spær, elementer, beslag) monteres efter leverandørens anvisninger.\n\n' +
        afstivning(svar) + '\n\n' + tilsyn(svar) + materialer(o)
      )],
    },
    {
      key: 'ombygning',
      titel: 'Ombygning — understøtning af det eksisterende',
      passer: (o) => o.konstruktionstype === 'Ombygning',
      skriv: (o, svar) => {
        const tg = (svar.tegning ?? '').trim() || '[tegning]'
        return [T(
          'Alle mål og koter kontrolleres på stedet inden udførelse. De eksisterende konstruktioners ' +
          'udformning og tilstand kontrolleres, når de blotlægges; afviger de fra forudsætningerne, kontaktes ' +
          'den statiske rådgiver, inden arbejdet fortsætter.\n\n' +
          'Inden bærende dele fjernes eller gennembrydes, understøttes de overliggende konstruktioner ' +
          `midlertidigt efter afstivningsprincippet på tegning ${tg}, fx med jokker og soldater på begge sider ` +
          'af væggen. Understøtningen bevares, til de nye konstruktioner er fuldt virksomme. Nye bjælker ' +
          'lægges af på en udstøbt eller udmuret vederlagspude, og der kiles op mod det eksisterende, så ' +
          'lasten overføres uden sætninger.\n\n' +
          afstivning(svar) + '\n\n' + tilsyn(svar) + materialer(o)
        )]
      },
    },
  ],
}
