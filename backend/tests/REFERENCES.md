# Test Case References

Every numerical value in the test suite is derived from one of the sources below.
When adding a new test, cite the source here.

---

## Steel Beam (EN 1993-1-1 §6.2, §6.3.2)

| Test | Section | Source |
|------|---------|--------|
| Case A: IPE 300, S355, L=4m, g=5/q=3 kN/m | Section data: ARCELOR-Mittal "Sections and Merchant Bars" 2008 catalog, pp.26–27. Formulae: EN 1993-1-1 §6.2.5 (bending), §6.2.6 (shear). | |
| Case C: IPE 500, S275 | Same catalog. f_y per EN 1993-1-1 Table 3.1. | |

**Key section properties used:**

| Section | W_pl,y (cm³) | A (cm²) | t_w (mm) | t_f (mm) | r (mm) |
|---------|-------------|---------|---------|---------|-------|
| IPE 300 | 628         | 53.8    | 7.1     | 10.7    | 15    |
| IPE 400 | 1307        | 84.5    | 8.6     | 13.5    | 21    |
| IPE 500 | 2194        | 116.0   | 10.2    | 16.0    | 21    |

*Note: W_pl,y = 1307 cm³ is IPE **400**, not IPE 500. IPE 500 is 2194 cm³.*

---

## Steel Column (EN 1993-1-1 §6.3.1)

| Test | Section | Source |
|------|---------|--------|
| HEB 200, S355, L=3m, N=500kN | Section: ARCELOR catalog. Buckling curves: EN 1993-1-1 Table 6.2 (h/b≤1.2, t_f≤100mm → curves b/c). Formulae: §6.3.1.2. | |

**Key section properties:**

| Section | A (cm²) | i_y (cm) | i_z (cm) |
|---------|---------|---------|---------|
| HEB 200 | 78.08   | 8.54    | 5.07    |

---

## Beam-Column (EN 1993-1-1 §6.3.3 Annex B)

| Test | Source |
|------|--------|
| HEB 200, N=200kN, M_y=50kNm, L=4m | Vayas, Georgiou & Efthymiou, *Design of Steel Structures to Eurocodes*, Springer 2019, Table 4.11 (reference values for k_zy). EN 1993-1-1 Annex B Tables B.1/B.2 (interaction factors). |

---

## RC Beam (EN 1992-1-1 §6.1, §6.2)

| Test | Source |
|------|--------|
| 300×500, C30/37, L=6m, g=10/q=6 kN/m | Mosley, Bungey & Hulse, *Reinforced Concrete Design to Eurocode 2*, 7th ed., Pearson 2012, Chapter 4. Formulae: EN 1992-1-1 §6.1 (flexure), §6.2.2 (shear without reinforcement). |

---

## Timber Beam (EN 1995-1-1 §6.1.6, §6.1.7)

| Test | Source |
|------|--------|
| 90×220 C24, L=4m, g=3/q=2 kN/m | EN 1995-1-1 §6.1.6 (bending), §6.1.7 (shear). k_mod: EN 1995-1-1 Table 3.1. C24 properties: EN 338:2016 Table 1. Values confirmed by PDF output in 123_A2(8).pdf p.3. |

**C24 characteristic properties (EN 338:2016):**

| Property | Value |
|----------|-------|
| f_m,k    | 24 MPa |
| f_v,k    | 4.0 MPa |
| E_0,05   | 7,400 MPa |

---

## Plate Girder (EN 1993-1-5 §4, §5, §7)

| Test | Source |
|------|--------|
| 1200×12 web, 400×25 flanges, a=2000mm, S355 | EN 1993-1-5 §5 (shear buckling), §4.4 (effective section), §7 (M+V interaction). Hand calculation in test_plate_girder.py header. |

---

## How to Add a New Test Case

1. Pick a case from a published Eurocode worked example or textbook.
2. Compute the key utilisation values by hand (show the working as a comment in the test file).
3. Add the source reference to this file.
4. Use `assert_eta(chk, expected, tol=0.015)` — the 1.5% tolerance absorbs minor rounding differences in forallpeople unit formatting.
5. Always include one **FAIL** test case to verify the check correctly detects an over-stressed section.

---

## Snow Load (EN 1991-1-3 §5.2, §5.3)

| Test | Source |
|------|--------|
| μ₁ over α = 0…75°, s = μ₁·C_e·C_t·s_k, per-rafter load | EN 1991-1-3 Table 5.2 (monopitch/pitched, undrifted) and Eq. 5.1. Branch values hand-computed independently of `snow_load.py`. |

**NOT covered — read this before trusting the block.** `_DK_SNOW_ZONES`
(zone 1 → s_k = 1.0, zone 2 → 0.9, zone 3 → 1.5 kN/m²) is *data*, not formula,
and has **not** been checked against DS/EN 1991-1-3 DK NA. The tests pin the
arithmetic, not the ground snow load. Enter `s_k` explicitly until someone with
the NA in hand verifies the zone table.

---

## Wind Load (EN 1991-1-4 §4.2–4.5)

| Test | Source |
|------|--------|
| k_r, c_r(z), I_v(z), v_m(z), q_p(z) for terrain II/III/IV at z = 8 m | EN 1991-1-4 Eq. 4.1, 4.3, 4.4, 4.5, 4.7, 4.8, 4.10. Terrain z₀/z_min per Table 4.1. Every value recomputed from the equations in `test_wind_load.expected()`, which imports nothing from `wind_load.py`. |
| z_min clipping, wall pressures w = c_pe·q_p − c_pi·q_p | Table 4.1; §7.2. |

**Reference values at z = 8 m, v_b,0 = 24 m/s, ρ = 1.25 kg/m³:**

| Terrain | z₀ (m) | k_r | c_r | I_v | q_p (kN/m²) |
|---------|--------|-----|-----|-----|-------------|
| II  | 0.05 | 0.19000 | 0.96428 | 0.19704 | 0.796 |
| III | 0.30 | 0.21539 | 0.70721 | 0.30456 | 0.564 |
| IV  | 1.00 | 0.23433 | 0.53956 | 0.43429 | 0.423 |

**NOT covered.** `v_b,0 = 24 m/s` is DK NA data and is not verified here.
**Terrain category 0 (open sea, z₀ = 0.003 m, z_min = 1 m) is missing from
`_TERRAIN` entirely** — it matters on a Danish coast, and category I is
mislabelled "Hav og åbent vand" in its place. c₀ is fixed at 1.0, so orography
is not modelled.

---

## Roof Dead Load (geometry)

| Test | Source |
|------|--------|
| g_tag,proj = Σg/cos α · a ; g_spær = b·h·ρ/cos α | No Eurocode clause — plane geometry. Hand-computed in `test_roof_dead_load.hand()`. The 1/cos α converts a load per m² of *roof surface* into a load per m of *horizontal projection*. |

Tolerances on ratio tests are 1–2 % because the values are read back from a
three-decimal display string (g_spær ≈ 0.0447 kN/m prints as "0.045"), not
because the formula is uncertain.

---

## Load Combinations (DS/EN 1990 DK NA:2019, Table A1.2(B+C))

| Test | Source |
|------|--------|
| 6.10a, 6.10b, K_FI, ψ₀ context rules, γ_G,inf | DS/EN 1990 DK NA:2019 Table A1.2(B+C), read directly from the table. |

| | 1 (6.10a) | 2 (6.10b) |
|---|---|---|
| Permanent, unfavourable | 1.2·K_FI | 1.0·K_FI |
| Permanent, favourable   | 1.0 | 0.9 |
| Variable, leading       | 0 | 1.5·K_FI |
| Variable, others        | 0 | 1.5·ψ₀·K_FI |

K_FI: CC1 = 0.9, CC2 = 1.0, CC3 = 1.1. **The favourable row carries no K_FI** —
it is bare in the table where the unfavourable row is multiplied.

`G_fav` was accepted by the API, passed into `load_combos()` and never read: the
checkbox did nothing. Fixed and pinned by four tests.

---

## Timber Column (EN 1995-1-1 §6.2.4, §6.3.2, §6.3.3)

| Test | Source |
|------|--------|
| λ, λ_rel, k, k_c, eqs. 6.19/6.20 and 6.23/6.24 | EN 1995-1-1 Eq. 6.19, 6.20, 6.21, 6.23–6.29. β_c = 0.20 solid / 0.10 glulam (Eq. 6.29). C24 per EN 338:2016: f_c,0,k = 21 MPa, E_0,05 = 7400 MPa. k_c recomputed independently in `test_timber_column.k_c()`. |

**Reference case — 100×100 mm C24, L = 3.0 m, β = 1.0, N_Ed = 30 kN, M_Ed = 0,
service class 1, medium term, γ_M = 1.3:**

| | |
|---|---|
| i = h/√12 | 28.868 mm |
| λ = 3000/28.868 | 103.92 |
| λ_rel = (λ/π)·√(21/7400) | 1.762 |
| k = 0.5·(1 + 0.2·(λ_rel − 0.3) + λ_rel²) | 2.199 |
| k_c = 1/(k + √(k² − λ_rel²)) | 0.2846 |
| f_c,0,d = 0.80·21/1.3 | 12.923 MPa |
| σ_c,0,d = 30000/10000 | 3.000 MPa |
| η (6.24) | 0.816 |
| η (6.19), M = 0 | 0.054 |

The compression term in 6.19/6.20 is **squared** — at M = 0 the section check
is 0.054, not 0.232. A test pins that specifically, because dropping the square
is the obvious way to get this wrong and it errs unconservatively.

The module takes N_Ed and M_Ed as given, so it does not choose a load
combination — the k_mod question that governs `timber.py`'s closed form belongs
to whatever produced the actions.
