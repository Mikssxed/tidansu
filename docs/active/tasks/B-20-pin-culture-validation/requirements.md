### 📋 Backlog Item
The API pins no culture, so FluentValidation's built-in messages localize to the
host OS locale while hand-written messages are always English — pin one
deliberate language so validation errors read consistently.

### 🎯 Product Context Summary
This is a correctness/UX fix, not a feature: it doesn't touch the spatial model,
plans, or limits. Today, the exact same request (e.g. too many tags on an item)
can return a Polish message for one rule and an English message for another,
purely because of which machine the API happens to run on. The UI is
English-only, so the fix is to make that choice explicit and deploy-independent
— not to add real multi-language support.

### 🔑 Core Functional Areas
- Deterministic validation-message language, independent of host locale

---

### Functional Requirements

**Deterministic validation language**
- **FR-1**: All API validation error messages — both FluentValidation's built-in
  messages (e.g. length, count, range rules) and the codebase's hand-written
  messages — must read in English, regardless of the operating-system locale of
  the machine running the API.
  - *Business rationale*: A user (or the developer reproducing a bug report)
    must see the same error text no matter which host served the request.
    Mixed-language errors within a single form response look broken and erode
    trust; language-by-deploy-host also makes bugs hard to reproduce across
    dev/staging/prod boxes with different OS locales.
  - *Priority*: Phase 1 (Core) — small, low-risk correctness fix.
  - *Plan & gate*: N/A — applies identically to Free and Pro; not plan-gated.
  - *Constraints/Rules*: The chosen language is fixed application-wide (not
    per-request, per-user, or per-Accept-Language-header) — this is a single
    deliberate default, not user-facing language selection.
  - *Acceptance criteria*:
    - On a host whose OS locale is not English (e.g. Polish), a request that
      fails a built-in rule (too-long field) and a request that fails a
      hand-written rule (too-many-items) both return English error text.
    - The same is true on a host whose OS locale is English — output is
      identical either way (no behavioural drift between hosts).
    - Number/date formatting elsewhere in API responses and logs that the app
      currently depends on is unchanged (no regression from over-broadly
      pinning culture).

---

### ⚠️ Key Business Considerations
- **Reproducibility.** Bug reports and QA sessions should be host-independent;
  today's behavior means the same steps can produce different error text on
  different machines.
- **Scope discipline.** This is not real internationalization — no per-user
  language preference, no `Accept-Language` negotiation, no translated message
  catalog. Building any of that now would be scope creep against a P3, ~1–2
  file fix.

### 🚫 Out of Scope (Phase 1)
- Multi-language support / `RequestLocalization` middleware for varying
  responses per user or per request header.
- Translating messages into any language other than English.
- Any change to which validation rules exist or their thresholds (that's
  B-13's territory, not this task).

### ❓ Open Questions for Product Owner
1. **Pin invariant culture vs. `en-US` explicitly?** Both produce English
   validation text; invariant culture is the more common ASP.NET Core default
   for apps with no real localization need. Recommend invariant unless there's
   a reason to want US-specific formatting conventions.
2. **`InvariantGlobalization` (csproj-level, MSBuild property) vs. a narrower
   `CultureInfo`/culture pin in `Program.cs`?** `InvariantGlobalization` is the
   broader lever — it disables ICU-based culture data process-wide, affecting
   *all* culture-sensitive formatting (numbers, dates, sorting) everywhere in
   the app, not just validation messages. A `Program.cs`-level default-culture
   pin (`CultureInfo.DefaultThreadCurrentCulture` / `CultureInfo.DefaultThreadCurrentUICulture`)
   is narrower and only steers what FluentValidation/localization picks up,
   leaving other globalization behavior untouched. This blast-radius tradeoff
   is a technical decision but has a product-visible consequence (any future
   date/number formatting) worth the product owner's awareness — flagged here,
   not resolved; tech-lead should pick based on whether the app has (or will
   have) any legitimate use for non-invariant culture data.
