# Otavia

基于 **Bun workspace** 与 **AWS Lambda 栈** 的全栈开发框架：把系统拆成多个相互独立的 **cells**（微服务单元）。每个 cell 通过 **`cell.yaml`** 与栈级 **`otavia.yaml`** 声明自身所需的云资源与代码边界，**无需**为每个服务再搭一套独立脚手架或零散构建配置；部署时由 CLI **生成并维护 IaC**（CloudFormation 等），坚决贯彻基础设施即代码，避免环境漂移与手工对表。

本仓库提供的 **CLI** 负责：在单体仓库中管理 cells、本地 **dev**（网关 + Vite）、以及向 AWS **部署**。

## 新多云 CLI（`@otavia/cli`）

与 legacy 包 **`@otavia/cli-legacy`** 并存期间，推荐使用 **`@otavia/cli`** 做 **AWS / Azure** 双云栈（`otavia.yaml` 顶层 **`cloud`** 为判别联合：`provider: aws` 配 **`region`**，或 `provider: azure` 配 **`location`**）。

- **入口**：仓库内 `bun run cli:multicloud` 或 `bun run --cwd packages/cli src/cli.ts`；安装到 path 后可用 **`otavia`**（见 `packages/cli/package.json` 的 `bin`）。
- **栈目录 `.env`**：`setup` 在 **`stacks/<name>/`**（如 **`stacks/main`**）从 **`.env.example`** 生成 **`.env`**；**`dev` / `deploy` / `test` / `cloud`** 均从**该栈目录**加载 `.env`、`.env.dev` 等。**`otavia cloud login`** / **`otavia cloud logout`** 按 **`otavia.yaml` 的 `cloud.provider`** 执行 **`aws sso login|logout`** 或 **`az login|logout`**，并把合并后的环境（含 **`AWS_PROFILE`**、**`AZURE_SUBSCRIPTION_ID`**、**`AZURE_CONFIG_DIR`**）传给子进程。栈 **`package.json`** 提供 **`bun run cloud`**（等同 login）、**`bun run cloud:login`**、**`bun run cloud:logout`**。
- **常用命令**：`init`、`setup`、`dev`、`deploy`、`test` / `lint` / `typecheck`（后三者按栈与 cell 包 **fail-fast** 遍历）。脚手架 **`stacks/main`**：默认脚本 **`bunx @otavia/cli …`**（须与 npm **`name: @otavia/cli`** 一致；勿写 **`bunx otavia`**），并声明 **`devDependencies.@otavia/cli`**；**`init --use-global-otavia`** 则**省略**该 devDependency（避免 **registry 尚无包时 `bun install` 失败**），脚本改为 **`otavia …`**，需本机 **`bun link --global`**（在 `packages/cli`）或全局安装后的 **`otavia`** 在 PATH 上。
- **AWS**：需安装 **AWS CLI**；**`deploy` / `setup`** 会校验凭证；**`dev`** 默认仅本地网关/Vite，**不**校验云凭证。若要在启动 dev 前确认已登录，可设 **`OTAVIA_DEV_CHECK_CREDENTIALS=1`**。
- **Azure**：需安装 **Azure CLI** 与 **Bicep**（`az bicep version` 或独立 `bicep`）；`deploy` 需环境变量 **`OTAVIA_AZURE_RESOURCE_GROUP`**。
- **脚手架冒烟**：多云 CLI 暂无根级 `smoke:init` 脚本；请用 Cursor skill **`manual-test-multicloud-cli`**（`.checks/` 下完整 init→install→dev→test），或后续在仓库内加专用 **e2e** 自动化。
- **CLI 未上 registry 时**：不要用默认 init 栈内的 `@otavia/cli@0.0.1`（`bun install` 会失败）。请使用 **`init --use-global-otavia`**，并在 **`packages/cli`** 执行 **`bun link --global`** 后，再于 init 出的 workspace 根执行 **`bun install --no-cache`**；或先把 **`@otavia/cli` 发布**到可访问的 registry。

## 环境要求

- **[Bun](https://bun.sh)**（运行时、包管理与 CLI；单元测试亦基于 Bun）
- **AWS CLI**（**`deploy`** 等会校验凭证；legacy CLI 本地可设 `OTAVIA_SKIP_AWS_CHECK=1` 跳过 STS）
- 可选：**cloudflared**（`setup --tunnel` / `dev --tunnel` 做远程开发隧道）

## 安装 CLI

本仓库为 **monorepo**：CLI 实现在 `packages/cli-legacy`（npm 名 `@otavia/cli-legacy`，可执行命令仍为 `otavia`）。发布到注册表后全局安装：

```bash
bun add -g @otavia/cli-legacy
```

从本仓库开发时，在仓库根目录执行：

```bash
bun install --no-cache
bun run --cwd packages/cli-legacy src/cli.ts -- --help
# 或在 packages/cli-legacy 下 bun link，然后直接使用 otavia
```

## 快速开始（空目录脚手架）

在**空目录**或新项目根目录执行：

```bash
otavia init
```

会生成：根 `package.json`（声明 `workspaces`，作为 **Bun workspace** 根）、`apps/main`（含 `otavia.yaml` 与入口脚本）、`cells/hello` 示例 cell 等。完成后按提示：

```bash
bun install
bun run setup          # 从 apps/main/.env.example 生成 .env 等
otavia aws login       # SSO 登录（使用 apps/main/.env 里的 AWS_PROFILE 等）
bun run dev            # 或 otavia dev，在仓库根执行
```

### `init` 常用选项

| 选项 | 说明 |
|------|------|
| `--stack-name <name>` | CloudFormation 栈名（默认：当前目录名） |
| `--domain <host>` | 主域名 host（默认：`example.com`） |
| `--scope <scope>` | 包作用域（如 `acme` 或 `@acme`），用于 `@scope/main` 与 cell 包名 |
| `--force` | 覆盖已有脚手架文件 |
| `--use-defaults` | **非 TTY**（如 CI）下允许不填 stack/domain 时使用目录名与 `example.com` |

非交互场景下若未使用 `--use-defaults`，必须同时提供 `--stack-name` 与 `--domain`。

## 在已有仓库里使用

Otavia 通过 **Bun workspace 根**（根目录 `package.json` 声明 `workspaces`）和 **`otavia.yaml`** 定位栈配置：

- 常见布局：配置在 **`apps/main/otavia.yaml`**（与 `init` 脚手架一致）
- 也可在 workspace 根放 `otavia.yaml`，或 `apps/<name>/otavia.yaml`（按目录名排序扫描）

在任意子目录执行子命令时，会向上解析 workspace 与对应的 `otavia.yaml`。调试路径解析可设置：

```bash
export OTAVIA_DEBUG_RESOLVE=1
```

## 新增 cell

使用 CLI 在已有栈里增加一个 cell（与 `otavia init` 里 hello cell 同模板）：

```bash
otavia cell create <mount>
```

- **`<mount>`**：URL 挂载段，仅允许小写字母、数字、连字符，且不能以连字符开头或结尾（例如 `billing`、`api-v1`）。
- 会在 **`cells/<mount>/`** 下生成 `cell.yaml`、`package.json`、backend/frontend 与 `tsconfig.json`，并在当前栈的 **`otavia.yaml`** 的 **`cells`** 里追加 `mount: "@作用域/<mount>"`。
- **作用域**：默认从 **`otavia.yaml` 里已有 cell 的包名**推断（取第一个 cell 的 `@scope`）；若需指定，使用 **`--scope acme`** 或 **`--scope @acme`**。
- 若 **`cells/<mount>/cell.yaml` 已存在**，须加 **`--force`** 才会覆盖目录内脚手架文件（若该 `mount` 已在 `otavia.yaml` 中注册，仍会报错，需先从 YAML 中删掉对应条目）。

完成后执行 **`bun install`**，并用 **`otavia cell list`** 核对。

也可继续**手工**复制 `cells/hello` 并编辑 `otavia.yaml`，与上述命令等价，仅更易出错。

## 命令一览

在项目根（或已解析到栈的目录）执行：

| 命令 | 说明 |
|------|------|
| `otavia init` | 搭建 Bun workspace 单体仓库 + `apps/main` + 示例 cell |
| `otavia setup` | 检查环境、补全 `apps/main/.env`、校验 cell；可加 `--tunnel` 配置 Cloudflare tunnel |
| `otavia dev` | 启动本地网关 + Vite；可选 `--tunnel` / `--tunnel-host` / `--tunnel-config` |
| `otavia deploy` | 构建产物并走 CloudFormation 部署；`--yes` 跳过确认 |
| `otavia test` | 先单元测试再 e2e |
| `otavia test:unit` / `otavia test:e2e` | 仅单元 / 仅 e2e |
| `otavia typecheck` | 对所有 cell 做 TypeScript 检查 |
| `otavia lint` | Lint cells；`--fix` / `--unsafe` 控制修复力度 |
| `otavia clean` | 清理 `.cell`、`.esbuild`、`.otavia` 等缓存目录 |
| `otavia aws login` / `otavia aws logout` | 使用栈 `.env` 中的 profile 调用 `aws sso login/logout` |
| `otavia cell create <mount>` | 脚手架 `cells/<mount>` 并写入 `otavia.yaml`；可选 `--scope`、`--force` |
| `otavia cell list` | 列出 `otavia.yaml` 中的 cells 及解析到的目录 |

### 本地 dev 环境变量（摘录）

| 变量 | 作用 |
|------|------|
| `OTAVIA_SKIP_AWS_CHECK=1` | 跳过 `dev` 启动前的 STS 校验（仅本地） |
| `OTAVIA_DEV_GATEWAY_ONLY=1` | 只起网关（如 e2e），不起 Vite |
| `PORT_BASE` | 端口基准（见 `apps/main/.env.example`） |

## 开发与发布本包

```bash
bun run test
bun run typecheck
bun run build:runtime   # 预构建 dev 用的 Vite 运行时入口（prepack/prepare 在包内会跑）
bun run smoke:init-dev  # 脚手架 + 短暂 dev 冒烟（需本机环境满足脚本假设）
```

以上命令在 **仓库根** 执行时会转发到 `packages/cli-legacy`。

