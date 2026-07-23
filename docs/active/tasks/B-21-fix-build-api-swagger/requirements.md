### 📋 Backlog Item
Fix the documented `npm run build:api` command (in `src/Tidansu.App`) so it regenerates a correct Kiota API client end-to-end on a clean clone, with no manual steps and no version-pinning tribal knowledge — its first step currently fails because the Swashbuckle CLI expects a legacy `Startup` class that this minimal-hosting API doesn't have.

### 🎯 Product Context Summary
This is a developer-tooling fix, not a user-facing feature — Tidansu's end users never see it. The "user" here is anyone (present or future contributor) who runs `npm run build:api` to keep the frontend's typed API client in sync with the backend contract after a backend change. Every backend-touching task (B-6, B-9, B-11, B-13 already, and all future ones) depends on this working, so its unreliability is a recurring tax on delivery speed and a trap for newcomers who don't know the workaround. There is no Free/Pro dimension and no spatial-model dimension to this item — it's pure developer experience and build correctness.

### 🔑 Core Functional Areas
- One-command, zero-manual-step client regeneration on a clean clone
- Idempotence / stability of regeneration output (no spurious diffs)
- Contract fidelity (no accidental API surface change introduced by the fix)
- Documentation accuracy (`CLAUDE.md` matches reality)
- No regression to existing build pipelines (`npm run build`, `dotnet build`)
- Retirement/update of the now-obsolete manual-workaround knowledge

---

### Functional Requirements

**One-command regeneration**
- **FR-1**: A developer on a freshly cloned repo, with only the documented toolchain installed, must be able to run a single documented command from `src/Tidansu.App` and get a correct, complete Kiota API client — with no running app to boot by hand, no `curl`, and no manually invoking intermediate steps.
  - *Business rationale*: The whole point of a "regenerate the client" command is that it's a command, not a runbook. Every task so far has paid a manual-workaround tax; this must end.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A (developer tooling, not user/plan-facing)
  - *Constraints/Rules*: The chosen mechanism must work against the API's current minimal-hosting `Program.cs` shape without requiring the API to adopt the legacy `Startup`/`CreateHostBuilder` pattern purely to satisfy tooling (unless that is the option the tech-lead deliberately picks and justifies).
  - *Acceptance criteria*: On a clean clone, running the documented command completes successfully and produces a populated, working client under the client's output directory, with no other command run in between.

**Idempotence / stability**
- **FR-2**: Re-running the regeneration command against an unchanged backend must produce **no diff** against the currently committed client.
  - *Business rationale*: If regeneration is noisy (reordering, incidental formatting churn, timestamps), every future backend change produces review noise unrelated to the actual contract change, eroding trust in diffs and making real changes harder to spot.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A
  - *Constraints/Rules*: "Unchanged backend" means no controller/DTO/route changes since the last regen — the check is a pure idempotence check, not a change-detection feature.
  - *Acceptance criteria*: Run the command twice back to back (or once, when the committed client is already current) → `git diff` against the client output is empty both times.

**Contract fidelity (no incidental API surface change)**
- **FR-3**: The fix must not change what API surface the generated client exposes — it fixes *how* the OpenAPI document is produced, not *what* it says.
  - *Business rationale*: This is a tooling fix; silently adding/removing/renaming endpoints or fields as a side effect would be a hidden breaking change riding on an unrelated ticket, and would surprise every consumer of the client.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A
  - *Constraints/Rules*: The OpenAPI document's shape (paths, schemas, operation ids) must match what the currently-working manual workaround already produces (fetch from the running app), since that is the last known-correct source of truth.
  - *Acceptance criteria*: The client produced by the new command is byte-identical (or semantically identical, if intermediate formatting differs) to the client currently checked in / producible via the manual workaround, for the current backend state.

**Documentation accuracy**
- **FR-4**: `CLAUDE.md`'s documented `build:api` instructions must describe exactly what a developer needs to do and get it right — no leftover references to steps that no longer apply, no missing prerequisites.
  - *Business rationale*: A previously-broken documented command actively misleads new contributors; once fixed, the doc must not lag behind and reintroduce that trap.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A
  - *Constraints/Rules*: If the fix introduces any new one-time setup (e.g. a tool version, an SDK component), that must be stated in the doc, not left as tribal knowledge.
  - *Acceptance criteria*: Following `CLAUDE.md` literally, with nothing else, on a clean clone reproduces a working regeneration.

**No regression to existing build pipelines**
- **FR-5**: The fix must not break or slow down `npm run build` (frontend type-check + build) or `dotnet build` (backend).
  - *Business rationale*: Any change to `Tidansu.API.csproj` or `Program.cs` to support client regeneration is shared code — it must not destabilize the pipelines every other task depends on.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A
  - *Constraints/Rules*: If the chosen approach adds build-time OpenAPI document generation, that generation must not run (or must be inert/skippable) during normal `dotnet build`/`npm run build` invocations unless it was already an implicit part of them.
  - *Acceptance criteria*: `npm run build` and `dotnet build` both succeed, on a clean clone, before and after the fix, with no new required manual step and no meaningful change in build time.

**Retire the manual-workaround knowledge**
- **FR-6**: Once the documented command works end-to-end, the standing manual-workaround note (the running-app-fetch-and-hand-run-remaining-steps sequence) must be retired or clearly marked obsolete so future contributors don't reach for a workaround that's no longer needed.
  - *Business rationale*: Leaving stale workaround instructions around after the real fix lands re-creates exactly the confusion this item exists to remove.
  - *Priority*: Phase 2 (Growth) — cleanup, not blocking correctness, but should land in the same change since it's the direct consequence of FR-1.
  - *Plan & gate*: N/A
  - *Constraints/Rules*: None beyond keeping the workaround note truthful (either deleted, or explicitly marked "superseded — no longer needed as of B-21").
  - *Acceptance criteria*: The workaround note no longer instructs anyone to boot the API and manually `curl` swagger as the primary path.

---

### ⚠️ Key Business Considerations
- **Every backend-touching task depends on this.** This isn't cosmetic — it's been a recurring, silent tax (B-6, B-9, B-11, B-13 all paid it). Fixing it properly (not re-patching the version-mismatch symptom again) has compounding payoff.
- **Solution-neutral requirements, but the fix must be durable.** The three candidate options (promote the proven running-app fetch to be the real step; build-time OpenAPI doc generation; a `Startup` shim) trade off differently on "proven vs. clean vs. ceremony" — that's explicitly the tech-lead's call, not this document's. What must hold regardless of which is chosen: one command, zero manual steps, idempotent, no contract drift.
- **Idempotence is the real correctness bar**, more than "it runs without erroring" — a command that runs but produces a different client every time (due to nondeterministic ordering, environment-dependent output, etc.) would still leave every future PR with unreviewable client-diff noise.

### 🚫 Out of Scope (Phase 1)
- Any change to the actual API contract (new endpoints, DTO shape changes) — this item is purely about how the client is regenerated, not what it contains.
- Broader CI integration (e.g. a CI check that fails a PR if the committed client is stale) — valuable, but a separate, additive follow-up, not required for this fix to be "done."
- B-20 (culture/localization pinning) — separate item, unrelated except for being discovered in the same investigation trail.

### ❓ Open Questions for Product Owner
- None require product-owner input — this is a developer-tooling item with no user-facing or plan/business dimension. The remaining decision (which of the three technical options to implement) is explicitly deferred to the tech-lead per the backlog note, not a product question.
- One process question worth confirming: should the CI-integration idea (failing a PR when the committed client drifts from a fresh regen) be filed as its own backlog item now, given it's a natural next step once this lands? (Recommendation: yes, file separately — keep this item's scope to "the command works.")
