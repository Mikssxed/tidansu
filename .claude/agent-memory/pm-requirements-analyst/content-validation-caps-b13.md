---
name: content-validation-caps-b13
description: B-13 scoping — when an audit fix requires inventing new numeric/format limits (not just a guard/race fix), it needs the full FR doc, not a LIGHT-path short note; method for grounding proposed caps
metadata:
  type: project
---

B-13 (validate space zone/item graph + photo content-type/size, from B-8 audit
S-2) did **not** fit the LIGHT-path short-note pattern used for B-9/B-11/B-12
(see [[webhook-hardening-b9]], [[dependency-bump-b11]],
[[race-condition-hardening-b12]]). Those items closed a gap where the
*correct* end-state was already fully implied by an existing DB constraint or
an obvious business rule. B-13 required the PM to actually **invent new
product values** (a per-photo byte cap, an image-format allow-list, tag
count/length bounds) with no existing precedent to copy — that's genuine
product judgement, so it got the full multi-phase FR template with a
dedicated "Proposed values" section giving concrete numbers + reasoning, not
just a 3-FR note.

**Method used to ground the proposed values (repeat for similar tasks):**
1. For every field the fix must bound, check whether the database *already*
   enforces a limit (`grep HasMaxLength` in the DbContext) before proposing
   any number — copy that number verbatim; inventing a stricter one risks
   rejecting input that works today. Only propose a genuinely new number
   (e.g. B-13's tag count/length) where no DB precedent exists at all.
2. Before guessing an allow-listed format/behaviour that's supposed to match
   "what the client actually produces," grep the frontend for the real
   implementation rather than assuming. In B-13 this turned up a useful,
   non-obvious fact: the photo-capture/upload flow **doesn't exist yet in the
   SPA** (only the Pro paywall gate on the photo slot is wired — `addPhoto` is
   emitted but nothing consumes it). That absence became a load-bearing part
   of the reasoning (values had to be justified from "what a phone camera
   generally produces," not from an existing client contract), and was called
   out explicitly as something to reconfirm once a real capture flow ships.
3. State proposed values as clearly falsifiable product positions (with the
   reasoning that produced them) in both `requirements.md` and back into
   `task.md`'s acceptance criteria/Notes, so tech-lead and the PO can accept,
   reject, or override them without re-deriving the reasoning.

**Values proposed for B-13** (pending PO confirmation): per-photo cap 5 MB raw
(~6.7 MB base64, checked against decoded size); allow-listed formats JPEG/PNG/
WebP (excludes SVG for script-injection risk, GIF as unneeded, HEIC as
not-browser-renderable); tag bounds 15 tags/item, 24 chars/tag (new rule, no
DB precedent). Existing-content policy: no retroactive re-validation on read
(write-time-only preventive control) — chosen because there's no known active
abuse to remediate and re-validating on read either hides or blocks a user's
own harmless legacy data.

**Why:** recorded 2026-07-15 while scoping B-13, to keep the LIGHT-path memory
set from over-generalizing — not every audit follow-up is a short note; the
deciding factor is whether the fix needs new invented values/judgement calls
versus just enforcing an already-implied guarantee.

**How to apply:** before defaulting a "close an audit finding" task to a
short scoping note, check whether it requires proposing brand-new caps,
formats, or thresholds with no existing DB/business precedent. If so, use the
full FR template and always (a) grep the DB entity config for real limits
before proposing any number, (b) grep the frontend for the real
producer/consumer of the content being bounded before guessing its shape.
