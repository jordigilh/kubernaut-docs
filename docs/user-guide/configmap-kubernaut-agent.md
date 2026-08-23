# Kubernaut Agent SDK Config

The Kubernaut Agent reads its LLM configuration from an **SDK config** ConfigMap. This page documents the schema, provisioning methods, and provider-specific examples.

!!! warning "v1.4: breaking YAML changes for the Kubernaut Agent"
    **CamelCase migration (ADR-030).** Every field in KA-facing YAML configs now uses **`camelCase`**. Older **`snake_case`** keys (`api_key`, `timeout_seconds`, `mcp_servers`, `prometheus_url`, and similar) **must be renamed** — existing ConfigMaps fail validation until updated.

    **Three top-level domains.** Configuration is reorganized under **`runtime`**, **`ai`**, and **`integrations`**:

    - **`runtime`** — operational/process settings (**`server`** and related knobs are nested here).
    - **`ai`** — LLM/provider options (for example **`llm`** blocks live under **`ai`**).
    - **`integrations`** — external surfaces (**`tools`** / toolsets and **`mcp_servers`** equivalents are nested here).

    **Two ConfigMaps.** KA consumes a **static** ConfigMap mounted at **pod startup** (bootstrap and fields that cannot change safely at runtime) and a separate **hot-reloadable** ConfigMap **watched at runtime**. Edits to AI model, tooling, MCP, and other supported fields on the reloadable bundle take effect **without restarting the pod** (subject to watcher sync latency — see [Hot-Reload](#hot-reload)).

    ### Before vs after (illustrative)

    **Before (< v1.4, flat layout + snake_case):**

    ```yaml
    llm:
      provider: openai
      model: gpt-4o
      timeout_seconds: 120
      max_retries: 3

    toolsets:
      prometheus/metrics:
        enabled: true
        config:
          prometheus_url: "http://kube-prometheus-stack-prometheus.monitoring.svc:9090"

    mcp_servers: {}
    ```

    **After (v1.4, three domains + camelCase):**

    ```yaml
    runtime:
      server: {}

    ai:
      llm:
        provider: openai
        model: gpt-4o
        timeoutSeconds: 120
        maxRetries: 3

    integrations:
      tools:
        prometheus/metrics:
          enabled: true
          config:
            prometheusUrl: "http://kube-prometheus-stack-prometheus.monitoring.svc:9090"
      mcpServers: {}
    ```

    Regenerate manifests from **`values.schema.json`** and the canonical chart examples when upgrading Helm releases — do not partially rename keys.

## Overview

| Property | Value |
|---|---|
| Historical ConfigMap (**&lt; v1.4**) | `kubernaut-agent-sdk-config` with key `sdk-config.yaml` mounted under `/etc/kubernaut-agent/sdk/` |
| v1.4+ manifests | Helm renders **paired** volumes: a **static** ConfigMap (startup) plus a **hot-reloadable** ConfigMap (runtime watcher); exact metadata keys and directories are defined alongside **`values.schema.json`** in the shipped chart templates — align upgrades with release examples instead of renaming keys ad hoc |
| Required | Yes — chart fails at install when LLM / SDK prerequisites are missing |

Re-read the **v1.4** upgrade warning at the top of this page before touching live manifests.

## Provisioning

Three options are available, with the following precedence: `existingSdkConfigMap` > `sdkConfigContent` > `global.llmProfiles` (v1.6, DD-PLATFORM-007 — replaces the old `kubernautAgent.llm.provider`/`.model`).

### Option A: Quickstart (recommended for getting started)

Set the provider and model directly in Helm values, as a named LLM profile under `global.llmProfiles`. The chart generates a minimal SDK config ConfigMap automatically.

```bash
helm install kubernaut charts/kubernaut/ \
  --set global.llmProfiles.primary.provider=openai \
  --set global.llmProfiles.primary.model=gpt-4o \
  --set global.llmProfiles.primary.credentialsSecretName=llm-credentials \
  ...
```

`kubernautAgent.llmProfileRef` is optional when exactly one profile is defined -- it's inferred automatically (Issue #1987); set it explicitly if you define multiple named profiles for other consumers (e.g. AI Analysis severity triage).

Supported quickstart providers: `openai`, `anthropic`, `gemini` (any provider needing only an API key). For Vertex AI, Azure, or advanced setups, use Option B or C.

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

!!! warning "v1.4 camelCase / 3-domain structure"
    The schema below reflects the **v1.4** structure. If you are migrating from v1.3 or earlier, see the breaking YAML changes warning at the top of this page.

```yaml
runtime:
  server: {}                  # Internal server settings (generally left at defaults)
  maxTurns: 40                # Max LLM tool-call turns per investigation (v1.4: increased from 15)

ai:
  llm:
    provider: ""              # Required. One of: openai, openai_compatible, anthropic,
                              #   vertex_ai, gemini (v1.6+ -- langchaingo removed, see
                              #   "Supported Providers" below for the full mapping)
    model: ""                 # Required. e.g., "gpt-4o", "claude-sonnet-4-6", "gemini-2.5-pro"
    endpoint: ""              # Server origin without /v1 (required for openai, openai_compatible)
    apiKey: ""                # Provider API key
    azureApiVersion: ""       # Set together with provider: openai/openai_compatible for Azure OpenAI (v1.6+, #1600) -- there is no separate "azure" provider string
    vertexProject: ""         # Required for provider: vertex_ai
    vertexLocation: ""        # Required for provider: vertex_ai
    bedrockRegion: ""         # Parsed but NOT YET consumed by any client (#1582) -- do not configure "bedrock" as a provider, it is rejected at startup
    reasoning:                # v1.6+ (BR-AI-086/BR-AI-087). Off by default. See "Reasoning Configuration" below.
      enabled: false
      effort: ""              # "", none, minimal, low, medium, high, xhigh (unified across all providers)
      budgetTokens: 0         # Anthropic-family only; overrides effort with an exact token budget when set
      capabilityOverride: ""  # openai_compatible only: "auto" (default), "force_on", "force_off"
    structuredOutput: false   # Reserved; KA always enables JSON mode internally (see note below)
    temperature: 0.7          # Creativity vs determinism (0.0--1.0). Omit this key entirely to
                              #   send no temperature parameter at all (v1.5.5+, #1749) -- required
                              #   for models (e.g. claude-opus-4-8) that reject the parameter with
                              #   an HTTP 400 if present. See "Temperature Tuning" below.
    maxRetries: 3             # LLM call retry count
    timeoutSeconds: 120       # Per-call timeout
    tlsCaFile: ""             # Custom CA cert for LLM endpoint (PEM, absolute path)
    tlsCertFile: ""           # Client certificate for mTLS to LLM proxy (#1342, absolute path)
    tlsKeyFile: ""            # Client key for mTLS to LLM proxy (#1342, absolute path)
    customHeaders:            # Optional custom HTTP headers (see Custom Headers section)
      - name: "X-Custom"
        value: "..."
      - name: "X-Auth-Token"
        secretKeyRef: "LLM_PROXY_TOKEN"
      - name: "X-Request-Cert"
        filePath: "/etc/kubernaut/certs/client.pem"
    oauth2:                   # Optional OAuth2 client credentials
      enabled: false
      tokenUrl: ""            # Must use https:// when enabled
      clientId: ""
      clientSecret: ""
      scopes: ["scope1"]
    circuitBreaker:           # Resilience for LLM HTTP calls
      enabled: false
      failureThreshold: 5     # Failures before opening
      timeout: 30s            # Duration in open state before half-open

integrations:
  toolsets: {}              # Optional: data source toolsets
    # prometheus/metrics:
    #   enabled: true
    #   config:
    #     prometheusUrl: "http://kube-prometheus-stack-prometheus.monitoring.svc:9090"

  mcpServers: {}            # Optional: Model Context Protocol servers
```

!!! info "Operator: BYO runtime ConfigMap"
    When deploying via the Kubernaut Operator, set `spec.kubernautAgent.runtimeConfigMapName` to point to a ConfigMap you manage. The operator mounts it as the hot-reloadable config, so changes take effect without pod restart. The static ConfigMap is managed by the operator and should not be edited directly.

### Per-phase LLM routing (v1.5.1) {: #per-phase-llm-routing-v151 }

The `phaseModels` map in the `kubernaut-agent-llm-runtime` ConfigMap allows configuring different LLM models for each phase of the investigation pipeline. This is useful for routing expensive reasoning models to RCA while using faster/cheaper models for workflow selection or validation.

**Valid phase keys** (CEL-validated when using the operator CR):

| Phase key | Description |
|---|---|
| `rca` | Root-cause analysis loop (K8s + Prometheus tools) |
| `workflow_discovery` | Workflow selection and discovery |
| `validation` | Post-selection validation |

**Override fields** (all optional; non-empty fields override the base LLM config):

| Field | Description |
|---|---|
| `provider` | Override LLM provider |
| `model` | Override model name |
| `endpoint` | Override endpoint URL |
| `apiKey` | Override API key |
| `azureApiVersion` | Azure API version override |
| `vertexProject` | GCP project override |
| `vertexLocation` | GCP region override |
| `bedrockRegion` | Parsed for forward-compatibility; not consumed (#1582) |
| `temperature` | Override base/phase temperature (v1.5.5+, #1749). `nil`/omitted means inherit the base value unchanged. |
| `reasoning` | Override base/phase reasoning config (v1.6+). Identity fields (`provider`, `model`) are frozen at boot per phase (#1599) — only tuning fields like `reasoning.effort` are hot-reloadable. |

`maxRetries` and `timeoutSeconds` are always inherited from the base `LLMRuntimeConfig` and cannot be overridden per phase.

**Merge behavior**: `EffectivePhaseConfig()` copies the base config, then overlays non-empty override fields. If `phaseModels` is empty or the phase has no entry, the base config is used unchanged.

**Validation**: unknown phase keys are rejected at startup. An override where all fields are empty is rejected.

**Hot-reloadable**: yes — changes to the `kubernaut-agent-llm-runtime` ConfigMap take effect via FileWatcher without pod restart.

**Configuration paths**:

- **Operator CR**: `spec.kubernautAgent.phaseModels` — a map of phase name to a **profile name** defined in `spec.llmProfiles` (CEL-validated keys), not an inline override object. The operator resolves the named profile and renders it into the ConfigMap's override-object shape shown above.
- **Direct ConfigMap patch**: add `phaseModels:` key to the `kubernaut-agent-llm-runtime` ConfigMap using the inline override-object shape directly
- **Helm chart**: `kubernautAgent.phaseModels` — same profile-name-map shape as the operator CR, referencing `global.llmProfiles` (DD-PLATFORM-007)

??? example "phaseModels in kubernaut-agent-llm-runtime ConfigMap"
    ```yaml
    model: gpt-4o
    endpoint: http://llm-gateway:8080/v1
    # temperature omitted here -- base calls send no temperature parameter (v1.5.5+ default)
    maxRetries: 3
    timeoutSeconds: 120
    phaseModels:
      rca:
        provider: anthropic
        endpoint: http://anthropic-api
        model: claude-sonnet-4-6
        temperature: 0.4       # RCA phase overrides the (omitted) base temperature explicitly
      workflow_discovery:
        model: claude-haiku-3
      validation:
        model: gpt-4o-mini
    ```

## Supported Providers

!!! info "v1.6: LangChainGo removed (#1580, #1581, #1600, #1778)"
    The Kubernaut Agent no longer depends on LangChainGo. LLM access now goes through a small set of first-party clients, each shared with the API Frontend via `pkg/shared/types.LLMConfig`. This dropped the number of distinct `provider` strings from nine to five — several older values (`ollama`, `azure`, `vertex`, `huggingface`, `mistral`) no longer exist as their own provider identity. Endpoint-compatible backends are now reached through `openai`/`openai_compatible` instead (see the table below), and `vertex` (bare) was folded into `vertex_ai`, which now auto-detects Claude vs. Gemini from the model name.

| Config `ai.llm.provider` | Backend | Implementation | Notes |
|---|---|---|---|
| `anthropic` | Anthropic API (direct, `api.anthropic.com`) | Native Anthropic Go SDK | |
| `gemini` | Google Gemini Developer API (`generativelanguage.googleapis.com`) | Native `google.golang.org/genai` client (BR-AI-087, #1778) | New in v1.6. Distinct from `vertex_ai`: no GCP project/location. |
| `vertex_ai` | Google Vertex AI — hosts **either** Claude **or** Gemini models | Native Anthropic or `genai` client, auto-selected by model name prefix (`claude-*` vs. `gemini-*`) (#1778, #1792) | A model matching neither prefix fails fast at client construction rather than silently defaulting. |
| `openai` | OpenAI (`api.openai.com`) | Shared `openaicompat` client (DD-LLM-005) | |
| `openai_compatible` | Any OpenAI-Chat-Completions-compatible endpoint: Azure OpenAI, Ollama, vLLM, LlamaStack, Mistral, Hugging Face TGI, DeepSeek | Shared `openaicompat` client (#1581, DD-LLM-005) | Azure OpenAI is selected by setting `azureApiVersion` alongside this provider — there is no separate `azure` value (#1600). |

!!! warning "`bedrock` is not a supported provider value"
    `bedrockRegion` remains a parseable config field for forward compatibility, but no client currently consumes it (#1582) — configuring `provider: bedrock` is rejected at LLM client construction.

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
ai:
  llm:
    provider: openai
    model: gpt-4o
    temperature: 0.5

integrations:
  toolsets: {}
```

Enable Prometheus only when investigating metric-driven alerts:

```yaml
integrations:
  toolsets:
    prometheus/metrics:
      enabled: true
      config:
        prometheusUrl: "http://kube-prometheus-stack-prometheus.monitoring.svc:9090"
```

!!! note "Automatic toolset selection"
    [Two-phase toolkit selection](https://github.com/jordigilh/kubernaut/issues/434) automatically loads only the toolsets relevant to each investigation.

## Provider Examples

### OpenAI

```yaml
ai:
  llm:
    provider: openai
    model: gpt-4o
    temperature: 0.7
    timeoutSeconds: 120
```

Secret: `kubectl create secret generic llm-credentials --from-literal=OPENAI_API_KEY=sk-...`

### OpenAI-Compatible (vLLM, Ollama, LlamaStack, DeepSeek)

```yaml
ai:
  llm:
    provider: openai_compatible
    model: gpt-4o
    endpoint: http://vllm.internal.svc:8000
```

Set the `endpoint` to the server origin **without** `/v1` — the agent appends `/v1` automatically. Use `openai_compatible` for any Chat-Completions-compatible backend (vLLM, Ollama, LlamaStack, Mistral, Hugging Face TGI, DeepSeek); `openai` is reserved for `api.openai.com` itself, but both are served by the same client.

### Azure OpenAI

```yaml
ai:
  llm:
    provider: openai_compatible
    model: gpt-4o          # doubles as the Azure deployment ID
    endpoint: https://my-resource.openai.azure.com/
    azureApiVersion: "2024-02-15-preview"
    timeoutSeconds: 120
```

Secret: `kubectl create secret generic llm-credentials --from-literal=AZURE_API_KEY=...`

!!! info "No separate `azure` provider (v1.6, #1600)"
    Azure OpenAI is not its own `provider` value — it is `openai` or `openai_compatible` with `azureApiVersion` set, which switches the shared client into Azure's deployment-scoped URL shape and `api-key` header auth instead of `Authorization: Bearer`. `model` doubles as the Azure deployment ID, matching Azure's own convention.

### Google Gemini (Native API)

```yaml
ai:
  llm:
    provider: gemini
    model: gemini-2.5-pro
    apiKey: ""              # or apiKeyFile / credentials secret
    timeoutSeconds: 120
```

New in v1.6 (BR-AI-087, #1778). Talks directly to the Gemini Developer API (`generativelanguage.googleapis.com`) via the native `google.golang.org/genai` client — no GCP project or location required. Secret: `kubectl create secret generic llm-credentials --from-literal=GEMINI_API_KEY=...`

### Google Vertex AI (Gemini or Claude)

```yaml
ai:
  llm:
    provider: vertex_ai
    model: gemini-2.5-pro    # or a claude-* model -- auto-detected by prefix
    vertexProject: my-project-id
    vertexLocation: us-central1
    timeoutSeconds: 180
```

Secret: `kubectl create secret generic llm-credentials --from-file=application_default_credentials.json=service-account-key.json -n kubernaut-system`

The agent auto-detects `application_default_credentials.json` in the mounted secret and sets `GOOGLE_APPLICATION_CREDENTIALS` at runtime. GCP Workload Identity is also supported — the secret can be omitted when authentication is handled by the node metadata service. `vertex_ai` hosts both model families: `model` values matching `claude-*` route to the native Anthropic client, `gemini-*` to the native `genai` client (#1778, #1792) — a model matching neither prefix fails fast at startup rather than defaulting silently.

### Anthropic (Direct)

```yaml
ai:
  llm:
    provider: anthropic
    model: claude-sonnet-4-6
    timeoutSeconds: 180
```

Secret: `kubectl create secret generic llm-credentials --from-literal=ANTHROPIC_API_KEY=...`

### Ollama (Local / Air-Gapped)

```yaml
ai:
  llm:
    provider: openai_compatible
    model: llama3
    endpoint: http://ollama.internal.svc:11434
```

Recommended for disconnected/air-gapped environments. See [Disconnected Installation](../operations/disconnected-install.md) for setup guidance.

## Secrets Pairing

LLM API credentials are stored in a separate Kubernetes Secret (example name: `llm-credentials` -- there is no default, since `global.llmProfiles` has no default profile). The chart mounts this Secret into the Kubernaut Agent pod alongside the SDK config. The Secret name is configured per-profile via `global.llmProfiles.<name>.credentialsSecretName` (v1.6, DD-PLATFORM-007).

The Secret is marked `optional: true` — the agent starts without it but all LLM calls fail until it is created.

## Temperature Tuning

!!! info "Default changed in v1.5.5 (#1749, BR-HAPI-199)"
    `ai.llm.temperature` has **no default value** — if the key is absent from the runtime ConfigMap, KA sends no `temperature` parameter at all in LLM requests, rather than defaulting to `0.7`. This is required for models (e.g. `claude-opus-4-8`) that reject the request outright with an HTTP 400 if `temperature` is present at all. `Temperature` is a pointer end-to-end (`*float64`) so "unset" and "explicitly set to `0`" are distinguishable — an explicit `temperature: 0` is still sent as `0`, not omitted. Set the key explicitly (any value, including `0`) if your model supports and requires an explicit temperature.

When you do set it explicitly:

- **0.3--0.5**: More deterministic. Recommended for production.
- **0.7**: Balanced — commonly used, but no longer applied automatically.
- **0.8--1.0**: More creative. May discover non-obvious root causes but less consistent.

`phaseModels.<phase>.temperature` can override the base value per phase (v1.5.5+) — see [Per-phase LLM routing](#per-phase-llm-routing-v151).

## Reasoning Configuration (v1.6+)

!!! info "BR-AI-086 / BR-AI-087, #1604"
    Reasoning/thinking-token support is **disabled by default** for every provider and model — it requires an explicit opt-in via `ai.llm.reasoning.enabled: true`.

`ai.llm.reasoning` opts a model into extended "thinking" before it answers, for providers/models that support it. `effort` is a single, **provider-agnostic** knob — the same value means the same thing regardless of which provider you switch to, so tuning a `phaseModels` override or migrating providers never requires re-deriving a different vendor-specific number:

| Field | Description |
|---|---|
| `enabled` | Must be `true` for any of the fields below to take effect. Default `false`. |
| `effort` | One of `""` (unset — vendor default applies), `none`, `minimal`, `low`, `medium`, `high`, `xhigh`. |
| `budgetTokens` | Anthropic-family only (`anthropic`, `vertex_ai` hosting a `claude-*` model). When set, wins over `effort` as an exact token-budget override. |
| `capabilityOverride` | `openai_compatible` only. One of `auto` (default), `force_on`, `force_off` — short-circuits vendor/model-name auto-detection for self-hosted/custom models that cannot be reliably identified by name alone. |

**Per-provider wire mapping** (same `effort` value, different dialect):

| Provider | Mapping |
|---|---|
| `anthropic`, `vertex_ai` (Claude) | Maps onto Anthropic's `ThinkingLevel` tiers. `xhigh` clamps to `high` (Anthropic's ceiling — a range clamp, not an error). `effort: none` while `enabled: true` is rejected at validation: Anthropic has no "thinking enabled with zero effort" wire state. |
| `gemini`, `vertex_ai` (Gemini) | Maps onto the same `ThinkingLevel` tiers as Anthropic (shared mapping code) — `xhigh` also clamps to `high`. |
| `openai`, `openai_compatible` (real OpenAI o-series / gpt-5 models) | Passed through verbatim as the wire `reasoning_effort` parameter. |
| `openai_compatible` (DeepSeek-class models) | Downscaled to DeepSeek's own two-tier dialect (`high`/`max` plus a separate thinking-enabled toggle). |

```yaml
ai:
  llm:
    provider: anthropic
    model: claude-sonnet-4-6
    reasoning:
      enabled: true
      effort: high
```

```yaml
ai:
  llm:
    provider: openai
    model: gpt-5
    endpoint: https://api.openai.com/v1
    reasoning:
      enabled: true
      effort: medium
```

`phaseModels.<phase>.reasoning` can override the base value per phase — see [Per-phase LLM routing](#per-phase-llm-routing-v151). LLM **identity** (provider + model, at both base and per-phase level) is frozen at process start (#1599); a hot-reload that only changes `reasoning.effort` (a tuning field, not identity) takes effect without a restart.

## mTLS for LLM Proxy (#1342)

Both the Kubernaut Agent and the API Frontend support **mutual TLS (mTLS)** for outbound LLM HTTP calls. This is required when a corporate LLM proxy mandates client certificate authentication.

| Field | Description |
|---|---|
| `tlsCaFile` | PEM-encoded CA certificate for verifying the LLM endpoint (server verification is mandatory — SC-8) |
| `tlsCertFile` | Client certificate presented during the TLS handshake (absolute path, e.g. `/etc/kubernaut/certs/llm-client.crt`) |
| `tlsKeyFile` | Client private key (absolute path, e.g. `/etc/kubernaut/certs/llm-client.key`) |

**Validation rules:**

- `tlsCertFile` and `tlsKeyFile` must **both** be set or both be empty (pair validation).
- Both must be **absolute paths**.
- When mTLS is configured, `tlsCaFile` is **required** — the transport chain always verifies the server certificate.

**Transport chain:** The mTLS transport is the innermost layer. On top of it, the chain applies OAuth2 (if configured), custom headers, and circuit breaker wrapping. For `vertex_ai`, GCP OAuth2 is layered on top of the mTLS transport via `WithBaseTransport`.

```yaml
ai:
  llm:
    provider: vertex_ai
    model: claude-sonnet-4-20250514
    vertexProject: my-project
    vertexLocation: us-east4
    tlsCaFile: /etc/kubernaut/certs/llm-ca.pem
    tlsCertFile: /etc/kubernaut/certs/llm-client.crt
    tlsKeyFile: /etc/kubernaut/certs/llm-client.key
```

The same fields are available under `apifrontend.config.agent.llm.*` for the AF's LLM provider. See [AF LLM Configuration](../user-guide/configuration.md#af-llm-configuration-v15).

## Custom Headers

!!! info "Added in v1.3 (Issue #417)"

The `customHeaders` field injects arbitrary HTTP headers into every outbound LLM API request. This is useful when your LLM endpoint sits behind an authenticating proxy, API gateway, or corporate firewall that requires additional credentials beyond the standard `apiKey`.

### Value Sources

Each header definition requires exactly **one** value source:

| Source | Description | Resolved at |
|---|---|---|
| `value` | Static inline string | Config load |
| `secretKeyRef` | Name of an environment variable (typically projected from a K8s Secret) | Startup (fail-fast if empty) |
| `filePath` | Absolute path to a file whose contents are read as the header value | Each request (supports rotation) |

### Configuration

```yaml
ai:
  llm:
    customHeaders:
      # Static value — suitable for non-sensitive identifiers
      - name: "X-Team-Id"
        value: "platform-sre"

      # Secret reference — resolves the env var LLM_PROXY_TOKEN at startup
      - name: "X-Auth-Token"
        secretKeyRef: "LLM_PROXY_TOKEN"

      # File path — re-read on every request (supports cert/token rotation)
      - name: "X-Client-Cert"
        filePath: "/etc/kubernaut/certs/client.pem"
```

To expose a Kubernetes Secret as an environment variable for `secretKeyRef`, add an `env` entry to the Kubernaut Agent Deployment:

```yaml
env:
  - name: LLM_PROXY_TOKEN
    valueFrom:
      secretKeyRef:
        name: llm-proxy-credentials
        key: token
```

### Validation Rules

- **Exactly one source** must be set per header (`value`, `secretKeyRef`, or `filePath`).
- **No duplicates** — each header name may appear only once (case-insensitive).
- **Reserved headers** cannot be overridden: `Content-Type`, `Accept`, `Host`, `User-Agent`.
- **Startup validation**: `secretKeyRef` entries are checked at pod startup — if the referenced environment variable is empty or unset, the agent fails to start with a clear error message.
- **`filePath` validation**: file existence is checked at request time; a missing file causes the LLM call to fail (not the pod).

### Common Use Cases

| Scenario | Header | Source |
|---|---|---|
| Corporate API gateway authentication | `X-Api-Key` or `Authorization` | `secretKeyRef` |
| LLM proxy with rotating bearer tokens | `Authorization` | `filePath` (token file refreshed by sidecar) |
| Request tracing / correlation | `X-Request-Id`, `X-Correlation-Id` | `value` (static team/service ID) |
| Multi-tenant LLM routing | `X-Tenant-Id` | `value` or `secretKeyRef` |

### Hot-Reload Behavior

`customHeaders` is a [hot-reloadable field](#hot-reload). Adding, removing, or modifying headers in the reloadable ConfigMap takes effect for new investigations without a pod restart. In-flight investigations continue with the headers that were active at session start.

## Hot-Reload

From **v1.4** onward the agent watches only the **hot-reloadable** ConfigMap bundle; startup-only YAML remains on the **static** ConfigMap. On prior releases this page described a single mounted SDK bundle — treat AI/tool MCP fields as residing on the watched volume unless your chart splits them explicitly.

Reloadable changes are detected via an **fsnotify** file watcher (**~60s** kubelet ConfigMap sync delay). No pod restart is required for most fields on that bundle.

**Restart-required fields** (changes are rejected with a warning log):

- `ai.llm.provider`
- `ai.llm.oauth2.tokenUrl`, `ai.llm.oauth2.clientId`, `ai.llm.oauth2.clientSecret`
- `ai.llm.tlsCertFile`, `ai.llm.tlsKeyFile`, `ai.llm.tlsCaFile` (TLS state is built at startup)
- `ai.llm.circuitBreaker.*`

**Hot-reloadable fields**: `model`, `endpoint`, `apiKey`, `azureApiVersion`, `vertexProject`, `vertexLocation`, `bedrockRegion`, `temperature`, `maxRetries`, `timeoutSeconds`, `customHeaders`, `oauth2.scopes`

Active investigations are pinned to the client/model snapshot at start — reload only affects new investigations.

## Reference File

A complete example is available in the chart: `charts/kubernaut/examples/sdk-config.yaml`
