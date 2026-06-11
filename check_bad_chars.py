#!/usr/bin/env python3
import sys
raw = open("backend/main.py", "rb").read()
s = raw.decode("utf-8")

bad = {
    0x201C: '"',
    0x201D: '"',
    0x2018: "'",
    0x2019: "'",
}
for cp, repl in sorted(bad.items()):
    count = s.count(chr(cp))
    if count:
        msg = f"U+{cp:04X} x{count}: will replace with {repl!r}\n"
        sys.stdout.buffer.write(msg.encode("ascii"))

# Also check for em/en dashes in non-string contexts (just count them)
for cp in (0x2014, 0x2013, 0x2012):
    count = s.count(chr(cp))
    if count:
        msg = f"U+{cp:04X} (dash) x{count}\n"
        sys.stdout.buffer.write(msg.encode("ascii"))
