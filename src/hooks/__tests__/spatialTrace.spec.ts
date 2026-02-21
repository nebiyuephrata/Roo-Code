import { buildSpatialRanges } from "../spatialTrace"

describe("buildSpatialRanges", () => {
	it("returns full-range hash for new files", () => {
		const ranges = buildSpatialRanges(null, "line 1\nline 2\n")
		expect(ranges).toHaveLength(1)
		expect(ranges[0].start_line).toBe(1)
		expect(ranges[0].end_line).toBe(2)
		expect(ranges[0].content_hash.startsWith("sha256:")).toBe(true)
	})

	it("returns only changed ranges for in-place modifications", () => {
		const oldContent = "a\nb\nc\n"
		const newContent = "a\nb2\nc\n"
		const ranges = buildSpatialRanges(oldContent, newContent)
		expect(ranges).toHaveLength(1)
		expect(ranges[0].start_line).toBe(2)
		expect(ranges[0].end_line).toBe(2)
	})

	it("anchors pure deletions to nearest surviving line", () => {
		const oldContent = "a\nb\nc\n"
		const newContent = "a\nc\n"
		const ranges = buildSpatialRanges(oldContent, newContent)
		expect(ranges).toHaveLength(1)
		expect(ranges[0].start_line).toBe(1)
		expect(ranges[0].end_line).toBe(1)
	})
})
