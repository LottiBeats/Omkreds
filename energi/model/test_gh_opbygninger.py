"""
Test af gh_opbygninger.py: alle opbygninger i energi/regler/opbygninger.txt kan bygges,
og teksten fra komponenten bliver til et rigtigt Honeybee ConstructionSet
(som HB String to Object gør i Grasshopper).

    python -m pytest energi/model/test_gh_opbygninger.py
"""
import json
from pathlib import Path

from honeybee_energy.dictutil import dict_to_object

import gh_materialer
import gh_opbygninger as go

FIL = str(Path(__file__).resolve().parents[1] / "regler" / "opbygninger.txt")


def test_alle_opbygninger_kan_bygges():
    materialer, opb = go.laes(FIL)
    for typ in go.TYPER:
        assert opb[typ], typ
        for navn, lag in opb[typ]:
            if typ == "vindue":
                d, _ = go.byg_vindue(navn, lag)
            else:
                d, u = go.byg_opak(navn, lag, materialer, typ)
                assert 0.05 < u < 0.5, (navn, u)
            assert dict_to_object(d) is not None


def test_materialer_svarer_til_gh_materialer():
    materialer, _ = go.laes(FIL)
    for n, lam, rho, c in gh_materialer.MATERIALER:
        assert materialer[n.lower()][1:] == (lam, rho, c), n


def test_saet_bliver_til_honeybee():
    _, opb = go.laes(FIL)
    navne = dict((t, opb[t][0][0]) for t in go.TYPER)
    d, info = go.byg_saet(FIL, navne["ydervaeg"], navne["tag"], navne["terraendaek"], navne["vindue"])
    cs = dict_to_object(json.loads(json.dumps(d)))
    assert cs.wall_set.exterior_construction.display_name == navne["ydervaeg"]
    assert cs.roof_ceiling_set.exterior_construction.display_name == navne["tag"]
    assert cs.floor_set.ground_construction.display_name == navne["terraendaek"]
    assert cs.aperture_set.operable_construction.display_name == navne["vindue"]
    assert cs.aperture_set.skylight_construction.display_name == navne["vindue"]
    assert abs(cs.wall_set.exterior_construction.u_factor - 0.121) < 0.01
    assert "U =" in info


def test_tomme_valg_giver_standard():
    d, info = go.byg_saet(FIL, None, None, None, None)
    cs = dict_to_object(d)
    assert "Generic" in cs.wall_set.exterior_construction.identifier
