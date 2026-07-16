---
name: ef-executedeleteasync-needs-own-transaction
description: EF Core's ExecuteDeleteAsync bypasses the change tracker and does not join SaveChangesAsync — a cascade that combines it with a tracked Remove() needs an explicit BeginTransactionAsync to stay atomic
metadata:
  type: project
---

`ExecuteDeleteAsync` issues its DELETE immediately against the database — it does
not participate in `DbContext.SaveChangesAsync()`. If a method needs both a
set-based `ExecuteDeleteAsync` (e.g. deleting all items in a zone without loading
them, to avoid materializing every item's photo blob) and a tracked
`Remove()`/`SaveChangesAsync()` (e.g. deleting the zone itself), the two writes are
not atomic unless wrapped in an explicit `dbContext.Database.BeginTransactionAsync()`.

**Why:** Discovered implementing B-15 T-16 (`RemoveZoneWithItemsAsync` in
`SpacesRepository.cs`) — the plan called for a set-based item cascade specifically
to avoid the write amplification of loading a zone's items just to delete them
(same amplification problem the whole B-15 task exists to remove). Without the
explicit transaction, a failure between the `ExecuteDeleteAsync` and the zone's
`SaveChangesAsync` would leave items deleted but the zone still present.

**How to apply:** Whenever combining `ExecuteDeleteAsync`/`ExecuteUpdateAsync` with
any tracked-entity write in the same logical operation, open an explicit
transaction around both, even if neither one individually "needs" a transaction on
its own. This is orthogonal to [[dotnet10-forwardedheaders-knownipnetworks]]-style
API changes — it's an EF Core behavioral property, not a version quirk. Also note:
this repo's `TidansuDbContext` is registered without `EnableRetryOnFailure`, so a
manual `BeginTransactionAsync` is safe as-is (see the `sp_getapplock` lock methods
in `SpacesRepository.cs` for the same caveat) — if retry-on-failure is ever
enabled, every manual transaction in that file must move inside
`dbContext.Database.CreateExecutionStrategy().ExecuteAsync(...)`.
