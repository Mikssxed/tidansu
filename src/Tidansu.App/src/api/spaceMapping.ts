import type { ItemDto, SpaceDto, SpaceFieldsDto, SpaceReadDto, SpaceSummaryDto, ZoneDto } from '@/api/apiClient/models';
import type { IconName } from '@/components/icons';
import { summarize } from '@/data/spaces';
import type {
    CanvasMode,
    Item,
    ItemDepth,
    Space,
    SpaceTypeId,
    ViewMode,
    Zone,
    ZoneColor,
    ZoneFacing,
    ZoneKind,
} from '@/data/types';

/**
 * Bridges the generated Kiota DTOs and the app's `Space` types (data/types.ts).
 * Field names line up by design (item 1), so this mostly normalises nullability —
 * notably `rect`, which the generated `ZoneDto` types as non-null but the server
 * round-trips as null for columns-mode zones.
 *
 * `dto` is `SpaceReadDto` — the sole response shape for `GET /api/spaces/{id}` and
 * `POST /api/spaces` as of B-26 — so `isOverCap` is the server's authoritative,
 * point-in-time over-cap truth for this space (computed with the same
 * `PlanPolicy.CheckSpaceContentMutation` predicate `SpaceOverCapGuard` enforces
 * with; never derive it client-side). This supersedes B-25 T-6, which deliberately
 * left the flag unmapped here because the endpoint didn't carry it yet.
 */
export function toSpace(dto: SpaceReadDto): Space {
    const zones = (dto.zones ?? []).map(toZone);
    const items = (dto.items ?? []).map(toItem);
    return {
        id: dto.id,
        name: dto.name,
        type: dto.type as SpaceTypeId,
        viewMode: dto.viewMode as ViewMode,
        canvasMode: dto.canvasMode as CanvasMode,
        layoutColumns: dto.layoutColumns,
        columnLabels: dto.columnLabels ?? null,
        zones,
        items,
        // The full-graph DTO carries no summary fields — derive them from the
        // graph that just arrived, same shape the server's summary projects.
        ...summarize(zones, items),
        overCap: dto.isOverCap ?? false,
    };
}

/**
 * Maps the paginated list read (`GET /api/spaces`) — a `SpaceSummaryDto` carries no
 * `zones`/`items` (B-16 SC-3: the list never ships item/photo payloads), so those
 * stay empty until `SpaceView` opens the space and lazy-loads its full contents.
 */
export function toSpaceSummary(dto: SpaceSummaryDto): Space {
    return {
        id: dto.id,
        name: dto.name,
        type: dto.type as SpaceTypeId,
        viewMode: dto.viewMode as ViewMode,
        canvasMode: dto.canvasMode as CanvasMode,
        layoutColumns: dto.layoutColumns,
        columnLabels: dto.columnLabels ?? null,
        zones: [],
        items: [],
        itemCount: dto.itemCount,
        zoneCount: dto.zoneCount,
        previewColors: (dto.previewColors ?? []) as ZoneColor[],
        overCap: dto.isOverCap ?? false,
    };
}

export function toZone(z: ZoneDto): Zone {
    return {
        id: z.id,
        position: z.position,
        label: z.label ?? null,
        color: z.color as ZoneColor,
        gridCols: z.gridCols,
        gridRows: z.gridRows,
        hasDepth: z.hasDepth,
        floor: z.floor,
        kind: z.kind as ZoneKind,
        facing: z.facing as ZoneFacing,
        levels: z.levels,
        column: z.column,
        // Runtime null despite the generated type; columns zones have no rect.
        rect: z.rect ? { x: z.rect.x, y: z.rect.y, w: z.rect.w, h: z.rect.h } : null,
    };
}

export function toItem(i: ItemDto): Item {
    return {
        id: i.id,
        name: i.name,
        zoneId: i.zoneId,
        quantity: i.quantity,
        tags: i.tags ?? [],
        dateAdded: i.dateAdded,
        expiry: i.expiry ?? null,
        photo: i.photo ?? null,
        slotIndex: i.slotIndex ?? null,
        depth: i.depth as ItemDepth,
        level: i.level,
        icon: (i.icon as IconName) ?? null,
    };
}

/** Our `Space` is structurally a valid request body; cast over the rect nullability gap. */
export function toDtoBody(space: Space): SpaceDto {
    return {
        id: space.id,
        name: space.name,
        type: space.type,
        viewMode: space.viewMode,
        canvasMode: space.canvasMode,
        layoutColumns: space.layoutColumns,
        columnLabels: space.columnLabels,
        zones: space.zones.map(toZoneDtoBody),
        items: space.items.map(toItemDtoBody),
    };
}

/** Request body for `PUT /api/spaces/{id}/zones/{zoneId}` and the `POST` add. */
export function toZoneDtoBody(zone: Zone): ZoneDto {
    // Cast over the rect nullability gap — see the module doc comment.
    return { ...zone, rect: zone.rect } as unknown as ZoneDto;
}

/** Request body for `PUT /api/spaces/{id}/items/{itemId}` and the `POST` add. */
export function toItemDtoBody(item: Item): ItemDto {
    return { ...item } as unknown as ItemDto;
}

/** Request body for `PUT /api/spaces/{id}/fields` — the space's scalar fields only. */
export function toSpaceFieldsBody(space: Space): SpaceFieldsDto {
    return {
        name: space.name,
        type: space.type,
        viewMode: space.viewMode,
        canvasMode: space.canvasMode,
        layoutColumns: space.layoutColumns,
        columnLabels: space.columnLabels,
    };
}
