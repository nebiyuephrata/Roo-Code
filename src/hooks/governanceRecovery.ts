export type GovernanceRecoveryCause =
	| "MISSING_INTENTS_FILE"
	| "INVALID_INTENTS_SCHEMA"
	| "NO_ACTIVE_INTENT"
	| "STALE_WRITE_COLLISION"
	| "MUTATION_CLASS_MISSING"
	| "MUTATION_CLASS_INVALID"
	| "SCOPE_VIOLATION"
	| "HITL_DENIED"
	| "CIRCUIT_BREAKER_OPEN"
	| "UNKNOWN"

export interface GovernanceRecoveryPlan {
	cause: GovernanceRecoveryCause
	suggestion: string
	safeRerunPrompt: string
	canAutoRerun: boolean
}

function normalizeErrorMessage(value?: string): string {
	return (value ?? "").toLowerCase()
}

export function deriveGovernanceRecoveryPlan(lastErrorMessage?: string): GovernanceRecoveryPlan {
	const error = normalizeErrorMessage(lastErrorMessage)
	if (error.includes("missing .orchestration/active_intents.yaml")) {
		return {
			cause: "MISSING_INTENTS_FILE",
			suggestion: "Initialize governance sidecar files, then retry.",
			safeRerunPrompt:
				"Governance recovery applied. Re-check .orchestration/active_intents.yaml, auto-select the best intent, and continue from the last blocked step.",
			canAutoRerun: true,
		}
	}
	if (error.includes("invalid active_intents.yaml")) {
		return {
			cause: "INVALID_INTENTS_SCHEMA",
			suggestion: "Repair active_intents.yaml schema and ensure intents[] exists.",
			safeRerunPrompt:
				"Governance recovery applied. Validate active_intents.yaml, ensure intents[] is valid, select active intent, and continue safely.",
			canAutoRerun: true,
		}
	}
	if (error.includes("no active intent selected") || error.includes("handshake_required")) {
		return {
			cause: "NO_ACTIVE_INTENT",
			suggestion: "Select an active intent before any tool execution.",
			safeRerunPrompt:
				"Governance recovery applied. First call select_active_intent(intent_id), then retry the previously blocked action.",
			canAutoRerun: true,
		}
	}
	if (error.includes("stale write detected")) {
		return {
			cause: "STALE_WRITE_COLLISION",
			suggestion: "Re-read the file and retry write with latest hash.",
			safeRerunPrompt:
				"Governance recovery applied. Re-read affected files to refresh hashes, then retry the blocked write operation.",
			canAutoRerun: true,
		}
	}
	if (error.includes("missing valid mutation_class")) {
		return {
			cause: "MUTATION_CLASS_MISSING",
			suggestion: "Provide a valid mutation_class for write_to_file.",
			safeRerunPrompt:
				"Governance recovery applied. Retry write_to_file with a valid mutation_class and continue.",
			canAutoRerun: true,
		}
	}
	if (error.includes("invalid mutation_class type")) {
		return {
			cause: "MUTATION_CLASS_INVALID",
			suggestion: "Set mutation_class as a valid string enum value.",
			safeRerunPrompt:
				"Governance recovery applied. Correct mutation_class type and retry the blocked write operation.",
			canAutoRerun: true,
		}
	}
	if (error.includes("is not allowed by intent scope")) {
		return {
			cause: "SCOPE_VIOLATION",
			suggestion: "Edit only files inside active intent scope or expand scope.",
			safeRerunPrompt:
				"Governance recovery applied. Keep edits within intent scope, or request scope expansion before retrying.",
			canAutoRerun: false,
		}
	}
	if (error.includes("sensitive tool denied by human approval")) {
		return {
			cause: "HITL_DENIED",
			suggestion: "Re-run and approve the sensitive action if intended.",
			safeRerunPrompt:
				"Governance recovery applied. Reattempt the blocked sensitive step and await explicit approval.",
			canAutoRerun: false,
		}
	}
	if (error.includes("circuit breaker")) {
		return {
			cause: "CIRCUIT_BREAKER_OPEN",
			suggestion: "Reset circuit breaker and continue from last safe point.",
			safeRerunPrompt:
				"Governance recovery applied. Continue from the last blocked step using safe, scoped operations first.",
			canAutoRerun: true,
		}
	}
	return {
		cause: "UNKNOWN",
		suggestion: "Refresh governance state, verify intent and sidecar files, then retry.",
		safeRerunPrompt:
			"Governance recovery applied. Refresh governance status, verify active intent context, and continue from the last blocked step.",
		canAutoRerun: false,
	}
}
