import { resolveIntentForToolCall } from "../autoIntentResolver"
import type { IntentDefinition } from "../intentLoader"

const intents: IntentDefinition[] = [
	{
		id: "INT-GEN-001",
		title: "Architecture and Planning",
		description: "Define architecture boundaries, contracts, and implementation plan.",
		scope: ["src/**", "docs/**", "*.md"],
		acceptanceCriteria: ["Architecture notes are updated"],
		status: "IN_PROGRESS",
	},
	{
		id: "INT-GEN-002",
		title: "Core Feature Delivery",
		description: "Implement core product behavior in application logic.",
		scope: ["src/**", "app/**", "lib/**"],
		acceptanceCriteria: ["Feature behavior matches request"],
		status: "PLANNED",
	},
	{
		id: "INT-GEN-004",
		title: "Quality and Verification",
		description: "Add tests, lint compliance, and verification routines.",
		scope: ["tests/**", "src/**"],
		acceptanceCriteria: ["Tests pass"],
		status: "PLANNED",
	},
]

describe("resolveIntentForToolCall", () => {
	it("selects a deterministic fallback instead of returning null on ambiguity", () => {
		const result = resolveIntentForToolCall({
			cwd: "/tmp",
			toolName: "read_file",
			args: {},
			intents,
			intentHintText: "help with software task",
		})

		expect(result.intent).not.toBeNull()
		expect(result.reason.toLowerCase()).not.toContain("ambiguous")
	})

	it("prefers core delivery for write operations in generic catalog", () => {
		const result = resolveIntentForToolCall({
			cwd: "/tmp",
			toolName: "write_to_file",
			args: { path: "src/auth/service.ts" },
			intents,
			intentHintText: "add jwt authentication support",
		})

		expect(result.intent?.id).toBe("INT-GEN-002")
	})
})
