---
name: manual-test-multicloud-cli
description: Use when verifying the multicloud CLI plan human checklist; user asks for plan sign-off, manual init→install→setup→typecheck→lint under .checks/, optional deploy with credentials, or stack-model test coverage vs plan claims.
---

# manual-test-multicloud-cli

**Source:** [docs/superpowers/plans/2026-03-23-otavia-cli-multicloud.md](../../../docs/superpowers/plans/2026-03-23-otavia-cli-multicloud.md) — **验证清单（人类 / CI）**.

**Scope:** One fresh workspace under repo `.checks/` per run; execute steps in order; record exit codes and stdout/stderr (or `.checks/*.log` paths); do not claim a checklist bullet without evidence.

---

## Group A — Clean temp workspace: init → install → setup / typecheck / lint

**Maps to plan item:** 干净临时目录：`init` → `bun install --no-cache` → 在 `stacks/main` 下 `setup` / `typecheck` / `lint` 通过。

### 0. Paths

- `OTAVIA_REPO` = monorepo root (contains `packages/cli`).
- Workspace: `OTAVIA_REPO/.checks/manual-multicloud/<run-id>/` (unique `run-id`, e.g. `yyyyMMdd-HHmmss`). Logs under `OTAVIA_REPO/.checks/`.

### 1. Prepare empty directory

```powershell
$OTAVIA_REPO = "D:\Code\otavia"   # adjust
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$ws = Join-Path $OTAVIA_REPO ".checks/manual-multicloud/$runId"
New-Item -ItemType Directory -Force -Path $ws | Out-Null
Set-Location $OTAVIA_REPO
```

### 2. `init`

```powershell
bun run packages/cli/src/cli.ts init $ws --provider aws
```

**Verify:** exit `0`; `Join-Path $ws 'stacks/main/otavia.yaml'` exists. Optional: second workspace with `--provider azure`.

### 3. `bun install --no-cache`

```powershell
Set-Location $ws
bun install --no-cache
```

**Verify:** exit `0`.

```powershell
$cli = Join-Path $OTAVIA_REPO "packages/cli/src/cli.ts"
```

### 3b. `Set-Location` to `stacks/main` (required)

`findStackRoot` walks **up** from cwd; `otavia.yaml` lives under `stacks/main`, not workspace root.

```powershell
Set-Location (Join-Path $ws "stacks/main")
```

Keep this cwd for steps 4–6 and Group B `deploy`.

### 4. `setup`

Without `aws`/`az`, use skip **and** note partial human checklist:

```powershell
$env:OTAVIA_SETUP_SKIP_TOOLCHAIN = "1"
bun run $cli setup
```

**Verify:** exit `0`; list `buildStackModel` warnings if any.

```powershell
Remove-Item Env:OTAVIA_SETUP_SKIP_TOOLCHAIN -ErrorAction SilentlyContinue
```

### 5. `typecheck`

```powershell
bun run $cli typecheck
```

**Verify:** exit `0`.

### 6. `lint`

```powershell
bun run $cli lint
```

**Verify:** exit `0`. No `biome.json` → CLI may print nothing to do; exit `0` is pass but report **tooling-limited** lint.

---

## Group B — Deploy (AWS / Azure)

**Maps to plan item:** 有凭证时 AWS / Azure `deploy` 成功（可分两个临时项目）。

Only if user confirmed credentials and safe accounts. Cwd: `stacks/main`.

```powershell
$cli = Join-Path $OTAVIA_REPO "packages/cli/src/cli.ts"
bun run $cli deploy
```

**Verify:** exit `0` per provider. Else **`SKIPPED (no credentials / user declined)`** — do not claim full checklist.

---

## Group C — `buildStackModel` coverage vs plan

**Maps to plan item:** 环检测、`cells[mount].params` 非法 `!Var`、未知键 warning。

From `OTAVIA_REPO`:

```powershell
bun run --cwd packages/stack test
```

**Verify:** exit `0`; capture pass/fail summary.

Map to plan using `packages/stack/src/build-stack-model.test.ts` **and** related tests (`parse-otavia-yaml`, `resolve-cell-mount-params`, etc.). If a plan row has no test, report **`GAP`** — do not claim coverage by tests alone.

| Plan expectation | Evidence to cite |
|------------------|------------------|
| Cycle detection | test name + file |
| Invalid `!Var` / disallowed refs in cell params | test name + file |
| Unknown keys → warning | test name + file |

---

## Report template

```markdown
## manual-test-multicloud-cli

- **Group A** (`.checks/manual-multicloud/<run-id>`): PASS | FAIL — …
- **Group B**: PASS | FAIL | SKIPPED — …
- **Group C**: PASS | FAIL — summary; coverage / GAP — …
```
