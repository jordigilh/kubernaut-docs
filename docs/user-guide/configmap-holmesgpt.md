# HolmesGPT SDK Config

The HolmesGPT API (HAPI) reads its LLM configuration from an **SDK config** ConfigMap. This page documents the schema, provisioning methods, and provider-specific examples.

## Overview

| Property | Value |
|---|---|
| ConfigMap name | `holmesgpt-sdk-config` |
| Key | `sdk-config.yaml` |
| Mount path | `/etc/holmesgpt/sdk/` |
| Required | Yes -- chart fails at install if neither `sdkConfigContent` nor `existingSdkConfigMap` is set |

## Provisioning

### Option A: Inline content (recommended)

Provide the SDK config file via `--set-file`. The chart creates the ConfigMap from this content.

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file holmesgptApi.sdkConfigContent=my-sdk-config.yaml \
  ...
```

### Option B: Pre-existing ConfigMap

Create the ConfigMap yourself and reference it by name. This takes priority over `sdkConfigContent`.

```bash
kubectl create configmap holmesgpt-sdk-config \
  --from-file=sdk-config.yaml=my-sdk-config.yaml \
  -n kubernaut-system

helm install kubernaut charts/kubernaut/ \
  --set holmesgptApi.existingSdkConfigMap=holmesgpt-sdk-config \
  ...
```

## Schema Reference

```yaml
llm:
  provider: ""           # Required: "openai", "azure", "vertexai", "bedrock", "litellm"
  model: ""              # Required: e.g., "gpt-4o", "gemini-2.0-flash"
  endpoint: ""           # API endpoint (required for Azure/LiteLLM, optional for others)
  gcp_project_id: ""     # Required for Vertex AI
  gcp_region: ""         # Required for Vertex AI
  max_retries: 3         # LLM call retry count
  timeout_seconds: 120   # Per-call timeout
  temperature: 0.7       # Creativity vs determinism (0.0--1.0)

toolsets: {}             # Optional: HolmesGPT data source toolsets
  # prometheus/metrics:
  #   enabled: true
  #   config:
  #     prometheus_url: "http://kube-prometheus-stack-prometheus.monitoring.svc:9090"

mcp_servers: {}          # Optional: Model Context Protocol servers
```

## Toolset Optimization (pre-v1.2)

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

!!! note "v1.2: Automatic toolset selection"
    v1.2 will introduce [two-phase toolkit selection](https://github.com/jordigilh/kubernaut/issues/434) that automatically loads only the toolsets relevant to each investigation. This section will be updated when that feature ships.

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

### Azure OpenAI

```yaml
llm:
  provider: azure
  model: gpt-4o
  endpoint: https://my-resource.openai.azure.com/
  timeout_seconds: 120
```

Secret: `kubectl create secret generic llm-credentials --from-literal=AZURE_API_KEY=...`

### Google Vertex AI

```yaml
llm:
  provider: vertexai
  model: gemini-2.5-pro
  gcp_project_id: my-project-id
  gcp_region: us-central1
  timeout_seconds: 180
```

Secret: `kubectl create secret generic llm-credentials --from-file=GOOGLE_APPLICATION_CREDENTIALS=service-account-key.json`

GCP Workload Identity is also supported -- the secret can be omitted when authentication is handled by the node metadata service.

### Local LLM (LiteLLM / air-gapped)

```yaml
llm:
  provider: litellm
  model: gpt-4o
  endpoint: http://litellm.internal.svc:4000
```

## Secrets Pairing

LLM API credentials are stored in a separate Kubernetes Secret (default name: `llm-credentials`). The chart mounts this Secret into the HAPI pod alongside the SDK config. The Secret name is configured via `holmesgptApi.llm.credentialsSecretName`.

The Secret is marked `optional: true` -- HAPI starts without it but all LLM calls fail until it is created.

## Temperature Tuning

- **0.3--0.5**: More deterministic. Recommended for production.
- **0.7** (default): Balanced.
- **0.8--1.0**: More creative. May discover non-obvious root causes but less consistent.

## Hot-Reload

The SDK config supports hot-reload. Changes to the ConfigMap are detected via the Python watchdog file watcher (~60s kubelet sync delay). No pod restart required.

## Reference File

A complete example is available in the chart: `charts/kubernaut/examples/sdk-config.yaml`
