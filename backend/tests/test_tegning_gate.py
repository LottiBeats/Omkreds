"""
test_tegning_gate.py — porten foran tegneprogrammet.

Tegneprogrammet er en statisk side uden for React-appen. Den kan ikke gemme sig
selv bag <SignedIn>, og en browser, der henter /tegning/index.html, sender ingen
Bearer-token -- kun cookies. Derfor spoerger nginx backend'en, foer den
udleverer en eneste fil, og /auth/gate er det spoergsmaal.

Det er en adgangskontrol, saa den skal proeves paa den maade, adgangskontroller
gaar i stykker paa: ikke "lukker den de rigtige ind", men "lukker den nogen ind,
den ikke burde". En port, der ved en fejl svarer 204 til alle, ser fuldstaendig
rigtig ud for den, der er logget ind.
"""
import pytest

import main


def test_uden_cookie_er_porten_lukket(client):
    """Den almindelige forbipasserende: ingen session overhovedet."""
    r = client.get('/auth/gate')
    assert r.status_code == 401


def test_en_opdigtet_cookie_er_ikke_nok(client):
    """
    Et vaerdiloest __session-flag maa ikke virke.

    Uden verifikationen ville porten bare tjekke, at cookien FINDES -- og en
    cookie kan enhver saette selv i sin egen browser paa et sekund.
    """
    r = client.get('/auth/gate', cookies={'__session': 'ikke-en-rigtig-jwt'})
    assert r.status_code == 401


def test_en_jwt_signeret_med_en_anden_noegle_afvises(client):
    """
    Rigtig form, forkert underskrift.

    Det er den fejl, der er vaerd at have en test for: en JWT, der ser
    fuldstaendig rigtig ud og har de rigtige felter, men er signeret af en, der
    ikke er Clerk. Bliver signaturen ikke tjekket, staar der ikke noget i
    tokenet, som afsloerer det.
    """
    falsk = (
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImZhbHNrIn0'
        '.eyJzdWIiOiJ1c2VyX2ZhbHNrIiwiZW1haWwiOiJuaWVsc0BleGFtcGxlLmNvbSJ9'
        '.dGhpcy1pcy1ub3QtYS1yZWFsLXNpZ25hdHVyZQ'
    )
    r = client.get('/auth/gate', cookies={'__session': falsk})
    assert r.status_code == 401


def test_porten_bruger_den_samme_verifikation_som_resten_af_api_et(monkeypatch,
                                                                   client):
    """
    En gyldig session slipper igennem — og gaar gennem verify_clerk_token.

    Testen kan ikke skaffe en aegte Clerk-JWT, saa den erstatter verifikationen
    og kontrollerer, at porten faktisk kalder den med cookiens indhold. Det er
    det, der binder porten til resten af API'ets sikkerhed: gaar den uden om
    verify_clerk_token, holder den heller ikke, naar noeglerne skiftes.
    """
    set_kald = {}

    def falsk_verifikation(token):
        set_kald['token'] = token
        return {'sub': 'user_123', 'email': 'niels@example.com'}

    monkeypatch.setattr(main, 'verify_clerk_token', falsk_verifikation)
    monkeypatch.setattr(main, '_ALLOWED_EMAILS', frozenset())

    r = client.get('/auth/gate', cookies={'__session': 'en-gyldig-token'})
    assert r.status_code == 204
    assert set_kald['token'] == 'en-gyldig-token', \
        'porten skal verificere cookiens indhold, ikke bare se at den er der'


def test_allowlisten_gaelder_ogsaa_her(monkeypatch, client):
    """
    ALLOWED_EMAILS lukker API'et for konti uden for listen. Tegneprogrammet er
    en del af det samme produkt, saa en konto, der ikke maa bruge API'et, skal
    heller ikke kunne aabne tegningerne.
    """
    monkeypatch.setattr(main, 'verify_clerk_token',
                        lambda t: {'sub': 'user_9', 'email': 'fremmed@andet.dk'})
    monkeypatch.setattr(main, '_ALLOWED_EMAILS', frozenset({'niels@example.com'}))

    r = client.get('/auth/gate', cookies={'__session': 'gyldig-men-forkert-konto'})
    assert r.status_code == 403


def test_en_session_uden_email_lukkes_ikke_ind_naar_listen_er_sat(monkeypatch,
                                                                  client):
    """
    Clerks sessions-cookie baerer ikke noedvendigvis en e-mail.

    Bearer-tokenet gor, fordi frontend'en beder om en JWT-skabelon der
    indeholder den. Cookien er Clerks standardsession og har kun sub, sid og
    exp, medmindre skabelonen siger andet. Er ALLOWED_EMAILS sat, og har
    sessionen ingen e-mail, kan porten ikke afgoere om brugeren maa -- og saa
    lukker den ikke op. En adgangskontrol, der fejler aabent, er ingen
    adgangskontrol.
    """
    monkeypatch.setattr(main, 'verify_clerk_token',
                        lambda t: {'sub': 'user_1', 'sid': 'sess_1'})
    monkeypatch.setattr(main, '_ALLOWED_EMAILS', frozenset({'niels@example.com'}))

    r = client.get('/auth/gate', cookies={'__session': 'gyldig-uden-email'})
    assert r.status_code == 403
    assert 'JWT-skabelon' in r.headers.get('X-Gate-Reason', ''), \
        'grunden skal kunne findes i loggen, ellers ligner det en forkert liste'


def test_uden_allowlist_er_en_session_uden_email_nok(monkeypatch, client):
    """
    Er ALLOWED_EMAILS ikke sat, er e-mailen uden betydning: enhver gyldig
    Clerk-konto maa bruge API'et, og saa maa den ogsaa aabne tegningerne.
    Det er sadan serveren staar i dag.
    """
    monkeypatch.setattr(main, 'verify_clerk_token',
                        lambda t: {'sub': 'user_1', 'sid': 'sess_1'})
    monkeypatch.setattr(main, '_ALLOWED_EMAILS', frozenset())

    r = client.get('/auth/gate', cookies={'__session': 'gyldig-uden-email'})
    assert r.status_code == 204
