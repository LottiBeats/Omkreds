/**
 * geoteknik.js — A1 afsnit 3.2 Geotekniske forhold.
 *
 * Geoteknisk kategori følger konsekvensklassen, som appen altid har gjort
 * (GK = CC, højst 3). Værdier fra rapporten kan skrives i hjælperen; det,
 * der ikke er udfyldt, står som "…", så status tæller det som manglende.
 */
const T = (text) => ({ type: 'text', data: { text } })

const v = (s) => (s ?? '').trim() || '…'
// Sætningens punktum, uden at "…" bliver til "…."
const slut = (s) => (s.endsWith('…') || s.endsWith('.') ? s : s + '.')
const gk = (o) => `GK${Math.min(o.cc, 3)}`

export default {
  key: 'a1.geoteknik',
  titel: 'Geotekniske forhold',

  spoergsmaal: [
    { key: 'rapport', label: 'Geoteknisk rapport (firma, nr., dato)', type: 'tekst',
      pladsholder: 'fx GEO, rapport 12345, 3. marts 2026', hvis: (svar, o, variant) => variant === 'rapport' },
    { key: 'sigma', label: 'Bæreevne / jordbundsydelse [kN/m²]', type: 'tekst', pladsholder: 'fx 150',
      hvis: (svar, o, variant) => variant === 'rapport' },
    { key: 'kote', label: 'Funderingsniveau', type: 'tekst', pladsholder: 'fx 1,0 m under terræn',
      hvis: (svar, o, variant) => variant === 'rapport' },
    { key: 'grundvand', label: 'Grundvand', type: 'tekst', pladsholder: 'fx ikke truffet ved boringerne',
      hvis: (svar, o, variant) => variant === 'rapport' },
  ],

  standardSvar: () => ({ rapport: '', sigma: '', kote: '', grundvand: '' }),

  varianter: [
    {
      key: 'rapport',
      titel: 'Der foreligger en geoteknisk rapport',
      passer: (o) => o.geoteknisk && o.fundering !== 'eksisterende',
      skriv: (o, svar) => {
        // Uden noget udfyldt skrives appens hidtidige skema med felter.
        const udfyldt = ['rapport', 'sigma', 'kote', 'grundvand'].some(k => (svar[k] ?? '').trim())
        if (!udfyldt) {
          return [T(
            `Geoteknisk kategori: ${gk(o)} (DS/EN 1997-1)\n\n` +
            'Funderingsforhold (fra den geotekniske rapport, se afsnit 2.5):\n' +
            '  Bæredygtig jordbundsydelse: σ = … kN/m²\n' +
            '  Fundamentskote (underkant): +… m DVR90 (ca. … m under terræn)\n' +
            '  Frostfri dybde: 0,9 m (DK NA til DS/EN 1997-1)\n' +
            '  Grundvandskote: +… m DVR90\n\n' +
            'Jordparametre (karakteristiske værdier):\n' +
            '  Friktionsvinkel: φ_k = … °\n' +
            '  Kohæsion: c_k = … kPa\n' +
            '  Effektiv rumvægt: γ_k = … kN/m³'
          )]
        }
        return [T(
          `Funderingsforholdene er beskrevet i den geotekniske rapport: ${slut(v(svar.rapport))} ` +
          `Bygværket henføres til geoteknisk kategori ${gk(o)} (DS/EN 1997-1).\n\n` +
          `Der funderes på ${o.fund.tekst} i ${v(svar.kote)}, dog mindst i frostfri dybde (0,9 m under terræn). ` +
          `Der regnes med en regningsmæssig bæreevne på ${v(svar.sigma)} kN/m². Grundvand: ${slut(v(svar.grundvand))}\n\n` +
          'Udgravningen besigtiges inden støbning, og afviger jordbundsforholdene fra rapporten, ' +
          'kontaktes den geotekniske og den statiske rådgiver.'
        )]
      },
    },
    {
      key: 'senere',
      titel: 'Rapporten udarbejdes i næste fase',
      passer: () => false,
      skriv: (o) => [T(
        'De geotekniske forhold er endnu ikke undersøgt, og den geotekniske rapport udarbejdes i næste ' +
        `projektfase. Indtil da henføres de permanente konstruktioner til geoteknisk kategori ${gk(o)}, og ` +
        `der forudsættes fundering på ${o.fund.tekst} på intakt, bæredygtig jord i frostfri dybde.\n\n` +
        'Forudsætningerne kontrolleres, når rapporten foreligger, og A1 og de statiske beregninger ' +
        'opdateres, hvis rapporten giver anledning til det.'
      )],
    },
    {
      key: 'ingen',
      titel: 'Ingen rapport — fundering på intakt jord',
      passer: (o) => !o.geoteknisk && o.fundering !== 'eksisterende',
      skriv: (o) => [T(
        `Der foreligger ikke en geoteknisk rapport for projektet. Der funderes på ${o.fund.tekst}, ` +
        'ført til frostfri dybde (mindst 0,9 m under terræn) på intakt, bæredygtig jord. ' +
        'Forudsætningen kontrolleres ved besigtigelse af udgravningen inden støbning; afviger ' +
        'jordbundsforholdene, kontaktes den statiske rådgiver.'
      )],
    },
    {
      key: 'eksisterende',
      titel: 'Eksisterende fundamenter genbruges',
      passer: (o) => o.fundering === 'eksisterende',
      skriv: () => [T(
        'Der funderes på de eksisterende fundamenter. Lasten på fundamenterne øges ikke væsentligt i ' +
        'forhold til i dag, og fundamenterne har gennem bygningens levetid vist sig at have tilstrækkelig ' +
        'bæreevne. [Angiv grundlaget: prøvegravning, tegninger eller beregning, og evt. lastforøgelse.]\n\n' +
        'Afviger fundamenternes udformning eller tilstand fra forudsætningen, når de blotlægges, ' +
        'kontaktes den statiske rådgiver.'
      )],
    },
  ],
}
