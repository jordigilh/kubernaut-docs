# Kubernaut Agent SDK Config

The Kubernaut Agent reads its LLM configuration from an **SDK config** ConfigMap. This page documents the schema, provisioning methods, and provider-specific examples.

## Overview

| Property | Value |
|---|---|
| ConfigMap name | `kubernaut-agent-sdk-config` |
| Key | `sdk-config.yaml` |
| Mount path | `/etc/kubernaut-agent/sdk/` |
| Required | Yes — chart fails at install if no LLM configuration is provided |

## Provisioning

Three options are available, with the following precedence: `existingSdkConfigMap` > `sdkConfigContent` > `llm.provider` + `llm.model`.

### Option A: Quickstart (recommended for getting started)

Set the provider and model directly in Helm values. The chart generates a minimal SDK config ConfigMap automatically.

```bash
helm install kubernaut charts/kubernaut/ \
  --set kubernautAgent.llm.provider=openai \
  --set kubernautAgent.llm.model=gpt-4o \
  ...
```

Supported quickstart providers: `openai`, `anthropic` (any provider needing only an API key). For Vertex AI, Azure, or advanced setups, use Option B or C.

### Option B: Inline content

Provide the full SDK config file via `--set-file`. The chart creates the ConfigMap from this content.

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file kubernautAgent.sdkConfigContent=my-sdk-config.yaml \
  ...
```

### Option C: Pre-existing ConfigMap

Create the ConfigMap yourself and reference it by name. The chart skips creating `kubernaut-agent-sdk-config` and mounts your ConfigMap instead.

```bash
kubectl create configmap my-sdk-config \
  --from-file=sdk-config.yaml=my-sdk-config.yaml \
  -n kubernaut-system

helm install kubernaut charts/kubernaut/ \
  --set kubernautAgent.existingSdkConfigMap=my-sdk-config \
  ...
```

## Schema Reference

```yaml
llm:
  provider: ""              # Required. One of: openai, ollama, azure, vertex,
                            #   vertex_ai, anthropic, bedrock, huggingface, mistral
  model: ""                 # Required. e.g., "gpt-4o", "gemini-2.5-pro"
  endpoint: ""              # Server origin without /v1 (required for ollama, azure, mistral)
  api_key: ""               # Provider API key
  azure_api_version: ""     # Azure-specific
  vertex_project: ""        # Vertex-specific (vertex and vertex_ai)
  vertex_location: ""       # Vertex-specific
  bedrock_region: ""        # Bedrock-specific
  structured_output: false  # Reserved; KA always enables JSON mode internally (see note below)
  temperature: 0.7          # Creativity vs determinism (0.0--1.0)
  max_retries: 3            # LLM call retry count
  timeout_seconds: 120      # Per-call timeout
  custom_headers:            # Optional custom HTTP headers
    - name: "X-Custom"
      value: "..."
  oauth2:                    # Optional OAuth2 client credentials
    enabled: false
    token_url: ""            # Must use https:// when enabled
    client_id: ""
    client_secret: ""
    scopes: ["scope1"]

toolsets: {}                # Optional: data source toolsets
  # prometheus/metrics:
  #   enabled: true
  #   config:
  #     prometheus_url: "http://kube-prometheus-stack-prometheus.monitoring.svc:9090"

mcp_servers: {}             # Optional: Model Context Protocol servers
```

## Supported Providers

| Config `llm.provider` | Backend | Implementation |
|---|---|---|
| `openai` | OpenAI or OpenAI-compatible API | LangChainGo `llms/openai` |
| `ollama` | Ollama | LangChainGo `llms/ollama` |
| `azure` | Azure OpenAI | LangChainGo `llms/openai` (Azure API type) |
| `vertex` | Google Vertex AI (Gemini models) | LangChainGo `llms/googleai/vertex` |
| `vertex_ai` | Claude on Google Vertex AI | Anthropic Go SDK (not LangChainGo) |
| `anthropic` | Anthropic API (direct) | LangChainGo `llms/anthropic` |
| `bedrock` | Amazon Bedrock | LangChainGo `llms/bedrock` |
| `huggingface` | Hugging Face | LangChainGo `llms/huggingface` |
| `mistral` | Mistral | LangChainGo `llms/mistral` |

!!! warning "Vertex AI provider distinction"
    `vertex` = Gemini models on Vertex AI. `vertex_ai` = Anthropic Claude models on Vertex AI. These use separate code paths and different SDKs.

!!! warning "Mandatory JSON structured output"
    KA internally sets `JSONMode: true` on every LLM request. This is **not configurable** — the `structured_output` field in the config is reserved and has no effect at runtime. Your LLM provider/model **must** support schema-constrained JSON responses (equivalent to `response_format: {"type": "json_object"}` in the OpenAI API). All listed providers support this natively. For self-hosted or air-gapped deployments using Ollama or OpenAI-compatible servers, ensure the model supports JSON mode (most instruction-tuned models do).

## Toolset Optimization

Each enabled toolset injects its full tool schema into every LLM context turn. When a toolset is enabled but never called during an investigation, those schema tokens are pure overhead — they consume budget and can bias the LLM toward irrelevant investigation paths.

Empirical testing shows that loading a single unused toolset (Prometheus, 123 tools) can add ~30% token overhead and increase LLM latency by ~15%, with no benefit to the investigation outcome. See the [two-phase toolkit selection discussion](https://github.com/jordigilh/kubernaut/issues/434) for detailed measurements.

**Recommendation:** Enable only the toolsets needed for your workload. The Kubernetes core toolset (`kubectl` commands and logs) is always available — it cannot be disabled.

### Incident-Type to Toolset Mapping

| Incident Type | Recommended Toolsets | Notes |
|---|---|---|
| Config errors, CrashLoopBackOff, OOMKilled | *(core only — no extra toolsets)* | `kubectl` access to pods, events, and logs is sufficient |
| SLO burn-rate alerts, latency spikes | `prometheus/metrics` | Requires Prometheus for metric queries |
| Cloud resource issues | Relevant cloud provider toolset | Add only the provider you use |

### Example: Minimal SDK Config (No Optional Toolsets)

```yaml
llm:
  provider: openai
  model: gpt-4o
  temperature: 0.5

toolsets: {}
```

Enable Prometheus only when investigating metric-driven alerts:

```yaml
toolsets:
  prometheus/metrics:
    enabled: true
    config:
      prometheus_url: "http://kube-prometheus-stack-prometheus.monitoring.svc:9090"
```

!!! note "Automatic toolset selection"
    [Two-phase toolkit selection](https://github.com/jordigilh/kubernaut/issues/434) automatically loads only the toolsets relevant to each investigation.

## Provider Examples

### OpenAI

```yaml
llm:
  provider: openai
  model: gpt-4o
  temperature: 0.7
  timeout_seconds: 120
```

Secret: `kubectl create secret generic llm-credentials --from-literal=OPENAI_API_KEY=sk-...`

### OpenAI-Compatible (vLLM, LocalAI, TGI)

```yaml
llm:
  provider: openai
  model: gpt-4o
  endpoint: http://vllm.internal.svc:8000
```

Set the `endpoint` to the server origin **without** `/v1` — the agent appends `/v1` automatically.

### Azure OpenAI

```yaml
llm:
  provider: azure
  model: gpt-4o
  endpoint: https://my-resource.openai.azure.com/
  azure_api_version: "2024-02-15-preview"
  timeout_seconds: 120
```

Secret: `kubectl create secret generic llm-credentials --from-literal=AZURE_API_KEY=...`

### Google Vertex AI (Gemini)

```yaml
llm:
  provider: vertex
  model: gemini-2.5-pro
  vertex_project: my-project-id
  vertex_location: us-central1
  timeout_seconds: 180
```

Secret: `kubectl create secret generic llm-credentials --from-file=application_default_credentials.json=service-account-key.json -n kubernaut-system`

The agent auto-detects `application_default_credentials.json` in the mounted secret and sets `GOOGLE_APPLICATION_CREDENTIALS` at runtime. GCP Workload Identity is also supported — the secret can be omitted when authentication is handled by the node metadata service.

### Claude on Vertex AI

```yaml
llm:
  provider: vertex_ai
  model: claude-sonnet-4-20250514
  vertex_project: my-project-id
  vertex_location: us-east5
  timeout_seconds: 180
```

Uses the Anthropic Go SDK directly (not LangChainGo). Requires Vertex AI Model Garden access.

### Anthropic (Direct)

```yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514
  timeout_seconds: 180
```

Secret: `kubectl create secret generic llm-credentials --from-literal=ANTHROPIC_API_KEY=...`

### Ollama (Local / Air-Gapped)

```yaml
llm:
  provider: ollama
  model: llama3
  endpoint: http://ollama.internal.svc:11434
```

Recommended for disconnected/air-gapped environments. See [Disconnected Installation](../operations/disconnected-install.md) for setup guidance.

## Secrets Pairing

LLM API credentials are stored in a separate Kubernetes Secret (default name: `llm-credentials`). The chart mounts this Secret into the Kubernaut Agent pod alongside the SDK config. The Secret name is configured via `kubernautAgent.llm.credentialsSecretName`.

The Secret is marked `optional: true` — the agent starts without it but all LLM calls fail until it is created.

## Temperature Tuning

- **0.3--0.5**: More deterministic. Recommended for production.
- **0.7** (default): Balanced.
- **0.8--1.0**: More creative. May discover non-obvious root causes but less consistent.

## Hot-Reload

The SDK config supports hot-reload. Changes to the ConfigMap are detected via an fsnotify file watcher (~60s kubelet sync delay). No pod restart required for most fields.

**Restart-required fields** (changes are rejected with a warning log):

- `llm.provider`
- `llm.oauth2.token_url`, `llm.oauth2.client_id`, `llm.oauth2.client_secret`

**Hot-reloadable fields**: `model`, `endpoint`, `api_key`, `azure_api_version`, `vertex_project`, `vertex_location`, `bedrock_region`, `temperature`, `max_retries`, `timeout_seconds`, `custom_headers`, `oauth2.scopes`

Active investigations are pinned to the client/model snapshot at start — reload only affects new investigations.

## Reference File

A complete example is available in the chart: `charts/kubernaut/examples/sdk-config.yaml`
