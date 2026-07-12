---
name: research-tooling-subagent-fallback
description: As a sub-agent, ToolSearch/WebSearch/WebFetch aren't available; use curl for web research, and know which gov portals resist scraping
metadata:
  type: feedback
---

When a research task tells me to load `WebSearch`/`WebFetch` via `ToolSearch`, those
tools are **not in my function set as a sub-agent** — I can't spawn agents or load
extra tools. Do the web research **directly with `curl`** from the Bash tool instead.

**Why:** tech-tasks for research (e.g. B-5 legal/compliance) reference the repo's
`research` skill, which fans out into sub-agents; a sub-agent can't use it.

**How to apply (curl research pattern that worked):**
- `curl -sSL -m 35 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" URL -o out.html`
  then strip tags: `sed -e 's/<script[^>]*>.*<\/script>//g' -e 's/<[^>]*>/ /g' | tr -s ' \t\n' ' '`
  and `grep -oiE ".{80}(keyword).{80}"` to pull cited facts.
- Prefer sites that server-render: `docs.stripe.com`, `stripe.com`,
  `europa.eu/youreurope`, EUR-Lex — these return real text.
- **JS-SPA government portals resist direct fetch:** `ksef.podatki.gov.pl` /
  `podatki.gov.pl/ksef` are Chakra/React SPAs — subpages 404 on direct GET and text is
  client-rendered; `biznes.gov.pl` deep portal paths 404 (paths aren't guessable).
  Cite these at the authoritative domain/topic level and mark the specific figure
  lower-confidence / "confirm with professional" rather than faking a deep URL.
- Without a search tool I must **guess canonical URLs**; verify with `-w "%{http_code}"`
  before trusting a page. For legislation cite EUR-Lex CELEX ids and isap.sejm.gov.pl.
