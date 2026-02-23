import fs from "fs/promises"
import path from "path"

import { parse, stringify } from "yaml"

export type IntentStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED"

export interface IntentDefinition {
	id: string
	title: string
	description: string
	scope: string[]
	acceptanceCriteria: string[]
	status: IntentStatus
}

export interface IntentFileShape {
	intents: IntentDefinition[]
}

interface CacheEntry {
	mtimeMs: number
	data: IntentFileShape
}

interface ActiveIntentSelection {
	intent_id: string
	task_id?: string
	updated_at: string
}

const intentCache = new Map<string, CacheEntry>()
const selectedIntentByTask = new Map<string, string>()
const SELECTED_INTENT_SENTINEL_TASK = "__command_context__"
const DEFAULT_INTENT_CATALOG: IntentFileShape = {
	intents: [
		{
			id: "INT-GEN-001",
			title: "Architecture and Planning",
			description: "Define architecture boundaries, contracts, and implementation plan.",
			scope: ["src/**", "docs/**", "*.md"],
			acceptanceCriteria: ["Architecture notes are updated", "Implementation plan is explicit"],
			status: "IN_PROGRESS",
		},
		{
			id: "INT-GEN-002",
			title: "Core Feature Delivery",
			description: "Implement core product behavior in application logic.",
			scope: ["src/**", "app/**", "lib/**"],
			acceptanceCriteria: ["Feature behavior matches request", "Backward compatibility is preserved"],
			status: "PLANNED",
		},
		{
			id: "INT-GEN-003",
			title: "Frontend and UX",
			description: "Implement UI/UX flows, accessibility, and interaction quality.",
			scope: ["web/**", "webview-ui/**", "frontend/**", "ui/**", "src/**/*.tsx", "src/**/*.css"],
			acceptanceCriteria: ["UI flow is usable", "No accessibility regressions in changed UI"],
			status: "PLANNED",
		},
		{
			id: "INT-GEN-004",
			title: "Quality and Verification",
			description: "Add or update tests, lint compliance, and verification routines.",
			scope: ["tests/**", "src/**", ".github/workflows/**", "vitest.*", "jest.*"],
			acceptanceCriteria: ["Relevant tests pass", "Lint/type checks pass for changed scope"],
			status: "PLANNED",
		},
		{
			id: "INT-GEN-005",
			title: "Infrastructure and Delivery",
			description: "Maintain CI/CD, deployment config, and runtime environment behavior.",
			scope: ["infra/**", "deploy/**", "docker/**", ".github/**", "*.yml", "*.yaml"],
			acceptanceCriteria: ["Pipeline config is valid", "Deployment/runtime config remains stable"],
			status: "PLANNED",
		},
		{
			id: "INT-GEN-006",
			title: "Documentation and Onboarding",
			description: "Update docs, setup guides, and developer onboarding materials.",
			scope: ["docs/**", "README.md", "ARCHITECTURE_NOTES.md", ".orchestration/**"],
			acceptanceCriteria: ["Docs reflect implementation changes", "Onboarding steps are reproducible"],
			status: "PLANNED",
		},
	],
}

export class IntentLoadError extends Error {
	constructor(
		public readonly code:
			| "INTENT_FILE_MISSING"
			| "INTENT_YAML_INVALID"
			| "INTENT_SCHEMA_INVALID"
			| "INTENT_NOT_FOUND"
			| "INTENT_TRANSITION_INVALID",
		message: string,
		public readonly details?: Record<string, unknown>,
	) {
		super(message)
	}
}

function filePath(cwd: string): string {
	return path.join(cwd, ".orchestration", "active_intents.yaml")
}

function activeIntentPath(cwd: string): string {
	return path.join(cwd, ".orchestration", "active_intent.json")
}

function normalizeIntent(raw: any): IntentDefinition {
	const rawStatus = String(raw?.status ?? "IN_PROGRESS").toUpperCase()
	const status: IntentStatus =
		rawStatus === "PLANNED" || rawStatus === "IN_PROGRESS" || rawStatus === "COMPLETED"
			? (rawStatus as IntentStatus)
			: "IN_PROGRESS"
	return {
		id: String(raw?.id ?? ""),
		title: String(raw?.title ?? ""),
		description: String(raw?.description ?? ""),
		scope: Array.isArray(raw?.scope)
			? raw.scope.map((v: unknown) => String(v))
			: Array.isArray(raw?.owned_scope)
				? raw.owned_scope.map((v: unknown) => String(v))
				: [],
		acceptanceCriteria: Array.isArray(raw?.acceptanceCriteria)
			? raw.acceptanceCriteria.map((v: unknown) => String(v))
			: Array.isArray(raw?.acceptance_criteria)
				? raw.acceptance_criteria.map((v: unknown) => String(v))
				: [],
		status,
	}
}

function validateIntent(intent: IntentDefinition): boolean {
	return (
		intent.id.length > 0 &&
		intent.title.length > 0 &&
		intent.description.length > 0 &&
		Array.isArray(intent.scope) &&
		intent.scope.length > 0 &&
		Array.isArray(intent.acceptanceCriteria) &&
		["PLANNED", "IN_PROGRESS", "COMPLETED"].includes(intent.status)
	)
}

function validateData(data: any): IntentFileShape {
	const intentsRaw = Array.isArray(data?.intents)
		? data.intents
		: Array.isArray(data?.active_intents)
			? data.active_intents
			: null
	if (!intentsRaw) {
		throw new IntentLoadError(
			"INTENT_SCHEMA_INVALID",
			"Invalid active_intents.yaml: missing intents[] (or active_intents[]).",
		)
	}
	const intents = intentsRaw.map(normalizeIntent)
	if (!intents.every(validateIntent)) {
		throw new IntentLoadError("INTENT_SCHEMA_INVALID", "Invalid active_intents.yaml: malformed intent fields")
	}
	return { intents }
}

export async function loadIntentCatalog(cwd: string): Promise<IntentFileShape> {
	const target = filePath(cwd)
	let stat
	try {
		stat = await fs.stat(target)
	} catch (error: any) {
		if (error?.code === "ENOENT") {
			// Fallback: materialize a bundled default catalog into the active workspace.
			// This keeps governance functional for first-time workspaces without manual setup.
			await ensureIntentCatalogFile(cwd)
			try {
				stat = await fs.stat(target)
			} catch {
				// If write failed (permissions, readonly workspace, etc.), continue with in-memory defaults.
				return DEFAULT_INTENT_CATALOG
			}
		} else {
			throw error
		}
	}

	const cached = intentCache.get(target)
	if (cached && cached.mtimeMs === stat.mtimeMs) {
		return cached.data
	}

	let parsed: any
	try {
		const raw = await fs.readFile(target, "utf-8")
		parsed = parse(raw)
	} catch (error) {
		throw new IntentLoadError("INTENT_YAML_INVALID", "Invalid YAML in active_intents.yaml", {
			path: target,
			error: error instanceof Error ? error.message : String(error),
		})
	}

	const validated = validateData(parsed)
	intentCache.set(target, { mtimeMs: stat.mtimeMs, data: validated })
	return validated
}

async function writeIntentCatalog(cwd: string, catalog: IntentFileShape): Promise<void> {
	const target = filePath(cwd)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.writeFile(target, stringify(catalog), "utf-8")
	const stat = await fs.stat(target)
	intentCache.set(target, { mtimeMs: stat.mtimeMs, data: catalog })
}

async function writeActiveIntentSelection(
	cwd: string,
	intentId: string,
	taskId?: string,
): Promise<ActiveIntentSelection> {
	const target = activeIntentPath(cwd)
	const selection: ActiveIntentSelection = {
		intent_id: intentId,
		task_id: taskId,
		updated_at: new Date().toISOString(),
	}
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.writeFile(target, JSON.stringify(selection, null, 2), "utf-8")
	return selection
}

async function readActiveIntentSelection(cwd: string): Promise<ActiveIntentSelection | null> {
	try {
		const raw = await fs.readFile(activeIntentPath(cwd), "utf-8")
		const parsed = JSON.parse(raw) as ActiveIntentSelection
		if (!parsed || typeof parsed.intent_id !== "string" || parsed.intent_id.length === 0) {
			return null
		}
		return parsed
	} catch (error: any) {
		if (error?.code === "ENOENT" || error instanceof SyntaxError) {
			return null
		}
		throw error
	}
}

export async function selectActiveIntent(taskId: string, cwd: string, intentId: string): Promise<IntentDefinition> {
	const catalog = await loadIntentCatalog(cwd)
	const intent = catalog.intents.find((item) => item.id === intentId)
	if (!intent) {
		throw new IntentLoadError("INTENT_NOT_FOUND", `Intent '${intentId}' does not exist in active_intents.yaml`, {
			intent_id: intentId,
		})
	}
	// Selecting a planned intent starts active execution and must move it to IN_PROGRESS.
	const selectedIntent = intent.status === "PLANNED" ? await updateIntentStatus(cwd, intentId, "IN_PROGRESS") : intent
	selectedIntentByTask.set(taskId, intentId)
	await writeActiveIntentSelection(cwd, intentId, taskId)
	return selectedIntent
}

export async function getSelectedIntent(taskId: string, cwd: string): Promise<IntentDefinition | null> {
	let selectedId = selectedIntentByTask.get(taskId)
	if (!selectedId) {
		const selection = await readActiveIntentSelection(cwd)
		selectedId = selection?.intent_id
		if (selectedId) {
			selectedIntentByTask.set(taskId, selectedId)
		}
	}
	if (!selectedId) {
		return null
	}
	const catalog = await loadIntentCatalog(cwd)
	return catalog.intents.find((item) => item.id === selectedId) ?? null
}

export async function clearSelectedIntent(taskId: string, cwd?: string): Promise<void> {
	selectedIntentByTask.delete(taskId)
	if (cwd) {
		try {
			await fs.unlink(activeIntentPath(cwd))
		} catch (error: any) {
			if (error?.code !== "ENOENT") {
				throw error
			}
		}
	}
}

export function canTransitionIntentStatus(from: IntentStatus, to: IntentStatus): boolean {
	if (from === to) {
		return true
	}
	if (from === "PLANNED" && to === "IN_PROGRESS") {
		return true
	}
	if (from === "IN_PROGRESS" && to === "COMPLETED") {
		return true
	}
	return false
}

export async function updateIntentStatus(cwd: string, intentId: string, to: IntentStatus): Promise<IntentDefinition> {
	const catalog = await loadIntentCatalog(cwd)
	const idx = catalog.intents.findIndex((item) => item.id === intentId)
	if (idx < 0) {
		throw new IntentLoadError("INTENT_NOT_FOUND", `Intent '${intentId}' not found for status update.`)
	}
	const current = catalog.intents[idx]
	if (!canTransitionIntentStatus(current.status, to)) {
		throw new IntentLoadError(
			"INTENT_TRANSITION_INVALID",
			`Illegal intent status transition ${current.status} -> ${to}`,
			{ intent_id: intentId, from: current.status, to },
		)
	}
	const updated: IntentDefinition = { ...current, status: to }
	catalog.intents[idx] = updated
	await writeIntentCatalog(cwd, catalog)
	return updated
}

export async function commandSelectActiveIntent(cwd: string, intentId: string): Promise<IntentDefinition> {
	return selectActiveIntent(SELECTED_INTENT_SENTINEL_TASK, cwd, intentId)
}

export async function commandGetSelectedIntent(cwd: string): Promise<IntentDefinition | null> {
	return getSelectedIntent(SELECTED_INTENT_SENTINEL_TASK, cwd)
}

export async function commandClearSelectedIntent(cwd: string): Promise<void> {
	await clearSelectedIntent(SELECTED_INTENT_SENTINEL_TASK, cwd)
}

export async function ensureIntentCatalogFile(cwd: string): Promise<void> {
	const target = filePath(cwd)
	await fs.mkdir(path.dirname(target), { recursive: true })
	try {
		await fs.access(target)
	} catch (error: any) {
		if (error?.code !== "ENOENT") {
			throw error
		}
		await fs.writeFile(target, stringify(DEFAULT_INTENT_CATALOG), "utf-8")
	}
}
