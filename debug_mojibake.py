#!/usr/bin/env python3
"""Debug script to understand the Mojibake failure."""
import sys

FILE = "backend/main.py"

with open(FILE, "rb") as f:
    raw = f.read()

if raw.startswith(b"\xef\xbb\xbf"):
    raw = raw[3:]

mojibaked = raw.decode("utf-8")

# Recover bytes and track position
recovered = bytearray()
char_to_byte = []   # maps char_pos -> byte_pos
em_dash_positions = []

for i, c in enumerate(mojibaked):
    cp = ord(c)
    if cp == 0x2014:   # em dash —
        # Context in source string
        ctx = mojibaked[max(0,i-60):i+60]
        ctx_safe = "".join(ch if ord(ch) < 128 else f"[U+{ord(ch):04X}]" for ch in ctx)
        em_dash_positions.append((i, len(recovered), ctx_safe))

    if cp < 0x80:
        recovered.append(cp)
    else:
        try:
            b = c.encode("cp1252")
            assert len(b) == 1
            recovered.append(b[0])
        except (UnicodeEncodeError, AssertionError):
            recovered.extend(c.encode("utf-8"))

# Show em dash occurrences
print(f"Em dash (U+2014) occurrences: {len(em_dash_positions)}")
for char_pos, byte_pos, ctx in em_dash_positions:
    print(f"  char_pos={char_pos}, byte_pos={byte_pos}")
    print(f"  ctx: ...{ctx}...")
    print()

# Show bytes around the error position 15796
print(f"\nBytes 15786-15806 in recovered stream:")
for i in range(15786, min(15806, len(recovered))):
    print(f"  [{i}] 0x{recovered[i]:02X}", end="")
    if recovered[i] < 0x80:
        print(f"  '{chr(recovered[i])}'")
    else:
        print()
