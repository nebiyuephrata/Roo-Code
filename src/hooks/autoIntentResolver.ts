import { sanitizeAndNormalizePath, validatePathAgainstScope } from "./scopeValidator"
import type { IntentDefinition } from "./intentLoader"

export interface ResolveIntentInput {
	cwd: string
	toolName: string
	args: Record<string, unknown>
	intents: IntentDefinition[]
	intentHintText?: string
}

export interface ResolveIntentResult {
	intent: IntentDefinition | null
	reason: string
	confidence: number
	candidates: Array<{ id: string; score: number }>
}

const INTENT_BY_GENERIC_PREFIX: Array<{ prefix: string; weight: number }> = [
	{ prefix: "INT-GEN-001", weight: 5 },
	{ prefix: "INT-GEN-002", weight: 20 },
	{ prefix: "INT-GEN-003", weight: 12 },
	{ prefix: "INT-GEN-004", weight: 16 },
	{ prefix: "INT-GEN-005", weight: 10 },
	{ prefix: "INT-GEN-006", weight: 8 },
]

function normalize(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9_\-\s]/g, " ")
}

function tokenize(text: string): Set<string> {
	return new Set(
		normalize(text)
			.split(/\s+/)
			.map((token) => token.trim())
			.filter((token) => token.length > 2),
	)
}

function scoreTokenOverlap(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) {
		return 0
	}
	let overlap = 0
	for (const token of a) {
		if (b.has(token)) {
			overlap++
		}
	}
	const union = new Set([...a, ...b]).size
	if (union === 0) {
		return 0
	}
	return Math.round((overlap / union) * 30)
}

function scorePathMatch(cwd: string, args: Record<string, unknown>, intent: IntentDefinition): number {
	const pathArg = args.path ?? args.file_path
	if (typeof pathArg !== "string" || pathArg.length === 0) {
		return 0
	}
	try {
		const normalized = sanitizeAndNormalizePath(cwd, pathArg)
		validatePathAgainstScope(normalized.relativePath, intent.scope)
		return 40
	} catch {
		return 0
	}
}

function scoreExplicitIntentMention(hintText: string, intentId: string): number {
	return normalize(hintText).includes(normalize(intentId)) ? 60 : 0
}

function scoreIntentFromHint(hintText: string, intent: IntentDefinition): number {
	const hintTokens = tokenize(hintText)
	if (hintTokens.size === 0) {
		return 0
	}
	const intentTokens = tokenize(
		[intent.id, intent.title, intent.description, ...intent.scope, ...intent.acceptanceCriteria].join(" "),
	)
	return scoreTokenOverlap(hintTokens, intentTokens)
}

function scoreGenericIntentByTool(toolName: string, args: Record<string, unknown>, intent: IntentDefinition): number {
	let score = 0
	const normalizedTool = normalize(toolName)
	const targetPath = String(args.path ?? args.file_path ?? "")
	const normalizedPath = normalize(targetPath)

	if (/write|edit|diff|replace|apply/.test(normalizedTool)) {
		if (intent.id.startsWith("INT-GEN-002")) score += 20
		if (intent.id.startsWith("INT-GEN-003") && /(ui|web|frontend|tsx|css|html)/.test(normalizedPath)) score += 12
	}
	if (/test|lint|check/.test(normalizedTool) && intent.id.startsWith("INT-GEN-004")) {
		score += 20
	}
	if (/read|list|search/.test(normalizedTool) && intent.id.startsWith("INT-GEN-001")) {
		score += 8
	}
	if (/command|execute/.test(normalizedTool) && intent.id.startsWith("INT-GEN-005")) {
		score += 10
	}
	if (
		/(readme|docs|architecture_notes|claude\.md|intent_map\.md)/.test(normalizedPath) &&
		intent.id.startsWith("INT-GEN-006")
	) {
		score += 20
	}

	return score
}

function scoreGenericIntentBias(intent: IntentDefinition): number {
	const entry = INTENT_BY_GENERIC_PREFIX.find((item) => intent.id.startsWith(item.prefix))
	return entry?.weight ?? 0
}

function scoreStatus(intent: IntentDefinition): number {
	if (intent.status === "IN_PROGRESS") {
		return 10
	}
	if (intent.status === "PLANNED") {
		return 8
	}
	return -20
}

function pickCandidate(intents: IntentDefinition[]): IntentDefinition[] {
	const active = intents.filter((intent) => intent.status !== "COMPLETED")
	return active.length > 0 ? active : intents
}

export function resolveIntentForToolCall(input: ResolveIntentInput): ResolveIntentResult {
	const candidates = pickCandidate(input.intents)
	if (candidates.length === 0) {
		return { intent: null, reason: "No intents available.", confidence: 0, candidates: [] }
	}
	if (candidates.length === 1) {
		return {
			intent: candidates[0],
			reason: "Single active/planned intent available.",
			confidence: 100,
			candidates: [{ id: candidates[0].id, score: 100 }],
		}
	}

	const hintText = input.intentHintText ?? ""
	const scored = candidates.map((intent) => {
		const explicit = hintText ? scoreExplicitIntentMention(hintText, intent.id) : 0
		const semantic = hintText ? scoreIntentFromHint(hintText, intent) : 0
		const path = scorePathMatch(input.cwd, input.args, intent)
		const writeBias = path > 0 && /write|edit|apply|diff|insert/.test(input.toolName) ? 10 : 0
		const genericToolBias = scoreGenericIntentByTool(input.toolName, input.args, intent)
		const genericCatalogBias = scoreGenericIntentBias(intent)
		const status = scoreStatus(intent)
		const score = explicit + semantic + path + writeBias + genericToolBias + genericCatalogBias + status
		return { intent, score }
	})

	scored.sort((a, b) => b.score - a.score)
	const top = scored[0]
	const second = scored[1]
	const gap = top.score - (second?.score ?? 0)

	const confidence = Math.max(0, Math.min(100, top.score + Math.max(0, gap)))
	const canAutoSelect = top.score >= 25 || gap >= 8
	if (!canAutoSelect && scored.length > 0) {
		return {
			intent: top.intent,
			reason: "Intent selected via deterministic fallback to avoid handshake loop.",
			confidence: Math.max(confidence, 35),
			candidates: scored.map((entry) => ({ id: entry.intent.id, score: entry.score })),
		}
	}

	return {
		intent: top.intent,
		reason: "Intent inferred from prompt/path heuristics.",
		confidence,
		candidates: scored.map((entry) => ({ id: entry.intent.id, score: entry.score })),
	}
}
