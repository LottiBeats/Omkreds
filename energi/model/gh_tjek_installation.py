# -*- coding: utf-8 -*-
"""
gh_tjek_installation.py - tjek af Ladybug Tools-installationen

Sæt koden i en GhPython-komponent (IronPython 2). Ingen inputs.
Output: rapport -> forbind til et Panel.

Viser, hvilke OpenStudio-, EnergyPlus- og Radiance-installationer Honeybee
bruger, om Radiances hjælpefiler (rayinit.cal) kan findes, og om der ligger
flere Radiance-installationer, der kan forvirre hinanden.
"""
from __future__ import unicode_literals

import os
import subprocess

ud = []


def linje(ok, tekst):
    ud.append(("OK    " if ok else "FEJL  ") + tekst)


# --- Ladybug Tools ---------------------------------------------------------
try:
    import ladybug, honeybee, honeybee_energy, honeybee_radiance  # noqa: F401
    linje(True, "Ladybug/Honeybee-biblioteker kan importeres")
except Exception as e:
    linje(False, "Biblioteker kan ikke importeres: %s" % e)

# --- OpenStudio / EnergyPlus -----------------------------------------------
try:
    from honeybee_energy.config import folders as ef
    linje(bool(ef.openstudio_path), "OpenStudio: %s" % ef.openstudio_path)
    linje(bool(ef.energyplus_path), "EnergyPlus: %s" % ef.energyplus_path)
except Exception as e:
    linje(False, "Kunne ikke læse energi-opsætning: %s" % e)

# --- Radiance som Honeybee ser den -----------------------------------------
radlib = None
try:
    from honeybee_radiance.config import folders as rf
    linje(bool(rf.radbin_path), "Radiance bin: %s" % rf.radbin_path)
    radlib = rf.radlib_path
    linje(bool(radlib), "Radiance lib: %s" % radlib)
    try:
        linje(True, "Radiance-version: %s" % rf.radiance_version_str)
    except Exception as e:
        linje(False, "Radiance-version kunne ikke læses: %s" % e)
except Exception as e:
    linje(False, "Kunne ikke læse Radiance-opsætning: %s" % e)

# --- rayinit.cal (den fil fejlen handler om) --------------------------------
raypath = os.environ.get("RAYPATH", "")
ud.append("")
ud.append("RAYPATH = %s" % (raypath or "(ikke sat)"))
mapper = [m for m in raypath.split(os.pathsep) if m and m != "."]
if radlib:
    mapper.append(radlib)
fundet = [m for m in mapper if os.path.isfile(os.path.join(m, "rayinit.cal"))]
linje(bool(fundet), "rayinit.cal fundet i: %s" % (", ".join(fundet) or "ingen af mapperne"))

# --- Alle Radiance-installationer på maskinen -------------------------------
ud.append("")
ud.append("Radiance-installationer på maskinen:")
kandidater = [r"C:\Radiance",
              os.path.join(os.path.expanduser("~"), "ladybug_tools", "radiance")]
for k in kandidater:
    if not os.path.isdir(k):
        ud.append("  -     %s (findes ikke)" % k)
        continue
    rtrace = os.path.isfile(os.path.join(k, "bin", "rtrace.exe"))
    rayinit = os.path.isfile(os.path.join(k, "lib", "rayinit.cal"))
    ud.append("  %s %s  (rtrace.exe: %s, lib\\rayinit.cal: %s)" % (
        "OK  " if rtrace and rayinit else "FEJL", k,
        "ja" if rtrace else "NEJ", "ja" if rayinit else "NEJ"))

# --- Prøvekørsel af Radiance -------------------------------------------------
try:
    exe = os.path.join(rf.radbin_path, "rtrace.exe")
    env = dict(os.environ)
    if radlib:
        env[str("RAYPATH")] = str(".;" + radlib)
    p = subprocess.Popen([exe, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    out, err = p.communicate()
    linje(p.returncode == 0, "rtrace -version: %s" % (out or err).strip())
except Exception as e:
    linje(False, "rtrace kunne ikke køres: %s" % e)

rapport = "\n".join(ud)
