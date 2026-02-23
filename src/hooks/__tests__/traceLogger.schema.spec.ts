import { buildTraceRecord, validateTraceRecord } from "../traceLogger"

function validRecord() {
	return buildTraceRecord({
		intent_id: "INT-001",
		tool_name: "write_to_file",
		args_summary: '{"path":"src/a.ts"}',
		args_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		approved: true,
		decision_reason: "Allowed by preToolUse.",
		status: "success",
		duration_ms: 12,
		security_class: "WRITE",
		related: ["INT-001"],
		agent: {
			task_id: "task-1",
		},
		vcs: {
			revision_id: "deadbeef",
			branch: "main",
			commit: "deadbeef",
		},
		files: [
			{
				relative_path: "src/a.ts",
				conversations: [
					{
						url: "task-1",
						contributor: {
							entity_type: "AI",
							model_identifier: "test-model",
						},
						ranges: [
							{
								start_line: 1,
								end_line: 2,
								content_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
							},
						],
						related: [{ type: "specification", value: "INT-001" }],
					},
				],
			},
		],
	})
}

describe("traceLogger schema", () => {
	it("accepts the nested trace schema", () => {
		const record = validRecord()
		expect(() => validateTraceRecord(record)).not.toThrow()
	})

	it("rejects missing vcs.revision_id", () => {
		const record = validRecord()
		;(record.vcs as any).revision_id = ""
		expect(() => validateTraceRecord(record)).toThrow("vcs.revision_id is required.")
	})

	it("rejects invalid conversations[].ranges[] entries", () => {
		const record = validRecord()
		;(record.files[0].conversations[0].ranges[0] as any).start_line = "1"
		expect(() => validateTraceRecord(record)).toThrow("ranges entries must contain integer")
	})

	it("rejects invalid ranges[].content_hash format", () => {
		const record = validRecord()
		record.files[0].conversations[0].ranges[0].content_hash = "abc"
		expect(() => validateTraceRecord(record)).toThrow("ranges[].content_hash")
	})

	it("rejects invalid contributor entity type", () => {
		const record = validRecord()
		;(record.files[0].conversations[0].contributor as any).entity_type = "BOT"
		expect(() => validateTraceRecord(record)).toThrow("conversations entries must contain")
	})

	it("rejects non-uuid trace identifiers", () => {
		const record = validRecord()
		record.id = "not-a-uuid"
		record.trace_id = "not-a-uuid"
		expect(() => validateTraceRecord(record)).toThrow("id must be a UUID v4.")
	})
})
