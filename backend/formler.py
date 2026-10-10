"""
formler.py — formler med rigtige brøker og rødder i PDF'en

Formelkolonnen i en beregningsrække er skrevet som tekst: "A_s·f_yd / (0,8·b·f_cd)".
I editoren tegnes " a / b " (skråstreg med mellemrum) som en stablet brøk
(CalcResultView.fmtCalcText); i PDF'en stod det hidtil på én linje. Her
oversættes den samme notation til matplotlib mathtext og tegnes med IBM Plex,
så PDF og skærm er enige:

  a / b          (mellemrum om skråstregen)   → \\dfrac{a}{b}
  (a / b)²                                    → (\\dfrac{a}{b})^{2}
  √(x)                                        → \\sqrt{x}
  x_y,z  x^(n)  x²                            → sænket/hævet skrift
  kN/m, b·h²/6   (uden mellemrum)             → står urørt, som på skærmen

Kun formler med en brøk eller en rod tegnes; resten forbliver tekst, som kan
søges i og kopieres. Lykkes oversættelsen eller tegningen ikke, returneres
None, og kalderen falder tilbage til teksten. En formel må aldrig forsvinde.
"""
import hashlib
import io
import os
import re
import tempfile
from pathlib import Path

_FONT_DIR = Path(__file__).parent / "fonts"
_klar = None


def _opsaet():
    """Registrér IBM Plex hos matplotlib én gang."""
    global _klar
    if _klar is not None:
        return _klar
    try:
        import matplotlib
        matplotlib.use("Agg")
        from matplotlib import font_manager, rcParams
        for f in ("IBMPlexSans-Regular.ttf", "IBMPlexSans-Italic.ttf", "IBMPlexSans-Bold.ttf"):
            p = _FONT_DIR / f
            if p.exists():
                font_manager.fontManager.addfont(str(p))
        rcParams["mathtext.fontset"] = "custom"
        # Rapporten er sat i opret skrift; symbolerne også.
        rcParams["mathtext.rm"] = "IBM Plex Sans"
        rcParams["mathtext.it"] = "IBM Plex Sans"
        rcParams["mathtext.bf"] = "IBM Plex Sans:bold"
        rcParams["mathtext.sf"] = "IBM Plex Sans"
        rcParams["mathtext.fallback"] = "stixsans"
        _klar = True
    except Exception:
        _klar = False
    return _klar


# ── Oversættelse ─────────────────────────────────────────────────────────────

_SUPER = dict(zip("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789"))
_SUB = dict(zip("₀₁₂₃₄₅₆₇₈₉", "0123456789"))
_OPS = {"·": r"\cdot ", "×": r"\times ", "≤": r"\leq ", "≥": r"\geq ",
        "−": "-", "∞": r"\infty ", "≈": r"\approx ", "Σ": r"\Sigma ", "π": r"\pi "}
# Tegn der afslutter en sænket/hævet skrift — samme mængde som på skærmen.
_STOP = set(" _^<>=+-−*/×÷·()[]{}")


def _atom(txt: str) -> str:
    """Et stykke tekst uden brøker → mathtext (sænket, hævet, græsk, operatorer)."""
    out = []
    i = 0
    n = len(txt)

    def script(j):
        # Læs frem til et stoptegn; et afsluttende komma/punktum hører ikke med.
        k = j
        if k < n and txt[k] == "(":
            d, k = 1, k + 1
            while k < n and d:
                d += {"(": 1, ")": -1}.get(txt[k], 0)
                k += 1
            return txt[j + 1:k - 1], k
        while k < n and txt[k] not in _STOP:
            k += 1
        body = txt[j:k]
        trail = len(body) - len(body.rstrip(",.;:"))
        if trail:
            body, k = body[:-trail], k - trail
        return body, k

    def sub(body):
        # M₀_Ed er ét indeks (0,Ed), ikke to — mathtext afviser dobbelt sænket.
        if out and out[-1].startswith("_{"):
            out[-1] = out[-1][:-1] + "{,}" + body + "}"
        else:
            out.append("_{" + body + "}")

    while i < n:
        c = txt[i]
        if c in "_^" and i + 1 < n:
            body, k = script(i + 1)
            if body:
                if c == "_":
                    sub(_esc(body))
                else:
                    out.append("^{" + _esc(body) + "}")
                i = k
                continue
        if c in _SUPER:
            j = i
            while j < n and txt[j] in _SUPER:
                j += 1
            out.append("^{" + "".join(_SUPER[x] for x in txt[i:j]) + "}")
            i = j
            continue
        if c in _SUB:
            j = i
            while j < n and txt[j] in _SUB:
                j += 1
            sub("".join(_SUB[x] for x in txt[i:j]))
            i = j
            continue
        if c == " ":
            # Mathtext sætter selv luft om operatorer; et mellemrum er kun
            # nødvendigt mellem to ord ("cot θ", "(6.9)" efter en formel).
            j = i
            while j < n and txt[j] == " ":
                j += 1
            før = txt[i - 1] if i else ""
            efter = txt[j] if j < n else ""
            if (før.isalnum() or før in ")\x02") and (efter.isalnum() or efter in "(\x02"):
                out.append(r"\ " if j - i == 1 else r"\quad ")
            i = j
            continue
        out.append(_esc(c))
        i += 1
    return "".join(out)


def _esc(s: str) -> str:
    r = []
    for c in s:
        if c in _OPS:
            r.append(_OPS[c])
        elif c in "$%#&{}\\~":
            r.append("\\" + c if c in "$%#&{}" else "")
        elif c == " ":
            r.append(r"\ ")
        elif c == ",":
            r.append("{,}")     # uden mathtexts ekstra mellemrum efter komma
        elif ord(c) >= 0x0300 and ord(c) < 0x0370:
            continue            # kombinerende tegn (overstreg i λ̄) tåler mathtext ikke
        else:
            r.append(c)
    return "".join(r)


def _rod(s: str, vault: list) -> str:
    """√(…) → \\sqrt{…}, med balancerede parenteser."""
    while True:
        i = s.find("√(")
        if i < 0:
            return s
        d, k = 1, i + 2
        while k < len(s) and d:
            d += {"(": 1, ")": -1}.get(s[k], 0)
            k += 1
        if d:
            raise ValueError("ubalanceret √(")
        inner = s[i + 2:k - 1]
        vault.append(r"\sqrt{" + _broek(inner, vault) + "}")
        s = s[:i] + f"\x02{len(vault) - 1}\x02" + s[k:]


def _unstash(s: str, vault: list) -> str:
    while "\x02" in s:
        s = re.sub(r"\x02(\d+)\x02", lambda m: vault[int(m.group(1))], s)
    return s


def _tok(t: str, vault: list) -> str:
    # En hel tæller eller nævner i parentes: brøkstregen grupperer allerede.
    if t.startswith("(") and t.endswith(")"):
        d = 0
        for i, c in enumerate(t):
            d += {"(": 1, ")": -1}.get(c, 0)
            if d == 0 and i < len(t) - 1:
                break
        else:
            t = t[1:-1]
    # Placeholdere står urørt; resten oversættes.
    parts = re.split(r"(\x02\d+\x02)", t)
    return "".join(p if p.startswith("\x02") else _atom(p) for p in parts)


def operander(s: str, i: int, j: int):
    """
    Operanderne om en brøkstreg: s[i:j] er " / ". En operand går til nærmeste
    mellemrum eller uparrede parentes — men en hel parentes springes over,
    også hvis der er mellemrum i den: "(1 − √(1 − 2μ))·b·d / f_yd" har hele
    "(1 − …)·b·d" som tæller. Returnerer (start, slut) for hele brøken.
    """
    def match_back(k):          # s[k] == ")" → indeks for den tilhørende "("
        d = 0
        while k >= 0:
            d += {")": 1, "(": -1}.get(s[k], 0)
            if d == 0:
                return k
            k -= 1
        return -1

    def match_fwd(k):           # s[k] == "(" → indeks for den tilhørende ")"
        d = 0
        while k < len(s):
            d += {"(": 1, ")": -1}.get(s[k], 0)
            if d == 0:
                return k
            k += 1
        return len(s)

    a = i - 1
    while a >= 0 and not s[a].isspace() and s[a] != "(":
        if s[a] == ")":
            k = match_back(a)
            if k < 0:
                break
            a = k
        a -= 1
    a += 1

    b = j
    while b < len(s) and not s[b].isspace() and s[b] != ")":
        if s[b] == "(":
            b = match_fwd(b)
        b += 1
    return a, b


def _broek(s: str, vault: list) -> str:
    s = _rod(s, vault)
    while True:
        # Den inderste brøkstreg først, så en brøk i en nævner også bliver tegnet.
        kandidater = [m for m in re.finditer(r"\s+/\s+", s)
                      if m.start() > 0 and m.end() < len(s)]
        if not kandidater:
            break
        def dybde(m):
            d = 0
            for c in s[:m.start()]:
                d += {"(": 1, ")": -1}.get(c, 0)
            return d
        m = max(kandidater, key=lambda k: (dybde(k), -k.start()))
        a, b = operander(s, m.start(), m.end())
        num, den = s[a:m.start()], s[m.end():b]
        suffix = ""
        mm = re.match(r"^(\(.*\))(\S+)$", den)
        if mm and mm.group(1).count("(") == mm.group(1).count(")"):
            den, suffix = mm.group(1), mm.group(2)
        vault.append(r"\dfrac{" + _tok(num, vault) + "}{" + _tok(den, vault) + "}" + _atom(suffix))
        s = s[:a] + f"\x02{len(vault) - 1}\x02" + s[b:]
    # En brøk alene i en parentes får en parentes, der følger dens højde.
    s = re.sub(r"\((\x02\d+\x02)\)", lambda m: "\x03" + m.group(1) + "\x04", s)
    out = _tok(s, vault)
    return out.replace("\x03", r"\left(").replace("\x04", r"\right)")


def til_mathtext(formel: str):
    """mathtext for en formel med brøk eller rod; ellers None."""
    s = (formel or "").strip()
    if not s or not (re.search(r"\S\s+/\s+\S", s) or "√(" in s):
        return None
    try:
        vault = []
        return _unstash(_broek(s, vault), vault)
    except Exception:
        return None


# ── Tegning ──────────────────────────────────────────────────────────────────

_DPI = 400


def tegn(formel: str, size_pt: float = 8.5, color: str = "#1f2937"):
    """
    Tegn formlen som PNG. Returnerer (sti, bredde_pt, højde_pt) eller None.
    Filen caches i tempmappen efter indhold.
    """
    mt = til_mathtext(formel)
    if mt is None or not _opsaet():
        return None
    try:
        from matplotlib import mathtext
        from matplotlib.font_manager import FontProperties
        key = hashlib.md5(f"{mt}|{size_pt}|{color}".encode()).hexdigest()[:16]
        out = Path(tempfile.gettempdir()) / f"formel_{key}.png"
        if not out.exists():
            buf = io.BytesIO()
            mathtext.math_to_image(f"${mt}$", buf, prop=FontProperties(family="IBM Plex Sans",
                                   size=size_pt), dpi=_DPI, format="png", color=color)
            tmp = out.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_bytes(buf.getvalue())
            os.replace(tmp, out)
        from PIL import Image as PILImage
        with PILImage.open(out) as im:
            w, h = im.size
        return str(out), w / _DPI * 72, h / _DPI * 72
    except Exception:
        return None
