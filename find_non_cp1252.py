#!/usr/bin/env python3
import sys

raw = open("backend/main.py", "rb").read()
if raw.startswith(b"\xef\xbb\xbf"):
    raw = raw[3:]
    print("(Stripped BOM)")

s = raw.decode("utf-8")

# Find all non-CP1252 characters with context
non_cp = []
for i, c in enumerate(s):
    try:
        c.encode("cp1252")
    except UnicodeEncodeError:
        ctx = s[max(0,i-40):i+40]
        non_cp.append((i, ord(c), repr(c), ctx))

print(f"Total non-CP1252 characters: {len(non_cp)}")
print()
for pos, codepoint, char_repr, ctx in non_cp[:30]:
    # Show as ASCII-safe
    ctx_safe = "".join(c if ord(c) < 128 else f"[U+{ord(c):04X}]" for c in ctx)
    sys.stdout.buffer.write(f"  pos={pos} U+{codepoint:04X}\n".encode("ascii"))
    sys.stdout.buffer.write(f"  ctx: ...{ctx_safe}...\n".encode("ascii"))
    sys.stdout.buffer.write(b"\n")
