#!/usr/bin/env python3
"""
Reverse CP1252 Mojibake in main.py — byte-aware greedy approach.

The file was double-encoded:
  original UTF-8 bytes -> interpreted as CP1252 -> re-encoded as UTF-8

To reverse, for each non-ASCII Unicode character in the decoded file:
  1. CP1252-encode it to get back the original byte value.
  2. Inspect that byte as a UTF-8 lead byte:
       - 0x00–0x7F: complete ASCII char (shouldn't appear here, but pass through)
       - 0xC0–0xDF: 2-byte UTF-8 lead → need 1 more continuation byte
       - 0xE0–0xEF: 3-byte UTF-8 lead → need 2 more continuation bytes
       - 0xF0–0xF7: 4-byte UTF-8 lead → need 3 more continuation bytes
       - 0x80–0xBF: UTF-8 continuation byte — NOT a lead byte, so this
                    character was NOT Mojibake'd; keep it as genuine UTF-8.
  3. Collect the expected continuation bytes from subsequent CP1252-encodable chars.
  4. Verify the assembled bytes form a valid UTF-8 sequence; if so, emit them.
  5. If anything goes wrong, fall back to emitting the character as genuine UTF-8.

Characters not encodable as CP1252 (e.g. U+2500 ─) are always kept as genuine UTF-8.
"""
import sys

FILE = "backend/main.py"

def utf8_lead_continuation_count(byte):
    """Return how many continuation bytes follow this lead byte, or -1 if invalid/continuation."""
    if byte < 0x80:   return 0   # ASCII (complete)
    if byte < 0xC0:   return -1  # Continuation byte — not a lead
    if byte < 0xE0:   return 1   # 2-byte sequence
    if byte < 0xF0:   return 2   # 3-byte sequence
    if byte < 0xF8:   return 3   # 4-byte sequence
    return -1  # Invalid

def is_continuation(byte):
    return 0x80 <= byte <= 0xBF

def try_cp1252_byte(char):
    """Encode char as CP1252, returning the single byte or None if impossible."""
    try:
        b = char.encode("cp1252")
        assert len(b) == 1
        return b[0]
    except (UnicodeEncodeError, AssertionError):
        return None

def reverse_mojibake(s):
    """
    Reverse Mojibake in the decoded string s.
    Returns a bytearray of the original UTF-8 bytes.
    """
    result = bytearray()
    i = 0
    total = len(s)
    kept_as_genuine = {}

    while i < total:
        c = s[i]
        cp = ord(c)

        # --- ASCII: pass through unchanged ---
        if cp < 0x80:
            result.append(cp)
            i += 1
            continue

        # --- Try to get CP1252 byte ---
        lead = try_cp1252_byte(c)
        if lead is None:
            # Not CP1252-encodable (e.g. U+2500 ─): keep as genuine UTF-8
            utf8 = c.encode("utf-8")
            result.extend(utf8)
            kept_as_genuine[cp] = kept_as_genuine.get(cp, 0) + 1
            i += 1
            continue

        # --- Inspect the lead byte ---
        n_cont = utf8_lead_continuation_count(lead)

        if n_cont == -1:
            # lead is 0x80–0xBF: it's a UTF-8 continuation byte, which means
            # this character is GENUINE (not the start of a Mojibake sequence).
            result.extend(c.encode("utf-8"))
            kept_as_genuine[cp] = kept_as_genuine.get(cp, 0) + 1
            i += 1
            continue

        if n_cont == 0:
            # lead < 0x80: pure ASCII (shouldn't happen here since cp >= 0x80)
            result.append(lead)
            i += 1
            continue

        # --- Collect n_cont continuation bytes from subsequent CP1252 chars ---
        seq = bytearray([lead])
        j = i + 1
        ok = True
        for _ in range(n_cont):
            if j >= total:
                ok = False
                break
            cont_char = s[j]
            if ord(cont_char) < 0x80:
                ok = False  # ASCII can't be a Mojibake'd continuation
                break
            cont_byte = try_cp1252_byte(cont_char)
            if cont_byte is None or not is_continuation(cont_byte):
                ok = False
                break
            seq.append(cont_byte)
            j += 1

        if ok:
            # Verify the assembled sequence is valid UTF-8
            try:
                seq.decode("utf-8")
                result.extend(seq)
                i = j
                continue
            except UnicodeDecodeError:
                pass

        # Fallback: keep current char as genuine UTF-8
        result.extend(c.encode("utf-8"))
        kept_as_genuine[cp] = kept_as_genuine.get(cp, 0) + 1
        i += 1

    return result, kept_as_genuine


# ── Main ─────────────────────────────────────────────────────────────────────

with open(FILE, "rb") as f:
    raw = f.read()

# Strip UTF-8 BOM if present
bom_stripped = False
if raw.startswith(b"\xef\xbb\xbf"):
    raw = raw[3:]
    bom_stripped = True

# Decode as UTF-8 — gives the Mojibake'd (wrong) Unicode string
mojibaked = raw.decode("utf-8")

# Reverse the Mojibake
recovered_bytes, genuine_chars = reverse_mojibake(mojibaked)

# Verify the result is valid UTF-8
try:
    original = recovered_bytes.decode("utf-8")
except UnicodeDecodeError as e:
    print(f"ERROR: recovered bytes are not valid UTF-8: {e}")
    # Show context
    pos = e.start
    print(f"  Bytes around position {pos}: {recovered_bytes[max(0,pos-4):pos+4].hex()}")
    sys.exit(1)

# Write back as UTF-8 (no BOM)
with open(FILE, "wb") as f:
    f.write(recovered_bytes)

print("Done!")
print(f"  Input:  {len(raw):>8,} bytes  ({len(mojibaked):>7,} chars)")
print(f"  Output: {len(recovered_bytes):>8,} bytes  ({len(original):>7,} chars)")
if bom_stripped:
    print("  (Stripped UTF-8 BOM)")
if genuine_chars:
    print("  Kept as genuine UTF-8:")
    for cp, cnt in sorted(genuine_chars.items()):
        try:
            ch = chr(cp)
        except Exception:
            ch = "?"
        print(f"    U+{cp:04X} {ch!r} x{cnt}")
