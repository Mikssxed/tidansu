---
id: B-20
slug: pin-culture-validation
title: Pin a culture so validation errors aren't mixed-language
status: in-review   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.API/Program.cs
  - src/Tidansu.API/Tidansu.API.csproj
  - src/Tidansu.API/appsettings.json
---

# B-20 · Pin a culture so validation errors aren't mixed-language

## Description
The API pins no culture, so FluentValidation's built-in messages localize to
whatever the **host OS** locale is, while every hand-written message in the
codebase is English. On a Polish dev box the API returns some validation messages
in Polish and others in English for the same request — the user-visible language
varies by deploy host, which is both a UX defect and a reproducibility trap.
Pick one language on purpose (the UI is English-only today, so invariant/en-US)
and apply it once, centrally. This is not real i18n — just making the app choose a
language deliberately instead of by accident.

## Acceptance criteria
- [x] Validation error messages are in a single, deterministic language regardless
      of the host OS locale (verified by driving a validation failure).
- [x] Both FluentValidation's built-in messages and hand-written messages read in
      the same language (English).
- [x] No behavioural regression to number/date formatting in API responses or logs
      that the app depends on.

## Notes
- Found while driving B-13's verification. Pre-existing, but B-13 widened it by
  adding ~15 validation rules.
- Requirements captured in [`./requirements.md`](./requirements.md); FR-1 is the
  only functional requirement (deterministic English validation text regardless
  of host OS locale).
- Open decision for tech-planning (not resolved here — see requirements.md
  Open Questions): pin **invariant** vs `en-US` (invariant recommended, no
  reason yet to want US-specific formatting); and `InvariantGlobalization`
  (csproj-wide, broad blast radius — affects all number/date/sort formatting)
  vs a narrower `CultureInfo.DefaultThreadCurrentCulture`/`...UICulture` pin in
  `Program.cs` (only steers validation/localization). `RequestLocalization` for
  multiple user languages is explicitly out of scope.
- **Light-path task**: 1–2 config edits, no schema, no endpoint/contract (no Kiota
  regen), no auth/billing/plan-limit logic.
- **Tech-planning decisions (tech-tasks.md):**
  - Blast radius → **narrow `Program.cs` culture pin**, NOT `InvariantGlobalization`.
    Set `CultureInfo.DefaultThreadCurrentUICulture` (the lever FluentValidation's
    `LanguageManager` reads) + `DefaultThreadCurrentCulture` to `InvariantCulture` at
    the top of `Main`, before `CreateBuilder`. Reason: `InvariantGlobalization` also
    swaps default string comparison/casing/sort to ordinal process-wide (baked at
    build) — far wider than FR-1 needs; the `Program.cs` pin is surgical & reversible.
  - No formatting regression: API JSON is culture-invariant via `System.Text.Json`;
    Serilog uses an explicit timestamp template. Only the host-locale variance in
    built-in validation messages changes.
  - Verify by driving the **unauthenticated** `POST /api/auth/magic-link` (built-in
    `EmailAddress()`/`MaximumLength` rule → no JWT needed). Host-independence proven
    by temporarily pinning `pl-PL` (Polish message) then restoring invariant (English).
  - No open questions, no security/scalability actions.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
