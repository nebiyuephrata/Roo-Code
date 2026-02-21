import fs from "fs/promises"
import os from "os"
import path from "path"

import { ensureIntentCatalogFile, loadIntentCatalog } from "../intentLoader"

describe("intentLoader bootstrap catalog", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "intent-loader-bootstrap-"))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("creates a generic multi-purpose catalog when file is missing", async () => {
		await ensureIntentCatalogFile(tempDir)
		const catalog = await loadIntentCatalog(tempDir)
		const ids = catalog.intents.map((intent) => intent.id)

		expect(catalog.intents.length).toBeGreaterThanOrEqual(6)
		expect(ids).toContain("INT-GEN-001")
		expect(ids).toContain("INT-GEN-006")
		expect(catalog.intents.every((intent) => intent.scope.length > 0)).toBe(true)
	})
})
