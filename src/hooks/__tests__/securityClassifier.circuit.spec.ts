import {
	canProceed,
	getCircuitBreakerThreshold,
	getFailureCount,
	recordFailure,
	resetFailureCount,
} from "../securityClassifier"

describe("securityClassifier circuit breaker", () => {
	it("opens breaker at threshold and recovers after reset", () => {
		const taskId = "task-circuit-spec"
		resetFailureCount(taskId)

		const threshold = getCircuitBreakerThreshold()
		for (let i = 0; i < threshold; i++) {
			recordFailure(taskId)
		}

		expect(getFailureCount(taskId)).toBe(threshold)
		expect(canProceed(taskId)).toBe(false)

		resetFailureCount(taskId)
		expect(getFailureCount(taskId)).toBe(0)
		expect(canProceed(taskId)).toBe(true)
	})
})
