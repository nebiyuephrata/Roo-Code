import { useCallback, useEffect, useMemo } from "react"
import { ShieldCheck, RefreshCw, RotateCcw, Wrench } from "lucide-react"

import { Button } from "@src/components/ui"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

function formatDate(iso?: string): string {
	if (!iso) {
		return "n/a"
	}
	const parsed = new Date(iso)
	if (Number.isNaN(parsed.getTime())) {
		return "n/a"
	}
	return parsed.toLocaleString()
}

function traceStatusClass(status?: string): string {
	if (status === "success") {
		return "text-emerald-400"
	}
	if (status === "blocked") {
		return "text-amber-400"
	}
	if (status === "failure") {
		return "text-rose-400"
	}
	return "text-vscode-descriptionForeground"
}

export const GovernanceStatusPanel = () => {
	const { governanceStatus, governanceTraceCount } = useExtensionState()
	const activeIntentLabel = useMemo(() => {
		if (!governanceStatus?.activeIntentId) {
			return "No active intent"
		}
		const suffix = governanceStatus.activeIntentStatus ? ` (${governanceStatus.activeIntentStatus})` : ""
		return `${governanceStatus.activeIntentId}${suffix}`
	}, [governanceStatus?.activeIntentId, governanceStatus?.activeIntentStatus])

	const handleRefresh = useCallback(() => {
		vscode.postMessage({ type: "requestGovernanceStatus" })
	}, [])

	const handleResetCircuitBreaker = useCallback(() => {
		vscode.postMessage({ type: "resetGovernanceCircuitBreaker" })
	}, [])

	const handleBootstrapGovernance = useCallback(
		(repair: boolean) => {
			vscode.postMessage({ type: "bootstrapGovernanceFiles", bool: repair })
			handleRefresh()
		},
		[handleRefresh],
	)

	const needsGovernanceBootstrap = useMemo(() => {
		const error = (governanceStatus?.lastErrorMessage ?? "").toLowerCase()
		return (
			!governanceStatus?.activeIntentId ||
			error.includes("active_intents.yaml") ||
			error.includes("missing .orchestration") ||
			error.includes("invalid yaml")
		)
	}, [governanceStatus?.activeIntentId, governanceStatus?.lastErrorMessage])

	useEffect(() => {
		handleRefresh()
	}, [handleRefresh])

	return (
		<div className="px-3 pt-2 pb-1">
			<div className="rounded-xl border border-vscode-input-border bg-vscode-input-background px-3 py-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 text-xs font-semibold text-vscode-descriptionForeground uppercase tracking-wide">
						<ShieldCheck className="size-3.5" />
						Governance
					</div>
					<Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleRefresh}>
						<RefreshCw className="size-3 mr-1" />
						Refresh
					</Button>
				</div>
				<div className="mt-1 text-sm text-vscode-foreground">
					<div>
						<span className="text-vscode-descriptionForeground">Intent:</span> {activeIntentLabel}
					</div>
					{governanceStatus?.circuitBreakerOpen && (
						<div className="mt-1 flex items-center justify-between gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1">
							<div className="text-xs text-amber-300">
								Circuit breaker open ({governanceStatus.circuitBreakerFailureCount ?? 0}/
								{governanceStatus.circuitBreakerThreshold ?? "?"})
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-xs"
								onClick={handleResetCircuitBreaker}>
								<RotateCcw className="size-3 mr-1" />
								Reset
							</Button>
						</div>
					)}
					{governanceStatus?.activeIntentTitle && (
						<div className="text-vscode-descriptionForeground truncate">
							{governanceStatus.activeIntentTitle}
						</div>
					)}
					{needsGovernanceBootstrap && (
						<div className="mt-1 flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-xs"
								onClick={() => handleBootstrapGovernance(false)}>
								<Wrench className="size-3 mr-1" />
								Initialize Governance
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-xs"
								onClick={() => handleBootstrapGovernance(true)}>
								Repair YAML
							</Button>
						</div>
					)}
					<div className="mt-1">
						<span className="text-vscode-descriptionForeground">Last trace:</span>{" "}
						<span className={traceStatusClass(governanceStatus?.lastTraceStatus)}>
							{governanceStatus?.lastTraceStatus ?? "n/a"}
						</span>
						{governanceStatus?.lastToolName ? ` • ${governanceStatus.lastToolName}` : ""}
					</div>
					<div className="text-xs text-vscode-descriptionForeground">
						Trace entries: {typeof governanceTraceCount === "number" ? governanceTraceCount : "n/a"}
					</div>
					<div className="text-xs text-vscode-descriptionForeground">
						{formatDate(governanceStatus?.lastTraceAt)}
					</div>
					{governanceStatus?.lastErrorMessage && (
						<div className="mt-1 text-xs text-vscode-descriptionForeground truncate">
							{governanceStatus.lastErrorMessage}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
