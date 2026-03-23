---
name: write-manual-test
description: Use when the user points at a specific plan markdown and wants a new manual-test-* Cursor skill scaffolded from its verification checklist; adding or refreshing stepwise manual procedures aligned with docs/superpowers plans.
---

# write-manual-test

## Overview

Turn a **named plan document** into a **separate** skill under `.cursor/skills/manual-test-<short>/SKILL.md`, following the same pattern as **manual-test-multicloud-cli**: grouped steps, per-step **Verify**, `.checks/` workspaces and logs, optional **SKIPPED** / **GAP** honesty, report template. Any **`init` into `.checks/`** for Otavia stacks **must** follow **Standard: Otavia CLI workspaces** above (link + `--use-global-otavia` + `CLI=…` + `bun run "$CLI"`). **Do not** fold new suites into `run-sanity-checks` body — only register them in its index table.

**REQUIRED:** Read **run-sanity-checks** for shared rules (`.checks/`, evidence gate). This skill adds authoring steps only.

## Standard: Otavia CLI workspaces（`manual-test-*` 强制一致）

凡计划在 **`.checks/…`** 下用 monorepo 里的 **`@otavia/cli` `init`** 搭临时栈的 **`manual-test-*` 技能**，**只写一条路**，不要写「registry 能装则用默认 init」之类的分支速查：

1. **`bun link --global`**：在 **`$OTAVIA_REPO/packages/cli`** 执行（init 前一次即可；同一次跑可重复执行无害）。
2. **`init`**：始终带 **`--use-global-otavia`**（以及计划要求的 `--provider` 等），例如  
   `bun run "$OTAVIA_REPO/packages/cli/src/cli.ts" init "$WS" --provider aws --use-global-otavia`。
3. **`bun install --no-cache`**：在 **`$WS` 根执行**（Windows Bun cache 问题，勿省 `--no-cache`）。
4. **`setup` / `dev` / `test` / …**：设 **`CLI="$OTAVIA_REPO/packages/cli/src/cli.ts"`**，用 **`bun run "$CLI" <subcommand>`**；不要假设栈里已解析 **`devDependencies.@otavia/cli`**。
5. **Shell 示例**：用 **POSIX `sh` / bash** 块（macOS、Linux、**Git Bash**、**WSL**）；纯 Windows PowerShell 时在技能里**一句说明**由执行者自行对等改写路径与语法。
6. **报告模板**里 **Init / install** 只描述上述单一路径（勿写「registry | link」二选一）。

参考实现：**manual-test-multicloud-cli**。

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
   - Call out **cwd / path traps** (e.g. CLI resolves stack only from certain directories), **env skips** (`OTAVIA_SETUP_SKIP_TOOLCHAIN`, `OTAVIA_SETUP_SKIP_CLOUD_IDENTITY` for non-interactive `setup`), **tooling-limited** passes (no `biome.json`), **credentials required** blocks with **SKIPPED** if not met.
   - **Automated checks** tied to the plan: exact commands (e.g. `bun run --cwd packages/stack test`), plus a **coverage / GAP** table when the plan claims test coverage that may span multiple files.
   - **Report template** at the end; heading uses the skill id (`## manual-test-<slug>`). If init applies, include **Init / install** line matching **Standard: Otavia CLI workspaces** (single path only).
5. **Register** in **run-sanity-checks** `SKILL.md` → **Index** table: new row **Skill** + one-line **Focus** (plan filename + what the suite covers).
6. **Otavia repo / Bun：** 临时 workspace 一律 **`bun install --no-cache`**。手工步骤正文用 **POSIX sh/bash** 与上文标准一致；需要 Windows 专用说明时单独一句，勿与标准 init 路径分叉矛盾。冗长输出可用 `tee` 写到 `.checks/*.log`（bash）或说明 PowerShell 用 `Tee-Object`。

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
| `.checks/` init 写「默认 init + registry 拉 `@otavia/cli`」或决策表 | 只写 **link + `--use-global-otavia`** + **`CLI` + `bun run "$CLI"`**（见 **Standard: Otavia CLI workspaces**） |

## Related

**run-sanity-checks** (index + `.checks/`). Example suite: **manual-test-multicloud-cli**.
