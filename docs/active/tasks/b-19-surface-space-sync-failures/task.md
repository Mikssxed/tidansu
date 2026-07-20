---
id: B-19
slug: surface-space-sync-failures
title: Surface (not swallow) non-plan space-sync failures (U-3)
status: done  # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []         # B-15/B-16/B-17/B-18 already landed; their store rework changed this task's scope
touch-points:
  - src/Tidansu.App/src/stores/useSpacesStore.ts   # expose a transient message; saveState already exists
  - src/Tidansu.App/src/App.vue                    # likely host for an app-level toast
  - src/Tidansu.App/src/components/base/           # new toast/banner primitive (none exists yet)
---

# B-19 · Surface (not swallow) non-plan space-sync failures

## Description
When a user creates, edits, or deletes a space and the save fails for a reason
other than a plan cap — offline, a 500, an expired session — the app currently
tells them nothing. The change is correctly undone behind the scenes, but from
the user's seat the edit simply appears, then silently reverts (or vanishes on
reload) with no explanation. This task gives that failure a voice: a brief,
dismissible message confirming the change wasn't saved, so the user knows to try
again rather than assuming their work is safe.

## Acceptance criteria

Evidence key: **[drive]** = observed in the running app (frontend up, backend down, so
every mutation fails with a genuine non-plan error); **[test]** = asserted in
`useSpacesStore.saveMessage.test.ts`; **[review]** = confirmed by code review.

- [x] A non-plan sync failure (create, per-entity update, or delete) shows a
      user-visible transient message; `console.error` alone is no longer the only signal.
      **[drive]** — toast shown, and the `[spaces] space create failed` log still emitted.
- [x] The message appears regardless of which view the user is on when the failure
      lands (dashboard, space detail, account) — failures are not view-scoped.
      **[drive]** — fired on the space-detail route; hosted in `App.vue` via `Teleport`.
- [x] The message is worded in plain, non-technical language — no HTTP status codes,
      exception text, or internal op/store terms leaked to the user. **[drive]** — the
      underlying error was a Kiota 500; the user saw only "Couldn't save your latest
      changes — please try again."
- [x] The user can dismiss the message; there is no retry action on it (dismiss-only,
      by product decision). It also auto-dismisses after a brief window if untouched.
      **[drive]** — dismiss button clears it; gone unaided after 7s (6000ms timer).
      Also verified the latch **re-raises** on a subsequent failure and does not wedge.
- [x] The message does not persist across sign-out/`reset()`. **[test]**
- [x] A plan-cap failure still opens the paywall with its existing `reason` and does
      **not** additionally raise a generic error message (no double-surfacing).
      **[test]** + **[review]** — structural: `raiseSaveMessage()` sits only in the
      `else` of the `planReasonOf` fork, so the two branches cannot both run.
- [x] Multiple non-plan-cap failures in the same flush window are coalesced rather than
      stacking one message per failed operation — **one message per window**
      (rule settled with the user; see Notes).
      ⚠️ **Held, but not independently proven.** The drive only ever exercised a single
      failure at a time, and the test cannot distinguish one write from N because every
      raise assigns the same constant (review M3). What guarantees this today is the
      single ref + constant message, not the latch. If the message is ever made dynamic,
      this criterion needs re-verifying with a write-counting assertion.
- [x] No regression: rollback behaviour (`applyRollback`, `discardSpaceLocally`) and
      `saveState` bookkeeping are unchanged. **[review]** — diff is purely additive;
      B-18's hydrate error panel + Retry also confirmed intact **[drive]**.

## Notes

**The backlog text for B-19 is stale — read this before planning.** It was written
before B-15/B-16/B-17/B-18 reworked `useSpacesStore.ts`. Corrections:

- `handleSyncError` **no longer exists**. It is now three paths: `handleCreateError`
  (whole-space POST), `handleDeleteError` (whole-space DELETE), and `recordFailure`
  (per-entity ops inside a flush).
- The backlog asks to "retry or roll back the optimistic change". **Rollback is
  already done** — `recordFailure` calls `applyRollback` per-op, `handleCreateError`
  calls `discardSpaceLocally` and decrements `total`. Local state already matches the
  server. Do not re-implement it.
- Per-mutation status is **already tracked** in `saveState`
  (`Map<string, {status, reason}>`, `useSpacesStore.ts:82`), exported at line 795 —
  and consumed by **zero** components.

**So the remaining scope is presentation only.** `useSpacesStore.ts:56` states the
seam explicitly: *"Per-mutation status is exposed via `saveState` for B-19 to
render, not rendered here."* This is a UI task, not a store-logic task.

**Decisions made with the user at the pipeline gate (2026-07-20):**
- *Surface form:* **global transient toast**, app-level — not a per-space inline badge.
- *Retry:* **dismiss-only**. The user re-does the edit. Rollback already restored a
  consistent state so there is nothing stale to reconcile. Explicitly rejected:
  a retry action, because replaying a rolled-back op would reopen the
  `ChangeSet`/flush machinery that B-15/B-16 just stabilized.

**Pattern to mirror:** `useSessionStore`'s transient-message pattern — a
`billingMessage` ref (`useSessionStore.ts:60`) plus `dismissBillingMessage()`
(line 108), cleared in `signOut`. Mirror the shape, but note the placement differs:
`billingMessage` is rendered as an **inline banner duplicated per-view**
(`AccountView.vue:22`, `PricingView.vue:67`). That does not work here — a space sync
failure can land on any view, so an app-level host is needed. **No global toast
component exists yet**; one will have to be introduced.

**Do not touch** the deliberate design notes in the store (the `hydrate` swallow
from B-18, the `flush` in-flight `finally`, the phase-3 zone-delete ordering) —
each carries a "do not fix this back" comment and an audit id.

**RESOLVED (2026-07-20, with the user) — coalescing rule.** `runSends` fires per-op
sends in parallel via `Promise.allSettled` and calls `recordFailure` independently for
each rejection, so a single flush window can produce several non-plan-cap failures at
once (e.g. two zone edits and an item add all rejecting together).

Decision: **one message per window.** A non-plan failure sets the message; further
failures arriving while a message is already showing do **not** stack or replace it.
Because the wording is generic, repeats carry no extra information for the user.
Explicitly rejected: per-affected-space messages (needs op→space-name mapping and
still multiplies during a real outage) and a combined count ("Couldn't save 3
changes") — a count exposes internal op granularity the user doesn't think in, and
reads as alarming rather than informative.

This supersedes `requirements.md`'s Open Question on FR-5; implement to the rule
above and do not re-raise it.

**Tech-planning decisions (2026-07-20) — see [`./tech-tasks.md`](./tech-tasks.md).**

- *Store seam:* a new `saveMessage` ref + `dismissSaveMessage()` on `useSpacesStore`,
  mirroring `billingMessage`/`dismissBillingMessage`, cleared in `reset()`. It is a
  **write-once-per-window latch, not a projection of `saveState`** — deriving it from
  `saveState` would reintroduce the per-op multiplicity the coalescing rule collapses.
- *Coalescing lives in one place:* a private `raiseSaveMessage()` that early-returns when
  a message is already showing. All three failure paths call it; none re-check.
- *No-double-surfacing is structural:* `raiseSaveMessage()` goes **only** in the existing
  `else` branch beside `console.error`, so the paywall and message branches stay mutually
  exclusive by construction. `handleDeleteError` raises unconditionally (deletes never cap).
- *Host:* new `BaseToast.vue` base primitive (`Teleport to="body"`, `z-40` — under
  BaseModal's `z-50`), mounted in `App.vue` beside `<PaywallModal />` so it is genuinely
  view-independent. Auto-dismiss timer lives in the component (`onMounted`/`onUnmounted`),
  never in the store.
- *Auto-dismiss:* **6000ms**, as a `duration` prop. No house convention existed
  (`billingMessage` is manual-dismiss only), so this task sets the precedent — this closes
  `requirements.md`'s second open question.
- *Size:* 4 source edits + 1 vitest file. The test is recommended, not optional: the
  coalescing case depends on `Promise.allSettled` timing a manual drive can't reliably hit.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
