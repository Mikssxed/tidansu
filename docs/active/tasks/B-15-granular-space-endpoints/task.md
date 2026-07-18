---
id: B-15
slug: granular-space-endpoints
title: Granular item/zone endpoints instead of delete-all/re-insert on every save
status: done           # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []         # B-12's cap lock and B-13's SpacePhotoGuard already landed (bf9e169)
touch-points:
  - src/Tidansu.API/Controllers/SpacesController.cs
  - src/Tidansu.Application/Spaces/Commands/          # new per-item / per-zone command folders
  - src/Tidansu.Application/Spaces/Dtos/              # ItemDto, ZoneDto, SpacePhotoGuard reuse
  - src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs
  - src/Tidansu.Domain/Repositories/ISpacesRepository.cs
  - src/Tidansu.Domain/Constants/PlanPolicy.cs        # gate must become a per-mutation decision
  - src/Tidansu.App/src/composables/useSpacesApi.ts
  - src/Tidansu.App/src/stores/useSpacesStore.ts      # debounced whole-space PUT save path
  - src/Tidansu.App/src/api/apiClient/                # Kiota regen (npm run build:api)
---

# B-15 · Granular item/zone endpoints instead of delete-all/re-insert on every save

## Description
Editing anything inside a space — renaming one item, nudging one zone — currently
rewrites the entire space on the server. A user with a 50-item space pays roughly
100 deletes and 100 re-inserts, and every photo they have ever attached is rewritten
byte-for-byte, just to change one character. Under load this is heavy write
amplification and index churn, and it puts every item's photo blob back on the wire
on a routine edit. After this change, editing one item costs one row update: the
client tells the server precisely what changed instead of resending the whole space.

## Acceptance criteria
- [ ] Renaming/moving a single item issues a single-row UPDATE — no delete-and-reinsert
      of that space's other zones/items, and no rewrite of any untouched photo blob.
- [ ] Adding, editing, and removing items and zones each persist correctly and survive
      a reload; rapid successive edits do not lose or duplicate entities. Deleting a
      zone cascades to remove the items placed inside it (matches current behaviour).
- [ ] Renaming a space or changing its view/canvas mode (a scalar space field, not a
      zone/item) persists via its own endpoint without the request carrying or the
      server rewriting that space's zones/items.
- [ ] Plan caps still hold on the new per-mutation path: exceeding zones/space,
      items/space, or attaching a photo on Free opens the paywall with the matching
      `reason` ∈ {spaces, zones, items, photos, sync} and does **not** mutate. Editing
      or removing existing over-cap content (post-downgrade) stays allowed; only
      mutations that grow an already-at/over-cap dimension are rejected.
- [ ] The zones-per-space and items-per-space caps hold under concurrent add requests
      against the same space — the final count never exceeds the cap regardless of
      request timing (same race shape B-12 closed for space creation, now per-space).
- [ ] A user can only mutate items/zones inside a space they own; a cross-user or
      unknown id returns the same "not found" response either way (no distinct
      403 that would confirm the id exists) and never reads or writes another
      user's row.
- [ ] A save that mixes a valid edit with one that trips a cap in the same batch only
      rolls back the rejected mutation — sibling edits that already succeeded are not
      reverted or re-fetched away.
- [ ] Photo validation (B-13's `SpacePhotoGuard`) still rejects invalid/oversized
      photos with a named-field 400 on the new path.
- [ ] No regression to space create/delete, the account usage meters (B-14), or the
      spaces hydrate on boot.

## Notes
**Scope decided at kickoff (2026-07-15).** The backlog offered two routes: (a) diff
inside `ReplaceAsync`, keeping the whole-space PUT; (b) granular per-item/per-zone
endpoints. **The user chose (b), the heavier route** — fix the amplification at the
source rather than paper over it in the repository.

**Consequences of (b) that the PM/tech-lead must confront:**
- New contracts → **Kiota regen** (`npm run build:api`) is part of this task.
- The plan gate moves. Today `UpdateSpaceCommandHandler` computes `before`/`after`
  `SpaceUsage` from the whole incoming graph and calls `PlanPolicy.CheckSpaceMutation`
  once (`UpdateSpaceCommandHandler.cs:28-31`). Per-entity endpoints have no whole
  graph in hand, so the gate must become a per-mutation decision without weakening
  the cap. **This is the highest-risk part of the task** — it is real plan-gating
  logic, not a config guard. Note B-12 closed a read-then-insert race on the *space*
  cap with a per-user `sp_getapplock`; a per-item add has the same shape of race
  against the items/space cap, and the PM should not assume it is free.
- The frontend debounced whole-space `PUT` (`useSpacesStore.ts` → `useSpacesApi.ts:34`)
  becomes per-entity calls; optimistic mutation + 403-opens-paywall behaviour must be
  preserved.
- `ReplaceAsync` / the whole-space `PUT` may need to stay for a transition, or be
  retired — the PM should call whether this is a replacement or an addition.

**Open scope question for the requirements gate:** whether the whole-space PUT is
removed in this task or kept alongside. Removing it is cleaner but widens the
frontend blast radius; keeping both leaves the slow path alive.

**Requirements-gate resolution (2026-07-15) — see `requirements.md`:**
- **Recommendation: retire the whole-space PUT in this task.** Single API consumer
  (the SPA), `useSpacesStore.ts` must be rewritten regardless, and keeping both paths
  means maintaining two parallel plan-cap enforcement implementations that could
  drift — an unacceptable risk on the highest-risk part of this task. Flagged as an
  open question for PO sign-off, not treated as fully closed.
- A space's own scalar fields (name, type, view mode, canvas mode, layout columns,
  column labels) need their **own lightweight update endpoint**, separate from the
  zone/item endpoints — otherwise renaming a space still forces a full zone/item
  resend as a side effect of the save batching, defeating the point of this task.
- Zone delete cascades to its items (matches current frontend behaviour); calling
  this out as a named, testable server behaviour now that it's not an implicit
  side effect of resending the whole graph.
- FR-9 in `requirements.md` calls out a same-shape-as-B-12 concurrency race on the
  per-space zones/items caps (concurrent add requests against the same space);
  locking mechanism is a tech-lead decision, but the atomicity guarantee itself is
  in scope for this task, not deferred.
- Ownership checks on cross-user ids: standardized on "not found" for both unknown
  and other-user ids (never a distinct 403 that would confirm existence), matching
  the existing space-level convention.
- Partial-failure behaviour (FR-11) is newly possible once saves are per-entity: a
  rejected mutation must only roll back itself, not sibling edits that already
  succeeded. This task must expose per-mutation success/pending/failure state; the
  notification UI that consumes it is B-19's, not built here.

**✅ APPROVED AT THE REQUIREMENTS GATE (2026-07-15) — all three open questions are
CLOSED. Do not re-open them; they are user decisions, not suggestions.**
1. **Retire the whole-space `PUT` in this task.** `PUT /api/spaces/{id}` and
   `SpacesRepository.ReplaceAsync` are removed, not kept alongside. Rationale
   accepted as the PM argued it: one cap-enforcement implementation, no drift, no
   dead slow path. This makes the diff bigger — accept that.
2. **Batch the debounce window (FR-11).** Keep **one** debounce window per space;
   when it fires, send the accumulated changes as separate per-entity requests
   together. Not per-entity independent timers. This keeps the felt timing close to
   today's; per-mutation failure state is still required per FR-11.
3. **Zone delete cascades to its items.** Confirmed as intended, explicit, testable
   server behaviour — matches today's implicit behaviour. Items are not orphaned.

**Tech-planning resolution (2026-07-15) — see [`tech-tasks.md`](./tech-tasks.md):**
- **No EF migration is needed, and that is a checked conclusion, not an omission** (D-5).
  No entity/DbContext field changes. FR-3's cascade needs no FK because `Item.ZoneId` is
  deliberately not one — the cascade is a set-based `ExecuteDeleteAsync` in the repo.
  **If the developer finds themselves writing a migration, the plan is wrong — escalate.**
- **The plan gate decomposes by algebra** (D-1), not by re-counting the graph. For an add,
  `after = before + 1`, so today's `after > cap ∧ after > before` reduces *exactly* to
  `before >= cap`. Updates and deletes never change a count, so `after > before` is always
  false → **they get no gate call at all**. That absence is what keeps downgraded over-cap
  content editable. `count >= cap` is only a trap if applied to updates.
- **FR-9's race:** yes, B-12's `sp_getapplock` pattern applies — keyed **per-space**, a
  **single** resource covering zones and items (preserves B-12's one-resource-per-
  transaction ⇒ no-deadlock argument structurally), **Free-only** (Pro is uncapped, takes
  no lock, is never serialized). All of B-12's hard-won caveats are carried into the new
  methods' comments: capture the `sp_getapplock` RETURN code, `ToListAsync` (not
  `SingleAsync` — non-composable batch), fail closed (never a `PlanLimitException`),
  `EnableRetryOnFailure` still off.
- **FR-10 is enforced structurally:** no `ISpacesRepository` method reaches a zone/item
  with fewer than `(spaceId, entityId, userId)`. An unscoped mutation is not expressible,
  so it can't be forgotten per-endpoint. Unknown and cross-user ids share one `null` → 404
  branch and cannot diverge.
- **Domain unit tests** (`tests/Tidansu.Domain.Tests` — the repo's only real coverage):
  new `CheckAddZone` / `CheckAddItem` / `CheckItemPhotoChange` / `PhotoChangeBetween`
  tables, **plus a temporary equivalence theory** asserting the new per-mutation gate
  agrees with `CheckSpaceMutation` for n=0…10 — green before `CheckSpaceMutation` is
  deleted (T-6 → T-8). That is FR-8's proof.
- **Kiota regen (T-21):** `npm run build:api` is known-broken here (B-21, structural — no
  `Startup` class). The fallback and the version-matched global tools are spelled out in
  the task so the developer doesn't get stuck.
- **Two traps written into the plan:** `PhotoChangeBetween(null, "")` must be `Added`
  (empty string is a photo — else Free gets a 400 instead of the 403 paywall), and an
  *identical* resent photo must be `None` (else photo-bearing items become uneditable for
  downgraded users — the real form of the naive-rule trap).
- **Open questions for the developer/PO (do not silently decide):** (1) FR-5 gates photo
  *replacement* on Free, which **tightens** today's count-delta behaviour; (2) `PATCH` vs
  `PUT .../fields` for the scalar endpoint; (3) the zone-existence check on item
  add/update is **new** server behaviour and is what forces the two-phase client flush.

**✅ APPROVED AT THE TECH-PLANNING GATE (2026-07-15) — the four Open Questions in
`tech-tasks.md` are CLOSED. These are user decisions; do not re-open them.**
1. **Gate photo replacement on Free — reject the swap.** This is a deliberate,
   accepted **tightening** of today's behaviour, not a faithfulness bug. Today
   `CheckSpaceMutation` gates photos on `after.Photos > before.Photos`, and a swap
   leaves the count at 1, so a downgraded Free user can currently replace a photo.
   That ends: replacing a photo on Free now returns `403 {plan:["photos"]}`, because
   "downgrade keeps data but makes over-cap content read-only" — writing new photo
   content is not keeping data. **Still allowed on Free:** removing a photo, renaming
   /editing a photo-bearing item, and resending the *identical* photo (must map to
   `PhotoChange.None`, or downgraded users' photo items become uneditable).
2. **Keep the zone-existence check** on item add/update. Accepted as new server
   behaviour despite `Item.ZoneId` being commented as an intentionally loose
   reference (B-13 declined to enforce it; this task does enforce it). This is what
   forces the two-phase client flush — zone-adds must flush before item-adds.
3. **Endpoint shape: `PUT /api/spaces/{id}/fields`** — NOT the tech-lead's default
   `PATCH /api/spaces/{id}`. The scalar fields get their own sub-resource.
4. **Run `design-an-interface` on the pending-change/flush module** before building
   it (T-24). Its output informs `pendingChanges.ts`.

**Verified by the orchestrator at this gate (do not re-derive):** the tech-lead's
FR-8 decomposition is algebraically faithful to today's `CheckSpaceMutation`. For an
add, `after = before + 1` makes `after > before` always true, so
`after > cap && after > before` reduces exactly to `before >= cap`. Updates and
deletes never change a count, so `after > before` is always false — they correctly
get **no gate call at all**, and that absence *is* the downgrade rule. Checked
against `src/Tidansu.Domain/Constants/PlanPolicy.cs:33-35`.

**OQ-4 exploration ran (2026-07-15) — `design-an-interface`, 4 designs.** Outcome
folded into `tech-tasks.md` T-24. Chosen: the "common-case" design (hot path
`stageUpdate` is a one-for-one swap for `Object.assign`; rare cases get escape
hatches) + the reducer design's purity discipline (`ChangeSet` is a plain value, pure
functions, so every coalescing rule is a ~3-line test — this repo has no frontend
test coverage). Rejected: a minimal `flush()`/`resolve()` protocol (misuse breaks
zone ordering with no type error) and **diff-at-flush** (the agent arguing *for* it
returned a negative result: shadow-seeding is a silent correctness trap and the diff
scans every zone/item per window, unbounded on the Pro-with-photos tier — and it
does not eliminate the zone-cascade rule, only relocates it).

**The exploration found two real bugs in the tech-lead's plan; both are fixed:**
- **BUG 1** — the phase-1-failure drop rule covered only item-*adds*. FR-5 lets an
  item *update* reassign into a zone added in the same window; if that zone-add
  fails, the update was still sent. Now: drop **every** phase-2 item op whose target
  `zoneId` belongs to a failed zone-add. (`tech-tasks.md` D-7 / SC-6 / T-25, driven
  in T-34.11.)
- **BUG 2** — overlapping flush windows. The 400 ms debounce delays a flush's
  *start*, not its *duration*, so two flushes per space could overlap and a stale
  rollback could stomp a newer optimistic edit — silent data loss on the autosave
  path. **Fixed by serializing flushes per space** (chosen at the gate over
  per-entity generation stamps: overlap becomes structurally impossible rather than
  detected after the fact, and a missed stamp check would fail silently with no tests
  to catch it). (`tech-tasks.md` SC-9 / T-25, driven in T-34.12.)

**Doc-integrity note (2026-07-15).** The tech-lead hit a session limit partway
through folding these decisions in, leaving `tech-tasks.md` half-revised — the
preamble claimed fixes the body didn't contain, and the task list still specified the
overruled `PATCH`. The orchestrator completed the propagation (D-6 body, T-10, T-18,
T-21, T-23, T-24, T-25, D-7, SC-6, SC-9, §5, T-34.11/12). The tech-lead's own
contributions were kept verbatim: the narrowed ⛔ gate list (T-4/T-6/T-7/T-8/T-16 —
down from 18 of 34) and the batching notes, including the catch that **T-9 + T-13d +
T-13e must not be split across runs** (they are the photo trust boundary; split them
and the second run cannot see that the ordering invariant it depends on just moved,
and the failure — a Free user getting a 400 instead of the 403 paywall — is invisible
to `dotnet build`).

**✅ STAGE 4 REVIEW COMPLETE (2026-07-16) — both reviewers run, all accepted findings
fixed.** Reports: [`review.md`](./review.md) (correctness/convention) and
[`security-review.md`](./security-review.md) (trust/authz/fail-open). Scopes were
partitioned so they didn't re-derive each other.

**Fixed in-branch (each with a regression test proven to fail first):**
- **🔴 C1 — zone deletes raced item ops.** `runPhase2` fired item ops *and* zone deletes
  in one `Promise.allSettled`. Move item A out of zone Z and delete Z in the same window:
  if the DELETE landed first, the server cascade matched A's *still-persisted* `ZoneId=Z`
  and deleted the item the user had just moved to safety; A's `PUT` then 404'd. Silent
  data loss, visible only on reload. **Fixed:** zone deletes are now a **phase 3** after
  item ops settle. Nothing needs the reverse order — `stageZoneDelete` already
  annihilates pending changes for items still inside the doomed zone. *The two-phase
  design was meant to prevent exactly this; the plan itself put zone deletes in phase 2.*
- **🟠 M1 — `rollbackSpace` reverted siblings.** A blanket `Object.assign(space, snapshot)`
  also restored the `zones`/`items` arrays cloned when the rename was staged — silently
  dropping an item added later in the same window and already persisted server-side
  (a direct FR-11 violation). **Fixed:** restores only `SPACE_SCALAR_KEYS`. The existing
  test passed only because its fixture had empty arrays — the same vacuous-test pattern
  caught earlier in the equivalence theory.
- **🟠 M2 — `hydrate(true)` on a failed space create.** A full re-sync replaced every
  `Space` while per-space `ChangeSet`s survived holding ops against the *old* objects, so
  a cap rejection on space B could discard in-flight edits to space A. **This was B-15's
  own doing** — a re-sync was harmless before this task introduced pending per-entity
  state. **Fixed:** roll back just that space (`discardSpaceLocally`); deletes never trip
  a cap so they take the surfaced-error path.
- **🟠 M3 — `RemoveItemAsync` loaded the photo blob** to delete one row, the exact
  anti-pattern SC-2's comment forbids ten lines above. **Fixed:** set-based
  `ExecuteDeleteAsync` with ownership as an EXISTS subquery. Re-driven: translates at
  runtime, cross-user delete 404s without touching the victim's row.
- **🟠 M4 — the `sp_getapplock` preamble was hand-copied 3×**, and the
  `tidansu:space-content:` key 2×. That key *is* D-4's invariant, so duplicating it meant
  a future edit could silently create two lock resources. **Fixed:** one
  `AcquireLockOrThrowAsync` + one `SpaceContentLockResource`. **The T-34.9 race was
  re-driven after the refactor** — still one 200 / one 403, final count exactly 6.
- **🟡 S-L1** — `PUT /fields` had dropped the 24 MB limit its predecessor carried, leaving
  Kestrel's *larger* ~28.6 MB default. Explicit 64 KB limits added to `/fields` and the
  zone write routes (no photo in either body).
- **🟡 S-L2 + 3 stale comments** — D-3's "one exception" (now two), `vite.config.ts`'s
  "no store tests", and `PlanPolicy`'s attribution to the deleted T-6.
- **Housekeeping:** agent-memory files had been written into `src/**/.claude/` by agents
  running with a nested CWD; relocated to the canonical root `.claude/agent-memory/`.

**Deliberately NOT fixed here — filed as [B-22] (P1):** client-supplied, clock-derived,
*globally unique* zone/item PKs enable a cross-tenant DoS. Real, and the security review
was right to escalate it. **But the orchestrator checked its attribution and it is
pre-existing, not worsened by B-15** — `SpaceDtoValidator` caps no collection length,
Pro's zone cap is `null`, and `POST /api/spaces` (untouched by B-15) allows 24 MB ≈
120,000 zones in **one** request, versus 46,656 individually rate-limitable requests
after B-15. The fix needs a composite-key **migration** + data migration + an id-strategy
decision, so it is its own slice. B-15's D-5 ("no migration") remains correct *for B-15*.

**Related:** B-16 (paginate/slim the spaces list; stop returning photo data-URLs
inline) reworks `GetAllByUserAsync` and photo storage — it will collide with this
task's files. Serialize the two; do not run B-16's implementation in parallel.
B-19 (surface non-plan sync failures) owns the save-failure UX that this task's new
per-entity error paths will feed.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
