---
name: tidansu-app-vitest-wiring
description: How Vitest was wired into Tidansu.App (B-15/T-24) and the vue-tsc interaction gotcha
metadata:
  type: project
---

Tidansu.App had zero test tooling until B-15/T-24 (2026-07-16) added `vitest` as the
first dev dependency, scoped narrowly to `src/data/pendingChanges.ts`.

**Why:** the tech-lead's plan called out this module specifically as pure/testable —
picked over three other interface designs partly *because* it was trivially unit
testable — but a check at implementation time found no runner existed yet, so `npm i
-D vitest` plus a minimal `test` block in `vite.config.ts` (import `defineConfig` from
`vitest/config` instead of `vite` — it's a drop-in that adds the typed `test` field) and
an `npm run test` (`vitest run`) script were added as part of that task, not a separate
tooling task.

**Gotcha to remember:** `tsconfig.app.json`'s `include` is `src/**/*.ts`, and
`npm run build` runs `vue-tsc -b` first. That means any `*.test.ts` file colocated
under `src/` is type-checked by the **build gate**, not just by Vitest — a test file
with a type error will fail `npm run build` even though `vitest run` never touches
type-checking. Import `describe`/`it`/`expect` explicitly from `'vitest'` in test
files rather than relying on Vitest's `globals` option, to avoid needing a
`tsconfig` `types` array change (which would apply repo-wide) just to satisfy one
test file.

**Scope discipline:** this repo's test coverage is deliberately narrow by design
decision (see `docs/active/tasks/B-15-granular-space-endpoints/tech-tasks.md` §4) —
no component tests, no Vue Test Utils, no CI wiring yet. Don't assume a broader
testing convention exists; check the current task's scope before adding coverage
elsewhere.
