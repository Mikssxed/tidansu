### 📋 Backlog Item
Bump `AutoMapper 12.0.1`, `System.Security.Cryptography.Xml 9.0.0`, and
`Microsoft.OpenApi 2.4.1` past their `NU1903` known-vulnerability advisories,
with zero behavioural regression and the Kiota codegen toolchain still working.

### 🎯 Product Context Summary
This is a maintenance/dependency-hygiene item, not a user-facing feature — it
has no plan/limit, spatial-model, or expiry implications. It exists purely to
keep the build free of known-vulnerability advisories. The only product-relevant
risk is regression: if the bump changes AutoMapper mapping behaviour or the
generated OpenAPI/swagger shape, it could silently break the frontend's Kiota
client (`npm run build:api`) or a mapping used by an existing feature. Given
that, this gets a short maintenance note rather than a full FR document.

**Reference lookup (direct vs transitive, confirmed from the `.csproj` files):**
- `AutoMapper` is a **direct** reference — pulled in via
  `AutoMapper.Extensions.Microsoft.DependencyInjection 12.0.1` in
  `Tidansu.Application.csproj`. Bump this package directly.
- `Microsoft.OpenApi` is **transitive** — pulled in via `Swashbuckle.AspNetCore
  10.1.2` in `Tidansu.API.csproj`. There is no direct reference to bump; the fix
  is either an explicit override pin or a Swashbuckle version bump that brings a
  patched `Microsoft.OpenApi` with it (tech-lead to confirm the compatible pairing
  — this is exactly the constraint flagged in `task.md`).
- `System.Security.Cryptography.Xml` is **transitive** — no direct reference
  found in any `.csproj`; likely pulled in via the ASP.NET Core Identity /
  JwtBearer stack (`Microsoft.AspNetCore.Identity.EntityFrameworkCore` /
  `Microsoft.AspNetCore.Authentication.JwtBearer`, both 10.0.0). Confirm the
  actual parent via `dotnet list package --include-transitive` before deciding
  whether a pin is safe or a parent bump is required.

### 🔑 Core Functional Areas
- Dependency version bump (three packages, no code/behaviour change intended)
- Non-regression verification (build, run, frontend build, Kiota regen, AutoMapper mappings, swagger output)

---

### Functional Requirements

**Dependency remediation**
- **FR-1**: The three flagged packages must be bumped to versions with no open
  `NU1903` advisory, using the least-disruptive change that clears the
  advisory (direct bump for `AutoMapper`; a pin or compatible parent-package
  bump for the two transitive packages).
  - *Business rationale*: Clears known-vulnerability advisories from the build
    without introducing unrelated churn.
  - *Priority*: Phase 1 (Core) — this is the entire scope of the task.
  - *Plan & gate*: N/A — infrastructure/maintenance, not user-facing, no plan gate.
  - *Constraints/Rules*: Must respect the Swashbuckle ↔ Microsoft.OpenApi
    version-match constraint the Kiota regen toolchain depends on (see memory
    `kiota-regen-tooling`) — do not bump `Microsoft.OpenApi` in isolation.
  - *Acceptance criteria*: `dotnet build` emits no `NU1903` warning for any of
    the three packages.

**Non-regression verification**
- **FR-2**: After the bump, the backend must build clean and the app must run
  and serve requests as before (no new startup errors, no behaviour change in
  auth/JWT signing or mapping-dependent endpoints).
  - *Business rationale*: A dependency bump is only acceptable if the product
    keeps working exactly as it did.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A
  - *Constraints/Rules*: None of the AutoMapper profiles' mapped output should
    change; none of the Identity/JWT-signing paths (which pull in
    `System.Security.Cryptography.Xml` transitively) should change behaviour.
  - *Acceptance criteria*: `dotnet build` succeeds; `dotnet run` starts the API
    without new errors; a manual smoke pass through a couple of
    mapping-dependent flows (e.g. viewing a space/zone/item list) shows
    unchanged data shape/values.

- **FR-3**: `npm run build:api` (Kiota regen from the live swagger document)
  must still succeed and produce a client with no unexpected shape changes,
  and `npm run build` (frontend type-check + build) must still pass against it.
  - *Business rationale*: This is the one path in this task with real
    blast-radius — if the OpenAPI output shape shifts, every consumer of the
    generated client could break silently at compile time or worse, at runtime.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A
  - *Constraints/Rules*: If the Swashbuckle/OpenApi pairing can't be bumped
    without breaking regen, prefer pinning `Microsoft.OpenApi` transitively at
    the current-compatible version over forcing an incompatible Swashbuckle
    bump — clearing the advisory is not worth breaking the regen toolchain.
  - *Acceptance criteria*: `npm run build:api` completes without error; the
    regenerated client's diff (if any) is limited to incidental/cosmetic
    changes, not removed/renamed operations or changed types; `npm run build`
    passes afterward.

---

### ⚠️ Key Business Considerations
- This is pure risk-reduction/hygiene work — success is "nothing changed for
  users," not a new capability. Any visible behaviour change is a regression,
  not a feature.
- The Kiota regen toolchain is the single highest-risk dependency in this
  bump — a break there stalls all future frontend work against the generated
  client, not just this task.

### 🚫 Out of Scope (Phase 1)
- Any other `NU1903`/advisory package not named in this brief.
- Broader dependency-hygiene sweep (e.g. auditing all packages for available
  updates) — tracked separately if the product owner wants it (see B-8/B-9/B-10
  precedent for scoped-down maintenance items).
- Any AutoMapper profile refactor beyond what a version bump strictly requires.

### ❓ Open Questions for Product Owner
1. If the closest patched `AutoMapper` release includes breaking API changes
   (major version bump), is that acceptable, or should we hold at the closest
   patched minor/patch release even if it means a slightly older version?
2. Same question for `Swashbuckle.AspNetCore`/`Microsoft.OpenApi`: if no patched
   `Microsoft.OpenApi` exists at a version compatible with the current
   Swashbuckle major, is a Swashbuckle major bump (with its own re-verification
   burden) acceptable, or should the transitive vulnerability be
   suppressed/accepted instead for now?
3. Is there a deadline/urgency driver for this (e.g. a compliance scan gating
   deploys) that should raise it above P3, or is "next time someone touches the
   build" fine?
