"""
udnyttelse.py — eftervisningens udnyttelsesgrad, som funktion af snitkraften.

Hvorfor
-------
Snitkraefterne varierer langs stangen; kapaciteterne goer ikke. f_m,d, f_v,d,
W_y og A afhaenger af tvaersnit, styrkeklasse, k_mod og gamma_M -- ikke af hvor
paa stangen man staar. Udnyttelsen i et snit er derfor bare

    eta_boejning   = (M(x) / W_y) / f_m,d
    eta_forskydn.  = (1,5·V(x) / A) / f_v,d

med de samme tal, eftervisningen selv bruger. Det er dét, der goer en kurve
langs stangen mulig uden at regne hele eftervisningen 40 gange.

Én sandhed
----------
timber.py er ikke skrevet om. Formlerne her er de samme, men de staar to
steder, og to steder gaar fra hinanden. Derfor findes
test_udnyttelse_stemmer_med_timber: den koerer timber.beam_check() og denne
funktion paa de samme tal og kraever, at forholdene er ens. Falder de fra
hinanden, fejler den -- og en kurve, der siger 0,43 hvor eftervisningen siger
0,51, er vaerre end ingen kurve.

Hvad den IKKE daekker
---------------------
Kipning afhaenger af momentfordelingen over den frie laengde, ikke af momentet
i ét snit, saa k_crit hoerer ikke hjemme i en snitkurve. Samvirke mellem
normalkraft og moment (6.19-6.24) er heller ikke med endnu. Kurven er
boejning og forskydning, og den siger det selv.
"""
from __future__ import annotations

import forallpeople as si

si.environment('structural')
from forallpeople import MPa, mm, kN, m      # noqa: E402


def kapaciteter_af(b, h, f_mk, f_vk, kmod, gamma_M):
    """
    De stoerrelser, en udnyttelse i et snit skal bruge — af stoerrelser med
    enheder, som timber.py har dem.

    Dette er DEN ene definition. timber.py kalder den, og udnyttelseskurven
    kalder den. Foerst stod formlerne to steder, og de kunne kun holdes sammen
    af en test, der laeste trykte, afrundede tal -- og den kunne ikke komme
    taettere end 0,3 %. To implementeringer af det samme er ikke noget, en
    test kan redde; de skal vaere den samme.
    """
    return {
        'W_y':  (b * h ** 2) / 6,
        'A':    b * h,
        'f_md': kmod * f_mk / gamma_M,
        'f_vd': kmod * f_vk / gamma_M,
    }


def kapaciteter(b_mm, h_mm, grade_key, kmod, gamma_M):
    """Samme, men slaaet op ud fra en styrkeklasse. Til kurven."""
    from timber_grades import get_timber_grade

    _, g = get_timber_grade(grade_key)
    return kapaciteter_af(float(b_mm) * mm, float(h_mm) * mm,
                          g['f_mk'], g['f_vk'], kmod, gamma_M)


def eta_i_snit(M_kNm, V_kN, kap):
    """
    (eta_boejning, eta_forskydning) i ét snit.

    M og V som tal i kNm og kN -- det er dem, snitkraftkurven leverer.
    Fortegnet er ligegyldigt for en udnyttelse; det er stoerrelsen, der
    eftervises.
    """
    sigma = abs(float(M_kNm)) * kN * m / kap['W_y']
    tau = 1.5 * abs(float(V_kN)) * kN / kap['A']
    return (float(sigma / kap['f_md']), float(tau / kap['f_vd']))


def eta_langs_stang(pl, L, segs_y, segs_x, kap, n=60):
    """
    [(x, eta_boejning, eta_forskydning)] langs stangen.

    Afsnitsenderne laegges ind mellem stikproeverne af samme grund som i
    diagrammerne: dér ligger knaekket, og et jaevnt gitter skaerer hjoernet.
    """
    import stanglaster as sl

    steder = {0.0, float(L)}
    for seg in (list(segs_y) + list(segs_x)):
        s = sl._klip(seg, L)
        if s is not None:
            steder.add(s[2])
            steder.add(s[3])
    for i in range(n + 1):
        steder.add(L * i / n)

    ud = []
    for x in sorted(v for v in steder if 0.0 <= v <= L):
        _, V, M = sl.snitkraefter(pl, x, segs_y, segs_x, L)
        e_m, e_v = eta_i_snit(M, V, kap)
        ud.append((x, e_m, e_v))
    return ud
