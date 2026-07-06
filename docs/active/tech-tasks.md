# Active Technical Tasks

> Captured for traceability. This work was designed via the architecture-review
> grilling loop (deepening candidate 01 — `PlanPolicy`) and implemented directly,
> so the PM/tech-lead stages were skipped. All items below are **done**.

## Feature: `PlanPolicy` deep module + caps single-source-of-truth

Deepening the plan-limit rule that was duplicated across two backend handlers and a
constant bag, and making the enforced caps server-authoritative (emitted to the
frontend via `/api/plans`). Behavior preserved exactly, including the intentional
Create-vs-Update asymmetry.

### Backend — Domain
- [x] add `PlanCaps` record + `PlanCaps.For(plan)` (null = unlimited) in `src/Tidansu.Domain/Constants/PlanCaps.cs`
- [x] add `SpaceUsage` record + static `PlanPolicy` (`CheckNewSpace`, `CheckSpaceMutation`) in `src/Tidansu.Domain/Constants/PlanPolicy.cs`
- [x] trim `PlanLimits.cs` to just `PlanLimitReasons` (caps folded into `PlanCaps`)

### Backend — Application
- [x] rewire `CreateSpaceCommandHandler` to `PlanPolicy.CheckNewSpace`
- [x] rewire `UpdateSpaceCommandHandler` to `PlanPolicy.CheckSpaceMutation` (delete `EnforceLimits`)
- [x] rewire `SetSyncCommandHandler` sync gate to `PlanCaps.For(plan).Sync`
- [x] add `PlanCapsDto` (+ `From(plan)`) in `src/Tidansu.Application/Plans/Dtos/`
- [x] add `GetPlansQuery` + handler in `src/Tidansu.Application/Plans/Queries/GetPlans/`

### Backend — API
- [x] add `PlansController` (`GET /api/plans`, `[AllowAnonymous]`) in `src/Tidansu.API/Controllers/`

### Tests
- [x] create `tests/Tidansu.Domain.Tests` xUnit project; add to solution + reference Domain
- [x] `PlanPolicyTests` — table-driven over every branch (29 cases, all green)

### Frontend
- [x] regenerate Kiota client (`npm run build:api`) — adds `PlanCapsDto`
- [x] `data/plans.ts` — literals become `FALLBACK_PLANS`; reactive `plansRef`; `planOf` reads it; `applyServerCaps` (null → Infinity)
- [x] `composables/usePlanCaps.ts` — TanStack Query fetch of `/api/plans`, applies caps
- [x] `queryClient.ts` — add `PLANS_QUERY_KEY`
- [x] `App.vue` — hydrate caps at startup (anonymous)
- [x] `PricingView.vue` — read caps reactively via `planOf` (both plan columns)

### Docs
- [x] `.claude/context/backend-rules.md` — `PlanPolicy` pattern + vocabulary

## 🔒 Security Considerations
- 🟢 `/api/plans` is intentionally anonymous — caps are already-public pricing info; no user data exposed. Server-side enforcement is unchanged (handlers still throw `PlanLimitException`); the emitted caps are advisory for UX only.

## 📈 Correctness Considerations
- 🟡 Behavior preservation verified by 29 table-driven tests pinning current semantics (incl. the downgrade `> cap && > existing` rule and the Create-vs-Update asymmetry).

## 📦 New Dependencies
- Dev tooling only: `Swashbuckle.AspNetCore.Cli` (10.1.2, matched to the API's Swashbuckle) and `Microsoft.OpenApi.Kiota` global tools — required by the pre-existing `build:api` script, not by the app.

## ❓ Open Questions / Follow-ups
- Manual browser drive of the authenticated create-over-cap + downgrade paths (needs LocalDB + magic-link auth) — not run; low risk given handlers are thin wrappers over the tested policy.
- Follow-up deepening candidate 02 (mirrored DTO mapping) would remove the remaining field-list duplication and shrink the "add a field" touchpoint count.
