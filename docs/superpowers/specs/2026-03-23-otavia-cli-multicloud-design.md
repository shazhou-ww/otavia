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
- **`params`**：参数树根；规则见 §6。
- 其他全局键（如 `domain`）由 MVP schema **显式列举**；**未在 schema 中声明的键**：**记 warning，不中断**（§6.4）。

### 5.2 `cell.yaml`（云无关）

- 描述前后端入口、路由、构建/运行约定等（MVP 字段表在实现计划中细化）。
- **`params` 段**：声明本 cell **需要从外部接收**的参数名集合（建议延续 legacy：**字符串数组**）。
- **「函数」语义**：除 `params` 声明外，正文中的配置由**传入的 param 值**实例化；正文中若使用 **`!Param`**，**仅能引用**本 `cell.yaml` **`params` 已声明**的名字。
- **`!Env` / `!Secret`**：**禁止**出现在 `cell.yaml`。
- **未知键**：**warning**（§6.4）。

### 5.3 Cell 解析与 stack 包依赖

- **每个 stack 包**必须在 `package.json` 的 **`dependencies`（或 workspaces 等价方式）**中声明其所用 **cell 包**。
- **`@otavia/stack`** 在 **该 stack 包目录为解析根** 的上下文中，通过 **Bun/Node 模块解析**定位 cell 包（即 **`node_modules` 中解析到的真实路径**），再读取包内 `cell.yaml`。
- **禁止**依赖「在仓库 `cells/` 目录树上猜路径」来定位 cell。

---

## 6. `!Env` / `!Secret` / `!Param` 与 Stack 模型

### 6.1 出现位置

| 标签 | `otavia.yaml` | `cell.yaml` |
|------|---------------|-------------|
| `!Env` / `!Secret` | **仅** `params` 树内 | **禁止** |
| `!Param` | **顶层 `params`**：允许树内互引（须无环）；**`cells[mount].params`**：**仅**允许 `!Param` 引用**顶层 `params` 的键**（与 legacy 不同，**顶层允许 `!Param`**） | **允许**于正文（不得出现在 `params` 声明列表的「键名」语义之外；即声明仍用字符串数组） |

**`cells[mount].params`（在 `otavia.yaml` 内）**：可含 `!Param`，但 **`!Param` 只能引用顶层 `params` 中的键**（取该键在 **步骤 2** 已解析完毕的值）；**禁止**引用本 mount 下 `cells[mount].params` 的兄弟键、**禁止**引用其它 `cells[other].params`、**禁止**在无对应顶层键时回退为「仅环境中有名」的隐式来源（环境只能通过 **顶层 `params` 里的 `!Env`/`!Secret`/字面量/合法 `!Param` 链**间接进入 cell 侧）。

### 6.2 解析顺序（规范层要求）

1. 按 **当前子命令**加载环境文件（§6.3），形成合并后的进程环境。
2. **仅解析顶层 `params`**：
   - **`!Param` 允许引用同一顶层 `params` 对象树内的其它键**（兄弟或嵌套键）；**须针对该树内 `!Param` 边建依赖图、检测环路，有环则报错**；无环则 **拓扑排序** 后求值。
   - **树外回退**（**仅适用于顶层 `params` 内的 `!Param`**）：若目标名在**顶层 `params` 树内**无对应键，则 **`!Param` 从步骤 1 之后的进程环境**按同名取值（键名与 tag 形式与 legacy 对齐）。
   - **`!Env` / `!Secret`**：仅在允许位置出现；与顶层 `!Param` 混排时服从同一 **拓扑顺序**。
3. **解析各 `cells[mount].params`**：其中出现的 **`!Param` 仅能引用步骤 2 中顶层 `params` 已存在的键名**，代入 **步骤 2 的解析结果**；不得再引入指向 `cells[*.params]` 的依赖边。
4. 合并 **步骤 2 + 3** 对每一 cell 的 **param 供给**，并校验 **`cell.yaml` 的 `params` 声明**均已得到满足。
5. 对每个 cell：在 **合并到该 cell 的最终 param 映射**上，解析 **`cell.yaml` 正文中的 `!Param`**，得到 **最终 cell 配置**（**仅**能引用该 `cell.yaml` **`params` 已声明**的键）。

**循环依赖**：**强制环路检测**仅针对 **顶层 `params` 内部**的 `!Param` 树内引用；**成环或无法拓扑排序则报错**（不作为 warning）。`cells[mount].params` 因 **不得树内互引**，**不参与**该环检测图。

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
- **非法 tag 位置**（如 `cell.yaml` 出现 `!Env`）、**`!Param` 引用未在 `cell.yaml` 的 `params` 中声明的键**等：**error**。

### 6.5 最终 Stack 对象

- **路径**：所有文件类引用在 Stack 模型中统一为 **相对于 stack 根目录**的相对路径（路径分隔符在 spec 实现附录中固定，如 POSIX 风格）。
- **绑定保留**：必须保留
  - **`environments`**：`!Env` 相关绑定（逻辑键 ↔ 环境变量名等，形状在实现计划中定义）；
  - **`secrets`**：`!Secret` 相关绑定（供 `deploy` 时映射到 SSM、Key Vault 等，由 `host-*` 消费）。
- **`cells`**：**直接展开**的最终 cell 配置（**不使用** `resolvedCells` 等并行数组结构）。

---

## 7. 子命令行为（cwd 选定 stack）

**约定**：用户在 **`stacks/<name>/` 目录或其子目录**执行 CLI；向上解析 **workspace 根**与 **当前 stack 根**（含 `otavia.yaml` 的目录）。**Workspace 根**判定：自 cwd 向父目录查找，**第一个**含有 **`package.json` 且其中声明了 `workspaces`** 的目录（与 `init` 生成的终端项目一致）；实现计划不得引入第二套互斥判定，除非修订本文档。

| 命令 | 职责概要 |
|------|----------|
| `init` | 在目标目录初始化**终端项目**：workspace、示例 cell 包、示例 stack 包（`package.json` **已依赖**示例 cell）、`.gitignore`（含 **`.otavia/`**）等。 |
| `setup` | 在当前 stack 下：校验/安装 **dev 与 deploy 所需工具**（由 `host-*` 定义）；处理 `.env.example` → `.env`；校验 param 与 `!Env`/`!Secret` 可满足性（**具体规则在实现计划中列明，默认对齐 legacy `setup`**）。 |
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
- **顶层 `otavia.yaml` `params` 允许 `!Param`**（legacy 禁止）；且 **顶层 `params` 内 `!Param` 可互相引用**，**须做环路检测**（legacy 若未统一建图，以实现为准）。**`cells[mount].params` 中的 `!Param` 只能引用顶层 `params`**，不得引用其它 cell 条目或本条目内兄弟键。
- **`cell.yaml` 正文允许 `!Param`**，且受 **`params` 声明**约束；仍 **禁止 `!Env`/`!Secret`**。
- Cell 定位：**仅**通过 **stack 包依赖 + `node_modules` 解析**，不扫 `cells/` 目录树。
- **未知 YAML 键**：**warning**（legacy 可能更严，以实现为准）。

---

## 11. 后续步骤

1. 用户审阅本文档路径与内容。  
2. 使用 **writing-plans** 技能生成实现计划（不在本文档范围内）。  
3. 实现时若发现 spec 矛盾，应**先改文档**再改代码。
