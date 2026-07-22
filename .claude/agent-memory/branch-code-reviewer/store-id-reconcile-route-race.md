---
name: store-id-reconcile-route-race
description: Reconciling a store's optimistic temp id to a server id races SpaceView's "space vanished" route watch — the vanish-watch flushes before router navigation updates props.id
metadata:
  type: project
---

When `useSpacesStore.reconcileSpaceId(oldId, newId)` mutates `space.id = newId` and then calls `router.replace(newId)`, SpaceView's `space = computed(() => getById(props.id))` transiently resolves to `undefined` — because Vue schedules the `watch(space)` job the instant `space.id` mutates, but `router.replace` updates `props.id` only after async navigation settles (several microtasks later). At that flush, `getById(oldId)` is undefined and `lastKnownId === props.id` (both oldId), so SpaceView (`SpaceView.vue:185-196`) fires `router.replace({name:'spaces'})` and bounces the user to the dashboard right after onboarding create. Analysis says deterministic on the `CreateSpaceView` flow (addSpace → push to /spaces/{localId} → create resolves → reconcile); duplicate-from-dashboard is exempt (stays on dashboard).

**Why:** the store agent added the `router.replace` follow-up (correctly, to stop the vanish-watch bounce) but landed the route AFTER mutating the store id, inverting the safe order. First flagged in B-23 review; unconfirmed at runtime (no browser tool in-agent, and B-23's own manual-drive checkbox was left unchecked).

**How to apply:** whenever a store reconciles a route-bearing id (optimistic→server id) AND a view watches `getById(routeParam)` with a "vanished → redirect" guard, check the ordering: the route must land on the new id BEFORE the store object's id mutates, or the view's watch must tolerate an in-flight reconcile (a `reconcilingSpaces` flag / accept old|new id). Any transient `getById(props.id) === undefined` window trips the redirect. Related: [[review_recurring-frontend-findings]].
