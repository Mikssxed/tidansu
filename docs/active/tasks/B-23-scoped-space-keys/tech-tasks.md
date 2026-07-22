<!--
Written by the tech-lead agent, worked (and checked off) by the feature-developer.
Ordered checkbox tasks grouped by layer, plus Security / Scalability / New
Dependencies / Open Questions. One tech-tasks file per task folder.
-->

# B-23 · Technical Tasks — Space.Id no longer client-supplied / globally collidable

> Requirements: [`./requirements.md`](./requirements.md) (FR-1 … FR-6) · Brief: [`./task.md`](./task.md)
> Prior art: B-22 [`../B-22-scoped-zone-item-keys/tech-tasks.md`] + its security review § S-H1
> (this task is the direct follow-up S-H1 filed).

---

## 0. ⚖️ Identifier-strategy decision (delegated to tech-planning — read first)

**Chosen: (a) the server assigns `Space.Id` from a CSPRNG and ignores whatever the
client sends. `Space.Id` stays the sole, globally-unique primary key. `Space` is
NOT re-keyed to `(UserId, Id)`.**

### Why not `(UserId, Id)` (the B-22 pattern) — the FK-principal constraint disqualifies it

`Space` is the tenancy **root** and, unlike `Zone`/`Item`, it is the **principal**
of foreign keys: `TidansuDbContext.cs:74-82` declares
`FK_Zone_Spaces_SpaceId` and `FK_Item_Spaces_SpaceId`, both referencing
`Spaces.Id`. A SQL Server foreign key must reference a PRIMARY KEY or a UNIQUE
constraint on the principal column(s). Re-keying `Space` to `(UserId, Id)` removes
the uniqueness of `Id` alone, which forces one of two bad outcomes:

- **(b1)** keep a `UNIQUE` index on `Spaces.Id` so the child FKs still resolve —
  but that index **re-imposes the exact global uniqueness this task exists to
  kill**. Self-defeating: the cross-tenant collision 500 survives on the unique
  index.
- **(b2)** add a `UserId` column to **both `Zone` and `Item`**, backfill it
  non-null from the parent space, and rewire both composite FKs to
  `Spaces(UserId, Id)`. That is an invasive **data** migration (two new non-null
  columns backfilled) on the two tables B-22 has just reworked — the precise
  opposite of FR-5's "applies cleanly, no data loss/reassignment" and the reason
  the brief warns "B-22's composite answer does NOT transfer."

This is the structural difference the brief flagged: a composite key works for a
*child* entity (Zone/Item have a parent id to lead with); it does not work for the
*root* without dragging the whole child subtree along.

### Why server-assigned CSPRNG id wins

- **No schema change at all.** `Spaces.Id` stays `nvarchar(64)`, stays the sole PK,
  stays a valid FK principal. Only *who mints the value* moves from the client to
  the server. Zero rows change; no column added/dropped/retyped; no FK touched; the
  space-delete `ON DELETE CASCADE` is preserved untouched. Lowest possible migration
  risk (FR-5). **Consequently no EF migration is required** — see § "EF migration".
- **Closes the DoS and the oracle at the source.** The attacker can no longer
  *choose* an id, so they cannot pre-squat a victim's predictable `uid('space')`
  range (FR-1) and cannot submit an arbitrary id to probe whether it exists (FR-3).
  A CSPRNG 128-bit id collision is astronomically improbable (birthday bound ≈ 2^64
  spaces); on the vanishing chance, the handler regenerates and retries, so the
  caller never sees a 500 (FR-2), and because the caller never chose the id, even a
  residual failure leaks nothing (FR-3).
- **Existing rows need no retroactive fix** (resolves requirements Open Question 3).
  Every existing `Space.Id` is already globally unique (today's PK enforces it), so
  it stays valid under the unchanged PK. Reassigning them would break
  `Zone.SpaceId`/`Item.SpaceId` references and client-cached ids for zero benefit.
  New spaces get server ids; old spaces keep client ids; both coexist because the
  column stays globally unique.

### The one cost — FR-6 (accepted, and planned around)

Today the client mints `uid('space')` and treats it as the authoritative route key
for every later mutation, **discarding the create response**
(`useSpacesStore.createRemote` → `void api.create(space).catch(...)`). Under
server assignment the client must adopt the **returned** id. This is preserved by
keeping the synchronous optimistic push (the space still "appears immediately" with
a temporary local id), then reconciling temp→server id on create success and
**gating the space's granular autosave until its create resolves**. The initial
`POST /api/spaces` already carries the whole zone/item graph, so nothing needs to
flush before the id is known. **No Kiota regen** — the create response already
returns `SpaceDto.Id`, Kiota already deserializes it, and `useSpacesApi.create`
already returns `toSpace(res.data)`; the store simply stops throwing it away.

### Rate-limit sizing (FR-4)

New per-**account** fixed-window policy, **20 creates / minute**, partitioned by the
authenticated user id. Rationale: onboarding + duplicate-space bursts stay well
under 20/min for any real user; abuse is capped hard; and since server-assigned ids
already kill the squatting attack, this limiter is defense-in-depth against
open-ended resource consumption (Pro has no space cap). 20 is deliberately looser
than auth (10/min) / magic-link (3/min) because bulk space creation is a legitimate
user action; it is a config constant, tunable later. See Open Questions ❓1.

---

## 1. 📋 Technical Tasks

### Backend — Domain

- [x] create `ISpaceIdGenerator` in `src/Tidansu.Domain/Interfaces/ISpaceIdGenerator.cs`
      — a one-method seam, `string Generate();`, returning an unpredictable, unique,
      `nvarchar(64)`-safe space id (e.g. `"space_" + 22 base64url chars` = 128 bits).
      Interface only, zero outward dependencies (mirror how `ISpacesRepository` lives
      in Domain with no EF/crypto types). This is the deep-module seam: callers depend
      on "give me an unforgeable id," not on `RandomNumberGenerator`.

### Backend — Infrastructure

- [x] create `SpaceIdGenerator` in `src/Tidansu.Infrastructure/Services/SpaceIdGenerator.cs`
      implementing `ISpaceIdGenerator` — mirror `JwtService.cs:49`'s use of
      `RandomNumberGenerator` (`RandomNumberGenerator.GetBytes(16)` →
      `Base64Url`/hex, prefixed `"space_"`). Cryptographically secure on purpose:
      `Guid.NewGuid()` is v4-random but not spec-guaranteed CSPRNG, and unpredictability
      is the whole point of this fix — do not substitute a plain GUID.
      ⚠️ Keep the encoded id ≤ 64 chars (the `Space.Id` column is `HasMaxLength(64)`,
      `TidansuDbContext.cs:59`).

- [x] register `ISpaceIdGenerator → SpaceIdGenerator` in
      `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs`
      (singleton — it is stateless). Mirror the existing `JwtService`/repository
      registrations in that file.

- [x] update the misleading B-22 comment in
      `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:231-239`
      — the D-3 block currently reads as though client-supplied-key collisions are
      handled repo-wide. Add one clause noting that `Space.Id` is now **server-assigned
      (B-23)**, so the collision/oracle gap this comment's Zone/Item reasoning describes
      is now closed at the root too, not merely for children. (Security review § S-L2
      asked for exactly this tripwire.) No query changes — this file's space queries are
      already `s.Id == spaceId && s.UserId == userId` scoped.

### Backend — Application

- [x] modify `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs`
      to assign the id server-side. Inject `ISpaceIdGenerator`; generate the id and use
      it for the space **and** its child graph. Cleanest: add a `SpaceDto.ToEntity(string
      userId, string spaceId)` overload (next task) and call it, so the incoming DTO is
      not mutated. Update the existing `logger.LogInformation("Creating space {SpaceId}
      …", dto.Id, …)` (line 40) to log the **generated** id, not `dto.Id`.
      ⚠️ **Ordering is load-bearing — do not disturb it.** Generate the id *after* the
      plan-gate (`PlanPolicy.CheckNewSpace` → `PlanLimitException`, lines 29-32) and
      *after* `SpacePhotoGuard.ThrowIfInvalid` (line 38), immediately before
      `dto.ToEntity(...)` (line 42). A Free user at cap must still get
      `403 {plan:["spaces"]}` and a photo violation its 403 — never a new code path — so
      those gates keep running against the submitted graph first.
      ⚠️ The generated space id must be stamped onto the child zones/items' `SpaceId`
      (that is what `ToEntity(userId, id)` does via `Zones.Select(z => z.ToEntity(id))`).
      The zones'/items' **own** ids stay client-supplied and space-scoped — that is
      B-22's territory and is unchanged here.

- [x] add a `ToEntity(string userId, string spaceId)` overload to
      `src/Tidansu.Application/Spaces/Dtos/SpaceDto.cs`
      — identical to the existing `ToEntity(userId)` (lines 30-42) except `Id = spaceId`
      and the child projections use `spaceId`: `Zones.Select(z => z.ToEntity(spaceId))`,
      `Items.Select(i => i.ToEntity(spaceId))`. Keep the existing single-arg overload for
      any other caller (grep `\.ToEntity(` under `Spaces/` first to confirm callers — only
      `CreateSpaceCommandHandler` builds a whole-space graph). Static hand-mapping, no
      AutoMapper (matches this feature's convention).
      ⚠️ Do **not** leave the create path calling the old `ToEntity(userId)` that reads
      `Id` from the client DTO — that is the exact client-supplied-id gap being closed.

- [x] add a bounded collision-retry around the insert in `CreateSpaceCommandHandler`
      (defense-in-depth) — on a `DbUpdateException` from the insert (`AddWithinSpaceCapAsync`
      for Free, `AddAsync` for Pro), regenerate the id, re-`ToEntity`, and retry up to ~3
      times before letting it propagate.
      ⚠️ This is belt-and-braces, not load-bearing for FR-3: a 128-bit CSPRNG collision is
      below hardware-failure probability, and because the id was server-chosen even a
      propagated failure (→ the existing generic 500) leaks nothing. Keep the retry loop
      simple; do **not** widen it into a general DbUpdateException catch that would swallow
      real persistence faults. If the developer judges it not worth the complexity, it may
      be dropped — record the choice — because the B-22 `DbUpdateException` middleware
      clause already renders any residual as a byte-identical generic 500.

### Backend — API

- [x] add the space-create rate-limit policy in
      `src/Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs`
      — add a `public const string SpaceCreateRateLimitPolicy = "space-create";` beside
      the existing policy constants (lines 16-28), and register it inside the existing
      `AddRateLimiter` block (lines 124-151) as a `GetFixedWindowLimiter`. Mirror the
      `AuthRateLimitPolicy` shape but **partition by the authenticated user id**, not IP:
      `RateLimitPartition.GetFixedWindowLimiter(httpContext.User.FindFirst(c => c.Type ==
      ClaimTypes.NameIdentifier)?.Value ?? httpContext.Connection.RemoteIpAddress?.ToString()
      ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window =
      TimeSpan.FromMinutes(1) })`. `ClaimTypes.NameIdentifier` is the id `UserContext` reads
      (`UserContext.cs:21`). Add a header comment matching the density of the existing
      policy comments (per-account, not per-IP: an office/NAT shares one IP and an
      authenticated attacker can rotate IPs, so IP-keying is the wrong granularity for
      FR-4).

- [x] move `app.UseRateLimiter()` in `src/Tidansu.API/Program.cs` to **after**
      `app.UseAuthentication()` / `app.UseAuthorization()` (it is currently at line 129,
      *before* auth at 131-132).
      ⚠️ **This is the trap that makes per-account limiting actually work.** The limiter's
      partition function reads `httpContext.User`, which is empty until `UseAuthentication`
      runs — left where it is, every user would fall into the `"unknown"`/IP fallback and
      FR-4 would silently degrade to per-IP. Placing it after `UseAuthorization` also means
      an unauthenticated caller is 401'd before consuming any per-account budget.
      ⚠️ Re-verify the existing IP-keyed limiters (auth / magic-link / billing-webhook)
      still fire after the move — they key on `RemoteIpAddress`/a constant (set by
      `UseForwardedHeaders` at line 97, independent of auth), so they will, but prove it in
      the drive, don't assume.

- [x] apply `[EnableRateLimiting(WebApplicationBuilderExtensions.SpaceCreateRateLimitPolicy)]`
      to `SpacesController.CreateSpace` in `src/Tidansu.API/Controllers/SpacesController.cs`
      (line 52), and add `[ProducesResponseType(StatusCodes.Status429TooManyRequests)]`
      beside the existing `ProducesResponseType` attributes (lines 48-51). Mirror
      `AuthController.cs:22,33` / `BillingController.cs:18`.
      ⚠️ Only `CreateSpace` — not `GetSpaces`/`GetSpace`/`UpdateSpaceFields`/`DeleteSpace`.
      FR-4 and the out-of-scope note limit this to space *creation*.

- [x] add a comment to the `Entity<Space>` block in
      `src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs:57-83` recording that
      `Space.Id` stays the **sole** globally-unique PK **by design** (no `HasKey` needed —
      EF convention keys on `Id`), and that as of **B-23** the value is **server-assigned
      by `ISpaceIdGenerator`** rather than client-supplied — which is what closes the
      cross-tenant collision/DoS/oracle at the tenancy root that the composite `(SpaceId,
      Id)` key on `Zone`/`Item` (see the blocks just below) closed one level down. State
      explicitly *why* `Space` is NOT `(UserId, Id)`: it is the FK principal for
      `Zone`/`Item`, so `Id` must stay uniquely constrained.

### EF migration

- [x] **No EF migration required — record this as a deliberate finding, not an omission.**
      The `TidansuDbContext` model is **unchanged**: `Space.Id` is still `nvarchar(64)`,
      still the sole PK, still a valid FK principal; no entity field is added, removed, or
      retyped. The entire change is that a *server-side generator* now supplies the value
      an existing column already held. The tech-lead EF-migration rule is satisfied
      vacuously because there is no model change to migrate.
      ⚠️ Confirm this by running `dotnet ef migrations add _Probe --project
      src/Tidansu.Infrastructure --startup-project src/Tidansu.API` on a scratch branch:
      it must generate an **empty** `Up`/`Down`. If it does not, the model changed more
      than intended — stop and diff `TidansuDbContextModelSnapshot.cs`. Delete the probe
      migration; do not commit it.

### Kiota / contract

- [x] **No Kiota regeneration required — record as a deliberate finding.** No DTO gains
      or loses a field; no route, verb, or response type changes. `CreateSpace` still
      returns `ApiOperationResult<SpaceDto>` and `SpaceDto` still carries `Id` — the
      client already deserializes it. `src/Tidansu.App/src/api/apiClient/` stays untouched.
      ⚠️ If the implementation ever does change a DTO, a regen becomes mandatory **and** you
      hit B-21 (`npm run build:api` is broken): boot the API and feed Kiota the swagger JSON
      manually. Never hand-edit `src/api/apiClient/`.

### Frontend — Stores

- [x] adopt the server-assigned id in `src/Tidansu.App/src/stores/useSpacesStore.ts`
      `createRemote` (lines 442-444) — currently `void api.create(space).catch(...)`
      **discards the response**. Change the success path to read the returned space's id
      and, if it differs from the local temp id, **reconcile** the temp id → server id
      everywhere the store keys by space id: the entry in `spaces.value`, `contentsLoaded`,
      `changeSets`, `saveTimers`, and `inFlight`. This single site covers every create
      caller (`addSpace:613-620`, `duplicateSpace:641-677`, and the starter-fridge seed at
      `~:515`), which is why the fix goes here and not in each caller.
      Exemplar: this store's own id/key-management patterns and the `handleCreateError`
      rollback (lines 222-231) it mirrors.
      ⚠️ **The FR-6 race — the whole reason the human flagged this decision.** A granular
      edit (add zone/item) staged before the create resolves would flush against the
      *temp* id and 404. Gate it: do not `scheduleSave`/`flush` a space whose create is
      still in flight (or has not yet reconciled its id). The initial `POST /api/spaces`
      already carries the whole graph, so there is nothing legitimate to flush before
      reconciliation — but the guard must be explicit, not incidental. This codebase has a
      history of exactly this class of ordering bug (see the store's BUG 2 / BUG 3 flush
      comments) — treat it with the same care.
      ⚠️ Keep the optimistic push synchronous and **before** the await, so "space appears
      immediately" (FR-6) is unchanged; only the *finalization* waits on the server.

- [x] confirm `src/Tidansu.App/src/data/spaces.ts` `uid()` (lines 39-41) is left
      **unchanged** — record as a deliberate keep. Under server-assigned ids the client
      still needs a transient local handle for the optimistic push (used by onboarding,
      seed, duplicate); its low entropy no longer matters because the server ignores it
      and assigns the real id. Removing it would break the optimistic-add flow. Confirm no
      other frontend code asserts a space id is globally unique or server-known before the
      create resolves (grep `uid('space')` and its consumers).

### Refactoring

- [x] `[refactor]` update the S-L2 residual note on the B-22 `DbUpdateException` clause in
      `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs` (the comment added by B-22,
      near the new `catch (DbUpdateException)`) if it states the space-id collision gap is
      *still open* — it is now closed by server assignment; correct it to say so and point
      at `ISpaceIdGenerator`. Scoped to a touched file only; leave the clause's byte-
      identical-500 behaviour exactly as B-22 left it (it is still the correct backstop for
      the CSPRNG-collision residual, and its no-oracle property is now reinforced, not
      weakened). If no such open-gap comment exists there, no change — record it.

- [x] No other refactoring in touched files. `CreateSpaceCommandHandler`, `SpaceDto`,
      `SpacesController`, `WebApplicationBuilderExtensions`, and the store are in good
      shape; resist widening scope. If none: "No further refactoring needed in touched
      files."

### Verification

- [x] `dotnet build` from `src/Tidansu.API` — green.
- [x] `dotnet test tests/Tidansu.Domain.Tests` — green. (No new Domain unit test is
      warranted: `ISpaceIdGenerator`'s impl lives in Infrastructure and depends on
      `RandomNumberGenerator`, so it is not a pure Domain rule, and there is no
      Infrastructure test project. The real gate is the manual drive below.)
- [x] `npm run build` from `src/Tidansu.App` (vue-tsc type-check) — green; proves the
      store reconcile change and the untouched contract type-check clean.
- [ ] **Manual end-to-end drive** (`run` / `verify` skills) against the running app:
      - **FR-1 / FR-3 (DoS + oracle — the headline, from § S-H1's checklist):** as a Pro
        user, `POST /api/spaces` with a body carrying `id: "space_1zzz"` (a value the old
        client would generate). Confirm the server **ignores** it — the created space's id
        in the response is a fresh server id, not `"space_1zzz"`. Then as a **different**
        account, create a space and confirm success with its own fresh server id. There is
        no longer any way to force or probe a specific id, so the 200-vs-500 split is gone.
        Confirm both accounts' spaces are intact and independent.
      - **FR-2 (no generic 500 for id reasons):** confirm normal creates return 200 with a
        server id; there is no id-collision path a client can trigger.
      - **FR-4 (rate limit):** from one account, issue > 20 `POST /api/spaces` within a
        minute → the excess return **429**; a second account in the same window is
        unaffected (per-account, not global/IP). Confirm ≤ 20/min succeed normally.
      - **FR-4 non-regression:** confirm the existing limiters still fire after the
        `UseRateLimiter` move — hammer `POST /api/auth/magic-link` (3/min per IP → 429) and
        a login endpoint (10/min → 429).
      - **FR-5 (continuity):** a representative sample — single-space Free, at-cap Free,
        over-cap read-only Free-after-downgrade (B-17), multi-space Pro with photos — all
        load, display, and edit/delete exactly as before. Confirm existing (client-id)
        spaces coexist with newly created (server-id) spaces. Confirm the `spaces` paywall
        still fires: a Free user creating a 3rd space gets `403 {plan:["spaces"]}` → paywall
        `reason: spaces`, and nothing is persisted.
      - **FR-6 (optimistic add + no new failure mode):** create a space via onboarding and
        confirm it appears immediately (before the server responds), then becomes fully
        usable — edit a zone/item right after creation and confirm the granular mutation
        lands (proving the id reconciled and the flush gate released, not a 404). Duplicate
        a space and confirm the same. Compare perceived speed to before — no new delay.
      - **Space delete cascade (FR-5):** delete a space and confirm its zones/items are
        gone (the unchanged `ON DELETE CASCADE` still fires — proves the PK/FK were left
        intact).

---

## 2. 🔒 Security Considerations

**S-1 — Client-supplied globally-unique `Space.Id` → cross-tenant DoS + existence oracle 🔴 Critical**
The finding this whole task exists to close (B-22 § S-H1). A Pro account (no space cap,
no rate limit) squats the low-entropy `uid('space')` range and forces other tenants'
first-space creation to a 500; the 200-vs-500 split is also an existence oracle.
- [ ] Mitigation: server-assign `Space.Id` from a CSPRNG (`ISpaceIdGenerator`) and ignore
      `dto.Id` on create — the attacker can neither choose nor probe an id. (Handler +
      generator tasks above.)

**S-2 — Unmetered space creation → resource-exhaustion abuse 🟠 High**
Even with ids unforgeable, unlimited unmetered creation (structurally cheap on uncapped
Pro) is open-ended platform abuse (FR-4).
- [ ] Mitigation: per-account fixed-window rate limit (20/min) on `POST /api/spaces`,
      partitioned by the authenticated user id (rate-limit tasks above).

**S-3 — Rate limiter silently degrading to per-IP 🟠 High**
If `UseRateLimiter` stays before `UseAuthentication`, `httpContext.User` is empty and the
per-account partition collapses to the IP fallback — an office/NAT shares one budget and
an attacker rotates IPs to dodge it.
- [ ] Mitigation: move `UseRateLimiter` after `UseAuthentication`/`UseAuthorization`;
      verify per-account partitioning in the drive (tasks above).

**S-4 — CSPRNG-collision residual leaking through a raw 500 🟢 Low**
An astronomically-rare id collision could surface a `DbUpdateException`.
- [ ] Mitigation: bounded regenerate-and-retry in the handler; the B-22 middleware clause
      maps any residual to a byte-identical generic 500 that (because the id was
      server-chosen) leaks nothing. No oracle re-opens.

**S-5 — Predictable id via non-CSPRNG generator 🟡 Medium**
Using `Guid.NewGuid()` or a clock/counter would reintroduce predictability, softening but
not closing the squatting attack.
- [ ] Mitigation: `SpaceIdGenerator` uses `RandomNumberGenerator` (≥ 128 bits), verified
      in review; do not substitute a plain GUID.

## 3. 📈 Scalability / Correctness Considerations

**C-1 — FR-6 optimistic-add race (temp id vs server id).** A granular mutation staged
before create resolves would flush against the temp id and 404 (silent data loss on
reload — the store's documented BUG-2/3 failure class).
- [ ] Mitigation: gate a space's autosave until its create resolves and its id reconciles;
      keep the optimistic push synchronous so "appears immediately" is unchanged.

**C-2 — No new EF read/write cost.** `Spaces.Id` PK/index and the child FKs are unchanged,
so no query plan, `AsNoTracking`, or N+1 characteristic shifts. The generator is O(1),
stateless, allocation-light.
- [ ] Confirm the empty-migration probe (no model change) and that create latency is
      unchanged (one extra 16-byte RNG draw).

**C-3 — Rate-limiter memory.** A per-user fixed-window limiter keeps one partition per
active user id for the window; bounded and self-expiring, same shape as the existing
per-IP limiters.
- [ ] No action; noted for completeness.

## 4. 📦 New Dependencies

No new dependencies required. `System.Security.Cryptography.RandomNumberGenerator` and
`System.Threading.RateLimiting` / `Microsoft.AspNetCore.RateLimiting` are already in use
(`JwtService.cs`, `WebApplicationBuilderExtensions.cs`).

## 5. ❓ Open Questions

1. **Rate-limit threshold (20/min per account).** Sized to clear onboarding + duplicate
   bursts with margin while capping abuse; looser than auth (10) / magic-link (3) because
   bulk creation is legitimate. Confirm 20 is comfortable for the heaviest real user
   (e.g. someone duplicating many spaces) before shipping; it is a one-line config const.
2. **Retry-on-collision worth the code?** Included as defense-in-depth, but a 128-bit
   CSPRNG collision is below hardware-failure odds and the middleware backstop already
   makes any residual a leak-free generic 500. The developer may drop it — record the
   choice. Not load-bearing for any FR.
3. **Should `dto.Id` be dropped from the create request contract entirely** (server
   ignores it anyway)? Out of scope here — removing the field is a DTO/Kiota change with no
   security benefit (the server already ignores it). Left as a possible future tidy-up;
   flag to the human only if the review wants the contract to stop advertising a field the
   server discards.
