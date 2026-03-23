---
name: manual-test-multicloud-cli
description: Use when verifying multicloud CLI in a fresh .checks/ workspace; focus on dev (gateway + /hello/) working and otavia test passing; deploy is out of scope for default sign-off. Optional typecheck/lint/setup/toolchain skips per plan.
---

# manual-test-multicloud-cli

**Source:** [docs/superpowers/plans/2026-03-23-otavia-cli-multicloud.md](../../../docs/superpowers/plans/2026-03-23-otavia-cli-multicloud.md) — **验证清单（人类 / CI）**.

**Default acceptance (this skill):**

1. **`dev` 能跑通**：从 `stacks/main` 启动后，**`/hello/`**（或根跳转后的等价路径）返回预期内容，无 gateway “no createAppForBackend” 类致命问题。
2. **`otavia test` 能跑通**：样例 stack / cell 含 **unit + e2e** 测试目录，`otavia test` exit `0`。

**Out of scope unless user explicitly asks:** **`deploy`**（云凭证、真实账号）— 默认不验证、不记入 PASS；若跳过，在报告里写 **`SKIPPED (deploy not required)`** 即可。

**Scope:** One fresh workspace under repo `.checks/` per run; execute steps in order; record exit codes and stdout/stderr (or `.checks/*.log` paths); do not claim a checklist bullet without evidence.

---

## Group A — Clean temp workspace: init → install → setup → **dev** → **test** → (optional) typecheck / lint

**Maps to plan item:** 干净临时目录：`init` → `bun install --no-cache` → `stacks/main` 下 **setup**（可按需跳过 toolchain）→ **`dev` 可访问** → **`otavia test` 通过** → 可选 typecheck / lint。

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

**CLI 未发布到 registry 时**：在 `$ws` 根把 `@otavia/cli` 指到本仓库再安装，例如：

```powershell
Set-Location $ws
bun add --no-cache -d (Join-Path $OTAVIA_REPO "packages/cli")
bun install --no-cache
```

若已能从 registry 解析 `@otavia/cli`，直接：

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

Keep this cwd for steps 4–7 (and optional typecheck / lint).

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

### 5. `dev`（**必验**）

**目标：** gateway 挂载 hello cell，`/hello/` 有响应（模板样例 body 为 `ok`）。

终端 A（保持运行）：

```powershell
bun run $cli dev
```

终端 B（cwd 任意）：

```powershell
# Prefer curl if available
curl.exe -sS -D - http://127.0.0.1:8787/hello/ -o NUL

# 或 PowerShell
(Invoke-WebRequest -Uri "http://127.0.0.1:8787/hello/" -UseBasicParsing).Content
```

**Verify:** HTTP **200**；响应体含 **`ok`**（与模板 `handler` 一致）。若出现 `no cell exported createAppForBackend` 等 404 文案 → **FAIL**。

结束后在终端 A 用 `Ctrl+C` 停掉 dev。

### 6. `test`（**必验**）

样例 **stack** 与 **cell** 均含 `test/unit` 与 `test/e2e`；`otavia test` 对 stack 与各 cell 依次执行 `bun run test`（fail-fast）。

```powershell
# cwd: stacks/main
bun run $cli test
```

**Verify:** exit `0`；日志中应出现对 **stack 目录**与 **`cells/hello`** 的测试运行，且 unit / e2e 均执行。

**说明：** 栈包内 `package.json` 的 `test` 为 **`bun test test/unit test/e2e`**（避免 `otavia test` 递归）；全栈一键跑用上面的 **`bun run $cli test`** 或栈内脚本 **`bun run test:all`**。

### 7. `typecheck`（可选）

```powershell
bun run $cli typecheck
```

**Verify:** exit `0`. 模板栈/cell 使用 `tsc --noEmit`；若未装全依赖可记 **tooling-limited**。

### 8. `lint`（可选）

```powershell
bun run $cli lint
```

**Verify:** exit `0`. No `biome.json` → CLI may print nothing to do; exit `0` is pass but report **tooling-limited** lint.

---

## Group B — Deploy（默认不验）

**Maps to plan item:** 有凭证时 AWS / Azure `deploy` 成功。

**本 skill 默认不要求执行 Group B。** 仅当用户明确要求且已确认凭证与安全账号时再跑；否则报告 **`SKIPPED (deploy not required)`**。

```powershell
$cli = Join-Path $OTAVIA_REPO "packages/cli/src/cli.ts"
bun run $cli deploy
```

**Verify (only if run):** exit `0` per provider.

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

- **Group A** (`.checks/manual-multicloud/<run-id>`): PASS | FAIL — setup …; **dev** …; **test** …; optional typecheck/lint …
- **Group B (deploy)**: SKIPPED (default) | PASS | FAIL — …
- **Group C**: PASS | FAIL — summary; coverage / GAP — …
```
