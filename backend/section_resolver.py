"""
section_resolver.py — one section, one set of properties.

A frame element used to carry raw E, A and I, while the member verification
below it carried a section name and a grade. Nothing tied the two together, so
a frame could be analysed as an IPE300 and verified as an HEA200 without
anything objecting — in a document somebody signs.

This resolves a section reference to the stiffness properties the FEM needs, so
the analysis and the check read the same field. Elements without a reference
keep whatever E/A/I they were given: existing models must not change behaviour.
"""

from __future__ import annotations

import re

from section_catalog import get_steel_profile
from timber_grades import TIMBER_GRADE_DATA, normalize_timber_grade


def _pa(quantity) -> float:
    """
    Magnitude in pascals of a forallpeople quantity.

    Not float(): that returns the number as *printed*, carrying whatever SI
    prefix was auto-selected — 7.4 for 7.4 GPa but 4.7 for 4.7 GPa, and a value
    stored as 470 MPa would come back as 470. `.value` is always base SI.

    Deliberately no si.environment() call here: forallpeople's environment is
    global, timber_grades already installs it, and setting it a second time
    resets the units the other module is holding.
    """
    if isinstance(quantity, (int, float)):
        return float(quantity)
    value = getattr(quantity, 'value', None)
    if value is None:
        raise TypeError(f"Kan ikke aflæse enheden på {quantity!r}")
    return float(value)


STEEL_E_GPA = 210.0          # EN 1993-1-1 § 3.2.6
# Nominal density for deriving the section area from the tabulated mass.
# NOTE: the masses in steel_profiles.csv are about 1.8 % above the Euronorm
# values (IPE300 listed as 43.0 kg/m against 42.2), which carries into A by the
# same margin. Axial area barely moves a bending-dominated frame, but the CSV
# is worth checking against the tables.
STEEL_DENSITY_KG_M3 = 7850.0

# EN 338 (solid timber) and EN 14080 (glulam) define the 5-percentile modulus
# as a fixed fraction of the mean. The grade table stores E_0,05; the FEM wants
# E_0,mean, so convert with the standards' own ratio rather than guessing.
E05_OVER_EMEAN = {'solid_timber': 0.67, 'glulam': 0.85}

_RECT_RE = re.compile(r'^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*$', re.I)


def _num(s: str) -> float:
    return float(str(s).replace(',', '.'))


def parse_rectangle_mm(section: str):
    """'140x360' -> (140.0, 360.0) in mm. Returns None if it isn't a rectangle."""
    m = _RECT_RE.match(section or '')
    if not m:
        return None
    return _num(m.group(1)), _num(m.group(2))


def _rect_properties(b_mm: float, h_mm: float, E_GPa: float) -> dict:
    A_cm2  = (b_mm * h_mm) / 100.0                  # mm² → cm²
    Iz_cm4 = (b_mm * h_mm ** 3 / 12.0) / 1e4        # mm⁴ → cm⁴
    return {'E_GPa': E_GPa, 'A_cm2': A_cm2, 'Iz_cm4': Iz_cm4}


def resolve_steel(section: str, grade: str | None = None) -> dict:
    p = get_steel_profile(section)
    # Area from the tabulated mass is the real area including root fillets;
    # the idealised three-rectangle estimate is only a fallback.
    weight = p.get('weight_kg_per_m') or 0.0
    if weight > 0:
        A_cm2 = weight / STEEL_DENSITY_KG_M3 * 1e4
    else:
        hw = max(p['h_mm'] - 2 * p['tf_mm'], 0.0)
        A_cm2 = (2 * p['b_mm'] * p['tf_mm'] + hw * p['tw_mm']) / 100.0
    return {
        'E_GPa':   STEEL_E_GPA,
        'A_cm2':   A_cm2,
        'Iz_cm4':  p['Iy_cm4'],
        'materiale': 'stål',
        'beskrivelse': f"{p['designation']} · {grade or 'S355'}",
        'kilde': 'steel_profiles.csv (Euronorm)',
    }


def resolve_timber(section: str, grade: str) -> dict:
    dims = parse_rectangle_mm(section)
    if dims is None:
        raise ValueError(
            f"Trætværsnit '{section}' skal angives som bredde x højde i mm, fx 140x360.")
    b_mm, h_mm = dims

    key = normalize_timber_grade(grade)
    data = TIMBER_GRADE_DATA.get(key)
    if data is None:
        raise KeyError(f"Ukendt trækvalitet '{grade}'.")

    ratio = E05_OVER_EMEAN.get(data.get('material_type'), 0.67)
    E_mean_GPa = _pa(data['E_0_05']) / ratio / 1e9

    props = _rect_properties(b_mm, h_mm, E_mean_GPa)
    props.update({
        'materiale': 'træ',
        'beskrivelse': f"{b_mm:.0f}x{h_mm:.0f} mm · {data.get('description', key)}",
        'kilde': 'EN 338 / EN 14080 via timber_grades.py',
        'b_mm': b_mm, 'h_mm': h_mm,
    })
    return props


def resolve_section(material: str | None, section: str | None,
                    grade: str | None = None) -> dict | None:
    """
    Resolve a section reference to {E_GPa, A_cm2, Iz_cm4, ...}.

    Returns None when there is nothing to resolve, so the caller keeps the
    element's own values. Raises on a reference that is given but wrong — a
    typo in a section name must not silently fall back to a default stiffness.
    """
    if not material or not section:
        return None
    mat = material.strip().lower()
    if mat in ('steel', 'stål', 'staal'):
        return resolve_steel(section, grade)
    if mat in ('timber', 'træ', 'trae', 'wood'):
        return resolve_timber(section, grade or 'C24')
    # Concrete is deliberately absent: a cracked-section stiffness is a design
    # decision (EN 1992-1-1 § 5.8), not something to infer from b x h.
    return None


def apply_sections(elements: list[dict]) -> list[dict]:
    """
    Return elements with E/A/I derived from their section reference where one
    is given. Elements without a reference are returned untouched.

    A bad reference is reported on the element rather than raised, so one typo
    does not take down an analysis of thirty members.
    """
    out = []
    for el in elements:
        e = dict(el)
        try:
            props = resolve_section(e.get('material'), e.get('section'), e.get('grade'))
        except Exception as exc:
            e['_section_error'] = str(exc)
            out.append(e)
            continue
        if props:
            e['E_GPa']  = round(props['E_GPa'], 4)
            e['A_cm2']  = round(props['A_cm2'], 4)
            e['Iz_cm4'] = round(props['Iz_cm4'], 4)
            e['_section_resolved'] = {
                'beskrivelse': props['beskrivelse'],
                'materiale':   props['materiale'],
                'kilde':       props['kilde'],
                'E_GPa':       round(props['E_GPa'], 2),
                'A_cm2':       round(props['A_cm2'], 2),
                'Iz_cm4':      round(props['Iz_cm4'], 1),
            }
        out.append(e)
    return out


# The verification that belongs with each material — used to pick the right
# check block when generating member checks from a frame.
CHECK_TYPE_FOR_MATERIAL = {
    'stål':  'steel_beam',
    'træ':   'timber_beam',
    'beton': 'rc_beam',
}
