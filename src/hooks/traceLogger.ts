import fs from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { execFile } from "child_process"
import { promisify } from "util"

import { sha256 } from "./concurrencyGuard"

const execFileAsync = promisify(execFile)
const appendQueueByFile = new Map<string, Promise<void>>()

export interface AgentTraceRecord {
	id: string
	trace_id: string
	timestamp: string
	intent_id: string | null
	tool_name: string
	args_summary: string
	args_hash: string
	approved: boolean | null
	decision_reason: string
	status: "success" | "failure" | "blocked"
	duration_ms: number
	error_message?: string
	security_class: "SAFE" | "WRITE" | "DESTRUCTIVE"
	mutation_class?: string
	file_path?: string
	content_hash?: string
	read_hash?: string | null
	write_hash?: string | null
	related: string[]
	agent: {
		task_id: string
	}
	vcs: {
		revision_id: string
		branch?: string
		commit?: string
	}
	files: Array<{
		relative_path: string
		conversations: Array<{
			url: string
			contributor: {
				entity_type: "AI" | "HUMAN"
				model_identifier: string
			}
			ranges: Array<{
				start_line: number
				end_line: number
				content_hash: string
			}>
			related: Array<{
				type: "specification" | "intent" | "trace"
				value: string
			}>
		}>
	}>
}

export class TraceValidationError extends Error {
	constructor(
		public readonly code: "TRACE_SCHEMA_INVALID",
		message: string,
		public readonly details?: Record<string, unknown>,
	) {
		super(message)
	}
}

function tracePath(cwd: string): string {
	return path.join(cwd, ".orchestration", "agent_trace.jsonl")
}

export function summarizeArgs(args: Record<string, unknown>): string {
	const raw = JSON.stringify(args ?? {})
	if (!raw) {
		return ""
	}
	return raw.length <= 500 ? raw : `${raw.slice(0, 497)}...`
}

export function hashArgs(args: Record<string, unknown>): string {
	return sha256(JSON.stringify(args ?? {}))
}

export function buildTraceRecord(input: Omit<AgentTraceRecord, "id" | "trace_id" | "timestamp">): AgentTraceRecord {
	const generated = randomUUID()
	return {
		...input,
		id: generated,
		trace_id: generated,
		timestamp: new Date().toISOString(),
	}
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export function validateTraceRecord(record: AgentTraceRecord): void {
	if (!record.trace_id || typeof record.trace_id !== "string") {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "trace_id is required and must be a string.")
	}
	if (!record.id || typeof record.id !== "string") {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "id is required and must be a string.")
	}
	if (!record.timestamp || typeof record.timestamp !== "string" || Number.isNaN(Date.parse(record.timestamp))) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "timestamp must be a valid ISO date string.")
	}
	if (!(record.intent_id === null || typeof record.intent_id === "string")) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "intent_id must be string or null.")
	}
	if (typeof record.tool_name !== "string" || record.tool_name.length === 0) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "tool_name is required.")
	}
	if (typeof record.args_summary !== "string" || typeof record.args_hash !== "string") {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "args_summary and args_hash must be strings.")
	}
	if (!(record.approved === null || typeof record.approved === "boolean")) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "approved must be boolean or null.")
	}
	if (typeof record.decision_reason !== "string") {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "decision_reason must be a string.")
	}
	if (!["success", "failure", "blocked"].includes(record.status)) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "status must be success, failure, or blocked.")
	}
	if (!Number.isFinite(record.duration_ms) || record.duration_ms < 0) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "duration_ms must be a non-negative number.")
	}
	if (!["SAFE", "WRITE", "DESTRUCTIVE"].includes(record.security_class)) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "security_class is invalid.")
	}
	if (!isStringArray(record.related)) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "related must be an array of strings.")
	}
	if (!record.agent || typeof record.agent.task_id !== "string" || record.agent.task_id.length === 0) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "agent.task_id is required.")
	}
	if (!record.vcs || typeof record.vcs !== "object") {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "vcs must be an object.")
	}
	if (typeof record.vcs.revision_id !== "string" || record.vcs.revision_id.length === 0) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "vcs.revision_id is required.")
	}
	if (!Array.isArray(record.files)) {
		throw new TraceValidationError("TRACE_SCHEMA_INVALID", "files must be an array.")
	}
	for (const file of record.files) {
		if (!file || typeof file.relative_path !== "string" || !Array.isArray(file.conversations)) {
			throw new TraceValidationError(
				"TRACE_SCHEMA_INVALID",
				"files entries must contain relative_path and conversations[].",
			)
		}
		for (const conversation of file.conversations) {
			if (
				!conversation ||
				typeof conversation.url !== "string" ||
				!conversation.contributor ||
				typeof conversation.contributor.model_identifier !== "string" ||
				!Array.isArray(conversation.ranges) ||
				!Array.isArray(conversation.related)
			) {
				throw new TraceValidationError(
					"TRACE_SCHEMA_INVALID",
					"conversations entries must contain url, contributor, ranges[], related[].",
				)
			}
			for (const range of conversation.ranges) {
				if (
					!range ||
					!Number.isInteger(range.start_line) ||
					!Number.isInteger(range.end_line) ||
					typeof range.content_hash !== "string"
				) {
					throw new TraceValidationError(
						"TRACE_SCHEMA_INVALID",
						"ranges entries must contain integer start_line/end_line and content_hash.",
					)
				}
			}
			for (const related of conversation.related) {
				if (
					!related ||
					typeof related.type !== "string" ||
					!["specification", "intent", "trace"].includes(related.type) ||
					typeof related.value !== "string"
				) {
					throw new TraceValidationError(
						"TRACE_SCHEMA_INVALID",
						"related entries must contain type and value strings.",
					)
				}
			}
		}
	}
}

async function resolveGitValue(cwd: string, args: string[]): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync("git", args, { cwd, timeout: 1500 })
		const trimmed = stdout.trim()
		return trimmed.length > 0 ? trimmed : undefined
	} catch {
		return undefined
	}
}

export async function resolveVcsMetadata(cwd: string): Promise<AgentTraceRecord["vcs"]> {
	const [branch, commit] = await Promise.all([
		resolveGitValue(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
		resolveGitValue(cwd, ["rev-parse", "HEAD"]),
	])
	return { revision_id: commit ?? "unknown", branch, commit }
}

export async function appendTraceRecord(cwd: string, record: AgentTraceRecord): Promise<void> {
	const target = tracePath(cwd)
	validateTraceRecord(record)
	const previous = appendQueueByFile.get(target) ?? Promise.resolve()
	const next = previous.then(async () => {
		await fs.mkdir(path.dirname(target), { recursive: true })
		const line = `${JSON.stringify(record)}\n`
		const handle = await fs.open(target, "a")
		try {
			await handle.appendFile(line, "utf-8")
		} finally {
			await handle.close()
		}
	})
	appendQueueByFile.set(
		target,
		next.catch(() => undefined),
	)
	await next
}
