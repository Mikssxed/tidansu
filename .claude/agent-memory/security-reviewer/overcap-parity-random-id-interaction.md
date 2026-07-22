---
name: overcap-parity-random-id-interaction
description: B-23 random Space.Id vs B-24/B-17 position-based over-cap badging — server enforcement is authoritative (no bypass), but SPA/server over-cap sets can transiently diverge
metadata:
  type: project
---

Cross-feature interaction confirmed during the B-23/B-24 audit (2026-07-22).

**Fact:** The SPA badges over-cap (read-only) spaces by slicing `spaces.value` as-is
(`useLimits.ts` `readonlySpaceIds`), assuming store order mirrors the server's
`OrderBy(s => s.Id)`. B-23 made `Space.Id` a random CSPRNG value assigned server-side;
newly created spaces are appended optimistically and `reconcileSpaceId`
(`useSpacesStore.ts`) rewrites `space.id` in place **without re-sorting**. So store
order and `OrderBy(Id)` diverge until the next full `GetSpaces` hydrate.

**Why:** Pre-B-23 client ids were counter-derived (roughly monotonic), so append order
≈ sorted order and the parity held incidentally. Random ids removed that incidental
alignment; the team's ordering-parity mitigation only guaranteed *server-internal*
parity (rank query collation-matched to `OrderBy(Id)`), not the client array-order
assumption.

**How to apply:** This is NOT a security bypass — B-24's `SpaceOverCapGuard` recomputes
rank in SQL live on every mutate request and freezes exactly `total - cap` spaces, so a
Free user can never write to more than `cap` spaces regardless of SPA ordering. Do not
rate it Critical/High. Rate the symptom Low (parity/UX) and hand correctness to the
branch-code-reviewer. When auditing future work that reorders spaces or changes id
minting, re-check that `readonlySpaceIds` still matches the server's blocked set.
Related: [[confirmed-protections-overcap-and-space-id]].
