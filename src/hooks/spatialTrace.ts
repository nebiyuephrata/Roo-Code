import { diffLines } from "diff"

import { sha256 } from "./concurrencyGuard"

export interface SpatialRangeHash {
	start_line: number
	end_line: number
	content_hash: string
}

function countLines(value: string): number {
	if (!value) {
		return 0
	}
	const normalized = value.replace(/\r\n/g, "\n")
	if (normalized.endsWith("\n")) {
		const trimmed = normalized.slice(0, -1)
		return trimmed.length === 0 ? 1 : trimmed.split("\n").length
	}
	return normalized.split("\n").length
}

function buildRange(start: number, lineCount: number, content: string): SpatialRangeHash {
	const safeStart = Math.max(1, start)
	const safeLines = Math.max(1, lineCount)
	return {
		start_line: safeStart,
		end_line: safeStart + safeLines - 1,
		content_hash: `sha256:${sha256(content)}`,
	}
}

export function buildSpatialRanges(oldContent: string | null, newContent: string): SpatialRangeHash[] {
	if (oldContent === null) {
		return [buildRange(1, Math.max(1, countLines(newContent)), newContent)]
	}
	if (oldContent === newContent) {
		return []
	}

	const ranges: SpatialRangeHash[] = []
	const parts = diffLines(oldContent, newContent)
	let newLine = 1

	for (let i = 0; i < parts.length; i++) {
		const current = parts[i]
		const currentLines = countLines(current.value)

		if (current.added) {
			ranges.push(buildRange(newLine, currentLines, current.value))
			newLine += Math.max(1, currentLines)
			continue
		}

		if (current.removed) {
			const next = parts[i + 1]
			if (next?.added) {
				const nextLines = countLines(next.value)
				ranges.push(buildRange(newLine, nextLines, next.value))
				newLine += Math.max(1, nextLines)
				i += 1
				continue
			}

			const deletionAnchor = Math.max(1, newLine - 1)
			ranges.push(buildRange(deletionAnchor, 1, `__deleted__\n${current.value}`))
			continue
		}

		newLine += currentLines
	}

	return ranges
}
