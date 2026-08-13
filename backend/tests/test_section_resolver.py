"""
test_section_resolver.py — one section, one set of properties.

The point of the resolver is that a frame element and the member check under it
cannot describe different sections. These check that the derived stiffness
matches the published tables, so "same field" also means "right value".
"""
import pytest

from section_resolver import (
    apply_sections, parse_rectangle_mm, resolve_section, resolve_steel,
    resolve_timber, CHECK_TYPE_FOR_MATERIAL,
)


# ── Steel ─────────────────────────────────────────────────────────────────────

def test_steel_second_moment_comes_from_the_catalogue():
    """I is what the member check uses; it must be the tabulated value."""
    assert resolve_steel('IPE300')['Iz_cm4'] == pytest.approx(8356.0)
    assert resolve_steel('IPE200')['Iz_cm4'] > 0
    assert resolve_steel('IPE300')['E_GPa'] == pytest.approx(210.0)


def test_steel_lookup_is_forgiving_about_spelling():
    a = resolve_steel('IPE300')
    b = resolve_steel('ipe 300')
    assert a['Iz_cm4'] == b['Iz_cm4']


def test_steel_area_is_within_a_few_percent_of_the_table():
    """IPE300 is 53.8 cm² in Euronorm; the CSV mass puts it slightly high."""
    A = resolve_steel('IPE300')['A_cm2']
    assert A == pytest.approx(53.8, rel=0.03)


def test_unknown_profile_raises_rather_than_defaulting():
    """A typo must not silently become some other stiffness."""
    with pytest.raises(KeyError):
        resolve_steel('IPE999')


# ── Timber ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('grade, E_mean_GPa', [
    ('C14', 7.0),    # EN 338 Table 1
    ('C24', 11.0),
    ('GL24c', 11.0), # EN 14080
])
def test_timber_mean_modulus_matches_the_standard(grade, E_mean_GPa):
    """
    The grade table stores E_0,05. The FEM needs E_0,mean, derived with the
    ratio the standards define — so it has to land on the published mean.
    """
    res = resolve_timber('45x195', grade)
    assert res['E_GPa'] == pytest.approx(E_mean_GPa, rel=0.01)


def test_timber_section_properties_are_the_rectangle():
    res = resolve_timber('45x195', 'C24')
    assert res['A_cm2'] == pytest.approx(45 * 195 / 100)
    assert res['Iz_cm4'] == pytest.approx(45 * 195 ** 3 / 12 / 1e4)


@pytest.mark.parametrize('text, expected', [
    ('140x360', (140.0, 360.0)),
    ('140 x 360', (140.0, 360.0)),
    ('140×360', (140.0, 360.0)),
    ('45,5x195', (45.5, 195.0)),
])
def test_rectangle_parsing(text, expected):
    assert parse_rectangle_mm(text) == expected


def test_rectangle_parsing_rejects_nonsense():
    assert parse_rectangle_mm('IPE300') is None
    assert parse_rectangle_mm('') is None
    with pytest.raises(ValueError):
        resolve_timber('IPE300', 'C24')


def test_unknown_timber_grade_raises():
    with pytest.raises(KeyError):
        resolve_timber('45x195', 'C99')


# ── Dispatch ──────────────────────────────────────────────────────────────────

def test_material_names_in_both_languages():
    for name in ('steel', 'stål'):
        assert resolve_section(name, 'IPE300', 'S355')['materiale'] == 'stål'
    for name in ('timber', 'træ'):
        assert resolve_section(name, '45x195', 'C24')['materiale'] == 'træ'


def test_nothing_to_resolve_returns_none():
    assert resolve_section(None, None) is None
    assert resolve_section('steel', None) is None
    assert resolve_section(None, 'IPE300') is None


def test_concrete_is_not_resolved():
    """Cracked-section stiffness is a design decision, not a lookup."""
    assert resolve_section('concrete', '300x500', 'C25/30') is None


# ── apply_sections ────────────────────────────────────────────────────────────

def test_elements_with_a_section_get_its_properties():
    els = [{'id': 1, 'material': 'steel', 'section': 'IPE300', 'grade': 'S355',
            'E_GPa': 1.0, 'A_cm2': 1.0, 'Iz_cm4': 1.0}]
    out = apply_sections(els)[0]
    assert out['E_GPa'] == pytest.approx(210.0)
    assert out['Iz_cm4'] == pytest.approx(8356.0)
    assert out['_section_resolved']['beskrivelse'] == 'IPE300 · S355'


def test_elements_without_a_section_are_untouched():
    """Existing frames carry raw E/A/I and must keep behaving identically."""
    el = {'id': 3, 'E_GPa': 210.0, 'A_cm2': 39.1, 'Iz_cm4': 3892.0}
    out = apply_sections([el])[0]
    assert out['E_GPa'] == 210.0
    assert out['A_cm2'] == 39.1
    assert out['Iz_cm4'] == 3892.0
    assert '_section_resolved' not in out


def test_a_bad_reference_is_reported_on_the_element_not_raised():
    """One typo must not take down an analysis of thirty members."""
    els = [
        {'id': 1, 'material': 'steel', 'section': 'IPE300', 'grade': 'S355'},
        {'id': 2, 'material': 'steel', 'section': 'IPE999', 'grade': 'S355',
         'E_GPa': 210.0, 'A_cm2': 50.0, 'Iz_cm4': 8000.0},
    ]
    out = apply_sections(els)
    assert out[0]['Iz_cm4'] == pytest.approx(8356.0)
    assert '_section_error' in out[1]
    assert out[1]['Iz_cm4'] == 8000.0, 'the element keeps its own values'


def test_apply_sections_does_not_mutate_the_input():
    els = [{'id': 1, 'material': 'steel', 'section': 'IPE300', 'E_GPa': 1.0}]
    apply_sections(els)
    assert els[0]['E_GPa'] == 1.0


def test_check_type_follows_the_material():
    """This is what stops a timber frame generating steel verifications."""
    assert CHECK_TYPE_FOR_MATERIAL['stål'] == 'steel_beam'
    assert CHECK_TYPE_FOR_MATERIAL['træ'] == 'timber_beam'
    assert CHECK_TYPE_FOR_MATERIAL['beton'] == 'rc_beam'

    steel = resolve_section('steel', 'IPE300', 'S355')
    timber = resolve_section('timber', '140x360', 'GL24c')
    assert CHECK_TYPE_FOR_MATERIAL[steel['materiale']] == 'steel_beam'
    assert CHECK_TYPE_FOR_MATERIAL[timber['materiale']] == 'timber_beam'
