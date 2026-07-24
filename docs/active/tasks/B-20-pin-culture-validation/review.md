# Code Review: B-20 pin-culture-validation

**Date**: 2026-07-24
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree vs HEAD (uncommitted; no branch — change sits on `main`)
**Files changed (in scope)**: 1 — `src/Tidansu.API/Program.cs`

## Summary
A four-line change (one `using` + a two-line comment + two assignments) pins
`CultureInfo.DefaultThreadCurrentCulture` and `DefaultThreadCurrentUICulture` to
`InvariantCulture` at the very top of `Main`, before `WebApplication.CreateBuilder`.
It correctly and completely satisfies FR-1: FluentValidation's built-in messages
now resolve deterministically to English regardless of host OS locale, hand-written
messages are English literals, and the "no formatting regression" claim holds under
scrutiny. The implementation matches the locked tech decision (narrow `Program.cs`
pin, deliberately NOT `InvariantGlobalization`). **No Critical, no Major findings —
clean.**

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)
None.

## 🟡 Minor (nice-to-have)
None blocking. See Architecture Notes for one verified non-issue worth recording.

## 🧭 Convention Violations (project rules)
None. Change is co-located with the rest of startup config, self-documented with a
`B-20:` comment explaining the choice and the rejected alternative — consistent with
the existing `B-7`/`B-23` inline-rationale style in this file.

## 🏗️ Architecture Notes

**Correctness of the lever and placement — confirmed.**
- FluentValidation's `LanguageManager` resolves built-in message text from
  `CultureInfo.CurrentUICulture`; under invariant it falls back to its English
  default. Pinning `DefaultThreadCurrentUICulture` is the correct lever. Setting
  `DefaultThreadCurrentCulture` too makes the numeric placeholders inside those
  messages (e.g. `256`/`274` in a `MaximumLength` message) deterministic as well.
- Placement **before** `CreateBuilder` is correct: `DefaultThreadCurrent*Culture`
  seeds the default for every thread that has not explicitly set its own culture, so
  request thread-pool threads inherit invariant. The app uses no `RequestLocalization`
  middleware (out of scope, correctly avoided), so nothing later overrides per-request
  culture. `CurrentCulture` also flows across `await` via `ExecutionContext`, so the
  async MediatR/validation pipeline sees the pinned value — no async-context caveat here.

**The one under-weighed vector — checked, benign.** The narrow pin does more than
steer localization: it also shifts `CurrentCulture`-based *default* string comparison
and casing from the host OS locale to **invariant culture** (still ICU-linguistic, not
ordinal — that ordinal switch is the `InvariantGlobalization` behavior the plan
correctly declined). I scanned the backend for ambient-culture-sensitive string ops
that this shift could perturb:
- `ChangePlanCommandValidator.cs:13` `Allowed.Contains(p)` and `CurrentUser.cs:7`
  `Roles.Contains(role)` — `EqualityComparer<string>.Default`, which is **ordinal**;
  unaffected by the culture pin.
- `SpacesRepository.cs:61` `OrderBy(s => s.Id)` — EF-translated SQL ordering on a key,
  not an in-memory culture sort; unaffected.
- `PhotoPolicy.cs:86` `IndexOf(',')` — the **char** overload, always ordinal; unaffected.
- Security-sensitive comparisons (forwarded-header wildcard checks in this same file,
  email/plan normalization) already use explicit `StringComparison.OrdinalIgnoreCase`
  / `ToLowerInvariant()` — culture-independent by construction.

So the shift touches nothing the app relies on; if anything it removes a latent
Turkish-I-style hazard rather than introducing one. The plan's AC #3 "no regression"
claim is sound.

**Serialization / logging — confirmed non-issues.** `System.Text.Json` renders
numbers/dates invariantly (ISO-8601) independent of `CurrentCulture`; Serilog's
`{Timestamp:dd-MM HH:mm:ss}` template is numeric and its default text formatter
renders invariantly. `EmailService.cs:30`'s `DateTime.Now:yyyyMMdd_HHmmss` filename
is numeric-only and unaffected. No response or log shape changes.

**No gap vs the requirement.** FR-1 is fully met; there is no path where a built-in
validation message could still localize to the host locale after this pin.

## 👍 Positives
- Exactly the surgical change the tech plan specified — nothing more, no scope creep.
- Sets both `Culture` and `UICulture`, covering message text *and* embedded numeric
  placeholders (a subtlety a thinner fix would miss).
- Excellent inline comment: states intent, names the rejected broad alternative
  (`InvariantGlobalization`) and why, matching the file's established convention.
- Verification in tech-tasks is genuinely discriminating — the temporary `pl-PL`
  swap producing a Polish message then reverting to English proves the pin (not the
  host) determines the language, rather than a tautological "it's English on my box."

## Action Checklist
- [x] No action required — approved as-is. Recommend committing the `Program.cs`
      change on a task branch (it currently sits uncommitted on `main`).
