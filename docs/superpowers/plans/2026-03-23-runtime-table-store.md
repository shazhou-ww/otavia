# Runtime table store (DynamoDB + Cosmos Table + local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a portable row-store runtime API (`@otavia/runtime-contract`) with AWS DynamoDB, Azure Cosmos Table API, and in-process `@otavia/runtime-local`, plus stack parsing and host IaC/env wiring per `docs/superpowers/specs/2026-03-23-otavia-runtime-table-store-design.md`.

**Architecture:** Neutral `TableStore` interface + shared attribute types; three packages implement it. `otavia.yaml` declares `resources.tables`; `@otavia/stack` validates and surfaces logical models; `host-aws` / `host-azure` emit table resources, IAM/managed identity, and inject `OTAVIA_TABLE_*` (and optional AWS legacy mirror). v1 excludes GSI in the portable schema.

**Tech stack:** TypeScript, Bun test, `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` (or equivalent), `@azure/data-tables`, CloudFormation YAML, Bicep.

**Spec:** `docs/superpowers/specs/2026-03-23-otavia-runtime-table-store-design.md`

---

## File map (planned)

| Path | Responsibility |
|------|----------------|
| `packages/runtime-contract/src/table-store.ts` (new) | `TableStore` interface, row types, error types, key / query condition enums |
| `packages/runtime-contract/src/index.ts` | Re-export contract surface |
| `packages/runtime-local/package.json` (new) | Workspace package `@otavia/runtime-local` |
| `packages/runtime-local/src/table-store.ts` | In-memory `TableStore` implementation |
| `packages/runtime-aws/src/table-store.ts` | DynamoDB client wrapper |
| `packages/runtime-azure/src/table-store.ts` | `@azure/data-tables` wrapper |
| `packages/stack/src/otavia/parse-otavia-yaml.ts` | Parse `resources.tables`; extend `KNOWN_TOP_LEVEL` |
| `packages/stack/src/types.ts` | Extend `StackModel` with optional `tables` model |
| `packages/stack/src/build-stack-model.ts` | Fold table bindings into deploy-time env if applicable |
| `packages/host-aws/src/template/minimal-http-lambda.ts` or sibling module | Optional: compose DynamoDB table resources + IAM |
| `packages/host-azure/src/template/minimal-function.bicep.ts` or sibling | Optional: Cosmos Table account/table + function identity |

---

### Task 1: `runtime-contract` — types and errors

**Files:**
- Create: `packages/runtime-contract/src/table-store.ts`
- Modify: `packages/runtime-contract/src/index.ts`
- Test: `packages/runtime-contract/src/table-store.test.ts`

- [ ] **Step 1: Write failing tests** for exported types/helpers (e.g. `isTableStoreError`, factory) if any pure functions exist; otherwise minimal compile-time export test that imports `TableStore`.

```ts
import { describe, expect, test } from "bun:test";
import type { TableStore } from "./table-store.ts";

describe("runtime-contract table-store", () => {
  test("TableStore type is importable", () => {
    const _x: TableStore | undefined = undefined;
    expect(_x).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test**

Run: `bun test --cwd packages/runtime-contract src/table-store.test.ts`  
Expected: FAIL (missing `./table-store.ts` or undefined symbol).

- [ ] **Step 3: Implement** `table-store.ts`: define `AttributeValue` union, `Row`, `GetRowInput`, `PutRowInput`, `DeleteRowInput`, `QueryPartitionInput` (narrow operators only), `TableStore` interface methods (`getRow`, `putRow`, `deleteRow`, `queryPartition`), and `TableStoreError` with `code` union per spec §4.

- [ ] **Step 4: Export** from `index.ts` (keep existing `CloudPlatform` export).

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test --cwd packages/runtime-contract src/`  
Run: `bun run --cwd packages/runtime-contract typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime-contract/src/table-store.ts packages/runtime-contract/src/table-store.test.ts packages/runtime-contract/src/index.ts
git commit -m "feat(runtime-contract): add portable TableStore types"
```

---

### Task 2: `@otavia/runtime-local`

**Files:**
- Create: `packages/runtime-local/package.json`
- Create: `packages/runtime-local/tsconfig.json` (mirror `runtime-aws`)
- Create: `packages/runtime-local/src/table-store.ts`
- Create: `packages/runtime-local/src/index.ts`
- Test: `packages/runtime-local/src/table-store.test.ts`

- [ ] **Step 1: Scaffold package** `packages/runtime-local` with `"name": "@otavia/runtime-local"`, `workspace` dependency `"@otavia/runtime-contract": "workspace:*"`, scripts `test` / `typecheck` same pattern as `packages/runtime-aws/package.json`.

- [ ] **Step 2: Write failing tests** for `createLocalTableStore()` covering `getRow` miss → `NotFound`, `putRow` + `getRow` round-trip, `deleteRow`, `queryPartition` with `rowKey` equality and `beginsWith` (only if in v1 operator set).

- [ ] **Step 3: Run test** — expect FAIL.

Run: `bun test --cwd packages/runtime-local src/table-store.test.ts`

- [ ] **Step 4: Implement** in-memory store: `Map` keyed by `tableId` → nested map `partitionKey` → `Map<rowKey, Row>`; enforce v1 validation; throw `TableStoreError` with correct codes.

- [ ] **Step 5: Run tests + typecheck** — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime-local
git commit -m "feat(runtime-local): in-memory TableStore for dev and tests"
```

---

### Task 3: `runtime-aws` — DynamoDB implementation

**Files:**
- Modify: `packages/runtime-aws/package.json` (add AWS SDK deps)
- Create: `packages/runtime-aws/src/table-store.ts`
- Modify: `packages/runtime-aws/src/index.ts`
- Test: `packages/runtime-aws/src/table-store.test.ts`

- [ ] **Step 1: Add dependencies** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` (versions aligned with monorepo / Bun).

- [ ] **Step 2: Write tests** using **mocked** `DynamoDBDocumentClient` (inject client factory) for one happy path `putRow`/`getRow` and `NotFound`.

- [ ] **Step 3: Implement** `createAwsTableStore(config)` reading table name from env convention documented in spec §5 (constant prefix helper in one place).

- [ ] **Step 4: Run** `bun test --cwd packages/runtime-aws src/` and typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime-aws
git commit -m "feat(runtime-aws): DynamoDB TableStore implementation"
```

---

### Task 4: `runtime-azure` — Cosmos Table API

**Files:**
- Modify: `packages/runtime-azure/package.json` (add `@azure/data-tables`, `@azure/identity` if needed)
- Create: `packages/runtime-azure/src/table-store.ts`
- Modify: `packages/runtime-azure/src/index.ts`
- Test: `packages/runtime-azure/src/table-store.test.ts`

- [ ] **Step 1: Write tests** with mocked `TableClient` / batch API for `getEntity` / `upsertEntity` / `deleteEntity` / `listEntities` mapping.

- [ ] **Step 2: Implement** `createAzureTableStore(config)` using partition/row key property names from config; map errors to `TableStoreError`.

- [ ] **Step 3: Run** `bun test --cwd packages/runtime-azure src/` and typecheck.

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-azure
git commit -m "feat(runtime-azure): Cosmos Table API TableStore implementation"
```

---

### Task 5: `@otavia/stack` — parse `resources.tables`

**Files:**
- Modify: `packages/stack/src/otavia/parse-otavia-yaml.ts`
- Modify: `packages/stack/src/types.ts`
- Modify: `packages/stack/src/build-stack-model.ts` (if env merge lives here)
- Test: new or extended tests under `packages/stack/src/otavia/`

- [ ] **Step 1: Extend** `KNOWN_TOP_LEVEL` with `resources`.

- [ ] **Step 2: Parse** `resources.tables` as a record: logical id → `{ partitionKey, rowKey }` attribute names + type enum (`string` only in v1 if that reduces risk, else match spec §3).

- [ ] **Step 3: Add** `warnings` for unknown `resources.*` children; **errors** for invalid key definitions.

- [ ] **Step 4: Extend** `StackModel` with `tables: Record<string, ParsedTableDefinition>` (name types precisely in code).

- [ ] **Step 5: Run** `bun test --cwd packages/stack src/` and typecheck.

- [ ] **Step 6: Commit**

```bash
git add packages/stack/src
git commit -m "feat(stack): parse otavia.yaml resources.tables"
```

---

### Task 6: `host-aws` — CloudFormation tables + IAM + env

**Files:**
- Create or modify under `packages/host-aws/src/template/`
- Modify: `packages/host-aws/src/deploy/deploy-stack.ts` if template composition changes
- Test: extend existing template tests

- [ ] **Step 1: Generate** `AWS::DynamoDB::Table` per declared table (PAY_PER_REQUEST, point-in-time recovery optional off for v1).

- [ ] **Step 2: Extend** Lambda execution role inline policy for `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `BatchGetItem`, `BatchWriteItem`, `Scan` **scoped** to table ARNs.

- [ ] **Step 3: Inject** `OTAVIA_TABLE_<ID>_NAME` into function environment from `Ref` table name.

- [ ] **Step 4: Run** `bun test --cwd packages/host-aws src/`.

- [ ] **Step 5: Commit**

```bash
git add packages/host-aws
git commit -m "feat(host-aws): provision DynamoDB tables and env for TableStore"
```

---

### Task 7: `host-azure` — Bicep Cosmos Table + role + app settings

**Files:**
- Modify: `packages/host-azure/src/template/`
- Modify: `packages/host-azure/src/deploy/deploy-stack.ts` if needed
- Test: Bicep unit tests

- [ ] **Step 1: Add** Cosmos DB account with **Table API** capability (or storage account + Table if product choice — **default per spec: Cosmos Table API**; document if simplified to Storage Tables for dev-only).

- [ ] **Step 2: Create** table resources per logical id.

- [ ] **Step 3: Wire** function app / function managed identity with `Contributor` or data-plane role as required by Table API access pattern.

- [ ] **Step 4: Emit** app settings for `OTAVIA_TABLE_*` and endpoint/account URL.

- [ ] **Step 5: Run** `bun test --cwd packages/host-azure src/`.

- [ ] **Step 6: Commit**

```bash
git add packages/host-azure
git commit -m "feat(host-azure): provision Cosmos Table API and env for TableStore"
```

---

### Task 8: CLI glue (if deploy path reads stack model today)

**Files:**
- Under `packages/cli/src/` — locate deploy command and ensure `DeployInput.environments` includes merged table env from `StackModel`.

- [ ] **Step 1: Trace** current `deploy` flow from `packages/cli` into `host-*`.

- [ ] **Step 2: Pass** resolved table env keys from `buildStackModel` output into `deployStack`.

- [ ] **Step 3: Run** `bun test --cwd packages/cli src/` (and any integration smoke per `@.cursor/skills/run-sanity-checks/SKILL.md` if applicable).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src
git commit -m "feat(cli): pass table env bindings to host deploy"
```

---

### Task 9: Documentation cross-link

**Files:**
- Modify: `docs/superpowers/plans/2026-03-23-otavia-cli-multicloud.md` **only if** maintainers want a backlink (optional); otherwise skip (YAGNI).

- [ ] **Step 1:** Add one paragraph to multicloud plan or README under `packages/runtime-contract` describing `TableStore` — **only** if repo convention requires it; prefer keeping truth in spec file §5.

---

## Plan review

After editing this plan, run **plan-document-reviewer** (see superpowers `plan-document-reviewer-prompt.md`) with:

- Plan path: `docs/superpowers/plans/2026-03-23-runtime-table-store.md`
- Spec path: `docs/superpowers/specs/2026-03-23-otavia-runtime-table-store-design.md`

Fix issues until approved (max 3 reviewer loops, then escalate to human).

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-03-23-runtime-table-store.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks. **REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development`.

2. **Inline execution** — run tasks in this session with checkpoints. **REQUIRED SUB-SKILL:** `superpowers:executing-plans`.

**Which approach?**
