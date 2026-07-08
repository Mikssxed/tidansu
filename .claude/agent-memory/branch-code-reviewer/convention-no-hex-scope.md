---
name: convention-no-hex-scope
description: Scope of the "no hex / @theme tokens only" and "static classes" frontend rules — what is NOT a violation, to avoid false positives
metadata:
  type: feedback
---

The "no hardcoded hex, use `@theme` tokens" rule applies to **Vue component
color** styling only. Two things routinely look like violations but are not:

- **Arbitrary pixel sizes** like `text-[13px]`, `text-[16px]`, `size-7`,
  `rounded-[6px]` are the established, pervasive convention in the frontend
  (e.g. `ZoneProps.vue`). They are sizing, not color — do **not** flag them as
  token violations.
- **Inline hex in backend email HTML** (e.g. `MagicLinkEmailSender.cs`
  `BuildHtml`, colors like `#1a1a1a`) is exempt: email clients require inline
  styles and have no access to the app's Tailwind `@theme`. Not a frontend
  component, not a violation.

**Why:** flagging these as convention breaches wastes the review and erodes
trust in the findings. The rules are about component color tokens and dynamic
class strings (`` `bg-${x}` ``), not pixel arithmetic or transactional-email
markup.

**How to apply:** when reviewing `ZoneProps.vue`-style components, only flag
hardcoded **hex colors** and **dynamic/interpolated Tailwind class names** as
convention violations — pixel bracket values pass. See also
[[reviewed-tasks-b2-b3-b4]].
