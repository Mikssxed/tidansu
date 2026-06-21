import type { ItemDto, SpaceDto, ZoneDto } from '@/api/apiClient/models';
import type { IconName } from '@/components/icons';
import type {
    CanvasMode,
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
 */
export function toSpace(dto: SpaceDto): Space {
    return {
        id: dto.id,
        name: dto.name,
        type: dto.type as SpaceTypeId,
        viewMode: dto.viewMode as ViewMode,
        canvasMode: dto.canvasMode as CanvasMode,
        layoutColumns: dto.layoutColumns,
        columnLabels: dto.columnLabels ?? null,
        zones: (dto.zones ?? []).map(toZone),
        items: (dto.items ?? []).map((i) => ({
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
        })),
    };
}

function toZone(z: ZoneDto): Zone {
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
        zones: space.zones.map((z) => ({ ...z, rect: z.rect })) as unknown as ZoneDto[],
        items: space.items.map((i) => ({ ...i })) as unknown as ItemDto[],
    };
}
