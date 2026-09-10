"""
test_enheder_i_builtins.py — ingen import maa fjerne enhederne fra builtins.

Fejlen der gav anledning til filen
----------------------------------
udnyttelse.py kaldte si.environment('structural') UDEN top_level=True.
Det kald ophaever den injektion i builtins, som et tidligere kald MED
top_level=True har lavet -- og main.py laver netop det ved opstart.

Modulet importeres dovent, inde i en funktion. Foerste gang nogen koerte en
rammeberegning, forsvandt kN, m og MPa ud af builtins, og NAESTE blok, man
koerte, sagde:

    name 'kN' is not defined

Intet i FEM-blokken saa forkert ud. Fejlen laa et andet sted, i en anden blok,
og foerst efter en handling der tilsyneladende var lykkedes.

Derfor staar vagten her og ikke i udnyttelse.py: den skal gaelde ethvert modul,
ogsaa dem der bliver skrevet i morgen.
"""
import builtins
import importlib
import pkgutil

import pytest

ENHEDER = ('kN', 'N', 'm', 'mm', 'MPa', 'GPa', 'kPa', 'Pa')

# Moduler der ikke skal importeres af en test: de starter servere, koerer
# scripts eller kraever et miljoe, testen ikke har.
SPRING_OVER = {'main', 'app', 'conftest'}


def _beregningsmoduler():
    import os
    her = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for m in pkgutil.iter_modules([her]):
        if m.name.startswith('_') or m.name in SPRING_OVER:
            continue
        if m.name.startswith('test_'):
            continue
        yield m.name


@pytest.mark.parametrize('modul', sorted(_beregningsmoduler()))
def test_importen_efterlader_enhederne_i_builtins(modul):
    """
    Efter import af et hvilket som helst beregningsmodul skal enhederne stadig
    vaere der.

    Et modul, der bruger forallpeople, skal kalde

        si.environment('structural', top_level=True)

    Uden top_level=True fjerner kaldet enhederne for ALLE andre.
    """
    import main            # noqa: F401 — saetter enhederne op som appen goer
    assert hasattr(builtins, 'kN'), 'forudsaetningen: main.py har lagt dem der'

    try:
        importlib.import_module(modul)
    except Exception as exc:
        pytest.skip('%s kan ikke importeres her: %s' % (modul, exc))

    mangler = [e for e in ENHEDER if not hasattr(builtins, e)]
    assert not mangler, (
        'import af %s fjernede %s fra builtins.\n'
        'Kald si.environment("structural", top_level=True) i det modul — '
        'uden top_level ophaeves injektionen for hele processen, og naeste '
        'blok siger "name \'kN\' is not defined".'
        % (modul, ', '.join(mangler)))
