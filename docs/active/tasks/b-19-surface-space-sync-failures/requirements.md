### 📋 Backlog Item
When a space create/update/delete fails to persist for a non-plan-cap reason (offline, 500,
expired session), give the user a brief, dismissible, app-level message saying it wasn't saved,
instead of the failure being silent (`console.error` only) — the store already rolls the change
back and already tracks per-mutation status in `saveState`; this task is presentation-only.

*(Note: the original `docs/backlog.md` [B-19] entry — which mentions `handleSyncError` and asks
for retry-or-rollback logic — is stale. It documents the original motivation only; `task.md`
supersedes it with the current store shape and the two decisions already made below.)*

### 🎯 Product Context Summary
Tidansu's spatial model is optimistic client-side: a user rearranges zones or edits an item and
expects it to "just be there." When the background sync to the server fails for a reason that
has nothing to do with plan limits, the store already fixes the *data* (rollback / discard /
`saveState` bookkeeping are done — see `task.md`). What's missing is telling the *user* their
edit didn't stick, using the same honest, unobtrusive voice the app already uses for billing
failures (`useSessionStore`'s `billingMessage`), but surfaced globally since a space's sync
failure isn't tied to whichever view happens to be open. This is a trust requirement, not a
capability: no new data or plan behaviour is introduced.

### 🔑 Core Functional Areas
- Global transient failure toast (appearance, wording, lifetime, dismissal)
- Non-double-surfacing with the existing plan-cap paywall path
- Behaviour under multiple concurrent failures in one flush window
- Clearing on sign-out / store reset

---

### Functional Requirements

**Global sync-failure toast**

- **FR-1**: When a space create, a per-entity update (zone/item), or a space delete fails to
  persist for a reason other than a plan cap, the user sees a brief, transient, app-level
  message telling them the change wasn't saved.
  - *Business rationale*: Today the failure is invisible; the user believes their edit is safe
    when it has been silently rolled back or will vanish on reload. This is the core trust gap
    the task exists to close.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free and Pro identically — this is a reliability signal, not a plan feature.
    No paywall `reason` involved.
  - *Constraints/Rules*: The message must be worded in plain, non-technical language (e.g. "That
    change didn't save. Please try again." style) — never leak HTTP status codes, exception
    text, or the word "sync"/"flush"/internal op names. It must appear regardless of which view
    (dashboard, space detail, account, anywhere else) the user is on when the failure lands,
    since a background flush can complete on any screen.
  - *Acceptance criteria*: Given the user is on any view, when a non-plan-cap create/update/
    delete failure occurs, a message appears without requiring the user to navigate anywhere;
    opening dev tools is not required to learn the change failed.

- **FR-2**: The user dismisses the message manually; there is no retry action on it.
  - *Business rationale*: Decided with the product owner — replaying a rolled-back operation
    would reopen flush machinery that B-15/B-16 just stabilized. The user re-does the edit
    themselves, which is simple and safe because rollback already restored consistent state.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A (not plan-related).
  - *Constraints/Rules*: No "Retry" button or equivalent affordance. Dismiss is the only
    interaction.
  - *Acceptance criteria*: The message has exactly one interactive affordance (dismiss); dismissing
    it removes it and takes no other action (no re-send, no re-fetch).

- **FR-3**: The message is transient — it does not linger indefinitely and does not persist
  across a session boundary.
  - *Business rationale*: Mirrors the existing `billingMessage` pattern (transient, not a
    permanent log) and avoids clutter for a failure the user has already been told about.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Cleared automatically after a reasonable, brief display window if the
    user takes no action (auto-dismiss), *and* on manual dismissal. Also cleared on sign-out /
    store reset, consistent with `billingMessage` being cleared in `signOut` — it must never
    reappear or persist into the next session.
  - *Acceptance criteria*: The message disappears on its own after its display window elapses if
    left untouched; it does not survive a sign-out followed by a new sign-in.

**Interaction with the plan-cap paywall**

- **FR-4**: A plan-cap failure (spaces/zones/items/photos/sync limit) continues to open the
  existing paywall with its matching `reason`, and must **not** additionally trigger the generic
  sync-failure message for the same failed operation.
  - *Business rationale*: The paywall already fully explains a plan-cap failure and prompts the
    right upgrade action; layering a second, vaguer "didn't save" message on top of it would
    confuse the user about why the change failed and cheapen the paywall's specificity.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: This is precisely the Free-plan gate path (`reason` ∈ spaces | zones | items |
    photos | sync); Pro users never hit it.
  - *Constraints/Rules*: The store already distinguishes plan-cap failures (`planReasonOf`) from
    other failures at the point each failure is handled (`handleCreateError`, `recordFailure`);
    the generic message must only be raised on the non-plan-cap branch.
  - *Acceptance criteria*: Given a mutation fails specifically because of a plan cap, only the
    paywall is shown; the generic sync-failure message never appears for that same failed
    mutation.

**Multiple concurrent failures**

- **FR-5**: When several per-entity mutations fail within the same flush window (e.g. two zone
  edits and an item add all reject together), the user is told their changes weren't saved
  without being shown a flood of near-duplicate messages.
  - *Business rationale*: A flush sends its pending operations in parallel and settles them
    independently (`Promise.allSettled` in `runSends`), so a single network/session failure can
    produce several failed operations in the same moment — stacking one toast per failed
    operation would be noisy and would look like more distinct incidents than actually occurred.
  - *Priority*: Phase 1 (Core) — the resolution shape is an open question below, but *some*
    coalescing behaviour must be decided before build; it is not deferrable, since flush already
    batches operations today.
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: See open question — exact coalescing rule (single combined message vs.
    one per distinct space vs. one per flush) needs product-owner confirmation.
  - *Acceptance criteria*: TBD pending the open question, but at minimum: the user is never shown
    a stack of more failure messages than there are affected spaces in a single flush window.

---

### ⚠️ Key Business Considerations
- **Presentation only.** No rollback, retry, or reconciliation logic is in scope — that's done
  (`applyRollback`, `discardSpaceLocally`, `saveState`). Do not reopen it.
- **Trust over detail.** The message's job is to stop the user from trusting a change that
  didn't stick; it does not need to explain *why* it failed (offline vs. 500 vs. expired
  session) — that's implementation detail the user doesn't need to act on differently.
- **No double-surfacing.** The paywall already owns the plan-cap failure story; this toast must
  stay out of its way entirely.

### 🚫 Out of Scope (Phase 1)
- Retry / re-send affordance on the message.
- Per-space inline badges (explicitly rejected in favour of a global toast).
- Any change to rollback, `discardSpaceLocally`, `saveState`, or flush/`ChangeSet` ordering.
- Distinguishing failure causes (offline vs. 500 vs. expired session) in the message text.

### ❓ Open Questions for Product Owner
- **Batch failures**: when a single flush window produces multiple non-plan-cap failures across
  one or more spaces, should the user see one combined message ("Some changes didn't save"), one
  message per affected space, or the first failure only with subsequent ones swallowed for that
  window? This directly affects FR-5's acceptance criteria and hasn't been settled yet.
- **Auto-dismiss timing**: is there a house convention for transient-message display duration
  (e.g. matching any existing toast/banner timing elsewhere in the app), or should this task set
  the precedent?
