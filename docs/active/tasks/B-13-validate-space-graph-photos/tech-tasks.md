# B-13 · Technical Tasks — Validate the space zone/item graph + photo content-type/size (S-2)

Source requirements: [`./requirements.md`](./requirements.md) (9 FRs, approved).

> **Revised after the human tech-planning gate.** Two rulings changed the plan:
> **(1)** the photo check **moves into the handlers** so the Free photo paywall
> (403 `{plan:["photos"]}`) still wins — FR-4 stands as written; **(2)** the
> `[RequestSizeLimit]` on `SpacesController` is **in scope** for this task.
> Also settled: reject `image/jpg`; 🔴 S-5 (never echo the payload) now applies to a
> hand-built error path. Everything in §🧭 below is decided — do not re-litigate.
> Values locked at the requirements gate: 5 MB raw / decoded cap; JPEG+PNG+WebP;
> 15 tags × 24 chars; no retroactive re-validation; FR-8 = B-19's job; FR-9 in.

---

## 🧭 Design decisions resolved up front

### D-0 · Correction: moving the check into the handler does **not** cost the test surface

**The coordinator was right and my earlier claim was wrong.** I had written that
handler-side placement "would cost us the Domain test surface." That conflated two
different things, and re-deriving it from the code confirms the pushback:

`PhotoPolicy.Check(string?) → PhotoRejection` is a **pure function of its argument**.
Testability is a property of *the function*, not of who calls it. `PlanPolicyTests`
proves the pattern — it tests `PlanPolicy` directly and never constructs a handler,
even though `PlanPolicy`'s only production callers *are* handlers
(`CreateSpaceCommandHandler.cs:31`, `UpdateSpaceCommandHandler.cs:30`). `PhotoPolicy`
is the identical shape, so `PhotoPolicyTests` — **including the mislabelled-
`<script>`-as-PNG regression case** — survives **completely untouched**. Only the
thin adapter changes: a FluentValidation rule becomes a handler-side call.

So: **`PhotoPolicy` stays in Domain exactly as designed in D-1; the tests stay; task 7
(`PhotoRuleExtensions`) is replaced by a handler-side guard.**

The real cost of moving — smaller, but genuine, and the developer must handle it:

1. **We hand-build the error keys.** FluentValidation's `RuleForEach` + `SetValidator`
   generated indexed `PropertyName`s (`Space.Items[3].Photo`) for free. The handler
   must construct that string itself to keep the contract identical (see **D-8.3**).
2. **The error message is hand-written**, which makes 🔴 **S-5** (echoing the attacker
   payload) *more* likely, not less — FluentValidation's defaults were safe by
   accident; a hand-built `$"..."` is not.
3. **The photo check no longer runs for free in the pipeline** — it runs per-save in
   the handler, on every debounced autosave (see **D-8.4**; null photos short-circuit).

### D-1 · How the photo is actually validated (unchanged)

**Seam:** a **pure, static Domain module** — `PhotoPolicy` — mirroring
`src/Tidansu.Domain/Constants/PlanPolicy.cs` (pure inputs in, reason or `None` out; no
DB, no mocks; table-driven tests in `tests/Tidansu.Domain.Tests`, the repo's **only**
automated test project). It is a **deep module**: one function on the interface, all of
the data-URL parsing / base64 arithmetic / signature sniffing behind it.

```csharp
// Tidansu.Domain/Constants/PhotoPolicy.cs
public enum PhotoRejection { None, Empty, Malformed, DisallowedType, NotAnImage, TooLarge }
public static class PhotoPolicy
{
    public static PhotoRejection Check(string? photo);
}
```

`Check(null) == PhotoRejection.None` — **a null/absent photo is valid** (most items
have none; `ItemDto.Photo` is `string?` and `spaceMapping.ts:39` sends `photo: null`).

**Order of checks — cheap rejects strictly before expensive ones. No step allocates a
large buffer; nothing ever materialises a multi-MB `byte[]`:**

| # | Check | Reject as | Cost |
|---|-------|-----------|------|
| 1 | `photo is null` → **accept** (return `None`) | — | O(1) |
| 2 | `string.IsNullOrWhiteSpace(photo)` | `Empty` | O(1) |
| 3 | **`photo.Length > MaxDataUrlChars`** — reject on *string length* before touching content | `TooLarge` | O(1) |
| 4 | `photo.StartsWith("data:", Ordinal)` | `NotAnImage` | O(1) |
| 5 | comma found **within the first 64 chars** (`photo.AsSpan(0, min(64, len)).IndexOf(',')`) | `Malformed` | O(1) |
| 6 | header ends with `;base64` (OrdinalIgnoreCase) | `NotAnImage` | O(1) |
| 7 | media type ∈ { `image/jpeg`, `image/png`, `image/webp` } (OrdinalIgnoreCase) | `DisallowedType` | O(1) |
| 8 | payload length > 0 and `% 4 == 0` | `Malformed` | O(1) |
| 9 | **arithmetic decoded size** `payloadLen / 4 * 3 - padCount` > `MaxPhotoBytes` | `TooLarge` | O(1) |
| 10 | base64 charset/padding scan over the payload span (allocation-free) | `Malformed` | O(n), no alloc |
| 11 | decode **first 16 base64 chars → 12 bytes**; sniff signature; must be allow-listed **and match the declared media type** | `NotAnImage` | O(1) |

Steps the developer must not simplify away:

- **Step 1 must be the first statement.** It is the overwhelmingly common case and the
  hot path now that this runs per-save in the handler (see **D-8.4**).
- **Step 3 is the load-bearing cheap reject.** `MaxPhotoBytes = 5 * 1024 * 1024 =
  5_242_880`. Base64 length for N bytes is `4 * ceil(N/3)` = `4 * 1_747_627` =
  **6_990_508** chars. `MaxDataUrlChars = 6_990_508 + 32` (slack for the longest allowed
  prefix, `data:image/jpeg;base64,` = 23 chars). Anything longer is *definitely* over
  the decoded cap → rejected without parsing or decoding. Step 9 is the *exact* cap, so
  base64's ~33% inflation never counts against the user (FR-5's "decoded size").
- **Step 5 bounds the comma search.** A naive `photo.IndexOf(',')` scans up to ~7 MB.
- **Parse with `ReadOnlySpan<char>`, never a regex** (ReDoS — 🟠 S-3).
- **Step 11 is what makes the check non-spoofable.** The declared MIME prefix is
  client-controlled and trivially forged; requiring the *sniffed* signature to be
  allow-listed **and** to agree with the declared type rejects
  `data:image/png;base64,<html>`. `javascript:` fails at step 4; `data:text/html;base64,…`
  and `data:image/svg+xml;base64,…` fail at step 7 (SVG deliberately excluded).
- **`image/jpg` is NOT accepted** (human ruling) — only `image/jpeg`. It is not a
  registered MIME type; no browser or camera emits it.

**Exact byte signatures** (need first 12 bytes → first 16 base64 chars):

| Type | Signature |
|------|-----------|
| JPEG | `FF D8 FF` at offset 0 (3 bytes) |
| PNG  | `89 50 4E 47 0D 0A 1A 0A` at offset 0 (8 bytes) |
| WebP | `52 49 46 46` (`"RIFF"`) at offset 0 **and** `57 45 42 50` (`"WEBP"`) at offset 8 (bytes 4–7 are the little-endian file size — do **not** check them) |

**Scope of the guarantee — put this in a code comment.** Sniffing proves the *header*
is an allow-listed raster image; it does not prove the whole payload decodes. That is
the correct trade: the S-2 threat is script-bearing content rendered as an `<img>`
source, fully closed by steps 4–11. A corrupt JPEG merely fails to render — a UX nit,
not a security hole. Full decode would need an imaging library (**D-5**) and is itself
a DoS amplifier.

### D-8 · **NEW** — Where the photo check goes now (the part that actually changed)

#### D-8.1 · Ordering in `CreateSpaceCommandHandler` — after the plan gate, **outside** the app-lock

Current shape (`CreateSpaceCommandHandler.cs`): resolve user → `CountByUserAsync` →
`PlanPolicy.CheckNewSpace` → `throw PlanLimitException` → `dto.ToEntity` →
`AddWithinSpaceCapAsync` (B-12's `sp_getapplock` critical section) *or* `AddAsync`.

Insert the photo guard **between the plan gate and `dto.ToEntity(userId)`**:

```
1. userId / user  (unchanged)
2. existingCount = await spaces.CountByUserAsync(...)          (unchanged)
3. PlanPolicy.CheckNewSpace(...) → throw PlanLimitException    ← 403 WINS (unchanged)
4. SpacePhotoGuard.ThrowIfInvalid(dto);                        ← NEW · 400 · pure, no I/O
5. var entity = dto.ToEntity(userId);                          (unchanged)
6. AddWithinSpaceCapAsync (sp_getapplock) | AddAsync           (unchanged — B-12 untouched)
```

**Why step 4 sits exactly there:**
- **After step 3** → a Free user sending *any* photo, valid or invalid, still gets
  **403 `{plan:["photos"]}`**. `PlanPolicy.CheckNewSpace` counts `Photo is not null`
  and returns `Photos` before the guard ever inspects a byte. FR-4 holds as written.
- **Before step 6** → the guard is **completely outside** B-12's app-lock. The lock
  lives *inside* `SpacesRepository.AddWithinSpaceCapAsync`, so simply calling the guard
  before that method guarantees we never hold a per-user DB lock while scanning N
  photos. **Do not move the guard into the repository or "inline" it near the lock.**
- **Before any write** → nothing is persisted on rejection (FR-6).

#### D-8.2 · Ordering in `UpdateSpaceCommandHandler` — after the plan gate, **before mutating the tracked entity**

```
1. existing = await spaces.GetByIdAsync(...) ?? throw NotFound   (unchanged)
2. user = await userService.FindByIdAsync(...)                   (unchanged)
3. before/after SpaceUsage; PlanPolicy.CheckSpaceMutation(...)
   → throw PlanLimitException                                    ← 403 WINS (unchanged)
4. SpacePhotoGuard.ThrowIfInvalid(dto);                          ← NEW · 400 · pure, no I/O
5. existing.Name = dto.Name; … (mutate scalars)                  (unchanged)
6. ReplaceAsync(...)                                             (unchanged)
```

**Why before step 5 specifically:** `existing` is an **EF-tracked entity**. Mutating it
and *then* throwing leaves dirtied tracked state on a scoped `DbContext`. Nothing calls
`SaveChanges` afterwards on this path today, so it is not a live bug — but throwing
before any mutation costs nothing and removes the trap entirely. The downgrade rule
(`CheckSpaceMutation`: over-cap content stays editable) is untouched.

#### D-8.3 · The exception — reuse `Tidansu.Domain.Exceptions.ValidationException`. **Do not invent a new type.**

It already exists and already maps to a clean, field-named 400:

```csharp
// Tidansu.Domain/Exceptions/ValidationException.cs
public class ValidationException(Dictionary<string, string[]> errors) : Exception(...)
{ public Dictionary<string, string[]> Errors { get; } = errors; }
```

**The contract provably does not fork.** `ValidationBehavior.cs:28-32` — the
FluentValidation pipeline behavior — does exactly this and nothing more:

```csharp
var errors = failures.GroupBy(f => f.PropertyName)
    .ToDictionary(g => g.Key, g => g.Select(f => f.ErrorMessage).Distinct().ToArray());
throw new ValidationException(errors);
```

`ErrorHandlingMiddleware.cs:15-33` then camel-cases the keys and writes
`ApiOperationResult { IsSuccess = false, Errors = … }` → **400**. A handler throwing the
same exception with the same key format produces a **byte-identical response shape**.
There is precedent for throwing it outside a validator: `UserService.cs:39,53` and
`StripeBillingService.cs:153`.

**⚠️ Error-key format — I got this wrong in the first draft; the developer must not
repeat it.** `StringExtensions.ToCamelCase` (`src/Tidansu.API/Extensions/StringExtensions.cs:5-13`)
lowercases **only the first character** — it does not touch the rest of the path. So:

| Handler-side key | Key on the wire |
|---|---|
| `Space.Items[3].Photo` | `space.Items[3].Photo` |

**not** `space.items[3].photo`. Build the key as `$"Space.Items[{i}].Photo"` to match
FluentValidation's `PropertyName` for the same field exactly.

**Kiota:** throwing `ValidationException` changes **no** contract — it is a runtime 400
in the existing error shape, already declared by `[ProducesResponseType(400)]` on both
actions. **This part needs no regen.** (Regen *is* needed for a different reason — see
**D-4**.)

#### D-8.4 · The shared helper — one loop, both handlers

Do **not** duplicate the loop. Add one Application-layer static:

```csharp
// src/Tidansu.Application/Spaces/Dtos/SpacePhotoGuard.cs
internal static class SpacePhotoGuard
{
    // Throws ValidationException naming every offending item; no-op when all photos are
    // valid/absent. Pure — no I/O, no DB, safe to call outside any lock.
    public static void ThrowIfInvalid(SpaceDto space);
}
```

Both handlers call it as a **single line**. It iterates `space.Items` (items are a flat
list on `SpaceDto` with a loose `ZoneId` — there is no per-zone nesting to walk), calls
`PhotoPolicy.Check(item.Photo)` per item, and **collects every offender** into the
dictionary before throwing once — matching `ValidationBehavior`'s "group all failures"
semantics rather than failing fast on the first.

**Cost — this now runs on every debounced autosave (400 ms, `useSpacesStore`).**
Because saves are whole-graph replaces, *every* item is re-checked on *every* save.
This is acceptable **only** because of the D-1 ordering: `Photo is null` — the
overwhelmingly common case, and currently *every* case, since the SPA has no capture
flow — short-circuits at step 1 to a **single null comparison**. A 50-item photo-less
space costs ~50 null checks per save: nanoseconds, no allocation. Confirmed near-free.
The expensive steps only ever run on items that actually carry a photo.

#### D-8.5 · The split — **only the photo check moves.** Everything else stays in FluentValidation.

| Rule | FR | Where | Why |
|---|---|---|---|
| Zone/item field lengths | FR-1 | **FluentValidation** (`ZoneDtoValidator`, `ItemDtoValidator`) | Not plan-gated — a 400 is correct on any plan |
| Space `Type`/`ViewMode`/`CanvasMode` | FR-2 | **FluentValidation** (`SpaceDtoValidator`) | Same |
| Tag count / length | FR-3 | **FluentValidation** (`ItemDtoValidator`) | Same — tags are not a gated capability |
| Rect sanity | FR-9 | **FluentValidation** (`RectDtoValidator`) | Same |
| **Photo type / content / size** | **FR-4, FR-5** | **Handler** (`SpacePhotoGuard`) | **Plan-gated** — must run *after* the 403 |

The developer must **not** move the field-length or tag rules into the handler. Only
FR-4/FR-5 move, and only because photos are the one plan-gated field.

**Known residual (accepted, not an open question):** a Free user whose payload has a
photo *and* an unrelated over-long field (e.g. a 201-char item name) gets **400**, not
403 — the FluentValidation pipeline still runs first for the non-photo rules. That is
correct: the request is malformed for reasons independent of plan. The ruling
("Free + photo → 403") holds for every payload that is otherwise well-formed.

### D-9 · **NEW** — `[RequestSizeLimit]` on `SpacesController`: **24 MB**, following B-9

Human ruling: include it. Following the B-9 precedent
(`docs/active/tasks/B-9-harden-stripe-webhook/tech-tasks.md:79-105`), which used
`[RequestSizeLimit(512 * 1024)]` + `[ProducesResponseType(413)]` on the webhook.

**The number, justified:**
- The **non-photo graph is negligible**: ~50 items × ~300 B + zones ≈ well under
  100 KB; even a 500-item space is ~200 KB. **Photos dominate the payload entirely.**
- One max-size photo = 5 MB raw → **~6.99 MB** as a base64 data URL. Base64's charset
  (`A–Z a–z 0–9 + / =`) needs no JSON string escaping, so there is no further inflation.
- `24 MB (25_165_824)` ≈ **3 max-size photos (20.97 MB) + ~4 MB headroom** for the rest
  of the graph.
- It sits **below Kestrel's ~28.6 MB global default**, so it is genuinely the binding
  constraint rather than a no-op.
- **Zero regression risk:** the SPA has **no photo-capture flow**, so there are
  effectively **no photos in production today**. Nothing existing can trip this.
- **Honest caveat the developer should record in a comment:** because save is a
  whole-graph replace, *every* photo is re-sent on *every* autosave — so any per-request
  cap here also caps *photographed items per space* (~3 at full size) until **B-16**
  moves photos off-row. That cliff exists at ~4 photos today anyway via Kestrel's
  default; this moves it slightly and makes it explicit and clean (413, not a hang).
  This is precisely SC-1/SC-3 → **B-14/B-16**, and is not solved here.

**Error shape is already correct** — no middleware change needed, unlike B-9.
`ErrorHandlingMiddleware.cs:141-162` **already** catches `BadHttpRequestException` (B-9
added it) and returns `ex.StatusCode` (413) in the standard `ApiOperationResult` shape,
logging status code only. Note the mechanism differs slightly from B-9's: the webhook
reads the body manually, whereas `SpacesController` **model-binds** `[FromBody] SpaceDto`,
so Kestrel's cap fires during model binding — same exception, same catch clause, same
413.

### D-2 · Do the DTOs need to change? — **No.**

`SpaceDto`/`ZoneDto`/`ItemDto`/`RectDto` already carry every field the rules bound, with
the right nullability (`ItemDto.Photo` is `string?`; `Expiry`/`Icon`/`Label` nullable;
`Tags` is `List<string>`). This task adds **validation only**. The brief lists the DTOs
as touch-points because they are what gets *validated*, not what gets *changed*.

### D-3 · Does `TidansuDbContext` need a photo-column change? — **No. `Photo` stays `nvarchar(max)`.**

`TidansuDbContext.cs:104` already documents the intent. Capping the column would be
actively wrong:

- It would **violate FR-7** — an `nvarchar(max)` → `nvarchar(n)` migration fails or
  truncates on existing over-size rows: exactly the retroactive punishment FR-7 forbids.
- It converts a clean 400 into a `DbUpdateException` **500** — the failure mode **FR-6
  exists to eliminate**.
- **B-16 may move photos off the row entirely.** Don't over-invest.

### D-4 · Migration? — **NO.** · Kiota regen? — **YES** (revised; one narrow reason)

- **EF migration: NO.** No entity field added/removed/changed; no `TidansuDbContext`
  model change (**D-3**). Validation and handler guards are runtime behaviour, invisible
  to the EF model. The "every model change needs a migration" rule does not fire because
  there is no model change. **Do not run `dotnet ef migrations add`.**
- **Kiota regen: YES — and my first draft called this wrong.** The validation work alone
  changes nothing (same routes, same `[FromBody] SpaceDto`, same response DTOs, same
  400). **But D-9 adds `[ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]`,
  and `ProducesResponseType` attributes *are* emitted into the OpenAPI document**, which
  Kiota generates from. The proof is in the working tree right now: B-9 added
  `[ProducesResponseType(413)]`/`(429)` to `BillingController` and
  `src/Tidansu.App/src/api/apiClient/api/billing/webhook/index.ts` shows up **modified**
  in `git status`. So the regen is required, caused **solely** by the 413 attribute.
  - *If the human prefers zero client churn:* drop the `[ProducesResponseType(413)]`
    attribute and keep `[RequestSizeLimit]` — the 413 is still returned at runtime, the
    swagger doc doesn't move, and no regen is needed. The attribute only documents it.
    Planned as **keep the attribute + regen**, matching B-9.

### D-5 · New dependency? — **No.**

The repo has **zero** image handling today (the only `Convert.ToBase64String` calls are
`JwtService.cs:51,57` — token encoding, unrelated). Sniffing is ~30 lines of
`Span<byte>` comparison. Rejected: **SixLabors.ImageSharp** (v3+ commercial licensing —
the same class of trap B-11 hit with AutoMapper — plus a full decode is a DoS
amplifier), **SkiaSharp** (native runtime deps for a 30-line need).
`Convert.TryFromBase64Chars` in the BCL covers the only decode we need. `[RequestSizeLimit]`
and `BadHttpRequestException` are framework, already in use (B-9).

### D-6 · FR-9 (rect sanity) — **included; genuinely near-free.**

Two `.Must()` lines on a `RectDtoValidator` we create anyway. Context: `NaN`/`Infinity`
are not valid JSON numbers and `System.Text.Json` rejects them at deserialisation, so
the rule's real value is the **negative width/height** case. `double.IsFinite` + `>= 0`
covers both.

### D-7 · Empty-string photo — **moot now (human ruling confirmed).**

Re-derived against the new ordering: `PlanPolicy` counts photos as `Photo is not null`,
so `""` **counts as a photo** and the plan gate fires first. Therefore:

- **Free + `""` → 403 `{plan:["photos"]}`** — the guard never runs. No behaviour change
  from today. ✅ The 403→400 flip I flagged as OQ-2 **cannot happen**; the question is
  closed by the handler-side placement.
- **Pro + `""` → 400** (`PhotoRejection.Empty`), per FR-4's "reject silently-empty …
  the same way as a disallowed type". Safe: `spaceMapping.ts:39` emits
  `photo: i.photo ?? null`, never `""`.

---

## 📋 Technical Tasks

### Backend — Domain

- [x] **add** `PhotoRejection` enum + `PhotoPolicy` static class in
      `src/Tidansu.Domain/Constants/PhotoPolicy.cs`
      (new file, alongside `PlanPolicy.cs`/`PlanCaps.cs`; pure + static, no DI, no EF —
      the deep module from **D-1**. Implements checks 1–11 in exactly that order, step 1
      first. Enum rather than `PlanPolicy`'s `string?` because these reasons are **not**
      wire values — unlike `PlanLimitReasons`, nothing on the client keys off them.)
- [x] **add** the cap/allow-list constants in the same file:
      `MaxPhotoBytes = 5 * 1024 * 1024` (5_242_880), `MaxDataUrlChars = 6_990_508 + 32`,
      `MaxTags = 15`, `MaxTagLength = 24`
      (single source of truth, mirroring `PlanCaps`. Derive `MaxDataUrlChars` with a
      comment showing the `4 * ceil(N/3)` arithmetic so a future cap change can't
      silently desync the two constants.)
      🔒 blocked by: `PhotoPolicy.cs` created
- [x] **add** `PhotoPolicyTests` in `tests/Tidansu.Domain.Tests/PhotoPolicyTests.cs`
      (new file; follow `PlanPolicyTests.cs`'s `[Theory]`/`[InlineData]` table-driven
      shape — "the interface is the test surface". **Unaffected by the handler move — see
      D-0.** Cover at minimum: `null` → `None`; `""`/whitespace → `Empty`; real 1×1 PNG
      → `None`; JPEG `FF D8 FF` → `None`; WebP RIFF/WEBP → `None`;
      `data:image/svg+xml;base64,…` → `DisallowedType`; `data:text/html;base64,…` →
      `DisallowedType`; **`image/jpg` → `DisallowedType`**; `javascript:alert(1)` →
      `NotAnImage`; **`data:image/png;base64,<base64 of "<script>alert(1)</script>">` →
      `NotAnImage`** (the mislabel case — the S-2 regression test); over-length string →
      `TooLarge`; non-base64 charset → `Malformed`.)
      🔒 blocked by: `PhotoPolicy` + constants

### Backend — Application

- [x] **add** `RectDtoValidator : AbstractValidator<RectDto>` in
      `src/Tidansu.Application/Spaces/Dtos/RectDtoValidator.cs`
      (FR-9 — `double.IsFinite` on X/Y/W/H; `W`/`H` `>= 0`. See **D-6**. Stays in
      FluentValidation per **D-8.5**.)
- [x] **add** `ZoneDtoValidator : AbstractValidator<ZoneDto>` in
      `src/Tidansu.Application/Spaces/Dtos/ZoneDtoValidator.cs`
      (FR-1 — `Id` NotEmpty + `MaximumLength(64)`, `Label` 120, `Color` 16, `Kind` 16,
      `Facing` 16. **Verified against `TidansuDbContext.cs:85-92` — copy those numbers,
      do not tighten them.** `Label` is `string?`: `MaximumLength` skips nulls, correct
      here. Wire `RuleFor(z => z.Rect).SetValidator(new RectDtoValidator())` inside
      `When(z => z.Rect is not null, …)`.)
      🔒 blocked by: `RectDtoValidator`
- [x] **add** `ItemDtoValidator : AbstractValidator<ItemDto>` in
      `src/Tidansu.Application/Spaces/Dtos/ItemDtoValidator.cs`
      (FR-1/FR-3 **only — no photo rule here**, per **D-8.5**. `Id` NotEmpty + 64, `Name`
      NotEmpty + 200, `ZoneId` NotEmpty + 64, `DateAdded` NotEmpty + 40, `Expiry` 40,
      `Depth` NotEmpty + 16, `Icon` 40 — **verified against `TidansuDbContext.cs:94-105`**.
      Tags: `RuleFor(i => i.Tags).Must(t => t.Count <= PhotoPolicy.MaxTags)` +
      `RuleForEach(i => i.Tags).MaximumLength(PhotoPolicy.MaxTagLength)`.)
      🔒 blocked by: `PhotoPolicy` constants
- [x] **add** `SpaceDtoValidator : AbstractValidator<SpaceDto>` in
      `src/Tidansu.Application/Spaces/Dtos/SpaceDtoValidator.cs`
      (FR-2 — `Id` NotEmpty + 64, `Name` NotEmpty + 120, `Type` NotEmpty + **16**
      (currently NotEmpty only), `ViewMode` NotEmpty + 16, `CanvasMode` NotEmpty + 16
      (**currently unvalidated entirely** — and because the entity types them
      non-nullable (`Space.cs:14-15`), a missing `viewMode` is a 500 today; `NotEmpty` is
      safe because `spaceMapping.ts:68-80` always sends both from the typed `Space`).
      Then `RuleForEach(s => s.Zones).SetValidator(new ZoneDtoValidator())` and
      `RuleForEach(s => s.Items).SetValidator(new ItemDtoValidator())` — this is what
      produces the indexed, field-attributed keys FR-6 requires,
      e.g. **`space.Items[3].Name`**.)
      🔒 blocked by: `ZoneDtoValidator`, `ItemDtoValidator`
- [x] **add** `SpacePhotoGuard` static class in
      `src/Tidansu.Application/Spaces/Dtos/SpacePhotoGuard.cs`
      **(replaces the `PhotoRuleExtensions.MustBeAValidPhoto()` task from the previous
      draft — see D-0/D-8.4.)**
      (One `ThrowIfInvalid(SpaceDto space)` method: loop `space.Items`, call
      `PhotoPolicy.Check(item.Photo)`, **collect every offender**, then throw a single
      `Tidansu.Domain.Exceptions.ValidationException` keyed
      **`$"Space.Items[{i}].Photo"`** (matching FluentValidation's `PropertyName` format
      exactly — **D-8.3**; note `ToCamelCase` lowercases only the first char). Pure, no
      I/O — safe to call outside any lock. **🔴 Each `PhotoRejection` maps to a FIXED
      const message. Never interpolate the photo value — see S-5.**)
      🔒 blocked by: `PhotoPolicy`
- [x] **modify** `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs`
      — insert `SpacePhotoGuard.ThrowIfInvalid(dto);` **after** the
      `PlanPolicy.CheckNewSpace` gate (line ~31) and **before** `dto.ToEntity(userId)`
      (line ~36)
      (**D-8.1** — 403 wins for Free; the guard stays **outside** B-12's
      `AddWithinSpaceCapAsync` / `sp_getapplock` critical section. Do **not** touch the
      cap-race path. Add a short comment saying why the ordering is load-bearing.)
      🔒 blocked by: `SpacePhotoGuard`
- [x] **modify** `src/Tidansu.Application/Spaces/Commands/UpdateSpace/UpdateSpaceCommandHandler.cs`
      — insert `SpacePhotoGuard.ThrowIfInvalid(dto);` **after** the
      `PlanPolicy.CheckSpaceMutation` gate (line ~31) and **before** the
      `existing.Name = dto.Name;` block (line ~34)
      (**D-8.2** — 403 wins; throwing before mutating the EF-tracked `existing` avoids
      leaving dirtied tracked state on the scoped `DbContext`.)
      🔒 blocked by: `SpacePhotoGuard`
- [x] `[refactor]` **modify** `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandValidator.cs`
      to `RuleFor(c => c.Space).NotNull()` + `SetValidator(new SpaceDtoValidator())`,
      deleting the duplicated inline `Id`/`Name`/`Type` rules and the `When(...)` block
      (DRY: Create and Update hand-copy the same rules and have already drifted — Create
      checks `Space.Id`, Update doesn't. Error keys unchanged → not a contract change.)
      🔒 blocked by: `SpaceDtoValidator`
- [x] `[refactor]` **modify** `src/Tidansu.Application/Spaces/Commands/UpdateSpace/UpdateSpaceCommandValidator.cs`
      the same way, keeping the existing `RuleFor(c => c.Id).NotEmpty()` route-id rule
      (also closes the drift — Update gains the `Space.Id` check for free.)
      🔒 blocked by: `SpaceDtoValidator`

### Backend — Infrastructure

- [x] **No change.** Do **not** alter `TidansuDbContext`'s `Photo` column (**D-3**).
      Optionally extend the existing `// Photos may be data URLs — leave Photo as
      nvarchar(max)` comment with "size/type enforced by `PhotoPolicy` at write time
      (B-13)" so the next reader finds the seam.
- [x] **No EF migration** (**D-4**). Explicitly: do not run `dotnet ef migrations add`.
- [x] **Do not touch** `SpacesRepository.AddWithinSpaceCapAsync` — B-12's app-lock path
      is deliberately untouched (**D-8.1**).

### Backend — API

- [x] **modify** `src/Tidansu.API/Controllers/SpacesController.cs` — add
      `[RequestSizeLimit(24 * 1024 * 1024)]` (25_165_824) and
      `[ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]` to **both**
      `CreateSpace` (`[HttpPost]`) and `UpdateSpace` (`[HttpPut("{id}")]`)
      (**D-9** — number justified there; follows B-9's `BillingController.cs:17` shape.
      Attributes only — the controller stays thin, no logic. **No middleware change
      needed**: `ErrorHandlingMiddleware.cs:141-162` already maps
      `BadHttpRequestException` → its real 4xx (413) in the standard `ApiOperationResult`
      shape, logging status code only. Leave `[Authorize]` and the MediatR dispatch as-is.)

### Frontend — API client

- [x] **regenerate the Kiota client** — `npm run build:api` from `src/Tidansu.App`,
      after a fresh `dotnet build` of the API so the swagger DLL is current
      (**D-4** — required **solely** because `[ProducesResponseType(413)]` lands in the
      OpenAPI doc; B-9's identical change shows as a modified
      `src/Tidansu.App/src/api/apiClient/api/billing/webhook/index.ts` in the working
      tree. Expect a **small, 413-only diff** under `src/api/apiClient/api/spaces/`; if
      the diff is larger than that, stop and investigate rather than committing churn.
      **Never hand-edit `src/api/apiClient/`.** If `swagger tofile` misbehaves, use the
      running-app fallback for the swagger fetch.)
      🔒 blocked by: the `SpacesController` task

### Frontend — Composables/Stores

- [x] **No change — verify only.** Confirm `handleSyncError`
      (`src/Tidansu.App/src/stores/useSpacesStore.ts:58-67`) still behaves for a
      validation 400 **and** the new 413: `planReasonOf(error)` returns null for both, so
      it falls to `console.error` **without** calling `hydrate(true)` — the user's
      optimistic local edit is **not reverted**, and **no false "saved" state** is shown
      (there is no save/sync indicator anywhere in the SPA — `Saved`/`isSaving`/`savedAt`
      all return nothing). **FR-8 Phase 1 is met by changing nothing here.** Do not build
      a notification path — **B-19** owns that. Just don't regress it.

### Refactoring

- [x] Covered inline — the two `[refactor]`-tagged validator tasks collapse the
      duplicated, already-drifted inline rules into the shared `SpaceDtoValidator`.
      Scope limited to touched files; no unrelated refactors.

---

## 🔒 Security Considerations

- 🔴 **S-1 · Stored XSS via a non-image data URL rendered as an `<img>` source.** The
  S-2 finding itself: `Item.Photo` is an unvalidated `nvarchar(max)` rendered as an
  image source; `data:image/svg+xml` (XML, can carry `<script>`),
  `data:text/html;base64,…` and `javascript:` are all accepted today.
  - [ ] Mitigate: `PhotoPolicy` steps 4–7 + 11 (**D-1**), invoked from both handlers via
        `SpacePhotoGuard` (**D-8**). SVG deliberately excluded.
- 🔴 **S-5 · Attacker payload echoed into the response or the log — HIGHER RISK NOW.**
  **Read this before writing `SpacePhotoGuard`.** In the previous design FluentValidation's
  default messages were safe *by accident*. The guard now builds messages **by hand**,
  which is exactly where a `$"Invalid photo: {item.Photo}"` creeps in — that would
  reflect ~7 MB of attacker-controlled content into the 400 body **and** into Serilog
  via `ErrorHandlingMiddleware.cs:32`, which logs the `ValidationException`.
  - [ ] Mitigate: map each `PhotoRejection` to a **fixed `const string`** (e.g. "Photo
        must be a JPEG, PNG or WebP image."). **Never** interpolate the photo value,
        never `{PropertyValue}`, never log `item.Photo`. The *key*
        (`Space.Items[3].Photo`) carries the attribution — the *message* carries no data.
        Precedent: `ErrorHandlingMiddleware.cs:146` ("Never log the body or ex.Message —
        it could echo an attacker payload") and `StripeBillingService.cs:151`.
- 🟠 **S-2 · Spoofed content type (polyglot / mislabelled payload).** A client-declared
  `data:image/png;base64,` prefix is trivially forged.
  - [ ] Mitigate: step 11 requires **declared type == sniffed signature**. Covered by the
        `<script>alert(1)</script>`-as-PNG test case.
- 🟠 **S-3 · ReDoS / latency amplification parsing the data URL.** A regex, or an
  unbounded `IndexOf(',')`, over a ~7 MB attacker-controlled string burns CPU per
  request — now per *item* per *autosave*.
  - [ ] Mitigate: ordinal `ReadOnlySpan<char>` only, **no regex**; comma search bounded
        to 64 chars (step 5); length reject (step 3) before any parsing.
- 🟠 **S-4 · Memory amplification via decode-before-check.**
  - [ ] Mitigate: enforce the **D-1** order — length reject (3) → arithmetic decoded size
        (9) → only then a **12-byte** header decode (11). No multi-MB buffer ever.
- 🟠 **S-8 · NEW — unbounded request body on an authenticated endpoint.** `SpacesController`
  has no body cap today; Kestrel's ~28.6 MB default is the only bound.
  - [ ] Mitigate: `[RequestSizeLimit(24 MB)]` on both mutating actions (**D-9**), → 413
        via the existing `BadHttpRequestException` catch. Rejected by Kestrel during
        model binding, so the handler never runs.
- 🟡 **S-6 · Unbounded tag list as a storage-growth vector.** `Tags` is a JSON primitive
  collection with no DB limit.
  - [ ] Mitigate: FR-3's 15 × 24 bound in `ItemDtoValidator`.
- 🟢 **S-7 · No plan-cap regression — now structurally guaranteed.** The handler-side
  placement means the plan gate is *strictly upstream* of the photo check in both
  handlers (**D-8.1/D-8.2**). Free + photo → 403 `{plan:["photos"]}`, valid or invalid.
  - [ ] Verify (not implement): Free photo gate still 403 `photos`; downgrade rule
        (over-cap content stays editable) still holds; B-12's cap-race path untouched.

---

## 📈 Scalability / Correctness Considerations

- **The guard runs per-save in the handler now, not once in the pipeline.** Every
  debounced autosave re-checks every item (whole-graph replace).
  - [ ] Keep step 1 (`photo is null` → accept) as the **first statement** so the common
        — currently *universal* — case is a single null comparison (**D-8.4**).
  - [ ] Keep `PhotoPolicy.Check` allocation-free; do not "simplify" it into a full
        `Convert.FromBase64String`.
- **The step-10 charset scan is O(n).** It runs only after steps 3 and 9 have bounded n
  at ≤ ~7 MB → bounded, allocation-free linear scan.
  - [ ] Ensure step 10 runs **after** steps 3 and 9, never before.
- **The guard must never run inside B-12's app-lock.** Holding a per-user
  `sp_getapplock` while scanning N photos would serialise concurrent saves behind a
  CPU-bound scan.
  - [ ] Verify the guard is called *before* `AddWithinSpaceCapAsync`, and that nothing
        photo-related leaks into `SpacesRepository` (**D-8.1**).
- **Aggregate photo weight is now partially bounded** by D-9's 24 MB cap — but the real
  fix (photos off-row / diffed updates) remains **B-14/B-16**. Because save is a
  whole-graph replace, every photo is re-sent on every autosave; the cap therefore also
  caps photographed-items-per-space at ~3 full-size until B-16.
  - [ ] Record that trade-off in a comment next to `[RequestSizeLimit]`; do not attempt
        to solve it here.
- **No EF/N+1 or query surface is touched.** This task adds zero DB access.

---

## 📦 New Dependencies

**No new dependencies required** (**D-5**). ImageSharp (licensing + full-decode DoS) and
SkiaSharp (native deps) considered and rejected. `Convert.TryFromBase64Chars`,
`[RequestSizeLimit]` and `BadHttpRequestException` are framework, already in use.
`tests/Tidansu.Domain.Tests` already references xUnit — `PhotoPolicyTests` needs nothing.

---

## ✅ Verification Tasks (no automated suite — drive it)

There is **no photo-capture flow in the SPA** (nothing consumes `ItemDetailModal`'s
`addPhoto` emit), so photo paths **cannot** be driven through the UI. Craft requests by
hand, per the B-12 precedent
(`docs/active/tasks/B-12-close-space-cap-race/tech-tasks.md:223-237`).

- [x] `dotnet build` green.
- [x] `dotnet test tests/Tidansu.Domain.Tests` green — **the primary verification for
      `PhotoPolicy`**, and (per **D-0**) unaffected by the handler move.
- [x] `npm run build` (vue-tsc) green — **after** the Kiota regen.
- [x] **Kiota diff review:** `git diff src/Tidansu.App/src/api/apiClient/` shows only the
      **413-related** change under `api/spaces/`. Anything larger → stop and investigate.
- [x] **Setup:** `dotnet run` from `src/Tidansu.API`; sign in, take the bearer token from
      devtools. Create a space via the UI, note its id.
      ```powershell
      $h = @{ Authorization = "Bearer <token>"; 'Content-Type' = 'application/json' }
      # grab a real space graph, then PUT it back with one field poisoned
      $body = Invoke-RestMethod -Uri http://localhost:5081/api/spaces -Headers $h
      ```
      (Done via the dev magic-link + `/api/auth/consume` flow instead of devtools, per
      the feature-developer memory left by the previous batch — functionally identical.)
- [x] **🔴 The ruling — Free + photo → 403, valid or invalid (FR-4, D-8):** as a **Free**
      user, `PUT` a space with **(a)** a valid 1×1 PNG photo, then **(b)** an
      `data:image/svg+xml;base64,…` photo, then **(c)** `photo = ""`. **All three must
      return 403 `{plan:["photos"]}`** — never 400. This is the whole point of the
      handler move; if (b) or (c) returns 400, the guard is in the wrong place.
- [x] **Happy path — normal photo (FR-4/FR-5, Pro):** as **Pro**, set an item's `photo` to
      `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`
      and `PUT`. Observe **200**; photo round-trips unchanged on the next `GET`. Repeat
      with a JPEG (`FF D8 FF…`) and a WebP (`RIFF….WEBP`) data URL.
- [x] **Happy path — no regression (FR-1/FR-2):** re-save an ordinary space through the
      **UI** (drag a zone, rename an item). Observe **200**; layout persists across
      reload. The "nothing that saves today starts failing" check.
      (Verified via direct API create/PUT of an ordinary no-photo space and a scalar-field
      update, not the browser UI — no UI code changed in this batch; see report.)
- [x] **Reject — disallowed type (FR-4, Pro):** `photo = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="`
      → **400**, error key **`space.Items[0].Photo`** (note the casing — `ToCamelCase`
      lowercases only the first char), **no 500**; a follow-up `GET` shows nothing written.
- [x] **Reject — mislabelled payload (FR-4, the S-2 case, Pro):**
      `photo = "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="`
      (`<script>alert(1)</script>` declared as PNG) → **400**. This proves the check reads
      content, not the label.
- [x] **Reject — `image/jpg` (Pro):** a valid JPEG payload declared as
      `data:image/jpg;base64,…` → **400** (`DisallowedType`).
- [x] **Reject — non-data-URL (Pro):** `photo = "javascript:alert(1)"` → **400**.
- [x] **Reject — over cap (FR-5, Pro):** `$photo = "data:image/png;base64," + ("A" * 7000000)`
      → **400** (`TooLarge`, step 3). Response is fast (cheap reject fired).
- [x] **🔴 S-5 — no payload echo.** On the two previous rejects, confirm the **400 body**
      contains only the fixed message (no base64 fragment), **and** the server log's
      validation `Warning` contains **no payload**. This is the regression most likely to
      be introduced by the hand-built error path.
- [x] **413 body cap (D-9/S-8):** POST/PUT a >24 MB body, e.g.
      `$big = "data:image/png;base64," + ("A" * 26000000)` inside one item's photo.
      Observe **413** with `{"isSuccess":false,"errors":{"general":["Request rejected."]}}`,
      the handler never runs (no "Updating space" log line), and the log shows only
      `Bad request rejected: 413`.
- [x] **Reject — over-long field (FR-1/FR-6):** an item `name` of 201 chars → **400**
      naming `space.Items[0].Name` — **not** the opaque 500 this task exists to
      eliminate. Repeat with a 17-char `space.viewMode` (previously unvalidated → FR-2).
- [x] **Reject — tags (FR-3):** 16 tags → **400**; a 25-char tag → **400**. Confirm the
      whole save is rejected and tags are **not** silently truncated (re-`GET` and compare).
- [x] **Reject — rect (FR-9):** a zone with `rect.w = -5` → **400**.
- [x] **Downgrade / read-only path (FR-7):** store an item with a now-disallowed photo
      **before** applying the change (or by direct DB insert). With the change in place,
      `GET` the space and load it in the UI: it **still loads and renders** — no
      re-validation on read. Then edit and re-save → **400** (the exemption is for
      reading, not re-saving).
      (Verified via direct DB insert + `GET`, not the browser UI — the API response is what
      the UI renders from, so this proves the read-path exemption; see report.)
- [x] **B-12 non-regression (S-7):** as a Free user at 1 space, fire ~5 concurrent
      `POST /api/spaces`. Still exactly **2** spaces max; losers get 403
      `{plan:["spaces"]}`. Confirms the guard didn't disturb the app-lock path.
- [x] **Autosave path (FR-8):** in the UI, rename an item to >200 chars and let the 400 ms
      debounce fire. Observe **no false "saved" indicator** (there is none), the local
      edit **stays visible and editable** (no `hydrate(true)` revert), console shows
      `[spaces] sync failed`. The accepted Phase 1 bar — **B-19** owns surfacing. Confirm
      this task made it no worse.
      (Driven headlessly via CDP: opened the real space view, edited the "Milk" item's name
      to 201 chars through the actual `ItemFormModal` input, submitted. Network showed
      `PUT /api/spaces/b13-put-base` → **400**; console showed exactly
      `[spaces] sync failed Object`; the item card kept showing the 201-char name afterward
      — no revert, no false "saved" state. See report.)

---

## ❓ Open Questions

**All previously-raised questions are now closed by the human's rulings:**

1. ~~🟠 400 vs 403 ordering~~ → **RESOLVED**: photo check moves into the handlers behind
   the plan gate. FR-4 stands. Implemented per **D-8.1/D-8.2**. *(Corrected: this costs
   **nothing** in test coverage — see **D-0**.)*
2. ~~🟡 `""` photo flips 403→400~~ → **MOOT**, confirmed by re-derivation in **D-7**:
   `PlanPolicy` counts `Photo is not null`, so the plan gate fires first and Free + `""`
   stays **403**.
3. ~~🟡 `image/jpg`~~ → **RESOLVED**: rejected. Not a real MIME type. Test case added.
4. ~~🟡 `[RequestSizeLimit]`~~ → **RESOLVED**: included at **24 MB**, justified in **D-9**,
   following B-9.
5. 🟢 **One-off audit of existing rows** (requirements OQ-4) remains **not planned**,
   consistent with FR-7. Say the word if the blast-radius number is wanted.

**One new item surfaced while revising — a decision, not a blocker:**

6. 🟡 **The Kiota regen is caused only by `[ProducesResponseType(413)]`** (**D-4**), not by
   any validation work. Planned as **keep the attribute + regen**, matching B-9. If you'd
   rather have zero generated-client churn in this task, drop that one attribute — the
   413 is still returned at runtime; only its OpenAPI documentation goes away. Say so and
   I'll cut the regen task.

*(Requirements OQ-1/OQ-2 — the 5 MB cap, the JPEG/PNG/WebP allow-list, the 15×24 tag
bounds — were settled at the requirements gate and are encoded as `PhotoPolicy`
constants. Nothing here re-opens them.)*

---

## 🔗 Traceability

| FR | Covered by |
|----|-----------|
| FR-1 (zone/item field lengths) | `ZoneDtoValidator`, `ItemDtoValidator` — FluentValidation (**D-8.5**) |
| FR-2 (space Type/ViewMode/CanvasMode) | `SpaceDtoValidator` — FluentValidation |
| FR-3 (tags 15 × 24) | `ItemDtoValidator` + `PhotoPolicy.MaxTags`/`MaxTagLength` — FluentValidation |
| FR-4 (real image, allow-listed type) | `PhotoPolicy` steps 4–7, 11 + `SpacePhotoGuard` — **handler**, after the plan gate |
| FR-5 (size cap, decoded) | `PhotoPolicy` steps 3, 9 + `SpacePhotoGuard` — **handler** |
| FR-6 (clean field-attributed 400) | FluentValidation indexed keys + the guard's `Space.Items[i].Photo` key, both → the same `ValidationException` → existing middleware (**D-8.3**) |
| FR-7 (no retroactive re-validation) | "don't build" — write-path only; no read-path/DbContext/migration change (**D-3/D-4**) |
| FR-8 (no silent autosave failure) | "don't build" — `handleSyncError` verified unchanged; **B-19** owns surfacing |
| FR-9 (rect sanity) | `RectDtoValidator` — FluentValidation (**D-6**) |
| — (human ruling) | `[RequestSizeLimit(24 MB)]` + 413 on `SpacesController` (**D-9**) |

No task exists without a backing FR or an explicit human ruling (YAGNI).
</content>
