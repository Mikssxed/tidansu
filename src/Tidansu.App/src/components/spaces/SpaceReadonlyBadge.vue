<template>
    <BaseBadge variant="warn">
        <BaseIcon
            name="lock"
            :size="11"
        />
        Read-only — upgrade to edit
    </BaseBadge>
</template>

<script setup lang="ts">
    import { BaseBadge, BaseIcon } from '@/components/base';

    // Informational only (B-17 scope decision) — no props, no upgrade CTA in
    // Phase 1. Shared by SpaceCard (dashboard) and SpaceView (open space) so
    // the copy stays identical and DRY.
</script>
