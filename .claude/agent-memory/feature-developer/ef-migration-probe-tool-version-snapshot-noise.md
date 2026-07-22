---
name: ef-migration-probe-tool-version-snapshot-noise
description: an empty-migration probe (dotnet ef migrations add/remove) can still touch TidansuDbContextModelSnapshot.cs with cosmetic tool-version output diffs (e.g. `ToTable("X")` → `ToTable("X", (string)null)`) unrelated to any real model change
metadata:
  type: project
---

Running `dotnet ef migrations add <Probe>` then `dotnet ef migrations remove` to confirm
a model is unchanged (B-23's empty-migration probe pattern) can still leave
`TidansuDbContextModelSnapshot.cs` modified after the remove — not because the model
changed, but because the installed `dotnet-ef` tool version (10.0.9 as of 2026-07) emits
slightly different snapshot codegen than whatever version last regenerated the committed
snapshot (e.g. adding an explicit `(string)null` schema argument to every `ToTable(...)`
call). This is pure tool-version noise, not a real model diff.

**Why:** `migrations remove` reverts the snapshot by regenerating it from the current
model with the currently-installed tool, not by reverting to the pre-probe git blob.

**How to apply:** after any empty-migration probe, run `git diff` on
`TidansuDbContextModelSnapshot.cs`. If the only changes are this kind of cosmetic
codegen noise (not an actual added/removed/retyped column, key, or index), `git checkout --`
that one file to keep the diff clean — don't commit tool-version churn alongside a
"no schema change" finding. Verify with a rebuild afterward.
