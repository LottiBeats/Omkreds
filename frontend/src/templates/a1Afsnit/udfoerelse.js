/**
 * udfoerelse.js — A1 afsnit 4.8 Udførelse.
 *
 * Grundteksten og afsnittene pr. materiale er de samme som altid. Hjælperen
 * lader en vælge, hvem der står for midlertidig afstivning, og hvordan
 * tilsynet er tænkt, og har en variant til ombygning, hvor det vigtigste er
 * understøtning af det eksisterende under udførelsen.
 */
const T = (text) => ({ type: 'text', data: { text } })

const AFSTIVNING = [
  { key: 'entreprenoer', label: 'Entreprenøren (midlertidigt afstivningsprojekt)' },
  { key: 'raadgiver',    label: 'Den statiske rådgiver angiver montagerækkefølge' },
]
const TILSYN = [
  { key: 'anbefales', label: 'Tilsyn anbefales' },
  { key: 'kontrolplan', label: 'Tilsyn efter kontrolplanen (B2)' },
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
    ? 'Montagerækkefølge og midlertidig afstivning fremgår af tegningerne. Afvigelser aftales med ' +
      'den statiske rådgiver, inden de udføres.'
    : 'Eventuel midlertidig afstivning hører til den arbejdsudførende i fuld udstrækning, ' +
      'inkl. evt. udarbejdelse af midlertidigt afstivningsprojekt.'
}

function tilsyn(svar) {
  return svar.tilsyn === 'kontrolplan'
    ? 'Der føres statisk tilsyn med udførelsen efter kontrolplanen (B2), og resultatet dokumenteres i ' +
      'kontrolrapporten (B3).'
    : 'Der regnes med god byggeskik og faglært arbejde på byggepladsen. Det anbefales, at der ' +
      'udføres tilsyn og kvalitetssikring i alle byggeriets faser.'
}

export default {
  key: 'a1.udfoerelse',
  titel: 'Udførelse',

  spoergsmaal: [
    { key: 'afstivning', label: 'Midlertidig afstivning', type: 'valg', valg: AFSTIVNING },
    { key: 'tilsyn', label: 'Tilsyn', type: 'valg', valg: TILSYN },
  ],

  standardSvar: () => ({ afstivning: 'entreprenoer', tilsyn: 'anbefales' }),

  varianter: [
    {
      key: 'nybyggeri',
      titel: 'Nybyggeri — generelt og pr. materiale',
      passer: (o) => o.konstruktionstype !== 'Ombygning',
      skriv: (o, svar) => [T(
        'Alle mål og koter er vejledende og skal kontrolleres på stedet inden udførelse.\n\n' +
        afstivning(svar) + '\n\n' + tilsyn(svar) + materialer(o)
      )],
    },
    {
      key: 'ombygning',
      titel: 'Ombygning — understøtning af det eksisterende',
      passer: (o) => o.konstruktionstype === 'Ombygning',
      skriv: (o, svar) => [T(
        'Alle mål og koter er vejledende og skal kontrolleres på stedet inden udførelse. De eksisterende ' +
        'konstruktioners udformning kontrolleres, når de blotlægges; afviger de fra forudsætningerne, ' +
        'kontaktes den statiske rådgiver, inden arbejdet fortsætter.\n\n' +
        'Inden bærende dele fjernes eller gennembrydes, understøttes de overliggende konstruktioner ' +
        'midlertidigt, og understøtningen bevares, til de nye konstruktioner er fuldt virksomme. ' +
        'Nye bjælker og overliggere kiles op mod det eksisterende, så lasten overføres uden sætninger.\n\n' +
        afstivning(svar) + '\n\n' + tilsyn(svar) + materialer(o)
      )],
    },
  ],
}
