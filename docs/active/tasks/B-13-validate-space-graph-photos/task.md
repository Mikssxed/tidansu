---
id: B-13
slug: validate-space-graph-photos
title: Validate the space zone/item graph + photo content-type/size (S-2)
status: done            # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []         # see Notes for the B-12 file-overlap watch
touch-points:
  - src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandValidator.cs
  - src/Tidansu.Application/Spaces/Commands/UpdateSpace/UpdateSpaceCommandValidator.cs
  - src/Tidansu.Application/Spaces/Dtos/SpaceDto.cs
  - src/Tidansu.Application/Spaces/Dtos/ZoneDto.cs
  - src/Tidansu.Application/Spaces/Dtos/ItemDto.cs
  - src/Tidansu.Application/Spaces/Dtos/RectDto.cs
  - src/Tidansu.Infrastructure (TidansuDbContext — photo column)
---

# B-13 · Validate the space zone/item graph + photo content-type/size (S-2)

## Description
Saving a space today only checks the space's own id, name and type. Everything
nested inside it — the zones, the items in them, and the photo attached to an
item — is written to the database unchecked. Two things go wrong for users and
for the product. First, an over-long field (a very long item name, say) fails
deep in the database and the user gets an opaque server error instead of a clear
"that name is too long" message. Second, an item's photo is stored exactly as
sent, with no check that it is actually an image and no limit on its size, so a
Pro user can save arbitrarily large data — or non-image content such as a
`javascript:` or `data:text/html` URL — that the app later renders as an image
source. Saving a space should reject bad input cleanly and never store a photo
that isn't a real, reasonably-sized image.

## Acceptance criteria
- [x] Creating or updating a space with an over-long zone/item field returns a clean
      validation error (400) naming the offending field — not a 500.
- [x] Zone and item fields are validated to the same limits the database enforces
      (Zone: `Id` 64, `Label` 120, `Color` 16, `Kind` 16, `Facing` 16. Item: `Id` 64,
      `Name` 200, `ZoneId` 64, `DateAdded` 40, `Expiry` 40, `Depth` 16, `Icon` 40.
      Space: `Type` 16, `ViewMode` 16, `CanvasMode` 16 — `Type` currently checked
      for presence only, `ViewMode`/`CanvasMode` not checked at all), so no valid
      input is rejected and no invalid input reaches the database.
- [x] An item's tag list is capped at 15 tags, each ≤24 characters (new rule — the
      database has no existing tag limit to mirror); over-cap tags are rejected
      with a 400, not silently truncated.
- [x] An item photo that is not an allow-listed image type (proposed: JPEG, PNG,
      WebP) is rejected with a 400 and is not stored; the check verifies actual
      image content, not a client-declared label.
- [x] An item photo above the per-photo size cap (proposed: 5 MB raw / ~6.7 MB as
      a base64 data URL, checked against decoded size) is rejected with a 400 and
      is not stored.
- [x] A normal JPEG/PNG/WebP photo attached by a Pro user still saves and still displays.
- [x] No regression to the plan-cap paths: the Free photo gate still opens the
      paywall with `reason: photos`; space/zone/item caps still behave as before.
- [x] Existing rows saved before these rules existed are not re-validated or
      blocked on read; the new rules apply only to future writes (re-saving an
      over-limit item does trigger normal validation).
- [x] A validation rejection during autosave never shows a false "saved" state and
      never silently discards the user's in-progress edit (route through B-19's
      failure-surfacing mechanism rather than a separate notification path).

## Notes
- Source: B-8 security & scalability audit, finding 🟠 S-2. See
  `docs/active/tasks/B-8-security-scalability-audit/review.md`.
- Full reasoning and FR breakdown: [`./requirements.md`](./requirements.md).
- **Per-photo size cap and allow-listed image types are proposed values, not yet
  confirmed by the product owner** — see requirements.md "Proposed values" and
  Open Questions. Tech-lead pins the enforcement mechanism once confirmed.
- **Tag bounds (15 tags / 24 chars/tag) are a new business rule** — the database
  has no existing tag limit, so unlike the other field bounds this isn't a
  DB-parity fix, it's a fresh product decision needing PO confirmation.
- The frontend has **no photo-capture/upload flow implemented yet** — only the
  Pro paywall gate on the photo slot exists (`ItemDetailModal` emits `addPhoto`/
  `photoLocked`, nothing consumes `addPhoto`). The proposed cap/allow-list are
  reasoned from "what a phone camera produces," not from an existing client
  implementation — reconfirm once a real capture flow is built.
- **Existing-content policy decided:** existing rows are *not* retroactively
  re-validated or blocked on read (see requirements.md FR-7) — this is a
  write-time-only preventive control, not remediation of past data.
- **Autosave UX:** a rejected save must not fail silently; route through B-19
  (surfacing non-plan space-sync failures) rather than building a parallel
  mechanism here — see requirements.md FR-8.
- **File-overlap watch:** B-12 (space-cap race, done, uncommitted) touched
  `CreateSpaceCommandHandler.cs` + `SpacesRepository.cs`; this task touches the
  *validators* and DTOs, so no direct file collision — but the working tree
  already carries uncommitted B-7/B-10/B-11/B-12 changes. Do not revert them.
- `Item.Photo` is currently `nvarchar(max)` holding a base64 data URL. B-16
  proposes moving photos out of the row entirely — keep this task to validation
  only and don't pre-empt that redesign.
- `Item.ZoneId` is an intentionally loose reference (no FK enforced) per the
  entity's own code comment — not a defect this task should fix.

### Tech-planning decisions (see [`./tech-tasks.md`](./tech-tasks.md) §🧭 D-0…D-9)
**Revised after the human gate — the rulings below are settled, don't re-open.**
- **Values settled at the requirements gate:** 5 MB raw / decoded-size cap,
  JPEG+PNG+WebP allow-list (`image/jpg` rejected — not a real MIME type),
  15 tags × 24 chars. Encoded as `PhotoPolicy` constants.
- **🔴 The photo check runs in the HANDLERS, not in FluentValidation** (human
  ruling). FR-4 stands: a Free user sending a photo — valid *or* invalid — must
  still get **403 `{plan:["photos"]}`**. FluentValidation is a MediatR pipeline
  behavior that runs *before* handlers, so a validator-side check would have
  returned 400 and preempted the paywall.
- **`PhotoPolicy` still lives in Domain** (`src/Tidansu.Domain/Constants/PhotoPolicy.cs`,
  pure + static, mirroring `PlanPolicy`) and **`PhotoPolicyTests` is unchanged**.
  My earlier claim that the handler move "costs the test surface" was **wrong** —
  a pure function's testability doesn't depend on its caller (`PlanPolicyTests`
  tests `PlanPolicy` directly even though only handlers call it). Only the thin
  adapter changed: `PhotoRuleExtensions` → `SpacePhotoGuard` (D-0).
- **Ordering (D-8.1/D-8.2):** guard goes *after* the `PlanPolicy` gate and
  *before* `dto.ToEntity` (Create) / before mutating the tracked `existing`
  (Update). It is **outside** B-12's `sp_getapplock` — never scan photos while
  holding a per-user DB lock. Don't touch `AddWithinSpaceCapAsync`.
- **Exception (D-8.3):** reuse `Tidansu.Domain.Exceptions.ValidationException` —
  it already maps to a field-named 400 and is what `ValidationBehavior` itself
  throws, so the contract can't fork. Precedent: `UserService`, `StripeBillingService`.
  **Error keys:** `ToCamelCase` lowercases only the *first char*, so the wire key
  is `space.Items[0].Photo` — build it as `$"Space.Items[{i}].Photo"`.
- **The split (D-8.5):** only FR-4/FR-5 (photo) move to the handler. FR-1/2/3/9
  (field lengths, tags, rect) **stay in FluentValidation**. Don't move everything.
- **Mechanism:** span-based data-URL parse (no regex — ReDoS on a ~7 MB string),
  cheap rejects first (string-length → arithmetic decoded size → 12-byte header
  decode), then **magic-byte sniffing** that must be allow-listed **and agree with
  the declared MIME type**. Never materialises a multi-MB `byte[]`. Null photo →
  first statement, near-free (matters now it runs per autosave).
- **`[RequestSizeLimit(24 MB)]` + 413 on `SpacesController`** (human ruling, D-9),
  following B-9. No middleware change needed — the `BadHttpRequestException` catch
  B-9 added already returns 413 in the standard shape.
- **No EF migration, no DTO change, no DbContext change** — `Photo` stays
  `nvarchar(max)` (capping it would violate FR-7; B-16 may move it anyway).
- **⚠️ Kiota regen: YES** — reversed from the first draft. Caused **solely** by the
  new `[ProducesResponseType(413)]`, which lands in the OpenAPI doc (proof: B-9's
  identical change shows `api/billing/webhook/index.ts` modified in the tree).
  Expect a small 413-only diff.
- **No new dependency.** ImageSharp (licensing + full-decode DoS) and SkiaSharp
  (native deps) rejected; sniffing is ~30 lines.
- **FR-9 (rect sanity) is IN** — near-free on a `RectDtoValidator` we create anyway.
- **FR-8 needs no code.** `useSpacesStore.handleSyncError` already doesn't revert
  the local edit on a non-plan error, and the SPA has no "saved" indicator at all,
  so Phase 1's bar is met by changing nothing. **B-19 owns surfacing.**
- **🔴 S-5 is the top implementation risk:** the guard builds its error message by
  hand, so never interpolate/log `item.Photo` — fixed const messages only. The key
  carries attribution; the message carries no data.

### ⚠️ Open questions — all closed except one decision
1. ~~400 vs 403~~ → resolved: handler-side, 403 wins.
2. ~~`""` photo~~ → moot: `PlanPolicy` counts `Photo is not null`, so Free + `""`
   → 403; the guard never runs.
3. ~~`image/jpg`~~ → rejected.
4. ~~`[RequestSizeLimit]`~~ → included at 24 MB.
5. 🟢 One-off audit of existing rows: still not planned (consistent with FR-7).
6. 🟡 **New:** the Kiota regen exists only because of `[ProducesResponseType(413)]`.
   Planned as keep-attribute + regen (matches B-9). Drop the attribute if you want
   zero client churn — the 413 still returns at runtime.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
