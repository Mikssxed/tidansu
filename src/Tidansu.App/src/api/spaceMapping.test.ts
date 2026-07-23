import { describe, expect, it } from 'vitest';

import type { SpaceReadDto, SpaceSummaryDto } from '@/api/apiClient/models';
import { toSpace, toSpaceSummary } from '@/api/spaceMapping';

// B-26 review N1: `overCap` is optional on `Space`, so the load-bearing
// `overCap: dto.isOverCap ?? false` lines are invisible to vue-tsc and to the
// store suites (which mock above the mapper). Pin them here at the pure-mapper
// level so deleting either line fails a test, not just a manual drive.

const readDto = (isOverCap: boolean | undefined): SpaceReadDto =>
    ({
        id: 'space_test',
        name: 'Test space',
        type: 'fridge',
        viewMode: 'layout',
        canvasMode: 'zones',
        layoutColumns: 3,
        columnLabels: null,
        zones: [],
        items: [],
        isOverCap,
    }) as unknown as SpaceReadDto;

const summaryDto = (isOverCap: boolean | undefined): SpaceSummaryDto =>
    ({
        id: 'space_test',
        name: 'Test space',
        type: 'fridge',
        viewMode: 'layout',
        canvasMode: 'zones',
        layoutColumns: 3,
        columnLabels: null,
        itemCount: 0,
        zoneCount: 0,
        previewColors: [],
        isOverCap,
    }) as unknown as SpaceSummaryDto;

describe('toSpace overCap mapping (B-26)', () => {
    it('maps isOverCap: true onto the space', () => {
        expect(toSpace(readDto(true)).overCap).toBe(true);
    });

    it('maps isOverCap: false onto the space', () => {
        expect(toSpace(readDto(false)).overCap).toBe(false);
    });

    it('defaults a missing flag to false (fail-open badge; server 403 backstops)', () => {
        expect(toSpace(readDto(undefined)).overCap).toBe(false);
    });
});

describe('toSpaceSummary overCap mapping (B-25)', () => {
    it('maps isOverCap: true onto the summary', () => {
        expect(toSpaceSummary(summaryDto(true)).overCap).toBe(true);
    });

    it('defaults a missing flag to false', () => {
        expect(toSpaceSummary(summaryDto(undefined)).overCap).toBe(false);
    });
});
