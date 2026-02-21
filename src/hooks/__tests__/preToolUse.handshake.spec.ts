vi.mock("../securityClassifier", () => ({
	classifyTool: () => "SAFE",
	canProceed: () => true,
	getFailureCount: () => 0,
	assertCommandSafe: () => undefined,
}))

vi.mock("../intentLoader", () => ({
	loadIntentCatalog: async () => ({ intents: [] }),
	getSelectedIntent: async () => null,
	selectActiveIntent: async () => null,
}))

vi.mock("../autoIntentResolver", () => ({
	resolveIntentForToolCall: () => ({
		intent: null,
		reason: "ambiguous",
		confidence: 0,
		candidates: [],
	}),
}))

vi.mock("../preCompact", () => ({
	preCompact: async () => undefined,
}))

import { preToolUse } from "../preToolUse"

describe("preToolUse handshake", () => {
	it("blocks ask_followup_question when no active intent exists", async () => {
		const result = await preToolUse({
			taskId: "task-1",
			cwd: "/tmp",
			toolName: "ask_followup_question",
			args: { question: "What intent should I use?" },
		})

		expect(result.ok).toBe(false)
		expect(result.errorPayload?.error.code).toBe("HANDSHAKE_REQUIRED")
		expect(result.decisionReason).toContain("No active intent selected")
	})
})
