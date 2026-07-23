import { useApiClient } from '@/composables/useApiClient';
import { openPaywall } from '@/composables/useLimits';
import { isNotFoundError, planReasonOf, useSpacesApi } from '@/composables/useSpacesApi';
import { matchZone, parseAdd } from '@/data/items';
import type { PaywallReason } from '@/data/paywall';
import type { ChangeSet, FlushOperation, FlushPlan } from '@/data/pendingChanges';
import {
    applyRollback,
    createChangeSet,
    isEmpty,
    snapshotForUpdate,
    stageAdd,
    stageDelete,
    stageUpdate,
    stageZoneDelete,
    takeFlushPlan,
} from '@/data/pendingChanges';
import { seedFridge } from '@/data/seed';
import { flowFreeform, makeZone, summarize, uid } from '@/data/spaces';
import type { Item, Rect, Space, ViewMode, Zone, ZoneKind } from '@/data/types';
import { isInf } from '@/data/plans';
import { queryClient, spaceContentsKey, spacesQueryKey } from '@/queryClient';
import { useSessionStore } from '@/stores/useSessionStore';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

/** Spaces-summary page size (matches the API controller's default, see B-16). */
const PAGE_SIZE = 20;

/** Plain-language, plural-safe (B-19 FR-1): no status code, exception text, or
 * internal op/store vocabulary — one message may stand for several failed ops
 * under the coalescing rule. */
const SAVE_FAILED_MESSAGE = "Couldn't save your latest changes — please try again.";

/** Build a new item, assigning the next free slot index within its zone. */
function makeItem(space: Space, name: string, zoneId: string, quantity: number): Item {
    const slotIndex = space.items.filter((it) => it.zoneId === zoneId).length;
    return {
        id: uid('item'),
        name,
        zoneId,
        quantity,
        tags: [],
        dateAdded: new Date().toISOString(),
        expiry: null,
        photo: null,
        slotIndex,
        depth: 'front',
        level: 1,
    };
}

/**
 * Server-backed store of the user's spaces. Hydrates from `GET /api/spaces` (via the
 * TanStack Query cache) on sign-in/boot, mutates optimistically for instant UI, and
 * persists changes back: create/delete fire immediately as whole-space POST/DELETE;
 * every other edit is staged into a per-space `ChangeSet` (`@/data/pendingChanges`)
 * and flushed on one 400ms debounce window per space as a two-phase batch of
 * per-entity requests — space-scalar + zone add/update first, then item
 * add/update/delete + zone delete (item ops need their zone to exist server-side
 * first; see `flush`). A rejected mutation rolls back only itself, never the whole
 * space; a plan-limit 403 additionally opens the matching paywall. Per-mutation
 * status is exposed via `saveState` for B-19 to render, not rendered here.
 * Action signatures/getters match the pre-API store so views are unchanged.
 */
export const useSpacesStore = defineStore('spaces', () => {
    // Build the client eagerly so the bearer token is read per-request at call time.
    useApiClient();
    const api = useSpacesApi();
    const router = useRouter();
    const session = useSessionStore();

    const spaces = ref<Space[]>([]);
    const currentId = ref<string | null>(null);
    const hydrated = ref(false);
    /** State machine behind `hydrate` (B-18 U-2) — mirrors the `isContentsLoading`/
     * `isContentsFailed` trio one level down, but as a single status rather than a
     * per-id set since only one account-wide fetch is ever in flight. */
    const hydrateStatus = ref<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
    /** Generation counter guarding `hydrate` (B-18 review M1). `App.vue`'s boot call and
     * `useAuth.consume`'s forced call can genuinely overlap (an already-signed-in user
     * opening a fresh magic link), and `reset()` can run mid-flight on sign-out. Each
     * `hydrate()` call captures the epoch current at its start; only the call that is
     * still current when its fetch resolves may write `hydrateStatus`/`hydrated`/`spaces`
     * or fire the seed. `reset()` bumps it so an orphaned call can't re-arm anything. */
    let hydrateEpoch = 0;
    /** Set when `refreshOverCapFlags()` is asked to run while a `hydrate()` is in
     * flight (B-25 review N1) — its own fetch might have been sent *before* the plan
     * change that triggered this call, so dropping the request outright can leave the
     * badge set stale. Replayed once `hydrateStatus` next leaves `'loading'` (see the
     * watch below); `refreshOverCapFlags` re-validates `hydrated`/`hydrateStatus`
     * itself at that point, so a replay after a failed/no-op hydrate is a safe no-op. */
    let pendingFlagRefresh = false;
    const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const changeSets = new Map<string, ChangeSet>();
    const inFlight = new Set<string>();
    /** Spaces whose whole-space `POST /api/spaces` create hasn't resolved yet (B-23 FR-6).
     * The server now assigns `Space.Id`, so a space keyed by its local optimistic id here
     * has no server-known id yet — `flush` must not send anything for it (see `flush`'s
     * gate and `reconcileSpaceId`, which releases the gate once the real id is known). */
    const creatingSpaces = new Set<string>();
    /**
     * The space id the app most recently *asked* the space route to navigate to
     * (B-23 FR-6 regression fix — confirmed live: create wizard → permanent
     * "Loading…"). Set synchronously by `goToSpace`, never derived from
     * `router.currentRoute`.
     *
     * `router.push`/`router.replace` resolve asynchronously (route guards, lazy
     * chunk loads, etc.). `reconcileSpaceId` originally decided whether to
     * re-route by reading `router.currentRoute.value` at the moment the create
     * request resolved — but a fast API response can beat that navigation to
     * settling, so `currentRoute` still reflected the *previous* page (the
     * onboarding wizard), the "are we currently showing oldId" check came back
     * false, `reconcileSpaceId` skipped its `router.replace`, and the wizard's
     * own earlier `router.push(oldId)` landed afterwards — permanently, since by
     * then `space.id` had already flipped to the server id and nothing in the
     * store carried `oldId` any more. Tracking the *intent* here instead of the
     * *settled* route makes the check immune to how far that navigation has
     * actually progressed.
     */
    let spaceRouteTarget: string | null = null;
    /** Per-mutation save status, keyed by entity id (or `space:{id}` for scalars). */
    const saveState = ref<Map<string, { status: 'pending' | 'saved' | 'failed'; reason: PaywallReason | null }>>(
        new Map()
    );
    /** Transient, user-visible message when a non-plan-cap save fails (B-19). */
    const saveMessage = ref<string | null>(null);

    // ---- pagination (B-16 FR-9) ----
    /** Account-wide total from the last page fetched — the authoritative "used" count. */
    const total = ref(0);
    const loadedPage = ref(0);
    let loadingMore = false;

    // ---- per-space contents lazy-load (B-16 FR-2/4/5) ----
    /** Spaces whose full zone/item graph has been fetched (or built locally). */
    const contentsLoaded = ref<Set<string>>(new Set());
    /** Spaces with a contents fetch currently in flight. */
    const contentsLoading = ref<Set<string>>(new Set());
    /** Spaces whose most recent contents fetch failed (review N1) — cleared on retry. */
    const contentsFailed = ref<Set<string>>(new Set());

    /** Outcome of `loadSpaceContents`: 'not-found' is a confirmed 404 (safe to redirect
     * away from); 'error' is any other failure (network, 500 — show retry, don't redirect). */
    type ContentsLoadResult = 'ok' | 'not-found' | 'error';

    const count = computed(() => total.value);
    const hasMoreSpaces = computed(() => spaces.value.length < total.value);
    const currentSpace = computed(
        () => spaces.value.find((s) => s.id === currentId.value) ?? null
    );
    /** Initial account-wide spaces fetch is in flight (B-18 U-2). */
    const isHydrating = computed(() => hydrateStatus.value === 'loading');
    /** Initial account-wide spaces fetch's most recent attempt failed (B-18 U-2). */
    const isHydrateFailed = computed(() => hydrateStatus.value === 'failed');

    function isContentsLoaded(id: string): boolean {
        return contentsLoaded.value.has(id);
    }
    function isContentsLoading(id: string): boolean {
        return contentsLoading.value.has(id);
    }
    function isContentsFailed(id: string): boolean {
        return contentsFailed.value.has(id);
    }

    /** Refresh a space's dashboard-summary fields after a local zone/item mutation. */
    function refreshSummary(space: Space): void {
        Object.assign(space, summarize(space.zones, space.items));
    }

    function getById(id: string): Space | null {
        return spaces.value.find((s) => s.id === id) ?? null;
    }

    function getOrCreateChangeSet(spaceId: string): ChangeSet {
        let cs = changeSets.get(spaceId);
        if (!cs) {
            cs = createChangeSet();
            changeSets.set(spaceId, cs);
        }
        return cs;
    }

    // ---- server sync ----

    function scalarKey(spaceId: string): string {
        return `space:${spaceId}`;
    }
    function markPending(key: string): void {
        saveState.value.set(key, { status: 'pending', reason: null });
    }
    function markSaved(key: string): void {
        saveState.value.set(key, { status: 'saved', reason: null });
    }
    function markFailed(key: string, reason: PaywallReason | null): void {
        saveState.value.set(key, { status: 'failed', reason });
    }

    /** Clear the transient save-failure message (e.g. after the user dismisses it). */
    function dismissSaveMessage(): void {
        saveMessage.value = null;
    }

    /**
     * One message per flush window (B-19 FR-5). A failure raises the message; further
     * failures arriving while one is still showing do not stack or replace it — the
     * wording is generic, so a repeat carries no extra information. Cleared only by
     * the user dismissing it, the toast's auto-dismiss, or `reset()`.
     *
     * **What actually enforces FR-5 today is the single ref plus the constant message,
     * not this guard** (B-19 review M3). Because every raise assigns the same
     * `SAVE_FAILED_MESSAGE`, writing it twice is indistinguishable from writing it once
     * — Vue skips `Object.is`-equal writes, so not even a `watch` could tell, and the
     * store's tests pass with this early-return deleted. Do not read its presence as
     * evidence that coalescing is tested.
     *
     * It is kept deliberately as defence-in-depth: the moment the message becomes
     * dynamic (per-space name, a count, a reason), the guard is what stops N failures
     * from flickering N different strings through one window. Keep it and this note
     * together.
     */
    function raiseSaveMessage(): void {
        if (saveMessage.value !== null) return;
        saveMessage.value = SAVE_FAILED_MESSAGE;
    }

    /** Forget a space and every scrap of pending state keyed to it. */
    function discardSpaceLocally(spaceId: string): void {
        spaces.value = spaces.value.filter((s) => s.id !== spaceId);
        if (currentId.value === spaceId) currentId.value = null;
        const timer = saveTimers.get(spaceId);
        if (timer) clearTimeout(timer);
        saveTimers.delete(spaceId);
        changeSets.delete(spaceId);
        inFlight.delete(spaceId);
        creatingSpaces.delete(spaceId);
        saveState.value.delete(`space:${spaceId}`);
        contentsLoaded.value.delete(spaceId);
        contentsLoading.value.delete(spaceId);
        contentsFailed.value.delete(spaceId);
        if (spaceRouteTarget === spaceId) spaceRouteTarget = null;
    }

    /**
     * A failed whole-space CREATE rolls back just that space — it must NOT `hydrate(true)`
     * (review finding M2).
     *
     * A full re-sync replaces every `Space` object in the store, but the per-space
     * `ChangeSet`s survive and still hold ops staged against the *old* objects. Those ops
     * would then flush and land server-side while the UI showed the re-fetched values —
     * i.e. a cap rejection on space B could silently discard the user's in-flight edits to
     * space A, which is precisely what FR-11 forbids. Before B-15 a re-sync was harmless
     * (there was no pending per-entity state); this task is what made it unsafe, so this
     * task fixes it.
     *
     * Create is the only whole-space path that can plan-fail: deleting a space never trips
     * a cap, so `planReasonOf` is null there and it takes the surfaced-error branch.
     */
    function handleCreateError(space: Space, error: unknown): void {
        discardSpaceLocally(space.id);
        total.value = Math.max(0, total.value - 1);
        const reason = planReasonOf(error);
        if (reason) openPaywall(reason);
        else {
            console.error('[spaces] space create failed', error);
            raiseSaveMessage();
        }
    }

    /** A failed whole-space DELETE: surfaced, never a paywall (deletes never trip a cap). */
    function handleDeleteError(error: unknown): void {
        console.error('[spaces] space delete failed', error);
        raiseSaveMessage();
    }

    /**
     * A rejected per-entity mutation rolls back only itself (FR-11) — it never
     * re-syncs the whole account, which would re-fetch away sibling edits that
     * already succeeded in the same flush window. A plan-limit 403 additionally
     * opens the matching paywall; any other error is still surfaced via
     * `console.error` (not swallowed) with the failure left in `saveState` for
     * B-19 to render.
     */
    function recordFailure(
        space: Space,
        op: FlushOperation<Space | Zone | Item>,
        key: string,
        error: unknown
    ): void {
        applyRollback(space, op);
        const reason = planReasonOf(error);
        if (reason) {
            openPaywall(reason);
        } else {
            console.error('[spaces] sync failed', error);
            raiseSaveMessage();
        }
        markFailed(key, reason);
    }

    function sendZone(spaceId: string, op: FlushOperation<Zone>): Promise<unknown> {
        return op.op === 'add' ? api.addZone(spaceId, op.payload!) : api.updateZone(spaceId, op.payload!);
    }

    function sendItem(spaceId: string, op: FlushOperation<Item>): Promise<unknown> {
        switch (op.op) {
            case 'add':
                return api.addItem(spaceId, op.payload!);
            case 'update':
                return api.updateItem(spaceId, op.payload!);
            case 'delete':
                return api.removeItem(spaceId, op.id);
        }
    }

    /**
     * BUG 1 fix (D-7 / SC-6). Drop a phase-2 item op whose *target* zone — the
     * payload's `zoneId`, i.e. where the item lands after the op — belongs to a
     * zone whose phase-1 `add` just failed. Covers a fresh item add into that zone
     * **and** an FR-5 update reassigning an existing item into it; an earlier draft
     * of this plan only covered adds. Item-`delete` has no target zone and is never
     * dropped; an update staying in an existing, already-server-known zone is
     * unaffected.
     */
    function isTargetingFailedZone(op: FlushOperation<Item>, failedZoneAdds: Set<string>): boolean {
        if (op.op === 'delete' || !op.payload) return false;
        return failedZoneAdds.has(op.payload.zoneId);
    }

    interface PendingSend {
        readonly op: FlushOperation<Space | Zone | Item>;
        readonly key: string;
        readonly send: () => Promise<unknown>;
    }

    /** Fires every send in parallel, settles them all, and records saveState + rollback per op. */
    async function runSends(
        space: Space,
        sends: PendingSend[]
    ): Promise<{ op: FlushOperation<Space | Zone | Item>; ok: boolean }[]> {
        for (const s of sends) markPending(s.key);
        const results = await Promise.allSettled(sends.map((s) => s.send()));
        return sends.map((s, i) => {
            const result = results[i]!;
            if (result.status === 'fulfilled') {
                markSaved(s.key);
                return { op: s.op, ok: true };
            }
            recordFailure(space, s.op, s.key, result.reason);
            return { op: s.op, ok: false };
        });
    }

    /** Phase 1: space-scalar update + all zone add/update, in parallel. Returns failed zone-add ids. */
    async function runPhase1(spaceId: string, space: Space, plan: FlushPlan): Promise<Set<string>> {
        const sends: PendingSend[] = [];

        const scalarOp = plan.phase1.space;
        if (scalarOp) {
            sends.push({
                op: scalarOp,
                key: scalarKey(spaceId),
                send: () => api.updateFields(spaceId, scalarOp.payload!),
            });
        }
        for (const op of plan.phase1.zones) {
            sends.push({ op, key: op.id, send: () => sendZone(spaceId, op) });
        }

        const outcomes = await runSends(space, sends);

        const failedZoneAdds = new Set<string>();
        for (const { op, ok } of outcomes) {
            if (!ok && op.kind === 'zone' && op.op === 'add') failedZoneAdds.add(op.id);
        }
        return failedZoneAdds;
    }

    /** Phase 2: all item add/update/delete + all zone delete, in parallel, after phase 1 settles. */
    async function runPhase2(
        spaceId: string,
        space: Space,
        plan: FlushPlan,
        failedZoneAdds: Set<string>
    ): Promise<void> {
        const sends: PendingSend[] = [];

        for (const op of plan.phase2.items) {
            if (isTargetingFailedZone(op, failedZoneAdds)) {
                // Never sent — the zone it targets doesn't exist server-side. Roll back the
                // local optimistic state the same way a real failure would.
                applyRollback(space, op);
                markFailed(op.id, null);
                continue;
            }
            sends.push({ op, key: op.id, send: () => sendItem(spaceId, op) });
        }

        await runSends(space, sends);
    }

    /**
     * Phase 3 — zone deletes, and ONLY after every phase-2 item op has settled.
     *
     * These cannot ride along with the item ops (BUG 3, found in review). The server's
     * zone-delete cascade matches on the item's *persisted* `ZoneId`. An item moved out
     * of zone Z in this same window is still recorded under Z until its own `PUT` lands,
     * so firing `DELETE /zones/Z` concurrently means the cascade deletes the item the
     * user just moved to safety — and its `PUT` then 404s. Silent item loss, surfacing
     * only on reload.
     *
     * Nothing needs the reverse order: `stageZoneDelete` already annihilates pending
     * changes for items still inside the doomed zone, so no phase-2 op depends on a
     * zone delete having landed first.
     */
    async function runPhase3(spaceId: string, space: Space, plan: FlushPlan): Promise<void> {
        await runSends(space, plan.phase2.zoneDeletes.map((op) => ({
            op, key: op.id, send: () => api.removeZone(spaceId, op.id),
        })));
    }

    async function runFlushPlan(spaceId: string, cs: ChangeSet): Promise<void> {
        const plan = takeFlushPlan(cs);
        const space = getById(spaceId);
        if (!space) return; // space was deleted locally while edits were still pending
        const failedZoneAdds = await runPhase1(spaceId, space, plan);
        await runPhase2(spaceId, space, plan, failedZoneAdds);
        await runPhase3(spaceId, space, plan);
    }

    /**
     * Sends one space's accumulated `ChangeSet` as the two-phase batch above.
     *
     * BUG 2 fix (SC-9). The 400ms debounce only delays a flush's *start*, not its
     * *duration* — edits arriving while a flush's requests are still in flight
     * would otherwise open a second, overlapping flush for the same space, and a
     * stale rollback from the first could stomp a newer optimistic edit from the
     * second (silent data loss). Serializing per space makes that structurally
     * impossible: if a flush is already in flight for this space, re-arm the
     * debounce instead of starting a second one, and let the next window absorb
     * whatever gets staged in between. **The `finally` is load-bearing** — any path
     * that skips it (an early return, a throw) wedges this space's autosave
     * permanently, since every later flush would see `inFlight` still set and just
     * re-arm forever without ever sending.
     *
     * B-23 FR-6: a space whose whole-space create hasn't resolved yet has no
     * server-known id — sending against `spaceId` here would be the local optimistic
     * id, which 404s. Rather than re-arming (its closure would keep retrying against
     * the same stale id forever), this simply declines to flush; `reconcileSpaceId`
     * (called from `createRemote`'s success path) re-schedules a fresh flush under the
     * real id once it is known, so nothing staged during the gate is lost.
     */
    async function flush(spaceId: string): Promise<void> {
        if (creatingSpaces.has(spaceId)) return;
        if (inFlight.has(spaceId)) {
            scheduleSave(spaceId);
            return;
        }
        const cs = changeSets.get(spaceId);
        if (!cs || isEmpty(cs)) return;
        inFlight.add(spaceId);
        try {
            await runFlushPlan(spaceId, cs);
        } finally {
            inFlight.delete(spaceId);
        }
    }

    /** Debounced per-space flush trigger — batches rapid edits into one flush per space. */
    function scheduleSave(spaceId: string): void {
        const pending = saveTimers.get(spaceId);
        if (pending) clearTimeout(pending);
        saveTimers.set(
            spaceId,
            setTimeout(() => {
                saveTimers.delete(spaceId);
                // A rejected *send* never reaches here (runSends uses Promise.allSettled),
                // so this only fires for an unexpected bug inside the flush itself. Log it
                // rather than let it become a context-free unhandled rejection; `flush`'s
                // own `finally` has already released the in-flight guard, so the next
                // window still saves.
                flush(spaceId).catch((e) => console.error('[spaces] flush failed', e));
            }, 400)
        );
    }

    /** Move a `Set`'s membership from one key to another, if present. */
    function moveSetEntry(set: Set<string>, oldId: string, newId: string): void {
        if (!set.has(oldId)) return;
        set.delete(oldId);
        set.add(newId);
    }

    /**
     * B-23 FR-6: the server now assigns `Space.Id` on create and ignores whatever local,
     * low-entropy `uid('space')` the optimistic push used — so once `createRemote`'s
     * create resolves, every place the store (and the current route) keys by that local
     * id must adopt the real one.
     *
     * `saveTimers`/`changeSets` are handled differently from the other maps: a timer
     * already scheduled under `oldId` captured `oldId` in its closure, so moving the map
     * entry alone would leave it calling `flush(oldId)` after the changeset has moved to
     * `newId` — it would find nothing to send and the staged edit would go unflushed
     * indefinitely (see `flush`'s creating-gate doc). Instead any pending timer is
     * cancelled outright, and if the moved changeset is non-empty, a fresh save is
     * scheduled under `newId` — the only variant with a closure that flushes the right id.
     *
     * B-23 review M1: the route is reconciled to `newId` *before* `space.id` itself
     * flips (see the `await router.replace` below), and it is awaited rather than
     * fire-and-forget. SpaceView keys `space = getById(props.id)` off the route
     * param; if `space.id` mutated first, `space` would go transiently `undefined`
     * (`getById(oldId)` no longer matches anything) while the route/`props.id` still
     * read `oldId` — Vue's reactive flush for that mutation runs (microtask) well
     * before router's async navigation resolves, so SpaceView's "space vanished"
     * watch would see `lastKnownId.value === props.id` (both still `oldId`) and
     * bounce the user to the dashboard right after they created the space. Landing
     * the route on `newId` first means `props.id` already reads `newId` when
     * `space.id` flips, so `getById(props.id)` finds it on the very next reactive
     * pass instead of missing it — and the earlier "route changed, store hasn't
     * caught up yet" moment fails that same `lastKnownId` check for the opposite
     * reason (ids no longer match), so it doesn't bounce either. Every other
     * space-keyed map is moved to `newId` before the navigation, not after, so the
     * contents-fetch watch that reruns on the `props.id` change (see SpaceView)
     * sees `newId` already marked loaded and does not spuriously re-fetch it.
     *
     * **FR-6 regression fix (confirmed live drive: permanent "Loading…" after
     * onboarding create).** M1's original guard read `router.currentRoute.value`
     * to decide whether to re-route — but that reflects the *settled* navigation,
     * not the *intended* one. `CreateSpaceView` calls `goToSpace(localId)`
     * (`router.push`, which resolves asynchronously) and this function can run
     * before that push has settled — observed live, where the API response beat
     * the router's own navigation. At that moment `currentRoute` still named the
     * onboarding wizard, the check came back false, the `router.replace` below
     * never fired, and the wizard's own `push(oldId)` landed afterwards — for
     * good, since by then `space.id` already read `newId` and nothing in the
     * store answered to `oldId`. This now checks `spaceRouteTarget`, a flag
     * `goToSpace` sets synchronously the instant navigation is *requested* —
     * immune to how far the router has actually gotten.
     */
    async function reconcileSpaceId(oldId: string, newId: string): Promise<void> {
        if (oldId === newId) return;

        moveSetEntry(contentsLoaded.value, oldId, newId);
        moveSetEntry(contentsLoading.value, oldId, newId);
        moveSetEntry(contentsFailed.value, oldId, newId);
        moveSetEntry(inFlight, oldId, newId);

        const scalarState = saveState.value.get(scalarKey(oldId));
        if (scalarState) {
            saveState.value.delete(scalarKey(oldId));
            saveState.value.set(scalarKey(newId), scalarState);
        }

        const timer = saveTimers.get(oldId);
        if (timer) {
            clearTimeout(timer);
            saveTimers.delete(oldId);
        }
        const cs = changeSets.get(oldId);
        if (cs) changeSets.delete(oldId);
        if (cs) changeSets.set(newId, cs);

        if (currentId.value === oldId) currentId.value = newId;

        // The onboarding flow navigates straight to `/spaces/{localId}` via `goToSpace`
        // — without this, the route would keep pointing at an id no space in the store
        // carries anymore, and SpaceView's "space vanished" watch would bounce the user
        // back to the dashboard right after they created it. Checked against the
        // navigation *intent* (`spaceRouteTarget`), not the settled route — see the
        // FR-6 regression note above.
        if (spaceRouteTarget === oldId) {
            spaceRouteTarget = newId;
            try {
                await router.replace({ name: 'space', params: { id: newId } });
            } catch (e) {
                console.error('[spaces] failed to reconcile route to server id', e);
            }
        }

        const space = spaces.value.find((s) => s.id === oldId);
        if (space) space.id = newId;

        if (cs && !isEmpty(cs)) scheduleSave(newId);
    }

    /**
     * Whole-space create (B-23 FR-6). The server assigns and returns the authoritative
     * `Space.Id`, ignoring the client's optimistic `uid('space')`. The optimistic push
     * into `spaces.value` already happened synchronously in the caller (`addSpace`/
     * `duplicateSpace`/the starter seed) — this only sends the request and, once it
     * resolves, adopts the server id via `reconcileSpaceId`.
     *
     * `creatingSpaces` gates `flush` for this space for the lifetime of the request —
     * any edit staged in that window still lands (see `reconcileSpaceId`'s reschedule),
     * it just can't be sent before the space's real id is known.
     */
    function createRemote(space: Space): void {
        const localId = space.id;
        creatingSpaces.add(localId);
        void api
            .create(space)
            .then((created) => {
                creatingSpaces.delete(localId);
                void reconcileSpaceId(localId, created.id);
            })
            .catch((e) => {
                creatingSpaces.delete(localId);
                handleCreateError(space, e);
            });
    }
    /** A deleted space can pull a badged sibling back under cap (B-25 FR-3) — refresh
     * the over-cap flags once the delete lands; skipped on Pro (`isInf`), where no
     * space can ever be badged. */
    function onSpaceDeleted(): void {
        if (!isInf(session.caps.spaces)) void refreshOverCapFlags();
    }

    function deleteRemote(id: string): void {
        const pending = saveTimers.get(id);
        if (pending) clearTimeout(pending);
        saveTimers.delete(id);
        changeSets.delete(id); // staged edits for a deleted space must never flush
        void api.remove(id).then(onSpaceDeleted).catch(handleDeleteError);
    }

    /**
     * Load page 1 of space summaries from the server; seed a starter fridge when the
     * account has none.
     *
     * Swallows its own error instead of rejecting (B-18 U-2) — deliberate. Two callers
     * depend on this: `App.vue`'s `void spaces.hydrate()` would otherwise leave an
     * unhandled promise rejection on a failed boot fetch, and `useAuth.consume`'s
     * `await spaces.hydrate(true)` would reject and let `LoginView.consumeToken`'s bare
     * `catch` misreport a spaces-fetch failure as "That sign-in link is invalid or has
     * expired" for a user whose tokens were in fact set. After the swallow, sign-in
     * always completes and the dashboard renders the real error panel + Retry instead.
     * Do not "fix" this back into a rethrow.
     *
     * Deliberately has no in-flight early-return: `useAuth.consume` awaits this call and
     * relies on it meaning "spaces are loaded" — an early-return would resolve instantly
     * and navigate to a still-empty dashboard.
     *
     * `hydrated` is only ever set true on success, inside the `try` — never on the
     * failure path — so a later `hydrate()` never short-circuits past a failed fetch,
     * and Retry always re-attempts the real request. The starter-fridge seed stays
     * inside the `try`, after that success transition, so a failed fetch can never
     * seed a phantom space.
     *
     * Concurrent calls (B-18 review M1): App.vue's boot call and useAuth.consume's
     * forced call can genuinely overlap for an already-signed-in user opening a fresh
     * magic link. Each call captures `hydrateEpoch` at its start and, once its fetch
     * resolves, writes state only if that epoch is still current — so a losing call
     * can never paint a stale status/dataset over a winner's, and a `reset()` mid-flight
     * orphans the pending call instead of letting it re-arm `hydrateStatus` afterwards.
     * This is not an in-flight early-return (still deliberately absent, see above) —
     * every call still runs its own fetch and its `await` still resolves normally.
     */
    async function hydrate(force = false): Promise<void> {
        if (hydrated.value && !force) return;
        const epoch = ++hydrateEpoch;
        hydrateStatus.value = 'loading';
        try {
            const key = spacesQueryKey(1);
            const result = force
                ? await api.listPage(1, PAGE_SIZE)
                : await queryClient.fetchQuery({ queryKey: key, queryFn: () => api.listPage(1, PAGE_SIZE) });
            // Superseded by a newer hydrate() or a reset() that ran while this call was
            // in flight — a losing call must not overwrite the winner's state or fire
            // the seed (B-18 review M1).
            if (epoch !== hydrateEpoch) return;
            if (force) queryClient.setQueryData(key, result);
            // Keep any fully-loaded space this page doesn't include (B-16 M1: a deep-link/
            // refresh fetched a page-2+ space directly, possibly concurrently with this
            // call) — a plain overwrite would silently undo that fetch.
            const freshIds = new Set(result.spaces.map((s) => s.id));
            const deepLinked = spaces.value.filter((s) => !freshIds.has(s.id) && contentsLoaded.value.has(s.id));
            spaces.value = [...result.spaces, ...deepLinked];
            total.value = result.total;
            loadedPage.value = result.page;
            hydrated.value = true;
            hydrateStatus.value = 'loaded';

            if (total.value === 0) {
                const starter = seedFridge();
                spaces.value.push(starter);
                contentsLoaded.value.add(starter.id);
                total.value += 1;
                createRemote(starter);
            }
        } catch (e) {
            console.error('[spaces] hydrate failed', e);
            if (epoch === hydrateEpoch) hydrateStatus.value = 'failed';
        }
    }

    /** Fetch the next page of summaries and append it (B-16 FR-6 "Load more"). */
    async function loadMoreSpaces(): Promise<void> {
        if (loadingMore || !hasMoreSpaces.value) return;
        loadingMore = true;
        try {
            const nextPage = loadedPage.value + 1;
            const key = spacesQueryKey(nextPage);
            const result = await queryClient.fetchQuery({
                queryKey: key,
                queryFn: () => api.listPage(nextPage, PAGE_SIZE),
            });
            spaces.value.push(...result.spaces);
            total.value = result.total;
            loadedPage.value = result.page;
        } finally {
            loadingMore = false;
        }
    }

    /**
     * FR-3 freshness action (B-25): re-fetch every summaries page already loaded and
     * merge only `overCap` (+ `total`) into the *existing* `Space` objects by id —
     * never push, remove, or replace one. This is what `hydrate(true)` is not allowed
     * to be here: a full re-sync replaces every `Space` object, and a `ChangeSet`
     * staged against an object this discarded would still flush and land silently
     * (the M2 hazard documented on `handleCreateError`). Merging by id sidesteps that
     * entirely — every object identity the rest of the store (and any in-flight
     * `ChangeSet`) already holds stays valid.
     *
     * A `hydrate()` already in flight defers this call instead of dropping it (see
     * `pendingFlagRefresh`, B-25 review N1) — its request may have been sent before
     * the event that triggered this refresh, so it can't be assumed to carry fresh
     * flags. No-ops (no defer either) when the store has never hydrated at all — there
     * is nothing local to merge into yet, and the next real `hydrate()` brings correct
     * flags from scratch.
     *
     * Captures `hydrateEpoch` before its first `await` and bails after every page's
     * `await` if it changed (B-25 review N2 — same pattern as `hydrate`'s own B-18 M1
     * guard): a `reset()` (sign-out) or a forced `hydrate()` starting mid-loop must not
     * let a late response merge stale flags onto post-reset/-rehydrate objects, or
     * stomp a newer `total`.
     *
     * Writes each refetched page back into the TanStack cache (B-25 review N3, same as
     * `hydrate(force)`) so `spacesQueryKey(page)` can't keep serving pre-refresh flags
     * for the rest of its `staleTime`.
     *
     * Swallows its own errors — a failed refresh just leaves the previous flags in
     * place; nothing the user changed failed to save, so this never raises
     * `saveMessage`, and the server's 403 backstop still protects every mutation in
     * the meantime.
     */
    async function refreshOverCapFlags(): Promise<void> {
        if (hydrateStatus.value === 'loading') {
            pendingFlagRefresh = true;
            return;
        }
        if (!hydrated.value) return;
        const epoch = hydrateEpoch;
        try {
            for (let page = 1; page <= loadedPage.value; page++) {
                const result = await api.listPage(page, PAGE_SIZE);
                if (epoch !== hydrateEpoch) return;
                queryClient.setQueryData(spacesQueryKey(page), result);
                for (const summary of result.spaces) {
                    const existing = getById(summary.id);
                    if (existing) existing.overCap = summary.overCap;
                }
                total.value = result.total;
            }
        } catch (e) {
            console.error('[spaces] over-cap refresh failed', e);
        }
    }

    // Replays a refresh that arrived while a hydrate was in flight (B-25 review N1)
    // once that hydrate settles — success or failure — since `refreshOverCapFlags`
    // re-validates `hydrated`/`hydrateStatus` itself, so a replay after a no-op/failed
    // hydrate is harmless.
    watch(hydrateStatus, (status) => {
        if (status === 'loading' || !pendingFlagRefresh) return;
        pendingFlagRefresh = false;
        void refreshOverCapFlags();
    });

    // FR-3: a downgrade can badge spaces that were fetched under Pro (all `overCap:
    // false`) — the refetch above is what discovers the new badge set. An upgrade
    // needs no watch trigger at all: `useLimits.readonlySpaceIds` keeps its `isInf`
    // early-return, so stale `overCap: true` flags are structurally invisible on Pro.
    //
    // Watches `session.plan` for a plan change the SPA only learns about after the
    // fact (a scheduled-cancel webhook flip delivered via a later `AuthResponse`) and
    // `session.planChangeEpoch` for `setPlan`'s own round-trip settling (B-25 review
    // M1) — the epoch, not the optimistic `plan` flip itself, because `setPlan` sets
    // `user.value.plan` *before* `POST /api/account` resolves, so a plan-only watch
    // fires the refetch while the change is still in flight and can race it to a
    // stale answer. `planChangeEpoch` only bumps once every branch of `setPlan` (incl.
    // reverts) has already applied its final plan value, so this refetch always runs
    // against a settled plan. Both sources stay watched: `plan` alone still covers the
    // webhook-flip case, where no epoch bump ever happens locally.
    watch([() => session.plan, () => session.planChangeEpoch], () => {
        void refreshOverCapFlags();
    });

    /**
     * Fetch one space's full (photo-less) zone/item graph — no-op if already loaded or
     * in flight. A client-created space (seeded/added/duplicated) is pre-marked loaded
     * (see `addSpace`/`duplicateSpace`/`hydrate`'s starter seed) so opening it never
     * fires a fetch that would clobber its unsynced local edits.
     *
     * B-16 M1: if `id` isn't in the loaded summary pages (a deep-link or refresh to a
     * space beyond page 1), `getById` returns null — rather than treating that as
     * unknown, this fetches the space directly via `GET /{id}` and inserts the result
     * into `spaces.value`, so the caller (`SpaceView`'s watch) never has to redirect a
     * space that genuinely exists. B-26: that direct `GET /{id}` fetch now carries the
     * server's own `IsOverCap` too (`toSpace`), so a deep-linked space is badged
     * read-only on first paint without any list fetch ever having run.
     *
     * Returns 'not-found' only on a confirmed 404 (safe to redirect away from);
     * any other failure returns 'error' and leaves `isContentsFailed(id)` true so the
     * caller can render a retry affordance instead of an infinite spinner (review N1).
     */
    async function loadSpaceContents(id: string): Promise<ContentsLoadResult> {
        if (contentsLoaded.value.has(id)) return 'ok';
        if (contentsLoading.value.has(id)) return 'ok';
        contentsLoading.value.add(id);
        contentsFailed.value.delete(id); // a retry clears any previous failure
        try {
            const full = await queryClient.fetchQuery({
                queryKey: spaceContentsKey(id),
                queryFn: () => api.get(id),
            });
            const existing = getById(id);
            if (existing) {
                existing.zones = full.zones;
                existing.items = full.items;
                // B-26: `GET /{id}` now carries the server's own over-cap truth — merge it
                // onto the existing object (never replace) per the same merge-only contract
                // `refreshOverCapFlags` follows, so this fresher point-in-time read can only
                // correct the badge, not disturb any in-flight `ChangeSet`'s object identity.
                existing.overCap = full.overCap;
                refreshSummary(existing);
            } else {
                spaces.value.push(full);
            }
            contentsLoaded.value.add(id);
            return 'ok';
        } catch (e) {
            if (isNotFoundError(e)) return 'not-found';
            console.error('[spaces] failed to load space contents', e);
            contentsFailed.value.add(id);
            return 'error';
        } finally {
            contentsLoading.value.delete(id);
        }
    }

    /** Clear all local + cached state on sign-out. */
    function reset(): void {
        saveTimers.forEach((t) => clearTimeout(t));
        saveTimers.clear();
        changeSets.clear();
        inFlight.clear();
        creatingSpaces.clear();
        saveState.value.clear();
        saveMessage.value = null;
        spaces.value = [];
        currentId.value = null;
        hydrated.value = false;
        hydrateStatus.value = 'idle';
        hydrateEpoch++; // orphan any in-flight hydrate() — it must not re-arm status/data after sign-out
        total.value = 0;
        loadedPage.value = 0;
        contentsLoaded.value = new Set();
        contentsLoading.value = new Set();
        contentsFailed.value = new Set();
        queryClient.removeQueries({ queryKey: ['spaces'] });
        queryClient.removeQueries({ queryKey: ['space'] });
    }

    // ---- spaces ----

    /**
     * Navigate to a space's route, recording the navigation *intent* synchronously
     * (B-23 FR-6 regression fix) so `reconcileSpaceId` can re-route correctly even
     * if it runs before this `router.push` has settled — see `spaceRouteTarget`
     * and `reconcileSpaceId`'s doc. Callers (`CreateSpaceView`, `DashboardView`)
     * must use this instead of calling `router.push` themselves for the space route.
     */
    function goToSpace(id: string): void {
        spaceRouteTarget = id;
        currentId.value = id;
        void router.push({ name: 'space', params: { id } });
    }

    /** Append a freshly built space (from the onboarding flow). Returns its id. */
    function addSpace(space: Space): string {
        spaces.value.push(space);
        // Fully built client-side already — never re-fetch its contents (see loadSpaceContents doc).
        contentsLoaded.value.add(space.id);
        total.value += 1;
        createRemote(space);
        return space.id;
    }

    function renameSpace(id: string, name: string): void {
        const space = getById(id);
        if (space) {
            const trimmed = name.trim() || space.name;
            stageUpdate(getOrCreateChangeSet(id), 'space', space, { name: trimmed });
            scheduleSave(id);
        }
    }

    /**
     * Deep-copy a space with fresh ids on the space, zones and items. Returns the new
     * id, or `null` if the source space no longer exists or its contents couldn't be
     * loaded.
     *
     * The dashboard can duplicate a space whose contents were never opened (B-16 lazy
     * load leaves `zones`/`items` empty until then) — load them first, or the copy
     * would silently come out empty. Review N2: if that load fails, abort instead of
     * POSTing an empty copy of a space that actually has contents.
     */
    async function duplicateSpace(id: string): Promise<string | null> {
        const result = await loadSpaceContents(id);
        if (result !== 'ok') return null;
        const orig = getById(id);
        if (!orig) return null;

        const zoneIdMap = new Map<string, string>();
        const zones = orig.zones.map((z) => {
            const newId = uid('zone');
            zoneIdMap.set(z.id, newId);
            return { ...z, id: newId, rect: z.rect ? { ...z.rect } : null };
        });
        const items = orig.items.map((it) => ({
            ...it,
            id: uid('item'),
            zoneId: zoneIdMap.get(it.zoneId) ?? it.zoneId,
            tags: [...it.tags],
        }));

        const copy: Space = {
            ...orig,
            id: uid('space'),
            name: `${orig.name} copy`,
            columnLabels: orig.columnLabels ? [...orig.columnLabels] : null,
            zones,
            items,
            ...summarize(zones, items),
            // A create is always cap-gated (checkAddSpace), so a brand-new space can
            // never be born over-cap — never clone a stale flag from `...orig` (B-25).
            overCap: false,
        };

        const idx = spaces.value.findIndex((s) => s.id === id);
        spaces.value.splice(idx + 1, 0, copy);
        // Fully built client-side already — never re-fetch its contents.
        contentsLoaded.value.add(copy.id);
        total.value += 1;
        createRemote(copy);
        return copy.id;
    }

    function deleteSpace(id: string): void {
        spaces.value = spaces.value.filter((s) => s.id !== id);
        if (currentId.value === id) currentId.value = null;
        total.value = Math.max(0, total.value - 1);
        contentsLoaded.value.delete(id);
        contentsLoading.value.delete(id);
        contentsFailed.value.delete(id);
        deleteRemote(id);
    }

    // ---- items ----

    /** Smart add: parse "milk, top shelf x2", resolve the zone (hint or first), append. */
    function addItemSmart(spaceId: string, raw: string): Item | null {
        const space = getById(spaceId);
        if (!space || !space.zones.length || !raw.trim()) return null;
        const { name, zoneHint, quantity } = parseAdd(raw);
        if (!name) return null;
        const zone = matchZone(zoneHint, space.zones, space.type) ?? space.zones[0]!;
        const item = makeItem(space, name, zone.id, quantity);
        space.items.push(item);
        refreshSummary(space);
        stageAdd(getOrCreateChangeSet(spaceId), 'item', item);
        scheduleSave(spaceId);
        return item;
    }

    function addItemStructured(
        spaceId: string,
        name: string,
        zoneId: string,
        quantity: number
    ): Item | null {
        const space = getById(spaceId);
        if (!space || !name.trim()) return null;
        const item = makeItem(space, name.trim(), zoneId, quantity);
        space.items.push(item);
        refreshSummary(space);
        stageAdd(getOrCreateChangeSet(spaceId), 'item', item);
        scheduleSave(spaceId);
        return item;
    }

    function removeItem(spaceId: string, itemId: string): void {
        const space = getById(spaceId);
        const item = space?.items.find((it) => it.id === itemId);
        if (space && item) {
            space.items = space.items.filter((it) => it.id !== itemId);
            refreshSummary(space);
            stageDelete(getOrCreateChangeSet(spaceId), 'item', item);
            scheduleSave(spaceId);
        }
    }

    function updateItem(spaceId: string, itemId: string, patch: Partial<Item>): void {
        const space = getById(spaceId);
        const item = space?.items.find((it) => it.id === itemId);
        if (item) {
            stageUpdate(getOrCreateChangeSet(spaceId), 'item', item, patch);
            scheduleSave(spaceId);
        }
    }

    function setViewMode(spaceId: string, mode: ViewMode): void {
        const space = getById(spaceId);
        if (space) {
            stageUpdate(getOrCreateChangeSet(spaceId), 'space', space, { viewMode: mode });
            scheduleSave(spaceId);
        }
    }

    // ---- zones (layout editor) ----

    /** Add a shelf to a column (structured/columns mode). Returns the new zone. */
    function addZoneColumn(spaceId: string, column: number): Zone | null {
        const space = getById(spaceId);
        if (!space) return null;
        const zone = makeZone({
            position: space.zones.length + 1,
            colorIndex: space.zones.length,
            column,
        });
        space.zones.push(zone);
        refreshSummary(space);
        stageAdd(getOrCreateChangeSet(spaceId), 'zone', zone);
        scheduleSave(spaceId);
        return zone;
    }

    /** Add a drawn zone on the free canvas. Returns the new zone. */
    function addZoneFree(spaceId: string, rect: Rect, kind: ZoneKind): Zone | null {
        const space = getById(spaceId);
        if (!space) return null;
        const zone = makeZone({
            position: space.zones.length + 1,
            colorIndex: space.zones.length,
            kind,
            rect,
        });
        space.zones.push(zone);
        refreshSummary(space);
        stageAdd(getOrCreateChangeSet(spaceId), 'zone', zone);
        scheduleSave(spaceId);
        return zone;
    }

    function updateZone(spaceId: string, zoneId: string, patch: Partial<Zone>): void {
        const space = getById(spaceId);
        const zone = space?.zones.find((z) => z.id === zoneId);
        if (zone) {
            stageUpdate(getOrCreateChangeSet(spaceId), 'zone', zone, patch);
            scheduleSave(spaceId);
        }
    }

    /** Delete a zone and any items inside it. */
    function deleteZone(spaceId: string, zoneId: string): void {
        const space = getById(spaceId);
        if (!space) return;
        const zone = space.zones.find((z) => z.id === zoneId);
        if (!zone) return;
        const itemsInZone = space.items.filter((it) => it.zoneId === zoneId);
        space.zones = space.zones.filter((z) => z.id !== zoneId);
        space.items = space.items.filter((it) => it.zoneId !== zoneId);
        refreshSummary(space);
        stageZoneDelete(getOrCreateChangeSet(spaceId), zone, itemsInZone);
        scheduleSave(spaceId);
    }

    /** Switch a columns-mode space to the free canvas, flowing existing zones into place. */
    function convertToFreeform(spaceId: string): void {
        const space = getById(spaceId);
        if (!space) return;
        const cs = getOrCreateChangeSet(spaceId);
        stageUpdate(cs, 'space', space, {
            canvasMode: 'freeform',
            layoutColumns: 1,
            columnLabels: null,
        });
        // Escape hatch: snapshot every zone before `flowFreeform` mutates their rects
        // in place, so a rejected flush can still restore each zone's prior rect.
        for (const zone of space.zones) {
            snapshotForUpdate(cs, 'zone', zone);
        }
        flowFreeform(space.zones);
        scheduleSave(spaceId);
    }

    return {
        spaces,
        currentId,
        count,
        hasMoreSpaces,
        currentSpace,
        hydrated,
        isHydrating,
        isHydrateFailed,
        saveState,
        saveMessage,
        dismissSaveMessage,
        getById,
        hydrate,
        loadMoreSpaces,
        refreshOverCapFlags,
        loadSpaceContents,
        isContentsLoading,
        isContentsLoaded,
        isContentsFailed,
        reset,
        goToSpace,
        addSpace,
        renameSpace,
        duplicateSpace,
        deleteSpace,
        addItemSmart,
        addItemStructured,
        removeItem,
        updateItem,
        setViewMode,
        addZoneColumn,
        addZoneFree,
        updateZone,
        deleteZone,
        convertToFreeform,
    };
});
