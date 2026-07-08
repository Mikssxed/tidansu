---
id: B-N
slug: short-kebab-slug
title: <one-line title>
status: draft          # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []         # backlog ids that must land first (e.g. [B-5]); [] if none
touch-points:          # files / areas this task is expected to change (best current guess)
  - path/to/file
---

# B-N · <Title>

## Description
<Business language: what the user can do that they couldn't before, or what
changes and why it matters. 2–5 sentences. No implementation detail.>

## Acceptance criteria
- [ ] <observable, testable, user-visible outcome>
- [ ] <plan-cap path where relevant: paywall opens with the right `reason`>
- [ ] <no regression to X>

## Notes
<Open questions, decisions made, constraints, and any context a downstream agent
needs so it doesn't re-derive it. Link related tasks by id.>

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
