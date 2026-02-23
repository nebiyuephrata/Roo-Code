import fs from "fs/promises"
import os from "os"
import path from "path"

import { stringify } from "yaml"

import {
	canTransitionIntentStatus,
	loadIntentCatalog,
	selectActiveIntent,
	updateIntentStatus,
	type IntentFileShape,
} from "../intentLoader"

function buildCatalog(status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" = "PLANNED"): IntentFileShape {
	return {
		intents: [
			{
				id: "INT-001",
				title: "Intent One",
				description: "Lifecycle test intent",
				scope: ["src/**"],
				acceptanceCriteria: ["Lint passes", "Tests pass"],
				status,
			},
		],
	}
}

describe("intent lifecycle transitions", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "intent-loader-lifecycle-"))
		await fs.mkdir(path.join(tempDir, ".orchestration"), { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("allows only PLANNED->IN_PROGRESS->COMPLETED transitions", () => {
		expect(canTransitionIntentStatus("PLANNED", "IN_PROGRESS")).toBe(true)
		expect(canTransitionIntentStatus("IN_PROGRESS", "COMPLETED")).toBe(true)

		expect(canTransitionIntentStatus("PLANNED", "COMPLETED")).toBe(false)
		expect(canTransitionIntentStatus("COMPLETED", "IN_PROGRESS")).toBe(false)
		expect(canTransitionIntentStatus("COMPLETED", "PLANNED")).toBe(false)
	})

	it("promotes selected PLANNED intent to IN_PROGRESS", async () => {
		await fs.writeFile(
			path.join(tempDir, ".orchestration", "active_intents.yaml"),
			stringify(buildCatalog("PLANNED")),
			"utf-8",
		)

		const selected = await selectActiveIntent("task-1", tempDir, "INT-001")
		expect(selected.status).toBe("IN_PROGRESS")

		const catalog = await loadIntentCatalog(tempDir)
		expect(catalog.intents[0].status).toBe("IN_PROGRESS")
	})

	it("blocks direct PLANNED->COMPLETED status updates", async () => {
		await fs.writeFile(
			path.join(tempDir, ".orchestration", "active_intents.yaml"),
			stringify(buildCatalog("PLANNED")),
			"utf-8",
		)

		await expect(updateIntentStatus(tempDir, "INT-001", "COMPLETED")).rejects.toThrow(
			"Illegal intent status transition",
		)
	})
})
