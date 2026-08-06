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

!!! warning "v1.4 camelCase / 3-domain structure"
    The schema below reflects the **v1.4** structure. If you are migrating from v1.3 or earlier, see the breaking YAML changes warning at the top of this page.

```yaml
runtime:
  server: {}                  # Internal server settings (generally left at defaults)
  maxTurns: 40                # Max LLM tool-call turns per investigation (v1.4: increased from 15)

ai:
  llm:
    provider: ""              # Required. One of: openai, ollama, azure, vertex,
                              #   vertexAi, anthropic, bedrock, huggingface, mistral
    model: ""                 # Required. e.g., "gpt-4o", "gemini-2.5-pro"
    endpoint: ""              # Server origin without /v1 (required for ollama, azure, mistral)
    apiKey: ""                # Provider API key
    azureApiVersion: ""       # Azure-specific
    vertexProject: ""         # Vertex-specific (vertex and vertexAi)
    vertexLocation: ""        # Vertex-specific
    bedrockRegion: ""         # Bedrock-specific
    structuredOutput: false   # Reserved; KA always enables JSON mode internally (see note below)
    temperature: 0.7          # Creativity vs determinism (0.0--1.0)
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
| `bedrockRegion` | AWS Bedrock region override |

`temperature`, `maxRetries`, and `timeoutSeconds` are always inherited from the base `LLMRuntimeConfig` and cannot be overridden per phase.

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
    temperature: 0.7
    maxRetries: 3
    timeoutSeconds: 120
    phaseModels:
      rca:
        provider: anthropic
        endpoint: http://anthropic-api
        model: claude-sonnet-4-6
      workflow_discovery:
        model: claude-haiku-3
      validation:
        model: gpt-4o-mini
    ```

## Supported Providers

| Config `ai.llm.provider` | Backend | Implementation |
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

### OpenAI-Compatible (vLLM, LocalAI, TGI)

```yaml
ai:
  llm:
    provider: openai
    model: gpt-4o
    endpoint: http://vllm.internal.svc:8000
```

Set the `endpoint` to the server origin **without** `/v1` — the agent appends `/v1` automatically.

### Azure OpenAI

```yaml
ai:
  llm:
    provider: azure
    model: gpt-4o
    endpoint: https://my-resource.openai.azure.com/
    azureApiVersion: "2024-02-15-preview"
    timeoutSeconds: 120
```

Secret: `kubectl create secret generic llm-credentials --from-literal=AZURE_API_KEY=...`

### Google Vertex AI (Gemini)

```yaml
ai:
  llm:
    provider: vertex
    model: gemini-2.5-pro
    vertexProject: my-project-id
    vertexLocation: us-central1
    timeoutSeconds: 180
```

Secret: `kubectl create secret generic llm-credentials --from-file=application_default_credentials.json=service-account-key.json -n kubernaut-system`

The agent auto-detects `application_default_credentials.json` in the mounted secret and sets `GOOGLE_APPLICATION_CREDENTIALS` at runtime. GCP Workload Identity is also supported — the secret can be omitted when authentication is handled by the node metadata service.

### Claude on Vertex AI

```yaml
ai:
  llm:
    provider: vertex_ai
    model: claude-sonnet-4-20250514
    vertexProject: my-project-id
    vertexLocation: us-east5
    timeoutSeconds: 180
```

Uses the Anthropic Go SDK directly (not LangChainGo). Requires Vertex AI Model Garden access.

### Anthropic (Direct)

```yaml
ai:
  llm:
    provider: anthropic
    model: claude-sonnet-4-20250514
    timeoutSeconds: 180
```

Secret: `kubectl create secret generic llm-credentials --from-literal=ANTHROPIC_API_KEY=...`

### Ollama (Local / Air-Gapped)

```yaml
ai:
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
