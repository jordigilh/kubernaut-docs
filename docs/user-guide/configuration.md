# Configuration Reference

Kubernaut is configured via **Helm values** (for Helm deployments) or the **Kubernaut CR** (for Operator deployments), plus per-service **ConfigMaps**. This page documents the configuration surfaces — from deployment-specific values to namespace labels, signal sources, LLM providers, and operational tuning.

!!! note "v1.4 configuration highlights"
    - **Effectiveness Monitor — unified `monitoring` block.** Prometheus and AlertManager connection settings (`url`, enable flags, TLS CA, timeouts, scrape/lookback tuning, OpenShift RBAC bridges, and related options) are **grouped under a single `effectivenessmonitor.monitoring` YAML block**. Values that lived under legacy `effectivenessmonitor.external.*` paths **must migrate** when you upgrade Helm values files.
    - **Standardized log levels (#875).** Verbosity/logging configuration now uses **the same YAML key naming pattern across services**, so Helm values and bundled ConfigMaps line up consistently when adjusting log noise during install or runtime.
    - **Kubernaut Agent — camelCase and layout.** KA-mounted YAML migrated to **`camelCase`** fields per ADR-030 plus restructuring under **`runtime`**, **`ai`**, and **`integrations`**, supplied as separate **static** and **hot-reloadable** ConfigMaps. Rewrite existing manifests before rollout — details and samples are in **[Kubernaut Agent SDK config](configmap-kubernaut-agent.md)** (see the **v1.4 breaking YAML changes** warning at the top of that page).

## Namespace and Resource Labels

Kubernaut uses `kubernaut.ai/*` labels on namespaces and resources to control scope, enrichment, and classification. These labels are the primary way operators integrate their workloads with Kubernaut.

### Scope Control

| Label | Values | Description |
|---|---|---|
| `kubernaut.ai/managed` | `true` / `false` | Opt-in scope control. Only resources in managed namespaces (or with this label) are remediated. |

**Resolution order:** Resource label > Namespace label > Default (unmanaged)

To enable Kubernaut for a namespace:

```bash
kubectl label namespace my-app kubernaut.ai/managed=true
```

### Classification Labels

| Label | Values | Used By | Purpose |
|---|---|---|---|
| `kubernaut.ai/environment` | `production`, `staging`, `development`, `qa`, `test` | SP `policy.rego` (environment rules), AA approval | Environment classification and approval gates |
| `kubernaut.ai/business-unit` | Any string | SP `policy.rego` (custom labels rules) | Business unit classification (LLM context only) |
| `kubernaut.ai/service-owner` | Any string | SP `policy.rego` (custom labels rules) | Service owner team |
| `kubernaut.ai/criticality` | `critical`, `high`, `warning`, `info` | SP `policy.rego` (custom labels rules) | Business criticality |
| `kubernaut.ai/sla-tier` | `platinum`, `gold`, `silver`, `bronze` | SP `policy.rego` (custom labels rules) | SLA tier |

### Custom Labels

| Label Pattern | Used By | Purpose |
|---|---|---|
| `kubernaut.ai/label-*` | SP `policy.rego` (custom labels rules) | Arbitrary key-value pairs fed into workflow scoring (+0.15 per exact match, +0.075 wildcard) |

The `kubernaut.ai/label-` prefix is stripped by SP before passing to workflow discovery. Example:

```yaml
metadata:
  labels:
    kubernaut.ai/managed: "true"
    kubernaut.ai/environment: production
    kubernaut.ai/business-unit: payments
    kubernaut.ai/criticality: critical
    kubernaut.ai/label-team: checkout
    kubernaut.ai/label-region: us-east-1
```

See [Rego Policies](policies.md) for how each label feeds into enrichment, and [Workflow Search and Scoring](workflows.md#workflow-search-and-scoring) for how labels affect workflow discovery.

## Operator CR Configuration {: #operator-cr }

When deploying via the Kubernaut Operator, all configuration is expressed through the `Kubernaut` CR (`kubernaut.ai/v1alpha1`). The operator maps CR fields to the underlying ConfigMaps, Deployments, and RBAC resources.

For the complete CR field reference, see the [Operator CR API Reference](../api-reference/operator-cr.md).

Key differences from Helm:

| Concern | Helm | Operator CR |
|---|---|---|
| NetworkPolicies | Enabled by default, per-service toggles | Disabled by default (`spec.networkPolicies.enabled`) |
| Monitoring RBAC | Automatic when `kube-prometheus-stack` is installed | Controlled by `spec.monitoring.enabled` (default: `true`) |
| Database | In-chart PostgreSQL option | BYO only — `spec.postgresql.host` + `spec.postgresql.secretName` |
| KA runtime config | Direct ConfigMap editing | `spec.kubernautAgent.llm.runtimeConfigMapName` for BYO hot-reloadable config |
| Image references | Standard Helm `image.repository`/`image.tag` | `RELATED_IMAGE_*` env vars for disconnected installs |
| Agent RBAC extension | Manual ClusterRoleBinding creation | `spec.kubernautAgent.additionalClusterRoleBindings` (max 64) |

## Helm Values

All values are validated against `values.schema.json`. Run `helm lint` to check your overrides before installing.

### Global Settings

| Parameter | Description | Default |
|---|---|---|
| `global.image.registry` | Container image registry | `quay.io` |
| `global.image.namespace` | Image namespace/organization | `kubernaut-ai` |
| `global.image.separator` | Path separator (`/` for nested registries, `-` for flat registries like Docker Hub) | `/` |
| `global.image.tag` | Image tag override (defaults to `appVersion`) | `""` |
| `global.image.digest` | Immutable image digest; overrides tag when set (e.g., `sha256:abc...`) | `""` |
| `global.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `global.imagePullSecrets` | Array of image pull secret names for private registries | `[]` |
| `global.nodeSelector` | Global node selector applied to all pods | `{}` |
| `global.tolerations` | Global tolerations applied to all pods | `[]` |

Image paths are constructed as `{registry}{separator}{namespace}{separator}{service}:{tag}`. For example, with the defaults: `quay.io/kubernaut-ai/gateway:{{ image_tag }}`. For flat registries that don't support nested paths, set `separator: "-"` to produce `myregistry.example.com/kubernaut-ai-gateway:{{ image_tag }}`.

### Gateway

| Parameter | Description | Default |
|---|---|---|
| `gateway.replicas` | Number of gateway replicas | `1` |
| `gateway.resources` | CPU/memory requests and limits | See `values.yaml` |
| `gateway.service.type` | Kubernetes Service type | `ClusterIP` |
| `gateway.config.server.maxConcurrentRequests` | Maximum concurrent request processing | `100` |
| `gateway.config.server.readTimeout` | HTTP read timeout | `30s` |
| `gateway.config.server.writeTimeout` | HTTP write timeout | `30s` |
| `gateway.config.server.k8sRequestTimeout` | Timeout for Kubernetes API requests (TokenReview, SAR) | `15s` |
| `gateway.config.middleware.trustedProxyCIDRs` | Trusted proxy CIDRs for `X-Forwarded-For` extraction. Empty = fail-closed (proxy headers never trusted). | `[]` |
| `gateway.config.cors.allowedOrigins` | CORS allowed origins (string array). Gateway is an M2M API; the default rejects all browser clients. | `["https://no-browser-clients.invalid"]` |
| `gateway.config.cors.allowedMethods` | HTTP methods allowed in CORS preflight | `["GET","POST","PUT","PATCH","DELETE","OPTIONS"]` |
| `gateway.config.cors.allowCredentials` | Whether the `Access-Control-Allow-Credentials` header is set | `false` |
| `gateway.config.cors.maxAge` | CORS preflight cache duration (seconds) | `300` |
| `gateway.config.deduplication.cooldownPeriod` | Signal deduplication cooldown | `5m` |
| `gateway.auth.signalSources` | External signal sources requiring RBAC | `[]` |

### DataStorage

| Parameter | Description | Default |
|---|---|---|
| `datastorage.replicas` | Number of datastorage replicas | `1` |
| `datastorage.dbExistingSecret` | **Deprecated.** Override secret name for DataStorage DB credentials. Leave empty to use the consolidated `postgresql-secret`. Only needed when DataStorage must read from a separate secret (e.g., BYO PostgreSQL with split credentials). | `""` |
| `datastorage.config.database.sslMode` | PostgreSQL SSL mode | `disable` |
| `datastorage.config.database.maxOpenConns` | Maximum open database connections | `100` |
| `datastorage.config.database.maxIdleConns` | Maximum idle database connections | `20` |
| `datastorage.config.database.connMaxLifetime` | Maximum connection lifetime | `1h` |
| `datastorage.resources` | CPU/memory requests and limits | See `values.yaml` |
| `datastorage.service.type` | Kubernetes Service type | `ClusterIP` |

#### DataStorage Server Config (v1.5+)

| Parameter | Description | Default |
|---|---|---|
| `datastorage.config.server.maxBodySize` | Maximum request body size in bytes | `5242880` (5 MiB) |
| `datastorage.config.server.corsAllowedOrigins` | CORS allowed origins for browser-based access (e.g., Backstage console) | `[]` |
| `datastorage.config.server.signerCertDir` | Directory containing the certificate used to sign audit events | `/etc/certs` |

#### DataStorage Redis Config (v1.5+)

| Parameter | Description | Default |
|---|---|---|
| `datastorage.config.redis.dlqMaxLen` | Dead letter queue MAXLEN bound | `10000` |
| `datastorage.config.redis.tls.enabled` | Enable TLS for Redis/Valkey connections | `false` |
| `datastorage.config.redis.tls.certFile` | Client TLS certificate file path | `""` |
| `datastorage.config.redis.tls.keyFile` | Client TLS key file path | `""` |
| `datastorage.config.redis.tls.caFile` | CA certificate file path for server verification | `""` |

#### DataStorage Retention Config (v1.5+)

| Parameter | Description | Default |
|---|---|---|
| `datastorage.config.retention.enabled` | Enable automatic data retention cleanup | `true` |
| `datastorage.config.retention.interval` | How often the retention job runs | `24h` |
| `datastorage.config.retention.batchSize` | Number of rows processed per retention batch | `1000` |
| `datastorage.config.retention.defaultDays` | Default retention period in days | `2555` (~7 years) |

### Kubernaut Agent (LLM integration)

| Parameter | Description | Default |
|---|---|---|
| `kubernautAgent.replicas` | Number of replicas | `1` |
| `kubernautAgent.llm.credentialsSecretName` | Name of pre-existing Secret with LLM API keys | `llm-credentials` |
| `kubernautAgent.sdkConfigContent` | SDK config YAML content (via `--set-file`). The chart derives the Kubernetes ConfigMap objects that back the Agent SDK volumes from this file (**v1.4+**: split static + reloadable bundles). | `""` |
| `kubernautAgent.existingSdkConfigMap` | Pre-existing ConfigMap name for SDK config. Takes priority over `sdkConfigContent`. | `""` |

#### MCP Session Resilience (v1.5+) {: #ka-mcp-resilience }

These settings are part of the KA interactive config (`interactive:` block in the SDK config file):

| Parameter | Description | Default |
|---|---|---|
| `interactive.mcpKeepAlive` | Server-side SSE ping interval. Keeps MCP streams alive through proxy/router idle timeouts (e.g., OpenShift HAProxy 30s default). `0` disables. (#1387) | `15s` |
| `interactive.mcpSessionTimeout` | Auto-close idle MCP sessions that the AF abandoned without a proper disconnect. `0` means never. (#1387) | `10m` |

On the AF side, the `PooledMCPClient` performs a **Ping-on-Acquire** health check (2s bounded) before reusing a cached MCP session. Dead sessions are evicted and transparently replaced via the factory (#1387).

Kubernaut Agent uses two ConfigMaps: a **service config** (ports, logging, auth secret references) and an **SDK config** (LLM settings, toolsets, MCP servers). From **v1.4**, the SDK surface is supplied as **two** mounted ConfigMaps: one **static** (read at startup) and one **hot-reloadable** (watched for AI/tool/integration changes — no pod restart required for supported fields — see **[Kubernaut Agent SDK config](configmap-kubernaut-agent.md#hot-reload)**). Helm values and chart templates reflect that split — follow **`values.schema.json`** and [`configmap-kubernaut-agent.md`](configmap-kubernaut-agent.md) when upgrading.

The SDK config bundle is provided in one of two ways:

1. **Inline content** (recommended): Provide full SDK config content via `--set-file kubernautAgent.sdkConfigContent=my-sdk-config.yaml`. The chart creates the expected ConfigMaps from this content.
2. **External ConfigMap**: Set `kubernautAgent.existingSdkConfigMap` to reference a pre-existing ConfigMap (takes priority over `sdkConfigContent`).

One of these two options **must** be provided; the chart will fail at install time if neither is set.

### Notification Controller

| Parameter | Description | Default |
|---|---|---|
| `notification.replicas` | Number of replicas | `1` |
| `notification.routing.content` | Routing config YAML content (via `--set-file`). Chart creates ConfigMap from this. | `""` |
| `notification.routing.existingConfigMap` | Pre-existing ConfigMap name for routing config. Takes priority over `routing.content`. | `""` |
| `notification.credentials` | Projected volume sources from K8s Secrets | `[]` |

When neither `routing.content` nor `routing.existingConfigMap` is set, the chart generates a default routing config:

- If `notification.slack.secretName` **is set**, the chart generates a **`slack-and-console`** catch-all receiver that routes all notification types to both Slack and console.
- If `notification.slack.secretName` **is not set**, the chart generates a **console-only** default.

To provide fully custom routing:

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file notification.routing.content=my-routing.yaml \
  ...
```

Add credentials entries to mount the Slack webhook Secret into the notification pod:

```yaml
notification:
  credentials:
    - name: slack-webhook
      secretName: slack-webhook
      secretKey: webhook-url
```

### API Frontend (v1.5+)

The API Frontend service provides the REST API surface for external integrations, MCP/A2A agent protocols, and the Backstage console. It is always deployed starting in v1.5.

| Parameter | Description | Default |
|---|---|---|
| `apifrontend.enabled` | Enable API Frontend deployment | `true` |
| `apifrontend.replicas` | Number of replicas | `1` |
| `apifrontend.logging.level` | Log level | `INFO` |
| `apifrontend.config.server.httpPort` | Primary API port. Overridden by `PORT` environment variable if set (platform injection, e.g. Cloud Run). | `8443` |
| `apifrontend.config.server.metricsPort` | Prometheus metrics port | `9090` |
| `apifrontend.config.server.healthPort` | Health check port | `8081` |
| `apifrontend.config.session.disconnectTTL` | TTL before disconnected sessions are cleaned up | `10m` |
| `apifrontend.config.session.retentionTTL` | How long completed sessions are retained | `720h` |
| `apifrontend.config.interactive.enabled` | Enable interactive session MCP tools. When `false`, 11 session-dependent tools are hidden from MCP enumeration and the A2A agent tool list, leaving 12 stateless CRD/data tools; 13 with `kubernaut_list_alerts` if Prometheus is configured (#1366). | `true` |
| `apifrontend.config.severityTriage.enabled` | Enable severity triage. Required for alert tools (`list_alerts`, `get_alert_details`, `kubernaut_investigate_alert`). | `false` |
| `apifrontend.config.severityTriage.prometheusURL` | Prometheus API URL for alert queries. Required when `severityTriage.enabled: true`. | `""` |
| `apifrontend.config.severityTriage.cacheTTLSeconds` | Severity triage cache TTL | `30` |
| `apifrontend.config.severityTriage.llmConfidence` | LLM confidence threshold for severity triage | `0.7` |

#### Severity Triage (v1.5.1) {: #severity-triage-v151 }

The severity triage pipeline can use a **dedicated LLM** for LLM-based severity classification, separate from the A2A agent's LLM. This is configured via the `severityTriage.llm` block in the `apifrontend-config` ConfigMap — it is **not** exposed as a Helm value.

The Helm chart exposes only `cacheTTLSeconds` and `llmConfidence` (see table above). All other severity triage fields require a ConfigMap overlay or direct patch.

When deploying via the **Kubernaut Operator**, severity triage is auto-derived from `spec.monitoring.enabled` — there is no CRD field for `severityTriage`.

**ConfigMap fields** (in addition to the Helm-managed values above):

| ConfigMap key | Type | Description |
|---|---|---|
| `severityTriage.enabled` | bool | Enable severity triage pipeline |
| `severityTriage.prometheusURL` | string | Prometheus API URL (required when enabled) |
| `severityTriage.prometheusTlsCaFile` | string | CA cert for Prometheus TLS |
| `severityTriage.prometheusBearerTokenFile` | string | Bearer token file for Prometheus auth |
| `severityTriage.maxQueriesPerCall` | int | Max Prometheus queries per triage call (default 10) |
| `severityTriage.maxRulesEvaluated` | int | Max rules evaluated per triage (default 100) |
| `severityTriage.llm.provider` | string | LLM provider: `vertex_ai`, `gemini`, `anthropic` |
| `severityTriage.llm.model` | string | Model name |
| `severityTriage.llm.endpoint` | string | Custom endpoint URL |
| `severityTriage.llm.apiKeyFile` | string | Path to API key file |
| `severityTriage.llm.timeoutSeconds` | int | HTTP timeout (default 120) |
| `severityTriage.llm.tlsCaFile` | string | Custom CA for LLM endpoint |
| `severityTriage.llm.tlsCertFile` | string | Client cert for mTLS |
| `severityTriage.llm.tlsKeyFile` | string | Client key for mTLS |
| `severityTriage.llm.oauth2.enabled` | bool | Enable OAuth2 client credentials |
| `severityTriage.llm.oauth2.tokenURL` | string | OAuth2 token endpoint |
| `severityTriage.llm.oauth2.scopes` | []string | OAuth2 scopes |
| `severityTriage.llm.oauth2.credentialsDir` | string | Directory with `client-id`/`client-secret` |
| `severityTriage.llm.circuitBreaker.enabled` | bool | Enable circuit breaker |
| `severityTriage.llm.circuitBreaker.failureThreshold` | int | Failures before opening (default 5) |
| `severityTriage.llm.circuitBreaker.timeout` | string | Open-state duration (default 30s) |
| `severityTriage.llm.customHeaders` | []object | Custom headers (name/value or name/filePath) |

??? example "ConfigMap overlay with dedicated severity triage LLM"
    ```yaml
    severityTriage:
      enabled: true
      prometheusURL: "https://prometheus.monitoring:9090"
      prometheusTlsCaFile: /etc/apifrontend/tls-ca/ca.crt
      prometheusBearerTokenFile: "/var/run/secrets/kubernetes.io/serviceaccount/token"
      cacheTTLSeconds: 30
      maxQueriesPerCall: 10
      maxRulesEvaluated: 100
      llmConfidence: 0.7
      llm:
        provider: gemini
        model: gemini-2.0-flash
        apiKeyFile: /etc/apifrontend/llm-key/key
        timeoutSeconds: 120
    ```

| `apifrontend.resources.requests.memory` | Memory request | `64Mi` |
| `apifrontend.resources.requests.cpu` | CPU request | `50m` |
| `apifrontend.resources.limits.memory` | Memory limit | `256Mi` |
| `apifrontend.resources.limits.cpu` | CPU limit | `500m` |
| `apifrontend.config.auth.issuerURL` | OIDC issuer URL for token validation | `""` |
| `apifrontend.config.auth.audience` | Expected OIDC audience | `""` |
| `apifrontend.config.auth.jwtProviders[].claimMappings.username` | CEL expression to extract username from JWT claims (e.g., `claims.email`). Falls back to `preferred_username` / `sub` when empty (#1392). | `""` |
| `apifrontend.config.auth.jwtProviders[].claimMappings.groups` | CEL expression to extract groups from JWT claims (e.g., `claims.roles`). Falls back to `groups` claim when empty (#1392). | `""` |
| `apifrontend.config.rbac.sarCacheTTL` | SAR result cache TTL | `30s` |

#### JWT Providers (v1.5.1) {: #jwt-providers-v151 }

Both the Kubernaut Agent and API Frontend support **multiple JWT providers** via a `jwtProviders[]` array. The two services use intentionally different schemas.

**Kubernaut Agent** (`kubernautAgent.interactive.jwtProviders[]`):

| Parameter | Description | Default |
|---|---|---|
| `kubernautAgent.interactive.jwtProviders[].name` | Human-readable provider name (max 63 chars) | — |
| `kubernautAgent.interactive.jwtProviders[].issuer` | JWT issuer URL (must match `iss` claim, max 2048 chars) | — |
| `kubernautAgent.interactive.jwtProviders[].jwksURL` | JWKS endpoint URL (**required**, max 2048 chars, must be http/https) | — |
| `kubernautAgent.interactive.jwtProviders[].audience` | Expected audience claim (singular string) | — |
| `kubernautAgent.interactive.jwtProviders[].claimMappings.username` | Claim name for username extraction | `preferred_username` |
| `kubernautAgent.interactive.jwtProviders[].claimMappings.groups` | Claim name for group extraction (supports dot-notation) | `groups` |

Duplicate `issuer` URLs across providers are rejected at startup.

**API Frontend** (`apifrontend.config.auth.jwtProviders[]`):

| Parameter | Description | Default |
|---|---|---|
| `apifrontend.config.auth.jwtProviders[].name` | Provider name (optional but must be unique if set) | — |
| `apifrontend.config.auth.jwtProviders[].issuerURL` | OIDC issuer URL (**required**, must be https unless `allowInsecureIssuers`) | — |
| `apifrontend.config.auth.jwtProviders[].jwksURL` | JWKS endpoint (optional, falls back to `issuerURL` for OIDC discovery) | — |
| `apifrontend.config.auth.jwtProviders[].audiences` | Expected audience claims (**required**, non-empty string array) | — |
| `apifrontend.config.auth.jwtProviders[].claimMappings.username` | CEL expression or claim path for username | — |
| `apifrontend.config.auth.jwtProviders[].claimMappings.groups` | CEL expression or claim path for groups | — |

Legacy single-provider fields (`apifrontend.config.auth.issuerURL` + `apifrontend.config.auth.audience`) remain supported for backward compatibility.

!!! warning "Schema differences"
    KA uses `issuer` / `audience` (singular), AF uses `issuerURL` / `audiences` (plural array). KA requires `jwksURL`, AF makes it optional. AF supports CEL expressions in claim mappings, KA uses simple claim names.

??? example "Dual-provider configuration (Keycloak + SPIRE)"
    ```yaml
    # Kubernaut Agent (interactive sessions)
    kubernautAgent:
      interactive:
        enabled: true
        jwtProviders:
          - name: keycloak
            issuer: "https://keycloak.example.com/realms/kubernaut"
            jwksURL: "https://keycloak.example.com/realms/kubernaut/protocol/openid-connect/certs"
            audience: "kubernaut-agent"
            claimMappings:
              username: "preferred_username"
              groups: "groups"

    # API Frontend
    apifrontend:
      config:
        auth:
          jwtProviders:
            - name: keycloak
              issuerURL: "https://keycloak.example.com/realms/kagenti"
              jwksURL: "http://keycloak-service.keycloak:8080/realms/kagenti/protocol/openid-connect/certs"
              audiences: ["kubernaut-apifrontend"]
              claimMappings:
                username: "preferred_username"
                groups: "groups"
            - name: spire
              issuerURL: "https://oidc-discovery-provider.example.com"
              jwksURL: "https://spire-spiffe-oidc-discovery-provider.zero-trust-workload-identity-manager.svc:443/keys"
              audiences: ["spiffe://trust-domain/ns/kubernaut-system/sa/apifrontend"]
    ```

#### SPIRE JWT-SVID Integration (v1.5.1) {: #spire-integration-v151 }

SPIRE integration enables workload identity for A2A communication between Kubernaut and agents on other platforms (RHDH, ACM) that authenticate via SPIRE JWT-SVIDs. The integration requires [kagenti](https://github.com/kagenti/kagenti) (the SPIRE operator) and involves two layers: the **operator** registering the SPIFFE identity, and the **AF** validating SPIRE-issued JWTs.

**Prerequisites:**

- kagenti installed with a `SPIREClusterConfig` defining the trust domain
- SPIRE OIDC Discovery Provider deployed (exposes JWKS at `/.well-known/openid-configuration` and `/keys`)
- The trust domain must match across SPIRE server, ClusterSPIFFEID, and JWT `iss` claim

**Operator setup** (`spec.apiFrontend.spire`):

When `spire.enabled: true`, the operator:

1. Labels the namespace with `kagenti-enabled=true`
2. Creates a `ClusterSPIFFEID` resource registering a SPIFFE identity for the AF ServiceAccount: `spiffe://{trustDomain}/ns/{namespace}/sa/apifrontend`
3. kagenti's webhook injects the authbridge sidecar into the AF pod

| CR field | Description |
|---|---|
| `spec.apiFrontend.spire.enabled` | Enable SPIRE integration |
| `spec.apiFrontend.spire.className` | SPIRE class name from kagenti's `SPIREClusterConfig` (e.g., `zero-trust-workload-identity-manager-spire`) |
| `spec.apiFrontend.spire.trustDomain` | Override trust domain (default: uses SPIRE's `{% raw %}{{ .TrustDomain }}{% endraw %}` template variable) |

**AF JWT validation:**

Add SPIRE as a second JWT provider in `apiFrontend.config.auth.jwtProviders[]`. The AF validates SPIRE JWT-SVIDs using the OIDC Discovery Provider's JWKS endpoint:

```yaml
apifrontend:
  config:
    auth:
      jwtProviders:
        - name: keycloak
          issuerURL: "https://keycloak.example.com/realms/kagenti"
          audiences: ["kubernaut-apifrontend"]
        - name: spire
          issuerURL: "https://oidc-discovery-provider.example.com"
          jwksURL: "https://spire-spiffe-oidc-discovery-provider.zero-trust-workload-identity-manager.svc:443/keys"
          audiences: ["spiffe://apps.example.com/ns/kubernaut-system/sa/apifrontend"]
```

**kagenti auto-detection:**

When kagenti's authbridge sidecar is active, the operator auto-detects the OIDC issuer URL and JWKS URL from kagenti's `authbridge-config` ConfigMap. Explicit CR values take precedence over auto-detected values (`CM-6`). When auto-detection is active, `auth.issuerURL` is not required in the CR (`IA-2`).

**SPIFFE ID convention:**

```
spiffe://{trustDomain}/ns/{namespace}/sa/{serviceAccountName}
```

This follows kagenti's standard `/ns/{namespace}/sa/{serviceaccount}` path convention (FedRAMP SC-8, IA-5).

#### AF LLM Configuration (v1.5+)

The API Frontend has its own LLM provider for the A2A agent handler. The schema mirrors KA's `ai.llm` section, supporting `vertex_ai`, `gemini`, and `anthropic` providers. When `provider` is empty, the A2A handler returns 501 (not configured).

| Parameter | Description | Default |
|---|---|---|
| `apifrontend.config.agent.llm.provider` | LLM provider: `vertex_ai`, `gemini`, `anthropic` | `""` |
| `apifrontend.config.agent.llm.model` | Model name (e.g., `gemini-2.5-pro`) | `""` |
| `apifrontend.config.agent.llm.endpoint` | Custom LLM endpoint URL | `""` |
| `apifrontend.config.agent.llm.apiKeyFile` | Absolute path to file containing LLM API key (replaces env var) | `""` |
| `apifrontend.config.agent.llm.vertexProject` | GCP project (required for `vertex_ai`) | `""` |
| `apifrontend.config.agent.llm.vertexLocation` | GCP region (required for `vertex_ai`) | `""` |
| `apifrontend.config.agent.llm.tlsCaFile` | Custom CA certificate for LLM endpoint | `""` |
| `apifrontend.config.agent.llm.tlsCertFile` | Client certificate for mTLS (#1342) | `""` |
| `apifrontend.config.agent.llm.tlsKeyFile` | Client key for mTLS (#1342) | `""` |
| `apifrontend.config.agent.llm.timeoutSeconds` | HTTP timeout for LLM requests | `120` |
| `apifrontend.config.agent.llm.oauth2.enabled` | Enable OAuth2 client credentials for LLM gateway | `false` |
| `apifrontend.config.agent.llm.oauth2.tokenURL` | OAuth2 token endpoint (must be https) | `""` |
| `apifrontend.config.agent.llm.oauth2.scopes` | OAuth2 scopes | `[]` |
| `apifrontend.config.agent.llm.oauth2.credentialsDir` | Directory with `client-id` and `client-secret` files | `""` |
| `apifrontend.config.agent.llm.circuitBreaker.enabled` | Enable circuit breaker for LLM HTTP calls | `false` |
| `apifrontend.config.agent.llm.circuitBreaker.failureThreshold` | Failures before opening | `5` |
| `apifrontend.config.agent.llm.circuitBreaker.timeout` | Duration in open state before half-open | `30s` |
| `apifrontend.config.agent.llm.customHeaders` | Custom HTTP headers injected into LLM requests (name/value or name/filePath) | `[]` |
| `apifrontend.config.agent.kaBearerTokenFile` | Path to bearer token file for AF→KA MCP client authentication (#1287). When set, the AF sends this token in the `Authorization` header of KA MCP requests. | `""` |

```yaml
apifrontend:
  config:
    agent:
      llm:
        provider: gemini
        model: gemini-2.5-pro
        apiKeyFile: /etc/secrets/llm/api-key
        tlsCaFile: /etc/certs/llm-ca.pem
        circuitBreaker:
          enabled: true
          failureThreshold: 3
          timeout: 60s
```

!!! note "File-based API key"
    The AF reads the API key from `apiKeyFile` at startup (not from an environment variable). Mount the key as a Kubernetes Secret volume. The `LLM_API_KEY` env var is no longer supported (#1251).

### Controllers (Common Parameters)

All controllers (`aianalysis`, `signalprocessing`, `remediationorchestrator`, `workflowexecution`, `effectivenessmonitor`, `authwebhook`, `notification`) accept:

| Parameter | Description | Default |
|---|---|---|
| `<controller>.replicas` | Number of replicas | `1` |
| `<controller>.resources` | CPU/memory requests and limits | See `values.yaml` |
| `<controller>.podSecurityContext` | Pod-level security context override | `runAsNonRoot: true` + `seccompProfile: RuntimeDefault` (Tier 1); `seccompProfile: RuntimeDefault` only (Tier 2: postgresql, valkey) |
| `<controller>.containerSecurityContext` | Container-level security context override | `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]` |
| `<controller>.nodeSelector` | Per-component node selector (overrides global) | `{}` |
| `<controller>.tolerations` | Per-component tolerations (overrides global) | `[]` |
| `<controller>.affinity` | Pod affinity/anti-affinity rules | `{}` |
| `<controller>.topologySpreadConstraints` | Topology spread constraints | `[]` |
| `<controller>.pdb.enabled` | Create a PodDisruptionBudget | `false` |
| `<controller>.pdb.minAvailable` | PDB minimum available pods | -- |
| `<controller>.pdb.maxUnavailable` | PDB maximum unavailable pods | -- |

### WorkflowExecution

| Parameter | Description | Default |
|---|---|---|
| `workflowexecution.workflowNamespace` | Namespace for Job/PipelineRun execution | `kubernaut-workflows` |

### EffectivenessMonitor

| Parameter | Description | Default |
|---|---|---|
| `effectivenessmonitor.config.assessment.stabilizationWindow` | EM-internal stabilization window (logged at startup). **Note:** the actual stabilization delay enforced by the EM reconciler is read from `EA.spec.config.stabilizationWindow`, which is set by the RO (default `5m` via `remediationorchestrator.config.effectivenessAssessment.stabilizationWindow`). | `30s` |
| `effectivenessmonitor.config.assessment.validityWindow` | Time window for assessment validity | `120s` |

Prometheus and AlertManager endpoints are configured via the **unified `monitoring` block** (see [Monitoring](#monitoring) below), not under `effectivenessmonitor`. The chart propagates `monitoring.*` values to both the EffectivenessMonitor and Kubernaut Agent.

### Monitoring

Beginning with **v1.4**, Prometheus and AlertManager connection settings are configured via a **top-level `monitoring` block** — a single source of truth propagated to both the EffectivenessMonitor and Kubernaut Agent.

| Parameter | Description | Default |
|---|---|---|
| `monitoring.prometheus.enabled` | Enable Prometheus integration | `false` |
| `monitoring.prometheus.url` | Prometheus URL | `""` |
| `monitoring.prometheus.tlsCaFile` | Path to PEM CA bundle for HTTPS connections to Prometheus | `""` |
| `monitoring.alertManager.enabled` | Enable AlertManager integration | `false` |
| `monitoring.alertManager.url` | AlertManager URL | `""` |
| `monitoring.alertManager.tlsCaFile` | Path to PEM CA bundle for HTTPS connections to AlertManager | `""` |

### AIAnalysis

| Parameter | Description | Default |
|---|---|---|
| `aianalysis.replicas` | Number of replicas | `1` |
| `aianalysis.rego.confidenceThreshold` | Auto-approval confidence threshold (nil = use Rego default 0.8) | `null` |
| `aianalysis.policies.content` | Approval policy Rego content (via `--set-file`). Chart creates ConfigMap. | `""` |
| `aianalysis.policies.existingConfigMap` | Pre-existing ConfigMap name for approval policy. Takes priority. | `""` |

One of `policies.content` or `policies.existingConfigMap` **must** be provided; the chart fails at install if neither is set. See [AIAnalysis Approval Policy](configmap-approval.md) for the full schema and customization guide.

### SignalProcessing

| Parameter | Description | Default |
|---|---|---|
| `signalprocessing.replicas` | Number of replicas | `1` |
| `signalprocessing.policies.content` | Unified Rego policy content (via `--set-file`). Chart creates `signalprocessing-policy` ConfigMap. | `""` |
| `signalprocessing.policies.existingConfigMap` | Pre-existing ConfigMap name for the unified Rego policy. Takes priority over `policies.content`. | `""` |
| `signalprocessing.proactiveSignalMappings.content` | Proactive signal mappings YAML (via `--set-file`). Chart creates ConfigMap. | `""` |
| `signalprocessing.proactiveSignalMappings.existingConfigMap` | Pre-existing ConfigMap name for proactive signal mappings. | `""` |

One of `policies.content` or `policies.existingConfigMap` **must** be provided; the chart fails at install if neither is set. The policy file is a single `.rego` file (not a YAML bundle) containing all classification rules under `package signalprocessing`. Proactive signal mappings are optional and injected separately. See [SignalProcessing Rego Policies](configmap-policies.md) for the policy structure and customization guide.

### PostgreSQL

All PostgreSQL credentials must be provided via pre-created Kubernetes Secrets. See [Provision Secrets](../getting-started/installation.md#2-provision-secrets).

| Parameter | Description | Default |
|---|---|---|
| `postgresql.enabled` | Deploy in-chart PostgreSQL | `true` |
| `postgresql.variant` | PostgreSQL distribution variant (`upstream` or `ocp`). `ocp` uses Red Hat RHEL10 image with `POSTGRESQL_*` env vars and non-root UID 26, compatible with `restricted-v2` SCC. | `upstream` |
| `postgresql.replicas` | Number of replicas | `1` |
| `postgresql.image` | PostgreSQL container image | `postgres:16-alpine` |
| `postgresql.auth.existingSecret` | Pre-created Secret with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` keys (required) | `""` |
| `postgresql.auth.username` | Database username (only used when chart creates the DB) | `slm_user` |
| `postgresql.auth.database` | Database name (only used when chart creates the DB) | `action_history` |
| `postgresql.storage.size` | PVC size | `10Gi` |
| `postgresql.storage.storageClassName` | StorageClass (empty = cluster default) | `""` |

To use an external PostgreSQL instance, set `postgresql.enabled=false` and provide the connection details:

| Parameter | Description | Default |
|---|---|---|
| `postgresql.host` | External PostgreSQL hostname (required when `enabled=false`) | `""` |
| `postgresql.port` | External PostgreSQL port | `5432` |

### Valkey

All Valkey credentials must be provided via pre-created Kubernetes Secrets. See [Provision Secrets](../getting-started/installation.md#2-provision-secrets).

| Parameter | Description | Default |
|---|---|---|
| `valkey.enabled` | Deploy in-chart Valkey | `true` |
| `valkey.replicas` | Number of replicas | `1` |
| `valkey.image` | Valkey container image | `valkey/valkey:8-alpine` |
| `valkey.existingSecret` | Pre-created Secret with `valkey-secrets.yaml` key containing `password: <pass>` (required) | `""` |
| `valkey.storage.size` | PVC size | `512Mi` |
| `valkey.storage.storageClassName` | StorageClass (empty = cluster default) | `""` |

To use an external Valkey instance, set `valkey.enabled=false` and provide:

| Parameter | Description | Default |
|---|---|---|
| `valkey.host` | External Valkey hostname (required when `enabled=false`) | `""` |
| `valkey.port` | External Valkey port | `6379` |

## Signal Source Authentication

External signal sources need RBAC authorization. Configure via Helm:

```yaml
gateway:
  auth:
    signalSources:
      - name: alertmanager
        serviceAccount: alertmanager-kube-prometheus-stack-alertmanager
        namespace: monitoring
```

Each entry creates a `ClusterRoleBinding` granting the ServiceAccount permission to submit signals.

See [Security & RBAC -- Signal Ingestion](../architecture/security-rbac.md#signal-ingestion) for the full TokenReview + SAR authentication flow and RBAC details. See [Installation -- Signal Source Authentication](../getting-started/installation.md#signal-source-authentication) for AlertManager configuration examples.

## LLM Provider Setup

LLM configuration lives in the **SDK config** file, not in `values.yaml`. See [Kubernaut Agent SDK config](configmap-kubernaut-agent.md) for the full schema and provider examples.

**Quick setup:**

1. Copy the example SDK config from the chart:

```bash
cp charts/kubernaut/examples/sdk-config.yaml my-sdk-config.yaml
```

2. Edit `my-sdk-config.yaml` -- set `llm.provider`, `llm.model`, and any provider-specific fields.

3. Create the API key Secret:

```bash
kubectl create secret generic llm-credentials \
  --namespace kubernaut-system \
  --from-literal=OPENAI_API_KEY="sk-..."
```

4. Pass the SDK config during install:

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file kubernautAgent.sdkConfigContent=my-sdk-config.yaml \
  ...
```

### Temperature Tuning

The `temperature` parameter in the SDK config (default 0.7) controls the LLM's creativity vs determinism:

- **Lower (0.3--0.5):** More deterministic workflow selection. Recommended for production environments where consistency is critical.
- **Default (0.7):** Balanced. Good for most environments.
- **Higher (0.8--1.0):** More creative investigation. May discover non-obvious root causes but with less consistent workflow selection.

## Remediation Timeouts and Routing

The RemediationOrchestrator exposes per-phase timeouts and routing thresholds as `values.yaml` parameters under `remediationorchestrator.config`.

### Phase Timeouts

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.config.timeouts.global` | `1h` | Total remediation timeout |
| `remediationorchestrator.config.timeouts.processing` | `5m` | Signal Processing phase |
| `remediationorchestrator.config.timeouts.analyzing` | `10m` | AI Analysis (Kubernaut Agent investigation) |
| `remediationorchestrator.config.timeouts.executing` | `30m` | Workflow execution |
| `remediationorchestrator.config.timeouts.verifying` | `30m` | Effectiveness assessment |

Individual `RemediationRequest` resources can override timeouts via `spec.timeouts`.

### Routing Configuration

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.config.routing.consecutiveFailureThreshold` | `3` | Block a resource after N consecutive remediation failures |
| `remediationorchestrator.config.routing.consecutiveFailureCooldown` | `1h` | How long to block after hitting the threshold |
| `remediationorchestrator.config.routing.recentlyRemediatedCooldown` | `5m` | Minimum interval between successful remediations for the same resource |
| `remediationorchestrator.config.routing.ineffectiveChainThreshold` | `3` | Consecutive ineffective remediations before escalation |
| `remediationorchestrator.config.routing.recurrenceCountThreshold` | `5` | Safety-net recurrence count |
| `remediationorchestrator.config.routing.ineffectiveTimeWindow` | `4h` | Lookback window for ineffective chain detection |

These settings prevent remediation storms and avoid repeating failed approaches.

### Async Propagation Delays

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.config.asyncPropagation.gitOpsSyncDelay` | `3m` | Wait time for GitOps (ArgoCD/Flux) to sync before effectiveness assessment |
| `remediationorchestrator.config.asyncPropagation.operatorReconcileDelay` | `1m` | Wait time for operator-managed resources to reconcile |
| `remediationorchestrator.config.asyncPropagation.proactiveAlertDelay` | `5m` | Wait time for proactive alert resolution before assessment |

### Notification Settings

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.config.notifications.notifySelfResolved` | `false` | Emit a notification when a remediation self-resolves (alert clears before execution) |

### CRD Retention

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.config.retention.period` | `24h` | Time-to-live for completed RemediationRequest CRDs before automatic cleanup |

## Execution Namespace

Workflow Jobs and Tekton PipelineRuns execute in a dedicated namespace, separate from the target resource's namespace. This creates a security boundary.

| Parameter | Default | Description |
|---|---|---|
| `workflowexecution.workflowNamespace` | `kubernaut-workflows` | Namespace for workflow execution |
| `workflowexecution.config.execution.cooldownPeriod` | `1m` | Cooldown between executions |
| `workflowexecution.config.tekton.enabled` | `nil` | Tekton Pipelines engine toggle. `nil` or `true` = auto-discover Tekton CRDs at startup; `false` = disable Tekton engine. |

The `kubernaut-workflow-runner` ServiceAccount has pre-configured RBAC to read and patch resources across namespaces. See [Security & RBAC -- Workflow Execution](../architecture/security-rbac.md#workflow-execution) for the full permission list.

## Ansible Engine (AWX/AAP)

To enable the Ansible execution engine for workflows that run Ansible playbooks via AWX or AAP, configure the `workflowexecution.config.ansible` block.

### 1. Create the AWX API token secret

Generate an API token in your AWX/AAP instance and store it in a Kubernetes Secret. The secret name is user-chosen -- it just needs to match `tokenSecretRef.name` in step 3.

```bash
kubectl create secret generic awx-api-token \
  --from-literal=token=<YOUR_AWX_API_TOKEN> \
  -n kubernaut-system
```

Replace `awx-api-token` with your preferred name (e.g. `aap-api-token` for AAP deployments).

### 2. Grant RBAC for the token secret

The `workflowexecution-controller` ServiceAccount needs permission to read the token secret at startup. The chart does **not** create this RBAC automatically -- you must create it:

```bash
kubectl create role awx-token-reader \
  --verb=get --resource=secrets --resource-name=awx-api-token \
  -n kubernaut-system

kubectl create rolebinding awx-token-reader \
  --role=awx-token-reader \
  --serviceaccount=kubernaut-system:workflowexecution-controller \
  -n kubernaut-system
```

Replace `awx-api-token` in `--resource-name` with the secret name you chose in step 1.

!!! warning "Without this RBAC, the ansible executor is silently skipped"
    The controller logs `"Failed to read AWX token secret, ansible executor not available"` and only registers the `job` and `tekton` engines. Any `WorkflowExecution` with `engine: ansible` will fail with `unsupported execution engine: "ansible"`.

### 3. Configure Helm values

Uncomment the ansible block in your values file:

```yaml
workflowexecution:
  config:
    ansible:
      apiURL: "https://awx.example.com"
      insecure: false            # set true to skip TLS verification
      organizationID: 1          # AWX organization ID for credential creation
      tokenSecretRef:
        name: awx-api-token      # Secret created in step 1
        key: token               # key within the Secret
        namespace: ""            # empty = release namespace (kubernaut-system)
```

| Parameter | Required | Default | Description |
|---|---|---|---|
| `ansible.apiURL` | Yes | -- | AWX/AAP API base URL |
| `ansible.insecure` | No | `false` | Skip TLS certificate verification |
| `ansible.organizationID` | No | `1` | AWX organization ID for ephemeral credential creation |
| `ansible.tokenSecretRef.name` | Yes | -- | Kubernetes Secret name containing the AWX API token |
| `ansible.tokenSecretRef.key` | No | `token` | Key within the Secret |
| `ansible.tokenSecretRef.namespace` | No | release namespace | Namespace of the token Secret |

### 4. Verify

After installing or upgrading with the ansible config, check the controller logs:

```bash
kubectl logs -n kubernaut-system deployment/workflowexecution-controller | grep -i ansible
```

Expected output:

```
"Ansible executor registered" "awxURL"="https://awx.example.com" "organizationID"=1
```

```
"Executor registry initialized" "engines"=["tekton","job","ansible"]
```

!!! note "Automatic K8s API credentials for playbooks"
    The ansible executor automatically injects the WE controller's in-cluster ServiceAccount token as an ephemeral AWX credential on every job launch. Playbooks using `kubernetes.core` modules receive `K8S_AUTH_HOST`, `K8S_AUTH_API_KEY`, and `K8S_AUTH_SSL_CA_CERT` without manual credential configuration. If the in-cluster environment is unavailable, the job proceeds without K8s credentials.

For authoring ansible workflows, see [Ansible (AWX/AAP) in Remediation Workflows](workflows.md#ansible-awxaap) and [Workflow Execution Architecture](../architecture/workflow-execution.md#ansible-awxaap).

## TLS and Certificate Management

Kubernaut configures **inter-service TLS** (REST between components) and **admission webhook TLS** (Auth Webhook). The Helm values below cover both surfaces; the following subsections describe how admission webhook certificates are generated in each mode.

### Inter-service TLS (Helm)

These values control mTLS and HTTPS for internal service-to-service calls (for example, Gateway → DataStorage). When the server finds TLS material under `tls.interService.certDir`, the primary API port (**8080**) uses HTTPS; health (**8081**) and metrics (**9090**) stay plain HTTP.

| Parameter | Description | Default |
|---|---|---|
| `tls.mode` | How TLS is provisioned: **`hook`** (default) or **`cert-manager`**. A separate **`manual`** mode exists for **admission webhook** certificates only; see [Manual Mode](#manual-mode-tlsmode-manual-external-pki) below. | `hook` |
| `tls.interService.certDir` | Directory mounted in pods containing the server cert/key (and related material) for inter-service listeners. | `/etc/tls` |
| `tls.interService.caFile` | Path to the PEM CA bundle used to **verify peer** certificates (client CA). | `/etc/tls-ca/ca.crt` |
| `tls.certManager.issuerRef.name` | **Required** when `tls.mode=cert-manager` -- Issuer or ClusterIssuer that signs inter-service and webhook certificates. | -- |
| `tls.certManager.issuerRef.kind` | Issuer kind (`Issuer` or `ClusterIssuer`). | `ClusterIssuer` |
| `tls.certManager.issuerRef.group` | API group for the Issuer reference. | `cert-manager.io` |

When `tls.mode=cert-manager`, the chart creates **cert-manager** `Certificate` resources. Recommended renewal settings (align with the chart defaults): **`duration: 8760h`** (365 days), **`renewBefore: 720h`** (30 days before expiry).

**Kubernaut Agent** (scraping / TLS to peers):

| Parameter | Description | Default |
|---|---|---|
| `kubernautAgent.prometheus.tls.enabled` | Enable TLS for Prometheus client connections from the agent. | (see `values.yaml`) |
| `kubernautAgent.prometheus.tls.caConfigMapName` | ConfigMap name holding the CA to trust. | (see `values.yaml`) |
| `kubernautAgent.prometheus.tls.caConfigMapKey` | Key within that ConfigMap for the PEM CA. | (see `values.yaml`) |

### Admission webhook TLS modes

The Auth Webhook requires a TLS server certificate for traffic from the Kubernetes API server. Inter-service and webhook TLS use the same `tls.mode` (and cert-manager issuer when applicable). The chart supports **three** modes for **admission** certificates, all selected with `tls.mode`:

### Hook Mode (`tls.mode: hook`) -- Default

Self-signed certificates are generated and managed by Helm hooks. No external dependencies required. Suitable for development, testing, and CI environments.

**How it works:**

1. **Pre-install/pre-upgrade** (`tls-cert-gen`): Generates a self-signed CA and server certificate, stored as the `authwebhook-tls` Secret and `authwebhook-ca` ConfigMap.
2. **Post-install/post-upgrade** (`tls-cabundle-patch`): Patches the `caBundle` field on the webhook configurations.
3. **Post-delete** (`tls-cleanup`): Removes the `authwebhook-tls` Secret and `authwebhook-ca` ConfigMap.

**Automatic renewal**: On `helm upgrade`, if the certificate expires within 30 days, it is automatically regenerated. Additionally, the AuthWebhook init-container patches the `caBundle` on every pod restart, making the TLS configuration self-healing.

**Recovery**: If the `authwebhook-ca` ConfigMap is accidentally deleted while `authwebhook-tls` still exists, delete the `authwebhook-tls` Secret and run `helm upgrade` to regenerate both:

```bash
kubectl delete secret authwebhook-tls -n kubernaut-system
helm upgrade kubernaut kubernaut/kubernaut -n kubernaut-system -f my-values.yaml
```

> **Note**: `helm template` output will not show `caBundle` on webhook configurations. This is expected -- the hook injects it at runtime after the webhook resources are created.

### cert-manager Mode (`tls.mode: cert-manager`) -- Production

Certificates are managed by [cert-manager](https://cert-manager.io/). Recommended for production environments. cert-manager handles issuance, renewal, and `caBundle` injection automatically.

**Prerequisites:**

1. Install cert-manager (v1.12+):

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=120s
```

2. Create an Issuer or ClusterIssuer. For development with cert-manager, a self-signed issuer works:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-issuer
spec:
  selfSigned: {}
```

For production, use your organization's CA or an ACME issuer (e.g., Let's Encrypt).

3. Install the chart with cert-manager mode:

```bash
helm install kubernaut kubernaut/kubernaut \
  --namespace kubernaut-system \
  --set tls.mode=cert-manager \
  --set tls.certManager.issuerRef.name=selfsigned-issuer \
  -f my-values.yaml
```

The chart creates a `Certificate` resource (`authwebhook-cert`) that provisions the `authwebhook-tls` Secret. cert-manager's `cainjector` automatically writes the `caBundle` into the webhook configurations via the `cert-manager.io/inject-ca-from` annotation.

**No TLS hook jobs** are created in this mode -- cert-manager handles the full lifecycle including renewal.

### Migrating from Hook to cert-manager

To switch an existing installation from `tls.mode=hook` to `tls.mode=cert-manager`:

1. Install cert-manager and create an Issuer/ClusterIssuer (see [Installation](../getting-started/installation.md))
2. Upgrade with the new mode:

    ```bash
    helm upgrade kubernaut charts/kubernaut \
      --namespace kubernaut-system \
      --set tls.mode=cert-manager \
      --set tls.certManager.issuerRef.name=your-issuer \
      -f my-values.yaml
    ```

3. The hook-generated Secret and ConfigMap are replaced by cert-manager-managed resources. The old hook cleanup job removes the previous artifacts.
4. Verify the webhook is serving the new certificate:

    ```bash
    kubectl get certificate -n kubernaut-system
    kubectl get secret authwebhook-tls -n kubernaut-system -o jsonpath='{.metadata.annotations}'
    ```

See [Troubleshooting](../operations/troubleshooting.md) if webhook calls fail after migration.

### Manual Mode (`tls.mode: manual`) -- External PKI

For environments where TLS certificates are managed externally (service mesh, external PKI, CI pipelines). The chart creates no TLS-related hook Jobs, no `Certificate` resources, and no `caBundle` patching.

**Operator responsibilities:**

1. Pre-create the `authwebhook-tls` Secret with `tls.crt` and `tls.key` entries
2. Pre-create the `authwebhook-ca` ConfigMap with the CA bundle
3. Ensure the `caBundle` field on `ValidatingWebhookConfiguration` resources matches the CA

```bash
helm install kubernaut charts/kubernaut/ \
  --namespace kubernaut-system \
  --set tls.mode=manual \
  -f my-values.yaml
```

This mode is useful when a service mesh (e.g., Istio) handles mTLS between the API server and webhooks, or when certificates are provisioned by an external PKI and injected via a sidecar or init container.

### CA Bundle Self-Healing

In `hook` mode, the AuthWebhook deployment includes an init-container that patches the `caBundle` field on the `ValidatingWebhookConfiguration` at startup. This makes TLS self-healing across Helm upgrades and interrupted installs -- if the `caBundle` drifts from the actual CA, the next pod restart corrects it automatically.

## Hot-Reload and Graceful Shutdown

Understanding which configuration changes take effect live vs which require a restart is critical for operational confidence.

### Hot-Reload Support

| Configuration | Hot-Reload | Mechanism | Latency |
|---|---|---|---|
| SP unified Rego policy (`policy.rego` -- environment, severity, priority, custom labels) | Yes | fsnotify file watcher | ~60s (kubelet sync) |
| AA approval policy | Yes | fsnotify file watcher | ~60s |
| Notification credentials | Yes | fsnotify file watcher | ~60s |
| Notification routing | Yes | fsnotify file watcher | ~60s |
| Kubernaut Agent (**v1.4+**: hot-reloadable ConfigMap bundle; startup-only YAML stays fixed until restart) | Yes (reloadable tier) | fsnotify watcher on watched volume | ~60s |
| Gateway config | No | Restart required | -- |
| DataStorage config | No | Restart required | -- |
| Proactive signal mappings | No | Restart required | -- |

Policies are validated before reload -- if the new policy has a syntax error, the previous policy is kept and an error is logged. No service interruption occurs.

### Graceful Shutdown

All services implement graceful shutdown to ensure in-flight remediations are not disrupted during rolling updates:

| Service | Shutdown Behavior |
|---|---|
| **Gateway** | Sets shutdown flag → readiness probe returns 503 → waits 5s for endpoint removal → drains in-flight requests → closes resources |
| **DataStorage** | Same 4-step sequence as Gateway |
| **CRD Controllers** (SP, AA, RO, WFE, EM, NT) | controller-runtime built-in signal handling; in-flight reconciles complete |
| **Kubernaut Agent** | Go graceful shutdown; readiness returns 503; in-flight investigations complete |

This means `helm upgrade` and rolling updates do not disrupt in-flight remediations. The readiness probe change ensures no new traffic reaches the pod during drain.

## Next Steps

- [Kubernaut Agent SDK config](configmap-kubernaut-agent.md) -- LLM provider, toolsets, and MCP server configuration
- [SignalProcessing Rego Policies](configmap-policies.md) -- Policy bundle format and customization
- [AIAnalysis Approval Policy](configmap-approval.md) -- Approval gates and risk factors
- [Notification Routing](configmap-notification.md) -- Routing schema and Slack setup
- [Rego Policies](policies.md) -- Rego language reference for classification policies
- [Notification Channels](notifications.md) -- Setting up Slack and other channels
- [Remediation Workflows](workflows.md) -- Authoring and registering workflows
- [Installation](../getting-started/installation.md) -- Using these values during deployment
