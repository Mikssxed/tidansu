---
name: verify-ci-yaml-no-actionlint-use-node-yaml
description: Validate a GitHub Actions workflow YAML in this env when neither actionlint nor pyyaml is installed — parse with the `yaml` npm package already in src/Tidansu.App/node_modules
metadata:
  type: project
---

When verifying `.github/workflows/*.yml` (e.g. B-28, the repo's first CI
workflow), this dev environment has **no `actionlint`** and **no `pyyaml`**
(`python -c "import yaml"` fails — `ModuleNotFoundError`). Don't install
anything new for a one-off validation.

**What works:** the `yaml` npm package is already a transitive dependency
inside `src/Tidansu.App/node_modules` (not a devDependency of the app itself,
just present in the tree). `node -e "require('yaml').parse(fs.readFileSync(...))"`
run from `src/Tidansu.App` parses the workflow cleanly and lets you assert on
`jobs`, `on`, `permissions`, `concurrency` etc. as a real object — a much
stronger check than eyeballing indentation.

**Why:** GitHub Actions doesn't offer a local "run this workflow" command for
verification; the two proxies available here are (a) structural YAML parse,
and (b) reproducing each `run:` step's shell logic locally. This is the (a)
half — see [[verify-stripe-webhook-without-cli]] and other memories for the
general pattern of "no CLI, reproduce the logic by hand."

**How to apply:** next time a workflow YAML needs validating pre-PR, try
`node -e "require('yaml')..."` from `src/Tidansu.App` before reaching for
`pip install pyyaml` or a global `actionlint` install — it's already there.
