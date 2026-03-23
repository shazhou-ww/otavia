---
name: run-sanity-checks
description: Use when about to claim tests, builds, or tasks succeeded without fresh command output; user asks to verify, sanity-check, or smoke-test; before commit or PR; when combining automated repo commands with optional manual-test-* skills.
---

# Run sanity checks

## Overview

Combine **automated commands** (logs under `.checks/`) and **manual-test-*** skills (stepwise procedures). **Evidence before claims** for both.

## Core rule

If verification was not run in this turn with output reviewed (or manual steps executed and recorded), do not claim success.

## Gate (every completion claim)

1. **Identify** which command(s) or manual sections prove the claim.
2. **Run** the full command fresh, **or** execute manual steps in order without skipping verify substeps.
3. **Read** stdout/stderr, exit code, failure counts (automated); for manual, record outcomes per step.
4. **Verify** results match the claim; if not, report actual status with evidence.
5. **Only then** state pass/fail or completion.

Skipping a step is not verification.

## Temporary files: `.checks/`

- Put **all ephemeral artifacts** under repo root **`.checks/`** (logs, manual workspaces, captures, repro fixtures).
- **Do not** scatter temp files under `packages/`, `docs/`, or source trees unless the task requires it.
- **`.checks/` is gitignored** — never commit these files.
- Create `.checks/` when needed without asking the user.

Example (PowerShell, repo root):

```powershell
New-Item -ItemType Directory -Force -Path .checks | Out-Null
bun run test 2>&1 | Tee-Object -FilePath .checks/last-test.log
```

## Manual suites → separate skills

Each manual suite is its own skill, **name prefixed `manual-test-`** (short, hyphenated). Read that skill for full steps; this skill does not duplicate them. To **create** a new suite from a plan doc, use **write-manual-test**.

**Shared rules for every `manual-test-*`:**

- Temp workspaces and logs stay under **`.checks/`** unless the skill says otherwise.
- Run steps **in order**; verify after each major step.
- Long output: tee to `.checks/<hint>.log` and cite paths in the report.

**Index:**

| Skill | Focus |
|-------|--------|
| **manual-test-multicloud-cli** | Plan `2026-03-23-otavia-cli-multicloud.md` 验证清单：init→install→setup→typecheck→lint，可选 deploy，`packages/stack` 测试与计划覆盖对照 |

## Otavia monorepo (automated defaults)

From repo root:

- `bun run test`, `bun run typecheck`
- `bun run smoke:init` — uses system temp; for plan-aligned init/install use **manual-test-multicloud-cli** under `.checks/`

Scoped changes: **`bun run --cwd packages/<name> test`** or **`typecheck`** as appropriate.

## Claims vs proof

| Claim | Not sufficient | Requires |
|-------|----------------|----------|
| Tests pass | Earlier run | Fresh test command: 0 failures |
| Types OK | Lint only | `typecheck` exit 0 |
| Build OK | Tests only | Build exit 0 |
| Plan checklist done | Automated only | Relevant **manual-test-*** executed + report |
| Bug fixed | Code edited | Symptom or failing test fixed |

## Red flags

"Should", "probably", "seems fine" before checks; satisfaction before output; committing while assuming green.

## Related

**verification-before-completion** when provided. For multicloud plan manual steps, **manual-test-multicloud-cli**.
