# B-20 · Tech Tasks — Pin a culture so validation errors aren't mixed-language

Light-path task: one config edit + verification. No EF migration, no Kiota regen,
no auth/billing/plan-limit logic, no contract/DTO change.

**Human decision (locked):** pin **invariant culture** (not `en-US`). UI is
English-only; invariant is the deliberate default.

**Blast-radius decision (tech-lead): narrow `Program.cs` culture pin, NOT
`InvariantGlobalization`.** Rationale in the note under the task and in the summary.

Traceability: **FR-1** → the single implementation task below; its three acceptance
criteria → the three verification drives.

---

## 1. 📋 Technical Tasks

### Backend — API

- [x] add a process-wide default-culture pin at the very top of `Main` in `src/Tidansu.API/Program.cs`
      — before `WebApplication.CreateBuilder(args)`, set both
      `CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture`
      (this is the lever FluentValidation reads — its `LanguageManager` resolves the
      built-in message language from `CurrentUICulture`, falling back to its English
      default under invariant) **and**
      `CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture`
      (so any numeric placeholders inside messages — e.g. the `256` in a max-length
      message — and any `CurrentCulture`-based `.ToString()` in logs are deterministic too).
      Add `using System.Globalization;`. Include a short comment: *"B-20: pin invariant
      culture so FluentValidation's built-in messages don't localize to the host OS
      locale — English-only UI, deliberate default; NOT `InvariantGlobalization`, which
      would also swap ICU string comparison/casing to ordinal (see tech-tasks note)."*
      No other file changes are required — `AddValidatorsFromAssembly` in
      `src/Tidansu.Application/Extensions/ServiceCollectionExtensions.cs` and the
      `ValidationBehavior` pipeline stay exactly as they are; this only steers which
      language they emit.
  - **Why not `InvariantGlobalization` (csproj MSBuild property):** it removes ICU
    process-wide, which *also* switches every default string comparison / `ToUpper`
    / `ToLower` / sort from culture-aware to **ordinal**. The codebase already uses
    explicit `StringComparison.OrdinalIgnoreCase` in the security-sensitive spots
    (forwarded-header wildcard checks in this same file), but a blanket ICU removal
    is a much wider, harder-to-reason-about behaviour change than FR-1 asks for, is
    baked at build time, and forecloses ever formatting in a specific culture. The
    `Program.cs` pin is surgical, reversible, co-located with the rest of startup
    config, and touches *only* the default thread cultures.
  - ⚠️ Watch-out: `DefaultThreadCurrent*Culture` only apply to threads that have not
    already set their own culture. Set them **before** the host is built (top of
    `Main`) so every request thread-pool thread inherits them. Do not use
    `RequestLocalization` middleware — that is explicitly out of scope (it exists for
    *per-request* language negotiation, the opposite of one fixed default).
  - ⚠️ Regression check (AC #3): API JSON responses are unaffected — `System.Text.Json`
    serializes numbers/dates culture-invariantly (ISO-8601) by design, independent of
    `CurrentCulture`. Serilog timestamps use the explicit `outputTemplate` format in
    `appsettings.json`, not the ambient culture. So pinning to invariant does not
    regress response or log formatting; it only *removes* the host-locale variance the
    ticket is about. Confirm during verification (drive #3).

### Refactoring

No refactoring needed in touched files. `Program.cs` startup config is the correct
seam; the one added statement is minimal and self-documented.

---

## 2. 🔒 Security Considerations

No new attack surface. One adjacent note, no action required beyond awareness:

- 🟢 Low — had we chosen `InvariantGlobalization`, the switch of default string
  comparison to **ordinal** could in principle alter case-insensitive matching
  elsewhere (e.g. header/email normalization). The narrow `Program.cs` pin avoids
  this entirely — it does not change ICU or default comparison behaviour. No mitigation
  checkbox needed; this is the reason for the chosen approach, not a residual risk.

---

## 3. 📈 Scalability / Correctness Considerations

- [x] Correctness (the whole point): validation-message language becomes a fixed
      application default instead of a host-OS-locale accident. No EF, query, or
      payload-size dimension — nothing to bound or de-N+1 here.

---

## 4. 📦 New Dependencies

No new dependencies required. `System.Globalization.CultureInfo` is in the BCL.

---

## 5. ❓ Open Questions

No open questions. The two decisions the brief delegated are resolved above:
invariant culture (locked by human), narrow `Program.cs` pin over
`InvariantGlobalization` (tech-lead call, rationale above).

---

## Verification (no Application-layer test project exists — verify by driving the API)

Run the API (`dotnet run` from `src/Tidansu.API`). Use the **unauthenticated**
`POST /api/auth/magic-link` endpoint — its validator (`RequestMagicLinkCommandValidator`)
fires a **built-in** FluentValidation rule (`EmailAddress()` / `MaximumLength(256)`),
so a validation failure is reachable with **no JWT**.

- [x] **Build green:** `dotnet build` from `src/Tidansu.API` succeeds. **Verified:**
      whole-solution `dotnet build` from repo root — 0 errors (10 pre-existing
      `NU1903` audit warnings from `System.Security.Cryptography.Xml`, unrelated to
      this change, unchanged before/after).
- [x] **Type-check green (unaffected, sanity only):** `npm run build` from
      `src/Tidansu.App` still succeeds — no frontend/contract change, so this must be
      untouched (and there is no Kiota regen for this task). **Verified:** `vue-tsc -b`
      + `vite build` both succeeded, same output as baseline.
- [x] **Drive #1 — deterministic English on a built-in rule (AC #1 & #2).**
      With the pin in place, POST an invalid email:
      `curl -s -X POST http://localhost:5081/api/auth/magic-link -H "Content-Type: application/json" -d "{\"email\":\"not-an-email\"}"`
      Confirm the JSON `errors.email` message is **English** (e.g. *"'Email' is not a
      valid email address."*). **Verified — observed response:**
      `{"errors":{"email":["'Email' is not a valid email address."]},"isSuccess":false}`
      (also drove a 262-char email to trip `MaximumLength(256)`:
      `{"errors":{"email":["'Email' is not a valid email address.","The length of 'Email' must be 256 characters or fewer. You entered 274 characters."]},"isSuccess":false}`
      — both English).
- [x] **Drive #2 — prove host-independence without a Polish box.** Temporarily change
      the pin in `Program.cs` to a non-English culture
      (`CultureInfo.DefaultThreadCurrentUICulture = new CultureInfo("pl-PL");`),
      re-run, and repeat the same curl: the built-in message should now come back in
      **Polish** — this demonstrates the message language follows the pinned culture
      (i.e. it *was* host-locale-driven before). Then restore the pin to
      `CultureInfo.InvariantCulture`, re-run, repeat the curl, and confirm the message
      is **English again**. This end-to-end swap is the concrete proof that the pin —
      not the host OS — now determines the language. Revert the temporary edit before
      committing. **Verified — observed responses:** with the temp `pl-PL` pin,
      `{"errors":{"email":["Pole 'Email' nie zawiera poprawnego adresu email."]},"isSuccess":false}`
      (Polish). After restoring `CultureInfo.InvariantCulture` and rebuilding,
      `{"errors":{"email":["'Email' is not a valid email address."]},"isSuccess":false}`
      (English again). Temp edit reverted; `git diff` on `Program.cs` shows only the
      permanent invariant pin.
- [x] **Drive #3 — no formatting regression (AC #3).** In the same responses, confirm
      any embedded numbers read normally (e.g. the `256` in a too-long-email message is
      plain digits) and that server console/log timestamps still render via the
      configured Serilog template. No date/number in an API JSON body should change
      shape (they are ISO/invariant regardless). **Verified:** the `MaximumLength`
      message's embedded numbers (`256`, `262`/`274`) rendered as plain ASCII digits
      throughout (invariant and the temporary `pl-PL` run alike — FluentValidation
      formats `{MaxLength}`/`{TotalLength}` via `string.Format` on the same
      `CurrentCulture`, invariant-safe for integers); Serilog console lines kept the
      explicit `[24-07 11:23:40 ...]` template shape post-restore, unaffected by the
      culture pin.

**Hand-written messages** (the codebase's `WithMessage("…")` strings, all English
literals) are English by construction and culture-independent — the fix targets the
*built-in* messages, which were the only host-locale-variable ones. If you want to see
a mixed built-in + hand-written response in one payload, drive an **authenticated**
endpoint (e.g. `AddItem` with an over-long name + too many tags) with a dev JWT and
confirm every line is English; this is optional beyond the drives above.
