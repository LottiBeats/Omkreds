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
