---
id: B-16
slug: slim-spaces-list
title: Paginate/slim the spaces list; stop returning photo data-URLs inline (SC-3)
status: requirements   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []         # B-13, B-14, B-15 have all landed; their conclusions are inherited below
touch-points:
  - src/Tidansu.Application/Spaces/Queries/GetSpaces/GetSpacesQueryHandler.cs
  - src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs   # GetAllByUserAsync
  - src/Tidansu.Application/Spaces/Dtos/                          # ItemDto — read/write shape split (see TRAP)
  - src/Tidansu.Application/Spaces/Commands/UpdateItem/           # full-replace of Photo (see TRAP)
  - src/Tidansu.App/src/App.vue
  - src/Tidansu.App/src/stores/useSpacesStore.ts
  - src/Tidansu.App/src/api/apiClient/                            # Kiota regen (contract changes)
---

# B-16 · Paginate/slim the spaces list; stop returning photo data-URLs inline

## Description
From the B-8 audit (🟠 SC-3). `GET /api/spaces` returns every space, zone and item
for the account, with each item's `Photo` base64 data-URL inline and no paging —
all eagerly loaded on app boot. A heavy Pro account therefore pulls a tens-of-MB
response that grows unbounded as they add photo items, and the client is forced to
hold the entire account in memory before it can show anything.

After this slice a user's app boot should stay fast and light regardless of how many
spaces or items they own: the read path carries the text-only layout graph, photo bytes
never travel with it, and the client no longer needs the whole account at once.

> **⚠️ Read the THIRD scope decision below — it is the final one.** The first two are kept
> only as the audit trail of how the scope moved; they are **superseded** and following them
> will build the wrong thing.

## Scope decision (made by the user at kickoff) — ⚠️ SUPERSEDED, see the third decision
The backlog offered two tracks; the user chose **both**:
- **(a)** Photos out of the list payload — ~~return a reference, fetch the image separately~~
  (the "fetch separately" half is now B-1's; B-16 only stops shipping the bytes).
- **(b)** Paging / per-space lazy-load so the client isn't forced to hold the whole account.

~~**Photo storage location is deliberately left open for the tech-lead**~~ — **moot.** With no
serving endpoint in scope, there is no reason to move photo bytes anywhere. Default to leaving
storage exactly as it is; a migration or new infra now needs explicit justification at the gate.

### Second scope decision (2026-07-16 gate — after the requirements stage exposed the real premise)

The requirements stage established, and the orchestrator independently verified, that
**the photo feature does not exist in the UI**:
- No `<img>` anywhere binds `item.photo` — nothing can display a photo.
- `ItemDetailModal.vue:172` emits `addPhoto`, but `SpaceView.vue:66-70` wires only
  `@photo-locked` and never listens for it — **the emit goes nowhere**, so a Pro user
  cannot create a photo either.
- `Item.Photo` is a pure backend/DTO round-trip inherited from the prototype data-model port.
- Backlog **B-1** ("item photos on Pro") is explicitly *"illustrative, not scheduled"*.

Therefore SC-3's tens-of-MB payload is **real in shape but latent in practice** — only a
direct API caller can currently store a photo. The user was shown this, offered a narrower
slice (slim the list, don't build serving), and **deliberately chose the fullest scope**:

- ~~B-16 builds the whole photo feature~~ — **REVERSED, see the third decision below.**
- ✅ **FR-9 (paginating the space list itself) is IN this slice**, not deferred to Phase 2.

### Third scope decision (2026-07-16 — FINAL; supersedes the photo half of the second)

The user reconsidered and **split the photo feature back out**. Final B-16 scope:

**IN scope:**
- **(a)** Photo bytes never travel in the spaces list/graph read path (the SC-3 fix).
- **(b)** Progressive loading — the dashboard renders without loading every space's full
  contents; a space's contents load when opened.
- **FR-9** — paginating the space list itself. Still IN (that decision was not reversed).

**OUT of scope — belongs to backlog B-1 ("item photos on Pro"), which stays its own slice:**
- Photo **upload/capture** (wiring the dead `addPhoto` emit to something real).
- Photo **display** (there is no `<img>` bound to a photo anywhere today).
- The photo-**serving** endpoint, and with it the whole **B-13 polyglot** delivery risk.

Rationale: the photo feature does not exist in the UI (see the verified findings below), so
building a serving endpoint here would ship the B-13 security surface for a feature with no
upload path and no users. B-16 keeps SC-3's payload fix — which stands on its own — and B-1
owns the byte path when the feature is actually built.

**Consequence for the tech-lead:** with no serving endpoint, the storage question (DB vs blob)
is very likely **premature** and should default to *leave storage as-is*. If the plan proposes
a migration or new infra, that needs to be justified explicitly at the gate, not assumed.

### 🪤 TRAP — verified by the orchestrator, must be handled (2026-07-16)
**Dropping `Photo` from the read path can silently delete photos.**
- `ItemDto` (`src/Tidansu.Application/Spaces/Dtos/ItemDto.cs`) is used for **both** read
  (`FromEntity`) and write (`ToEntity`) — one shape, both directions.
- `UpdateItemCommandHandler.cs:63` does `item.Photo = dto.Photo` — a **full replace**, not a patch.
- Therefore: if `GET` stops returning `Photo`, the SPA store holds none, and the next item edit
  PUTs `Photo: null` → **the stored photo is wiped**. Same hazard for any other client that
  round-trips an item it read.
- Note `UpdateItemCommandHandler.cs:40` already carries a `TRAP (T-13e)` comment about photo
  ordering on this exact path — this area is known-delicate; read it before touching it.

**The tech-lead must decide explicitly** between (at least): diverging the read and write DTO
shapes, or giving the update patch semantics where an absent photo means "leave unchanged".
Whichever is chosen, "a stored photo survives an item edit made by a client that never received
it" is a hard acceptance criterion — and it must be **proven by driving**, not asserted.

### Decisions taken by the orchestrator from documented rules (not open questions)
- **The "heavy account" benchmark.** Use **3 spaces × 20 photo items × ~1.5 MB each**
  (~90 MB pathological worst case), measured as raw `GET /api/spaces` response bytes before
  vs after. Must be *measured and recorded*, not asserted. Photos must be **seeded via the
  API** — the UI cannot create one.
- ~~**Downgraded Pro→Free user's existing photos.**~~ **Moot in B-16** — with no display path
  there is no viewing behavior to specify. Hand to **B-1**, where the rule to apply is the
  already-documented one (`CLAUDE.md`: *"Downgrade keeps data but makes over-cap content
  read-only"*, Free is *"no photos"*) → a downgraded user may **view** stored photos but
  adding/replacing opens the paywall with `reason: photos`. Recorded here so B-1 doesn't
  re-derive it.

## Acceptance criteria
- [ ] `GET /api/spaces` no longer contains any photo base64 — verified against a real
      response body for an account that has photo items (seed them via the API; the UI
      cannot create one).
- [ ] 🪤 **A stored photo survives an item edit** made by a client that never received the
      photo — proven by driving (read an item, edit its name, confirm the photo is still in
      the DB). See the TRAP note below; this is the single highest-risk regression here.
- [ ] Boot payload for the agreed heavy-account benchmark is bounded and small — **measured**
      before/after, not assumed.
- [ ] The client no longer eagerly loads every space's full contents on boot (per-space
      lazy-load), and the dashboard still renders correctly.
- [ ] The space list itself is paginated (FR-9) and the dashboard renders correctly across
      the page boundary.
- [ ] A "still loading" state for a space's contents is visibly distinct from the genuine
      empty state — a loading space must never look like an empty one (cf. B-18's bug).
- [ ] Free/Pro plan gating is unchanged: no plan-cap path
      (`spaces`/`zones`/`items`/`photos`/`sync`) regresses. In particular the `photos` gate
      on item create/update still fires exactly as today.
- [ ] No regression to B-15's granular zone/item endpoints or B-12's space-cap app-lock.

**Explicitly NOT acceptance criteria for B-16** (moved to B-1 with the photo feature): a photo
being *displayed*, a photo being *uploaded* from the UI, owner-only *fetching* of photo bytes,
and the safe-delivery/`nosniff` requirement — none of which can be met while no serving
endpoint exists.

## Notes

### Requirements-stage findings (2026-07-16)
- **The dashboard already needs only a per-space summary, not item content.**
  `SpaceCard.vue` renders name/type, up to 6 zone-color preview bands, and an
  item/zone count — it never reads individual items. That confirms the list can
  slim down to a summary + full-text zone/item graph without losing anything the
  dashboard currently shows, and grounds the natural split: lightweight summary
  up front, full per-space contents (`SpaceView.vue` currently reads straight
  from the fully-hydrated store — that read path is what has to become on-demand)
  only once a space is opened.
- **No photo display surface exists in the SPA today.** Searched every
  component; the only photo-related UI is `ItemDetailModal.vue`'s Pro-gated
  "Add a photo" button, whose click emits `addPhoto` to nothing that consumes
  it. `item.photo` is round-tripped through the store/API/mapping layer but
  never bound to an `<img>` anywhere, and no component reads an item's photo
  for any other purpose either (not even a presence check). This is why
  `requirements.md` FR-1 introduces **no** reference/URL/"has-photo" signal in
  the slimmed list — there is no consumer for one in this slice. Photo
  upload/display/serving are B-1's job (see the Third scope decision above).
- Full reasoning, phasing and open questions: see `requirements.md`.

### ⚠️ Security precondition inherited from B-13 — **NOW HANDS OFF TO B-1, NOT B-16**
B-13 validates a photo by sniffing only the **first 12 bytes** against JPEG/PNG/WebP magic
bytes, so a **polyglot** (valid PNG header + HTML/script tail) *is storable today*. That is
inert while photos are never served — nothing in the SPA renders one at all.

**This precondition fires only when photos are actually served from an endpoint**, which the
third scope decision moved **out of B-16 and into B-1**. B-16 does not build a serving path,
so it does not trigger this. **Do not implement photo serving here to "satisfy" this note.**

Carry the following to **B-1** verbatim when that slice starts — it must not be lost in the
hand-off:
- If the serving endpoint sets `Content-Type` from the stored *declared* type, the polyglot
  tail becomes a response body.
- The global `nosniff` header (`Program.cs`) defuses this **only if the new endpoint actually
  inherits that middleware** — verify by driving, do not assume.
- Prefer serving with a **fixed** content type (and/or a separate origin/bucket), never one
  derived from client-declared data.
- **Do not treat B-13's validation as sufficient once photos are served.**

B-16's one residual duty here: it must not make the polyglot situation *worse* — i.e. don't
add any path that echoes stored photo bytes back with a client-influenced content type.

### Inherited from B-14 (deferred here by decision, not oversight)
B-14 moved account-usage counts off `ISpacesRepository.GetAllByUserAsync`, so
`GetSpacesQueryHandler.cs:15` is now its **only** caller. That method's `Include`(zones+items)
+ `AsSplitQuery` shape exists solely to serve the layout view and could be renamed/narrowed to
say so — a real deepening opportunity left for B-16 **precisely because B-16 reworks that same
method**. Weigh it as part of this task rather than re-deriving it.

Sibling methods in `SpacesRepository.cs` already carry the projection discipline this task
needs (`GetItemCountsPerSpaceAsync`, `GetByIdWithoutContentAsync`), including explicit "do not
simplify this back into `GetAllByUserAsync`" comments — follow that established pattern rather
than inventing a new one.

### Related / out of scope
- Keep **separate from B-10** (async Stripe payments) — no overlap.
- **B-22** (client-supplied zone/item PKs → cross-tenant DoS) is a known open P1 and is *not*
  this task's job. Don't fold it in; don't "fix" it here.
- The photo-storage question overlaps a possible future photo-upload rework; this slice should
  not expand into one.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
