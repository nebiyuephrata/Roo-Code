import fs from "fs/promises"
import os from "os"
import path from "path"

import { recordParallelCollision, registerParallelActivity } from "../parallelOrchestration"

describe("parallelOrchestration", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "parallel-orchestration-"))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("registers and updates per-session activity", async () => {
		await registerParallelActivity({
			cwd: tempDir,
			taskId: "task-1",
			intentId: "INT-001",
			toolName: "read_file",
			status: "success",
		})
		await registerParallelActivity({
			cwd: tempDir,
			taskId: "task-1",
			intentId: "INT-001",
			toolName: "write_to_file",
			status: "blocked",
		})

		const raw = await fs.readFile(path.join(tempDir, ".orchestration", "parallel_sessions.json"), "utf-8")
		const parsed = JSON.parse(raw) as { sessions: Array<{ task_id: string; last_tool: string; status: string }> }

		expect(parsed.sessions.length).toBe(1)
		expect(parsed.sessions[0].task_id).toBe("task-1")
		expect(parsed.sessions[0].last_tool).toBe("write_to_file")
		expect(parsed.sessions[0].status).toBe("blocked")
	})

	it("appends collision records into CLAUDE.md", async () => {
		await recordParallelCollision(tempDir, {
			task_id: "task-2",
			intent_id: "INT-002",
			path: "src/auth/login.ts",
			expected_hash: "abc",
			actual_hash: "def",
		})

		const content = await fs.readFile(path.join(tempDir, ".orchestration", "CLAUDE.md"), "utf-8")
		expect(content).toContain("COLLISION")
		expect(content).toContain('"task_id":"task-2"')
	})
})
