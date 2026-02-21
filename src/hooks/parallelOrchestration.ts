import fs from "fs/promises"
import path from "path"

import { getConcurrencySessionId } from "./concurrencyGuard"

interface ParallelSessionEntry {
	session_id: string
	task_id: string
	intent_id: string | null
	last_tool: string
	status: "success" | "failure" | "blocked"
	updated_at: string
}

interface ParallelSessionStore {
	sessions: ParallelSessionEntry[]
}

interface CollisionRecord {
	session_id: string
	task_id: string
	intent_id: string | null
	path: string
	expected_hash: string | null
	actual_hash: string | null
	timestamp: string
}

const writeQueueByPath = new Map<string, Promise<void>>()

function storePath(cwd: string): string {
	return path.join(cwd, ".orchestration", "parallel_sessions.json")
}

function claudePath(cwd: string): string {
	return path.join(cwd, ".orchestration", "CLAUDE.md")
}

async function enqueueWrite(targetPath: string, writeFn: () => Promise<void>): Promise<void> {
	const previous = writeQueueByPath.get(targetPath) ?? Promise.resolve()
	const next = previous.then(writeFn)
	writeQueueByPath.set(
		targetPath,
		next.catch(() => undefined),
	)
	await next
}

async function readSessionStore(cwd: string): Promise<ParallelSessionStore> {
	const target = storePath(cwd)
	try {
		const raw = await fs.readFile(target, "utf-8")
		const parsed = JSON.parse(raw) as Partial<ParallelSessionStore>
		if (!parsed || !Array.isArray(parsed.sessions)) {
			return { sessions: [] }
		}
		return {
			sessions: parsed.sessions.filter(
				(entry): entry is ParallelSessionEntry =>
					typeof entry?.session_id === "string" &&
					typeof entry?.task_id === "string" &&
					(entry.intent_id === null || typeof entry.intent_id === "string") &&
					typeof entry?.last_tool === "string" &&
					typeof entry?.status === "string" &&
					typeof entry?.updated_at === "string",
			),
		}
	} catch (error: any) {
		if (error?.code === "ENOENT") {
			return { sessions: [] }
		}
		return { sessions: [] }
	}
}

export async function registerParallelActivity(input: {
	cwd: string
	taskId: string
	intentId: string | null
	toolName: string
	status: "success" | "failure" | "blocked"
}): Promise<void> {
	const target = storePath(input.cwd)
	await enqueueWrite(target, async () => {
		const store = await readSessionStore(input.cwd)
		const now = new Date().toISOString()
		const sessionId = getConcurrencySessionId()
		const nextEntry: ParallelSessionEntry = {
			session_id: sessionId,
			task_id: input.taskId,
			intent_id: input.intentId,
			last_tool: input.toolName,
			status: input.status,
			updated_at: now,
		}

		const idx = store.sessions.findIndex(
			(entry) => entry.session_id === sessionId && entry.task_id === input.taskId,
		)
		if (idx >= 0) {
			store.sessions[idx] = nextEntry
		} else {
			store.sessions.push(nextEntry)
		}

		await fs.mkdir(path.dirname(target), { recursive: true })
		await fs.writeFile(target, `${JSON.stringify(store, null, 2)}\n`, "utf-8")
	})
}

export async function recordParallelCollision(
	cwd: string,
	record: Omit<CollisionRecord, "session_id" | "timestamp">,
): Promise<void> {
	const sessionId = getConcurrencySessionId()
	const payload: CollisionRecord = {
		...record,
		session_id: sessionId,
		timestamp: new Date().toISOString(),
	}
	const target = claudePath(cwd)
	await enqueueWrite(target, async () => {
		await fs.mkdir(path.dirname(target), { recursive: true })
		const line = `- ${payload.timestamp} COLLISION ${JSON.stringify(payload)}\n`
		await fs.appendFile(target, line, "utf-8")
	})
}
