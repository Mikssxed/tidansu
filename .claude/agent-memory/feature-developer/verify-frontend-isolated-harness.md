---
name: verify-frontend-isolated-harness
description: How to behaviourally verify a Vue leaf component without standing up the backend — isolated Vite harness + headless Edge over CDP
metadata:
  type: feedback
---

For a purely-visual/leaf Vue component whose data normally comes from the
server-backed store (e.g. `ZoneProps.vue`, fed by `useSpacesStore` which hydrates
from `GET /api/spaces`), you can drive it end-to-end **without** the API/DB/auth by
mounting it in an isolated Vite harness.

**Why:** the full path (backend + EF DB + JWT auth + seed a space + open layout
editor + select a zone) is heavy setup for a static-Tailwind tweak. An isolated
harness that imports the *real* component and mirrors the parent's update wiring is
a faithful behavioural gate for that component's own logic (clamps, disabling,
v-if, emits) and its rendered layout.

**How to apply:**
- Create three throwaway files under `src/Tidansu.App`: `harness.html` (root, so
  Vite serves it), `src/_harness.ts` (mounts with `PrimeVue{unstyled:true}` +
  `import './style.css'`), and a `_*Harness.vue` that renders the real component
  with a real domain object (build zones via `makeZone`/`buildZones` from
  `@/data/spaces`) and applies emitted patches with `Object.assign` (same as the
  store's updateZone). Aliases (`@`) resolve because it lives under src.
- `npm run dev` (port 5173), navigate to `/harness.html`.
- No Playwright/chromium-cli is installed on this machine, but **Edge is**
  (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`). Launch it
  `--headless=new --remote-debugging-port=9222 --user-data-dir=<temp>` and drive it
  with a hand-rolled CDP client over Node's **global `WebSocket`** (Node 26 has it):
  fetch `http://localhost:9222/json/version` for the ws URL, `Target.createTarget`
  + `attachToTarget{flatten:true}`, then `Page.enable`/`Runtime.enable`,
  `Runtime.evaluate` to probe/click, `Page.captureScreenshot` for the image.
- **Always Read the screenshot** — assertions on `getBoundingClientRect`/classes
  plus a visual check catch both logic and layout regressions.
- Clean up: delete the 3 harness files, `taskkill //F //IM msedge.exe`, kill the
  Vite listener by port, then re-run `npm run build` so the tree is green.
