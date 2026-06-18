import { applyComplexity, buildZones, type Complexity } from '@/data/spaces';
import { seedFridge } from '@/data/seed';
import { uid } from '@/data/spaces';
import type { Space, SpaceTypeId } from '@/data/types';

export type ComplexityViz = 'rows' | 'cols' | 'draw';

export interface ComplexityOption {
    id: Complexity;
    title: string;
    desc: string;
    viz: ComplexityViz;
    advanced?: boolean;
}

export const COMPLEXITY: ComplexityOption[] = [
    {
        id: 'simple',
        title: 'Simple',
        desc: 'Just shelves in a column. No drawing — straight to your contents.',
        viz: 'rows',
    },
    {
        id: 'twodoors',
        title: 'Two doors side by side',
        desc: 'Two columns, like a side-by-side fridge.',
        viz: 'cols',
    },
    {
        id: 'draw',
        title: "I'll draw my own layout",
        desc: 'Open the full canvas editor and place zones freely.',
        viz: 'draw',
        advanced: true,
    },
];

export const DEFAULT_NAME: Record<SpaceTypeId, string> = {
    fridge: 'My fridge',
    freezer: 'My freezer',
    cellar: 'My cellar',
    cabinet: 'My cabinet',
    list: 'My list',
    other: 'My space',
};

/**
 * Build a fresh space for a chosen type. Fridge gets the demo items (seedFridge);
 * everything else starts empty. Ported from seedForType in screens-onboarding.jsx.
 */
export function seedForType(type: SpaceTypeId, name: string, complexity: Complexity): Space {
    let space: Space;
    if (type === 'fridge') {
        space = seedFridge();
        space.name = name;
    } else {
        space = {
            id: uid('space'),
            name,
            type,
            viewMode: 'list',
            canvasMode: 'columns',
            layoutColumns: 1,
            columnLabels: null,
            zones: buildZones(type),
            items: [],
        };
    }
    applyComplexity(space, complexity);
    space.viewMode = complexity === 'draw' ? 'layout' : 'list';
    return space;
}
