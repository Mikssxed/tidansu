# Code Review: B-13 · Validate the space zone/item graph + photo content-type/size (S-2)
**Date**: 2026-07-15
**Reviewer**: branch-code-reviewer agent
**Diff base**: `origin/main` (uncommitted working tree; B-13's contribution isolated from B-7/B-10/B-11/B-12)
**Files changed (B-13 only)**: 13 — 7 new (`PhotoPolicy.cs`, `PhotoPolicyTests.cs`, `RectDtoValidator.cs`, `ZoneDtoValidator.cs`, `ItemDtoValidator.cs`, `SpaceDtoValidator.cs`, `SpacePhotoGuard.cs`), 6 modified (`SpacesController.cs`, both `*CommandHandler.cs`, both `*CommandValidator.cs`, + Kiota regen)

**Remit note**: this review covers correctness · convention · scope-creep · dead code · maintainability. Trust boundaries, payload/secret leakage and fail-open behaviour are the parallel `security-reviewer`'s remit and are deliberately not duplicated here.

## Summary
This is a well-executed implementation. Every FR in `tech-tasks.md` is implemented, in the
place the plan specified, with nothing extra. **I scrutinised the hand-rolled span parser
hard — the arithmetic and every boundary condition I could construct are correct**, and
the test suite is genuinely better than the usual "happy path + claim victory": the
decoded-size cap is pinned on *both* sides with real fixtures. B-12's `sp_getapplock` path
is untouched, and the Kiota regen is exactly the 413-only diff the plan predicted.

One real defect: `ItemDtoValidator`'s tag rule throws `NullReferenceException` (→ 500) on
`"tags": null`, in a task whose stated purpose is eliminating opaque 500s from unchecked
nested input. Everything else is Minor.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] `ItemDtoValidator`'s tag rule NREs → 500 on `"tags": null`
**File**: `src/Tidansu.Application/Spaces/Dtos/ItemDtoValidator.cs:24-26`
**Category**: Correctness

```csharp
RuleFor(i => i.Tags)
    .Must(tags => tags.Count <= PhotoPolicy.MaxTags)
```

`ItemDto.Tags` is `List<string> Tags { get; set; } = []` (`ItemDto.cs:11`). The `= []`
initializer only covers an **omitted** `tags` key — `System.Text.Json` writes an explicit
JSON `null` straight over it, and nothing opts into `RespectNullableAnnotations`
(`WebApplicationBuilderExtensions.cs:102-105` configures only `JsonStringEnumConverter`).
FluentValidation invokes the `Must` predicate regardless of null and does not catch
exceptions from it, so `tags.Count` throws `NullReferenceException` inside
`ValidationBehavior` → `ErrorHandlingMiddleware`'s catch-all → **500**.

This is *pre-existing* in the sense that `ItemDto.ToEntity`'s `Tags = [.. Tags]`
(`ItemDto.cs:43`) would already have NRE'd on the same payload — but B-13's new validator
is now the first thing to blow up, it is the code this task just wrote, and AC #1 ("returns
a clean validation error (400) … not a 500") is precisely the failure mode being fixed.
`RuleForEach(i => i.Tags)` on line 27 is safe (FluentValidation null-guards collection
rules); only the `.Must` is exposed. The developer's driven session covered 16 tags and a
25-char tag, but never `null`.

**Recommendation**: null-guard the property, which also produces a clean field-attributed
key (`space.Items[0].Tags`):

```csharp
RuleFor(i => i.Tags)
    .NotNull()
    .Must(tags => tags.Count <= PhotoPolicy.MaxTags)
    .WithMessage($"'{{PropertyName}}' must contain no more than {PhotoPolicy.MaxTags} items.");
```

Add an `InlineData`/driven case for `"tags": null`. (Same shape applies to
`"zones": null` / `"items": null`, which NRE in the handlers at
`CreateSpaceCommandHandler.cs:28` — genuinely pre-existing and out of B-13's file scope,
but worth a follow-up ticket since it's the same class of bug this task exists to close.)

## 🟡 Minor (nice-to-have)

### [N1] `MaxTags`/`MaxTagLength` are misfiled in `PhotoPolicy`
**File**: `src/Tidansu.Domain/Constants/PhotoPolicy.cs:38-39`, consumed at `ItemDtoValidator.cs:25,27`
**Category**: Maintainability / convention

Tag bounds have nothing to do with photos. The result is a validator that does
`using Tidansu.Domain.Constants;` and reads `PhotoPolicy.MaxTags` to bound a **tag list** —
a reader hunting the tag rule will not look in a file called `PhotoPolicy`.

This also breaks the `PlanPolicy` analogy the plan claimed. The repo's actual convention is
a **three-way split**: `PlanCaps.cs` (the numbers), `PlanPolicy.cs` (the pure decision
function, zero constants), `PlanLimits.cs` (the wire reasons). `PhotoPolicy` bundles all
three. `MaxPhotoBytes`/`MaxDataUrlChars` living beside `Check` is defensible — they're
internal to the algorithm and derived from each other. `MaxTags`/`MaxTagLength` are not.

The plan explicitly directed this (`tech-tasks.md:366`), so the developer conformed — the
plan was wrong on this point.

**Recommendation**: move `MaxTags`/`MaxTagLength` to a sibling `ItemContentCaps.cs` (or into
`PlanCaps`-adjacent constants) in `Tidansu.Domain/Constants/`. One-line change, no behaviour
impact. Update `PhotoPolicyTests.cs:120-121` accordingly.

### [N2] `All_PhotoRejection_values_are_reachable` is a vacuous test — 6 of the "57 green"
**File**: `tests/Tidansu.Domain.Tests/PhotoPolicyTests.cs:100-113`
**Category**: Dead code

```csharp
[InlineData(PhotoRejection.None)] // …one per member
public void All_PhotoRejection_values_are_reachable(PhotoRejection value)
{
    Assert.True(Enum.IsDefined(value));
}
```

`Enum.IsDefined` on a compile-time enum literal is tautologically true. The test can never
fail, and the name asserts a property (reachability) it does not test — its own comment
admits this ("the actual reachability of each is proven by the InlineData cases above").
These 6 cases pad the headline "57/57 green" with zero signal. If the intent is to pin
reachability, the honest form is to assert the *set of observed rejections* across the
`Check_returns_expected` table equals `Enum.GetValues<PhotoRejection>()`.

**Recommendation**: delete it, or rewrite as the set-coverage assertion above.

### [N3] Three correct-but-unpinned parsing edges
**File**: `tests/Tidansu.Domain.Tests/PhotoPolicyTests.cs:41-58`
**Category**: Correctness (coverage)

I traced each of these against `PhotoPolicy.Check` and **all three behave correctly** — none
is a bug. But none is pinned, so a future "simplification" could silently break them:

1. **Empty payload after the comma** — `"data:image/png;base64,"` → `payload.Length == 0` →
   `Malformed` (`PhotoPolicy.cs:96`). The nearest test (line 56, `"…base64,ABC"`) exercises
   the `% 4` branch, not the zero-length one.
2. **RIFF-but-not-WebP** — `"data:image/webp;base64,UklGRgQAAABXQVZF"` (a `RIFF…WAVE`
   container declared as WebP) → `SniffMediaType` finds `WEBP` absent at offset 8 → `null` →
   `NotAnImage` (`PhotoPolicy.cs:198`). The existing WebP fixture only proves the positive.
3. **Truncated-but-sniffable payload** — `"data:image/jpeg;base64,/9j/"` decodes to exactly
   `FF D8 FF` and is **accepted** as a valid 3-byte "JPEG". Correct per the documented scope
   note (`PhotoPolicy.cs:186-193` — header sniffing, not full decode), but nothing records
   that this is the deliberate trade rather than an oversight.

**Recommendation**: three `InlineData` lines. (1) and (2) are one-liners; add (3) with a
comment tying it to the scope note.

### [N4] `SpacePhotoGuard` doesn't belong in `Spaces/Dtos/`
**File**: `src/Tidansu.Application/Spaces/Dtos/SpacePhotoGuard.cs`
**Category**: Convention

`Spaces/Dtos/` now holds three different kinds of thing: the DTOs, their FluentValidation
validators, and a handler-side guard. The DTO validators are a reasonable fit (they're
`AbstractValidator<TDto>`, named after the DTO, and the repo already co-locates validators
with what they validate). `SpacePhotoGuard` is neither — it's a pure Application-layer
policy adapter that both command handlers call, and it's the one file in that folder whose
name doesn't start with the DTO it concerns. Plan-conformant (`tech-tasks.md:212`), just a
folder that now means three things.

**Recommendation**: `src/Tidansu.Application/Spaces/SpacePhotoGuard.cs` (folder root, beside
`Commands/`/`Queries/`/`Dtos/`). Non-blocking; a move-and-namespace change.

### [N5] `CountTrailingPadding`'s doc comment overstates what it does
**File**: `src/Tidansu.Domain/Constants/PhotoPolicy.cs:153-162`
**Category**: Correctness (cosmetic)

The comment says "Counts trailing `'='` padding characters (0, 1 or 2)". It actually counts
`'='` in either of the last two positions, regardless of whether they're contiguous with the
end: `"AA=A"` returns `1` though there is no trailing padding, and `"A==="` returns `2`
though there are three.

**This is not exploitable.** In both cases step 9 under-states `decodedByteCount` by ≤2
bytes — a rounding error against a 5 MB cap, which cannot be leveraged to smuggle an
over-cap photo — and step 10's `IsValidBase64Payload` (`PhotoPolicy.cs:167-181`, which
strips at most 2 trailing `'='` and then rejects any `'='` in the remainder) rejects both
inputs as `Malformed` before anything is stored. The step 9-before-step-10 ordering is what
makes the imprecision reachable at all, and that ordering is mandated by D-1 for good
reason (cheap arithmetic reject before the O(n) scan). So: leave the code, fix the comment.

**Recommendation**: reword to "Counts `'='` in the last two positions — an upper-bound
estimate used only to refine the decoded-size arithmetic. Malformed padding is caught by
`IsValidBase64Payload` at step 10; this may under-state decoded size by ≤2 bytes on inputs
that are rejected there anyway."

### [N6] The DbContext seam pointer wasn't added
**File**: `src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs:105`
**Category**: Maintainability

`tech-tasks.md:457-460` marked `[x]` and suggested extending the `// Photos may be data URLs
— leave Photo as nvarchar(max)` comment with "size/type enforced by `PhotoPolicy` at write
time (B-13)". It was optional and it wasn't done. It's the single highest-value place for
that pointer: a future reader looking at an uncapped `nvarchar(max)` photo column has no
breadcrumb to the write-time guard.

**Recommendation**: append the sentence. One line.

## 🧭 Convention Violations (project rules)
- [x] Layer discipline — clean. `PhotoPolicy` is pure Domain (no EF, no outward deps).
      `SpacePhotoGuard` is Application-only. No business logic in the controller (attributes
      only; still `mediator.Send`-and-return). Handlers throw domain exceptions, never build
      HTTP results.
- [x] Kiota — regenerated, not hand-edited. Diff is **exactly** the predicted 413-only
      change: `api/spaces/index.ts` +2, `api/spaces/item/index.ts` +2, `api.json` purely
      additive (3× `413` blocks, 1× `429` from B-9 — zero deletions). Matches
      `tech-tasks.md:603-604`'s "anything larger → stop and investigate" bar.
- [x] EF migration — correctly **not** created; no model change (D-3/D-4 hold).
- [x] Frontend — no `.vue`/store changes in B-13's contribution, so template-purity, hex
      tokens and dynamic-class rules don't apply.
- [ ] `src/Tidansu.Application/Spaces/Dtos/SpacePhotoGuard.cs` — see [N4], folder placement.
- [ ] `src/Tidansu.Domain/Constants/PhotoPolicy.cs:38-39` — see [N1], diverges from the
      repo's `PlanCaps`(numbers)/`PlanPolicy`(decision) split that it claims to mirror.

## 🏗️ Architecture Notes

**The parsing arithmetic is correct — I could not break it.** Detail, since this was the
highest-value target:

- **Cap boundary is exact and inclusive on both sides.** `decodedByteCount > MaxPhotoBytes`
  (`PhotoPolicy.cs:102`) → 5_242_880 passes, 5_242_881 rejects. `payload.Length % 4 == 0` is
  established at line 96 *before* line 101's `payload.Length / 4 * 3`, so the integer
  division is exact, not truncating. `padCount` correctly subtracts.
- **The two constants cannot desync.** `MaxDataUrlChars = 6_990_540` vs. the longest valid
  at-cap URL (`data:image/jpeg;base64,` = 23 chars + 6_990_508 payload = **6_990_531**) — 9
  chars of margin, so step 3 can never produce a false `TooLarge`. Crucially this pairing is
  *enforced by a test*, not just by a comment: `Check_accepts_a_decoded_size_exactly_at_the_cap`
  (`PhotoPolicyTests.cs:87-98`) builds a real `MaxPhotoBytes`-sized PNG and expects `None`,
  so raising `MaxPhotoBytes` without raising `MaxDataUrlChars` goes red. Its sibling
  (`:72-85`) sizes the payload to land *under* `MaxDataUrlChars` while being one byte over
  the decoded cap, asserts that explicitly (`:82`), and thereby proves step 9 fired rather
  than step 3. That is the pair of tests I'd have asked for.
- **The `header[5..^7]` slice at line 89 cannot throw.** It requires `header.Length >= 12`,
  which is guaranteed: `StartsWith("data:")` (line 72) and `EndsWith(";base64")` (line 85)
  cannot overlap (`"data:"` ends `:`, `";base64"` starts `;`; no suffix/prefix of length
  1–4 matches), forcing 5 + 7. `"data:,x"` returns `NotAnImage` at line 85 before reaching
  the slice; `"data:;base64,AAAA"` slices to `""` → `DisallowedType`.
- **`commaIndex >= 5` always**, since `photo[0..4] == "data:"` contains no comma — so
  `header` always contains the full prefix, and a data URL with no comma at all (or one
  beyond char 64) lands on the same `Malformed` branch.
- **`Convert.TryFromBase64Chars` is always fed a multiple of 4.** `payload.Length % 4 == 0`
  and `headerChars = payload[..min(16, payload.Length)]`, so it's 16 or `payload.Length` —
  both multiples of 4. 16 chars → exactly 12 bytes → the `stackalloc byte[12]` never
  overflows, and padding can never appear mid-slice.
- **WebP sniff is right**: `RIFF` at 0, `WEBP` at 8, bytes 4–7 (the LE size field) skipped
  (`PhotoPolicy.cs:198`), guarded by `bytes.Length >= 12`. The fixture's size field is
  `04 00 00 00` — non-zero at byte 4, so the test does prove the field is ignored.

**Tech debt introduced**: none beyond the plan's explicit, documented trades — header-only
sniffing (scope note at `PhotoPolicy.cs:186-193`) and the ~3-photos-per-space cliff. Both
are recorded at the call site, not just in the task folder.

**`[RequestSizeLimit(24 * 1024 * 1024)]` — defensible, and documented where it'll be
found.** The number is justified (3 max-size photos + ~4 MB headroom) and sits below
Kestrel's ~28.6 MB default, so it's genuinely binding rather than decorative. Its
consequence — that whole-graph autosave re-sends every photo, so a *per-request* cap is also
a *per-space photographed-item* cap — is the kind of thing that normally lives only in a
task folder nobody reads again. Here it's a 4-line comment directly above the attribute
(`SpacesController.cs:41-44`), naming B-16 as the owner. That's the right place. Both
body-taking actions are covered; `DeleteSpace` correctly isn't. Zero regression risk today
(no capture flow ships).

**Contract compatibility of the validator refactor is sound.** Collapsing the inline rules
into `RuleFor(c => c.Space).NotNull().SetValidator(new SpaceDtoValidator())` preserves the
wire keys: FluentValidation prefixes child-validator paths with the parent property, so
`Space.Id` / `Space.Items[3].Name` are unchanged, and `SpacePhotoGuard`'s hand-built
`$"Space.Items[{i}].Photo"` matches that format exactly. Dropping the old
`When(c => c.Space is not null, …)` guard is safe — FluentValidation skips child validators
on null instances, so `NotNull()` still wins alone. The Create/Update drift the plan called
out is genuinely closed.

**Kiota's new `413 → createProblemDetailsFromDiscriminatorValue` mapping** documents a
`ProblemDetails` body while the middleware actually returns `ApiOperationResult`. That
mismatch is pre-existing and identical for the already-declared 400/403, so the 413 is
consistent with its neighbours — not a B-13 regression, but the whole set is worth one
cleanup ticket someday.

**Out of scope, noted only**: `Space.ColumnLabels` is a `PrimitiveCollection` with no
`HasMaxLength` and no validator — the same unbounded-JSON-growth shape as S-6's tag concern,
which B-13 bounded for `Tags` only. No FR covered it; correctly not fixed here.

## 👍 Positives

- **Scope discipline is exemplary.** B-13's contribution is exactly the files
  `tech-tasks.md` lists — nothing more. In a working tree carrying four other uncommitted
  tasks, that's not automatic. Specifically: **B-12's `sp_getapplock` path is untouched.**
  `CreateSpaceCommandHandler.cs`'s diff contains B-12's `AddWithinSpaceCapAsync` block plus
  exactly one B-13 line (`SpacePhotoGuard.ThrowIfInvalid(dto);`) at the mandated position —
  after the `PlanPolicy` gate, before `ToEntity`, and structurally outside the lock, which
  lives inside the repository method called afterwards. `SpacesRepository.cs` and
  `ISpacesRepository.cs` carry zero B-13 changes. D-8.1 satisfied by construction, not by
  hope.
- **The ordering that the whole design turns on is right, and says why it's right at the
  point of use.** Both handlers place the guard after the plan gate with a comment
  explaining that a Free user sending *any* photo must still get 403 — the exact invariant a
  future refactorer would otherwise destroy by "tidying" the check into the validator.
- **S-5 is closed structurally, not by care.** Five `private const string` messages and a
  `switch` in `SpacePhotoGuard.cs:16-20,42-50` — the guard has no code path that *can*
  interpolate the payload. The key carries attribution, the message carries no data.
- **Field lengths verified against the source of truth.** I checked every number in
  `ZoneDtoValidator`/`ItemDtoValidator`/`SpaceDtoValidator` against
  `TidansuDbContext.cs:60-105`: all 15 match exactly, none tightened. `string?` fields
  (`Label`, `Expiry`, `Icon`) correctly use bare `MaximumLength` (which skips nulls) rather
  than `NotEmpty`, with a comment saying so.
- **Test fixtures are real, and one test proves they're real.**
  `Png_fixture_header_is_the_real_png_signature` (`:33-39`) decodes the fixture and asserts
  the actual magic bytes, so the suite can't drift into testing a hand-waved constant. The
  mislabelled-`<script>`-as-PNG case and the inverse (real JPEG bytes declared as PNG,
  `:53`) both pin the declared-must-agree-with-sniffed rule from opposite directions.
- **The driven verification is real verification.** Free+valid → 403 and Free+invalid → 403
  is the pair that actually proves the handler placement; >5 MB rejected "in 0.06s"
  demonstrates the cheap reject fired rather than merely that the answer was 400; 5
  concurrent Free POSTs → 1×200/4×403 proves B-12 non-regression. The CDP-driven 201-char
  autosave check confirming no revert and no false "saved" state is the honest way to close
  FR-8's "don't build" ruling.

## Action Checklist
- [ ] [M1] Add `.NotNull()` before `.Must(...)` on `ItemDtoValidator`'s `Tags` rule (+ a `"tags": null` test) — currently a 500.
- [ ] [N1] Move `MaxTags`/`MaxTagLength` out of `PhotoPolicy` into an item-content constants file.
- [ ] [N2] Delete (or rewrite as set-coverage) `All_PhotoRejection_values_are_reachable`.
- [ ] [N3] Pin three correct-but-untested edges: empty payload after comma, RIFF-non-WEBP, truncated-but-sniffable JPEG.
- [ ] [N4] Move `SpacePhotoGuard.cs` from `Spaces/Dtos/` to `Spaces/`.
- [ ] [N5] Reword `CountTrailingPadding`'s comment to match what it actually computes.
- [ ] [N6] Add the "size/type enforced by `PhotoPolicy` at write time (B-13)" pointer to `TidansuDbContext.cs:105`.
- [ ] Follow-up ticket (not B-13): `"zones": null` / `"items": null` NRE → 500 in both handlers.

---

## Gate resolution (orchestrator, 2026-07-15)

Fixes applied inline by the orchestrator after the human gate. `dotnet build` 0 warnings /
0 errors; `dotnet test tests/Tidansu.Domain.Tests` **51/51 green** (was 57 — the 6 dropped
are N2's tautologies, not lost coverage).

### 🟠 M1 — **NOT REPRODUCIBLE. False positive.**
The finding reasoned that `.Must(tags => tags.Count <= …)` NREs into a 500 on `"tags": null`.
The `.Must()` analysis is correct in isolation, but the finding missed that **MVC's
`[ApiController]` non-nullable-reference ModelState check runs before the MediatR/
FluentValidation pipeline** and rejects the explicit null first.

Proven empirically, not argued: with the `NotNull()` rule **removed** and the API rebuilt,
`POST /api/spaces` with `"tags": null` returned **400**, not 500:

```
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1",
 "errors":{"Items[0].Tags":["The Tags field is required."]}}
```

The rfc9110 ProblemDetails shape and the **`Items[0].Tags`** key (no `space.` prefix) identify
this as ModelState, not FluentValidation — a FluentValidation failure returns the repo's
`{"errors":{"space.Items[0].Tags":[…]},"isSuccess":false}` shape.

**`NotNull()` was kept anyway**, relabelled in-code as defence-in-depth rather than a fix: it
costs 3 lines and makes the rule self-contained if `SuppressModelStateInvalidFilter` or a
nullable-context change ever removes that implicit behaviour. AC #1 was already met.

### 🟡 N1 — partially addressed (human decision: tag constants only)
`MaxTags`/`MaxTagLength` moved out of `PhotoPolicy` into a new
`src/Tidansu.Domain/Constants/ItemCaps.cs` (plan-independent structural bounds; exceeding one
is a 400, never a 403 — noted in the file). `PhotoPolicy` keeping its own two photo constants
was **accepted as-is**: the constants-vs-decision split is defensible for a self-contained
single-purpose module. N1's underlying point stands — *the plan* was wrong to say "mirror
`PlanPolicy`" when the real convention is the three-way `PlanCaps`/`PlanPolicy`/`PlanLimits`
split. The developer conformed correctly to a mistaken instruction.

### 🟡 N2 — fixed
Dropped the 6-case `All_PhotoRejection_values_are_reachable` theory (`Assert.True(Enum.IsDefined(literal))`).

### Post-fix drive (fixes in place, LocalDB + real bearer token)
| case | result |
|---|---|
| `tags: ["fresh"]` | **200** |
| `tags` omitted | **200** (the `= []` initializer holds) |
| `tags: null` | **400** `Items[0].Tags` (ModelState) |
| 16 tags | **400** `space.Items[0].Tags` — "must contain no more than 15 items" |
| 30-char tag | **400** `space.Items[0].Tags[0]` |

**S-5 re-verified under a live hostile payload** (tag = `SECRETPAYLOAD_<script>alert(1)</script>_XYZ`):
response echoed **only a character count** ("Wprowadzono 43 znaki(ów)"), and the payload appeared
**0 times** in the server log. No leak.

### 🆕 New finding from driving — not in either report
**Validation messages follow the host OS culture; no culture is pinned.** `grep` for
`CultureInfo` / `RequestLocalization` / `InvariantGlobalization` across `Program.cs`,
`Tidansu.API.csproj` and `appsettings*.json` returns nothing, so FluentValidation's built-in
messages localize to the server locale — on this (Polish) box the API returned
*"Długość pola 'Tags' musi być mniejsza lub równa 24 znaki(ów)"* while B-13's hand-written
messages stayed English. Users would get **mixed-language validation errors**, varying by host.

Pre-existing and **not** a B-13 regression — but B-13 materially widens it, adding ~15 rules
whose built-in messages can now reach users where previously only a handful could. Both
reviewers read code and so could not have seen this; it only appears when driven. Filed as
**B-20**, not fixed here (it's an i18n/product decision, out of B-13's scope).
