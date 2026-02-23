import fs from "fs/promises"
import path from "path"

interface IntentFileEntry {
	file: string
	nodes: Set<string>
}

const mapByIntent = new Map<string, Map<string, IntentFileEntry>>()
let hydratedByWorkspace = new Set<string>()

function mapPath(cwd: string): string {
	return path.join(cwd, ".orchestration", "intent_map.md")
}

function renderMarkdown(): string {
	const intents = [...mapByIntent.keys()].sort()
	const lines: string[] = ["# Intent Map", ""]
	for (const intentId of intents) {
		lines.push(`## ${intentId}`)
		const entries = [...(mapByIntent.get(intentId)?.values() ?? [])].sort((a, b) => a.file.localeCompare(b.file))
		for (const entry of entries) {
			lines.push(`- \`${entry.file}\``)
			const nodes = [...entry.nodes].sort()
			if (nodes.length > 0) {
				lines.push(`  - nodes: ${nodes.map((node) => `\`${node}\``).join(", ")}`)
			}
		}
		lines.push("")
	}
	return lines.join("\n")
}

function getOrCreateIntentMap(intentId: string): Map<string, IntentFileEntry> {
	const existing = mapByIntent.get(intentId)
	if (existing) {
		return existing
	}
	const created = new Map<string, IntentFileEntry>()
	mapByIntent.set(intentId, created)
	return created
}

function getOrCreateEntry(intentId: string, filePath: string): IntentFileEntry {
	const intentMap = getOrCreateIntentMap(intentId)
	const existing = intentMap.get(filePath)
	if (existing) {
		return existing
	}
	const created: IntentFileEntry = {
		file: filePath,
		nodes: new Set<string>(),
	}
	intentMap.set(filePath, created)
	return created
}

function extractStructuralNodes(filePath: string, content: string): string[] {
	const ext = path.extname(filePath).toLowerCase()
	const nodes = new Set<string>()
	if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
		for (const match of content.matchAll(
			/\bexport\s+(?:async\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_]\w*)/g,
		)) {
			nodes.add(`export:${match[1]}`)
		}
	}
	if (ext === ".py") {
		for (const match of content.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm)) {
			nodes.add(`def:${match[1]}`)
		}
		for (const match of content.matchAll(/^\s*class\s+([A-Za-z_]\w*)\s*[:(]/gm)) {
			nodes.add(`class:${match[1]}`)
		}
	}
	return [...nodes]
}

async function hydrateFromDisk(cwd: string): Promise<void> {
	if (hydratedByWorkspace.has(cwd)) {
		return
	}
	const target = mapPath(cwd)
	try {
		const raw = await fs.readFile(target, "utf-8")
		let currentIntent: string | null = null
		for (const line of raw.split(/\r?\n/)) {
			const intentHeader = line.match(/^##\s+(.+)$/)
			if (intentHeader) {
				currentIntent = intentHeader[1].trim()
				getOrCreateIntentMap(currentIntent)
				continue
			}
			const fileItem = line.match(/^- \`(.+)\`$/)
			if (fileItem && currentIntent) {
				getOrCreateEntry(currentIntent, fileItem[1].trim())
				continue
			}
			const nodeItem = line.match(/^\s*- nodes:\s+(.+)$/)
			if (nodeItem && currentIntent) {
				const intentMap = mapByIntent.get(currentIntent)
				const lastFile = [...(intentMap?.keys() ?? [])].at(-1)
				if (!lastFile) {
					continue
				}
				const entry = getOrCreateEntry(currentIntent, lastFile)
				for (const node of nodeItem[1].split(",").map((part) => part.trim().replace(/^`|`$/g, ""))) {
					if (node.length > 0) {
						entry.nodes.add(node)
					}
				}
			}
		}
	} catch (error: any) {
		if (error?.code !== "ENOENT") {
			throw error
		}
	}
	hydratedByWorkspace.add(cwd)
}

export async function updateIntentMap(
	cwd: string,
	intentId: string | null,
	filePath: string | undefined,
	content?: string,
): Promise<void> {
	if (!intentId || !filePath) {
		return
	}
	await hydrateFromDisk(cwd)
	const entry = getOrCreateEntry(intentId, filePath)
	if (typeof content === "string" && content.length > 0) {
		for (const node of extractStructuralNodes(filePath, content)) {
			entry.nodes.add(node)
		}
	}
	const target = mapPath(cwd)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.writeFile(target, renderMarkdown(), "utf-8")
}
