vi.mock("vscode", () => ({
	window: {
		showWarningMessage: async () => "Approve once",
	},
}))

vi.mock("../securityClassifier", () => ({
	classifyTool: () => "WRITE",
	canProceed: () => true,
	getFailureCount: () => 0,
	recordSuccess: () => undefined,
	assertCommandSafe: () => undefined,
}))

vi.mock("../intentLoader", () => ({
	loadIntentCatalog: async () => ({
		intents: [{ id: "INT-001", scope: ["src/**"], acceptanceCriteria: [], status: "IN_PROGRESS" }],
	}),
	getSelectedIntent: async () => ({
		id: "INT-001",
		scope: ["src/**"],
		acceptanceCriteria: [],
		status: "IN_PROGRESS",
	}),
	selectActiveIntent: async () => ({
		id: "INT-001",
		scope: ["src/**"],
		acceptanceCriteria: [],
		status: "IN_PROGRESS",
	}),
}))

vi.mock("../autoIntentResolver", () => ({
	resolveIntentForToolCall: () => ({
		intent: null,
		reason: "already-selected",
		confidence: 100,
		candidates: [],
	}),
}))

vi.mock("../preCompact", () => ({
	preCompact: async () => undefined,
}))

vi.mock("../scopeValidator", () => ({
	sanitizeAndNormalizePath: () => ({
		absolutePath: "/tmp/repo/src/auth.ts",
		relativePath: "src/auth.ts",
	}),
	validatePathAgainstScope: () => undefined,
}))

vi.mock("../concurrencyGuard", () => ({
	captureReadSnapshot: async () => "read-hash",
	readFileContentSafe: async () => "export const oldSymbol = 1\n",
	validateWriteFreshness: async () => ({ ok: true, expectedHash: "x", actualHash: "x" }),
}))

vi.mock("../mutationClassifier", () => ({
	inferSemanticMutationClass: () => "AST_REFACTOR",
	isMutationClassCompatible: (provided: string, inferred: string) => provided === inferred,
}))

import { preToolUse } from "../preToolUse"

describe("preToolUse write_to_file mutation class behavior", () => {
	it("auto-fills mutation_class when omitted", async () => {
		const result = await preToolUse({
			taskId: "task-1",
			cwd: "/tmp/repo",
			toolName: "write_to_file",
			args: {
				path: "src/auth.ts",
				content: "export const oldSymbol = 1 // moved",
				intent_id: "INT-001",
			},
		})

		expect(result.ok).toBe(true)
		expect(result.normalizedArgs.mutation_class).toBe("AST_REFACTOR")
		expect(result.normalizedArgs.__mutation_class_auto_filled).toBe(true)
	})

	it("blocks invalid mutation_class type when explicitly provided", async () => {
		const result = await preToolUse({
			taskId: "task-2",
			cwd: "/tmp/repo",
			toolName: "write_to_file",
			args: {
				path: "src/auth.ts",
				content: "export const oldSymbol = 1 // moved",
				intent_id: "INT-001",
				mutation_class: 42,
			},
		})

		expect(result.ok).toBe(false)
		expect(result.errorPayload?.error.code).toBe("MALFORMED_WRITE_REQUEST")
		expect(result.decisionReason).toContain("invalid mutation_class type")
	})
})
