"""
test_verifikation.py — uafhaengig kontrol af Omkreds FEM.

A) Laerebogsformler gennem det rigtige API (samme vej som programmet).
B) Tilfaeldige rammer: fem_direkte (produktion) mod PyNite (uafhaengig).
C) Global ligevaegt: paasatte laster integreret her, uden loeseren, mod
   reaktionerne.
"""
import math, random, sys, warnings
warnings.filterwarnings('ignore')
from fastapi.testclient import TestClient
import pytest
import desktop_app, fem_direkte, fem_pynite

c = TestClient(desktop_app.lav_app())
E, A, I = 210.0, 53.8, 8356.0           # GPa, cm2, cm4
EI = E * 1e6 * I * 1e-8                  # kNm2
fejl = []
antal = 0

def tjek(navn, faktisk, ventet, tol=1e-3):
    global antal
    antal += 1
    rel = abs(faktisk - ventet) / max(abs(ventet), 1e-6)
    ok = rel <= tol or abs(faktisk - ventet) < 1e-6
    print(f"  {'OK ' if ok else 'FEJL'} {navn:55s} program {faktisk:12.5f}  ventet {ventet:12.5f}  afv. {rel*100:7.4f} %")
    if not ok:
        fejl.append(navn)

def el(i, a, b, **kw):
    return dict(id=i, ni=a, nj=b, E_GPa=E, A_cm2=A, Iz_cm4=I, **kw)

def kør(nodes, elements, supports, loads, **extra):
    r = c.post('/api/calc/general-frame-fem', json=dict(nodes=nodes, elements=elements, supports=supports, loads=loads, **extra))
    assert r.status_code == 200, r.text[:400]
    return r.json()['_summary']

PIN = lambda n: dict(node_id=n, ux=True, uy=True, rz=False)
ROL = lambda n: dict(node_id=n, ux=False, uy=True, rz=False)
FIX = lambda n: dict(node_id=n, ux=True, uy=True, rz=True)
Ry = lambda s, n: s['reactions'][str(n)]['Fy_kN']
Rx = lambda s, n: s['reactions'][str(n)]['Fx_kN']
Mr = lambda s, n: s['reactions'][str(n)]['Mz_kNm']
N2 = [dict(id=1, x=0, y=0), dict(id=2, x=6, y=0)]
udl = lambda e, w, **kw: dict(type='udl', elem_id=e, direction='vertical', value_kNm=w, **kw)



def test_laerebogsformler():
    global fejl
    fejl = []
    print("\nA) Laerebogsformler")
    L, w = 6.0, 10.0
    s = kør(N2, [el(1, 1, 2)], [PIN(1), ROL(2)], [udl(1, w)])
    tjek("Simpel bjaelke, jaevn last: M = wL²/8", s['max_moment_kNm'], w*L*L/8)
    tjek("  R = wL/2", Ry(s, 1), w*L/2)
    tjek("  δ = 5wL⁴/384EI [mm]", abs(s['max_uy_mm']), 5*w*L**4/(384*EI)*1000)

    s = kør(N2, [el(1, 1, 2)], [FIX(1), FIX(2)], [udl(1, w)])
    tjek("Indspaendt i begge ender: M_ende = wL²/12", s['max_moment_kNm'], w*L*L/12)
    tjek("  δ = wL⁴/384EI [mm]", abs(s['max_uy_mm']), w*L**4/(384*EI)*1000)

    s = kør(N2, [el(1, 1, 2)], [FIX(1), ROL(2)], [udl(1, w)])
    tjek("Indspaendt/simpel: M_indsp = wL²/8", abs(Mr(s, 1)), w*L*L/8)
    tjek("  R_simpel = 3wL/8", Ry(s, 2), 3*w*L/8)

    P = 10.0
    s = kør(N2, [el(1, 1, 2)], [FIX(1)], [dict(type='nodal', node_id=2, Fy_kN=-P)])
    tjek("Udkraget, punktlast i spidsen: M = PL", s['max_moment_kNm'], P*L)
    tjek("  δ = PL³/3EI [mm]", abs(s['max_uy_mm']), P*L**3/(3*EI)*1000)

    a, b = 2.0, 4.0; eps = L/20000
    pl = dict(type='udl', elem_id=1, direction='vertical', value_kNm=P/eps, x1=a-eps/2, x2=a+eps/2, punkt_kN=P, punkt_x=a)
    s = kør(N2, [el(1, 1, 2)], [PIN(1), ROL(2)], [pl])
    tjek("Punktlast paa stang: M = Pab/L", s['max_moment_kNm'], P*a*b/L)
    tjek("  R_A = Pb/L", Ry(s, 1), P*b/L)
    bm = min(a, b)
    tjek("  δ_max = Pb(L²-b²)^1,5/(9√3·EIL), b kortest [mm]", abs(s['max_uy_mm']), P*bm*(L*L-bm*bm)**1.5/(9*math.sqrt(3)*EI*L)*1000)

    s = kør(N2, [el(1, 1, 2)], [PIN(1), ROL(2)], [udl(1, 0.0, value_end_kNm=w)])
    tjek("Trekantlast 0→w: R_A = wL/6", Ry(s, 1), w*L/6)
    tjek("  R_B = wL/3", Ry(s, 2), w*L/3)
    tjek("  M_max = wL²/(9√3)", s['max_moment_kNm'], w*L*L/(9*math.sqrt(3)))

    s = kør(N2, [el(1, 1, 2)], [PIN(1), ROL(2)], [udl(1, w, x1=1.0, x2=3.0)])
    F = w*2; xc = 2.0
    RA = F*(L-xc)/L
    x0 = 1.0 + RA/w
    tjek("Dellast w fra 1 til 3 m: R_A (statik)", Ry(s, 1), RA)
    tjek("  M_max (statik)", s['max_moment_kNm'], RA*x0 - w*(x0-1.0)**2/2)

    N3 = [dict(id=1, x=0, y=0), dict(id=2, x=5, y=0), dict(id=3, x=10, y=0)]
    s = kør(N3, [el(1, 1, 2), el(2, 2, 3)], [PIN(1), ROL(2), ROL(3)], [udl(1, w), udl(2, w)])
    tjek("To fag, jaevn last: M_stoette = wL²/8", s['max_moment_kNm'], w*25/8)
    tjek("  R_midt = 5wL/4", Ry(s, 2), 5*w*5/4)
    tjek("  R_ende = 3wL/8", Ry(s, 1), 3*w*5/8)

    # Skraa stang 4 vandret x 3 lodret (L=5), charnier + lodret rulle
    Ns = [dict(id=1, x=0, y=0), dict(id=2, x=4, y=3)]
    for retn, total in (('vertical', w*5), ('projected', w*4)):
        s = kør(Ns, [el(1, 1, 2)], [PIN(1), ROL(2)], [dict(type='udl', elem_id=1, direction=retn, value_kNm=w)])
        tjek(f"Skraa stang, '{retn}': ΣR_y = {total:.0f} kN", Ry(s, 1)+Ry(s, 2), total)
        tjek(f"  R_y(top) = total/2 (lodret rulle)", Ry(s, 2), total/2)
        tjek(f"  M_max = total·4/8 (vandret projektion)", s['max_moment_kNm'], total*4/8)
    s = kør(Ns, [el(1, 1, 2)], [PIN(1), ROL(2)], [dict(type='udl', elem_id=1, direction='perpendicular', value_kNm=w)])
    # resultant w*5 vinkelret, retning -(−sa, ca) = (0.6, -0.8)
    tjek("Skraa stang, vinkelret: ΣR_y = 0,8·w·L", Ry(s, 1)+Ry(s, 2), 0.8*w*5)
    tjek("  ΣR_x = -0,6·w·L", Rx(s, 1)+Rx(s, 2), -0.6*w*5)
    s = kør(Ns, [el(1, 1, 2)], [PIN(1), ROL(2)], [dict(type='udl', elem_id=1, direction='horizontal', value_kNm=w)])
    tjek("Skraa stang, vandret: ΣR_x = -w·L", Rx(s, 1)+Rx(s, 2), -w*5)

    # Treleddet ramme: charnierfoedder, charnier i kip, jaevn last pr. vandret m
    Lr, h, f = 10.0, 4.0, 2.0
    Nr = [dict(id=1, x=0, y=0), dict(id=2, x=0, y=h), dict(id=3, x=Lr/2, y=h+f), dict(id=4, x=Lr, y=h), dict(id=5, x=Lr, y=0)]
    Er = [el(1, 1, 2), el(2, 2, 3, release='end'), el(3, 3, 4), el(4, 4, 5)]
    s = kør(Nr, Er, [PIN(1), PIN(5)], [dict(type='udl', elem_id=2, direction='projected', value_kNm=w), dict(type='udl', elem_id=3, direction='projected', value_kNm=w)])
    H = w*Lr*Lr/(8*(h+f))
    tjek("Treleddet ramme: V = qL/2", Ry(s, 1), w*Lr/2)
    tjek("  H = qL²/(8(h+f))", abs(Rx(s, 1)), H)
    tjek("  M_hjoerne = H·h", s['max_moment_kNm'], H*h)

    # Portal med charnierfoedder, vandret P i rigelhoejde
    Np = [dict(id=1, x=0, y=0), dict(id=2, x=0, y=4), dict(id=3, x=6, y=4), dict(id=4, x=6, y=0)]
    Ep = [el(1, 1, 2), el(2, 2, 3), el(3, 3, 4)]
    s = kør(Np, Ep, [PIN(1), PIN(4)], [dict(type='nodal', node_id=2, Fx_kN=P)])
    tjek("Portal, charnierfoedder, P vandret: H_A = P/2", abs(Rx(s, 1)), P/2, 2e-3)
    tjek("  V = P·h/L", abs(Ry(s, 1)), P*4/6)
    tjek("  M_hjoerne = P·h/2", s['max_moment_kNm'], P*4/2, 2e-3)

    # Gitter: trekant, spids-last
    Ng = [dict(id=1, x=0, y=0), dict(id=2, x=3, y=2), dict(id=3, x=6, y=0)]
    Eg = [el(1, 1, 2, type='truss'), el(2, 2, 3, type='truss'), el(3, 1, 3, type='truss')]
    s = kør(Ng, Eg, [PIN(1), ROL(3)], [dict(type='nodal', node_id=2, Fy_kN=-P)])
    alpha = math.atan2(2, 3)
    Nn = {e['id']: e['N_i_kN'] for e in s['ele_force_table']}
    tjek("Gitter: N_spaer = -P/(2 sin α) (tryk)", -abs(Nn[1]), -P/(2*math.sin(alpha)))
    tjek("  N_baand = P/(2 tan α) (traek)", abs(Nn[3]), P/(2*math.tan(alpha)))

    # Kombination = superposition: 1,0G + 1,5Q (CC2), 6.10a = 1,2G
    lc = [dict(nr=1, navn='G', kategori='permanent'), dict(nr=2, navn='Q', kategori='imposed', nyttelastkategori='A')]
    s = kør(N2, [el(1, 1, 2)], [PIN(1), ROL(2)], [udl(1, 4.0, lc=1), udl(1, 3.0, lc=2, x1=1.0, x2=4.0, value_end_kNm=6.0)], load_cases=lc)
    sg = kør(N2, [el(1, 1, 2)], [PIN(1), ROL(2)], [udl(1, 4.0)])
    sq = kør(N2, [el(1, 1, 2)], [PIN(1), ROL(2)], [udl(1, 3.0, x1=1.0, x2=4.0, value_end_kNm=6.0)])
    tjek("Kombination = 1,0·G + 1,5·Q (superposition, R_A)", Ry(s, 1), max(1.0*Ry(sg, 1)+1.5*Ry(sq, 1), 1.2*Ry(sg, 1)))
    s3 = kør(N2, [el(1, 1, 2)], [PIN(1), ROL(2)], [udl(1, 4.0, lc=1), udl(1, 3.0, lc=2)], load_cases=lc, consequence_class='CC3')
    tjek("CC3: K_FI = 1,1 → M = 1,1·(1,0G + 1,5Q)", s3['max_moment_kNm'], 1.1*(4.0+1.5*3.0)*L*L/8)


    assert not fejl, fejl


@pytest.mark.skipif(not fem_pynite._PYNITE_AVAILABLE, reason='PyNite er ikke installeret')
def test_tilfaeldige_rammer_mod_pynite_og_ligevaegt():
    global fejl, antal
    fejl = []
    print("\nB) Tilfaeldige rammer: produktionens loeser mod PyNite")
    rng = random.Random(7)
    max_afv = 0.0
    n_tjek = 0
    def tilfaeldig_ramme():
        nfag = rng.randint(1, 3)
        xs = [0.0]
        for _ in range(nfag):
            xs.append(xs[-1] + rng.choice([4.0, 5.0, 6.0, 7.5]))
        h = rng.choice([3.0, 4.0, 5.5])
        nodes, elements, supports, loads = [], [], [], []
        nid = 1
        fod, top = [], []
        for x in xs:
            nodes.append(dict(id=nid, x=x, y=0.0)); fod.append(nid); nid += 1
            nodes.append(dict(id=nid, x=x, y=h + rng.choice([0.0, 0.5, 1.2]))); top.append(nid); nid += 1
        eid = 1
        for f_, t_ in zip(fod, top):
            elements.append(dict(id=eid, ni=f_, nj=t_, E_GPa=210, A_cm2=rng.choice([40, 65, 90]), Iz_cm4=rng.choice([3000, 8000, 15000]))); eid += 1
            supports.append(dict(node_id=f_, ux=True, uy=True, rz=rng.random() < 0.5))
        for i in range(nfag):
            rel = rng.choice(['none', 'none', 'start', 'end'])
            elements.append(dict(id=eid, ni=top[i], nj=top[i+1], E_GPa=210, A_cm2=54, Iz_cm4=rng.choice([5000, 8356, 12000]), release=rel)); eid += 1
        for e in elements:
            r = rng.random()
            Lx = math.hypot(nodes[e['nj']-1]['x']-nodes[e['ni']-1]['x'], nodes[e['nj']-1]['y']-nodes[e['ni']-1]['y'])
            d = rng.choice(['vertical', 'horizontal', 'perpendicular', 'projected'])
            v = rng.uniform(-8, 12)
            if r < 0.4:
                loads.append(dict(type='udl', elem_id=e['id'], direction=d, value_kNm=v))
            elif r < 0.7:
                x1 = rng.uniform(0, Lx*0.5); x2 = rng.uniform(x1+0.2, Lx)
                loads.append(dict(type='udl', elem_id=e['id'], direction=d, value_kNm=v, value_end_kNm=rng.uniform(-5, 15), x1=x1, x2=x2))
        for t_ in top:
            if rng.random() < 0.4:
                loads.append(dict(type='nodal', node_id=t_, Fx_kN=rng.uniform(-10, 10), Fy_kN=rng.uniform(-20, 5), Mz_kNm=0.0))
        return nodes, elements, supports, loads

    def last_resultant(nodes, elements, loads):
        """Global ΣFx, ΣFy, ΣM(0,0) af lasterne -- integreret her, ikke i loeseren."""
        dn = {n['id']: n for n in nodes}
        Fx = Fy = M = 0.0
        for ld in loads:
            if ld['type'] == 'nodal':
                n = dn[ld['node_id']]; fx, fy = ld.get('Fx_kN', 0), ld.get('Fy_kN', 0)
                Fx += fx; Fy += fy; M += n['x']*fy - n['y']*fx + ld.get('Mz_kNm', 0); continue
            e = next(x for x in elements if x['id'] == ld['elem_id'])
            a_, b_ = dn[e['ni']], dn[e['nj']]
            Lx = math.hypot(b_['x']-a_['x'], b_['y']-a_['y']); ca, sa = (b_['x']-a_['x'])/Lx, (b_['y']-a_['y'])/Lx
            x1 = ld.get('x1') or 0.0; x2 = ld.get('x2') if ld.get('x2') is not None else Lx
            w1 = ld['value_kNm']; w2 = ld.get('value_end_kNm', w1) if ld.get('value_end_kNm') is not None else w1
            n = 400
            for k in range(n):
                s_ = x1 + (x2-x1)*(k+0.5)/n; ds = (x2-x1)/n
                ww = w1 + (w2-w1)*(s_-x1)/(x2-x1)
                px, py = a_['x'] + ca*s_, a_['y'] + sa*s_
                d = ld['direction']
                if d == 'vertical':      gx, gy = 0.0, -ww
                elif d == 'projected':   gx, gy = 0.0, -ww*abs(ca)
                elif d == 'horizontal':  gx, gy = ww, 0.0
                else:                    gx, gy = ww*sa, -ww*ca     # + mod lokal -y
                Fx += gx*ds; Fy += gy*ds; M += (px*gy - py*gx)*ds
        return Fx, Fy, M

    max_lv = 0.0
    for k in range(40):
        nodes, elements, supports, loads = tilfaeldig_ramme()
        try:
            rd = fem_direkte.solve(nodes, elements, supports, loads)
            rp = fem_pynite.solve(nodes, elements, supports, loads)
        except Exception as ex:
            print('  model', k, 'afvist:', str(ex)[:80]); continue
        skala = max(1e-9, max(abs(v) for f_ in rd['ele_forces'].values() for v in f_))
        for eid in rd['ele_forces']:
            for i_, (u, v) in enumerate(zip(rd['ele_forces'][eid], rp['ele_forces'][eid])):
                max_afv = max(max_afv, abs(u-v)/skala); n_tjek += 1
        dsk = max(1e-12, max(abs(v) for d in rd['node_disps'].values() for v in d[:2]))
        for nid in rd['node_disps']:
            for u, v in zip(rd['node_disps'][nid][:2], rp['node_disps'][nid][:2]):
                max_afv = max(max_afv, abs(u-v)/dsk); n_tjek += 1
        # Ligevaegt
        Fx, Fy, M = last_resultant(nodes, elements, loads)
        dn = {n['id']: n for n in nodes}
        Rx_ = sum(r[0] for r in rd['node_reactions'].values()); Ry_ = sum(r[1] for r in rd['node_reactions'].values())
        RM = sum(dn[n]['x']*r[1] - dn[n]['y']*r[0] + r[2] for n, r in rd['node_reactions'].items())
        lv = max(abs(Fx+Rx_), abs(Fy+Ry_), abs(M+RM)) / max(1.0, abs(Fx), abs(Fy))
        max_lv = max(max_lv, lv)
    print(f"  {n_tjek} tal sammenlignet i 40 tilfaeldige rammer (charnierer, dellaster, trapez, skraa rigler, alle retninger)")
    print(f"  stoerste afvigelse mellem loeserne: {max_afv*100:.6f} % af modellens stoerste vaerdi")
    print(f"\nC) Global ligevaegt (lasterne integreret uafhaengigt af loeseren)")
    print(f"  stoerste ubalance ΣF/ΣM: {max_lv*100:.6f} %")
    antal += 2
    if max_afv > 1e-4: fejl.append('loesere uenige')
    if max_lv > 1e-3: fejl.append('ligevaegt')


    assert not fejl, fejl
