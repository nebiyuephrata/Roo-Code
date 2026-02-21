export type { WebviewMessage, WebViewMessagePayload } from "@roo-code/types"

export type ClineAskResponse =
	| "yesButtonClicked"
	| "yesButtonClickedAlways"
	| "noButtonClicked"
	| "messageResponse"
	| "objectResponse"
