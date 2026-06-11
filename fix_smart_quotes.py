#!/usr/bin/env python3
"""Replace Python-3.14-rejected smart quotes with their ASCII equivalents."""
raw = open("backend/main.py", "rb").read()
s = raw.decode("utf-8")

replacements = [
    ("“", '"'),   # left double quotation mark -> "
    ("”", '"'),   # right double quotation mark -> "
    ("‘", "'"),   # left single quotation mark -> '
    ("’", "'"),   # right single quotation mark -> '
]

for old, new in replacements:
    count = s.count(old)
    if count:
        s = s.replace(old, new)
        print(f"Replaced U+{ord(old):04X} x{count}")

with open("backend/main.py", "wb") as f:
    f.write(s.encode("utf-8"))
print("Done.")
