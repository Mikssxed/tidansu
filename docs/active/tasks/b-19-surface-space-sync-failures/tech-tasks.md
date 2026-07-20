# B-19 · Technical Tasks — Surface (not swallow) non-plan space-sync failures (U-3)

**Scope: frontend, presentation-only.** No backend, no EF migration, no new endpoint,
no Kiota regen, no auth/billing/plan-gating change. Rollback (`applyRollback`,
`discardSpaceLocally`) and `saveState` bookkeeping already work and are **not** touched.

**Settled decisions (do not re-open):** global app-level transient toast · dismiss-only
(no retry) · coalescing = **one message per window** (a failure sets the message;
further failures while one is showing neither stack nor replace it).

**The seam.** The store already owns *"what failed"* (`saveState`, `planReasonOf`).
This task adds a second, much shallower output next to it: *"tell the user something
failed"* — a single nullable string plus a dismiss function. Deliberately **not**
derived from `saveState`: `saveState` is per-op and keyed by entity, so deriving a
message from it would re-introduce the per-op multiplicity the coalescing rule exists
to collapse. The message is a **write-once-per-window latch**, not a projection.
The interface stays narrow (one ref, one function) so no view needs to understand op
granularity, and the toast host stays dumb.

---

## 1. 📋 Technical Tasks

### Frontend — Composables/Stores

- [x] **add a transient save-failure message to the spaces store** in
      `src/Tidansu.App/src/stores/useSpacesStore.ts`
  - Mirror `useSessionStore`'s exemplar exactly (`src/Tidansu.App/src/stores/useSessionStore.ts`):
    a module-level message constant (see `BILLING_UNAVAILABLE_MESSAGE`, line 38), a
    `const saveMessage = ref<string | null>(null)` (mirrors `billingMessage`, line 60),
    and a `dismissSaveMessage()` (mirrors `dismissBillingMessage`, line 108).
  - Add the constant near the top of the module, beside the other module-level helpers:
    ```ts
    const SAVE_FAILED_MESSAGE = "Couldn't save your latest changes — please try again.";
    ```
    *(Plain language per FR-1: no status code, no exception text, and deliberately not
    the words "sync"/"flush"/"op". Phrased plural-safe because one message may stand for
    several failed operations under the coalescing rule.)*
  - Add the private raiser next to `markFailed` (~line 153) — **this function is the
    entire coalescing rule**, so it lives in exactly one place rather than being
    re-checked at each of the three call sites:
    ```ts
    /**
     * One message per flush window (B-19 FR-5). A failure raises the message; further
     * failures arriving while one is still showing do not stack or replace it — the
     * wording is generic, so a repeat carries no extra information. Cleared only by
     * the user dismissing it, the toast's auto-dismiss, or `reset()`.
     */
    function raiseSaveMessage(): void {
        if (saveMessage.value !== null) return;
        saveMessage.value = SAVE_FAILED_MESSAGE;
    }
    ```
  - ⚠️ **No-double-surfacing (FR-4) is structural, not a second check.** Call
    `raiseSaveMessage()` **only inside the existing `else` branch** that already holds
    `console.error` — never before or outside the `if (reason)`. The paywall branch and
    the message branch then stay mutually exclusive by construction, and a future edit
    can't silently break it. Three call sites:
    - `handleCreateError` (~line 187) — in the `else` beside
      `console.error('[spaces] space create failed', error)`.
    - `recordFailure` (~line 208) — in the `else` beside
      `console.error('[spaces] sync failed', error)`. Leave `markFailed(key, reason)`
      after it, untouched.
    - `handleDeleteError` (~line 196) — **unconditionally**. A delete can never trip a
      cap (the existing comment at line 195 says so), so there is no plan branch here.
  - Clear it in `reset()` (~line 549), beside `saveState.value.clear()`:
    `saveMessage.value = null;` — this is what satisfies "does not persist across
    sign-out" (FR-3); `reset()` is the store's `signOut` equivalent.
  - Export `saveMessage` and `dismissSaveMessage` from the store's return block
    (~line 786, beside `saveState`).
  - ⚠️ **Do not touch** the `hydrate` swallow (B-18), the `flush` in-flight `finally`,
    or the phase-3 zone-delete ordering — each carries a "do not fix this back" comment.
  - ⚠️ Do **not** raise the message from `hydrate`'s catch. A failed *read* is already
    handled by the B-18 `isHydrateFailed` retry UI; raising here would double-surface a
    failure that already has a better, actionable affordance.

### Frontend — Components/Views

- [x] **create the toast primitive** in
      `src/Tidansu.App/src/components/base/BaseToast.vue`
  - Mirror `src/Tidansu.App/src/components/base/BaseBadge.vue` for the
    variant → `Record<Variant, string>` static class map, and
    `src/Tidansu.App/src/components/base/BaseModal.vue` for the `<Teleport to="body">`
    + `fixed` overlay shape (BaseModal.vue:2,6).
  - Visual shape: copy the existing dismissible-banner markup in
    `src/Tidansu.App/src/views/AccountView.vue` lines 21–43 (icon + text + `x` dismiss
    button, `role="alert"`). Same voice, different placement.
  - Props: `message: string`, `variant?: ToastVariant` (default `'warn'`),
    `duration?: number` (default `6000`). Emits: `dismiss`.
    ```ts
    export type ToastVariant = 'warn' | 'danger';
    const variantClasses: Record<ToastVariant, string> = {
        warn: 'border-warn/40 bg-warn/10',
        danger: 'border-danger/40 bg-danger/10',
    };
    ```
    *(No raw classes or hex as props — the caller passes a variant token only. Two
    entries is the minimum that makes the union meaningful; don't add unused variants.)*
  - Positioning: `Teleport to="body"` + `fixed bottom-6 left-1/2 -translate-x-1/2 z-40`.
    ⚠️ `z-40` is **below** BaseModal's `z-50` on purpose — if a stale toast overlaps an
    open paywall, the paywall wins.
  - **Auto-dismiss timer lives here, not in the store** (transience is a presentation
    concern; the store must not hold a `setTimeout`). Start it in `onMounted`, and
    **clear it in `onUnmounted`** so a component torn down by route change or by the
    user dismissing early cannot fire `emit('dismiss')` against a dead component:
    ```ts
    let timer: ReturnType<typeof setTimeout> | undefined;
    onMounted(() => { timer = setTimeout(onDismiss, props.duration); });
    onUnmounted(() => { if (timer) clearTimeout(timer); });
    ```
    A `watch` on `message` is deliberately **not** needed: the host mounts the toast
    behind `v-if`, and the coalescing rule guarantees the message never changes while
    one is showing — so one mount is exactly one display window.
  - ⚠️ **Template purity.** The template gets only `{{ message }}`, `:class="classes"`
    (a `computed` using `twMerge`, per BaseBadge.vue:29), and `@click="onDismiss"` (a
    named handler that calls `emit('dismiss')` — never inline `emit(...)`).
    Icons: `<BaseIcon name="lock" :size="16" />` and `<BaseIcon name="x" :size="15" />`,
    both already exist. `aria-label="Dismiss message"` on the button.
  - ⚠️ Colors are `@theme` tokens only (`bg-surface-2`, `text-warn`, `text-text`,
    `text-text-3`, `border-border`, `rounded-card`) — no hex, no dynamic `` `bg-${x}` ``.

- [x] **export `BaseToast`** from `src/Tidansu.App/src/components/base/index.ts`
      🔒 blocked by: create the toast primitive
  - One line, alphabetical position (after `BaseText`):
    `export { default as BaseToast } from './BaseToast.vue';`

- [x] **host the toast app-wide** in `src/Tidansu.App/src/App.vue`
      🔒 blocked by: store message task + export task
  - This is what makes the message genuinely view-independent (FR-1): mount it as a
    sibling of `<RouterView />`, right beside the existing `<PaywallModal />` (App.vue:37)
    — the same "single app-wide surface" slot. The store instance is already in scope
    (`const spaces = useSpacesStore()`, line 14); no new import beyond `BaseToast`.
  - Template (purity-clean — plain property access + named handler only):
    ```html
    <!-- Single app-wide save-failure toast; raised by useSpacesStore on any
         non-plan-cap create/update/delete failure, on whichever view is open. -->
    <BaseToast
        v-if="spaces.saveMessage"
        :message="spaces.saveMessage"
        variant="warn"
        @dismiss="onDismissSaveMessage"
    />
    ```
  - Named handler in `<script setup>`:
    `function onDismissSaveMessage(): void { spaces.dismissSaveMessage(); }`
  - ⚠️ Do **not** put the toast inside `AppLayout` — a failure can land while the user
    sits on a `PlainLayout` route, and layout-scoped hosting would swallow it.

### Frontend — Tests

- [x] **add coalescing + no-double-surface store tests** in
      `src/Tidansu.App/src/stores/useSpacesStore.saveMessage.test.ts`
      🔒 blocked by: store message task
  - Copy the harness shape of `src/Tidansu.App/src/stores/useSpacesStore.flush.test.ts`
    (module mocks for the api/queryClient + Pinia driving).
  - Justified per `patterns.md`: `runSends` settles parallel rejections via
    `Promise.allSettled`, so "several failures land in the same tick" is precisely the
    timing case a manual browser drive cannot reliably produce. Three cases:
    1. two per-entity ops rejecting in one flush window → `saveMessage` is set **once**
       and equals the constant (not stacked, not replaced).
    2. a plan-cap rejection (403 `{plan:['zones']}`) → paywall opens and `saveMessage`
       stays `null` (FR-4).
    3. `reset()` → `saveMessage` returns to `null` (FR-3).

### Refactoring

- [ ] No refactoring needed in touched files.
  - `App.vue`, `base/index.ts` and the three store error handlers are already clean and
    single-responsibility; the change is additive.
  - **Deliberately declined:** re-homing `useSessionStore.billingMessage`'s duplicated
    inline banner (`AccountView.vue:21–43`, `PricingView.vue:67`) onto the new
    `BaseToast`. It is tempting DRY, but those banners are *inline and view-scoped by
    design* (they sit next to the control that failed), whereas this toast is
    *floating and global*. Collapsing them would change billing UX with no backing
    requirement — out of scope (YAGNI).

### Verification

- [ ] **type-check + build**: `npm run build` from `src/Tidansu.App` (runs `vue-tsc`) — green.
- [ ] **unit tests**: `npm test` from `src/Tidansu.App` — green, including the new file
      and the untouched `useSpacesStore.flush.test.ts` (guards "no regression to rollback
      / `saveState`", the last acceptance criterion).
- [ ] **manual end-to-end drive** (`run` / `verify` skills), app running against the API:
  - *Happy path unaffected:* rename a space, add a zone → no toast appears at all.
  - *Non-plan failure, dashboard:* with the API stopped (or DevTools → Network → Offline),
    rename a space from the dashboard. **Observe:** the rename visibly reverts **and** a
    warn-toned toast appears bottom-center reading "Couldn't save your latest changes —
    please try again.", with a single `x` and **no Retry button**.
  - *View-independence:* trigger the same failure, then immediately navigate to
    `/account`. **Observe:** the toast is still on screen (it is teleported to `body`,
    not owned by the view).
  - *Coalescing:* still offline, make three edits inside one 400ms debounce window
    (e.g. two zone renames + one item add) and let the flush fire. **Observe:** exactly
    **one** toast — not three — and it does not visibly flicker/re-arm.
  - *Auto-dismiss + manual dismiss:* leave one toast untouched → it disappears on its own
    after ~6s. Raise another and click `x` → it disappears immediately and **nothing
    else happens** (no re-send in the Network tab).
  - *Plan-cap path (FR-4 — the critical one):* back online on a **Free** account already
    at 2 spaces, attempt to create a third. **Observe:** the paywall opens with
    `reason: spaces` and **no toast appears alongside it**.
  - *Sign-out (FR-3):* raise a toast, then sign out before it auto-dismisses.
    **Observe:** it is gone immediately, and signing back in does not resurrect it.

---

## 2. 🔒 Security Considerations

- 🟢 **Low — error detail leaking to the user.** The raiser writes a fixed module
  constant and never interpolates `error`, so no status code, stack, exception text or
  server URL can reach the DOM. Raw detail stays in `console.error`, exactly as today.
  - [ ] Confirm at review that no call site passes the caught error into the message.
- 🟢 **Low — message surviving a session boundary.** A message raised for user A must
  not still be on screen for user B after a sign-out/sign-in on a shared device.
  - [ ] Verified by the `reset()` clear + the sign-out drive step above.
- 🟢 **Low — no new data crosses a trust boundary.** No new endpoint, no new payload
  field, no change to auth or plan gating. Nothing to authorize.

## 3. 📈 Scalability / Correctness Considerations

- **Message thrash during a sustained outage.** With an offline user and a debounce
  firing repeatedly, a naive "set on every failure" would re-arm the toast forever and
  make it undismissable in practice.
  - [ ] Mitigated by the `if (saveMessage.value !== null) return` latch — once the user
        dismisses (or it auto-dismisses), the *next* failure may raise a fresh one, but a
        burst within one window raises exactly one.
- **Timer leak on unmount.** A `setTimeout` outliving the component would emit into a
  destroyed instance (and, across many failures, accumulate).
  - [ ] Mitigated by `onUnmounted` → `clearTimeout`; the `v-if` host guarantees one
        timer per display window.
- **No new render or query cost.** The toast is a single `v-if`'d node reading one ref;
  `saveState` is not iterated, so this adds nothing that scales with space/zone/item
  count. No EF, no query, no payload change.

## 4. 📦 New Dependencies

No new dependencies required. `tailwind-merge` (used by the class `computed`) and
`vue`'s `Teleport`/lifecycle hooks are already in use by `BaseBadge.vue` and
`BaseModal.vue`.

## 5. ❓ Open Questions

No open questions.

Both of `requirements.md`'s open questions are now closed:

1. **Batch failures / coalescing** — resolved with the user on 2026-07-20 and recorded in
   `task.md`: one message per window, subsequent failures neither stack nor replace.
   This supersedes FR-5's "TBD" acceptance criteria; FR-5 now reads: *a single flush
   window producing N non-plan-cap failures shows exactly one message.*
2. **Auto-dismiss timing** — there is **no** existing house convention to match:
   `billingMessage` is manual-dismiss only and has no timer, so this task sets the
   precedent at **6000ms**, exposed as a `duration` prop so a future toast can differ
   without forking the component. Flag at review if 6s reads too short for the wording.
</content>
