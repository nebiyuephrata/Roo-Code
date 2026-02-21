# TRP1 Demo Checklist (Week 1)

Owner: Ephrata Nebiyu
Branch Baseline: `main`
Tag Baseline: `trp1-week1-milestone-2026-02-21`

## 1. Environment Setup
- [ ] Open two VS Code Extension Development Host windows.
- [ ] Open a fresh target workspace (not the extension source tree).
- [ ] Confirm `.orchestration/` exists in target workspace.
- [ ] Confirm `.orchestration/active_intents.yaml` is valid and contains at least 3 intents.

## 2. Handshake + Intent Governance
- [ ] Start a new task with no preselected intent.
- [ ] Verify agent first resolves/selects intent via `select_active_intent(intent_id)`.
- [ ] Verify any non-handshake tool without active intent is blocked.
- [ ] Verify blocked record is appended to `.orchestration/agent_trace.jsonl`.

## 3. Scope + HITL Guardrails
- [ ] Run one in-scope read tool call.
- [ ] Run one in-scope write tool call with valid `intent_id` and `mutation_class`.
- [ ] Attempt out-of-scope write (`tmp/outside.txt`) and verify block.
- [ ] Attempt destructive command (`rm -rf /tmp/test-governance`) and verify HITL prompt or block.

## 4. Traceability Ledger Validation
- [ ] Inspect latest trace entry in `.orchestration/agent_trace.jsonl`.
- [ ] Verify schema fields: `id`, `vcs.revision_id`, `files[].conversations[].ranges[].content_hash`.
- [ ] Verify `related[]` includes active `intent_id`.
- [ ] Verify blocked actions are also logged with status and reason.

## 5. Spatial Hash + Mutation Semantics
- [ ] Perform tiny refactor edit and confirm changed-range hashes are emitted.
- [ ] Verify mutation mismatch (`provided` vs `inferred`) blocks write.
- [ ] Verify valid mutation class proceeds.

## 6. Parallel Orchestration Proof
- [ ] Run Architect session and Builder session in parallel.
- [ ] Trigger stale-write collision intentionally.
- [ ] Verify stale-write block and collision log in `.orchestration/CLAUDE.md`.
- [ ] Verify `.orchestration/parallel_sessions.json` updates per task/session.

## 7. Intent Lifecycle + Context
- [ ] Run lint/test acceptance commands for active intent.
- [ ] Verify intent transitions `IN_PROGRESS -> COMPLETED` only.
- [ ] Verify `intent_map.md` updates when new file or `INTENT_EVOLUTION` occurs.
- [ ] Verify pre-compaction writes summary to `.orchestration/CLAUDE.md`.

## 8. Demo Artifacts to Capture
- [ ] 5-minute demo video showing all required proof points.
- [ ] Screenshots of governance blocks, HITL modal, and trace explorer.
- [ ] Export of final `.orchestration/` directory.
- [ ] Final architecture report referencing `ARCHITECTURE_NOTES.md`.

## Suggested Validation Commands
```bash
pnpm --filter roo-cline check-types
pnpm --filter roo-cline exec vitest run hooks/__tests__/traceLogger.schema.spec.ts hooks/__tests__/spatialTrace.spec.ts hooks/__tests__/preToolUse.handshake.spec.ts hooks/__tests__/parallelOrchestration.spec.ts
```
