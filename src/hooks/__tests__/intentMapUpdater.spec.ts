import fs from "fs/promises"
import os from "os"
import path from "path"

import { updateIntentMap } from "../intentMapUpdater"

describe("intentMapUpdater", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "intent-map-updater-"))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("records deterministic intent -> file -> structural node mapping", async () => {
		await updateIntentMap(
			tempDir,
			"INT-002",
			"src/auth/service.ts",
			"export function login(user: string) { return user.length > 0 }",
		)

		const raw = await fs.readFile(path.join(tempDir, ".orchestration", "intent_map.md"), "utf-8")
		expect(raw).toContain("## INT-002")
		expect(raw).toContain("- `src/auth/service.ts`")
		expect(raw).toContain("`export:login`")
	})

	it("retains previous entries and appends new files for same intent", async () => {
		await updateIntentMap(tempDir, "INT-003", "src/ui/home.tsx", "export const Home = () => null")
		await updateIntentMap(tempDir, "INT-003", "src/ui/nav.tsx", "export const Nav = () => null")

		const raw = await fs.readFile(path.join(tempDir, ".orchestration", "intent_map.md"), "utf-8")
		expect(raw).toContain("- `src/ui/home.tsx`")
		expect(raw).toContain("- `src/ui/nav.tsx`")
		expect(raw).toContain("`export:Home`")
		expect(raw).toContain("`export:Nav`")
	})
})
