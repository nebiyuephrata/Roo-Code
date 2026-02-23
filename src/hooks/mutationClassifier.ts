import path from "path"

export type SemanticMutationClass = "create" | "modify" | "replace" | "delete" | "AST_REFACTOR" | "INTENT_EVOLUTION"

function stripCommentsAndWhitespace(content: string, ext: string): string {
	let result = content
	if ([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"].includes(ext)) {
		result = result
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/gm, "")
			.replace(/\s+/g, "")
			.replace(/;+/g, "")
			.replace(/,([}\]])/g, "$1")
		return result
	}
	if ([".py", ".rb", ".sh"].includes(ext)) {
		result = result.replace(/#.*$/gm, "").replace(/\s+/g, "")
		return result
	}
	return result.replace(/\s+/g, "")
}

function extractPublicSymbols(content: string, ext: string): Set<string> {
	const symbols = new Set<string>()
	if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
		for (const match of content.matchAll(
			/\bexport\s+(?:async\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_]\w*)/g,
		)) {
			symbols.add(match[1])
		}
		for (const match of content.matchAll(/\bmodule\.exports\.([A-Za-z_]\w*)\s*=/g)) {
			symbols.add(match[1])
		}
	}
	return symbols
}

function extractPublicSignatures(content: string, ext: string): Map<string, string> {
	const signatures = new Map<string, string>()
	if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
		for (const match of content.matchAll(
			/\bexport\s+(?:async\s+)?function\s+([A-Za-z_]\w*)\s*(\([^)]*\))(?:\s*:\s*[^({]+)?/g,
		)) {
			signatures.set(match[1], `function:${match[1]}${match[2].replace(/\s+/g, "")}`)
		}
		for (const match of content.matchAll(
			/\bexport\s+(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
		)) {
			signatures.set(match[1], `arrow:${match[1]}(${match[2].replace(/\s+/g, "")})`)
		}
		for (const match of content.matchAll(/\bexport\s+class\s+([A-Za-z_]\w*)(?:\s+extends\s+([A-Za-z_]\w*))?/g)) {
			signatures.set(match[1], `class:${match[1]}:${match[2] ?? ""}`)
		}
		for (const match of content.matchAll(/\bexport\s+interface\s+([A-Za-z_]\w*)/g)) {
			signatures.set(match[1], `interface:${match[1]}`)
		}
		for (const match of content.matchAll(/\bexport\s+type\s+([A-Za-z_]\w*)\s*=/g)) {
			signatures.set(match[1], `type:${match[1]}`)
		}
	}
	return signatures
}

function hasPublicApiEvolution(oldContent: string, newContent: string, ext: string): boolean {
	const oldSymbols = extractPublicSymbols(oldContent, ext)
	const newSymbols = extractPublicSymbols(newContent, ext)
	for (const symbol of newSymbols) {
		if (!oldSymbols.has(symbol)) {
			return true
		}
	}
	const oldSignatures = extractPublicSignatures(oldContent, ext)
	const newSignatures = extractPublicSignatures(newContent, ext)
	for (const [symbol, signature] of newSignatures) {
		const previous = oldSignatures.get(symbol)
		if (previous && previous !== signature) {
			return true
		}
	}
	return false
}

export function inferSemanticMutationClass(input: {
	filePath: string
	oldContent: string | null
	newContent: string
}): SemanticMutationClass {
	const ext = path.extname(input.filePath).toLowerCase()
	const oldContent = input.oldContent
	const newContent = input.newContent
	if (oldContent === null) {
		return "create"
	}
	if (newContent.length === 0 && oldContent.length > 0) {
		return "delete"
	}

	const oldNormalized = stripCommentsAndWhitespace(oldContent, ext)
	const newNormalized = stripCommentsAndWhitespace(newContent, ext)
	if (oldNormalized === newNormalized && oldContent !== newContent) {
		return "AST_REFACTOR"
	}
	if (hasPublicApiEvolution(oldContent, newContent, ext)) {
		return "INTENT_EVOLUTION"
	}
	if (newContent.length > oldContent.length * 2 || oldContent.length > newContent.length * 2) {
		return "replace"
	}
	return "modify"
}

export function isMutationClassCompatible(provided: string, inferred: SemanticMutationClass): boolean {
	if (provided === inferred) {
		return true
	}
	// Backward compatibility: allow legacy "modify" for semantic refactor/evolution only when strict mode not possible.
	if (provided === "modify" && (inferred === "AST_REFACTOR" || inferred === "INTENT_EVOLUTION")) {
		return false
	}
	return false
}
