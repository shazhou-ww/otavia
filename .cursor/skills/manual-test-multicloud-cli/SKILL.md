---
name: manual-test-multicloud-cli
description: Use when verifying multicloud CLI in a fresh .checks/ workspace; always packages/cli bun link --global + init --use-global-otavia, then dev (/hello/) + otavia test; deploy out of scope by default.
---

# manual-test-multicloud-cli

**Source:** [docs/superpowers/plans/2026-03-23-otavia-cli-multicloud.md](../../../docs/superpowers/plans/2026-03-23-otavia-cli-multicloud.md) — **验证清单（人类 / CI）**.

**Shell（平台无关）：** 下文以 **POSIX `sh` / bash** 为准（macOS、Linux、**Git Bash**、**WSL**）。将 **`OTAVIA_REPO`** 换成本机 monorepo 绝对路径。纯 **Windows PowerShell** 请自行对等替换，或用 bash 执行片段。

**Default acceptance (this skill):**

1. **`dev` 能跑通**：从 `stacks/main` 启动后，**`/hello/`**（或根跳转后的等价路径）返回预期内容，无 gateway “no createAppForBackend” 类致命问题。
2. **`otavia test` 能跑通**：样例 stack / cell 含 **unit + e2e**；`otavia test` exit `0`。

**Out of scope unless user explicitly asks:** **`deploy`** — 默认不验；报告 **`SKIPPED (deploy not required)`**。

**Scope:** 每次在 `OTAVIA_REPO/.checks/manual-multicloud/<run-id>/` 新建 workspace；按序执行并留证；无证据不勾清单项。

**Init 唯一路径（本技能）：** 先 **`(cd "$OTAVIA_REPO/packages/cli" && bun link --global)`**，再 **`init "$WS" … --use-global-otavia`**；栈内脚本为 **`otavia …`**（PATH 上 global link 的 **bin `otavia`**）。后续子命令一律 **`CLI="$OTAVIA_REPO/packages/cli/src/cli.ts"`** + **`bun run "$CLI" <subcommand>`**，不依赖栈内是否安装 `@otavia/cli`。

---

## Group A — init → install → setup → **dev** → **test** → (optional) typecheck / lint

### 0. Paths

- **`OTAVIA_REPO`**：monorepo 根。
- **`WS`**：`$OTAVIA_REPO/.checks/manual-multicloud/<run-id>`。

### 1. Prepare empty directory

```sh
OTAVIA_REPO="/path/to/otavia"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
WS="$OTAVIA_REPO/.checks/manual-multicloud/$RUN_ID"
mkdir -p "$WS"
cd "$OTAVIA_REPO"
```

### 2. `init`（`bun link --global` + `--use-global-otavia`）

```sh
( cd "$OTAVIA_REPO/packages/cli" && bun link --global )
cd "$OTAVIA_REPO"
bun run packages/cli/src/cli.ts init "$WS" --provider aws --use-global-otavia
```

**Verify：** exit `0`；存在 **`$WS/stacks/main/otavia.yaml`**。可选：`--provider azure`。

### 3. `bun install --no-cache`

```sh
cd "$WS"
bun install --no-cache
```

**Verify：** exit `0`。

```sh
CLI="$OTAVIA_REPO/packages/cli/src/cli.ts"
```

### 3b. `cd` 到 `stacks/main`

```sh
cd "$WS/stacks/main"
```

步骤 **4–8** 保持此 cwd。

### 4. `setup`

```sh
export OTAVIA_SETUP_SKIP_TOOLCHAIN=1
bun run "$CLI" setup
unset OTAVIA_SETUP_SKIP_TOOLCHAIN
```

**Verify：** exit `0`；记录 `buildStackModel` warnings。

### 5. `dev`（**必验**）

**终端 A：**

```sh
bun run "$CLI" dev
```

**终端 B：**

```sh
curl -sS -i "http://127.0.0.1:8787/hello/"
```

**Verify：** HTTP **200**，body 含 **`ok`**。404 含 **no createAppForBackend** → **FAIL**。终端 A **Ctrl+C** 停 dev。

### 6. `test`（**必验**）

```sh
bun run "$CLI" test
```

**Verify：** exit `0`；stack 与 **`cells/hello`** 均有测试输出。

### 7. `typecheck`（可选）

```sh
bun run "$CLI" typecheck
```

### 8. `lint`（可选）

```sh
bun run "$CLI" lint
```

---

## Group B — Deploy（默认不验）

```sh
CLI="$OTAVIA_REPO/packages/cli/src/cli.ts"
bun run "$CLI" deploy
```

否则 **`SKIPPED (deploy not required)`**。

---

## Group C — `buildStackModel` 与计划对照

```sh
cd "$OTAVIA_REPO"
bun run --cwd packages/stack test
```

| Plan 期望 | 证据 |
|-----------|------|
| 环检测 | test 名 + 文件 |
| cell params 非法 `!Var` 等 | test 名 + 文件 |
| 未知键 → warning | test 名 + 文件 |

---

## Report template

```markdown
## manual-test-multicloud-cli

- **Init / install:** `bun link --global`（`packages/cli`）+ `init --use-global-otavia` + `bun install --no-cache`
- **Group A**: PASS | FAIL — setup …; **dev** …; **test** …; optional typecheck/lint …
- **Group B (deploy)**: SKIPPED (default) | PASS | FAIL — …
- **Group C**: PASS | FAIL — summary; coverage / GAP — …
```
