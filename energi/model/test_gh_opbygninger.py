"""
Test af gh_opbygninger.py: alle opbygninger i energi/regler/opbygninger.txt kan bygges,
og ConstructionSet'et får de valgte konstruktioner.

    python -m pytest energi/model/test_gh_opbygninger.py
"""
from pathlib import Path

import gh_materialer
import gh_opbygninger as go

FIL = str(Path(__file__).resolve().parents[1] / "regler" / "opbygninger.txt")


def test_alle_opbygninger_kan_bygges():
    materialer, opb = go.laes(FIL)
    for typ in go.TYPER:
        assert opb[typ], typ
        for navn, lag in opb[typ]:
            k = go.byg_vindue(navn, lag) if typ == "vindue" else go.byg_opak(navn, lag, materialer)
            assert 0.05 < k.u_factor < 2.0, (navn, k.u_factor)


def test_materialer_svarer_til_gh_materialer():
    materialer, _ = go.laes(FIL)
    for n, lam, rho, c in gh_materialer.MATERIALER:
        assert materialer[n.lower()][1:] == (lam, rho, c), n


def test_saet():
    _, opb = go.laes(FIL)
    navne = dict((t, opb[t][0][0]) for t in go.TYPER)
    cs, k, info = go.byg_saet(FIL, navne["ydervaeg"], navne["tag"], navne["terraendaek"], navne["vindue"])
    assert cs.wall_set.exterior_construction is k["ydervaeg"]
    assert cs.roof_ceiling_set.exterior_construction is k["tag"]
    assert cs.floor_set.ground_construction is k["terraendaek"]
    assert cs.aperture_set.operable_construction is k["vindue"]
    assert cs.aperture_set.skylight_construction is k["vindue"]
    assert "U =" in info
