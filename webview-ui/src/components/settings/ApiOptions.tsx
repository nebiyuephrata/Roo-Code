import React, { memo, useCallback, useEffect, useMemo, useState } from "react"
import { convertHeadersToObject } from "./utils/headers"
import { useDebounce } from "react-use"
import { VSCodeLink, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { ExternalLinkIcon } from "@radix-ui/react-icons"

import {
	type ProviderName,
	type ProviderSettings,
	type ExtensionMessage,
	isRetiredProvider,
	DEFAULT_CONSECUTIVE_MISTAKE_LIMIT,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	litellmDefaultModelId,
	openAiNativeDefaultModelId,
	openAiCodexDefaultModelId,
	anthropicDefaultModelId,
	qwenCodeDefaultModelId,
	geminiDefaultModelId,
	deepSeekDefaultModelId,
	moonshotDefaultModelId,
	mistralDefaultModelId,
	xaiDefaultModelId,
	basetenDefaultModelId,
	bedrockDefaultModelId,
	vertexDefaultModelId,
	sambaNovaDefaultModelId,
	internationalZAiDefaultModelId,
	mainlandZAiDefaultModelId,
	fireworksDefaultModelId,
	rooDefaultModelId,
	vercelAiGatewayDefaultModelId,
	minimaxDefaultModelId,
} from "@roo-code/types"

import {
	getProviderServiceConfig,
	getDefaultModelIdForProvider,
	getStaticModelsForProvider,
	shouldUseGenericModelPicker,
	handleModelChangeSideEffects,
} from "./utils/providerModelConfig"

import { vscode } from "@src/utils/vscode"
import { validateApiConfigurationExcludingModelErrors, getModelValidationError } from "@src/utils/validate"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useRouterModels } from "@src/components/ui/hooks/useRouterModels"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import {
	useOpenRouterModelProviders,
	OPENROUTER_DEFAULT_PROVIDER_NAME,
} from "@src/components/ui/hooks/useOpenRouterModelProviders"
import { filterProviders, filterModels } from "./utils/organizationFilters"
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
	SearchableSelect,
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
	Button,
} from "@src/components/ui"

import {
	Anthropic,
	Baseten,
	Bedrock,
	DeepSeek,
	Gemini,
	LMStudio,
	LiteLLM,
	Mistral,
	Moonshot,
	Ollama,
	OpenAI,
	OpenAICompatible,
	OpenAICodex,
	OpenRouter,
	QwenCode,
	Requesty,
	Roo,
	SambaNova,
	Vertex,
	VSCodeLM,
	XAI,
	ZAi,
	Fireworks,
	VercelAiGateway,
	MiniMax,
} from "./providers"

import { MODELS_BY_PROVIDER, PROVIDERS } from "./constants"
import { inputEventTransform, noTransform } from "./transforms"
import { ModelPicker } from "./ModelPicker"
import { ApiErrorMessage } from "./ApiErrorMessage"
import { ThinkingBudget } from "./ThinkingBudget"
import { Verbosity } from "./Verbosity"
import { TodoListSettingsControl } from "./TodoListSettingsControl"
import { TemperatureControl } from "./TemperatureControl"
import { RateLimitSecondsControl } from "./RateLimitSecondsControl"
import { ConsecutiveMistakeLimitControl } from "./ConsecutiveMistakeLimitControl"
import { BedrockCustomArn } from "./providers/BedrockCustomArn"
import { RooBalanceDisplay } from "./providers/RooBalanceDisplay"
import { buildDocLink } from "@src/utils/docLinks"
import { BookOpenText } from "lucide-react"
import { copyToClipboard } from "@src/utils/clipboard"

type OllamaHealthStatus =
	| "ok"
	| "empty_models"
	| "invalid_base_url"
	| "daemon_unreachable"
	| "host_not_found"
	| "unauthorized"
	| "request_timeout"
	| "invalid_response"
	| "request_failed"

interface OllamaHealthInfo {
	status: OllamaHealthStatus
	baseUrl?: string
	message?: string
	modelCount?: number
	httpStatus?: number
}

interface ProviderHealthInfo {
	status?: string
	message?: string
	baseUrl?: string
	httpStatus?: number
	modelCount?: number
}

function getQuickApiKeyField(provider?: string): keyof ProviderSettings | undefined {
	switch (provider) {
		case "anthropic":
			return "apiKey"
		case "openrouter":
			return "openRouterApiKey"
		case "openai":
			return "openAiApiKey"
		case "openai-native":
			return "openAiNativeApiKey"
		case "mistral":
			return "mistralApiKey"
		case "deepseek":
			return "deepSeekApiKey"
		case "gemini":
			return "geminiApiKey"
		case "moonshot":
			return "moonshotApiKey"
		case "minimax":
			return "minimaxApiKey"
		case "requesty":
			return "requestyApiKey"
		case "xai":
			return "xaiApiKey"
		case "litellm":
			return "litellmApiKey"
		case "sambanova":
			return "sambaNovaApiKey"
		case "zai":
			return "zaiApiKey"
		case "fireworks":
			return "fireworksApiKey"
		case "roo":
			return "rooApiKey"
		case "vercel-ai-gateway":
			return "vercelAiGatewayApiKey"
		case "baseten":
			return "basetenApiKey"
		case "ollama":
			return "ollamaApiKey"
		default:
			return undefined
	}
}

export interface ApiOptionsProps {
	uriScheme: string | undefined
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	fromWelcomeView?: boolean
	errorMessage: string | undefined
	setErrorMessage: React.Dispatch<React.SetStateAction<string | undefined>>
}

const ApiOptions = ({
	uriScheme,
	apiConfiguration,
	setApiConfigurationField,
	fromWelcomeView,
	errorMessage,
	setErrorMessage,
}: ApiOptionsProps) => {
	const { t } = useAppTranslation()
	const { organizationAllowList, cloudIsAuthenticated, openAiCodexIsAuthenticated } = useExtensionState()

	const [customHeaders, setCustomHeaders] = useState<[string, string][]>(() => {
		const headers = apiConfiguration?.openAiHeaders || {}
		return Object.entries(headers)
	})

	useEffect(() => {
		const propHeaders = apiConfiguration?.openAiHeaders || {}

		if (JSON.stringify(customHeaders) !== JSON.stringify(Object.entries(propHeaders))) {
			setCustomHeaders(Object.entries(propHeaders))
		}
	}, [apiConfiguration?.openAiHeaders, customHeaders])

	// Helper to convert array of tuples to object (filtering out empty keys).

	// Debounced effect to update the main configuration when local
	// customHeaders state stabilizes.
	useDebounce(
		() => {
			const currentConfigHeaders = apiConfiguration?.openAiHeaders || {}
			const newHeadersObject = convertHeadersToObject(customHeaders)

			// Only update if the processed object is different from the current config.
			if (JSON.stringify(currentConfigHeaders) !== JSON.stringify(newHeadersObject)) {
				setApiConfigurationField("openAiHeaders", newHeadersObject, false)
			}
		},
		300,
		[customHeaders, apiConfiguration?.openAiHeaders, setApiConfigurationField],
	)

	const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false)

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const {
		provider: selectedProvider,
		id: selectedModelId,
		info: selectedModelInfo,
	} = useSelectedModel(apiConfiguration)
	const activeSelectedProvider: ProviderName | undefined = isRetiredProvider(selectedProvider)
		? undefined
		: selectedProvider
	const isRetiredSelectedProvider =
		typeof apiConfiguration.apiProvider === "string" && isRetiredProvider(apiConfiguration.apiProvider)
	const quickApiKeyField = getQuickApiKeyField(activeSelectedProvider ?? selectedProvider)
	const [connectionTest, setConnectionTest] = useState<{
		status: "idle" | "pending" | "success" | "error"
		message?: string
	}>({ status: "idle" })
	const [ollamaModelCount, setOllamaModelCount] = useState<number | null>(null)
	const [ollamaHealth, setOllamaHealth] = useState<OllamaHealthInfo | null>(null)

	const { data: routerModels, refetch: refetchRouterModels } = useRouterModels()
	const showOllamaEmptyState = selectedProvider === "ollama" && ollamaModelCount === 0

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = event.data as ExtensionMessage
			if (!message || typeof message !== "object") return
			if (message.type === "ollamaModels") {
				setOllamaModelCount(Object.keys(message.ollamaModels ?? {}).length)
				const values = message.values as Partial<OllamaHealthInfo> | undefined
				if (values?.status) {
					setOllamaHealth({
						status: values.status,
						baseUrl: values.baseUrl,
						message: values.message,
						modelCount: values.modelCount,
						httpStatus: values.httpStatus,
					})
				}
			}
		}
		window.addEventListener("message", onMessage)
		return () => window.removeEventListener("message", onMessage)
	}, [])

	useEffect(() => {
		setConnectionTest({ status: "idle" })
	}, [selectedProvider])

	const runConnectionTest = useCallback(() => {
		const provider = selectedProvider

		if (provider === "openai") {
			if (!apiConfiguration?.openAiBaseUrl || !apiConfiguration?.openAiApiKey) {
				setConnectionTest({
					status: "error",
					message: "OpenAI base URL and API key are required to test.",
				})
				return
			}
		}

		if (provider === "openai-codex") {
			setConnectionTest({
				status: "error",
				message: "OpenAI Codex connection testing is not supported here yet.",
			})
			return
		}

		setConnectionTest({ status: "pending", message: "Testing connection..." })

		const handler = (event: MessageEvent) => {
			const message = event.data as ExtensionMessage
			if (!message || typeof message !== "object") return

			switch (message.type) {
				case "openAiModels":
					if (provider === "openai") {
						const details = (message.values as ProviderHealthInfo | undefined) ?? {}
						if (details.status && details.status !== "ok") {
							finish("error", details.message || `OpenAI connection check failed (${details.status}).`)
							return
						}
						const count = Array.isArray(message.openAiModels) ? message.openAiModels.length : 0
						if (count > 0) {
							finish("success", `Connected. ${count} model${count === 1 ? "" : "s"} found.`)
						} else {
							finish(
								"error",
								details.message ||
									"Connected, but no models were returned by the OpenAI-compatible endpoint.",
							)
						}
					}
					break
				case "routerModels": {
					const msgProvider = message?.values?.provider as string | undefined
					if (msgProvider !== provider) {
						return
					}
					const providerModels = message.routerModels?.[provider as keyof typeof message.routerModels] || {}
					const count = Object.keys(providerModels).length
					if (count > 0) {
						finish("success", `Connected. ${count} model${count === 1 ? "" : "s"} found.`)
					} else {
						finish("error", "Connected, but no models were returned.")
					}
					break
				}
				case "singleRouterModelFetchResponse": {
					const msgProvider = message?.values?.provider as string | undefined
					if (msgProvider !== provider || message.success !== false) {
						return
					}
					const health = message.values as ProviderHealthInfo | undefined
					if (health?.status) {
						finish("error", health.message || `${provider} connection check failed (${health.status}).`)
					} else {
						finish("error", message.error || "Failed to fetch models.")
					}
					break
				}
				case "ollamaModels":
					if (provider === "ollama") {
						const count = Object.keys(message.ollamaModels ?? {}).length
						const status = (message.values as Partial<OllamaHealthInfo> | undefined)?.status
						if (status && status !== "ok" && status !== "empty_models") {
							finish(
								"error",
								(message.values as Partial<OllamaHealthInfo>)?.message ||
									"Failed to reach Ollama daemon.",
							)
						} else if (count > 0) {
							finish("success", `Connected. ${count} model${count === 1 ? "" : "s"} found.`)
						} else {
							finish("error", "Connected to Ollama, but no models were returned.")
						}
					}
					break
				case "lmStudioModels":
					if (provider === "lmstudio") {
						const count = Object.keys(message.lmStudioModels ?? {}).length
						finish("success", `Connected. ${count} model${count === 1 ? "" : "s"} found.`)
					}
					break
				case "vsCodeLmModels":
					if (provider === "vscode-lm") {
						const count = Object.keys(message.vsCodeLmModels ?? {}).length
						finish("success", `Connected. ${count} model${count === 1 ? "" : "s"} found.`)
					}
					break
			}
		}

		const timeoutId = setTimeout(() => {
			finish("error", "Connection test timed out.")
		}, 8000)
		const cleanup = () => {
			clearTimeout(timeoutId)
			window.removeEventListener("message", handler)
		}
		const finish = (status: "success" | "error", message: string) => {
			cleanup()
			setConnectionTest({ status, message })
		}

		window.addEventListener("message", handler)

		if (provider === "openai") {
			const headerObject = convertHeadersToObject(customHeaders)
			vscode.postMessage({
				type: "requestOpenAiModels",
				values: {
					baseUrl: apiConfiguration?.openAiBaseUrl,
					apiKey: apiConfiguration?.openAiApiKey,
					customHeaders: {},
					openAiHeaders: headerObject,
				},
			})
			return
		}

		if (provider === "ollama") {
			vscode.postMessage({ type: "requestOllamaModels" })
			return
		}
		if (provider === "lmstudio") {
			vscode.postMessage({ type: "requestLmStudioModels" })
			return
		}
		if (provider === "vscode-lm") {
			vscode.postMessage({ type: "requestVsCodeLmModels" })
			return
		}

		vscode.postMessage({ type: "requestRouterModels", values: { provider, refresh: true } })
	}, [apiConfiguration, customHeaders, selectedProvider])
	const connectionTestMessageClass =
		connectionTest.status === "error" ? "text-vscode-errorForeground" : "text-vscode-descriptionForeground"
	const providerBaseUrl = (() => {
		switch (selectedProvider) {
			case "ollama":
				return apiConfiguration?.ollamaBaseUrl
			case "lmstudio":
				return apiConfiguration?.lmStudioBaseUrl
			case "openai":
				return apiConfiguration?.openAiBaseUrl
			case "openrouter":
				return apiConfiguration?.openRouterBaseUrl
			case "requesty":
				return apiConfiguration?.requestyBaseUrl
			case "litellm":
				return apiConfiguration?.litellmBaseUrl
			default:
				return undefined
		}
	})()
	const ensureOllamaDefaults = useCallback(() => {
		setApiConfigurationField("apiProvider", "ollama")
		if (!apiConfiguration.ollamaBaseUrl) {
			setApiConfigurationField("ollamaBaseUrl", "http://localhost:11434")
		}
		if (!apiConfiguration.ollamaModelId) {
			setApiConfigurationField("ollamaModelId", "llama3:latest")
		}
		vscode.postMessage({ type: "requestOllamaModels" })
	}, [apiConfiguration.ollamaBaseUrl, apiConfiguration.ollamaModelId, setApiConfigurationField])
	const ollamaRecoveryCommand = (() => {
		const baseUrl = apiConfiguration.ollamaBaseUrl || "http://localhost:11434"
		return `curl -s ${baseUrl}/api/tags`
	})()
	const ollamaStatusText = (() => {
		if (!showOllamaEmptyState && !ollamaHealth) {
			return null
		}
		if (!ollamaHealth) {
			return "No Ollama models found. Start the daemon and pull a model, then refresh."
		}
		switch (ollamaHealth.status) {
			case "daemon_unreachable":
				return `Ollama daemon is not reachable at ${ollamaHealth.baseUrl || "the configured base URL"}.`
			case "host_not_found":
				return `Ollama host not found: ${ollamaHealth.baseUrl || "configured URL"}.`
			case "invalid_base_url":
				return "Ollama base URL is invalid. Use http://localhost:11434 or http://127.0.0.1:11434."
			case "unauthorized":
				return "Ollama rejected authentication. Check your Ollama API key."
			case "request_timeout":
				return "Timed out while contacting Ollama. Verify daemon health and network."
			case "invalid_response":
				return "Ollama returned an unexpected response from /api/tags."
			case "request_failed":
				return ollamaHealth.message || "Failed to fetch Ollama models."
			case "empty_models":
				return "Connected to Ollama, but no models are installed. Run `ollama pull llama3` and refresh."
			default:
				return "No Ollama models found. Start the daemon and pull a model, then refresh."
		}
	})()

	const { data: openRouterModelProviders } = useOpenRouterModelProviders(
		apiConfiguration?.openRouterModelId,
		apiConfiguration?.openRouterBaseUrl,
		{
			enabled:
				!!apiConfiguration?.openRouterModelId &&
				routerModels?.openrouter &&
				Object.keys(routerModels.openrouter).length > 1 &&
				apiConfiguration.openRouterModelId in routerModels.openrouter,
		},
	)

	// Update `apiModelId` whenever `selectedModelId` changes.
	useEffect(() => {
		if (isRetiredSelectedProvider) {
			return
		}

		if (selectedModelId && apiConfiguration.apiModelId !== selectedModelId) {
			// Pass false as third parameter to indicate this is not a user action
			// This is an internal sync, not a user-initiated change
			setApiConfigurationField("apiModelId", selectedModelId, false)
		}
	}, [selectedModelId, setApiConfigurationField, apiConfiguration.apiModelId, isRetiredSelectedProvider])

	// Debounced refresh model updates, only executed 250ms after the user
	// stops typing.
	useDebounce(
		() => {
			if (selectedProvider === "openai") {
				// Use our custom headers state to build the headers object.
				const headerObject = convertHeadersToObject(customHeaders)

				vscode.postMessage({
					type: "requestOpenAiModels",
					values: {
						baseUrl: apiConfiguration?.openAiBaseUrl,
						apiKey: apiConfiguration?.openAiApiKey,
						customHeaders: {}, // Reserved for any additional headers.
						openAiHeaders: headerObject,
					},
				})
			} else if (selectedProvider === "ollama") {
				vscode.postMessage({ type: "requestOllamaModels" })
			} else if (selectedProvider === "lmstudio") {
				vscode.postMessage({ type: "requestLmStudioModels" })
			} else if (selectedProvider === "vscode-lm") {
				vscode.postMessage({ type: "requestVsCodeLmModels" })
			} else if (selectedProvider === "litellm" || selectedProvider === "roo") {
				vscode.postMessage({ type: "requestRouterModels" })
			}
		},
		250,
		[
			selectedProvider,
			apiConfiguration?.requestyApiKey,
			apiConfiguration?.openAiBaseUrl,
			apiConfiguration?.openAiApiKey,
			apiConfiguration?.ollamaBaseUrl,
			apiConfiguration?.lmStudioBaseUrl,
			apiConfiguration?.litellmBaseUrl,
			apiConfiguration?.litellmApiKey,
			customHeaders,
		],
	)

	useEffect(() => {
		if (isRetiredSelectedProvider) {
			setErrorMessage(undefined)
			return
		}

		const apiValidationResult = validateApiConfigurationExcludingModelErrors(
			apiConfiguration,
			routerModels,
			organizationAllowList,
		)
		setErrorMessage(apiValidationResult)
	}, [apiConfiguration, routerModels, organizationAllowList, setErrorMessage, isRetiredSelectedProvider])

	const onProviderChange = useCallback(
		(value: ProviderName) => {
			setApiConfigurationField("apiProvider", value)

			// It would be much easier to have a single attribute that stores
			// the modelId, but we have a separate attribute for each of
			// OpenRouter and Requesty.
			// If you switch to one of these providers and the corresponding
			// modelId is not set then you immediately end up in an error state.
			// To address that we set the modelId to the default value for th
			// provider if it's not already set.
			const validateAndResetModel = (
				provider: ProviderName,
				modelId: string | undefined,
				field: keyof ProviderSettings,
				defaultValue?: string,
			) => {
				// in case we haven't set a default value for a provider
				if (!defaultValue) return

				// 1) If nothing is set, initialize to the provider default.
				if (!modelId) {
					setApiConfigurationField(field, defaultValue, false)
					return
				}

				// 2) If something *is* set, ensure it's valid for the newly selected provider.
				//
				// Without this, switching providers can leave the UI showing a model from the
				// previously selected provider (including model IDs that don't exist for the
				// newly selected provider).
				//
				// Note: We only validate providers with static model lists.
				const staticModels = MODELS_BY_PROVIDER[provider]
				if (!staticModels) {
					return
				}

				// Bedrock has a special “custom-arn” pseudo-model that isn't part of MODELS_BY_PROVIDER.
				if (provider === "bedrock" && modelId === "custom-arn") {
					return
				}

				const filteredModels = filterModels(staticModels, provider, organizationAllowList)
				const isValidModel = !!filteredModels && Object.prototype.hasOwnProperty.call(filteredModels, modelId)
				if (!isValidModel) {
					setApiConfigurationField(field, defaultValue, false)
				}
			}

			// Define a mapping object that associates each provider with its model configuration
			const PROVIDER_MODEL_CONFIG: Partial<
				Record<
					ProviderName,
					{
						field: keyof ProviderSettings
						default?: string
					}
				>
			> = {
				openrouter: { field: "openRouterModelId", default: openRouterDefaultModelId },
				requesty: { field: "requestyModelId", default: requestyDefaultModelId },
				litellm: { field: "litellmModelId", default: litellmDefaultModelId },
				anthropic: { field: "apiModelId", default: anthropicDefaultModelId },
				"openai-codex": { field: "apiModelId", default: openAiCodexDefaultModelId },
				"qwen-code": { field: "apiModelId", default: qwenCodeDefaultModelId },
				"openai-native": { field: "apiModelId", default: openAiNativeDefaultModelId },
				gemini: { field: "apiModelId", default: geminiDefaultModelId },
				deepseek: { field: "apiModelId", default: deepSeekDefaultModelId },
				moonshot: { field: "apiModelId", default: moonshotDefaultModelId },
				minimax: { field: "apiModelId", default: minimaxDefaultModelId },
				mistral: { field: "apiModelId", default: mistralDefaultModelId },
				xai: { field: "apiModelId", default: xaiDefaultModelId },
				baseten: { field: "apiModelId", default: basetenDefaultModelId },
				bedrock: { field: "apiModelId", default: bedrockDefaultModelId },
				vertex: { field: "apiModelId", default: vertexDefaultModelId },
				sambanova: { field: "apiModelId", default: sambaNovaDefaultModelId },
				zai: {
					field: "apiModelId",
					default:
						apiConfiguration.zaiApiLine === "china_coding"
							? mainlandZAiDefaultModelId
							: internationalZAiDefaultModelId,
				},
				fireworks: { field: "apiModelId", default: fireworksDefaultModelId },
				roo: { field: "apiModelId", default: rooDefaultModelId },
				"vercel-ai-gateway": { field: "vercelAiGatewayModelId", default: vercelAiGatewayDefaultModelId },
				openai: { field: "openAiModelId" },
				ollama: { field: "ollamaModelId" },
				lmstudio: { field: "lmStudioModelId" },
			}

			const config = PROVIDER_MODEL_CONFIG[value]
			if (config) {
				validateAndResetModel(
					value,
					apiConfiguration[config.field] as string | undefined,
					config.field,
					config.default,
				)
			}
		},
		[setApiConfigurationField, apiConfiguration, organizationAllowList],
	)

	const modelValidationError = useMemo(() => {
		return getModelValidationError(apiConfiguration, routerModels, organizationAllowList)
	}, [apiConfiguration, routerModels, organizationAllowList])

	const docs = useMemo(() => {
		const provider = PROVIDERS.find(({ value }) => value === selectedProvider)
		const name = provider?.label

		if (!name) {
			return undefined
		}

		// Get the URL slug - use custom mapping if available, otherwise use the provider key.
		const slugs: Record<string, string> = {
			"openai-native": "openai",
			openai: "openai-compatible",
		}

		const slug = slugs[selectedProvider] || selectedProvider
		return {
			url: buildDocLink(`providers/${slug}`, "provider_docs"),
			name,
		}
	}, [selectedProvider])

	// Convert providers to SearchableSelect options
	const providerOptions = useMemo(() => {
		// First filter by organization allow list
		const allowedProviders = filterProviders(PROVIDERS, organizationAllowList)

		// Then filter out static providers that have no models (unless currently selected)
		const providersWithModels = allowedProviders.filter(({ value }) => {
			// Always show the currently selected provider to avoid breaking existing configurations
			// Use apiConfiguration.apiProvider directly since that's what's actually selected
			if (value === apiConfiguration.apiProvider) {
				return true
			}

			// Check if this is a static provider (has models in MODELS_BY_PROVIDER)
			const staticModels = MODELS_BY_PROVIDER[value as ProviderName]

			// If it's a static provider, check if it has any models after filtering
			if (staticModels) {
				const filteredModels = filterModels(staticModels, value as ProviderName, organizationAllowList)
				// Hide the provider if it has no models after filtering
				return filteredModels && Object.keys(filteredModels).length > 0
			}

			// If it's a dynamic provider (not in MODELS_BY_PROVIDER), always show it
			// to avoid race conditions with async model fetching
			return true
		})

		const options = providersWithModels.map(({ value, label }) => ({
			value,
			label,
		}))

		// Pin "roo" to the top if not on welcome screen
		if (!fromWelcomeView) {
			const rooIndex = options.findIndex((opt) => opt.value === "roo")
			if (rooIndex > 0) {
				const [rooOption] = options.splice(rooIndex, 1)
				options.unshift(rooOption)
			}
		} else {
			// Filter out roo from the welcome view
			const filteredOptions = options.filter((opt) => opt.value !== "roo")
			options.length = 0
			options.push(...filteredOptions)

			const openRouterIndex = options.findIndex((opt) => opt.value === "openrouter")
			if (openRouterIndex > 0) {
				const [openRouterOption] = options.splice(openRouterIndex, 1)
				options.unshift(openRouterOption)
			}
		}

		return options
	}, [organizationAllowList, apiConfiguration.apiProvider, fromWelcomeView])

	return (
		<div className="flex flex-col gap-3">
			<div className="rounded-md border border-vscode-panel-border px-3 py-2">
				<div className="text-xs font-semibold uppercase text-vscode-descriptionForeground">Quick setup</div>
				<div className="mt-2 flex flex-wrap gap-2">
					<Button variant="secondary" size="sm" onClick={ensureOllamaDefaults}>
						Use Ollama (Local)
					</Button>
					<Button variant="secondary" size="sm" onClick={ensureOllamaDefaults}>
						Use llama3 Defaults
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => {
							setApiConfigurationField("apiProvider", "openai")
						}}>
						Use OpenAI-Compatible
					</Button>
				</div>
				<div className="mt-2 text-xs text-vscode-descriptionForeground">
					Ollama requires a local daemon and at least one model installed (e.g. run `ollama serve` and `ollama
					pull llama3`).
				</div>
				{selectedProvider === "ollama" && !apiConfiguration.ollamaModelId && (
					<div className="mt-2 text-xs text-vscode-errorForeground">
						No Ollama model selected. Set `ollamaModelId` (recommended: `llama3:latest`).
					</div>
				)}
				{showOllamaEmptyState && (
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-vscode-errorForeground">
						<span>{ollamaStatusText}</span>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => vscode.postMessage({ type: "requestOllamaModels" })}>
							Refresh Ollama Models
						</Button>
						<Button variant="secondary" size="sm" onClick={() => copyToClipboard(ollamaRecoveryCommand)}>
							Copy Health Check
						</Button>
						{(apiConfiguration.ollamaBaseUrl || "").includes("localhost") && (
							<Button
								variant="secondary"
								size="sm"
								onClick={() => setApiConfigurationField("ollamaBaseUrl", "http://127.0.0.1:11434")}>
								Use 127.0.0.1
							</Button>
						)}
						{(apiConfiguration.ollamaBaseUrl || "").includes("127.0.0.1") && (
							<Button
								variant="secondary"
								size="sm"
								onClick={() => setApiConfigurationField("ollamaBaseUrl", "http://localhost:11434")}>
								Use localhost
							</Button>
						)}
					</div>
				)}
				<div className="mt-3">
					{quickApiKeyField ? (
						<VSCodeTextField
							value={(apiConfiguration as Record<string, string | undefined>)[quickApiKeyField] || ""}
							type="password"
							onInput={handleInputChange(quickApiKeyField)}
							placeholder={t("settings:placeholders.apiKey")}
							className="w-full">
							<label className="block font-medium mb-1">Quick API Key</label>
							<div className="text-xs text-vscode-descriptionForeground mt-1">
								Sets the API key for the currently selected provider.
							</div>
						</VSCodeTextField>
					) : (
						<div className="text-xs text-vscode-descriptionForeground">
							Selected provider does not require an API key.
						</div>
					)}
				</div>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={runConnectionTest}
						disabled={connectionTest.status === "pending"}>
						{connectionTest.status === "pending" ? "Testing..." : "Test Connection"}
					</Button>
					{connectionTest.status !== "idle" && (
						<span className={`text-xs ${connectionTestMessageClass}`}>
							{connectionTest.message || "Connection test complete."}
						</span>
					)}
				</div>
				<div className="mt-2 text-xs text-vscode-descriptionForeground">
					Provider: {selectedProvider}
					{providerBaseUrl ? ` • Base URL: ${providerBaseUrl}` : ""}
				</div>
			</div>
			<div className="flex flex-col gap-1 relative">
				<div className="flex justify-between items-center">
					<label className="block font-medium">{t("settings:providers.apiProvider")}</label>
					{selectedProvider === "roo" && cloudIsAuthenticated ? (
						<RooBalanceDisplay />
					) : (
						docs && (
							<VSCodeLink href={docs.url} target="_blank" className="flex gap-2">
								{t("settings:providers.apiProviderDocs")}
								<BookOpenText className="size-4 inline ml-2" />
							</VSCodeLink>
						)
					)}
				</div>
				<SearchableSelect
					value={selectedProvider}
					onValueChange={(value) => onProviderChange(value as ProviderName)}
					options={providerOptions}
					placeholder={t("settings:common.select")}
					searchPlaceholder={t("settings:providers.searchProviderPlaceholder")}
					emptyMessage={t("settings:providers.noProviderMatchFound")}
					className="w-full"
					data-testid="provider-select"
				/>
			</div>

			{errorMessage && <ApiErrorMessage errorMessage={errorMessage} />}

			{isRetiredSelectedProvider ? (
				<div
					className="rounded-md border border-vscode-panel-border px-3 py-2 text-sm text-vscode-descriptionForeground"
					data-testid="retired-provider-message">
					{t("settings:providers.retiredProviderMessage")}
				</div>
			) : (
				<>
					{selectedProvider === "openrouter" && (
						<OpenRouter
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							routerModels={routerModels}
							selectedModelId={selectedModelId}
							uriScheme={uriScheme}
							simplifySettings={fromWelcomeView}
							organizationAllowList={organizationAllowList}
							modelValidationError={modelValidationError}
						/>
					)}

					{selectedProvider === "requesty" && (
						<Requesty
							uriScheme={uriScheme}
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							routerModels={routerModels}
							refetchRouterModels={refetchRouterModels}
							organizationAllowList={organizationAllowList}
							modelValidationError={modelValidationError}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "anthropic" && (
						<Anthropic
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "openai-codex" && (
						<OpenAICodex
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							simplifySettings={fromWelcomeView}
							openAiCodexIsAuthenticated={openAiCodexIsAuthenticated}
						/>
					)}

					{selectedProvider === "openai-native" && (
						<OpenAI
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							selectedModelInfo={selectedModelInfo}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "mistral" && (
						<Mistral
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "baseten" && (
						<Baseten
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "bedrock" && (
						<Bedrock
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							selectedModelInfo={selectedModelInfo}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "vertex" && (
						<Vertex
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{selectedProvider === "gemini" && (
						<Gemini
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{selectedProvider === "openai" && (
						<OpenAICompatible
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							organizationAllowList={organizationAllowList}
							modelValidationError={modelValidationError}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "lmstudio" && (
						<LMStudio
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{selectedProvider === "deepseek" && (
						<DeepSeek
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "qwen-code" && (
						<QwenCode
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "moonshot" && (
						<Moonshot
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "minimax" && (
						<MiniMax
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{selectedProvider === "vscode-lm" && (
						<VSCodeLM
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{selectedProvider === "ollama" && (
						<Ollama
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{selectedProvider === "xai" && (
						<XAI apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
					)}

					{selectedProvider === "litellm" && (
						<LiteLLM
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							organizationAllowList={organizationAllowList}
							modelValidationError={modelValidationError}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "sambanova" && (
						<SambaNova
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{selectedProvider === "zai" && (
						<ZAi apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
					)}

					{selectedProvider === "vercel-ai-gateway" && (
						<VercelAiGateway
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							routerModels={routerModels}
							organizationAllowList={organizationAllowList}
							modelValidationError={modelValidationError}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{selectedProvider === "fireworks" && (
						<Fireworks
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{selectedProvider === "roo" && (
						<Roo
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							routerModels={routerModels}
							cloudIsAuthenticated={cloudIsAuthenticated}
							organizationAllowList={organizationAllowList}
							modelValidationError={modelValidationError}
							simplifySettings={fromWelcomeView}
						/>
					)}

					{/* Generic model picker for providers with static models */}
					{activeSelectedProvider && shouldUseGenericModelPicker(activeSelectedProvider) && (
						<>
							<ModelPicker
								apiConfiguration={apiConfiguration}
								setApiConfigurationField={setApiConfigurationField}
								defaultModelId={getDefaultModelIdForProvider(activeSelectedProvider, apiConfiguration)}
								models={getStaticModelsForProvider(
									activeSelectedProvider,
									t("settings:labels.useCustomArn"),
								)}
								modelIdKey="apiModelId"
								serviceName={getProviderServiceConfig(activeSelectedProvider).serviceName}
								serviceUrl={getProviderServiceConfig(activeSelectedProvider).serviceUrl}
								organizationAllowList={organizationAllowList}
								errorMessage={modelValidationError}
								simplifySettings={fromWelcomeView}
								onModelChange={(modelId) =>
									handleModelChangeSideEffects(
										activeSelectedProvider,
										modelId,
										setApiConfigurationField,
									)
								}
							/>

							{selectedProvider === "bedrock" && selectedModelId === "custom-arn" && (
								<BedrockCustomArn
									apiConfiguration={apiConfiguration}
									setApiConfigurationField={setApiConfigurationField}
								/>
							)}
						</>
					)}

					{!fromWelcomeView && (
						<ThinkingBudget
							key={`${selectedProvider}-${selectedModelId}`}
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							modelInfo={selectedModelInfo}
						/>
					)}

					{/* Gate Verbosity UI by capability flag */}
					{!fromWelcomeView && selectedModelInfo?.supportsVerbosity && (
						<Verbosity
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							modelInfo={selectedModelInfo}
						/>
					)}

					{!fromWelcomeView && (
						<Collapsible open={isAdvancedSettingsOpen} onOpenChange={setIsAdvancedSettingsOpen}>
							<CollapsibleTrigger className="flex items-center gap-1 w-full cursor-pointer hover:opacity-80 mb-2">
								<span
									className={`codicon codicon-chevron-${isAdvancedSettingsOpen ? "down" : "right"}`}></span>
								<span className="font-medium">{t("settings:advancedSettings.title")}</span>
							</CollapsibleTrigger>
							<CollapsibleContent className="space-y-3">
								<TodoListSettingsControl
									todoListEnabled={apiConfiguration.todoListEnabled}
									onChange={(field, value) => setApiConfigurationField(field, value)}
								/>
								{selectedModelInfo?.supportsTemperature !== false && (
									<TemperatureControl
										value={apiConfiguration.modelTemperature}
										onChange={handleInputChange("modelTemperature", noTransform)}
										maxValue={2}
										defaultValue={selectedModelInfo?.defaultTemperature}
									/>
								)}
								<RateLimitSecondsControl
									value={apiConfiguration.rateLimitSeconds || 0}
									onChange={(value) => setApiConfigurationField("rateLimitSeconds", value)}
								/>
								<ConsecutiveMistakeLimitControl
									value={
										apiConfiguration.consecutiveMistakeLimit !== undefined
											? apiConfiguration.consecutiveMistakeLimit
											: DEFAULT_CONSECUTIVE_MISTAKE_LIMIT
									}
									onChange={(value) => setApiConfigurationField("consecutiveMistakeLimit", value)}
								/>
								{selectedProvider === "openrouter" &&
									openRouterModelProviders &&
									Object.keys(openRouterModelProviders).length > 0 && (
										<div>
											<div className="flex items-center gap-1">
												<label className="block font-medium mb-1">
													{t("settings:providers.openRouter.providerRouting.title")}
												</label>
												<a href={`https://openrouter.ai/${selectedModelId}/providers`}>
													<ExternalLinkIcon className="w-4 h-4" />
												</a>
											</div>
											<Select
												value={
													apiConfiguration?.openRouterSpecificProvider ||
													OPENROUTER_DEFAULT_PROVIDER_NAME
												}
												onValueChange={(value) =>
													setApiConfigurationField("openRouterSpecificProvider", value)
												}>
												<SelectTrigger className="w-full">
													<SelectValue placeholder={t("settings:common.select")} />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={OPENROUTER_DEFAULT_PROVIDER_NAME}>
														{OPENROUTER_DEFAULT_PROVIDER_NAME}
													</SelectItem>
													{Object.entries(openRouterModelProviders).map(
														([value, { label }]) => (
															<SelectItem key={value} value={value}>
																{label}
															</SelectItem>
														),
													)}
												</SelectContent>
											</Select>
											<div className="text-sm text-vscode-descriptionForeground mt-1">
												{t("settings:providers.openRouter.providerRouting.description")}{" "}
												<a href="https://openrouter.ai/docs/features/provider-routing">
													{t("settings:providers.openRouter.providerRouting.learnMore")}.
												</a>
											</div>
										</div>
									)}
							</CollapsibleContent>
						</Collapsible>
					)}
				</>
			)}
		</div>
	)
}

export default memo(ApiOptions)
