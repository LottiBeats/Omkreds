/**
 * geoteknik.js — A1 afsnit 3.2 Geotekniske forhold.
 *
 * Normgrundlag: DS/EN 1997-1 DK NA:2021
 *   K.3   geoteknisk kategori. GK2 er det normale. GK1 kun for let byggeri på
 *         faste senglaciale eller ældre aflejringer uden risiko for naboer,
 *         og så med modelfaktor γs = 1,25 (A.3 (6)). GK3 ved særlige forhold:
 *         palæogent fedt ler, kalk med kaviteter, grundvandssænkning.
 *         Kategorien følger altså ikke konsekvensklassen -- appen skrev før
 *         GK = CC, så et CC1-hus blev GK1 uden modelfaktor.
 *   K.1(4) frostfri dybde 0,9 m for almindeligt byggeri, 1,2 m for
 *         fritstående (uopvarmede) konstruktioner.
 *
 * Formuleringerne bygger på offentlige A1'ere (shelters for Naturstyrelsen,
 * PlusBolig-orangeriet, Husberegning, vandværket i Esbjerg, Trianglen m.fl.):
 * henvisning til rapporten med firma og dato, OSBL og grundvand, valgt
 * funderingsmåde og en forudsætning om besigtigelse af udgravningen.
 * Det, der ikke er udfyldt, står som "…", så status tæller det som manglende.
 */
const T = (text) => ({ type: 'text', data: { text } })

const v = (s) => (s ?? '').trim() || '…'
// Sætningens punktum, uden at "…" bliver til "…."
const slut = (s) => (s.endsWith('…') || s.endsWith('.') ? s : s + '.')

const GK = [
  { key: '2', label: 'GK2 — normal (γs = 1,0)' },
  { key: '1', label: 'GK1 — let byggeri på fast, ældre aflejring (γs = 1,25)' },
  { key: '3', label: 'GK3 — særlige forhold' },
]

/** Kategorien med begrundelse, som de rigtige A1'ere skriver den. */
export function gkTekst(gk) {
  switch (String(gk)) {
    case '1':
      return 'Bygværket henføres til geoteknisk kategori 1 (DS/EN 1997-1 DK NA, anneks K.3): let byggeri, ' +
        'funderet på faste senglaciale eller ældre aflejringer, uden risiko for nabobygninger og ledninger. ' +
        'Partialkoefficienterne for jordparametre og modstandsevne multipliceres med modelfaktoren γs = 1,25.'
    case '3':
      return 'Bygværket henføres til geoteknisk kategori 3 (DS/EN 1997-1 DK NA, anneks K.3) på grund af ' +
        '[angiv forholdet, fx fedt ler af palæogen oprindelse eller grundvandssænkning].'
    default:
      return 'Bygværket henføres til geoteknisk kategori 2 (DS/EN 1997-1 DK NA, anneks K.3); modelfaktor γs = 1,0.'
  }
}

/** Frostfri dybde efter DK NA K.1 (4). */
const frost = (svar) => svar.opvarmet === 'nej'
  ? '1,2 m under terræn, da konstruktionen ikke er opvarmet'
  : '0,9 m under terræn'

const FUNDERINGSMAADER = [
  { key: 'pael',   label: 'Pæle (rammede eller borede)', tekst: 'pæle, der føres gennem de blødere lag og ned i de bæredygtige aflejringer' },
  { key: 'piller', label: 'Borede betonpiller', tekst: 'borede betonpiller, der føres ned til bæredygtige aflejringer' },
  { key: 'skruer', label: 'Skruefundamenter', tekst: 'skruefundamenter af stål, der skrues gennem fylden og ned i de bæredygtige aflejringer' },
  { key: 'sandpude', label: 'Sandpude (udskiftning)', tekst: 'en sandpude: fyld og sætningsgivende aflejringer bortgraves ned til bæredygtigt lag og erstattes af komprimeret sand eller grus, hvorpå fundamenterne udføres' },
]

export default {
  key: 'a1.geoteknik',
  titel: 'Geotekniske forhold',

  spoergsmaal: [
    { key: 'gk', label: 'Geoteknisk kategori', type: 'valg', valg: GK },
    { key: 'opvarmet', label: 'Er bygningen opvarmet? (frostfri dybde)', type: 'valg',
      valg: [{ key: 'ja', label: 'Ja (0,9 m)' }, { key: 'nej', label: 'Nej (1,2 m)' }],
      hvis: (svar, o, variant) => variant !== 'eksisterende' },
    { key: 'rapport', label: 'Geoteknisk rapport (firma, nr., dato)', type: 'tekst',
      pladsholder: 'fx Franck Geoteknik, rapport 2 af 25. februar 2026', hvis: (svar, o, v) => v === 'rapport' || v === 'dyb' },
    { key: 'obl', label: 'Overside af bæredygtige lag (OBL)', type: 'tekst', pladsholder: 'fx 1,2–2,3 m under terræn',
      hvis: (svar, o, v) => v === 'rapport' || v === 'dyb' },
    { key: 'grundvand', label: 'Grundvand', type: 'tekst', pladsholder: 'fx ikke truffet ved boringerne',
      hvis: (svar, o, v) => v === 'rapport' || v === 'dyb' },
    { key: 'sigma', label: 'Regningsmæssig bæreevne [kN/m²]', type: 'tekst', pladsholder: 'fx 150',
      hvis: (svar, o, v) => v === 'rapport' },
    { key: 'maade', label: 'Funderingsmåde', type: 'valg', valg: FUNDERINGSMAADER, hvis: (svar, o, v) => v === 'dyb' },
  ],

  standardSvar: (o) => ({
    gk: '2', opvarmet: 'ja', rapport: '', obl: '', grundvand: '', sigma: '',
    maade: o?.fundering === 'pael' ? 'pael' : 'piller',
  }),

  varianter: [
    {
      key: 'rapport',
      titel: 'Der foreligger en geoteknisk rapport — direkte fundering',
      passer: (o) => o.geoteknisk && !['eksisterende', 'pael'].includes(o.fundering),
      skriv: (o, svar) => [
        T(`Funderingsforholdene fremgår af den geotekniske rapport: ${slut(v(svar.rapport))} ` +
          `Bæredygtige aflejringer er truffet med overside i ${v(svar.obl)}. Grundvand: ${slut(v(svar.grundvand))}\n\n` +
          `Der funderes direkte på ${o.fund.tekst}, ført ned til bæredygtige aflejringer, dog mindst til frostfri ` +
          `dybde, ${frost(svar)} (DS/EN 1997-1 DK NA, K.1 (4)). Der regnes med en regningsmæssig bæreevne på ` +
          `${v(svar.sigma)} kN/m².\n\n` +
          gkTekst(svar.gk) + '\n\n' +
          'Fundamentsbunden besigtiges inden støbning. Afviger jordbundsforholdene fra rapporten, kontaktes den ' +
          'geotekniske og den statiske rådgiver, inden arbejdet fortsætter.'),
      ],
    },
    {
      key: 'dyb',
      titel: 'Bæredygtige lag ligger dybt — pæle, piller, skruer eller sandpude',
      passer: (o) => o.fundering === 'pael',
      skriv: (o, svar) => {
        const m = FUNDERINGSMAADER.find(x => x.key === svar.maade) ?? FUNDERINGSMAADER[0]
        return [T(
          `Funderingsforholdene fremgår af den geotekniske rapport: ${slut(v(svar.rapport))} ` +
          `Over de bæredygtige aflejringer findes fyld og andre sætningsgivende lag; overside af bæredygtige lag ` +
          `(OBL) er truffet i ${v(svar.obl)}. Grundvand: ${slut(v(svar.grundvand))}\n\n` +
          'Da de bæredygtige lag ligger dybt, er direkte fundering uhensigtsmæssig: den kræver omfattende ' +
          'udgravning og bortskaffelse af jord og giver risiko for skred i dybe render. ' +
          `Der funderes i stedet på ${m.tekst}. Gulvet udføres selvbærende mellem fundamenterne, så det ikke ` +
          'belaster fylden.\n\n' +
          'Fylden regnes ikke for at give vandret modhold; vandrette kræfter optages i de bæredygtige lag. ' +
          'Antal, dimension og længde af ' + (svar.maade === 'sandpude' ? 'udskiftningen' : 'pæle/piller/skruer') +
          ' fastlægges ved dimensioneringen i A2.\n\n' +
          gkTekst(svar.gk)
        )]
      },
    },
    {
      key: 'ingen',
      titel: 'Ingen geotekniske undersøgelser — fundering på intakt jord',
      passer: (o) => !o.geoteknisk && !['eksisterende', 'pael'].includes(o.fundering),
      skriv: (o, svar) => [
        T('Der foreligger ikke geotekniske undersøgelser. Det forudsættes, at der kan udføres direkte fundering ' +
          `på ${o.fund.tekst}, ført ned til intakte, bæredygtige aflejringer, dog mindst til frostfri dybde, ` +
          `${frost(svar)} (DS/EN 1997-1 DK NA, K.1 (4)). Fyld, muld, tørv, gytje og omgravet jord betragtes ikke ` +
          'som bæredygtigt.\n\n' +
          gkTekst(svar.gk) + '\n\n' +
          'Forudsætningen kontrolleres ved besigtigelse af udgravningen inden støbning. Træffes der ikke ' +
          'bæredygtige aflejringer i den forudsatte dybde, kontaktes den statiske rådgiver, og der foretages ' +
          'eventuelt en geoteknisk undersøgelse.'),
      ],
    },
    {
      key: 'senere',
      titel: 'Den geotekniske rapport udarbejdes i næste fase',
      passer: () => false,
      skriv: (o, svar) => [
        T('De geotekniske forhold er endnu ikke undersøgt, og den geotekniske rapport udarbejdes i næste ' +
          `projektfase. Indtil da forudsættes fundering på ${o.fund.tekst} på intakte, bæredygtige aflejringer i ` +
          `frostfri dybde, ${frost(svar)}.\n\n` +
          gkTekst(svar.gk) + '\n\n' +
          'Forudsætningerne kontrolleres, når rapporten foreligger, og A1 og de statiske beregninger opdateres, ' +
          'hvis rapporten giver anledning til det.'),
      ],
    },
    {
      key: 'eksisterende',
      titel: 'Eksisterende fundamenter genbruges',
      passer: (o) => o.fundering === 'eksisterende',
      skriv: (o, svar) => [
        T('Der funderes på de eksisterende fundamenter. Lasten på fundamenterne øges ikke væsentligt i forhold ' +
          'til i dag, og fundamenterne har gennem bygningens levetid vist tilstrækkelig bæreevne. ' +
          '[Angiv grundlaget: prøvegravning, tegninger eller beregning, og en eventuel lastforøgelse.]\n\n' +
          gkTekst(svar.gk) + '\n\n' +
          'Ved udgravning langs eksisterende fundamenter sikres, at udgravningen er stabil, og at fundamenterne ' +
          'kan bære uden den jord, der fjernes. Afviger fundamenternes udformning eller tilstand fra ' +
          'forudsætningen, når de blotlægges, kontaktes den statiske rådgiver.'),
      ],
    },
  ],
}
