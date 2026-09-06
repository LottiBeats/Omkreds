# House Engine — technical plan

Goal (from the vision document): translate building geometry into an explicit
structural model, and drive calculation, drawings and documentation from that
one model.

This document records what the Omkreds codebase looks like today, the
architectural decisions taken to introduce the House Engine without rewriting
working functionality, and the milestone order.

---

## 1. Survey of the existing codebase

### Backend — FastAPI, ~17 000 lines of Python

| Concern | Where | State |
|---|---|---|
| API + input schemas | `main.py` (3187 lines) | ~40 `/calc/*` endpoints, each a thin Pydantic wrapper |
| Calculation modules | `timber.py`, `steel.py`, `masonry.py`, `concrete*.py`, `foundation_ec7.py`, … | Already standalone functions, **not** UI-coupled |
| FEM | `beam_fem.py`, `general_frame_fem.py`, `portal_frame_fem.py` (OpenSeesPy) | Works; solver unavailable on the dev machine |
| Report primitives | `calc_core.py` | `S/T/N/TBL/CALC_ROW/FIG` + `CheckContext` |
| Output | `pdf_builder.py`, `holst_layout.py`, `word_builder.py` | Consume block lists |
| Sections | `section_catalog.py`, `section_resolver.py`, `steel_profiles.csv` | Steel catalogue + rectangle parser |
| Storage | `db.py` → SQLite, `projects.data` is one JSON blob | Versions, soft delete, optimistic concurrency in place |

### Frontend — React/Vite, ~22 000 lines

`EditorPage.jsx` (2336 lines) holds documents; `blocks/BlockList.jsx` (1163)
dispatches ~35 block components; `templates/*.js` generate A1/A2/B1/B2.

### The two findings that shape the plan

**1. The calculation modules are already separable — but they return prose, not
results.** `timber.timber_beam()` (`backend/timber.py:27`) returns a *list of
report blocks*: `CALC_ROW`, `T`, `TBL`, and `CheckContext.check()` dicts. The
only machine-readable number in the whole return value is `ratio` on the check
dicts (`backend/calc_core.py:147`), and the frontend recovers utilisation by
scanning for them (`BlockList.jsx:272`).

So the "Calculation API" the vision asks for is **half built already**: the
functions are decoupled from the UI, the endpoints are thin, and unit conversion
(mm → forallpeople) is confined to the endpoint layer. What is missing is a
structured result alongside the report blocks. That is an additive change, not a
rewrite.

**2. Omkreds has no structural model at all today.** What looks like a model is a
list of *documentation* blocks. Cross-block data flows through ad-hoc channels:
`data._exports` on a load-combo block, `combo_label` string matching,
`fem_block_id` references, `_input_hash` staleness stamps. There is no object
that knows "W03 supports B01".

This is not a defect to repair — it is precisely the gap the House Engine fills.
The block system stays as the presentation layer; it just stops being the place
where structural facts live.

---

## 2. Architectural decisions

### Where the engine lives

A new package `backend/house/`, **pure standard library**: no FastAPI, no
OpenSeesPy, no forallpeople, no database. It can be imported, tested and reasoned
about on its own, and it runs on the dev machine where OpenSeesPy cannot load.

It goes inside the existing backend rather than a separate repository because the
engine has to call the calculation modules, and those live here.

### The three layers and the rule between them

```
house/                 source of truth      SI floats (m, kN, kN/m, kN/m²)
   ↓ calc_adapter
backend/*.py           verification         unit-aware, returns report blocks
   ↓
documents / blocks     presentation         PDF, Word, editor UI
```

Dependencies point downward only. `house/` never imports `main.py`; the calc
modules never learn what a wall is.

### Units

The house engine uses plain floats in strict SI-derived units — metres, kN,
kN/m, kN/m², degrees for pitch. `forallpeople` quantities appear only on the
other side of the calc adapter. Mixing the two inside the model is how unit bugs
get in.

### Every derived fact carries its reason

`house/derive.py` defines `Derived(value, reason, sources)`. A span is not a
float; it is a float that knows it came from *"supports detected at W05 (t=0.000) and
W02 (t=4.800)"*. Requirement §34 (engineering transparency) is not something that
can be retrofitted onto a system that stored bare numbers — so it is in the type
from day one. The UI, the model-check report and the documentation all read the
same `reason` strings.

### Authored model vs. interpretation

`StructuralModel` holds only what the user authored. `Interpretation` holds
everything the engine derived: nodes, supports, spans, generated lintels. They
are separate objects, produced by a pure function
`interpret(model) -> Interpretation`, so:

- re-interpreting is free and never corrupts input,
- the engineer can be shown "authored" vs "derived" side by side (§9),
- overrides are a documented input (`model.overrides`), not a mutation.

---

## 3. Milestone order (mapped to this repository)

| # | Milestone | Deliverable | Status |
|---|---|---|---|
| 1 | Structural Model | `house/model.py`, `house/schema.py`, JSON v1 | **done** |
| 2 | Geometry + topology | `house/geometry.py`, `house/topology.py` | **done** |
| 3 | Interpretation + Model Checker | `house/interpret.py`, `house/validate.py` | **done** |
| - | First checkpoint (vision §27) | `python -m house house/examples/test_house_001.json` | **done** |
| 3b | Rhino Geometry Adapter | `adapters/rhino/` → emits the same JSON | next |
| 4 | Tributary areas | `house/tributary.py` | |
| 5 | Gravity load takedown | `house/takedown.py` + equilibrium check | |
| 6 | Calculation API | structured results from calc modules + `house/calc_adapter.py` | |
| 7 | Automatic sizing | `house/sizing.py` over `section_catalog` + timber sections | |
| 8 | Complete gravity house | | |
| 9 | Stability | | |
| 10–12 | Drawings, details, documentation | reuse `pdf_builder` block format | |
| 13 | Omkreds web editor | replaces the Rhino adapter, same model | |

Milestone 2 in the vision document is the Rhino adapter. It is deliberately
deferred by one step here: the model, topology and checker are proven first
against hand-written JSON test houses, so that when Rhino geometry arrives there
is a known-good target for it to produce. The adapter then has one job — emit
valid model JSON — and none of the interpretation logic lives in Grasshopper.

---

## 4. What this plan does not change

- No existing endpoint, calculation module, block type or document template is
  modified. The House Engine is additive until Milestone 6.
- Milestone 6 adds a *second* return channel to the calc modules (structured
  results), it does not remove the report blocks. The existing UI keeps working
  unchanged.
- The FEM modules are not touched. A house model may later be exported *to* the
  general frame FEM, but the takedown engine is a separate, deterministic path.

---

## 5. Open questions for the engineer

1. **Continuous vs. simply supported beams.** When a beam crosses an intermediate
   support the engine must not guess. `Beam.continuity` is a required authored
   field (`"simple" | "continuous"`), defaulting to `"simple"` with a warning.
2. **Bearing length at lintels.** Currently a model assumption
   (`lintel_bearing = 0.10 m` each side). Should become a wall-type property.
3. **Roof span direction** is authored, not derived. Deriving it from geometry is
   possible for simple rectangles but ambiguous in general.

---

## 6. State after the first pass

Milestones 1-3 are implemented in `backend/house/` (see its README) and the
first checkpoint of vision §27 runs:

```
cd backend
python -m house house/examples/test_house_001.json
```

The reference house - 5 walls, 1 beam, 3 openings, 1 roof - is read from JSON,
interpreted and checked: B01 spans 4.800 m between W05 and W02, three lintels
are generated with their jambs, the roof reports 50.40 m2 spanning Y carried by
W01, W03, W05 and B01, and every one of those numbers can explain itself with
`--why`.

46 tests cover it, including the reference building library of vision §30
(`backend/tests/test_house_reference.py`). Nothing in the existing backend was
modified; the full suite still stands at 221 passed / 7 pre-existing failures
(the missing `/calc/steel-column` endpoint and the EC3 6.61/6.62 discrepancy).
