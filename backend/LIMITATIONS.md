# Calculation Module — Scope and Limitations

This document lists the assumptions, scope, and known limitations of every
calculation module. It is intended for the engineer reviewing the output.

---

## Steel Beam (`steel.py`)  EN 1993-1-1

**Scope**
- Simply supported, prismatic beams under uniformly distributed load (UDL).
- Standard hot-rolled I and H sections from the built-in catalog.
- Doubly-symmetric cross-sections only (no mono-symmetric, no channels).
- Lateral-torsional buckling by the General Method (§6.3.2.2, C₁ = 1.0).

**Assumptions and simplifications**
- Unless beam actions are imported from the FEM module, loading is assumed to be
  a full-span UDL. Point loads and non-uniform loads require FEM import.
- C₁ = 1.0 (conservative). For non-uniform moment diagrams, a higher C₁ is
  justified and will increase M_cr.
- Shear-bending interaction (§6.2.8) is only checked when V_Ed > 0.5 V_pl,Rd.

**Not covered**
- Web buckling / crippling at load application points (§6.2.6).
- Haunched or tapered beams.
- Class 4 (slender) cross-sections.

---

## Steel Column (`steel_column.py`)  EN 1993-1-1

**Scope**
- Prismatic columns and beam-columns under axial compression + biaxial bending.
- Standard hot-rolled I/H sections.
- Cross-section classification (Class 1–3), §6.2.1(7) combined cross-section check,
  flexural buckling §6.3.1, LTB §6.3.2.2, and combined buckling §6.3.3 (Annex B).

**Assumptions**
- Effective length factors k_y, k_z input by the engineer.
- Annex B Method 2 (not Annex A — more conservative but much simpler).
- For LTB: two-term M_cr formula (no load-height or monosymmetry correction).
  C₁ can be supplied for non-uniform moment; default C₁ = 1.0 is conservative.

**Not covered**
- Class 4 cross-sections (effective section per EN 1993-1-5).
- Annex A (Method 1) interaction factors.
- Columns with intermediate restraints at non-standard positions.

---

## Beam-Column (`steel_beam_column.py`)  EN 1993-1-1 §6.3.3

**Scope**
- Class 1 and 2 hot-rolled I/H sections under combined N + M_y + M_z.
- Annex B Method 2 interaction factors (Tables B.1 and B.2).

**Assumptions**
- Equivalent uniform moment factors C_my, C_mz, C_mLT = 1.0 by default
  (conservative for linear moment diagrams). Reduce for non-uniform diagrams
  per EN 1993-1-1 Table B.3.
- For LTB-restrained members (ltb_restrained=True), χ_LT = 1.0 and Table B.1
  factors are used. Verify that the compression flange is continuously restrained.

**Not covered**
- Class 3 and 4 sections.
- Non-doubly-symmetric sections (channels, angles).

---

## RC Beam (`concrete.py`)  EN 1992-1-1

**Scope**
- Singly-reinforced rectangular beams (doubly-reinforced not implemented).
- Simply supported under UDL.
- Design actions from UDL formula or imported from FEM module.

**Assumptions**
- UDL loading unless FEM actions imported.
- Shear reinforcement (links) provided — shear capacity computed for minimum
  link spacing. Actual link design not performed.
- Deflection check uses the simplified span/depth approach (§7.4.2) rather than
  rigorous curvature integration.

**Not covered**
- T-beams / flanged sections.
- Continuous beams (moment redistribution).
- Crack width calculation (§7.3).
- Compression reinforcement.

---

## RC Column (`concrete_column.py`)  EN 1992-1-1

**Scope**
- Rectangular columns under N + M (uniaxial or biaxial).
- Second-order effects via nominal stiffness method (§5.8.7).

**Assumptions**
- Symmetric reinforcement layout only.
- Column assumed braced (non-sway). For sway frames, verify ψ₀ independently.

---

## RC Slab (`rc_slab.py`)  EN 1992-1-1

**Scope**
- One-way spanning solid slabs under UDL (per metre width).

**Assumptions**
- No punching shear check — add separately for flat slabs.
- UDL loading only.

---

## Timber Beam (`timber.py`)  EN 1995-1-1

**Scope**
- Simply supported solid timber and glulam beams under UDL.
- Grades: C14–C40 (solid), GL24h–GL36h (glulam).

**Assumptions**
- UDL loading unless FEM actions imported.
- LTB (kipning): when compression_edge_restrained=True, k_crit = 1.0 is
  assumed. The engineer must verify that the compression edge is continuously
  restrained along the full span.
- Bearing check uses the provided support_length; if not given, the check
  is skipped.

**Not covered**
- Notched beams.
- Multi-span continuous beams (use FEM import).
- Combined bending + tension or compression (use Timber Column module).

---

## Timber Column (`timber_column.py`)  EN 1995-1-1

**Scope**
- Rectangular solid and glulam columns under N + M_y (uniaxial bending).

**Assumptions**
- Uniform moment along the column height (conservative).
- Buckling lengths equal to the physical length × effective length factor μ.

**Not covered**
- Biaxial bending (M_y + M_z combined — upcoming).
- Notched columns.

---

## Masonry Wall (`masonry.py`)  EN 1996-1-1

**Scope**
- Unreinforced masonry walls, predominantly in compression.

**Assumptions**
- Mid-height eccentricity includes both load eccentricity and creep eccentricity.
- Slenderness check per §6.1.2.

**Not covered**
- Reinforced masonry.
- Out-of-plane bending as the primary load case.
- Cavity walls (treated as single leaf).

---

## Plate Girder (`plate_girder.py`)  EN 1993-1-5

**Scope**
- Welded I-section plate girders: web buckling in shear, Class 4 effective
  section for bending, M+V interaction.
- Doubly-symmetric cross-sections only.

**Assumptions**
- Panels are rectangular (no tapered webs).
- Uniform shear and moment within the panel — the engineer must check the
  critical panel.
- Flange contribution to shear (V_bf,Rd) is computed per EN 1993-1-5 eq. 5.8.

**Not covered**
- Patch loading / web buckling under concentrated loads (EN 1993-1-5 §6).
- Longitudinal stiffeners.
- Fatigue.

---

## Foundation (`foundation_ec7.py`)  EN 1997-1

**Scope**
- Spread footings on drained Mohr-Coulomb soil.
- Vertical bearing capacity by Meyerhof/Hansen factors.

**Assumptions**
- Drained conditions (c', φ' parameters). Undrained analysis not implemented.
- Settlement not calculated — structural engineer must obtain settlement estimate
  from geotechnical engineer.

---

## Wind Load (`wind_load.py`)  EN 1991-1-4

**Scope**
- Peak velocity pressure q_p at reference height z_ref.
- Net horizontal pressure on rectangular buildings.

**Assumptions**
- Terrain categories I–IV (Table 4.1).
- Orography factor c_o = 1.0 (flat terrain). Modify manually for hills.
- Directional and seasonal factors c_dir, c_season input by engineer.

---

## Snow Load (`snow_load.py`)  EN 1991-1-3

**Scope**
- Roof snow load for pitched and flat roofs.

**Assumptions**
- Danish zones 1–4 supported for characteristic ground snow load s_k.
- Exceptional snow loads not included.

---

## Load Combinations (`load_combo.py`)  EN 1990

**Scope**
- ULS combinations by EN 1990 equations 6.10 or 6.10a/6.10b.
- Variable actions with leading and accompanying roles.

---

## Beam FEM (`beam_fem.py`)

**Scope**
- Linear-elastic Euler-Bernoulli beam, multi-span, arbitrary loading.
- UDL, trapezoidal, point load, applied moment.

**Assumptions**
- Small deformations (linear). No geometric or material non-linearity.
- Elastic supports not implemented (supports are pinned or fixed).

---

## General 2D Frame FEM (`general_frame_fem.py`)  OpenSeesPy

**Scope**
- Linear-elastic plane frame and truss analysis with arbitrary geometry:
  `elasticBeamColumn` (axial + shear + bending) and `Truss` (axial only).
- Moment releases at either or both element ends; equalDOF ties for pin joints
  between co-located nodes.
- Nodal loads and uniformly distributed element loads, applied either directly
  or once per load combination from the Frame Load Cases block.
- Sway stability by EN 1993-1-1 § 5.2.1(4)B and buckling lengths by Wood's
  method (Annex B) — both documented under their own headings in the output.

**Sign conventions**
- Global axes: x to the right, y upwards.
- A UDL is entered as a positive number in the direction chosen in the block:
  `Lodret` acts downwards (gravity, snow), `Vandret` acts towards +x (wind),
  `Vinkelret` presses into the element surface, `Projiceret` is snow per metre
  of horizontal projection. Enter a negative value for uplift or suction.
- Nodal loads are in global axes: Fy negative is downwards.

**Assumptions**
- First-order theory: small displacements, no P-delta. The amplification of
  sway moments must be applied by hand where alpha_cr indicates it.
- Prismatic elements. Shear deformation is not included (Euler-Bernoulli).
- Rigid joints unless a release or an equalDOF tie is specified. Semi-rigid
  connection stiffness is not modelled.
- Nodes carry three degrees of freedom (ux, uy, rz) whether or not the elements
  meeting there provide stiffness for all three. A node connected only to truss
  elements, or only to beams released at both ends, therefore has no rotational
  stiffness and the model is rejected — fix rz at that node, or let one element
  carry moment.

**Validation**
- The solver does not report a singular stiffness matrix: it factors it anyway
  and returns displacements of arbitrary magnitude. Models are therefore
  checked before analysis (missing or duplicated nodes and elements, zero-length
  elements, non-positive section properties, unconnected nodes, unrestrained
  rotational degrees of freedom, and support conditions that leave a rigid-body
  mechanism) and the results are checked afterwards (non-finite values, and
  displacements exceeding one tenth of the extent of the structure, which is
  outside the validity of small-displacement theory in any case).
- Verified against closed-form solutions for the simply supported and cantilever
  beam under full-span UDL in `tests/test_general_frame_fem.py`.

**Not covered**
- Second-order analysis, geometric imperfections in the model itself, and
  buckling eigenvalue analysis.
- Out-of-plane behaviour of any kind — the model is plane, so lateral-torsional
  buckling and out-of-plane stability must be verified in the member checks.
- Material non-linearity, plastic hinges, cracked-section stiffness.
- Dynamic response. Support settlements, temperature and prestrain loading.
