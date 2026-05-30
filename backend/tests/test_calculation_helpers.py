import builtins

import pytest

from steel_column import steel_column_check
from steel_ec3 import buckling_curve_hot_rolled, ltb_curve_hot_rolled
from timber_column import timber_column_side_by_side


def test_ltb_curve_for_rolled_sections_matches_shared_ec3_helper():
    assert ltb_curve_hot_rolled(300, 150) == "a"
    assert ltb_curve_hot_rolled(500, 200) == "b"


def test_flexural_buckling_curve_for_hot_rolled_ipe_like_section():
    assert buckling_curve_hot_rolled(300, 150, 10.7) == ("a", "b")


def test_steel_column_rejects_unrestrained_beam_column_shortcut():
    with pytest.raises(ValueError, match="does not calculate lateral-torsional buckling"):
        steel_column_check(
            "C1",
            "IPE 300",
            "S355",
            3.0,
            100.0,
            53.8,
            8356.0,
            604.0,
            300.0,
            150.0,
            10.7,
            7.1,
            M_y_Ed_kNm=10.0,
            ltb_restrained=False,
        )


def test_timber_side_by_side_wrapper_returns_calc_blocks():
    blocks = timber_column_side_by_side(
        "TC-builtup",
        3 * builtins.m,
        20 * builtins.kN,
        2 * builtins.kN * builtins.m,
        45 * builtins.mm,
        145 * builtins.mm,
        timber_grade="C24",
    )

    assert len(blocks) > 5
