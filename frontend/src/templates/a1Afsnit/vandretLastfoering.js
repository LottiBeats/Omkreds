/**
 * vandretLastfoering.js — A1 afsnit 4.1.2 Vandret lastføring.
 *
 * Varianterne er skrevet efter, hvordan offentlige A1'ere beskriver den
 * vandrette lastvej for de typiske systemer:
 *   - hus med tag-/loftskive og vægskiver (Husberegning, Teknologisk
 *     Instituts murværkslærebog afsnit 4 "Husets totale stabilitet")
 *   - trækonstruktion afstivet med skråstolper og diagonaler (Naturstyrelsens
 *     shelters, PlusBolig-orangeriet)
 *   - hal med rammer på tværs og vindkryds på langs (værkstedsbygningen i
 *     Hvide Sande, orangeriet)
 *   - skivebyggeri af betonelementer (Trianglen, vandværket i Esbjerg,
 *     boligbyggeriet i Ebeltoft)
 *   - ombygning, hvor de eksisterende vægge stabiliserer (Nemingeniør)
 * og med de punkter, Dancert oftest finder mangler ved: glidning og væltning
 * af vægge, vridning ved excentrisk placerede vægge, og kombinationen med
 * størst vandret og mindst lodret last.
 */
import { ogListe } from '../a1.js'

const T = (text) => ({ type: 'text', data: { text } })

const TAGSKIVER = [
  { key: 'plader',     label: 'Plader på spær/lægter (krydsfiner, OSB, gips)', tekst: 'pladebeklædning, der er sømmet eller skruet til spær og remme' },
  { key: 'staalbaand', label: 'Vindstålbånd i tagfladen', tekst: 'vindstålbånd monteret diagonalt på spærenes overside' },
  { key: 'kryds',      label: 'Vindkryds/vindgitter i tagfladen', tekst: 'vindkryds i tagfladen' },
  { key: 'braedder',   label: 'Brædder med fer og not (tag og gulv)', tekst: 'høvlede brædder med fer og not i tag og gulv' },
  { key: 'daek',       label: 'Betondæk/elementdæk', tekst: 'dækelementer, der sammenstøbes i fugerne og forsynes med randarmering' },
]

const FORANKRINGER = [
  { key: 'beslag',  label: 'Vinkelbeslag og ankerbolte', tekst: 'vinkelbeslag og ankerbolte' },
  { key: 'rem',     label: 'Forankringsjern/rem boltet til sokkel', tekst: 'forankringsjern og en bundrem, der er boltet til soklen' },
  { key: 'sko',     label: 'Indstøbte stolpesko', tekst: 'indstøbte stolpesko' },
  { key: 'stoebt',  label: 'Indstøbt armering (beton/murværk)', tekst: 'indstøbt armering' },
]

const LANGS = [
  { key: 'yderst', label: 'Vindkryds i yderste fag', tekst: 'vindkryds i tag og facader i de yderste fag' },
  { key: 'midt',   label: 'Vindkryds i et midterfag', tekst: 'vindkryds i tag og facader i et midterfag, så længdeudvidelser ikke fastholdes' },
  { key: 'gavl',   label: 'Gavlvægge som skiver', tekst: 'gavlvæggene, der virker som skiver' },
]

const valg = (liste, key) => (liste.find(x => x.key === key) ?? liste[0]).tekst
const stabTekst = (o) => (o.stab.length ? ogListe(o.stab.map(x => x.tekst)) : '[stabiliserende system]')

// Det, der skal eftervises i A2.1 for ethvert stabiliserende system.
const EFTERVISNING =
  'I A2.1 eftervises de stabiliserende konstruktioner for glidning, væltning og løft i kombinationen med ' +
  'størst vandret og mindst lodret last (γ_G,inf), og vindlasten kombineres med de vandrette laster fra ' +
  'geometriske imperfektioner.'

export default {
  key: 'a1.vandret',
  titel: 'Vandret lastføring',

  spoergsmaal: [
    { key: 'tagskive', label: 'Hvordan virker tag/dæk som skive?', type: 'valg', valg: TAGSKIVER,
      hvis: (svar, o, v) => v !== 'beskrivelse' && !(v === 'eksisterende' && o.konstruktionstype === 'Ombygning') },
    { key: 'forankring', label: 'Hvordan forankres de stabiliserende dele?', type: 'valg', valg: FORANKRINGER,
      hvis: (svar, o, v) => ['skiver', 'skraastolper', 'rammer', 'kerner'].includes(v) },
    { key: 'langs', label: 'Hvad stabiliserer på langs?', type: 'valg', valg: LANGS,
      hvis: (svar, o, v) => v === 'rammer' },
  ],

  standardSvar: (o) => ({
    tagskive: o?.mat?.beton && o?.harDaek ? 'daek' : 'plader',
    forankring: o?.mat?.beton && !o?.mat?.trae ? 'stoebt' : 'beslag',
    langs: 'yderst',
  }),

  varianter: [
    {
      key: 'skiver',
      titel: 'Tag-/loftskive og vægskiver (huse i træ og murværk)',
      passer: (o) => o.stabilisering.skiver && !o.stabilisering.rammer && !o.stabilisering.kerne &&
        o.konstruktionstype !== 'Ombygning',
      skriv: (o, svar) => [T(
        'Vindlasten regnes at virke vinkelret på facader, gavle og tag. Facade- og gavlvæggene spænder lodret ' +
        `og afleverer halvdelen af lasten til fundamentet og halvdelen til ${o.harTag ? 'tag-/loftskiven' : 'dækskiven'}.\n\n` +
        `${o.harTag ? 'Tag-/loftskiven' : 'Dækskiven'} virker som skive ved ${valg(TAGSKIVER, svar.tagskive)} og ` +
        'fører de vandrette kræfter til de stabiliserende vægge (vægskiver), som står parallelt med ' +
        'kraftretningen. ' + (o.harTag && o.harDaek ? 'Etagedækket virker tilsvarende som skive i sit niveau. ' : '') +
        'Der er i begge hovedretninger stabiliserende vægge, og de er placeret, så de også kan optage den ' +
        'vridning, der opstår, når vægge og last ikke ligger symmetrisk.\n\n' +
        'Skiven forbindes til de stabiliserende vægge, og væggene forankres til fundamentet med ' +
        `${valg(FORANKRINGER, svar.forankring)}, så de kan optage glidning og løft. ` + EFTERVISNING
      )],
    },
    {
      key: 'skraastolper',
      titel: 'Trækonstruktion afstivet med skråstolper/diagonaler',
      passer: (o) => o.mat.trae && o.stabilisering.kryds && !o.stabilisering.skiver,
      skriv: (o, svar) => [T(
        'Bygningen afstives af et system af skråstolper og diagonaler mellem søjler, top- og bundremme, så de ' +
        'vandrette kræfter føres ned gennem konstruktionen som tryk og træk.\n\n' +
        'Vandrette laster på facader og tag fordeles gennem skivevirkning i ' +
        `${o.harTag ? 'tagfladen' : 'dækket'} (${valg(TAGSKIVER, svar.tagskive)}) til de stabiliserende ` +
        'felter. Fra de stabiliserende felter føres lasten via bundremme og samlinger til fundamenterne, som ' +
        `forankres med ${valg(FORANKRINGER, svar.forankring)}.\n\n` +
        'Skråstolper og diagonaler skal så vidt muligt mødes i samme punkt i knuderne; utilsigtede ' +
        'excentriciteter giver ekstra momenter i søjler og samlinger og medregnes i A2. ' + EFTERVISNING
      )],
    },
    {
      key: 'rammer',
      titel: 'Rammer på tværs, vindkryds på langs (haller og værksteder)',
      passer: (o) => o.stabilisering.rammer,
      skriv: (o, svar) => [T(
        'På tværs optages de vandrette laster af rammerne, som er stabile i eget plan på grund af ' +
        'rammevirkningen. Vindlasten på facaderne føres via facadebeklædning og -rigler til rammernes søjler og ' +
        'videre til fundamenterne.\n\n' +
        'På langs føres vindlasten på gavlene via tagfladen, der virker som skive ved ' +
        `${valg(TAGSKIVER, svar.tagskive)}, og via langsgående rigler/åse til ${valg(LANGS, svar.langs)}. ` +
        'Herfra føres lasten til fundamenterne.\n\n' +
        `Søjlefødderne forankres til fundamenterne med ${valg(FORANKRINGER, svar.forankring)}. ` + EFTERVISNING
      )],
    },
    {
      key: 'kerner',
      titel: 'Skivebyggeri: dækskiver og stabiliserende vægge/kerner',
      passer: (o) => o.stabilisering.kerne || (o.harDaek && o.mat.beton && !o.stabilisering.rammer && o.etager >= 3),
      skriv: (o, svar) => [T(
        'Byggeriet er et skivebyggeri. Vindlasten på facader og gavle føres af facadevæggene til tag- og ' +
        'etagedækkene, som virker som stive skiver' +
        (svar.tagskive === 'daek' ? ': dækelementerne sammenstøbes i fugerne, og der udføres randarmering og ' +
          'forankring mellem dæk og vægge, så hvert dæk virker som én skive' : '') + '.\n\n' +
        `Dækskiverne fører de vandrette kræfter til de stabiliserende ${o.stabilisering.kerne ? 'kerner og vægge' : 'vægge'} ` +
        `(${stabTekst(o)}), som står parallelt med kraftretningen; vægge vinkelret på kraftretningen optager ` +
        'rotationen. Lasten føres gennem etagerne, herunder gennem etagekryds, til fundamenterne. De ' +
        `stabiliserende vægge forankres med ${valg(FORANKRINGER, svar.forankring)}.\n\n` +
        'Lasten fordeles mellem de stabiliserende vægge efter deres stivhed og placering (elastisk fordeling ' +
        'med uendeligt stive dækskiver), og vridning fra excentrisk placerede vægge medregnes. Vægfelter over ' +
        'og under dør- og vinduesåbninger medregnes ikke. Skivekræfterne i dækkene eftervises. ' + EFTERVISNING
      )],
    },
    {
      key: 'eksisterende',
      titel: 'Tilbygning eller ombygning — eksisterende stabilitet',
      passer: (o) => o.konstruktionstype !== 'Nybyggeri',
      skriv: (o, svar) => [T(
        o.konstruktionstype === 'Tilbygning'
          ? `Tilbygningen stabiliseres selvstændigt af ${stabTekst(o)}, og der overføres ikke vandrette kræfter ` +
            `til den eksisterende bygning. ${o.harTag ? 'Tilbygningens tagflade' : 'Dækket'} virker som skive ved ` +
            `${valg(TAGSKIVER, svar.tagskive)}. ` + EFTERVISNING
          : 'Vandret last fra vind på gavle og facader optages som hidtil af de eksisterende stabiliserende ' +
            'vægge i de respektive retninger, og lasten føres gennem dæk og tag til dem og videre til ' +
            'fundamenterne.\n\n' +
            'Ombygningen ændrer ikke bygningens stabiliserende system. [Gennembrydes eller fjernes en væg, der ' +
            'indgår i stabiliteten, angives det her, sammen med hvordan stabiliteten så sikres; et hul i en ' +
            'stabiliserende væg kan gøre ombygningen kompleks, jf. BR18 § 487.]'
      )],
    },
    {
      key: 'beskrivelse',
      titel: 'Kort tekst ud fra projektbeskrivelsen',
      passer: () => false,
      skriv: (o) => [T(
        `Vindlasten optages af facaderne og føres via ${o.harTag ? 'tagfladen' : o.harDaek ? 'dækkene' : 'væggene'}` +
        `${o.harTag || o.harDaek ? ', der virker som skive,' : ''} til bygningens stabiliserende system: ` +
        `${stabTekst(o)}. ` +
        'Systemet stabiliserer bygningen i begge hovedretninger og fører de vandrette kræfter til ' +
        'fundamenterne, hvor de optages ved friktion og jordtryk.'
      )],
    },
  ],
}
