# Otavia CLI 云中立重写 — 设计规格

**日期:** 2026-03-23  
**状态:** 已评审（对话定稿），待实现计划

## 1. 目标与非目标

### 1.1 目标（MVP）

- 重写一套**云中立**的 Otavia CLI，**AWS 与 Azure 在 MVP 内均需端到端 `deploy` 成功**。
- **先规范、后实现**：本文档为 Agent 与开发者的单一事实来源；实现顺序为文档定稿 → 最小垂直切片（无 DB/Blob/队列等资源抽象）。
- 垂直命令链：**`init` → `setup` → `dev` / `test` / `lint` / `typecheck` → `deploy`** 在两条云上均可跑通。
- **部署形态**：各云**原生 IaC** — AWS **CloudFormation**（或生成等价物），Azure **Bicep**（默认）。
- **前端本地开发**：与现有 legacy 对齐，默认 **Vite**，含与后端联调的**最小** dev/代理配置。
- **演进策略**：新 **`@otavia/cli`** 成熟后**废弃或移除** `packages/cli-legacy`（`@otavia/cli-legacy`）；允许极短双包过渡期，**对外以 `@otavia/cli` 为准**。

### 1.2 非目标（MVP 明确不做）

- 云资源抽象层中的 **DynamoDB / S3 / Blob / DB** 等声明与绑定。
- 命令行 **`--param`** 传入参数（见 §6.3）。
- 一份 `otavia.yaml` **跨多个云**；每个 stack **仅针对单一云**。

---

## 2. 仓库类型的区分

| 类型 | 含义 | 本文档中的「布局」 |
|------|------|-------------------|
| **终端项目仓库** | 用户用 `otavia init` 生成、日常开发的 Otavia 应用 monorepo | **§3** 中的目录与 `stacks/`、`cells/`、`packages/` |
| **Otavia 框架仓库** | 托管 `@otavia/cli`、`host-*`、`stack` 等源码的 monorepo（如本仓库） | **不在此规定**；由框架自身维护 |

**不得混淆**：§3 描述的是**终端项目**结构，不是框架源码仓库结构。

---

## 3. 终端项目仓库布局

```
/
├── cells/
│   └── <mount>/
│       ├── backend/
│       ├── frontend/
│       ├── cell.yaml
│       ├── package.json
│       └── README.md
├── stacks/
│   └── <stackName>/
│       ├── otavia.yaml
│       ├── package.json
│       └── README.md
├── packages/          # 可选：共享库
├── package.json
└── README.md
```

- **`stacks/<name>/`**：一个 **stack = 一个可安装的包**（含 `package.json`），其目录为 **stack 根**（`otavia.yaml` 所在目录）。
- **`cells/<mount>/`**：cell 源码与 `cell.yaml`；cell 作为 **独立 workspace 包** 发布/链接，由 **stack 包声明依赖**。

---

## 4. 包规划（框架侧 npm 作用域）

| 包名 | 职责 |
|------|------|
| `@otavia/cli` | CLI 入口；子命令编排；cwd / stack 解析；调用 `@otavia/stack` 与 `host-*`。 |
| `@otavia/stack` | `otavia.yaml` / `cell.yaml` 的 schema、解析、校验、合并为 **Stack** 模型。 |
| `@otavia/host-contract` | CLI 使用的云中立接口（凭证、工具链、IaC 生成与部署、dev 相关云侧钩子等）。 |
| `@otavia/host-aws` | `host-contract` 的 AWS 实现（CloudFormation、AWS CLI/SDK 等）。 |
| `@otavia/host-azure` | `host-contract` 的 Azure 实现（Bicep、`az` 等）。 |
| `@otavia/runtime-contract` | Serverless 运行时内的云中立 API（MVP 可极小）。 |
| `@otavia/runtime-aws` | `runtime-contract` 的 AWS 实现。 |
| `@otavia/runtime-azure` | `runtime-contract` 的 Azure 实现。 |

### 4.1 架构原则（已定案：方案 2）

- **CLI 编排用户可见流程**：发现 workspace、解析当前 stack、枚举依赖 cell、串联 `test` / `lint` / `typecheck`、本地 **Vite + 网关**、`deploy` 前置步骤等。
- **`host-aws` / `host-azure` 仅承载云相关能力**：凭证与工具链、`.otavia` 下 IaC 生成、调用部署、以及与 dev 相关的云校验（若需要）。
- **依赖方向**：`cli` → `stack`、`host-contract`；按 `otavia.yaml` 中 provider 选择具体 `host-*` 实现。`host-*` 实现 `host-contract`。`runtime-*` 供 **cell 后端构建产物**使用，**不**默认与 CLI 同进程加载。

---

## 5. 配置文件语义

### 5.1 `otavia.yaml`（云相关，stack 根）

- **`name`**：栈逻辑名（资源命名/状态；**不使用** `stackName` 作为字段名）。
- **`provider`**：**对象**，且 **每个 stack 只对应一个云**。示例形状（MVP 在实现计划中列必填键）：
  - AWS：含 **`region`** 等；
  - Azure：含 **`location`** 等。
- **`cells`**：值为 **npm 包名**（如 `@acme/hello`），**禁止**使用文件系统路径引用 cell。
- **`variables`**：栈级「命名值」树根（原顶层 `params` 概念由本字段承载）；**仅**允许 **`!Env` / `!Secret` / `!Var`** 与字面量，**禁止 `!Param`**；规则见 §6。
- **`cells[mount].params`**：向该 cell **传入**的参数字典（键应对齐对应 `cell.yaml` 的 **`params` 声明**）；值可为字面量或 **`!Var`**（**仅**能引用顶层 **`variables`** 中的键），**禁止 `!Param`**。
- 其他全局键（如 `domain`）由 MVP schema **显式列举**；**未在 schema 中声明的键**：**记 warning，不中断**（§6.4）。

### 5.2 `cell.yaml`（云无关）

- 描述前后端入口、路由、构建/运行约定等（MVP 字段表在实现计划中细化）。
- **`params` 段**：声明本 cell **需要从 stack 侧 `cells[mount].params` 接收**的参数名集合（建议延续 legacy：**字符串数组**）。
- **`variables` 段**（可选）：cell 级命名值；段内允许 **字面量、`!Var`（引用本段其它键，须无环）、`!Param`（仅 `params` 已声明的名字）**；段内 **`!Var` 依赖图须做环路检测**；**`!Var` 在目标键不在本段树内时**是否回退进程环境，与栈级 **`variables`** 一致（见 §6.2）。
- **`!Param` / `!Var`（`variables` 段外正文）**：在 **`variables` 段解析完成之后**，其余配置可使用 **`!Param`**（**仅** `params` 已声明）与 **`!Var`**（**仅**本文件 **`variables` 段**已定义的键）。
- **`!Env` / `!Secret`**：**禁止**出现在 `cell.yaml`（含 **`variables` 段**）。
- **未知键**：**warning**（§6.4）。

### 5.3 Cell 解析与 stack 包依赖

- **每个 stack 包**必须在 `package.json` 的 **`dependencies`（或 workspaces 等价方式）**中声明其所用 **cell 包**。
- **`@otavia/stack`** 在 **该 stack 包目录为解析根** 的上下文中，通过 **Bun/Node 模块解析**定位 cell 包（即 **`node_modules` 中解析到的真实路径**），再读取包内 `cell.yaml`。
- **禁止**依赖「在仓库 `cells/` 目录树上猜路径」来定位 cell。

---

## 6. `!Env` / `!Secret` / `!Var` / `!Param` 与 Stack 模型

### 6.1 出现位置

| 标签 | `otavia.yaml` | `cell.yaml` |
|------|---------------|-------------|
| `!Env` / `!Secret` | **仅**顶层 **`variables`** 树内 | **禁止**（含 **`variables` 段**） |
| `!Var` | **仅**顶层 **`variables`** 树内（树内互引，须无环）；**`cells[mount].params` 的值中**（**仅**能 `!Var` 到顶层 **`variables`** 的键） | **`variables` 段内**（**仅** `!Var` 互指本段键，须无环）；**段外正文**（**仅**能 `!Var` 到本文件 **`variables` 已解析**的键） |
| `!Param` | **禁止**（全文件任意位置均不得出现） | **`variables` 段内与段外**均可（**仅**能引用本文件 **`params` 已声明**的键） |

**命名说明**：**`!Var`** 表示引用 **同一文件内对应 `variables` 对象树**中的键；**`!Param`** 仅用于 **cell**，表示引用 **自 stack 经 `cells[mount].params` 传入**、且在 **`params` 声明**中出现过的名字。

**`cells[mount].params`（在 `otavia.yaml` 内）**：值可为字面量或 **`!Var`**；**`!Var` 只能引用顶层 `variables` 中已存在的键**（取 **步骤 2** 已解析完毕的值）；**禁止**引用本 mount 下兄弟键、其它 `cells[other].params`、或「顶层无该键而仅靠环境同名」的隐式来源（环境须经由 **顶层 `variables` 的 `!Env`/`!Secret`/字面量/合法 `!Var` 链**进入 cell 侧）。

### 6.2 解析顺序（规范层要求）

1. 按 **当前子命令**加载环境文件（§6.3），形成合并后的进程环境。
2. **仅解析顶层 `variables`（`otavia.yaml`）**：
   - **`!Var` 允许引用同一顶层 `variables` 对象树内的其它键**；**须建依赖图、检测环路，有环则报错**；无环则 **拓扑排序** 后求值。
   - **树外回退**（**仅适用于顶层 `variables` 内的 `!Var`**）：若目标名在**该树内**无对应键，则 **`!Var` 从步骤 1 之后的进程环境**按同名取值（键名与 tag 形式可对齐 legacy 原 `!Param` 行为）。
   - **`!Env` / `!Secret`**：仅在上述树内出现；与 **`!Var`** 混排时服从同一 **拓扑顺序**。
3. **解析各 `cells[mount].params`**：其中的 **`!Var` 仅能引用步骤 2 中顶层 `variables` 已存在的键名**，代入 **步骤 2 的解析结果**；**不得**出现 `!Param`；**不得**产生指向 `cells[*.params]` 的依赖边。
4. 对每一 cell：用 **步骤 3** 的结果校验 **`cell.yaml` 的 `params` 声明**是否均已供给。
5. **解析 `cell.yaml` 的 `variables` 段**（若存在）：段内为 **字面量、`!Param`（取值来自步骤 4 的 param 映射）、`!Var`（引用本段其它键）**；**仅 `!Var → !Var` 边**参与环路检测，**须无环**；拓扑求值时 **`!Param` 叶**可先解析；**`!Var` 树外回退**与步骤 2 对称（**无对应键则回退步骤 1 后的进程环境**）。
6. 解析 **`cell.yaml` 的 `variables` 段外配置**：可使用 **`!Param`**（步骤 4）与 **`!Var`**（**仅**步骤 5 已定义的键）。

**循环依赖**：**每一个 `variables` 段**（`otavia.yaml` 顶层一处 + 每个 `cell.yaml` 最多一处）**各自**对段内 **`!Var → !Var` 边**做环路检测；**成环或无法拓扑排序则报错**。**`cell.yaml` 的 `variables` 段**中 **`!Param` 不构成 `!Var` 环上的边**（视为来自已解析的 param 层）。`cells[mount].params` **不参与**任一段 `variables` 的构图。

### 6.2.1 `!Param` 与 `!Var` 的边界（摘要）

- **`otavia.yaml`**：只用 **`variables` + `!Var`/`!Env`/`!Secret`**；**不出现 `!Param`**。
- **`cell.yaml`**：**`variables` 段**内 **`!Var` 互引**（无环）+ **`!Param`**（栈入口）+ 字面量；**段外**继续可用 **`!Param`** 与 **`!Var`**（指向已解析的本 cell 变量）。

### 6.3 环境文件与命令

在 **stack 根**加载，**顺序**：先 **`.env`**，再 **命令专属文件**（后者覆盖前者）。

| 场景 | 文件 |
|------|------|
| `dev` | `.env` + `.env.dev` |
| `test`（**单元与 e2e 默认**） | `.env` + `.env.test` |
| `deploy` | `.env` + `.env.deploy` |

- **`setup`**：负责生成/更新 **`.env.example`** 及上述文件的文档说明；是否在执行时加载同一张表由实现决定，须在实现计划中说明。
- **不支持**通过 CLI **`--param`** 注入；参数仅 **YAML 静态**或 **环境变量（含上述 `.env` 链）**。

### 6.4 未知配置项与非法用法

- **Schema 未声明的键**（`otavia.yaml` / `cell.yaml`）：**warning**，**不中断**。
- **非法 tag 位置**（如 `cell.yaml` 出现 `!Env` / `!Secret`）、**`otavia.yaml` 出现 `!Param`**、**`!Param` 引用未在 `cell.yaml` 的 `params` 中声明的键**、**`!Var` 引用非法目标**（如 `cells[mount].params` 中 `!Var` 非顶层 `variables` 键）等：**error**。

### 6.5 最终 Stack 对象

- **路径**：所有文件类引用在 Stack 模型中统一为 **相对于 stack 根目录**的相对路径（路径分隔符在 spec 实现附录中固定，如 POSIX 风格）。
- **绑定保留**：必须保留
  - **`environments`**：源自 **`otavia.yaml` 的 `variables`** 中 **`!Env`** 的绑定（逻辑键 ↔ 环境变量名等，形状在实现计划中定义）；
  - **`secrets`**：源自同一 **`variables`** 树中 **`!Secret`** 的绑定（供 `deploy` 时映射到 SSM、Key Vault 等，由 `host-*` 消费）。
- **`cells`**：**直接展开**的最终 cell 配置（**不使用** `resolvedCells` 等并行数组结构）。

---

## 7. 子命令行为（cwd 选定 stack）

**约定**：用户在 **`stacks/<name>/` 目录或其子目录**执行 CLI；向上解析 **workspace 根**与 **当前 stack 根**（含 `otavia.yaml` 的目录）。**Workspace 根**判定：自 cwd 向父目录查找，**第一个**含有 **`package.json` 且其中声明了 `workspaces`** 的目录（与 `init` 生成的终端项目一致）；实现计划不得引入第二套互斥判定，除非修订本文档。

| 命令 | 职责概要 |
|------|----------|
| `init` | 在目标目录初始化**终端项目**：workspace、示例 cell 包、示例 stack 包（`package.json` **已依赖**示例 cell）、`.gitignore`（含 **`.otavia/`**）等。 |
| `setup` | 在当前 stack 下：校验/安装 **dev 与 deploy 所需工具**（由 `host-*` 定义）；处理 `.env.example` → `.env`；校验 **cell `params` 供给**与 **`variables` 中 `!Env`/`!Secret`/`!Var`（环境回退）**可满足性（**具体规则在实现计划中列明，默认对齐 legacy `setup` 精神**）。 |
| `dev` | 加载 §6.3 `dev` 环境文件；CLI 编排 **Vite + 本地网关**；云凭证检查委托 `host-*`。 |
| `test` | 加载 §6.3 `test` 环境文件；对 **stack 包与依赖 cell 包**运行测试（顺序与 fail-fast 策略在实现计划中固定）。 |
| `lint` | 对 stack 及 cells 运行 **Biome**（或项目约定工具）。 |
| `typecheck` | 对 stack 及 cells 运行 **TypeScript** 构建/检查。 |
| `deploy` | 加载 §6.3 `deploy` 环境文件；调用 `host-*`：**在 `.otavia/` 生成 IaC 临时产物**并部署；消费 Stack 中的 **`environments` / `secrets`**。 |

---

## 8. IaC 临时产物

- **目录**：stack 根下的 **`.otavia/`**。
- **必须 gitignore**：`init` 生成的终端项目模板须包含该项。
- **内容**：CloudFormation / Bicep 等生成物；**非源真相**，可任意清理后由 CLI 再生成。

---

## 9. 测试与验证（规格层）

- MVP 完成后应存在 **可自动化**的冒烟路径：在干净目录 `init` → `setup` → `dev`（可选）→ `test` / `lint` / `typecheck` → `deploy`（AWS 与 Azure 各至少一条流水线或文档化步骤）。
- **云凭证**：不在本文档规定具体账号形态；由 `setup` / `deploy` 与云厂商文档约束。

---

## 10. 与 legacy 的已知差异（摘要）

- 布局与包名：**终端项目**使用 **`stacks/`**；CLI 包为 **`@otavia/cli`**；**双云**与 **`host-*` / `runtime-*` 拆分**。
- **栈级命名值**：legacy 顶层 **`params`** 更名为 **`variables`**；**`!Param` 不在 `otavia.yaml` 出现**，改为 **`!Var`** 表示引用 **`variables` 树**内键。**顶层 `variables` 内 `!Var` 互引须无环**；**`cells[mount].params` 仅允许 `!Var` 引用顶层 `variables` 键**（不得树内互引、不得跨 cell）。
- **`cell.yaml`**：新增可选 **`variables` 段**（段内 **`!Var` 互引须无环**，可与 **`!Param`** 混用）；**段内外**均可用 **`!Param`/`!Var`**（规则见 §6）；仍 **禁止 `!Env`/`!Secret`**。
- Cell 定位：**仅**通过 **stack 包依赖 + `node_modules` 解析**，不扫 `cells/` 目录树。
- **未知 YAML 键**：**warning**（legacy 可能更严，以实现为准）。

---

## 11. 后续步骤

1. 用户审阅本文档路径与内容。  
2. 使用 **writing-plans** 技能生成实现计划（不在本文档范围内）。  
3. 实现时若发现 spec 矛盾，应**先改文档**再改代码。
