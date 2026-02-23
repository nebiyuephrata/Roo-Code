import fs from "fs/promises"
import os from "os"
import path from "path"

import { parse } from "yaml"

import { bootstrapGovernanceFiles } from "../governanceBootstrap"

describe("governanceBootstrap", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "governance-bootstrap-"))
	})

	it("creates orchestration sidecar files when missing", async () => {
		await bootstrapGovernanceFiles(tempDir)

		const base = path.join(tempDir, ".orchestration")
		const intents = await fs.readFile(path.join(base, "active_intents.yaml"), "utf-8")
		const parsed = parse(intents) as { intents?: unknown[] }
		expect(Array.isArray(parsed.intents)).toBe(true)
		expect(parsed.intents!.length).toBeGreaterThan(0)
		await expect(fs.readFile(path.join(base, "agent_trace.jsonl"), "utf-8")).resolves.toBeDefined()
		await expect(fs.readFile(path.join(base, "intent_map.md"), "utf-8")).resolves.toBeDefined()
		await expect(fs.readFile(path.join(base, "CLAUDE.md"), "utf-8")).resolves.toBeDefined()
	})

	it("repairs malformed active_intents.yaml with backup", async () => {
		const base = path.join(tempDir, ".orchestration")
		await fs.mkdir(base, { recursive: true })
		await fs.writeFile(path.join(base, "active_intents.yaml"), "not: [valid", "utf-8")

		await bootstrapGovernanceFiles(tempDir, { repair: true })

		const repaired = await fs.readFile(path.join(base, "active_intents.yaml"), "utf-8")
		const parsed = parse(repaired) as { intents?: unknown[] }
		expect(Array.isArray(parsed.intents)).toBe(true)

		const files = await fs.readdir(base)
		expect(files.some((name) => name.startsWith("active_intents.yaml.bak."))).toBe(true)
	})
})
