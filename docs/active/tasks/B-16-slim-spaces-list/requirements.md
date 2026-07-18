### 📋 Backlog Item
Stop `GET /api/spaces` from shipping photo bytes inline, and stop forcing the
client to hold the whole account's zone/item graph — and the whole list of
spaces — in memory before it can show anything. Photo upload, photo display,
and photo serving are **out of scope**, split out to backlog **B-1** (see the
Third scope decision in `task.md`).

### 🎯 Product Context Summary
The requirements stage found that nothing in the SPA can currently create or
display an item photo — `ItemDetailModal.vue`'s Pro-gated "Add a photo" button
emits an event nothing listens for, and no view binds a photo to an `<img>`
anywhere. The user considered building that full feature in this slice, then
reversed that decision: shipping a photo-*serving* endpoint for a feature with
no upload path and no users would needlessly ship B-13's inherited polyglot
delivery risk for nothing. B-16 therefore stays narrowly the **payload and
loading fix** the audit actually asked for (SC-3): the account-wide list and
graph read path never carries photo bytes, the dashboard and a space's
contents load progressively rather than all at once, and the space list itself
is paginated. Photo upload/display/serving move to B-1 as their own slice.
Critically, this narrower scope surfaced a real, verified hazard: `ItemDto` is
the *same* shape for both reading and writing an item, and an item update is a
full field replace, not a patch — so simply dropping `Photo` from the read
side can silently wipe every stored photo on the next edit a client makes.
That hazard is now this task's highest-priority requirement.

### 🔑 Core Functional Areas
- Photo-light list/graph payload — the account-wide read path never carries photo bytes
- Photo data integrity across the read/write round-trip — a photo a client never received must survive that client's later edit
- Progressive space loading — dashboard renders without every space's full contents; a space's contents load when opened
- Space list pagination — the list of spaces itself is chunked, not returned whole
- Plan-gating continuity — the `photos` gate on create/update is unaffected; no sibling cap regresses
- Measured payload outcome — the SC-3 fix is proven with real before/after numbers

---

### Functional Requirements

**Photo-Light List/Graph Payload**

- **FR-1**: The account-wide spaces list/graph read path must never carry an
  item's actual photo content. Every other field (name, quantity, tags, dates,
  expiry, position) stays exactly as it is today; the photo field simply
  carries no content on read.
  - *Business rationale*: this is the entire audit finding (SC-3) — inline
    photo bytes are what makes the response grow unbounded for an account that
    has photo items (today only reachable via direct API use, since no UI path
    creates one — see `task.md`'s findings).
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: only Pro items can ever carry a photo; Free items never do.
    No new gate introduced.
  - *Constraints/Rules*: **no reference/URL/"has-photo" signal is introduced
    in its place.** Nothing in the app reads a photo's presence or location
    today (confirmed: no component reads an item's photo for any purpose, not
    even a presence check) — inventing a reference for a consumer that doesn't
    exist would be speculative, not a requirement. If a future slice (B-1)
    needs one, it defines it then.
  - *Acceptance criteria*: a real response body for an account that owns photo
    items (seeded via the API, since the UI cannot create one) contains zero
    base64/data-URL image content, verified against an actual response.

- **FR-2**: The dashboard must keep rendering exactly what it renders today —
  each space's name/type, its zone-layout preview, and its item/zone counts —
  without requiring every item's full detail to have arrived first.
  - *Business rationale*: confirmed by reading the actual dashboard card: it
    already only ever displays a space's name/type, up to six zone-color
    bands, and an item/zone count — it has never needed individual items to
    render, so slimming the list loses nothing the dashboard shows today.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: n/a — no cap or paywall involved.
  - *Constraints/Rules*: the existing "preview up to 6 zones" behaviour is
    unchanged; counts must stay accurate for plan-limit displays exactly as
    they are today.
  - *Acceptance criteria*: for the same account, the dashboard's card content
    (zone preview bands, item/zone counts) is equivalent before and after this
    change.

**Photo Data Integrity Across the Read/Write Round-Trip**

- **FR-3**: A stored photo must survive an item edit made by a client that
  never received that photo (because it no longer arrives on read, per FR-1).
  - *Business rationale*: 🪤 verified hazard, not a hypothetical — the item's
    read shape and write shape are the same today, and an update fully
    replaces the item's stored fields rather than patching only what changed.
    Once `GET` stops returning a photo, the client holds none in memory; the
    very next edit a user makes to that item (rename it, change its quantity,
    move it to another zone) would otherwise write that "no photo" state back
    and permanently delete a photo the user never touched or knew was at risk.
    This is the single highest-risk regression in this task — a data-loss bug
    hiding inside what looks like a pure performance change.
  - *Priority*: Phase 1 (Core) — blocking; this is not a follow-up.
  - *Plan & gate*: n/a — a correctness requirement, not a paywall.
  - *Constraints/Rules*: the mechanism (diverging what a read returns from
    what a write accepts, giving the write "absent means unchanged" semantics,
    or another approach) is explicitly the tech-lead's call — this only fixes
    the observable guarantee, not how.
  - *Acceptance criteria*: proven by driving, not asserted — read an item that
    has a stored photo (via a client that never receives the photo, per FR-1),
    edit an unrelated field on that item (e.g. its name), and confirm the
    photo is still present afterward.

**Progressive Space Loading**

- **FR-4**: Opening the app must not require every space's full zone/item
  contents to have arrived before the user sees anything.
  - *Business rationale*: the client should never be forced to hold the whole
    account in memory just to show the dashboard.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: n/a directly, but the benefit scales with account size —
    Free's small caps (2 spaces, 50 items/space) mean this barely bites Free
    users; it matters for a heavy, unlimited Pro account.
  - *Constraints/Rules*: the dashboard still needs the lightweight per-space
    summary from FR-2 up front; only each space's *full* contents (every zone
    position, every item) defer until that specific space is opened.
  - *Acceptance criteria*: opening the dashboard for a heavy account renders
    every space's card without waiting on any space's full item list; opening
    any one space still shows that space's complete, correct layout.

- **FR-5**: While a specific space's full contents are still arriving, the
  user must see an explicit "still loading" state — never a blank/frozen
  screen, and never a layout that looks empty when it isn't.
  - *Business rationale*: what the user observes during the now-real gap
    between "space card clicked" and "layout populated."
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: n/a.
  - *Constraints/Rules*: the "still loading" state must be visually distinct
    from the genuine "no zones yet" empty state — the two must never be
    confusable, or a user could believe a populated space has nothing in it
    (task.md flags this as the same class of bug as B-18).
  - *Acceptance criteria*: opening a space with many items shows a loading
    indicator before its layout appears; the genuine empty-space message never
    flashes while that space's data is still in flight.

**Space List Pagination**

- **FR-6**: The list of spaces itself must not be returned as one unbounded
  response either — the same "don't hand back the whole account at once"
  principle applies to the space list as it does to each space's contents.
  - *Business rationale*: "paginate" is in the backlog title, not only "slim";
    the user confirmed this stays in scope even after narrowing the photo
    side back out.
  - *Priority*: Phase 1 (Core) — not deferred.
  - *Plan & gate*: practically a Pro-only scenario (Free can never exceed 2
    spaces), but the mechanism itself isn't plan-conditional.
  - *Constraints/Rules*: must not change what the user can do — every space
    they own must still be reachable, just not necessarily all in one
    response; the dashboard must render correctly across whatever boundary
    this introduces.
  - *Acceptance criteria*: an account with a large number of spaces sees its
    full set of spaces (loading further as needed), no single response is
    required to carry all of them at once, and the dashboard renders correctly
    across that boundary.

**Plan-Gating Continuity**

- **FR-7**: The `photos` plan gate on item create/update fires exactly as it
  does today: only a Pro account can set or change an item's photo; a Free
  account attempting to is rejected with `reason: photos`.
  - *Business rationale*: explicitly required — this task reshapes the read
    path and loading behaviour; it must not touch who is allowed to have a
    photo. (No *viewing* rule is expressible here — there is no display path
    in this slice to have a rule about; that lands with B-1.)
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free — `photos` reason on any create/update that sets a
    photo. Pro — unaffected.
  - *Constraints/Rules*: n/a — regression guard on an existing, already-shipped
    gate (B-13), not new behaviour.
  - *Acceptance criteria*: existing Free-rejected/Pro-allowed behaviour for
    setting an item's photo is unchanged, regression-checked against the B-13
    scenarios.

- **FR-8**: No sibling plan-cap or recent hardening regresses: spaces, zones,
  items and sync gating; B-15's granular per-zone/per-item endpoints; B-12's
  per-space concurrent-add lock.
  - *Business rationale*: this reshapes a read path and a loading model — it
    must not be licence to touch adjacent, already-hardened behaviour.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: unchanged in every case.
  - *Constraints/Rules*: n/a — regression guard, not new behaviour.
  - *Acceptance criteria*: every previously-verified scenario (space/zone/item
    cap 403s with correct `reason`, concurrent-add lock, granular zone/item
    endpoints) still passes unmodified after this change.

**Measured Payload Outcome**

- **FR-9**: Produce an actual **measured** payload size for the agreed heavy
  account scenario, before and after this change — not an assumption that it
  must be smaller.
  - *Business rationale*: the task's own acceptance criterion demands this be
    measured, not asserted.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: n/a.
  - *Constraints/Rules*: scenario fixed at the gate — **3 spaces × 20 photo
    items × ~1.5 MB each** (~90 MB pathological worst case), seeded via the
    API (the UI cannot create a photo), measured as raw `GET /api/spaces`
    response bytes before vs. after.
  - *Acceptance criteria*: a written before/after byte measurement exists
    against a real response body for this exact scenario; the after-size does
    not grow proportionally with photo count or size the way the before-size
    did.

---

### ⚠️ Key Business Considerations
- **The read/write round-trip hazard (FR-3) is the real risk in this task**,
  not the payload size itself — a performance fix that silently deletes user
  data on the very next edit is a far worse outcome than the slow-but-safe
  status quo. This must be proven by driving before this ships, not inferred
  from code review.
- **Don't reopen the photo-serving question to "solve" B-13's residual risk.**
  That risk only exists once photos are served from an endpoint; B-16
  deliberately builds no such endpoint, so it doesn't need to (and must not)
  address it — that's B-1's job when it actually builds serving.
- **Don't invent consumers that don't exist.** No reference/flag replaces the
  dropped photo bytes in the list (FR-1) because nothing in the app reads an
  item's photo for any purpose today — adding one now would be speculative.
- **Plan fairness must hold with zero behaviour change.** The `photos` gate on
  create/update (FR-7) and every sibling cap (FR-8) must come out of this
  reshape identical to how they went in.

### 🚫 Out of Scope (Phase 1)
- **Photo upload/capture** — wiring the dead `addPhoto` emit to something real.
  Belongs to backlog **B-1**.
- **Photo display** — there is no `<img>` bound to a photo anywhere today;
  building the first one is B-1's job, not this task's.
- **The photo-serving endpoint**, and with it the B-13 polyglot/safe-delivery
  concern and owner-only photo fetching — all hand off to B-1 verbatim (see
  `task.md`'s hand-off note); B-16 must not build any path that echoes stored
  photo bytes back with a client-influenced content type.
- **The photo-storage location decision** — with no serving endpoint in this
  slice, storage very likely stays as-is; if the tech-lead's plan proposes a
  migration or new infra anyway, that needs explicit justification at the
  tech-planning gate, not a default assumption.
- Downgrade-time photo *viewing* behaviour — unobservable in this slice (no
  display path exists); this is B-1's concern once display exists.
- B-17 (surfacing read-only over-cap spaces/zones/items in the UI after a
  downgrade) — a separate backlog item, untouched by this task.
- B-22 (client-supplied zone/item PKs → cross-tenant DoS) — explicitly not
  this task's job.
- Any Stripe/billing change (B-10) — unrelated track, kept separate.

### ❓ Open Questions for Product Owner
1. **FR-3's exact mechanism is left to the tech-lead** (diverging read/write
   DTO shapes vs. giving updates patch semantics vs. another approach) — no
   product decision needed here, but flagging that whichever is chosen should
   be checked against `UpdateItemCommandHandler.cs`'s existing `TRAP (T-13e)`
   comment on this same code path, since it's already documented as delicate.
2. **FR-6's pagination boundary (page size / chunk trigger) has no agreed
   number yet** — not a product-facing question (the user only needs "every
   space stays reachable"), but worth the tech-lead proposing a concrete
   default at the planning gate rather than picking one silently.
