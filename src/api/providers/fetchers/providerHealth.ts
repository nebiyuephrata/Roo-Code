import axios from "axios"

export type ProviderHealthStatus =
	| "ok"
	| "invalid_base_url"
	| "api_key_missing"
	| "host_not_found"
	| "daemon_unreachable"
	| "request_timeout"
	| "unauthorized"
	| "invalid_response"
	| "request_failed"

export interface ProviderHealthResult {
	status: ProviderHealthStatus
	baseUrl: string
	modelCount: number
	message: string
	httpStatus?: number
}

function normalizeBaseUrl(baseUrl: string | undefined, fallback: string): string {
	const trimmed = (baseUrl || "").trim()
	return trimmed.length > 0 ? trimmed : fallback
}

function modelEndpoint(baseUrl: string): string {
	return `${baseUrl.replace(/\/+$/, "")}/models`
}

function classifyAxiosFailure(error: unknown): {
	status: Exclude<ProviderHealthStatus, "ok" | "api_key_missing" | "invalid_base_url" | "invalid_response">
	httpStatus?: number
	message: string
} {
	const code = (error as { code?: string } | undefined)?.code
	if (code === "ENOTFOUND") {
		return { status: "host_not_found", message: "Host not found for configured base URL." }
	}
	if (code === "ECONNREFUSED") {
		return { status: "daemon_unreachable", message: "Service refused connection at configured base URL." }
	}
	if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
		return { status: "request_timeout", message: "Connection timed out." }
	}

	if (axios.isAxiosError(error)) {
		const httpStatus = error.response?.status
		if (httpStatus === 401 || httpStatus === 403) {
			return { status: "unauthorized", httpStatus, message: "Authentication failed (401/403)." }
		}
		if (typeof httpStatus === "number") {
			return { status: "request_failed", httpStatus, message: `Request failed with status ${httpStatus}.` }
		}
	}

	return { status: "request_failed", message: "Request failed." }
}

export async function probeOpenAiCompatible(
	baseUrl: string | undefined,
	apiKey: string | undefined,
	openAiHeaders?: Record<string, string>,
): Promise<ProviderHealthResult> {
	const resolvedBaseUrl = normalizeBaseUrl(baseUrl, "")
	if (!resolvedBaseUrl || !URL.canParse(resolvedBaseUrl)) {
		return {
			status: "invalid_base_url",
			baseUrl: resolvedBaseUrl,
			modelCount: 0,
			message: "Invalid OpenAI-compatible base URL.",
		}
	}
	if (!apiKey || apiKey.trim().length === 0) {
		return {
			status: "api_key_missing",
			baseUrl: resolvedBaseUrl,
			modelCount: 0,
			message: "API key is required for OpenAI-compatible providers.",
		}
	}

	try {
		const headers: Record<string, string> = {
			...(openAiHeaders || {}),
			Authorization: `Bearer ${apiKey}`,
		}
		const response = await axios.get(modelEndpoint(resolvedBaseUrl), { headers, timeout: 7000 })
		const data = response.data?.data
		if (!Array.isArray(data)) {
			return {
				status: "invalid_response",
				baseUrl: resolvedBaseUrl,
				modelCount: 0,
				httpStatus: response.status,
				message: "Response does not include a valid model list.",
			}
		}
		return {
			status: "ok",
			baseUrl: resolvedBaseUrl,
			modelCount: data.length,
			httpStatus: response.status,
			message: data.length > 0 ? `Connected. ${data.length} models found.` : "Connected, but no models returned.",
		}
	} catch (error) {
		const classified = classifyAxiosFailure(error)
		return {
			status: classified.status,
			baseUrl: resolvedBaseUrl,
			modelCount: 0,
			httpStatus: classified.httpStatus,
			message: classified.message,
		}
	}
}

export async function probeOpenRouter(baseUrl: string | undefined, apiKey?: string): Promise<ProviderHealthResult> {
	const resolvedBaseUrl = normalizeBaseUrl(baseUrl, "https://openrouter.ai/api/v1")
	if (!URL.canParse(resolvedBaseUrl)) {
		return {
			status: "invalid_base_url",
			baseUrl: resolvedBaseUrl,
			modelCount: 0,
			message: "Invalid OpenRouter base URL.",
		}
	}

	try {
		const headers: Record<string, string> = {}
		if (apiKey) {
			headers.Authorization = `Bearer ${apiKey}`
		}
		const response = await axios.get(modelEndpoint(resolvedBaseUrl), { headers, timeout: 7000 })
		const data = response.data?.data
		if (!Array.isArray(data)) {
			return {
				status: "invalid_response",
				baseUrl: resolvedBaseUrl,
				modelCount: 0,
				httpStatus: response.status,
				message: "OpenRouter returned an unexpected response.",
			}
		}
		return {
			status: "ok",
			baseUrl: resolvedBaseUrl,
			modelCount: data.length,
			httpStatus: response.status,
			message: data.length > 0 ? `Connected. ${data.length} models found.` : "Connected, but no models returned.",
		}
	} catch (error) {
		const classified = classifyAxiosFailure(error)
		return {
			status: classified.status,
			baseUrl: resolvedBaseUrl,
			modelCount: 0,
			httpStatus: classified.httpStatus,
			message: classified.message,
		}
	}
}
