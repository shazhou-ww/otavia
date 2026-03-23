# Otavia 云中立 CLI（MVP）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本仓库中实现 `@otavia/cli` 及配套包，使**终端项目**满足 spec 中的 `init → setup → dev|test|lint|typecheck → deploy` 全链路，**AWS 与 Azure 均能真实 deploy**（最小无 DB/Blob 的函数 + HTTP 入口），并保留与 `@otavia/cli-legacy` 的过渡期共存。

**Architecture:** `@otavia/stack` 负责 YAML 解析、`variables`/`!Var`/`!Param` 解析顺序与环路检测、Stack 模型（含 `environments`/`secrets`、相对 stack 根路径）。`@otavia/cli` 负责 workspace/stack 根解析、dotenv 链、子命令编排。`@otavia/host-aws` / `@otavia/host-azure` 实现 `@otavia/host-contract`：工具链检查、`.otavia/` 下 CFN/Bicep 生成与部署。`@otavia/runtime-*` 为示例 cell 后端提供极小 API 面。

**Tech Stack:** Bun、TypeScript、commander（或与 legacy 一致）、YAML 自定义 tag（可对齐 legacy `load-otavia-yaml` 思路）、Biome、Vite；AWS CloudFormation + AWS CLI/SDK；Azure Bicep + Azure CLI。

**Spec（权威）:** `docs/superpowers/specs/2026-03-23-otavia-cli-multicloud-design.md`

---

## 文件结构总览（框架仓库内新建/修改）

| 路径 | 职责 |
|------|------|
| `packages/host-contract/src/*.ts` | `HostAdapter` 接口：provider id、`checkToolchain`、`checkCredentials`、`synthesizeAndDeploy`（或拆成 synthesize + deploy）、dev 用钩子（可选） |
| `packages/host-aws/src/*.ts` | AWS 实现；`.otavia/cloudformation/` 或等价 |
| `packages/host-azure/src/*.ts` | Azure 实现；`.otavia/bicep/` |
| `packages/stack/src/*.ts` | 解析 `otavia.yaml`/`cell.yaml`、变量解析图、导出 `loadStackContext`/`buildStackModel` |
| `packages/runtime-contract/src/index.ts` | 极小类型/占位（如 logger 工厂） |
| `packages/runtime-aws`、`packages/runtime-azure` | 适配实现 + package.json `exports` |
| `packages/cli/src/cli.ts` | `otavia` 入口、子命令注册 |
| `packages/cli/src/commands/*.ts` | `init`、`setup`、`dev`、`test`、`lint`、`typecheck`、`deploy` |
| `packages/cli/src/resolve/*.ts` | workspace 根（`package.json` + `workspaces`）、stack 根（含 `otavia.yaml` 的目录）、dotenv 加载 |
| `packages/cli/assets/templates/**` | `init` 生成的终端项目模板（`stacks/main`、`cells/hello`、根 `package.json` workspaces） |
| `package.json`（根） | `workspaces` 已含 `packages/*` 则自动纳入新包；根 scripts 增加 `otavia` 新 CLI 的 dev 入口 |
| `docs/...` | 本 plan；README 更新可放在「文档任务」末 |

**刻意不做（YAGNI）：** 不重写 legacy 包；MVP 不实现 `otavia cell create` 等扩展子命令，除非 plan 末尾时间充裕。

---

### Task 1: 脚手架 — 空包与 TypeScript 基线

**Files:**
- Create: `packages/host-contract/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/stack/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/host-aws/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/host-azure/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/runtime-contract/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/runtime-aws/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/runtime-azure/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/cli/package.json`, `tsconfig.json`, `src/cli.ts`（空 commander）
- Modify: 根 `package.json` scripts（可选）指向新 CLI 的本地运行命令

- [x] **Step 1:** 为每个包设置 `"name": "@otavia/..."`、`"type": "module"`、对齐 `cli-legacy` 的 `typescript`/`@types/bun` 版本。
- [x] **Step 2:** `bun install --no-cache` 于仓库根，确认无 workspace 冲突。
- [x] **Step 3:** `bun run --cwd packages/cli typecheck`（或逐包）通过空项目。
- [x] **Step 4:** Commit：`chore: scaffold @otavia multicloud packages`

---

### Task 2: `host-contract` — 接口冻结

**Files:**
- Create: `packages/host-contract/src/types.ts` — `ProviderId`、`HostAdapter`、`DeployInput`（含 Stack 摘要或序列化句柄）
- Modify: `packages/host-contract/src/index.ts` 导出

- [x] **Step 1:** 写测试 `packages/host-contract/src/types.test.ts`：`satisfies HostAdapter` 的 mock 对象可赋值（编译期 + 运行时空测）。
- [x] **Step 2:** 定义方法：`checkToolchain(): Promise<void>`、`checkCredentials(): Promise<void>`、`deployStack(input: DeployInput): Promise<void>`（名称可微调，但须在 plan 与代码一致）。
- [x] **Step 3:** Commit：`feat(host-contract): define HostAdapter`

---

### Task 3: Dotenv 与命令场景（CLI 库）

**Files:**
- Create: `packages/cli/src/env/load-env-for-command.ts`
- Create: `packages/cli/src/env/load-env-for-command.test.ts`

- [x] **Step 1:** 实现函数 `loadEnvForCommand(stackRoot: string, command: 'dev' | 'test' | 'deploy'): Record<string, string>`：按 spec **先 `.env` 再 `.env.{dev|test|deploy}`**，后者覆盖；文件不存在则跳过。
- [x] **Step 2:** 写测试：在 `tmp` 目录写入假文件，断言合并与覆盖顺序。
- [x] **Step 3:** Commit：`feat(cli): load env chains per command`

---

### Task 4: Workspace 与 stack 根解析

**Files:**
- Create: `packages/cli/src/resolve/find-workspace-root.ts`
- Create: `packages/cli/src/resolve/find-stack-root.ts`
- Create: `packages/cli/src/resolve/find-workspace-root.test.ts`
- Create: `packages/cli/src/resolve/find-stack-root.test.ts`

- [x] **Step 1:** `findWorkspaceRoot(cwd)`：向父目录查找，**第一个**含 `package.json` 且 JSON 内有 **`workspaces`** 字段的目录。
- [x] **Step 2:** `findStackRoot(cwd)`：从 cwd 向父直到 workspace 根，路径上**第一个**含 **`otavia.yaml`** 的目录为 stack 根；若 cwd 在 `stacks/foo` 下则找到该目录。
- [x] **Step 3:** 测试覆盖：临时目录下伪造目录树。
- [x] **Step 4:** Commit：`feat(cli): resolve workspace and stack roots`

---

### Task 5: `@otavia/stack` — YAML 加载与自定义 tag

**Files:**
- Create: `packages/stack/src/yaml/load-yaml.ts`
- Create: `packages/stack/src/yaml/tags.ts` — `!Env`、`!Secret`、`!Var`、`!Param` 节点类型（非解析，仅 AST/中间表示）
- Create: `packages/stack/src/yaml/load-yaml.test.ts`

- [x] **Step 1:** 使用与 legacy 相同或兼容的 YAML 库注册 tag，将 tag 解析为**显式对象**（如 `{ kind: 'env', key: 'FOO' }`），避免与纯字符串混淆。
- [x] **Step 2:** 测试：含 `!Var` / `!Env` 的小字符串可被 round-trip 识别。
- [x] **Step 3:** Commit：`feat(stack): yaml tags for Var/Param/Env/Secret`

---

### Task 6: `otavia.yaml` 解析与 cells 列表

**Files:**
- Create: `packages/stack/src/otavia/parse-otavia-yaml.ts`
- Create: `packages/stack/src/otavia/parse-otavia-yaml.test.ts`

- [x] **Step 1:** 解析 `name`、`provider`（对象；**云判别**与 spec §5.1 一致：AWS 用 **`region`**，Azure 用 **`location`**，实现中单一函数 `providerKind(provider)` 返回 `'aws'|'azure'`，歧义或两键皆无则 **throw**）、`variables`、`cells`（值为包名字符串或 `{ package, params? }` 扩展可后续加）、**拒绝**任意位置出现 `!Param`（抛错）。**整文件 AST/tag 校验（与 spec §6.1、§6.4 对齐）**：`**!Env` / `!Secret` / `!Var` 仅允许出现在**顶层 **`variables` 子树**以及 **`cells[mount].params` 的值**中；在 `name`、`provider`、`cells` 键名映射（非 params 值）等其它位置出现上述 tag → **throw**。
- [x] **Step 2:** **未知顶层键**收集为 `warnings: string[]` 返回，不抛错。
- [x] **Step 3:** Commit：`feat(stack): parse otavia.yaml shape`

---

### Task 7: 顶层 `variables` 解析 — 图与拓扑

**Files:**
- Create: `packages/stack/src/variables/resolve-top-variables.ts`
- Create: `packages/stack/src/variables/graph.ts`
- Create: `packages/stack/src/variables/resolve-top-variables.test.ts`

- [x] **Step 1:** 从 `variables` 树收集 **`!Var` 边**（源键 → 目标键名）；检测环；无环则拓扑求值。
- [x] **Step 2:** `!Env`/`!Secret` 作为叶节点参与拓扑；解析后填充 `environments`、`secrets` 侧车结构（spec §6.5）。
- [x] **Step 3:** `!Var` 目标不在树内 → 从传入的 `processEnv` 取字符串。
- [x] **Step 4:** 测试：含环 YAML 应 throw；无环应得确定顺序结果。
- [x] **Step 5:** Commit：`feat(stack): resolve top-level variables with cycle detection`

---

### Task 8: `cells[mount].params` 与 `!Var` → 顶层键

**Files:**
- Create: `packages/stack/src/otavia/resolve-cell-mount-params.ts`
- Create: `packages/stack/src/otavia/resolve-cell-mount-params.test.ts`

- [x] **Step 1:** 输入：已解析的顶层 `variables` 映射；每个 mount 的 `params` 字典；**禁止** `!Param`；`!Var` 仅允许引用顶层键。
- [x] **Step 2:** 测试：非法 `!Var` 抛错；合法代入。
- [x] **Step 3:** Commit：`feat(stack): resolve cells[mount].params`

---

### Task 9: `cell.yaml` 解析与 `variables` 段

**Files:**
- Create: `packages/stack/src/cell/parse-cell-yaml.ts`
- Create: `packages/stack/src/cell/resolve-cell-variables.ts`
- Create: `packages/stack/src/cell/resolve-cell-body.ts`
- Create: `packages/stack/src/cell/*.test.ts`

- [x] **Step 1:** 解析 `params: string[]`、`variables` 树、`backend`/`frontend`（MVP 字段对齐 legacy fixture 的最小子集）。**加载后立即扫描整棵 AST**：若出现 **`!Env` / `!Secret`**（含 `variables` 段内），**抛错**（spec §6.1、§6.4）。
- [x] **Step 2:** `resolveCellVariables`：`!Var→!Var` 环检测；`!Param` 从 cell 的「已合并 stack params」取值；树外 `!Var` 回退 `processEnv`。
- [x] **Step 3:** `resolveCellBody`：段外展开 `!Param`/`!Var`。
- [x] **Step 4:** 未知键 → warnings。
- [x] **Step 5:** Commit：`feat(stack): cell.yaml variables and body resolution`

---

### Task 10: 从 stack 包解析 node_modules 中的 cell

**Files:**
- Create: `packages/stack/src/resolve/resolve-cell-package-dir.ts`
- Create: `packages/stack/src/resolve/resolve-cell-package-dir.test.ts`

- [x] **Step 1:** 使用 `import.meta.resolve` 或 `createRequire(stackPackageJsonDir)` 解析包名 → 目录（Bun 下验证）。
- [x] **Step 2:** 集成测试：在 `packages/stack/test-fixtures/minimal-workspace`（可提交小 fixture）中 `bun install`，断言解析到 `cells/hello` 模拟包。
- [x] **Step 3:** Commit：`feat(stack): resolve cell packages from stack package context`

---

### Task 11: `buildStackModel` 聚合 API

**Files:**
- Create: `packages/stack/src/build-stack-model.ts`
- Create: `packages/stack/src/types.ts` — 导出 `StackModel`（含 `cells` 展开、`environments`、`secrets`、相对 stack 根路径）
- Create: `packages/stack/src/build-stack-model.test.ts`

- [x] **Step 1:** 输入：`stackRoot`、`workspaceRoot`、`command`（决定 env）、`process.env`；按 **spec §6.2 步骤 1–6** 串联 Task 6–10 与 Task 9；**步骤 4**：对每个 cell，**`cell.yaml` 的 `params` 声明的每个名字必须在 `cells[mount].params` 中有键**（缺键 **throw**，与 spec 一致）。
- [x] **Step 2:** 将所有文件路径字段规范为 **POSIX 相对 stack 根**（`path.relative` + normalize）。
- [x] **Step 3:** Commit：`feat(stack): buildStackModel entrypoint`

---

### Task 12: `host-aws` — 工具链与凭证检查

**Files:**
- Create: `packages/host-aws/src/aws-host.ts`
- Create: `packages/host-aws/src/aws-host.test.ts`（mock `spawn` 或仅测「命令字符串构造」，避免真 AWS）

- [x] **Step 1:** `checkToolchain`：`aws` 可执行。
- [x] **Step 2:** `checkCredentials`：`aws sts get-caller-identity`（可设环境变量跳过测试）。
- [x] **Step 3:** Commit：`feat(host-aws): toolchain and credentials checks`

---

### Task 13: `host-aws` — 生成最小 CloudFormation 并部署

**Files:**
- Create: `packages/host-aws/src/template/minimal-http-lambda.ts`（或 YAML 字符串模板）
- Create: `packages/host-aws/src/deploy/write-and-deploy.ts`

- [x] **Step 1:** 写入 `stackRoot/.otavia/aws/template.yaml`（gitignore 由模板项目负责；框架内 e2e 用临时目录）。
- [x] **Step 2:** `deployStack` 的 **`DeployInput`** 携带 **`StackModel.environments` / `StackModel.secrets`**：MVP 至少将 **非空** `environments` 映射为 Lambda/函数应用的环境变量；**secrets** 映射为 **SSM Parameter Store 引用**或模板参数（若某键暂无云绑定，文档写明限制并 **warn**）。
- [x] **Step 3:** `aws cloudformation deploy` 或等价；参数化 `StackName`、`region`（来自 `provider.region`）。
- [x] **Step 4:** 文档或脚本说明：开发者需自有 AWS 账户验证（CI 可 mark optional）。
- [x] **Step 5:** Commit：`feat(host-aws): minimal CFN deploy`

---

### Task 14: `host-azure` — 工具链与凭证检查

**Files:**
- Create: `packages/host-azure/src/azure-host.ts`
- Create: `packages/host-azure/src/azure-host.test.ts`

- [x] **Step 1:** `checkToolchain`：`az`、`bicep`（或 `az bicep` 子命令，择一写死）。
- [x] **Step 2:** `checkCredentials`：`az account show`。
- [x] **Step 3:** Commit：`feat(host-azure): toolchain and credentials checks`

---

### Task 15: `host-azure` — 最小 Bicep 并部署

**Files:**
- Create: `packages/host-azure/src/template/minimal-function.bicep`（及 `.parameters` 若需要）
- Create: `packages/host-azure/src/deploy/write-and-deploy.ts`

- [x] **Step 1:** 写入 `stackRoot/.otavia/azure/` 下 `.bicep` 文件。
- [x] **Step 2:** **`DeployInput`** 同样携带 **`environments` / `secrets`**：MVP 将 `environments` 写入应用设置；`secrets` 对接 **Key Vault 引用**或模板参数（限制与 AWS 对称，文档说明）。
- [x] **Step 3:** `az deployment group create` 或订阅级部署（实施时选定一种并写死）；`location` 来自 `provider.location`。
- [x] **Step 4:** Commit：`feat(host-azure): minimal bicep deploy`

---

### Task 16: CLI — `HostAdapter` 工厂

**Files:**
- Create: `packages/cli/src/host/create-host-adapter.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1:** 读 `StackModel` 中 `provider` 判别 `aws` | `azure`（具体判别键在实现中固定，如 `provider.type` 或 `'region' in provider` — **须在 `types.ts` 单一真相**）。
- [ ] **Step 2:** 返回对应 `HostAdapter`。
- [ ] **Step 3:** Commit：`feat(cli): host adapter factory`

---

### Task 17: `init` 命令与终端项目模板

**Files:**
- Create: `packages/cli/assets/templates/init/**`（根 package.json、`stacks/main`、`cells/hello`、`.gitignore` 含 `.otavia/`）
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/init.test.ts`（在 temp 目录跑 init）

- [ ] **Step 1:** 生成 **workspace** `package.json`，`workspaces` 包含 `stacks/*`、`cells/*`、`packages/*`（若模板含 packages）。
- [ ] **Step 2:** `stacks/main/package.json` **dependencies** 含 `@scope/hello`（与 `cells/hello` 包名一致）。
- [ ] **Step 3:** `otavia.yaml` 含 `variables`、`cells` 包名、`provider`（**AWS 模板仅 `region`**，**Azure 模板仅 `location`**，与 §5.1 一致；或 `--provider` 开关切换两套默认文件）。
- [ ] **Step 4:** `cell.yaml` 含最小 `backend`/`frontend`、`params`/`variables` 可选示例。
- [ ] **Step 5:** Commit：`feat(cli): otavia init template`

---

### Task 18: `setup` 命令

**Files:**
- Create: `packages/cli/src/commands/setup.ts`

- [ ] **Step 1:** 调用 `host.checkToolchain`；从 `.env.example` 复制缺失的 `.env`（对齐 legacy 行为精神）。
- [ ] **Step 2:** 调用 `buildStackModel`（`command` 用 `dev` 或 `setup` 专用：若 spec 未定义，**采用 `dev` 的 env 链**并在 README 注一句）。**必须**执行与 **spec §6.2 步骤 4** 一致的校验：**每个 cell 的 `params` 声明均有 `cells[mount].params` 供给**；不满足则 **exit 1**（与 `buildStackModel` throw 对齐）。
- [ ] **Step 3:** 对缺失 `!Env`/`!Secret`（及 `!Var` 环境回退缺键）打印 **warning**（不强制 exit 1），但 **步骤 2 的配置错误不得被吞掉**。
- [ ] **Step 4:** Commit：`feat(cli): setup command`

---

### Task 19: `deploy` 命令

**Files:**
- Create: `packages/cli/src/commands/deploy.ts`

- [ ] **Step 1:** `loadEnvForCommand(..., 'deploy')`；`buildStackModel`；`checkCredentials`；`deployStack`。
- [ ] **Step 2:** 缺密钥或变量时 **exit 1**（与 spec error 语义一致）。
- [ ] **Step 3:** Commit：`feat(cli): deploy command`

---

### Task 20: `dev` — Vite + 网关（对齐 legacy 行为）

**Files:**
- Create: `packages/cli/src/commands/dev.ts`
- Create: `packages/cli/src/dev/gateway.ts`（可从 legacy **复制后改编** import 路径，减少发明）

- [ ] **Step 1:** 读 legacy `packages/cli-legacy/src/commands/dev/**` 最小子集，改为依赖 `StackModel`。
- [ ] **Step 2:** `loadEnvForCommand(..., 'dev')`；随后 **`buildStackModel(...)`**（与 Task 19 同参模式）；失败则 **exit 1**（解析/校验错误原样输出）。
- [ ] **Step 3:** **spec §7**：启动本地服务前调用 **`host.checkCredentials()`**（或等价命名）；失败则 **exit 1** 并提示登录方式（与 `setup` 分工：`setup` 装工具，`dev` 仍须能发现未登录）。
- [ ] **Step 4:** Commit：`feat(cli): dev server`

---

### Task 21: `test` / `lint` / `typecheck`

**Files:**
- Create: `packages/cli/src/commands/test.ts`, `lint.ts`, `typecheck.ts`

- [ ] **Step 1:** `test`：对 **stack 包目录**与 **解析出的每个 cell 包目录**执行 `bun test`（或 `package.json` scripts 约定）；`loadEnvForCommand(..., 'test')` 注入环境。
- [ ] **Step 2:** `lint`：`biome check` 同样遍历。
- [ ] **Step 3:** `typecheck`：`tsc -p` 或 `bun run typecheck`  per 包。
- [ ] **Step 4:** **fail-fast**：默认第一次失败即退出非零（在 help 中说明）。
- [ ] **Step 5:** Commit：`feat(cli): test lint typecheck orchestration`

---

### Task 22: `runtime-*` 与示例 cell 后端

**Files:**
- Modify: `packages/cli` 模板中 `cells/hello/backend/handler.ts` 引用 `@otavia/runtime-contract` 与具体 runtime 包
- Modify: `packages/runtime-aws`、`packages/runtime-azure` 实现极小 `createRequestContext` 之类

- [ ] **Step 1:** MVP：单函数 `export function platform(): 'aws'|'azure'` 用于演示。
- [ ] **Step 2:** Commit：`feat(runtime): minimal platform adapters for hello cell`

---

### Task 23: 根 README 与 `bin` 发布说明

**Files:**
- Modify: `README.md`（新增一节「新 CLI」，指向 `@otavia/cli`；说明与 legacy 共存期）
- Modify: `packages/cli/package.json` — `"bin": { "otavia": "..." }`（注意与全局 `otavia` 冲突时文档建议用 `bun run` 或 `npx`）

- [ ] **Step 1:** 文档中列出 **AWS / Azure deploy 前置条件**。
- [ ] **Step 2:** Commit：`docs: document new Otavia CLI`

---

### Task 24: 冒烟脚本（仓库内）

**Files:**
- Create: `packages/cli/scripts/smoke-init.mjs`（或 bun ts）— 在 `os.tmpdir()` 下 `init` + `bun install --no-cache` + `typecheck`（不默认 deploy）

- [ ] **Step 1:** 根 `package.json` `scripts.smoke:init` 指向该脚本。
- [ ] **Step 2:** Commit：`chore: add smoke script for init pipeline`

---

### Task 25: 可选 — 标记 `cli-legacy` 弃用

**Files:**
- Modify: `packages/cli-legacy/package.json` — `deprecated` 字段与 message 指向 `@otavia/cli`

- [ ] **Step 1:** Commit：`chore(cli-legacy): deprecation notice`

---

## 验证清单（人类 / CI）

- [ ] 干净临时目录：`init` → `bun install --no-cache` → 在 `stacks/main` 下 `setup` / `typecheck` / `lint` 通过。
- [ ] 有凭证时：AWS stack `deploy` 成功；Azure stack `deploy` 成功（可分两个临时项目）。
- [ ] `buildStackModel` 单元测试覆盖：环检测、`cells[mount].params` 非法 `!Var`、未知键 warning。

---

## Spec ↔ Plan 对齐说明

| Spec 条款 | Plan 任务 |
|-----------|-----------|
| §5–6 variables / tags | Task 5–11 |
| §6.3 env 链 | Task 3 |
| §7 cwd / workspace | Task 4 |
| §8 `.otavia/` | Task 13、15、17 |
| host 方案 2 | Task 2、12–16、18–19 |
| 双云 deploy | Task 13、15 |
| runtime 包 | Task 1、22 |

若实现中发现 spec 歧义，**先改 spec 再改代码**（用户规则）。
