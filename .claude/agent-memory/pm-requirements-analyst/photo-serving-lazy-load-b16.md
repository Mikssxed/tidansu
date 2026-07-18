---
name: photo-serving-lazy-load-b16
description: B-16 scoping — went narrow → full-photo-feature → narrow again across three gates; final scope is payload/paging only (photo upload/display/serving split to B-1); the load-bearing finding is a verified read/write DTO hazard that can silently wipe photos
metadata:
  type: project
---

B-16 (stop `GET /api/spaces` shipping photo bytes inline + stop forcing the
client to hold the whole account before boot) went through **three scope
gates in one session** (2026-07-16) — a useful case study in how far a
requirements finding can legitimately swing scope before it's reeled back in:

1. **Kickoff**: both payload-slimming and progressive-loading tracks, storage
   location left to tech-lead.
2. **Gate 2** (after this agent found the photo feature doesn't exist in the
   UI at all — see below): user offered the narrower option, **chose the
   fullest scope instead** — build the whole photo feature (capture, display,
   serving) inside B-16, absorbing backlog B-1.
3. **Gate 3 (final)**: user **reversed gate 2**. Rationale: shipping a
   photo-*serving* endpoint for a feature with no upload path and no users
   would ship B-13's inherited polyglot delivery risk for nothing. Photo
   upload/display/serving (and the B-13 polyglot/safe-delivery concern that
   only exists once something serves photos) moved to **B-1**, which stays its
   own slice. B-16 ended up scoped to exactly: payload/graph no longer carries
   photo bytes, progressive per-space loading, space-list pagination
   (confirmed IN, never reversed), plan-gate regression guard, measured
   before/after benchmark.

**Confirmed product/code facts from this scoping pass, still useful precedent:**
- **The SPA has no photo *display* or *capture* path at all.** Grepped every
  component for `.photo`/`<img>` bound to an item's photo and for any
  presence-check read of it — the only UI is `ItemDetailModal.vue`'s Pro-gated
  "Add a photo" button, whose click emits `addPhoto` to nothing that consumes
  it (`SpaceView.vue` wires only `@photo-locked`). Nothing anywhere reads an
  item's photo for any purpose, not even a truthy/presence check.
- **Consequence for FR design**: because nothing consumes a photo signal
  today, the final (narrow) scope's list-slimming FR introduces **no**
  reference/URL/"has-photo" flag in place of the dropped bytes — inventing one
  for a consumer that doesn't exist yet would be speculative. Don't reach for
  "return a lightweight reference instead" as a default pattern; check whether
  anything would actually resolve that reference *in this slice* first.
- **The dashboard card (`SpaceCard.vue`) never needed item content** — only
  `space.name`/`type`, the first 6 zones' `id`/`color` for a preview band, and
  `items.length`/`zones.length` for a count label. Grounds "the account list
  can slim to a per-space summary without losing anything the dashboard shows"
  — grep the actual card component, don't guess.
- **`SpaceView.vue` reads a space straight from the already-fully-hydrated
  Pinia store** (`store.getById`), so "per-space lazy-load" is a real
  behaviour change to that read path (fetch on open), not just a payload trim.

**🪤 The load-bearing finding — a verified data-loss hazard, not a
hypothetical**, surfaced by the orchestrator at gate 3 and now B-16's
highest-priority FR: `ItemDto` (`Tidansu.Application/Spaces/Dtos/ItemDto.cs`)
is used for **both** read (`FromEntity`) and write (`ToEntity`) — one shape,
both directions — and `UpdateItemCommandHandler.cs` does a **full field
replace** (`item.Photo = dto.Photo`), not a patch. So simply dropping `Photo`
from the read side (the obvious "just don't serialize it" fix for the payload
problem) means every client that reads an item without its photo, then edits
*any* unrelated field on that item, silently **wipes the stored photo** on the
next save. This is the single biggest risk in a task that otherwise looks like
pure performance work, and it generalizes: **any time a requirement says "stop
returning field X on read," check whether the same DTO/shape round-trips back
on write, and whether that write path is a full replace or a true patch** —
if it's a full replace, dropping X from read is a silent data-loss bug, and
that must become its own hard FR (proven by driving: read without X, edit
something else, confirm X survived) rather than an assumed side detail of the
payload fix.

**Why:** recorded 2026-07-16. Two lessons worth keeping: (1) a requirements
finding (no display surface exists) can legitimately swing a task's scope
significantly in either direction within one session — don't be surprised by
a reversal, just make sure `requirements.md` is rewritten to match the
*current* authoritative scope, not left mid-transition; (2) the DTO
read/write-shape-reuse hazard is a general pattern in this codebase worth
checking on every "slim down what a GET returns" task.

**How to apply:** (1) when a requirements finding (e.g. "this display surface
doesn't exist") could justify either narrowing or widening scope, present
both directions plainly and let the human decide — don't default to
recommending the bigger build just because the finding makes it "logically
complete"; (2) on every "stop returning field X in a read response" task,
explicitly check the write-side handler for the same field before finalizing
FRs — if the same DTO shape or a full-replace write path exists, add a hard
"stored value survives an edit by a client that never received it" FR and
mark it highest priority; (3) don't invent a replacement reference/signal for
dropped content unless something in the current slice actually consumes it —
grep first, propose second.
