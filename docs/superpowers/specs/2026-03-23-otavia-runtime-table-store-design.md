# Otavia 可移植行存储（DynamoDB ↔ Cosmos Table API）— 设计规格

**日期:** 2026-03-23  
**状态:** 已定案（对话收敛），配合实现计划执行  
**前置:** `docs/superpowers/specs/2026-03-23-otavia-cli-multicloud-design.md`（多云 CLI MVP）

---

## 1. 目标与非目标

### 1.1 目标

- 在 **`@otavia/runtime-contract`** 定义 **云中立** 的「逻辑表」行存储 API（**中性命名**，非 Dynamo 方言）。
- **`@otavia/runtime-aws`** 使用 **DynamoDB** 实现；**`@otavia/runtime-azure`** 使用 **Cosmos DB Table API**（`@azure/data-tables`）实现。
- 新增 **`@otavia/runtime-local`**：进程内实现同一 contract，供 **`dev` / `test` / 单元测试** 默认使用，**不依赖** DynamoDB Local 或 Azurite。
- **`@otavia/stack` + `host-aws` / `host-azure`**：在下一迭代中扩展 **`otavia.yaml` 声明** 与 **IaC**，创建表资源并向函数运行时注入 **云中立环境变量**（表名、终结点等）及 **权限**（IAM / 托管身份）。

### 1.2 非目标（本规格迭代）

- Contract **不暴露 GSI / LSI**；不在可移植层假装存在「云无关二级索引」。
- **事务、Batch 全量语义、Streams、TTL、DAX、条件表达式的 Dynamo 超集** — 若需支持，单独开版本与兼容性表。
- **Cosmos Core (SQL) / Mongo API / 关系型数据库** — 作为 **未来其它 runtime 能力** 分层（见 §7），本迭代不实现。
- **跨云单一 `otavia.yaml`** — 仍遵守多云 MVP 规则：一栈一云。

---

## 2. 可移植能力子集（v1）

### 2.1 支持

- 按 **`partitionKey` + `rowKey`**（对应 Dynamo **partition/sort key**、Table API **PartitionKey/RowKey**）的 **读 / 写 / 删**。
- **固定分区键**下，对 **`rowKey` 的受限查询**（具体运算符集合在实现计划中 **显式列表化**，仅纳入 **AWS 与 Table API 均可合理实现** 的子集，例如等值、前缀；**禁止**悄悄降级成全表扫描而不在文档中说明）。

### 2.2 显式不支持（v1）

- **全局二级索引 / 本地二级索引** 及任何「跨分区按非键属性高效查询」的 **可移植** 表达。
- 需要上述能力时的 **推荐路径**：应用层 **多逻辑表 + 协调写入**（物化另一套主键），或 **仅 AWS** 的宿主扩展（见 §6），或升级到 **其它 runtime**（文档 / 关系型）。

---

## 3. 数据类型与映射

- Contract 层使用 **小集合原子类型**（建议：`string`、`number`（IEEE 754 安全整数子集）、`boolean`、`Uint8Array`）；实现侧映射到 Dynamo `AttributeValue` 与 Table 的 EDM 类型。
- **二进制**统一 **`Uint8Array`**，避免 UTF-8 误用。
- 在实现计划中写明 **number 精度与范围** 限制及 **未支持类型** 的拒绝策略。

---

## 4. 错误与可观测

- Contract 定义 **稳定错误码**（建议最小集）：`NotFound`、`ConditionalFailed`、`Throttled`、`ValidationError`、`Internal`。
- 实现侧将 AWS / Azure 异常 **映射** 为上述码；可选在 `cause` 或日志中保留宿主原始信息（**不**作为稳定 API）。

---

## 5. 配置与绑定（与 stack / host 的契约）

- **`otavia.yaml`** 增加 **`resources.tables`**（名称以实现计划为准）：声明 **逻辑表 id**、**键结构**（分区键与排序键属性名及类型枚举），**不含** GSI。
- 部署后注入 **云中立** 变量（示例形状，最终实现计划敲定前缀与键名）：
  - `OTAVIA_TABLE_<LOGICAL_ID>_NAME`
  - 以及各云连接所需之 **endpoint / account** 等（Azure Table 与 Dynamo 字段不同，由 host 写入 **统一语义** 的 env，runtime 实现读取）。
- **可选兼容**：在 **仅 AWS** 部署时，可 **额外** 镜像 legacy 风格 `DYNAMODB_TABLE_*`（若仍要平滑迁移）；**不作为** 跨云唯一真相。

---

## 6. GSI 与「仅 AWS」扩展（后续或并行小步）

- **可移植代码路径**不得依赖 GSI。
- **宿主扩展**（未来）：`otavia.yaml` 中 **`resources` 下仅 `aws` 生效的子树**（例如 DynamoDB GSI 定义），在 **Azure 上 deploy 校验失败或 warning**，并在文档中给出 **Azure 侧替代策略**（多逻辑表等）。

---

## 7. 与其它数据能力的分层（叙事，本迭代可不实现）

| 层级 | 用途 |
|------|------|
| **行存储（本规格）** | 主键 + 分区内查询；DynamoDB ↔ Cosmos Table API + `runtime-local` |
| **文档 / 复杂索引** | 未来独立 contract；Cosmos Core 或 Mongo 等，**不**冒充 Dynamo |
| **关系型** | 未来独立 `runtime-sql` / PG 等；VPC、连接池、迁移单独约定 |

---

## 8. 本地开发与测试

- **默认**：应用与框架测试使用 **`@otavia/runtime-local`**（内存或可选极简持久化，由实现计划定）。
- **可选 CI 矩阵**：对 `runtime-aws` / `runtime-azure` 使用 **DynamoDB Local / Azurite** 做 **契约一致性** 抽检；**已知偏差** 在文档中列出。

---

## 9. 测试策略

- **shared contract tests**：同一组用例对 `runtime-local` 必跑；对云实现 **至少** 在 mock 或 emulator 上覆盖 v1 子集。
- **TDD**：先 contract 测试与 `runtime-local`，再云实现。

---

## 10. 包与依赖方向

- `runtime-contract`：**零** 云 SDK 依赖。
- `runtime-aws` / `runtime-azure` / `runtime-local`：仅依赖 `runtime-contract` + 各自 SDK（local 无 SDK）。
- **禁止** `runtime-*` 依赖 `@otavia/cli` 或 `host-*`（配置经 **环境变量** 注入）。

---

## 11. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-23 | 初版：Table API 对齐、无 GSI、runtime-local、分层叙事 |
