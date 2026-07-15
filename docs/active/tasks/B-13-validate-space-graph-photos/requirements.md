### 📋 Backlog Item
When a user saves a space, the zones and items nested inside it — and any photo
attached to an item — must be checked against sensible limits before they are
stored, so bad input comes back as a clear, field-level error instead of a
server crash, and no photo that isn't a genuine, reasonably-sized image is ever
written to the database.

### 🎯 Product Context Summary
Saving a space is a single "replace the whole graph" action (space + its zones +
its items, debounced as the user edits the layout). Today only the space's own
`Id`/`Name`/`Type` are checked; everything nested — zone labels/colors, item
names/tags/dates, and the item photo — is written through untouched. That means
a user who types a very long item name gets an opaque failure instead of "that
name is too long," and a Pro user's item photo (the only place binary-ish
content enters Tidansu) is accepted with no proof it's actually an image and no
cap on its size. This task closes that gap with input validation only — it does
not change how or where photos are stored (that redesign is B-16) and it does
not change any plan limit (spaces/zones/items/photos/sync caps are unaffected
and must keep working exactly as they do today).

### 🔑 Core Functional Areas
- Field-length validation for the zone graph (matching what the database already accepts, so nothing that used to work starts failing)
- Field-length validation for the item graph, including a new bound on tags (count and length) that the database doesn't currently enforce
- Item photo validation: is it really an image, and is it a sane size
- Clean, field-attributed error responses instead of opaque server errors
- Policy for content already stored under the old, unchecked rules
- User-visible consequence when a background autosave gets rejected

---

### Functional Requirements

**Zone & item field validation (parity with what's already accepted)**

- **FR-1**: Saving a space validates every zone's `Id`, `Label`, `Color`, `Kind`
  and `Facing`, and every item's `Id`, `Name`, `ZoneId`, `DateAdded`, `Expiry`,
  `Depth` and `Icon`, against the exact same length limits the database already
  enforces on those fields.
  - *Business rationale*: These fields are silently unvalidated today, so an
    over-long value fails deep in the database as an opaque error instead of a
    clear message. Matching the existing DB limits (not inventing new, stricter
    ones) guarantees nothing that saves successfully today starts being
    rejected tomorrow.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Applies identically to Free and Pro; not a plan-gated capability.
  - *Constraints/Rules*: Limits to match (current database limits, do not tighten):
    Zone `Id` 64, `Label` 120, `Color` 16, `Kind` 16, `Facing` 16. Item `Id` 64,
    `Name` 200, `ZoneId` 64, `DateAdded` 40, `Expiry` 40, `Depth` 16, `Icon` 40.
  - *Acceptance criteria*: A zone/item field within its limit saves unchanged
    (regression check against today's behaviour). A field over its limit is
    rejected with a 400 that names the specific field — never a 500.

- **FR-2**: Saving a space validates the space's own `Type`, `ViewMode` and
  `CanvasMode` against their database limits (today only `Name` and `Id` are
  checked; `Type` is checked for presence but not length, and `ViewMode`/
  `CanvasMode` aren't checked at all).
  - *Business rationale*: Same failure mode as FR-1, just one level up — these
    are exactly the kind of small enum-like strings a client bug or bad request
    could send over-length.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free and Pro alike.
  - *Constraints/Rules*: `Type` 16, `ViewMode` 16, `CanvasMode` 16 (current DB limits).
  - *Acceptance criteria*: A request with a valid space type/view/canvas mode
    saves as before. An over-length value is rejected with a 400 naming the field.

**Tag bounds (new business rule — the database has no existing limit to mirror)**

- **FR-3**: An item's tag list is capped at **15 tags**, each tag capped at
  **24 characters**.
  - *Business rationale*: Unlike the fields in FR-1, tags have no existing
    database limit today, so there's nothing to "match" — this is a fresh
    product decision. Tags are short descriptive labels ("dairy," "opened,"
    "kids-lunch"); 24 characters comfortably covers realistic multi-word tags,
    and 15 tags per item is generous for real pantry/fridge use while still
    closing off the unbounded-growth risk of a client sending hundreds of tags
    on a single item (the same class of storage-bloat concern as the photo cap).
  - *Priority*: Phase 1 (Core) — it's the one genuinely new rule the S-2 finding calls for.
  - *Plan & gate*: Free and Pro alike; tags are not a gated capability.
  - *Constraints/Rules*: Reject the whole save (400, field-attributed to the
    offending item/tag) if either bound is exceeded — don't silently truncate
    or drop tags, since that would quietly lose user data.
  - *Acceptance criteria*: An item with ≤15 tags, each ≤24 characters, saves
    unchanged. An item with a 16th tag, or any tag over 24 characters, is
    rejected with a 400 that identifies the item and the problem.

**Photo validation (the core of the S-2 finding)**

- **FR-4**: An item photo is only accepted if it is a genuine image of an
  allow-listed type: **JPEG, PNG, or WebP**.
  - *Business rationale*: See "Proposed values" below for the full reasoning.
    In short — these are the three formats every browser renders natively as
    an `<img>` source, they cover what a phone camera or a saved picture
    actually produces, and excluding everything else (in particular SVG, which
    can carry executable markup, and arbitrary `data:` prefixes like the
    `javascript:`/`data:text/html` risk the audit called out) closes the "photo
    slot renders whatever was stored" attack surface described in S-2.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Pro only (Free has no photo capability — attempting to add a
    photo on Free already opens the paywall with `reason: photos` before this
    check would even run; that path is unchanged).
  - *Constraints/Rules*: The check must verify what the content actually is,
    not just trust a label the client attached to it (a request can claim to
    be an image and not be one — that's exactly the gap S-2 flags). Reject
    silently-empty or malformed image data the same way as a disallowed type.
  - *Acceptance criteria*: A JPEG/PNG/WebP photo from a Pro user saves and
    displays as before (no regression to the existing "normal photo" flow). A
    non-image payload, a disallowed image type, or a deliberately mislabeled
    payload (e.g. HTML/script content dressed up as an image) is rejected with
    a 400 and is never written to the database.

- **FR-5**: An item photo is capped at a maximum size; anything larger is
  rejected outright rather than stored.
  - *Business rationale*: See "Proposed values" below.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Pro only, same reasoning as FR-4.
  - *Constraints/Rules*: Cap is evaluated against the underlying image size,
    not inflated by the ~33% overhead of transmitting it as a base64 data URL.
    This is a *per-photo* cap only — bounding the total weight of a whole
    space's photos together is a separate, already-tracked scalability concern
    (see SC-1/SC-3 in the B-8 audit → B-14/B-16), not part of this task.
  - *Acceptance criteria*: A photo at or under the cap saves and displays as
    before. A photo over the cap is rejected with a 400 naming the item/photo
    field, before anything is written.

**Clean failure behaviour**

- **FR-6**: Any validation failure on a space save returns a 400 that names the
  offending field (e.g. which item, which property) — never an unhandled
  database error (500).
  - *Business rationale*: This is the baseline promise the whole task is
    built on — today's opaque `DbUpdateException` failures are themselves the
    product problem, independent of which specific field trips them.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — applies to every save regardless of plan.
  - *Constraints/Rules*: None of FR-1–FR-5 should ever be reachable as a raw
    database error; all of them terminate in the same clean 400 shape.
  - *Acceptance criteria*: Every scenario in FR-1–FR-5's acceptance criteria
    that describes "rejected" produces a 400 with an identifiable field, not a
    500, and confirms nothing was partially written.

**Existing content and user-visible consequences (framing, not new mechanisms)**

- **FR-7**: Spaces/zones/items/photos already stored before these rules existed
  are **not** retroactively re-validated or blocked on read, even if they would
  fail the new rules if resubmitted.
  - *Business rationale*: These are preventive, write-time checks closing a gap
    that's existed since the feature shipped — there's no known incidence of
    abuse to remediate. Re-validating on every read would either silently hide
    a user's existing (harmless) over-limit content or block them from seeing
    their own space, both worse than leaving it alone. The new rules only ever
    bite on the *next* write to that record; a user who never touches an
    over-limit item again is completely unaffected.
  - *Priority*: Phase 1 (Core) — this is a "don't build" decision, cheap to honor.
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: A save that resubmits an existing over-limit value
    unchanged is still validated normally (and would be rejected) — the
    exemption is for *reading*, not for re-saving.
  - *Acceptance criteria*: An existing space with a since-disallowed photo
    type/size, or an over-long field, continues to load and render exactly as
    it does today. Editing and resaving that same space triggers normal
    validation on the whole payload, per FR-1–FR-6.

- **FR-8**: When a validation rejection happens during the app's normal
  debounced autosave (not a discrete "Save" click the user is watching), the
  user must get some visible signal that their change did not persist.
  - *Business rationale*: Because saves are autosaved in the background, a 400
    here has the same "user thinks it saved, it didn't, edit vanishes on
    reload" failure mode already identified for other save failures.
  - *Priority*: Phase 1 (Core) for "don't fail silently"; the full surfacing
    mechanism itself is Phase 2, tracked in **B-19** (surfacing non-plan
    space-sync failures) — this task should route validation 400s through
    whatever B-19 builds rather than inventing a second, parallel notification
    path.
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: A rejected autosave must not be shown to the user as
    "saved," and must not silently discard their in-progress local edit.
  - *Acceptance criteria*: Triggering a validation rejection via autosave
    (e.g. typing an over-long item name) does not show a false "saved" state,
    and the local edit remains visible/editable rather than vanishing.

**Spatial geometry — lower priority**

- **FR-9**: A zone's rect (`x`, `y`, `w`, `h`) is checked for basic sanity —
  finite numbers, non-negative width/height — before saving.
  - *Business rationale*: Unlike FR-1's string fields, rect values are numeric
    with no database length to mirror, so there's no "existing accepted value"
    at risk of regression here. This isn't part of the S-2 security/500 finding;
    it's a smaller, separate defensive gap (a garbage rect breaks layout
    rendering rather than the database) worth closing at the same time since
    the validators are already being touched.
  - *Priority*: Phase 3 (Later) — not part of the audit finding this task
    exists to close; include only if it's cheap alongside the rest.
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Reject `NaN`/`Infinity` and negative width/height; no
    opinion on upper bounds (layout size is already implicitly bounded by
    grid/column limits elsewhere).
  - *Acceptance criteria*: A normal rect saves unchanged. A rect with a
    negative width/height or a non-finite value is rejected with a 400.

---

### 📐 Proposed values for the two open questions

**1. Per-photo size cap — proposed: 5 MB of raw image data (≈6.7 MB once
represented as a base64 data URL).**
Reasoning: the app has no client-side photo compression today — in fact there
is no photo-capture flow wired up in the SPA at all yet (`ItemDetailModal`'s
photo slot only emits `addPhoto`/`photoLocked`; nothing consumes `addPhoto` to
actually pick or capture a file — confirmed by searching the frontend for any
file-input/camera/`FileReader` code, none exists). Whatever attaches a photo in
the future will most plausibly hand this validation an unmodified phone camera
photo, and modern phone JPEGs commonly land in the 2–8 MB range at full
resolution. A 5 MB raw cap is generous enough that an ordinary, un-edited photo
won't be rejected, while still being a hard, finite ceiling against a
deliberately oversized payload (the abuse case S-2 describes). Base64 encoding
inflates bytes by ~33%, so the cap must be checked against the *decoded* image
size, not the data-URL string length — a 5 MB image becomes a ~6.7 MB string,
and that string length is not itself the limit. This is a ceiling, not a
target: once a real capture/upload flow is built (separate task), it should
almost certainly downscale/compress before upload, and this cap can come down
then. Bounding the *aggregate* weight of many photos in one space is a
separate, already-tracked concern (SC-1/SC-3 → B-14/B-16), not this cap.

**2. Allow-listed image types — proposed: JPEG, PNG, WebP.**
Reasoning: I inspected the frontend's photo-capture path specifically as
instructed and found there isn't one yet (see above) — the Pro photo slot is
gated (`photoLocked` emit works) but nothing downstream of "unlocked, click Add
a photo" (`addPhoto`) is implemented, so there's no existing client behavior to
defer to. Absent that, I propose the three universally browser-renderable
raster formats: JPEG (the default output of essentially every phone camera and
of `<input accept="image/*" capture>`), PNG (screenshots, edited images with
transparency), and WebP (an increasingly common default camera/gallery export
on Android). Explicitly excluded: **SVG** (XML-based — can embed script,
exactly the `data:text/html`-style risk S-2 calls out, so allowing it would
partially undo the fix), **GIF** (no product need for animated item photos, and
animated-decode is unnecessary attack surface), and **HEIC/HEIF** (the default
iOS camera format, but not natively rendered by most browsers — accepting it
here would satisfy "is a real image" while breaking "still displays," which is
in the acceptance criteria; a future capture flow should convert HEIC to one of
the three allowed formats client-side before this validation ever sees it).

---

### ⚠️ Key Business Considerations
- **This is validation only.** No change to where/how photos are stored
  (base64 in the row stays, per B-16 being a separate redesign), no change to
  any plan limit or its paywall `reason`, no change to the whole-graph
  replace-on-save mechanics (that's B-15).
- **Don't regress today's valid input.** The single biggest risk of this task
  is picking limits *stricter* than what the database (and therefore existing
  saved data) already tolerates. Every string-length limit proposed here is
  copied verbatim from `TidansuDbContext`, not invented.
- **Fail clean, fail loud.** A validation rejection must always be a
  named-field 400, and — because saves are autosaved, not click-triggered —
  must never be allowed to fail invisibly (FR-8, deferring the full mechanism
  to B-19).
- **No retroactive punishment.** Tightening the rules must not turn a user's
  already-saved, previously-valid content into something that breaks on load
  (FR-7).

### 🚫 Out of Scope (Phase 1)
- Moving photos to blob storage or off the `Item` row (B-16).
- Diffed/granular space updates instead of whole-graph replace (B-15).
- Bounding the *aggregate* size of all photos in a space/response (SC-1/SC-3 → B-14/B-16).
- Building the actual photo-capture/upload UI (it doesn't exist yet; this task
  only validates whatever eventually calls the save endpoint with a photo).
- Enforcing that an item's `ZoneId` actually refers to a zone that exists in
  the same space — the codebase already treats this as an intentionally loose
  reference (see the comment on `Item.ZoneId`), not a defect this task should fix.
- Bounds on `Space.LayoutColumns` / `ColumnLabels` — not named in the S-2
  finding, and no known failure mode (small int, no DB length to overrun).
- Full design of the autosave-failure notification UI — owned by B-19.
- Retroactively scanning/fixing existing stored photos or over-length fields.

### ❓ Open Questions for Product Owner
1. **Confirm the two proposed values** (5 MB raw photo cap; JPEG/PNG/WebP
   allow-list) — both are reasoned product positions in the absence of an
   existing capture flow to anchor them to, not settled facts. If a photo
   capture/compression design already exists elsewhere (design files, a
   half-built branch) that implies different numbers, that should override
   these proposals.
2. **Tag bounds (15 tags / 24 characters)** are a new rule with no precedent
   in this codebase or design docs — please confirm these feel right for real
   pantry/fridge tagging, or adjust.
3. Should a rejected autosave attribute the error to the *specific* item/zone
   that failed, given the whole space is saved as one payload? Phase 1 default
   assumption: a generic "some of your changes couldn't be saved" is
   acceptable to ship first, with field-level attribution as an enhancement —
   confirm this is an acceptable Phase 1 bar rather than blocking on precise
   per-field UI attribution.
4. Is it worth a one-off, read-only audit query (no code change, just a report)
   to see whether any *existing* rows already exceed the new photo/tag/field
   bounds, purely so the PO knows today's blast radius? Proposed as optional,
   not required, given FR-7's "don't touch existing data" stance.
