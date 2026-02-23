# Local Llama3 Quickstart (Ollama)

This guide is for running Rataz AI / Roo Code with a local Ollama model.

## Prerequisites

- Ollama installed and reachable from your machine.
- A local model pulled (recommended: `llama3:latest`).

## 1. Start Ollama

```bash
ollama serve
```

In another terminal, verify:

```bash
curl -s http://localhost:11434/api/tags
```

Expected: JSON with a `models` array.

## 2. Pull llama3 if missing

```bash
ollama pull llama3
```

Confirm:

```bash
ollama list
```

Expected to include `llama3:latest`.

## 3. Configure in extension UI

- Open Settings -> Quick setup.
- Click `Use Ollama (Local)` or `Use llama3 Defaults`.
- Ensure:
    - Provider: `ollama`
    - Base URL: `http://localhost:11434` (or `http://127.0.0.1:11434`)
    - Model ID: `llama3:latest`
- Click `Refresh Ollama Models`.
- Click `Test Connection`.

## 4. If no models appear

- Use the `Copy Health Check` button and run the command in terminal.
- Try toggling URL between `localhost` and `127.0.0.1`.
- Re-run `ollama serve` and refresh models.

## 5. Governance workspace bootstrap

For governed mode in a new project workspace, ensure:

```text
.orchestration/active_intents.yaml
.orchestration/agent_trace.jsonl
.orchestration/intent_map.md
```

Then open the extension and run your first prompt. The agent will auto-resolve/select intent when confidence is high, otherwise it should ask for clarification.
