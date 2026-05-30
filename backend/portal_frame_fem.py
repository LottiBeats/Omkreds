"""
portal_frame_fem.py
===================
2D elastic portal frame solver using OpenSeesPy.

Geometry
--------
(nBays+1) columns spaced w_bay apart, all of height h_bay.
Nodes are numbered per column: odd = base, even = eave.
  col 0 → nodes 1 (base), 2 (eave)
  col 1 → nodes 3 (base), 4 (eave)
  col k → nodes 2k+1 (base), 2k+2 (eave)

Elements:
  columns  → tags 1 .. nBays+1
  rafters  → tags nBays+2 .. 2*nBays+1

Sign conventions (OpenSeesPy local axes)
-----------------------------------------
- eleForce returns [N_i, V_i, M_i, N_j, V_j, M_j] in local coords
- eleLoad wy < 0 → load acts downward (gravity direction)
- nodeDisp / nodeReaction: [ux, uy, rz] per node

Dependencies: openseespy, opsvis (optional, for plots), matplotlib
"""

from dataclasses import dataclass

try:
    import openseespy.opensees as ops
    _OPS_AVAILABLE = True
except ImportError:
    _OPS_AVAILABLE = False

try:
    import opsvis as opsv
    _OPSVIS_AVAILABLE = True
except ImportError:
    _OPSVIS_AVAILABLE = False

import matplotlib.pyplot as plt


# ---------------------------------------------------------------------------
# Load descriptors
# ---------------------------------------------------------------------------

@dataclass
class _RafterUDL:
    rafter_idx: int   # 0-based
    wy: float         # N/m, negative = downward


@dataclass
class _NodalLoad:
    node_tag: int
    Fx: float = 0.0
    Fy: float = 0.0
    Mz: float = 0.0


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class PortalFrameFEM:
    """
    2D elastic portal frame finite element solver (OpenSeesPy).

    Parameters
    ----------
    n_bays : int
        Number of bays.
    h_bay : float
        Frame height [m].
    w_bay : float
        Bay width [m].
    E : float
        Young's modulus [Pa].
    A : float
        Cross-sectional area [m²].
    Iz : float
        Second moment of area about the local z-axis [m⁴].
    """

    def __init__(self, n_bays: int, h_bay: float, w_bay: float,
                 E: float, A: float, Iz: float):
        if not _OPS_AVAILABLE:
            raise ImportError(
                "openseespy is required. Install with: pip install openseespy")

        self.n_bays = int(n_bays)
        self.h_bay = float(h_bay)
        self.w_bay = float(w_bay)
        self.E = float(E)
        self.A = float(A)
        self.Iz = float(Iz)

        self.n_cols = self.n_bays + 1

        self._rafter_udls: list[_RafterUDL] = []
        self._nodal_loads: list[_NodalLoad] = []

        self._solved = False
        self.node_disps: dict[int, list[float]] = {}
        self.node_reactions: dict[int, list[float]] = {}
        self.ele_forces: dict[int, list[float]] = {}

    # ------------------------------------------------------------------
    # Tag helpers — use these everywhere instead of raw arithmetic
    # ------------------------------------------------------------------

    def base_node(self, col_idx: int) -> int:
        """Base (support) node tag for column col_idx (0-based)."""
        return 2 * col_idx + 1

    def eave_node(self, col_idx: int) -> int:
        """Eave node tag for column col_idx (0-based)."""
        return 2 * col_idx + 2

    def col_ele(self, col_idx: int) -> int:
        """Column element tag for column col_idx (0-based)."""
        return col_idx + 1

    def rafter_ele(self, rafter_idx: int) -> int:
        """Rafter element tag for rafter rafter_idx (0-based)."""
        return self.n_cols + rafter_idx + 1

    def support_nodes(self) -> list[int]:
        """Tags of all base (fixed support) nodes."""
        return [self.base_node(i) for i in range(self.n_cols)]

    def eave_nodes(self) -> list[int]:
        """Tags of all eave nodes."""
        return [self.eave_node(i) for i in range(self.n_cols)]

    # ------------------------------------------------------------------
    # Load definition
    # ------------------------------------------------------------------

    def add_rafter_udl(self, rafter_idx: int, wy: float):
        """
        Uniform distributed load on a rafter.

        Parameters
        ----------
        rafter_idx : int
            0-based rafter index (0 = leftmost).
        wy : float
            Transverse load [N/m]. Negative = downward.
        """
        if not (0 <= rafter_idx < self.n_bays):
            raise ValueError(
                f"rafter_idx must be 0..{self.n_bays - 1}, got {rafter_idx}")
        self._rafter_udls.append(_RafterUDL(rafter_idx, wy))

    def add_nodal_load(self, node_tag: int,
                       Fx: float = 0.0, Fy: float = 0.0, Mz: float = 0.0):
        """Concentrated load at any node [N, N, N·m]."""
        self._nodal_loads.append(_NodalLoad(node_tag, Fx, Fy, Mz))

    def add_lateral_load(self, col_idx: int, Fx: float):
        """Horizontal point load at the eave of column col_idx."""
        self.add_nodal_load(self.eave_node(col_idx), Fx=Fx)

    # ------------------------------------------------------------------
    # Solve
    # ------------------------------------------------------------------

    def solve(self):
        """Build the OpenSeesPy model and run a linear static analysis."""
        ops.wipe()
        ops.model('basic', '-ndm', 2, '-ndf', 3)

        ops.geomTransf('Linear', 1)

        # Nodes
        for i in range(self.n_cols):
            x = i * self.w_bay
            ops.node(self.base_node(i), x, 0.0)
            ops.node(self.eave_node(i), x, self.h_bay)

        # Fixed supports at all column bases
        for i in range(self.n_cols):
            ops.fix(self.base_node(i), 1, 1, 1)

        # Column elements
        for i in range(self.n_cols):
            ops.element('elasticBeamColumn',
                        self.col_ele(i),
                        self.base_node(i), self.eave_node(i),
                        self.A, self.E, self.Iz, 1)

        # Rafter elements
        for i in range(self.n_bays):
            ops.element('elasticBeamColumn',
                        self.rafter_ele(i),
                        self.eave_node(i), self.eave_node(i + 1),
                        self.A, self.E, self.Iz, 1)

        # Loads
        ops.timeSeries('Constant', 1)
        ops.pattern('Plain', 1, 1)

        for rl in self._rafter_udls:
            ops.eleLoad('-ele', self.rafter_ele(rl.rafter_idx),
                        '-type', '-beamUniform', rl.wy)

        for nl in self._nodal_loads:
            ops.load(nl.node_tag, nl.Fx, nl.Fy, nl.Mz)

        # Analysis
        ops.system('BandGeneral')
        ops.numberer('RCM')
        ops.constraints('Transformation')
        ops.integrator('LoadControl', 1)
        ops.algorithm('Linear')
        ops.analysis('Static')
        ok = ops.analyze(1)
        if ok != 0:
            raise RuntimeError("OpenSeesPy analysis failed (analyze returned non-zero).")

        ops.reactions()

        # Extract results for every node and element
        for i in range(self.n_cols):
            for tag in (self.base_node(i), self.eave_node(i)):
                self.node_disps[tag] = ops.nodeDisp(tag)
                self.node_reactions[tag] = ops.nodeReaction(tag)

        for i in range(self.n_cols):
            tag = self.col_ele(i)
            self.ele_forces[tag] = ops.eleForce(tag)

        for i in range(self.n_bays):
            tag = self.rafter_ele(i)
            self.ele_forces[tag] = ops.eleForce(tag)

        self._solved = True

    # ------------------------------------------------------------------
    # Results helpers
    # ------------------------------------------------------------------

    def _check_solved(self):
        if not self._solved:
            raise RuntimeError("Call solve() first.")

    def max_lateral_disp(self) -> tuple[float, int]:
        """Max |ux| at eave nodes. Returns (disp_m, node_tag)."""
        self._check_solved()
        eaves = {t: self.node_disps[t][0] for t in self.eave_nodes()}
        tag = max(eaves, key=lambda t: abs(eaves[t]))
        return eaves[tag], tag

    def max_vertical_disp(self) -> tuple[float, int]:
        """Max |uy| at eave nodes. Returns (disp_m, node_tag)."""
        self._check_solved()
        eaves = {t: self.node_disps[t][1] for t in self.eave_nodes()}
        tag = max(eaves, key=lambda t: abs(eaves[t]))
        return eaves[tag], tag

    def max_moment(self) -> tuple[float, int]:
        """Max |M| across all elements. Returns (moment_Nm, ele_tag)."""
        self._check_solved()
        best_M, best_ele = 0.0, None
        for tag, f in self.ele_forces.items():
            # f = [N_i, V_i, M_i, N_j, V_j, M_j]
            M = max(abs(f[2]), abs(f[5]))
            if M > best_M:
                best_M, best_ele = M, tag
        return best_M, best_ele

    def results_summary(self) -> dict:
        """
        Return a structured results dict suitable for report generation.

        Keys
        ----
        max_lateral_disp_m/mm, max_lateral_disp_node,
        max_vertical_disp_m/mm, max_vertical_disp_node,
        max_moment_Nm/kNm, max_moment_ele,
        node_disps, node_reactions, ele_forces
        """
        self._check_solved()
        ux, ux_node = self.max_lateral_disp()
        uy, uy_node = self.max_vertical_disp()
        M, M_ele = self.max_moment()

        return {
            'max_lateral_disp_m':    ux,
            'max_lateral_disp_mm':   ux * 1e3,
            'max_lateral_disp_node': ux_node,
            'max_vertical_disp_m':   uy,
            'max_vertical_disp_mm':  uy * 1e3,
            'max_vertical_disp_node': uy_node,
            'max_moment_Nm':  M,
            'max_moment_kNm': M * 1e-3,
            'max_moment_ele': M_ele,
            'node_disps':      self.node_disps,
            'node_reactions':  self.node_reactions,
            'ele_forces':      self.ele_forces,
        }

    def print_summary(self):
        """Print a formatted results table to stdout."""
        self._check_solved()
        r = self.results_summary()
        w = 55
        print("\n" + "=" * w)
        print("  Portal Frame FEM — Results")
        print("=" * w)
        print(f"  Bays   : {self.n_bays}  ×  {self.w_bay:.1f} m wide")
        print(f"  Height : {self.h_bay:.1f} m")
        print(f"  E      : {self.E:.3e} Pa    A : {self.A:.4f} m²    Iz : {self.Iz:.3e} m⁴")
        print("-" * w)
        print(f"  Max lateral disp  : {r['max_lateral_disp_mm']:+.2f} mm  "
              f"(node {r['max_lateral_disp_node']})")
        print(f"  Max vertical disp : {r['max_vertical_disp_mm']:+.2f} mm  "
              f"(node {r['max_vertical_disp_node']})")
        print(f"  Max bending moment: {r['max_moment_kNm']:.2f} kN·m  "
              f"(element {r['max_moment_ele']})")
        print("-" * w)
        print("  Support reactions:")
        for tag in self.support_nodes():
            R = self.node_reactions[tag]
            print(f"    Node {tag:2d}: "
                  f"Fx = {R[0]*1e-3:+7.2f} kN  "
                  f"Fy = {R[1]*1e-3:+7.2f} kN  "
                  f"Mz = {R[2]*1e-3:+7.2f} kN·m")
        print("=" * w + "\n")

    # ------------------------------------------------------------------
    # Visualisation (requires opsvis)
    # ------------------------------------------------------------------

    def _require_opsvis(self):
        if not _OPSVIS_AVAILABLE:
            raise ImportError("opsvis is required for plots. pip install opsvis")

    def plot_model(self, title: str = 'Portal Frame — Model'):
        self._require_opsvis()
        opsv.plot_model(fig_wi_he=(14, 6))
        plt.title(title)
        plt.xlabel('x [m]')
        plt.ylabel('y [m]')
        plt.grid(True)
        plt.tight_layout()
        plt.show()

    def plot_defo(self, title: str = 'Portal Frame — Deflection'):
        self._check_solved()
        self._require_opsvis()
        s = opsv.plot_defo(
            fig_wi_he=(14, 6),
            fmt_defo={'color': 'red', 'linestyle': (0, (4, 5)), 'linewidth': 1.5},
            fmt_undefo={'color': '#555555', 'linestyle': 'solid', 'linewidth': 1.5},
        )
        plt.title(f'{title}  (scale ×{round(s, 1)})')
        plt.xlabel('x [m]')
        plt.ylabel('y [m]')
        plt.grid(True)
        plt.tight_layout()
        plt.show()

    def plot_forces(self, force_type: str = 'M',
                    scale_factor: float = None,
                    title: str = None):
        """
        Internal force diagram via OpsVis.

        Parameters
        ----------
        force_type : str
            'M' bending moment, 'V' shear, 'N' axial.
        scale_factor : float, optional
            Diagram scale. Auto-picked if None.
        title : str, optional
            Plot title.
        """
        self._check_solved()
        self._require_opsvis()

        _defaults = {
            'M': (5e-6,  'Bending Moment Diagram', 'green'),
            'V': (15e-6, 'Shear Force Diagram',    'red'),
            'N': (5e-6,  'Axial Force Diagram',     'steelblue'),
        }
        if force_type not in _defaults:
            raise ValueError(f"force_type must be 'M', 'V', or 'N'")

        fac, label, colour = _defaults[force_type]
        if scale_factor is not None:
            fac = scale_factor
        if title is None:
            title = f'Portal Frame — {label}'

        opsv.section_force_diagram_2d(
            force_type, fac, fig_wi_he=(14, 6),
            fmt_secforce1={'color': colour},
            fmt_secforce2={'color': colour},
        )
        plt.title(title)
        plt.xlabel('x [m]')
        plt.ylabel('y [m]')
        plt.grid(True)
        plt.tight_layout()
        plt.show()


# ---------------------------------------------------------------------------
# __main__ — replicates the notebook example exactly
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    frame = PortalFrameFEM(
        n_bays=2, h_bay=5.0, w_bay=10.0,
        E=200e9, A=0.03, Iz=300e-6,
    )
    frame.add_rafter_udl(0, -10_000)   # 10 kN/m on left rafter
    frame.add_rafter_udl(1, -20_000)   # 20 kN/m on right rafter
    frame.add_nodal_load(frame.eave_node(0), Fx=200_000)  # 200 kN lateral at left eave

    frame.solve()
    frame.print_summary()

    frame.plot_model()
    frame.plot_defo()
    frame.plot_forces('M')
    frame.plot_forces('V')
    frame.plot_forces('N')
