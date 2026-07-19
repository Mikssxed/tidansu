---
name: shared-dto-full-replace-wipe
description: Narrowing a read path that shares its DTO with a full-replace write handler silently wipes the dropped field on the next edit; fix = write patch semantics, not a DTO split
metadata:
  type: project
---

In Spaces, `ItemDto` is one shape for both read (`ItemDto.FromEntity`) and write
(`ItemDto.ToEntity`), and `UpdateItemCommandHandler` does a **full field replace**
(`item.X = dto.X` for every field). So dropping any field from the read path is a
latent data-loss bug: the client holds `null`/default for it, round-trips the whole
item on the next unrelated edit, and the handler writes the absent value back.

**Why:** B-16 hit exactly this with `Item.Photo` (the 🪤 TRAP). Slimming the read to
stop shipping photo bytes would have deleted every stored photo on the next item edit.

**How to apply:** whenever a task drops/omits a field from a read that shares a DTO
with a full-replace update handler, the fix is **write patch semantics on the handler**
(`if (dto.Field is not null) { ...set... }` → absent means "leave unchanged"), NOT a
read/write DTO split alone (the client still round-trips the shared shape). Keep the
gate ordering: branch on `is not null`, never `IsNullOrEmpty` — for photos, empty string
counts as a photo and must still hit the 403 gate (see [[validation-preempts-plan-gate-403]]).
Trade-off: the field can then no longer be *cleared* via update (null == unchanged) —
acceptable when no UI clears it; hand the clear-affordance to the owning slice.
Read-path projection itself (no column leaving SQL) is proven via the EF SQL log,
per [[read-path-projection-fixes]].
