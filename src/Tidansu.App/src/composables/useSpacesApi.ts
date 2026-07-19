import {
    toDtoBody,
    toItem,
    toItemDtoBody,
    toSpace,
    toSpaceFieldsBody,
    toSpaceSummary,
    toZone,
    toZoneDtoBody,
} from '@/api/spaceMapping';
import { useApiClient } from '@/composables/useApiClient';
import type { PaywallReason } from '@/data/paywall';
import type { Item, Space, Zone } from '@/data/types';

const PAYWALL_REASONS: PaywallReason[] = ['spaces', 'zones', 'items', 'photos', 'sync'];

/**
 * Pulls the plan-limit reason out of a server 403. The body is
 * `{ errors: { plan: [reason] } }`, which Kiota surfaces on the thrown error's
 * `additionalData` (deserialised as ProblemDetails). Returns null when absent.
 */
export function planReasonOf(error: unknown): PaywallReason | null {
    const additional = (error as { additionalData?: Record<string, unknown> })?.additionalData;
    const errors = additional?.errors as { plan?: unknown } | undefined;
    const reason = Array.isArray(errors?.plan) ? errors!.plan[0] : undefined;
    return PAYWALL_REASONS.includes(reason as PaywallReason) ? (reason as PaywallReason) : null;
}

/**
 * True when a thrown Kiota error is a 404 — e.g. `GET /api/spaces/{id}` for a space
 * the caller doesn't own or that no longer exists (B-16 M1 deep-link fallback).
 */
export function isNotFoundError(error: unknown): boolean {
    return (error as { responseStatusCode?: number })?.responseStatusCode === 404;
}

/** One page of the slimmed spaces list — no zones/items/photos (B-16 SC-3). */
export interface SpacesPage {
    spaces: Space[];
    total: number;
    page: number;
    pageSize: number;
}

/** Thin wrapper over the generated spaces endpoints, mapping to/from the app `Space` type. */
export function useSpacesApi() {
    const client = useApiClient();

    return {
        /** `GET /api/spaces?page&pageSize` — dashboard summaries only, paginated. */
        async listPage(page: number, pageSize: number): Promise<SpacesPage> {
            const res = await client.api.spaces.get({ queryParameters: { page, pageSize } });
            const data = res?.data;
            return {
                spaces: (data?.items ?? []).map(toSpaceSummary),
                total: data?.totalCount ?? 0,
                page: data?.page ?? page,
                pageSize: data?.pageSize ?? pageSize,
            };
        },
        /** `GET /api/spaces/{id}` — the full (photo-less) layout graph for one space. */
        async get(id: string): Promise<Space> {
            const res = await client.api.spaces.byId(id).get();
            if (!res?.data) throw new Error(`Space ${id} not found`);
            return toSpace(res.data);
        },
        async create(space: Space): Promise<Space> {
            const res = await client.api.spaces.post(toDtoBody(space));
            return res?.data ? toSpace(res.data) : space;
        },
        async remove(id: string): Promise<void> {
            await client.api.spaces.byId(id).delete();
        },
        /**
         * `PUT .../fields` returns a `SpaceFieldsDto`, not a whole space — the caller
         * already holds the scalars it just sent, so there is nothing to re-hydrate.
         */
        async updateFields(spaceId: string, space: Space): Promise<void> {
            await client.api.spaces.byId(spaceId).fields.put(toSpaceFieldsBody(space));
        },
        async addZone(spaceId: string, zone: Zone): Promise<Zone> {
            const res = await client.api.spaces.byId(spaceId).zones.post(toZoneDtoBody(zone));
            return res?.data ? toZone(res.data) : zone;
        },
        async updateZone(spaceId: string, zone: Zone): Promise<Zone> {
            const res = await client.api.spaces.byId(spaceId).zones.byZoneId(zone.id).put(toZoneDtoBody(zone));
            return res?.data ? toZone(res.data) : zone;
        },
        async removeZone(spaceId: string, zoneId: string): Promise<void> {
            await client.api.spaces.byId(spaceId).zones.byZoneId(zoneId).delete();
        },
        async addItem(spaceId: string, item: Item): Promise<Item> {
            const res = await client.api.spaces.byId(spaceId).items.post(toItemDtoBody(item));
            return res?.data ? toItem(res.data) : item;
        },
        async updateItem(spaceId: string, item: Item): Promise<Item> {
            const res = await client.api.spaces.byId(spaceId).items.byItemId(item.id).put(toItemDtoBody(item));
            return res?.data ? toItem(res.data) : item;
        },
        async removeItem(spaceId: string, itemId: string): Promise<void> {
            await client.api.spaces.byId(spaceId).items.byItemId(itemId).delete();
        },
    };
}
