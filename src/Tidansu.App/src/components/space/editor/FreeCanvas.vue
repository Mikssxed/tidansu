<template>
    <div class="overflow-auto rounded-card border border-border bg-bg">
        <div
            ref="canvas"
            class="relative"
            :class="cursorClass"
            :style="canvasStyle"
            @pointerdown="onCanvasPointerDown"
        >
            <div
                v-for="z in renderZones"
                :key="z.id"
                data-zone
                class="absolute select-none rounded-ctrl border bg-surface p-2"
                :class="z.boxClass"
                :style="z.style"
                @pointerdown="onZonePointerDown($event, z.id)"
            >
                <div class="flex items-center gap-1.5">
                    <span
                        class="size-2.5 rounded-[3px]"
                        :class="z.accentClass"
                    />
                    <span class="truncate text-[13px] font-semibold text-text">{{ z.name }}</span>
                </div>
                <div class="mt-0.5 truncate text-[11px] text-text-3">{{ z.meta }}</div>
                <div
                    v-if="z.showLevels"
                    class="mt-1 flex flex-col gap-0.5"
                >
                    <i
                        v-for="n in z.levelBars"
                        :key="n"
                        class="h-1 w-10 rounded-chip"
                        :class="z.accentClass"
                    />
                </div>
                <div
                    v-if="z.showFacing"
                    class="mt-1 flex items-center gap-1 text-[10px] text-text-3"
                >
                    <BaseIcon
                        name="columns"
                        :size="11"
                    />
                    {{ z.facingLabel }}
                </div>
                <div
                    v-if="z.selected"
                    class="absolute bottom-0 right-0 flex size-4 cursor-se-resize items-center justify-center rounded-tl-ctrl bg-surface-3 text-text-2"
                    @pointerdown="onResizePointerDown($event, z.id)"
                >
                    <BaseIcon
                        name="chevRight"
                        :size="12"
                    />
                </div>
            </div>

            <div
                v-if="showGhost"
                class="pointer-events-none absolute rounded-ctrl border border-dashed border-text-3 bg-surface-2/40"
                :style="ghostStyle"
            />

            <div
                v-if="showHint"
                class="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 text-center text-[13px] text-text-3"
            >
                <BaseIcon
                    name="square"
                    :size="22"
                    class="mx-auto opacity-50"
                />
                <p class="mt-2">Pick a tool on the left, then drag here to draw a zone.</p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { zoneName } from '@/data/spaces';
    import type { Rect, Space, ZoneKind } from '@/data/types';
    import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

    interface Props {
        space: Space;
        selectedZoneId: string | null;
        tool: string;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{
        selectZone: [id: string | null];
        updateZone: [id: string, patch: { rect: Rect }];
        deleteZone: [id: string];
        addZoneFree: [rect: Rect, kind: ZoneKind];
    }>();

    const UNIT = 24;
    const snap = (v: number) => Math.round(v / UNIT) * UNIT;

    const canvas = ref<HTMLElement | null>(null);
    const ghost = ref<Rect | null>(null);
    const live = ref<{ id: string; rect: Rect } | null>(null);

    type Drag =
        | { type: 'draw'; startX: number; startY: number }
        | { type: 'move'; id: string; startX: number; startY: number; orig: Rect }
        | { type: 'resize'; id: string; startX: number; startY: number; orig: Rect };
    let drag: Drag | null = null;

    function localPt(e: PointerEvent) {
        const r = canvas.value!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onPointerMove(e: PointerEvent) {
        if (!drag) return;
        const p = localPt(e);
        if (drag.type === 'draw') {
            const x = Math.min(drag.startX, p.x);
            const y = Math.min(drag.startY, p.y);
            ghost.value = {
                x: snap(x),
                y: snap(y),
                w: snap(Math.abs(p.x - drag.startX)),
                h: snap(Math.abs(p.y - drag.startY)),
            };
        } else if (drag.type === 'move') {
            live.value = {
                id: drag.id,
                rect: {
                    ...drag.orig,
                    x: Math.max(0, snap(drag.orig.x + p.x - drag.startX)),
                    y: Math.max(0, snap(drag.orig.y + p.y - drag.startY)),
                },
            };
        } else {
            live.value = {
                id: drag.id,
                rect: {
                    ...drag.orig,
                    w: Math.max(UNIT * 5, snap(drag.orig.w + p.x - drag.startX)),
                    h: Math.max(UNIT * 4, snap(drag.orig.h + p.y - drag.startY)),
                },
            };
        }
    }

    function onPointerUp() {
        if (!drag) return;
        const g = ghost.value;
        const lv = live.value;
        if (drag.type === 'draw' && g && g.w >= UNIT * 4 && g.h >= UNIT * 3) {
            const kind: ZoneKind =
                props.tool === 'floor' ? 'floor' : props.tool === 'drawer' ? 'drawer' : 'shelf';
            emit('addZoneFree', { ...g }, kind);
        } else if ((drag.type === 'move' || drag.type === 'resize') && lv) {
            emit('updateZone', lv.id, { rect: lv.rect });
        }
        drag = null;
        ghost.value = null;
        live.value = null;
    }

    onMounted(() => {
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    });
    onBeforeUnmount(() => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
    });

    function onCanvasPointerDown(e: PointerEvent) {
        if (!['draw', 'drawer', 'floor'].includes(props.tool)) {
            emit('selectZone', null);
            return;
        }
        if ((e.target as HTMLElement).closest('[data-zone]')) return;
        const p = localPt(e);
        drag = { type: 'draw', startX: p.x, startY: p.y };
        ghost.value = { x: snap(p.x), y: snap(p.y), w: 0, h: 0 };
    }

    function onZonePointerDown(e: PointerEvent, id: string) {
        e.stopPropagation();
        if (props.tool === 'delete') {
            emit('deleteZone', id);
            return;
        }
        emit('selectZone', id);
        if (props.tool === 'move') {
            const zone = props.space.zones.find((z) => z.id === id);
            if (!zone?.rect) return;
            const p = localPt(e);
            drag = { type: 'move', id, startX: p.x, startY: p.y, orig: { ...zone.rect } };
        }
    }

    function onResizePointerDown(e: PointerEvent, id: string) {
        e.stopPropagation();
        const zone = props.space.zones.find((z) => z.id === id);
        if (!zone?.rect) return;
        const p = localPt(e);
        drag = { type: 'resize', id, startX: p.x, startY: p.y, orig: { ...zone.rect } };
    }

    const positioned = computed(() =>
        props.space.zones.filter((z): z is typeof z & { rect: Rect } => z.rect !== null)
    );

    function rectOf(id: string, fallback: Rect): Rect {
        return live.value?.id === id ? live.value.rect : fallback;
    }

    const renderZones = computed(() =>
        positioned.value.map((z) => {
            const r = rectOf(z.id, z.rect);
            const selected = z.id === props.selectedZoneId;
            const itemCount = props.space.items.filter((it) => it.zoneId === z.id).length;
            const meta = z.floor
                ? 'floor · ground'
                : `${(z.levels || 1) > 1 ? `${z.levels} levels · ` : ''}${itemCount} items${z.hasDepth ? ' · front/back' : ''}`;
            return {
                id: z.id,
                selected,
                accentClass: zoneBgClasses[z.color],
                boxClass: `${selected ? 'border-text ring-1 ring-text' : 'border-border'} ${
                    props.tool === 'move' ? 'cursor-move' : ''
                } ${z.floor ? 'border-dashed' : ''}`,
                style: {
                    left: `${r.x}px`,
                    top: `${r.y}px`,
                    width: `${r.w}px`,
                    height: `${r.h}px`,
                },
                name: zoneName(z, props.space.type),
                meta,
                showLevels: !z.floor && (z.levels || 1) > 1,
                levelBars: Math.min(z.levels || 1, 10),
                showFacing: !z.floor,
                facingLabel: `${z.facing || 'front'} wall`,
            };
        })
    );

    const showGhost = computed(() => ghost.value !== null && ghost.value.w > 4);
    const ghostStyle = computed(() => {
        const g = ghost.value!;
        return { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` };
    });

    const showHint = computed(() => positioned.value.length === 0 && ghost.value === null);

    const cursorClass = computed(() =>
        ['draw', 'drawer', 'floor'].includes(props.tool) ? 'cursor-crosshair' : 'cursor-default'
    );

    const canvasStyle = computed(() => {
        const bottoms = positioned.value.map((z) => {
            const r = rectOf(z.id, z.rect);
            return r.y + r.h;
        });
        const ghostBottom = ghost.value ? ghost.value.y + ghost.value.h : 0;
        const h = Math.max(360, ...bottoms, ghostBottom) + 64;
        // 24px (UNIT) alignment grid drawn with two faint hairline gradients.
        const line = 'var(--color-border-faint)';
        return {
            minHeight: `${h}px`,
            backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
            backgroundSize: `${UNIT}px ${UNIT}px`,
        };
    });
</script>
