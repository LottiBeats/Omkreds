# Grasshopper: eksempelfiler og læringsvej for indeklima og dagslys

Alle filer herunder er Ladybug Tools' officielle eksempler. De følger med, når
Ladybug Tools installeres, og ligger også på GitHub:
https://github.com/ladybug-tools/lbt-grasshopper-samples (mappen `samples/`, AGPL-3.0).
De er derfor ikke kopieret ind i repoet.

## Anbefalet rækkefølge

| # | Fil | Hvad den lærer dig | Bruges på Hjerlesvej til |
|---|---|---|---|
| 1 | `honeybee-energy/shoe_box_thermal_comfort.gh` + `Rhino/shoe_box.3dm` | Ét rum, simulering, operativ temperatur | Hurtig test af det værste rum (soverum 1. sal i A-huset) |
| 2 | `honeybee-energy/creating_constructions.gh` | Opbygninger lag for lag, U-værdier | Ydervæg, tag og terrændæk efter DS 418 |
| 3 | `honeybee-energy/window_constructions_with_dynamic_shades.gh` | Vinduer med g-værdi og styret solafskærmning | Udvendig afskærmning mod SV, solafskærmende glas |
| 4 | `honeybee-energy/simple_natural_ventilation.gh` | Udluftning via vinduesåbning | Første runde af udluftning |
| 5 | `honeybee-energy/single_family_energy_model.gh` + `Rhino/single_family.3dm` | Hele huset fra Rhino-geometri: rum, vinduer, konstruktioner | Opbygning af Hjerlesvej-modellen |
| 6 | `honeybee-energy/single_family_comfort_study.gh` | Komfort for hele huset rum for rum | Timer over 27 og 28 °C pr. rum |
| 7 | `honeybee-energy/afn_apartment_model.gh` | AirflowNetwork: tværventilation og skorstenseffekt | A-husets høje rum og natkøling |
| 8 | `honeybee-radiance/en17037.gh` | 300 lux-metoden (EN 17037) | BR18 § 379 |
| 9 | `honeybee-radiance/annual_daylight.gh` og `annual_glare.gh` | DA, sDA, UDI og årlig blænding | SV-gavlen og hallen under ovenlyset |
| 10 | `fairyfly/Thermal_Bridging_with_THERM_and_EnergyPlus.gh` | Linjetab med LBNL THERM | ψ-værdier for vinduessamlinger (kræver THERM, kun Windows) |

## Forslag til forløb

1. **Dag 1:** Kør fil 1–4 uændret og forstå dem. Byg derefter et "skoæske-rum" med målene fra soverummet på 1. sal i A-huset. Tjek, at timer over 27 °C reagerer fornuftigt, når du tilføjer solafskærmning og udluftning.
2. **Dag 2–3:** Brug fil 5 og 6 som skabelon til hele Hjerlesvej: ét Honeybee-rum pr. rum, vinduer efter tegningerne, konstruktioner fra fil 2.
3. **Dag 4:** Udluftning med AirflowNetwork (fil 7) og dagslys (fil 8–9).

## Klimafil

BR18 § 386 kræver DRY 2013 (kalenderåret 2010). Hent den danske EPW-fil og kontrollér dugpunktsfeltet, som har en kendt fejl
(se `../research/02_workflow_vaerktoejer_agent.md`).

## Pollination

Ladybug Tools er gratis og kører lokalt. Pollination er firmaets kommercielle cloud-platform, som kører de samme simuleringer
parallelt i skyen. Det er nyttigt ved mange og tunge årlige dagslys- og blændingsberegninger, men ikke nødvendigt for at
komme i gang. Start lokalt, og overvej Pollination, når I kører mange projekter. Tjek den aktuelle pris på pollination.solutions.
