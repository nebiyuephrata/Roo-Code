# ARCHITECTURE_NOTES.md

## Governed AI-Native IDE Extension (TRP1 Week 1)

Author: Ephrata Nebiyu  
Base Fork: Roo Code (rebranded as Rataz AI / ራታዝ)  
Objective: Upgrade Roo into a governed AI-native IDE with deterministic intent control and end-to-end traceability.

---

## 1. Problem Statement

Traditional Git captures **what changed** and **when**, but not reliably:

- why the change happened (business intent),
- which agent action produced it,
- whether the action complied with governance policy,
- whether concurrent edits were safe.

This implementation addresses that gap by introducing an intent-first execution model, deterministic hook middleware, and sidecar-based auditability.

---

## 2. System Architecture

### 2.1 Webview Layer (Presentation)

Responsibilities:

- chat and controls,
- governance status and trace visualization,
- user approvals (HITL UI actions),
- postMessage communication to extension host.

Non-responsibilities:

- no filesystem access,
- no policy enforcement,
- no direct tool execution.

### 2.2 Extension Host Layer (Control Plane)

Responsibilities:

- task lifecycle and tool routing,
- LLM interaction,
- governance hook invocation,
- sidecar read/write,
- enforcement and trace recording.

### 2.3 Hook Engine (Deterministic Middleware Boundary)

Location: `src/hooks/`

Primary modules:

- `preToolUse.ts`
- `postToolUse.ts`
- `intentLoader.ts`
- `scopeValidator.ts`
- `traceLogger.ts`
- `concurrencyGuard.ts`
- `securityClassifier.ts`
- `governanceStatus.ts`
- `autoIntentResolver.ts`
- `intentMapUpdater.ts`
- `parallelOrchestration.ts`
- `preCompact.ts`

Hooks are isolated from webview rendering and invoked from the execution pipeline.

---

## 3. Governed Execution Flow

### State 1: User Request

User submits task request.

### State 2: Intent Handshake

Agent is expected to identify/select intent via `select_active_intent(intent_id)`.

Pre-hook behavior:

- loads intent catalog,
- validates intent existence,
- resolves ambiguity with deterministic scoring when needed,
- binds active intent to task/workspace state,
- blocks if handshake cannot be established for governed actions.

### State 3: Contextualized Action

Agent executes tools under active intent constraints.

Pre-hook enforces:

- scope constraints,
- command/tool security class,
- HITL approval (for write/destructive classes),
- stale-write checks (optimistic locking).

Post-hook enforces:

- trace serialization,
- content hash generation,
- lifecycle updates,
- sidecar append/update.

---

## 4. Sidecar Data Model (`.orchestration/`)

### 4.1 `active_intents.yaml`

Intent catalog with governance metadata.

Core fields:

- `id`
- `title`
- `description`
- `scope` (glob patterns)
- `acceptanceCriteria`
- `status` (`PLANNED | IN_PROGRESS | COMPLETED`)

### 4.2 `active_intent.json`

Current active selection for workspace/task continuity.

### 4.3 `agent_trace.jsonl`

Append-only trace ledger containing:

- intent linkage,
- tool metadata,
- decision reason,
- status (`success | failure | blocked`),
- approval state,
- duration/error fields,
- vcs metadata,
- file/range hash metadata.

### 4.4 `intent_map.md`

Intent-to-file map updated during intent evolution and file creation events.

### 4.5 `CLAUDE.md`

Shared memory for lessons/failure notes used in parallel orchestration workflows.

---

## 5. Intent Loading and Fallback Strategy

Intent catalogs are **workspace-scoped by design**:

- primary source: `<workspace>/.orchestration/active_intents.yaml`

Fallback behavior implemented in `intentLoader.ts`:

1. If workspace catalog is missing, extension attempts to materialize default bundled intents into workspace.
2. If materialization fails (permissions/read-only), extension uses in-memory default catalog to avoid deadlock.

This preserves workspace isolation while providing first-run resilience.

---

## 6. Governance Enforcement (Pre-Hook)

### 6.1 Security Classification

Tools/commands are classified into `SAFE`, `WRITE`, `DESTRUCTIVE` classes.

### 6.2 Scope Validation

Mutations must match active intent scope patterns; out-of-scope writes are blocked.

### 6.3 HITL Approval

Sensitive actions require explicit user decision.

Additional UX hardening:

- `Approve once`
- `Approve always (session)` (for eligible flows)
- `Deny`

### 6.4 Concurrency Guard

Optimistic locking compares read-time hash to current disk hash before write.

If mismatch:

- write blocked as stale,
- collision recorded in orchestration sidecar.

### 6.5 Circuit Breaker

Repeated failure loops trigger breaker and block further tool execution until recovery.

---

## 7. Post-Hook Responsibilities

After tool execution:

1. compute and attach content hashes,
2. build structured trace record,
3. append trace atomically to JSONL ledger,
4. update intent map / orchestration state,
5. evaluate transition signals (e.g., `IN_PROGRESS -> COMPLETED` when criteria are met).

---

## 8. Real-Time Governance Observability

UI components:

- `GovernanceStatusPanel`
- `GovernanceTraceExplorer`

Extension host (`ClineProvider`) watches orchestration file changes and posts refreshed state to webview.

Observed in UI:

- active intent,
- latest governance decision,
- trace count,
- filtered trace stream (intent/tool/status/collision).

---

## 9. Security Model

- policy logic is extension-host only,
- workspace path normalization and traversal prevention,
- command safety validation,
- governed writes require intent + approval + freshness checks,
- webview is non-privileged.

---

## 10. Performance and Reliability

- append-only JSONL ledger (O(1) append pattern),
- in-memory intent cache keyed by file mtime,
- debounced governance UI refresh,
- partial non-blocking compaction support (`preCompact`),
- graceful behavior when git SHA unavailable.

---

## 11. Known Edge Cases Covered

- missing/invalid intent YAML,
- no active intent selected,
- ambiguous intent auto-resolution,
- out-of-scope mutation,
- stale-write collisions,
- repeated tool error loops,
- malformed write request metadata.

---

## 12. Current Compliance Position (TRP1 Week 1)

Achieved:

- intent-aware governed execution,
- deterministic middleware enforcement,
- sidecar traceability with content hashing,
- optimistic locking and collision logging,
- HITL controls,
- real-time governance visibility.

This architecture is built for auditable, policy-driven agentic development rather than unconstrained code generation.
