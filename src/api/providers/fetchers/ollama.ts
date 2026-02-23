import axios from "axios"
import { ModelInfo, ollamaDefaultModelInfo } from "@roo-code/types"
import { z } from "zod"

const OllamaModelDetailsSchema = z.object({
	family: z.string(),
	families: z.array(z.string()).nullable().optional(),
	format: z.string().optional(),
	parameter_size: z.string(),
	parent_model: z.string().optional(),
	quantization_level: z.string().optional(),
})

const OllamaModelSchema = z.object({
	details: OllamaModelDetailsSchema,
	digest: z.string().optional(),
	model: z.string(),
	modified_at: z.string().optional(),
	name: z.string(),
	size: z.number().optional(),
})

const OllamaModelInfoResponseSchema = z.object({
	modelfile: z.string().optional(),
	parameters: z.string().optional(),
	template: z.string().optional(),
	details: OllamaModelDetailsSchema,
	model_info: z.record(z.string(), z.any()),
	capabilities: z.array(z.string()).optional(),
})

const OllamaModelsResponseSchema = z.object({
	models: z.array(OllamaModelSchema),
})

type OllamaModelsResponse = z.infer<typeof OllamaModelsResponseSchema>

type OllamaModelInfoResponse = z.infer<typeof OllamaModelInfoResponseSchema>

export type OllamaProbeStatus =
	| "ok"
	| "invalid_base_url"
	| "daemon_unreachable"
	| "host_not_found"
	| "unauthorized"
	| "request_timeout"
	| "invalid_response"
	| "request_failed"

export interface OllamaProbeResult {
	status: OllamaProbeStatus
	baseUrl: string
	modelCount: number
	message?: string
	httpStatus?: number
}

export class OllamaFetchError extends Error {
	constructor(
		public readonly status: Exclude<OllamaProbeStatus, "ok">,
		message: string,
		public readonly baseUrl: string,
		public readonly httpStatus?: number,
	) {
		super(message)
	}
}

function normalizeBaseUrl(baseUrl?: string): string {
	return !baseUrl || baseUrl.trim() === "" ? "http://localhost:11434" : baseUrl
}

function buildHeaders(apiKey?: string): Record<string, string> {
	const headers: Record<string, string> = {}
	if (apiKey) {
		headers["Authorization"] = `Bearer ${apiKey}`
	}
	return headers
}

function mapAxiosError(error: unknown, baseUrl: string): OllamaFetchError {
	const maybeCode = (error as { code?: string } | undefined)?.code
	if (maybeCode === "ECONNREFUSED") {
		return new OllamaFetchError("daemon_unreachable", `Failed connecting to Ollama at ${baseUrl}.`, baseUrl)
	}
	if (maybeCode === "ENOTFOUND") {
		return new OllamaFetchError("host_not_found", `Ollama host not found: ${baseUrl}.`, baseUrl)
	}
	if (maybeCode === "ETIMEDOUT" || maybeCode === "ECONNABORTED") {
		return new OllamaFetchError("request_timeout", `Timed out reaching Ollama at ${baseUrl}.`, baseUrl)
	}

	if (axios.isAxiosError(error)) {
		const status = error.response?.status
		if (status === 401 || status === 403) {
			return new OllamaFetchError("unauthorized", `Ollama authentication failed at ${baseUrl}.`, baseUrl, status)
		}
		if (status && status >= 400) {
			return new OllamaFetchError(
				"request_failed",
				`Ollama request failed at ${baseUrl} with status ${status}.`,
				baseUrl,
				status,
			)
		}
	}
	return new OllamaFetchError("request_failed", `Failed to fetch Ollama models from ${baseUrl}.`, baseUrl)
}

export async function probeOllama(baseUrl = "http://localhost:11434", apiKey?: string): Promise<OllamaProbeResult> {
	const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
	if (!URL.canParse(normalizedBaseUrl)) {
		return {
			status: "invalid_base_url",
			baseUrl: normalizedBaseUrl,
			modelCount: 0,
			message: "Invalid Ollama base URL.",
		}
	}

	try {
		const response = await axios.get<OllamaModelsResponse>(`${normalizedBaseUrl}/api/tags`, {
			headers: buildHeaders(apiKey),
			timeout: 6000,
		})
		const parsedResponse = OllamaModelsResponseSchema.safeParse(response.data)
		if (!parsedResponse.success) {
			return {
				status: "invalid_response",
				baseUrl: normalizedBaseUrl,
				modelCount: 0,
				httpStatus: response.status,
				message: "Ollama /api/tags returned an unexpected response format.",
			}
		}
		return {
			status: "ok",
			baseUrl: normalizedBaseUrl,
			modelCount: parsedResponse.data.models.length,
			httpStatus: response.status,
		}
	} catch (error) {
		const mapped = mapAxiosError(error, normalizedBaseUrl)
		return {
			status: mapped.status,
			baseUrl: mapped.baseUrl,
			modelCount: 0,
			httpStatus: mapped.httpStatus,
			message: mapped.message,
		}
	}
}

export const parseOllamaModel = (rawModel: OllamaModelInfoResponse): ModelInfo | null => {
	const contextKey = Object.keys(rawModel.model_info).find((k) => k.includes("context_length"))
	const contextWindow =
		contextKey && typeof rawModel.model_info[contextKey] === "number" ? rawModel.model_info[contextKey] : undefined

	// Some Ollama builds omit capability metadata; treat missing metadata as compatible.
	// If capabilities are explicitly present, still require native tool support.
	const supportsTools = rawModel.capabilities ? rawModel.capabilities.includes("tools") : true
	if (!supportsTools) {
		return null
	}

	const modelInfo: ModelInfo = Object.assign({}, ollamaDefaultModelInfo, {
		description: `Family: ${rawModel.details.family}, Context: ${contextWindow}, Size: ${rawModel.details.parameter_size}`,
		contextWindow: contextWindow || ollamaDefaultModelInfo.contextWindow,
		supportsPromptCache: true,
		supportsImages: rawModel.capabilities?.includes("vision"),
		maxTokens: contextWindow || ollamaDefaultModelInfo.contextWindow,
	})

	return modelInfo
}

export async function getOllamaModels(
	baseUrl = "http://localhost:11434",
	apiKey?: string,
): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}

	// clearing the input can leave an empty string; use the default in that case
	baseUrl = normalizeBaseUrl(baseUrl)

	try {
		if (!URL.canParse(baseUrl)) {
			return models
		}

		const headers = buildHeaders(apiKey)

		const response = await axios.get<OllamaModelsResponse>(`${baseUrl}/api/tags`, { headers, timeout: 6000 })
		const parsedResponse = OllamaModelsResponseSchema.safeParse(response.data)
		let modelInfoPromises = []

		if (parsedResponse.success) {
			for (const ollamaModel of parsedResponse.data.models) {
				modelInfoPromises.push(
					axios
						.post<OllamaModelInfoResponse>(
							`${baseUrl}/api/show`,
							{
								model: ollamaModel.model,
							},
							{ headers, timeout: 6000 },
						)
						.then((ollamaModelInfo) => {
							const parsedInfo = OllamaModelInfoResponseSchema.safeParse(ollamaModelInfo.data)
							if (!parsedInfo.success) {
								return
							}
							const modelInfo = parseOllamaModel(parsedInfo.data)
							// Only include models that support native tools
							if (modelInfo) {
								models[ollamaModel.name] = modelInfo
							}
						})
						.catch(() => undefined),
				)
			}

			await Promise.all(modelInfoPromises)
		} else {
			console.error(`Error parsing Ollama models response: ${JSON.stringify(parsedResponse.error, null, 2)}`)
		}
	} catch (error: any) {
		if (error?.code === "ECONNREFUSED") {
			console.warn(`Failed connecting to Ollama at ${baseUrl}`)
		} else {
			console.error(
				`Error fetching Ollama models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}
	}

	return models
}
