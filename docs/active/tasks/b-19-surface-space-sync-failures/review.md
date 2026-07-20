# Code Review: B-19 · Surface (not swallow) non-plan space-sync failures (U-3)

**Date**: 2026-07-20
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree vs `HEAD` (see Process note — the work is uncommitted on `main`, there is no branch)
**Files changed**: 5 source (+ pipeline artifacts, see Scope)

## Summary

A clean, well-scoped presentation-only change that does exactly what tech-planning
approved: a `saveMessage` latch on the store, a new `BaseToast` primitive, and an
app-level host beside `<PaywallModal />`. Template purity is perfect in both
templates, the no-double-surfacing rule is genuinely structural, the auto-dismiss
timer cannot leak or wedge, and none of the load-bearing "do not fix this back"
invariants were touched. `vue-tsc` is clean and all 3 new tests pass.

Two things keep it from being a straight merge: the toast reuses the app's
**plan-gate padlock icon**, which visually collapses the very distinction this task
exists to draw; and the **coalescing latch is a no-op** as currently written, so the
test's claim to prove it is overstated. Neither is a correctness defect.

## 🔴 Critical (must fix before merge)

None.

## 🟠 Major (strongly recommended)

### [M1] Toast uses the padlock — the app's established "plan limit" glyph
**File**: `src/Tidansu.App/src/components/base/BaseToast.vue:9`
**Category**: Functional (FR-6 in spirit)

`name="lock"` is used *everywhere else in this app* to mean "you have hit a plan
cap / this is Pro-gated": `data/paywall.ts:34,51`, `components/spaces/SpaceReadonlyBadge.vue:4`,
`views/DashboardView.vue:216` (`atSpaceLimit ? 'lock' : 'plus'`),
`components/space/ItemDetailModal.vue:163` (`photoLocked ? 'lock' : 'plus'`),
`views/AccountView.vue:27,148,170,198`, `views/PricingView.vue:72`.

B-19's whole purpose is that a **non-plan** failure gets its own voice, distinct from
the paywall. The control flow achieves that correctly (see Architecture Notes), but
the user sees the same padlock for "you're out of Free spaces" and "your save failed —
the network dropped". That is precisely the conflation FR-6 was written to prevent,
re-introduced at the visual layer.

**Recommendation**: use a warning/alert glyph. Note `src/components/icons.ts` currently
has **no** alert/warning/info path (available: `arrowL arrowR barcode bottle bowl box
cabinet check cheese chevDown chevRight columns cursor dots drawer edit egg floor fridge
grid jar layers leaf list lock meat milk package plus restart search settings snow spark2
sparkle square trash wine x`). So the clean fix adds one `warning` triangle path to
`icons.ts` — **a sixth file, i.e. a deliberate scope increment**. Flagging for the human
gate rather than assuming it. Cheaper interim: `restart` (reads as "try again", matching
the dismiss-only/redo product decision) — but `warning` is the right answer.

## 🟡 Minor (nice-to-have)

### [N1] Split class bindings on the toast root defeat `twMerge`
**File**: `src/Tidansu.App/src/components/base/BaseToast.vue:4-5`
**Category**: Convention / styling

The root carries a static `class="… bg-surface-2 …"` **and** `:class="classes"`
(`bg-warn/10`). `twMerge` only sees the second, so both `background-color` utilities
survive into the DOM and the winner is decided by `style.css` declaration order
(`--color-surface-2` line 16, `--color-warn` line 44 → `bg-warn/10` currently wins).
It renders correctly today **by accident of theme ordering**, which is exactly the
fragility `twMerge` exists to remove.

The house pattern is one binding — `BaseBadge.vue:29-34`:
```ts
const classes = computed(() =>
    twMerge('inline-flex items-center … text-[12px] font-semibold', variantClasses[props.variant])
);
```
**Recommendation**: fold the base classes into the `twMerge` call, drop `bg-surface-2`
(the variant tint already supplies the background), and emit a single `:class="classes"`.

### [N2] `twMerge` with a single argument is a no-op
**File**: `src/Tidansu.App/src/components/base/BaseToast.vue:54`

`twMerge(variantClasses[props.variant])` has nothing to merge against. Fixing [N1]
makes the call meaningful; otherwise it is decorative.

### [N3] Accessibility of the live region and the auto-dismiss
**File**: `src/Tidansu.App/src/components/base/BaseToast.vue:6,62-64`

- `role="alert"` is created *at the same moment as its text* (the whole element is
  behind `v-if` in `App.vue:47`). Several screen readers only announce mutations to a
  live region that already existed, so the announcement can be missed. Hosting a
  permanently-mounted empty `role="alert"` wrapper in `App.vue` and toggling only the
  inner content is the robust shape.
- The 6000ms timer has no pause-on-hover/focus and no extend affordance (WCAG 2.2.1 is
  borderline for an error message the user needs to read).
- If focus is on the dismiss button when the timer fires, the element is removed and
  focus drops to `<body>`.

None of these block merge; worth a follow-up if a11y is on the roadmap.

### [N4] The test does not prove the claim in its own docblock
**File**: `src/Tidansu.App/src/stores/useSpacesStore.saveMessage.test.ts:1-10,76-93`

See Architecture Notes — the coalescing assertion is not falsifiable.

## 🧭 Convention Violations (project rules)

- [ ] `components/base/BaseToast.vue:4-5` — split static `class` + `:class` on one
      element; house pattern is a single merged `:class` (`BaseBadge.vue:29-34`). [N1]
- [ ] `components/base/BaseToast.vue:9` — `lock` glyph reserved for plan-gating. [M1]

**Verified clean, explicitly checked:**

- **Template purity (HARD RULE)** — both templates pass. `BaseToast.vue`: only
  `{{ message }}` (plain prop), `:class="classes"` (computed), literal `:size` numbers,
  static attrs, and `@click="onDismiss"` (named handler wrapping `emit`). `App.vue`:
  `v-if="spaces.saveMessage"` (bare truthiness — explicitly allowed, cf. `v-if="store.isPro"`),
  `:message` plain property access, static `variant="warn"`, `@dismiss="onDismissSaveMessage"`
  (named handler). **Zero** ternaries, `!`/`??`/`&&`, arithmetic, concatenation, index
  lookups, inline assignments, or inline arrows in either template.
- **Variant styling** — `ToastVariant` union → `Record<ToastVariant, string>`, static
  Tailwind classes only, no dynamic class construction, no hex anywhere.
- **Theme tokens all exist in `src/style.css`**: `--color-surface-2` (16), `--color-text`
  (25), `--color-text-3` (27), `--color-warn` (44), `--color-danger` (45), `--radius-card`
  (49). Opacity-modifier forms `border-warn/40` / `bg-warn/10` are valid Tailwind v4 on
  `--color-*` tokens and are established house usage (`BaseBadge.vue:23-26` uses `/15`, `/30`).
- **Arbitrary px type sizes** (`text-[14px]`, `max-w-[440px]`) are house convention, not a
  violation — `BaseBadge:31`, `BaseButton:33-34`, `BaseText:32`, `BaseEmptyState:11,14`.
- **Layering** — toast `z-40` sits under `BaseModal.vue:6` `z-50`, as planned.
- `vue-tsc --noEmit` clean: the `v-if` correctly narrows `string | null` → `string` for
  the `message` prop.

## 🏗️ Architecture Notes

**The coalescing latch is a no-op today — and the test cannot detect that.**

`raiseSaveMessage()` (`useSpacesStore.ts:175-178`) guards with
`if (saveMessage.value !== null) return;` before assigning a **module constant**. Since
`saveMessage.value = SAVE_FAILED_MESSAGE` is idempotent, deleting that guard changes no
observable store state. All three tests in `useSpacesStore.saveMessage.test.ts` would
still pass without it:

- Test 1 (two parallel rejections) asserts the final value equals the constant — true
  whether it was written once or twice.
- Tests 2 and 3 never exercise a second raise at all.

Not even a `watch` counter could distinguish the two, because Vue refs skip triggering on
`Object.is`-equal writes. **What actually satisfies FR-5 is the singleton ref plus a
constant message, not the latch.** Checked for an interleaving that separates them and
found none: if the user dismisses at t=1s and a second same-window failure settles at
t=4s, the latched and unlatched versions re-raise identically.

This is not a defect — keep the latch as defence-in-depth for the day the message becomes
variable (per-space, or a count). But the test's docblock says it "proves the coalescing
rule ... deterministically", and it does not. Either soften the docblock to what it really
covers (the plan-cap no-double-surfacing rule and the `reset()` clear — both genuinely
proven and genuinely valuable), or make coalescing observable by having `raiseSaveMessage`
increment a counter the test can assert is `1`.

**Latch cannot wedge — verified.** Every clear path sets `null` and nothing gates
re-raising afterwards: `dismissSaveMessage()` (`:166`), `reset()` (`:583`), and the toast's
auto-dismiss (which routes through `emit('dismiss')` → `App.vue:31` → `dismissSaveMessage`).
After any of them the next failure raises normally.

**No-double-surfacing is structural, as specified.** Exactly three call sites, and the
grep is exhaustive: `:217` inside the existing `else` of `handleCreateError`'s
`planReasonOf` fork, `:247` inside the existing `else` of `recordFailure`'s fork, and
`:224` unconditional in `handleDeleteError` (correct — deletes never trip a cap). Neither
branch re-checks the condition; mutual exclusion is by control flow, exactly as
tech-tasks required. Confirmed empirically by test 2: a `PlanError('zones')` opens the
paywall and leaves `saveMessage` null.

**Timer hygiene is correct.** `setTimeout` armed in `onMounted`, cleared in `onUnmounted`.
Because `App.vue` gates the component with `v-if`, every dismissal unmounts it (clearing
the timer) and every fresh message mounts a new instance with a fresh timer — so the
timer can neither fire against a torn-down component nor leak across mounts. The timer
correctly lives in the component, never in the store.

**No regression to the load-bearing invariants.** The diff does not touch the `hydrate`
swallow (`:445`, B-18 U-2), the `flush` in-flight `finally` (`:423`), the `hydrateEpoch`
guard (`:76`, `:588`), or the phase-3 zone-delete ordering. Critically, `raiseSaveMessage`
is **not** called from any hydrate path — a failed initial load still surfaces through
`isHydrateFailed` (B-18's retry UI) and does not additionally fire a toast.

**Guideline updated**: appended the single-`:class` / no-split-class rule to the frontend
table in `.claude/context/patterns.md` — it was silent on this, and [N1] is the kind of
slip that recurs.

## 👍 Positives

- Template purity is flawless in both files — no shortcuts taken, including the
  `onDismissSaveMessage` wrapper in `App.vue` where an inline call would have been tempting.
- The seam honours tech-planning exactly: a write-once latch rather than a projection of
  `saveState`, which would have re-introduced the per-op multiplicity FR-5 collapses.
- No-double-surfacing done by control flow rather than a duplicated condition — the
  branch structure makes the bug impossible rather than merely absent.
- Scope discipline is excellent: rollback and `saveState` were correctly left alone, and
  the store diff is additive only.
- Comments carry the *why* and the audit ids, consistent with the surrounding file.
- Message copy meets FR-3 cleanly — no status code, exception text, or op/store vocabulary,
  and plural-safe so it reads correctly when standing in for several failures.
- Writing the vitest file was the right call: the plan-cap and `reset()` cases are real
  regression protection that a manual drive would not reliably reproduce.

## 📋 Scope

**In scope, as specified** — the five source files and nothing else under `src/`.

**Pipeline artifacts also touched** (benign, not source):

- `.claude/agent-memory/tech-lead/MEMORY.md` (modified) and
  `.claude/agent-memory/tech-lead/frontend_paywall-vs-generic-error-surfacing.md` (new)
- `docs/active/tasks/b-19-surface-space-sync-failures/` (this task folder)
- `.claude/context/patterns.md` — appended by this review, see Architecture Notes
- `docs/backlog.md` was already modified before the pipeline ran; **not** part of this
  work and not reviewed, per instruction.

**Process note**: this work sits uncommitted on `main`, so there is no branch to diff
against `origin/main`. Per CLAUDE.md's workflow the change should be on a branch before
it is merged; worth correcting before the human gate closes it out.

## Action Checklist

- [ ] [M1] Replace the toast's `lock` icon — add a `warning` glyph to `src/components/icons.ts` (approve the +1 file) or fall back to `restart`.
- [ ] [N1] Fold base classes into `twMerge(base, variantClasses[props.variant])`, drop `bg-surface-2`, emit one `:class`.
- [ ] [N2] Resolved by [N1].
- [ ] [N3] Optional a11y follow-up: persistent live-region host, pause-on-hover, focus handoff on auto-dismiss.
- [ ] [N4] Soften the test docblock to what it proves, or add a raise-counter so coalescing is genuinely asserted.
- [ ] Process: move the work onto a branch before merge.
