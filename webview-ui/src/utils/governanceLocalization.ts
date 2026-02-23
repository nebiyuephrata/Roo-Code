type Translate = (key: string, options?: Record<string, unknown>) => string

const PATH_SCOPE_REGEX = /^Path '(.+)' is not allowed by intent scope\.$/

export function localizeGovernanceMessage(message: string, t: Translate): string {
	const normalized = message.trim()
	if (!normalized) {
		return normalized
	}

	if (normalized.includes("Circuit breaker triggered after repeated failures.")) {
		return t("chat:governance.messages.circuitBreakerTriggered")
	}
	if (normalized.includes("Missing .orchestration/active_intents.yaml")) {
		return t("chat:governance.messages.missingActiveIntentsYaml")
	}
	if (normalized.includes("Invalid active_intents.yaml: missing intents[]")) {
		return t("chat:governance.messages.invalidActiveIntentsMissingList")
	}
	if (normalized.includes("Invalid active_intents.yaml: malformed intent fields")) {
		return t("chat:governance.messages.invalidActiveIntentsMalformed")
	}
	if (normalized.includes("Sensitive tool denied by human approval.")) {
		return t("chat:governance.messages.sensitiveToolDenied")
	}
	if (normalized.includes("Stale write detected. File changed since read.")) {
		return t("chat:governance.messages.staleWrite")
	}
	if (normalized.includes("write_to_file is missing valid mutation_class.")) {
		return t("chat:governance.messages.missingMutationClass")
	}
	if (normalized.includes("write_to_file has invalid mutation_class type.")) {
		return t("chat:governance.messages.invalidMutationClassType")
	}
	if (normalized.includes("No active intent selected.")) {
		return t("chat:governance.messages.noActiveIntent")
	}

	const scopeMatch = normalized.match(PATH_SCOPE_REGEX)
	if (scopeMatch) {
		return t("chat:governance.messages.scopeViolation", { path: scopeMatch[1] })
	}

	return normalized
}
