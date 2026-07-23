---
name: build-time-openapi-getdocument-runs-startup-code
description: Microsoft.Extensions.ApiDescription.Server's getdocument tool actually executes all top-level Program.cs statements up to app.Run() (not just builder.Build()), and its own incremental cache can make regeneration silently no-op
metadata:
  type: project
---

Landed in B-21 (`npm run build:api` fix, build-time OpenAPI generation via
`Microsoft.Extensions.ApiDescription.Server` instead of the broken Swashbuckle CLI
`swagger tofile`).

**Finding 1 — getdocument does not stop at `builder.Build()`.** The tech-planning
assumed (reasonably, by analogy to `dotnet ef`'s `HostFactoryResolver`) that
getdocument would build the DI container and stop there, touching no database. In
practice it runs the *entire* top-level `Program.cs` body up to (but not including)
the blocking part of `app.Run()` — verified by watching the EF migration check
block (`dbContext.Database.Migrate()`, which sits between `builder.Build()` and
`app.Run()`) execute real `SELECT`/migration-history queries against LocalDB during
a `-p:OpenApiGenerateDocumentsOnBuild=true` build. It didn't fail only because the
dev LocalDB already existed and was already migrated. A genuinely DB-less machine
would need the connection string cleared (as the old curl-based workaround did) or
LocalDB installed — "no DB required" is not literally true for this repo's
`Program.cs` shape (migration-on-boot before `Run()`). Not a blocker here since
every dev machine in this project already needs LocalDB to run the app at all, but
worth remembering if this pattern is reused in a repo without that assumption.

**Finding 2 — the target has its own incremental cache, independent of the actual
output.** `obj/{Project}.OpenApiFiles.cache` records the expected output path and is
used by MSBuild's Inputs/Outputs up-to-date check for the getdocument target. If the
DLL doesn't need recompiling (nothing changed), the whole doc-generation step is
skipped **even if you manually deleted `obj/openapi/api.json`** — the check looks at
the cache file's freshness, not the actual json's existence. This only bit me while
manually probing (deleting just the openapi subfolder to force a "fresh" test); the
real npm script never does that, so normal idempotent re-runs are fine (skip = same
content as last time). But if you ever need to force real regeneration after editing
only the `.csproj`/generation options with no source change, `rm -rf obj/openapi
obj/*.OpenApiFiles.cache` (or `dotnet clean`) before rebuilding — deleting the output
folder alone isn't enough.

See [[kiota-regen-tooling]] (superseded — B-21 replaced the curl/manual workaround
with this build-time approach).
