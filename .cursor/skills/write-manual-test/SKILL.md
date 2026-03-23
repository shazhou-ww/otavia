---
name: write-manual-test
description: Use when the user points at a specific plan markdown and wants a new manual-test-* Cursor skill scaffolded from its verification checklist; adding or refreshing stepwise manual procedures aligned with docs/superpowers plans.
---

# write-manual-test

## Overview

Turn a **named plan document** into a **separate** skill under `.cursor/skills/manual-test-<short>/SKILL.md`, following the same pattern as **manual-test-multicloud-cli**: grouped steps, per-step **Verify**, `.checks/` workspaces and logs, optional **SKIPPED** / **GAP** honesty, report template. **Do not** fold new suites into `run-sanity-checks` body — only register them in its index table.

**REQUIRED:** Read **run-sanity-checks** for shared rules (`.checks/`, evidence gate). This skill adds authoring steps only.

## Inputs (confirm if missing)

1. **Plan path** — repo-relative, e.g. `docs/superpowers/plans/2026-03-23-otavia-cli-multicloud.md`.
2. **Checklist scope** — default: section titled like **验证清单**, **Verification**, **Acceptance**, or explicit line range / heading the user gives.
3. **Skill slug** — optional; if omitted, derive `manual-test-<short>` from plan name or domain (lowercase, hyphens, ≤64 chars for YAML `name`).

## Authoring workflow

1. **Read the plan** at the given path; isolate the verification checklist bullets (or user-specified subsection).
2. **Cluster bullets** into **Group A, B, C, …** each mapping to one or more plan lines. Order groups by dependency (e.g. temp workspace before deploy).
3. **Choose `name`** — must be `manual-test-<slug>`; slug matches folder name; letters, digits, hyphens only.
4. **Write** `.cursor/skills/manual-test-<slug>/SKILL.md`:
   - YAML `name` + `description`: **Use when…** only (triggers, symptoms); do **not** summarize the full procedure in `description` (CSO).
   - Title line: `# manual-test-<slug>` (match `name`).
   - **Source:** one markdown link to the plan. Path from `SKILL.md` is **three levels up** to repo root, then plan path: `../../../<plan-from-repo-root>` (always forward slashes).
   - **Scope:** one short paragraph — fresh dirs under `.checks/…`, ordered execution, evidence, no bullet claimed without proof.
   - For each **Group**: heading, **Maps to plan item:** quote or paraphrase the plan bullet; numbered substeps; each executable step followed by **Verify:** exit codes, files, or observable outcomes.
   - Call out **cwd / path traps** (e.g. CLI resolves stack only from certain directories), **env skips** (`OTAVIA_SETUP_SKIP_TOOLCHAIN`), **tooling-limited** passes (no `biome.json`), **credentials required** blocks with **SKIPPED** if not met.
   - **Automated checks** tied to the plan: exact commands (e.g. `bun run --cwd packages/stack test`), plus a **coverage / GAP** table when the plan claims test coverage that may span multiple files.
   - **Report template** at the end; heading uses the skill id (`## manual-test-<slug>`).
5. **Register** in **run-sanity-checks** `SKILL.md` → **Index** table: new row **Skill** + one-line **Focus** (plan filename + what the suite covers).
6. **Otavia repo defaults** when commands involve Bun: `bun install --no-cache` in manual temp workspaces (Windows Bun cache issue); prefer **PowerShell** examples on Windows; use `Tee-Object` to `.checks/*.log` for noisy steps.

## Generated `SKILL.md` shape (fill in)

Use this structure inside the new file (adapt sections to the plan — omit groups that do not apply).

```markdown
---
name: manual-test-<slug>
description: Use when …
---

# manual-test-<slug>

**Source:** […](../../../<path-from-repo-root>) — *checklist section title*.

**Scope:** …

---

## Group A — …
**Maps to plan item:** …
### …
**Verify:** …

---

## Group B — …
…

---

## Report template
\`\`\`markdown
## manual-test-<slug>
- **Group A**: PASS | FAIL | SKIPPED — …
\`\`\`
```

## Naming examples

| Plan topic | `name` / folder |
|------------|------------------|
| Multicloud CLI checklist | `manual-test-multicloud-cli` |
| Host adapter rollout | `manual-test-host-aws-azure` |

Avoid vague slugs (`manual-test-plan`, `manual-test-v2`).

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Wrong link to plan | Recompute from `.cursor/skills/manual-test-<slug>/` → `../../../` + plan path |
| Cwd breaks CLI discovery | Mirror **manual-test-multicloud-cli** §3b pattern when `otavia.yaml` is under `stacks/main` |
| Checklist in `run-sanity-checks` | Keep only the **index row** there; full steps stay in **manual-test-*** |
| Description = workflow summary | Triggers only; steps live in body |

## Related

**run-sanity-checks** (index + `.checks/`). Example suite: **manual-test-multicloud-cli**.
