---
name: minimal-genuine-image-fixtures-for-sniffing
description: How to hand-build minimal-but-genuine JPEG/PNG/WebP byte fixtures for magic-byte-sniffing unit tests, without an imaging library
metadata:
  type: feedback
---

When a test needs "a real JPEG/PNG/WebP" purely to exercise magic-byte sniffing
(e.g. `PhotoPolicy` in B-13), don't reach for an imaging library (no PIL/ImageSharp
available/wanted) and don't hand-wave fake bytes — build genuinely-structured minimal
files:

- **PNG**: use the well-known 1×1 transparent PNG base64
  (`iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`)
  — decode it and assert the first 8 bytes equal the real PNG signature
  (`89 50 4E 47 0D 0A 1A 0A`) as a pinning fact, don't just trust the literal.
- **JPEG**: `FF D8 FF E0 00 10 4A 46 49 46 00 01 01 00 00 01 00 01 00 00 FF D9` is a
  structurally valid (if pixel-less) JPEG: SOI + a correctly-length-prefixed JFIF
  APP0 segment + EOI. The APP0 length field (`00 10` = 16) must equal 2 (length
  bytes) + 14 (payload: `"JFIF\0"` + version(2) + units(1) + density(2+2) +
  thumbnail w/h(1+1)) — get this arithmetic right or the segment is bogus.
- **WebP**: the sniff only needs the first 12 bytes (`RIFF` + 4-byte LE size field
  (unchecked) + `WEBP`), so a 12-byte file *is* a complete, genuine fixture:
  `52 49 46 46 <4 bytes> 57 45 42 50`. No VP8 chunk needed for a sniffing test.

**Why:** the task explicitly required "don't hand-wave the magic bytes — verify a
real PNG header is what you think it is." Constructing bytes this way (with a
`[Fact]` pinning the PNG signature) gives genuine confidence the sniffer is tested
against real format markers, not arbitrary bytes that happen to satisfy the switch
statement under test.

**How to apply:** any future Domain/Application test that needs real image bytes for
header-sniffing (not full decode) — reach for these three literals rather than a new
library dependency or approximated bytes. Related: [[verify-stripe-webhook-without-cli]]
(same pattern of hand-building genuine wire fixtures with Python instead of a live
dependency).
