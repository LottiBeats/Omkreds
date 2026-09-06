# house — the Omkreds Structural Model

The translator between building geometry and structural design. See
`../../HOUSE_ENGINE.md` for the plan this implements.

Pure standard library: no FastAPI, no OpenSeesPy, no forallpeople, no database.
Units are metres, kN, kN/m, kN/m² and degrees throughout.

## Running it

```
cd backend
python -m house house/examples/test_house_001.json
python -m house house/examples/test_house_001.json --json
python -m house house/examples/test_house_001.json --why B01
```

Exit code 1 means the model check found a critical error.

## The pipeline

```
model JSON  ──►  StructuralModel  ──►  Topology  ──►  Interpretation  ──►  CheckResult
 (authored)        (schema.py)       (topology.py)   (interpret.py)      (validate.py)
```

| Module | Responsibility |
|---|---|
| `geometry.py` | 2D primitives; every predicate takes an explicit tolerance |
| `model.py` | the authored model — walls, openings, beams, columns, roofs, floors, foundations, assumptions, tolerances, overrides |
| `schema.py` | the neutral JSON format every adapter writes; unknown keys are an error |
| `topology.py` | contacts, nodes, near misses |
| `interpret.py` | supports, spans, cantilevers, generated lintels and jambs, roof reading |
| `validate.py` | the Model Checker — critical errors block, warnings do not |
| `derive.py` | `Derived(value, reason, sources)` — no derived number travels without its reason |
| `report.py` | the text, `explain()` and JSON renderings of the interpretation |

## Three rules that hold everywhere

**The model is authored; the interpretation is derived.** `interpret(model)` is a
pure function and never writes back. The engineer can always be shown what they
drew next to what the engine read.

**Nothing is guessed across a gap.** Contacts are found within `Tolerances.node`.
A pair that misses by more than that and by less than `max_gap_report` becomes a
`NearMiss` and a warning — never a silent connection. To bridge it, the engineer
adds a `connect` override, which is reported wherever it was applied.

**Every derived number carries the sentence that explains it.** Spans, lintel
spans, roof areas and support decisions all hold a `reason`, so
`python -m house model.json --why B01` can answer "why does this beam have this
span?" from the data alone.

## Scope of this version

One storey, timber frame, mostly orthogonal walls, one simple roof.
Not yet implemented: tributary areas, load takedown, sizing, stability,
drawings. Beam-on-beam support is detected and refused rather than assumed.

## Tests

`../tests/test_house_geometry.py` and `../tests/test_house_reference.py` —
the reference building library from §30 of the plan, where each small building
has one known answer.

```
cd backend
python -m pytest tests/test_house_geometry.py tests/test_house_reference.py -q
```
