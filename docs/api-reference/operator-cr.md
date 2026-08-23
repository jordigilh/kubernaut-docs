# Operator CR API Reference

The `Kubernaut` custom resource (**`kubernaut.ai/v1alpha2`**, v1.6+) is the single deployment artifact for the Kubernaut Operator. One CR named `kubernaut` per namespace configures the entire platform.

**Source**: [`kubernaut-operator/api/v1alpha2/kubernaut_types.go`](https://github.com/jordigilh/kubernaut-operator/blob/main/api/v1alpha2/kubernaut_types.go)
**CRD schema**: [`kubernaut-operator/config/crd/bases/kubernaut.ai_kubernauts.yaml`](https://github.com/jordigilh/kubernaut-operator/blob/main/config/crd/bases/kubernaut.ai_kubernauts.yaml)
**Minimal sample**: [`config/samples/v1alpha2_kubernaut_minimal.yaml`](https://github.com/jordigilh/kubernaut-operator/blob/main/config/samples/v1alpha2_kubernaut_minimal.yaml)

!!! info "v1alpha1 -> v1alpha2 (ADR-CRD-001)"
    `v1alpha2` is the new storage version as of v1.6. `v1alpha1` remains served through a conversion webhook (`v1alpha2` as hub, `v1alpha1` as spoke) so existing CRs continue to work, but **new deployments should use `v1alpha2` directly**. See [Upgrading from v1alpha1](#upgrading-from-v1alpha1) below for the full field mapping and the two behavior changes that are not simple renames.

## `spec` (KubernautSpec)

!!! warning "CR validation"
    The operator's admission validation rejects the CR if any of the following are missing:

    - `spec.postgresql.host`, `spec.postgresql.secretName`
    - `spec.valkey.host`, `spec.valkey.secretName`
    - `spec.llmProfiles` — at least one named profile, each with `provider`, `model`, `credentialsSecretName` (`endpoint` additionally required when `provider: openai`)
    - `spec.aiAnalysis.policy.configMapName` — must reference a ConfigMap containing key `approval.rego`
    - `spec.signalProcessing.policy.configMapName` — must reference a ConfigMap containing key `policy.rego`
    - `spec.kubernautAgent.llmProfileRef` (when set) — must reference a profile key defined in `spec.llmProfiles`

    Create these resources **before** applying the Kubernaut CR. See [Installation Prerequisites](../getting-started/installation.md#prerequisites).

### Required fields

| Field | Type | Description |
|---|---|---|
| `postgresql` | [PostgreSQLSpec](#postgresqlspec) | BYO PostgreSQL connection |
| `valkey` | [ValkeySpec](#valkeyspec) | BYO Valkey/Redis connection |
| `llmProfiles` | `map[string]`[LLMProfileSpec](#llmprofilespec) | **New in v1alpha2.** Named LLM provider profiles (min 1 entry), referenced by name from `kubernautAgent.llmProfileRef` and other components |
| `aiAnalysis` | [AIAnalysisSpec](#aianalysisspec) | **Parent key now required** (v1alpha2 closes a v1alpha1 loophole — see F9 in the callout below). `policy.configMapName` inside it was already required. |
| `signalProcessing` | [SignalProcessingSpec](#signalprocessingspec) | **Parent key now required**, same reason as `aiAnalysis` above |
| `kubernautAgent` | [KubernautAgentSpec](#kubernautagentspec) | Parent key required, but every field inside it is optional — `{}` is a valid value when `llmProfiles` has exactly one profile |

!!! note "Why `aiAnalysis`/`signalProcessing` themselves became required"
    In v1alpha1, `KubernautSpec.AIAnalysis`/`SignalProcessing` carried `omitempty`, so a CR could omit the parent key entirely and Kubernetes' structural-schema validator never evaluated the nested `policy` requirement — a live-cluster spike found such a CR was admitted with no error. v1alpha2 drops `omitempty` on the parent fields too, closing the loophole (`spec.aiAnalysis: Required value` is now returned). This has no effect on any CR that already set `policy.configMapName` (the overwhelming majority), only on the narrow case that omitted the whole block.

### Optional fields

| Field | Type | Default | Description |
|---|---|---|---|
| `image` | [ImageSpec](#imagespec) | — | Pull policy, secrets, and per-component image overrides |
| `notification` | [NotificationSpec](#notificationspec) | — | Slack, routing ConfigMap, logging, resources |
| `remediationOrchestrator` | [RemediationOrchestratorSpec](#remediationorchestratorspec) | — | Timeouts, routing, dry-run, retention |
| `workflowExecution` | [WorkflowExecutionSpec](#workflowexecutionspec) | — | Execution namespace, cooldown, Tekton toggle, **Ansible/AWX (moved here in v1alpha2, F4)**, Fleet write-scoped OAuth2 |
| `effectivenessMonitor` | [EffectivenessMonitorSpec](#effectivenessmonitorspec) | — | Stabilization/validity windows |
| `monitoring` | [MonitoringSpec](#monitoringspec) | unset (OCP auto-detect) | **New shape in v1alpha2 (F2).** Prometheus/AlertManager endpoint overrides for EffectivenessMonitor, Kubernaut Agent, and API Frontend severity-triage — **not** the v1alpha1 `monitoring.enabled` RBAC toggle, which is removed (see the callout below) |
| `gateway` | [GatewaySpec](#gatewayspec) | — | Route, config, AlertManager webhook token, Fleet OAuth2 override |
| `apiFrontend` | [APIFrontendSpec](#apifrontendspec) | enabled | MCP/A2A gateway, OIDC auth, SAR-based tool authorization, severity-triage LLM profile, session/MCP timeout tuning |
| `authWebhook` | [AuthWebhookSpec](#authwebhookspec) | — | Logging, resources |
| `dataStorage` | [DataStorageSpec](#datastoragespec) | — | Endpoint propagation delay, retention, signing cert, **OpenTelemetry tracing (new)**, DB/server tuning |
| `console` | [ConsoleSpec](#consolespec) | disabled | Kubernaut Console deployment |
| `networkPolicies` | [NetworkPoliciesSpec](#networkpoliciesspec) | always on | **`enabled` toggle removed in v1alpha2 (F3)** — NetworkPolicies are now unconditional, matching the Helm chart. Remaining fields only tune the always-on policy set. |
| `fleet` | [FleetSpec](#fleetspec) | disabled | **New in v1alpha2/v1.6 (ADR-068).** Federated scope-checking backend and MCP Gateway connection for [Fleet Management](../architecture/fleet.md) |
| `fleetMetadataCache` | [FleetMetadataCacheSpec](#fleetmetadatacachespec) | disabled | Operator-managed Fleet Metadata Cache (FMC) service. Most deployments that enable `fleet` use `backend: acm` instead and leave this disabled. |
| `additionalClusterRoles` | []string | — | **Generalized in v1alpha2 (moved from `kubernautAgent.additionalClusterRoleBindings`).** Pre-existing ClusterRole names bound to every component that resolves ecosystem-CRD owner chains (Kubernaut Agent, Gateway, EffectivenessMonitor), not just KA. Max 64. **Privilege escalation risk** — restrict who may edit the Kubernaut CR. |

!!! warning "`spec.monitoring` changed meaning, it did not just get removed"
    v1alpha1's `spec.monitoring.enabled` (a plain bool) provisioned 2 RBAC-only ClusterRoles (`alertmanager-view`, `gateway-signal-source`) and auto-derived Prometheus/AlertManager URLs, all-or-nothing. **That field is gone in v1alpha2.** In its place, a differently-shaped `spec.monitoring.{prometheus,alertManager}` was added for a different purpose: *overriding* the Prometheus/AlertManager endpoint URL used by EffectivenessMonitor, Kubernaut Agent, and API Frontend severity-triage (each independently toggleable via its own `enabled` field, defaulting `true` = auto-detected OCP Thanos Querier / AlertManager route). Converting a v1alpha1 CR drops any explicit `monitoring.enabled` value with no v1alpha2 equivalent to carry it to.

## Upgrading from v1alpha1

A conversion webhook handles `v1alpha1` <-> `v1alpha2` for existing CRs; most fields are a direct value copy with no action needed. These are the exceptions:

| v1alpha1 | v1alpha2 | What changes |
|---|---|---|
| `spec.ansible` (top-level) | `spec.workflowExecution.ansible` | Relocated (F4) — WorkflowExecution is Ansible's only consumer. Direct value copy, `AnsibleSpec` itself unchanged. |
| `spec.kubernautAgent.additionalClusterRoleBindings` | `spec.additionalClusterRoles` (top-level) | Generalized to also apply to Gateway and EffectivenessMonitor, not just KA. Direct value copy. |
| `spec.kubernautAgent.alignmentCheck.llm.{provider,model,endpoint}` | `spec.kubernautAgent.alignmentCheck.llmProfileRef` | **Lossy, manual step required.** v1alpha1's inline alignment-check LLM config never had a working credentials path, so there is no live profile to reference automatically. Converting to v1alpha2 leaves `llmProfileRef` empty; the conversion webhook emits a `Warning` so `kubectl apply` surfaces it. Point it at an entry in `spec.llmProfiles` manually. |
| `spec.networkPolicies.enabled: false` | *(field removed — always on)* | **Behavior change, not just a rename.** If your v1alpha1 CR set `enabled: false`, converting to v1alpha2 now creates NetworkPolicies where it previously did not (matching the Helm chart's always-on behavior). The conversion webhook emits a `Warning` response so this is visible at apply time. Nothing to configure — just be aware the security posture changes. |
| `spec.kubernautAgent.llmProfileRef` (required) | `spec.kubernautAgent.llmProfileRef` (optional, F10) | No structural change, only required-ness. A v1alpha1 CR always has it set (v1alpha1 still requires it); a v1alpha2 CR may omit it when `llmProfiles` has exactly one entry. |
| `<component>.fleetOAuth2CredentialsSecretRef` (5 components, flat field) | `<component>.fleet.oauth2CredentialsSecretRef` (nested `FleetOverrideSpec`) | Direct value copy into the new nested struct |
| `jwtProviders[].jwksURL` (optional) | `jwtProviders[].jwksURL` (required) | When absent in a v1alpha1 source, `ConvertFrom` derives it from `issuerURL + "/protocol/openid-connect/certs"` so the now-required field is never left empty automatically |
| `apiFrontend.rateLimit.*` defaults | Same fields, new default values | `ipRequestsPerSec` 50→10000, `userRequestsPerSec` 20→100, `maxConcurrentSessions` 100→50, `toolCallsPerMinute` 60→600 (F7, aligned to Helm). Only affects CRs that didn't explicitly override these fields. |

None of the entirely new v1alpha2 surface (`llmProfiles` restructuring aside, which is required) — `fleet`, `fleetMetadataCache`, `monitoring.{prometheus,alertManager}`, `dataStorage.telemetry`, `kubernautAgent.telemetry`, `apiFrontend.severityTriage`, `apiFrontend.session`/`mcp` — has a v1alpha1 source; conversion simply leaves these unset (safe defaults / features off).

---

## Type Definitions

### PostgreSQLSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `host` | string | **yes** | — | PostgreSQL hostname |
| `secretName` | string | **yes** | — | Secret containing `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` keys |
| `port` | int32 | no | `5432` | PostgreSQL port |
| `sslMode` | string | no | `verify-full` (v1alpha2 default; was unset in v1alpha1) | SSL mode: `require`, `verify-ca`, `verify-full`. The `disable` value is rejected by CR validation. |

### ValkeySpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `host` | string | **yes** | — | Valkey/Redis hostname |
| `secretName` | string | **yes** | — | Secret containing key `valkey-secrets.yaml` (YAML content: `password: <value>`) |
| `port` | int32 | no | `6379` | Valkey port |
| `tls` | ValkeyTLSSpec | no | — | **New in v1alpha2.** Client-side TLS for the Valkey connection (server-side TLS provisioning remains the platform admin's responsibility — Valkey is BYO) |

#### ValkeyTLSSpec {: #valkeytlsspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | bool | **yes** | — | Whether TLS is enabled for the Valkey/Redis connection |
| `caSecretName` | string | no | — | Secret (key `ca.crt`) with the CA certificate to verify the server |
| `clientCertSecretName` | string | no | — | Secret (keys `tls.crt`, `tls.key`) with the client certificate and key for mTLS |

### ImageSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `pullPolicy` | string | no | `IfNotPresent` | Pull policy for all containers |
| `pullSecrets` | []LocalObjectReference | no | — | Pull secrets for private registries |
| `overrides` | map[string]string | no | — | Per-component image overrides. Keys are component names (e.g. `gateway`, `datastorage`, `kubernautagent`); values are full image references. Overrides the `RELATED_IMAGE_*` env var for that component. |

### FleetOverrideSpec {: #fleetoverridespec }

Used by `kubernautAgent.fleet`, `signalProcessing.fleet`, `remediationOrchestrator.fleet`, `effectivenessMonitor.fleet`, `gateway.fleet`, `apiFrontend.fleet`, and `fleetMetadataCache.fleet` to override `spec.fleet.oauth2.credentialsSecretRef` for a single component. All fleet-aware components share one MCP Gateway CRD registry (`spec.fleet.mcpGatewayNamespace`) — there is no per-component namespace override (DD-362). **Not used** by `workflowExecution.fleet`, which has its own non-fallback [`WorkflowExecutionFleetSpec`](#workflowexecutionfleetspec) instead (DD-235, least-privilege).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `oauth2CredentialsSecretRef` | string | no | falls back to `spec.fleet.oauth2.credentialsSecretRef` | Secret (keys: `client-id`, `client-secret`) for this component's own MCP Gateway OAuth2 client, when it must differ from the shared credential |

### LLMProfileSpec {: #llmprofilespec }

**New in v1alpha2.** `spec.llmProfiles` is a `map[string]LLMProfileSpec` keyed by an arbitrary user-chosen name (e.g. `primary`, `lightweight`). Components reference a profile by name via their own `llmProfileRef` field rather than embedding LLM config directly — this decouples Kubernaut Agent's and API Frontend's LLM identity, and lets different phases/components use different providers. **When the map defines exactly one profile, every `llmProfileRef` field that falls back to it may be omitted** — the operator infers the sole profile automatically (F10).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `provider` | string | **yes** | — | LLM provider. No CRD-level enum (free-form string, `MinLength=1` only) — validated downstream by Kubernaut Agent/API Frontend, which as of v1.6 (DD-PLATFORM-007) accept `openai`, `anthropic`, `gemini`, `vertex_ai`, `openai_compatible` only. `vertexai`/`bedrock`/`azure`/`ollama`/`huggingface`/`mistral` are rejected at startup -- Azure OpenAI and other OpenAI-compatible servers use `openai_compatible` with `endpoint` set accordingly. |
| `model` | string | **yes** | — | Model name (e.g. `gpt-4o`, `claude-sonnet-5`) |
| `credentialsSecretName` | string | **yes** | — | Secret containing API key |
| `endpoint` | string | required for `openai` | provider default | Custom endpoint |
| `temperature` | string | no | — | Sampling temperature (string-encoded) |
| `maxRetries` | *int | no | `3` | Retry count per LLM call |
| `timeoutSeconds` | *int | no | `120` | Per-call timeout |
| `vertexProject` / `vertexLocation` | string | no | — | GCP Vertex AI project/location |
| `bedrockRegion` | string | no | — | AWS Bedrock region |
| `azureApiVersion` | string | no | — | Azure OpenAI API version |
| `tlsCaFile` / `tlsCertFile` / `tlsKeyFile` / `tlsClientSecretRef` | string | no | — | TLS/mTLS to the LLM endpoint. `tlsCertFile` and `tlsKeyFile` must be set together; `tlsClientSecretRef` (Secret with `tls.crt`/`tls.key`) is required when they're set. |
| `oauth2` | OAuth2Spec | no | — | OAuth2 client credentials flow |
| `reasoning` | [LLMReasoningSpec](#llmreasoningspec) | no | disabled | Reasoning/thinking-token configuration |

#### LLMReasoningSpec {: #llmreasoningspec }

See [LLM reasoning configuration](../user-guide/configmap-kubernaut-agent.md#reasoning-configuration-v16) for the full `effort` value semantics (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`) and per-provider dialect translation.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | bool | no | `false` | Enable reasoning/thinking-token requests where the model supports it |
| `budgetTokens` | *int | no | — | Exact-value thinking-token budget. Takes precedence over `effort` for Anthropic (native and Vertex-hosted Claude); providers with no effort-dial concept ignore it. |
| `effort` | string | no | — | Unified, provider-agnostic reasoning-depth knob. One of `none`, `minimal`, `low`, `medium`, `high`, `xhigh`; empty means vendor default. |
| `capabilityOverride` | string | no | `auto` | Capability override for self-hosted/custom models not identifiable by vendor enum. One of `auto`, `force_on`, `force_off`. |

### OAuth2Spec {: #oauth2spec }

Used by `llmProfiles.*.oauth2` (LLM endpoint authentication) and `fleet.oauth2` (MCP Gateway authentication).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | bool | no | `false` | Whether OAuth2 client-credentials authentication is enabled |
| `tokenURL` | string | no | — | OAuth2 token endpoint URL |
| `scopes` | []string | no | — | OAuth2 scopes to request |
| `credentialsSecretRef` | string | no | — | Secret (keys `client-id`, `client-secret`) with the OAuth2 client credentials |

### KubernautAgentSpec

**LLM config no longer embeds directly here** — as of v1alpha2, Kubernaut Agent references a named profile instead of carrying its own `llm` block.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `llmProfileRef` | string | no (unless `llmProfiles` has 2+ entries) | inferred when exactly one profile exists | References a key in `spec.llmProfiles` |
| `runtimeConfigMapName` | string | no | — | BYO hot-reloadable ConfigMap (key: `llm-runtime.yaml`) |
| `phaseModels` | map[string]string | no | — | Per-phase profile overrides. Keys must be `rca`, `workflow_discovery`, or `validation`; values are profile names in `spec.llmProfiles`. Each referenced profile may use its own provider/credentials, independent of `llmProfileRef`'s profile. |
| `maxTurns` | int | no | `40` | Max tool-call turns per investigation (min: 1) |
| `session` | SessionSpec | no | — | Session TTL configuration |
| `audit` | AuditSpec | no | enabled | Audit event logging |
| `alignmentCheck` | [AlignmentCheckSpec](#alignmentcheckspec) | no | disabled | Shadow agent alignment check |
| `summarizer` | SummarizerSpec | no | — | Token summarization threshold and max output size |
| `telemetry` | [TelemetrySpec](#telemetryspec) | no | disabled | **New in v1alpha2 (v1.6).** OpenTelemetry distributed-trace export |
| `safety` | [SafetySpec](#safetyspec) | no | — | LLM safety guardrails |
| `interactive` | [InteractiveSpec](#interactivespec) | no | — | Interactive session JWT identity delegation |
| `serverRateLimit` | KARateLimitSpec | no | — | Server-level rate limiting for the KA HTTP endpoint |
| `shutdown` | ShutdownSpec | no | — | Graceful shutdown |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |
| `fleet` | FleetOverrideSpec | no | falls back to `spec.fleet.oauth2` | Per-component Fleet MCP Gateway OAuth2 override |

!!! note "`additionalClusterRoleBindings` moved"
    v1alpha1's `kubernautAgent.additionalClusterRoleBindings` is gone. Use the top-level [`spec.additionalClusterRoles`](#required-fields) instead — it now applies to Gateway and EffectivenessMonitor as well as Kubernaut Agent.

#### SessionSpec {: #sessionspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `ttl` | string | no | `30m` | Session time-to-live |

#### AuditSpec {: #auditspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Whether audit event logging is active |
| `flushIntervalSeconds` | string | no | `"1"` | How often buffered audit events are flushed to Data Storage, in seconds (string-encoded, e.g. `"0.5"`). Lower values reduce audit-visibility gap after a remediation action at the cost of more frequent writes. |
| `bufferSize` | *int | no | `10000` | Size of the in-memory audit event buffer; events are dropped once full if Data Storage can't keep up |
| `batchSize` | *int | no | `50` | Maximum audit events flushed to Data Storage per batch |

#### SummarizerSpec {: #summarizerspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `threshold` | int | no | `8000` | Token threshold above which tool output is summarized |
| `maxToolOutputSize` | int | no | `100000` | Maximum tool output size in bytes before truncation |

#### KARateLimitSpec {: #karatelimitspec }

Server-level rate limiting for the Kubernaut Agent's own HTTP endpoint (`kubernautAgent.serverRateLimit`) — distinct from `apiFrontend.rateLimit`, which limits external MCP/A2A callers.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `requestsPerSecond` | *int | no | `50` | Requests per second allowed |
| `burst` | *int | no | `100` | Burst size above the steady-state rate |

### InteractiveSpec {: #interactivespec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Whether the MCP interactive-mode endpoint (`POST /api/v1/mcp`) and Lease-based session management are active |
| `sessionTTL` | string (duration) | no | — | Maximum duration for an interactive session before auto-release |
| `inactivityTimeout` | string (duration) | no | — | Session timeout after last operator activity |
| `maxConcurrentSessions` | *int | no | — | Maximum concurrent interactive sessions per agent replica |
| `rateLimitPerUser` | *int | no | — | Maximum MCP requests per second per authenticated user |

!!! info "No `jwtProviders` field here (unlike the Helm chart)"
    The Helm chart's `kubernautAgent.interactive.jwtProviders` has no Operator CRD equivalent: `#1287` replaced KA's AF-facing auth with an SA-bearer-token trusted-intermediary model (AF no longer forwards JWTs), and KA's NetworkPolicy only ever admits AIAnalysis and APIFrontend as ingress peers — there is no supported path for any other client to reach KA's MCP endpoint directly. This JWT-provider surface was removed from `InteractiveSpec` as unreachable dead configuration (v1.6 GA gap-closure).

### AlignmentCheckSpec

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | bool | `false` | Enable shadow agent alignment checking |
| `timeout` | string | `10s` | Timeout per alignment check |
| `maxStepTokens` | int | `500` | Max tokens per alignment step |
| `llmProfileRef` | string | — | **Changed in v1alpha2 (F5).** References a profile in `spec.llmProfiles`, replacing v1alpha1's inline `llm.{provider,model,endpoint}` block (which never had a working credentials path). See [Upgrading from v1alpha1](#upgrading-from-v1alpha1) for the manual migration step. |

### SafetySpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `sanitization` | [SanitizationSpec](#sanitizationspec) | no | — | Input sanitization rules |
| `anomaly` | [AnomalySpec](#anomalyspec) | no | — | Anomaly detection thresholds |

#### SanitizationSpec {: #sanitizationspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `injectionPatternsEnabled` | *bool | no | `true` | Prompt injection pattern detection |
| `credentialScrubEnabled` | *bool | no | `true` | Credential scrubbing in tool output |

#### AnomalySpec {: #anomalyspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `maxToolCallsPerTool` | *int | no | `10` | Max calls per individual tool |
| `maxTotalToolCalls` | *int | no | `40` | Max total tool calls across all tools |
| `maxRepeatedFailures` | *int | no | `3` | Max repeated failures before circuit-breaker |

### TelemetrySpec {: #telemetryspec }

**New in v1alpha2 (v1.6).** Present on `spec.kubernautAgent.telemetry` and `spec.dataStorage.telemetry`. See [Monitoring -- OpenTelemetry Tracing](../operations/monitoring.md#opentelemetry-tracing-v16) for the full picture of which services are instrumented.

| Field | Type | Default | Description |
|---|---|---|---|
| `endpoint` | string | — | OTLP collector endpoint (e.g. `otel-collector.observability.svc:4317`). Tracing is disabled while empty. |
| `logSink` | *bool | `false` | Also mirror trace spans into structured log output. No effect while `endpoint` is empty. |
| `tls` | TelemetryTLSConfig | — | TLS configuration for the connection to the OTLP collector |

#### TelemetryTLSConfig {: #telemetrytlsconfig }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `false` | Use TLS when connecting to the OTLP collector. `false` uses plain HTTP/gRPC, matching most in-cluster collectors. |
| `caFile` | string | no | — | CA bundle path for a self-signed/private collector certificate. Empty trusts the system CA pool. |
| `certFile` | string | no | — | Optional mTLS client certificate path |
| `keyFile` | string | no | — | Optional mTLS client key path |

### AnsibleSpec

**Moved to `spec.workflowExecution.ansible` in v1alpha2 (F4)** — see [WorkflowExecutionSpec](#workflowexecutionspec). Shape unchanged:

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | bool | no | `false` | Enable AWX/AAP integration |
| `apiURL` | string | if enabled | — | AWX API URL (required when `enabled: true`) |
| `organizationID` | int | no | `1` | AWX organization ID (min: 1) |
| `tokenSecretRef` | SecretKeyRef | no | — | AWX API token secret reference |
| `caCertSecretRef` | CACertSecretRef | no | — | CA certificate for AWX TLS |

!!! info "Fleet + Ansible"
    The Ansible engine is not supported for remote (fleet) clusters -- see [Fleet Management -- WE Remote Execution](../architecture/fleet.md#we-remote-execution).

#### SecretKeyRef {: #secretkeyref }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | **yes** | — | Name of the Secret |
| `key` | string | no | `token` | Key within the Secret |

#### CACertSecretRef {: #cacertsecretref }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | **yes** | — | Name of the Secret |
| `key` | string | no | `ca.crt` | Key within the Secret containing the CA PEM |

### LoggingSpec {: #loggingspec }

Present as the `logging` field on nearly every component spec (`notification`, `aiAnalysis`, `signalProcessing`, `remediationOrchestrator`, `workflowExecution`, `effectivenessMonitor`, `kubernautAgent`, `gateway`, `apiFrontend`, `authWebhook`, `dataStorage`, `fleetMetadataCache`).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `level` | string | no | `INFO` | Log level. One of `DEBUG`, `INFO`, `WARN`, `ERROR` (F8 -- narrowed to uppercase-only in v1alpha2; v1alpha1 accepted both cases, and the conversion webhook uppercases any lowercase v1alpha1 value rather than rejecting it). |

### NotificationSpec {: #notificationspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `slack` | [SlackSpec](#slackspec) | no | — | Slack quickstart shortcut |
| `routing` | [ConfigMapRef](#configmapref) | no | — | Advanced notification routing ConfigMap (must contain key `routing.yaml` with AlertManager-style routing rules) |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |

#### SlackSpec {: #slackspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `secretName` | string | no | — | Secret containing the Slack webhook URL (key: `webhook-url`). Empty = no Slack, console-only delivery. |
| `channel` | string | no | `#kubernaut-alerts` | Slack channel for notifications |

#### ConfigMapRef {: #configmapref }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `configMapName` | string | **yes** | — | Name of the ConfigMap |

#### PolicyConfigMapRef {: #policyconfigmapref }

Structurally identical to [ConfigMapRef](#configmapref) (a distinct Go type for clarity at call sites); used by `aiAnalysis.policy` and `signalProcessing.policy`.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `configMapName` | string | **yes** | — | Name of the ConfigMap containing the Rego policy |

### MonitoringSpec

**Reshaped in v1alpha2 (F2) -- different purpose from v1alpha1.** See the callout under [Optional fields](#optional-fields) above for why this isn't a simple rename.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `prometheus` | [PrometheusSpec](#prometheusspec) | no | — | Prometheus/Thanos Querier endpoint configuration |
| `alertManager` | [AlertManagerSpec](#alertmanagerspec) | no | — | AlertManager endpoint configuration |

#### PrometheusSpec {: #prometheusspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Whether Prometheus-backed features (EM assessment, AF severity-triage) are active |
| `url` | string | no | OCP Thanos Querier route | Prometheus/Thanos Querier URL override |
| `tlsCaFile` | string | no | — | CA certificate for the Prometheus endpoint |

#### AlertManagerSpec {: #alertmanagerspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Whether AlertManager-backed features (EM assessment, KA alert correlation) are active |
| `url` | string | no | OCP AlertManager route | AlertManager URL override |
| `tlsCaFile` | string | no | — | CA certificate for the AlertManager endpoint |

### SignalProcessingSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `policy` | [PolicyConfigMapRef](#policyconfigmapref) | **yes** | — | ConfigMap containing key `policy.rego` with SP classification rules |
| `proactiveSignalMappings` | [ConfigMapRef](#configmapref) | no | — | ConfigMap containing proactive signal mapping YAML (key `proactive-signal-mappings.yaml`) |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |
| `fleet` | [FleetOverrideSpec](#fleetoverridespec) | no | falls back to `spec.fleet.oauth2` | Per-component Fleet MCP Gateway OAuth2 override |

### AIAnalysisSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `policy` | [PolicyConfigMapRef](#policyconfigmapref) | **yes** | — | ConfigMap containing key `approval.rego`. Default fallback name (when a CR omits this but relies on an implicit default) is now `aianalysis-policy` (singular, F11 -- was `aianalysis-policies` before v1.5.5-era operator builds). |
| `confidenceThreshold` | string | no | — | Minimum confidence score for auto-approval |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |

### RemediationOrchestratorSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeouts` | [ROTimeoutsSpec](#rotimeoutsspec) | no | — | Per-phase timeouts |
| `routing` | [RORoutingSpec](#roroutingspec) | no | — | Backoff, cooldown, and failure threshold settings |
| `effectivenessAssessment` | [ROEffectivenessSpec](#roeffectivenessspec) | no | — | Stabilization window |
| `asyncPropagation` | [ROAsyncPropagationSpec](#roasyncpropagationspec) | no | — | Delays for GitOps sync, operator reconcile, proactive alerts |
| `dryRun` | bool | no | `false` | Enable global dry-run (Stage 1 -- Observe) |
| `dryRunHoldPeriod` | string | no | `1h` | Suppresses re-triggering of the same signal after a dry-run completion. Only effective when `dryRun` is true. |
| `notifications` | [RONotificationsSpec](#ronotificationsspec) | no | — | Self-resolved notification toggle |
| `retention` | [RORetentionSpec](#roretentionspec) | no | — | Terminal RR retention period |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |
| `fleet` | [FleetOverrideSpec](#fleetoverridespec) | no | falls back to `spec.fleet.oauth2` | Per-component Fleet MCP Gateway OAuth2 override |

#### ROTimeoutsSpec {: #rotimeoutsspec }

| Field | Type | Required | Default |
|---|---|---|---|
| `global` | string | no | `1h` |
| `processing` | string | no | `5m` |
| `analyzing` | string | no | `10m` |
| `executing` | string | no | `30m` |
| `awaitingApproval` | string | no | `15m` |
| `verifying` | string | no | `30m` |

#### RORoutingSpec {: #roroutingspec }

Integer thresholds use pointers to distinguish zero from unset.

| Field | Type | Required | Default |
|---|---|---|---|
| `consecutiveFailureThreshold` | *int | no | `3` |
| `consecutiveFailureCooldown` | string | no | `1h` |
| `recentlyRemediatedCooldown` | string | no | `5m` |
| `exponentialBackoffBase` | string | no | `1m` |
| `exponentialBackoffMax` | string | no | `10m` |
| `exponentialBackoffMaxExponent` | *int | no | `4` |
| `scopeBackoffBase` | string | no | `5s` |
| `scopeBackoffMax` | string | no | `5m` |
| `noActionRequiredDelayHours` | *int | no | `24` |
| `ineffectiveChainThreshold` | *int | no | `3` |
| `recurrenceCountThreshold` | *int | no | `5` |
| `ineffectiveTimeWindow` | string | no | `4h` |

#### ROEffectivenessSpec {: #roeffectivenessspec }

| Field | Type | Required | Default |
|---|---|---|---|
| `stabilizationWindow` | string | no | `5m` |

#### ROAsyncPropagationSpec {: #roasyncpropagationspec }

| Field | Type | Required | Default |
|---|---|---|---|
| `gitOpsSyncDelay` | string | no | `3m` |
| `operatorReconcileDelay` | string | no | `1m` |
| `proactiveAlertDelay` | string | no | `5m` |

#### RONotificationsSpec {: #ronotificationsspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `notifySelfResolved` | bool | no | `false` | Emit a status-update notification when a signal self-resolves (BR-ORCH-037 AC-037-08) |

#### RORetentionSpec {: #roretentionspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `period` | string | no | `24h` | How long to retain completed remediation records |

### WorkflowExecutionSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `workflowNamespace` | string | no | `kubernaut-workflows` | Namespace for workflow Jobs/PipelineRuns |
| `cooldownPeriod` | string | no | `1m` | Deduplication cooldown between executions |
| `tekton` | [TektonSpec](#tektonspec) | no | auto-detect | Tekton integration configuration |
| `ansible` | [AnsibleSpec](#ansiblespec) | no | disabled | **Moved here from top-level `spec.ansible` in v1alpha2 (F4).** WorkflowExecution is Ansible's only consumer. |
| `fleet` | [WorkflowExecutionFleetSpec](#workflowexecutionfleetspec) | no | — | WE's own write-scoped MCP Gateway OAuth2 client. **Does not fall back** to `spec.fleet.oauth2` like every other component -- WE is the only fleet-integration service that calls MCP *write* tools, so it must never share the read-only credential used by Gateway/RO/SP/AF/EM/KA/FMC (least-privilege, DD-235). |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |

#### WorkflowExecutionFleetSpec {: #workflowexecutionfleetspec }

Deliberately does not embed [FleetOverrideSpec](#fleetoverridespec): it has no `namespace` field (WE never watches MCP Gateway CRDs, unlike FMC/SP/AF/EM), and its credential never falls back to `spec.fleet.oauth2.credentialsSecretRef` the way every other fleet-aware component's does.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `oauth2CredentialsSecretRef` | string | required when `spec.fleet.oauth2.enabled: true` | — | Secret (keys `client-id`, `client-secret`) with WE's own write-scoped OAuth2 client credentials for MCP Gateway write tools. No fallback. |

#### TektonSpec {: #tektonspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | auto-detect CRDs | `true` or omit = auto-discover Tekton CRDs; `false` = disable the Tekton engine |

### EffectivenessMonitorSpec {: #effectivenessmonitorspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `assessment` | [EMAssessmentSpec](#emassessmentspec) | no | — | Assessment windows for remediation effectiveness evaluation |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |
| `fleet` | [FleetOverrideSpec](#fleetoverridespec) | no | falls back to `spec.fleet.oauth2` | Per-component Fleet MCP Gateway OAuth2 override |

#### EMAssessmentSpec {: #emassessmentspec }

| Field | Type | Required | Default |
|---|---|---|---|
| `stabilizationWindow` | string | no | `30s` |
| `validityWindow` | string | no | `300s` |

!!! note "`validityWindow` default differs from the Helm chart"
    The Operator CRD defaults `validityWindow` to `300s`; the Helm chart's `effectivenessmonitor.config.assessment.validityWindow` defaults to `120s`. Set the field explicitly on either install path if you need a specific value rather than relying on the default.

### FleetSpec {: #fleetspec }

**New in v1alpha2/v1.6 (ADR-068).** See [Fleet Management](../architecture/fleet.md) for the full architecture.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `false` | Whether federated scope-checking is enabled for Gateway and Remediation Orchestrator |
| `backend` | string | when enabled | — | `fleetmetadatacache` (FMC's HTTP API) or `acm` (Red Hat ACM Search GraphQL API) |
| `endpoint` | string | when enabled | — | HTTP(S) endpoint of the fleet backend |
| `caSecretName` | string | no | — | Secret (key `ca.crt`) to verify the backend endpoint's TLS certificate |
| `tokenSecretName` | string | required when `backend: acm` | — | Secret (key `token`) for ACM Search GraphQL bearer-token auth |
| `mcpGatewayEndpoint` | string | when enabled | — | Fleet-wide MCP Gateway (Envoy AI Gateway or Kuadrant) SSE endpoint for remote-cluster K8s reads. Gateway and RO fail closed at startup without it when `enabled: true`. |
| `mcpGatewayType` | string | when `mcpGatewayEndpoint` set | — | `eaigw` or `kuadrant` |
| `oauth2` | OAuth2Spec | **admission-required when `enabled: true` and `mcpGatewayEndpoint` is set** (F12) | — | OAuth2 credentials for the MCP Gateway, shared by every fleet-aware component. A CEL rule rejects `oauth2.enabled` unset/`false` in that combination -- there is no unauthenticated MCP Gateway mode. |
| `mcpGatewayNamespace` | string | no | cluster-wide | Restricts every fleet-aware component's MCP Gateway CRD watch to a single namespace |

`Rancher` and `Clusterpedia` backends are on the roadmap but not yet exposed by this field's `backend` enum (`fleetmetadatacache`/`acm` only today) -- see [Fleet Management -- Pluggable Scope Backend](../architecture/fleet.md#pluggable-scope-backend).

### FleetMetadataCacheSpec {: #fleetmetadatacachespec }

Operator-managed deployment of the Fleet Metadata Cache (FMC) service. FMC polls managed clusters via the MCP Gateway and serves federated scope-check results from Valkey over HTTP, so Gateway and RemediationOrchestrator (when `spec.fleet.backend: fleetmetadatacache`) query scope without holding federated K8s credentials themselves. Disabled by default -- most deployments that enable `spec.fleet` use `backend: acm` (an existing RHACM Search installation) instead.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `false` | Whether the operator deploys the FMC service |
| `fleet` | [FleetOverrideSpec](#fleetoverridespec) | no | falls back to `spec.fleet.oauth2` | FMC's own OAuth2 client credentials override. FMC's MCP Gateway CRD watch namespace always uses the shared `spec.fleet.mcpGatewayNamespace` (DD-362 -- no per-component override). |
| `syncInterval` | string | no | `30s` | How often FMC polls managed clusters for resource metadata |
| `keyTTL` | string | no | `45s` | TTL for cached resource metadata entries in Valkey |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |

### GatewaySpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Whether the Gateway component is deployed |
| `route` | [RouteSpec](#routespec) | no | enabled | OCP Route for external access |
| `config` | [GatewayConfigSpec](#gatewayconfigspec) | no | — | Server behaviour, middleware, CORS, telemetry, retry tuning |
| `alertManagerTokenSecretName` | string | no | — | BYO Secret (key `token`) with the bearer token AlertManager presents to Gateway's webhook. When unset, webhook auth is omitted entirely and Gateway rejects unauthenticated calls. |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |
| `fleet` | [FleetOverrideSpec](#fleetoverridespec) | no | falls back to `spec.fleet.oauth2` | Per-component Fleet MCP Gateway OAuth2 override |

#### RouteSpec {: #routespec }

Also used by `console.route` (as [ConsoleRouteSpec](#consoleroutespec), a distinct but similarly-shaped type).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Whether to create an OCP Route for the Gateway |
| `hostname` | string | no | auto-derived | Hostname override. When empty, the OCP router auto-generates a hostname. |

#### GatewayConfigSpec {: #gatewayconfigspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `k8sRequestTimeout` | string | no | `15s` | Timeout for outbound K8s API requests |
| `trustedProxyCIDRs` | []string | no | `[]` (fail-closed) | Trusted proxy CIDRs for X-Forwarded-For / RealIP extraction |
| `cors` | [GatewayCORSSpec](#gatewaycorsspec) | no | — | CORS configuration. Gateway is an M2M webhook API, not a browser target, so the defaults block all cross-origin requests. |
| `deduplicationCooldown` | string | no | `5m` | Deduplication cooldown period for alert processing |
| `telemetry` | [TelemetrySpec](#telemetryspec) | no | disabled | OpenTelemetry distributed-trace export |
| `server` | [GatewayServerSpec](#gatewayserverspec) | no | prior hardcoded behavior | HTTP server concurrency and timeout tuning |
| `retry` | [GatewayRetrySpec](#gatewayretryspec) | no | prior hardcoded behavior | DataStorage write-path retry tuning |

#### GatewayServerSpec {: #gatewayserverspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `maxConcurrentRequests` | *int | no | `100` | Maximum concurrent in-flight requests |
| `readTimeout` | string | no | `3600s` | HTTP server read timeout. Kept at the operator's prior hardcoded value, not the Helm chart's `30s` default, to avoid a behavior change for existing CRs. |
| `writeTimeout` | string | no | `3600s` | HTTP server write timeout. Same rationale as `readTimeout`. |
| `idleTimeout` | string | no | `120s` | HTTP server idle timeout |

#### GatewayRetrySpec {: #gatewayretryspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `maxAttempts` | *int | no | `3` | Maximum number of retry attempts |
| `initialBackoff` | string | no | `100ms` | Initial backoff before the first retry |
| `maxBackoff` | string | no | `5s` | Maximum backoff between retries |

#### GatewayCORSSpec {: #gatewaycorsspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `allowedOrigins` | []string | no | `["https://no-browser-clients.invalid"]` | Allowed CORS origins (blocks all browser clients by default) |
| `allowedMethods` | []string | no | `["GET","POST","PUT","PATCH","DELETE","OPTIONS"]` | HTTP methods allowed for cross-origin requests |
| `allowCredentials` | *bool | no | `false` | Whether cross-origin requests may include credentials |
| `maxAge` | *int | no | `300` | Preflight cache duration in seconds |

### AuthWebhookSpec {: #authwebhookspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |

### APIFrontendSpec {: #apifrontendspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Deploy the API Frontend. Set `false` to skip all AF resources |
| `route` | [APIFrontendRouteSpec](#apifrontendroutespec) | no | disabled | OCP Route creation |
| `spire` | [APIFrontendSPIRESpec](#apifrontendspirespec) | no | — | SPIRE/kagenti integration for A2A workload identity |
| `auth` | [APIFrontendAuthSpec](#apifrontendauthspec) | no | — | OIDC authentication |
| `rateLimit` | [APIFrontendRateLimitSpec](#apifrontendratelimitspec) | no | Helm-aligned (F7) | Request rate limiting |
| `shutdown` | [APIFrontendShutdownSpec](#apifrontendshutdownspec) | no | — | Graceful shutdown |
| `llmProfileRef` | string | no | falls back to `kubernautAgent`'s effective profile | **New in v1alpha2.** AF's own LLM profile for the A2A agent |
| `severityTriage` | [APIFrontendSeverityTriageSpec](#apifrontendseveritytriagespec) | no | — | **New in v1alpha2.** Independent LLM config for severity-triage fallback tiers |
| `agentCardURL` | string | no | auto-derived | A2A agent card discovery URL (must be HTTPS when set) |
| `rbacRolesConfigMapRef` | ConfigMapRef | no | — | **Deprecated** -- replaced by `rbac` (SAR-based tool authorization) |
| `rbac` | [APIFrontendRBACSpec](#apifrontendrbacspec) | no | — | SAR-based tool authorization and role bindings |
| `metricsPort` / `healthPort` | *int32 | no | `9090`/`8081` | Port overrides for restricted cluster policies |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |
| `fleet` | [FleetOverrideSpec](#fleetoverridespec) | no | falls back to `spec.fleet.oauth2` | Per-component Fleet MCP Gateway OAuth2 override |
| `session` | [APIFrontendSessionSpec](#apifrontendsessionspec) | no | prior hardcoded behavior | MCP/A2A session lifecycle tuning |
| `mcp` | [APIFrontendMCPSpec](#apifrontendmcpspec) | no | prior hardcoded behavior | MCP tool-call timeout tuning |

#### APIFrontendSessionSpec {: #apifrontendsessionspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `disconnectTTL` | string | no | `10m` | How long a disconnected session is kept before it becomes eligible for cleanup |
| `retentionTTL` | string | no | `720h` | How long session state is retained after disconnect before permanent removal |

#### APIFrontendMCPSpec {: #apifrontendmcpspec }

The CRD is the single source of truth for these timeouts, mirroring AF's own binary defaults (`pkg/apifrontend/config.DefaultConfig()`) exactly -- whether or not the operator renders these keys, the effective timeouts are identical.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `sessionIdleTimeout` | string | no | `30m` | Idle timeout before an MCP session is eligible for cleanup |
| `toolTimeout` | string | no | `30s` | Default timeout applied to MCP tool calls without a per-tool override in `toolTimeouts` |
| `toolTimeouts` | map[string]string | no | `{"kubernaut_investigate":"15m","kubernaut_await_session":"3m","kubernaut_watch":"15m","kubernaut_discover_workflows":"60s"}` | Per-tool timeout overrides, keyed by MCP tool name. Tools not present as a key fall back to AF's own per-tool default, not to `toolTimeout` above. |

### APIFrontendSeverityTriageSpec {: #apifrontendseveritytriagespec }

**New in v1alpha2.**

| Field | Type | Default | Description |
|---|---|---|---|
| `llmProfileRef` | string | inherits AF's own resolved profile | Profile for severity-triage LLM calls. May use a different provider/credentials than AF's main profile. |
| `llmEnabled` | *bool | `true` | When `false`, forces rule-based-only triage regardless of `monitoring` settings |
| `cacheTTLSeconds` | *int | `30` | Cache TTL for severity-triage query results |
| `llmConfidence` | string | `"0.7"` | Minimum LLM confidence threshold for triage decisions |

### APIFrontendAuthSpec {: #apifrontendauthspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `issuerURL` | string | no | — | OIDC issuer URL (e.g., `https://login.kubernaut.ai/realms/kubernaut`). Must match the `iss` claim in tokens. Used for single-provider auth or kagenti auto-detection fallback; ignored when `jwtProviders` is non-empty. |
| `audience` | string | no | `kubernaut-apifrontend` | Expected JWT audience claim. Must match the `aud` claim in tokens (typically the Keycloak realm URL). |
| `jwksURL` | string | no | derived from `issuerURL` | Cluster-internal JWKS endpoint URL for token validation. Bypasses OIDC discovery -- use when the issuer URL is external but JWKS must be fetched internally. |
| `oidcCaFile` | string | no | — | Path to a CA bundle for OIDC/JWKS TLS trust |
| `allowInsecureIssuers` | bool | no | `false` | Allow HTTP (non-TLS) JWKS URLs. Must remain `false` in production; dev/test only. |
| `jwtProviders` | [][JWTProviderSpec](#jwtproviderspec) | no | — | Multi-provider JWT configuration (max 8). When non-empty, takes precedence over `issuerURL`/`audience`/`jwksURL`. |

### JWTProviderSpec {: #jwtproviderspec }

Used at `spec.apiFrontend.auth.jwtProviders[]`. (v1alpha1's `spec.kubernautAgent.interactive.jwtProviders[]`/`allowInsecureJWKS` were removed entirely in v1alpha2 -- KA's MCP port has no reachable client that would ever present a JWT to it; see F6 addendum.)

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | **yes** | Human-readable provider name (1--63 chars, must be unique) |
| `issuerURL` | string | **yes** | OIDC issuer URL -- must match the `iss` claim in tokens |
| `jwksURL` | string | **yes** (v1alpha2; was optional in v1alpha1) | JWKS endpoint URL (max 2048 chars, must use HTTPS). Converting a v1alpha1 CR without this set derives it from `issuerURL + "/protocol/openid-connect/certs"`. |
| `audiences` | []string | **yes** | Expected JWT audience claims (min 1 entry). Tokens without a matching `aud` are rejected. |
| `claimMappings` | [ClaimMappingsSpec](#claimmappingsspec) | no | Custom claim-to-identity field mappings |

### ClaimMappingsSpec {: #claimmappingsspec }

| Field | Type | Description |
|---|---|---|
| `username` | string | JWT claim name to extract as username (e.g., `preferred_username`, `email`) |
| `groups` | string | JWT claim name to extract group membership (e.g., `groups`, `realm_access.roles`). Supports dot-notation for nested claims. |

!!! note "No `uid` field"
    `ClaimMappingsSpec` supports `username` and `groups` only. There is no `uid` field in the operator CRD.

### APIFrontendRBACSpec {: #apifrontendrbacspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `sarCacheTTL` | string | no | `30s` | Cache duration for SAR results (Go duration format) |
| `roleBindings` | [][ToolRoleBinding](#toolrolebinding) | no | — | Maps persona-based tool roles to OIDC groups |
| `consoleAccessGroups` | []string | no | auto-derived (see below) | OIDC groups granted the coarse-grained `kubernaut.ai/console` "use" gate (v1.5.6, kubernaut#1919). Checked in addition to the per-tool `kubernaut.ai/tools` grant on every `/mcp` and `/a2a/invoke` call -- but only once `consoleAccessAuthorizationCheckEnabled` (below) is `true`. |
| `consoleAccessAuthorizationCheckEnabled` | *bool | no | `false` | **v1alpha2 only** (no v1alpha1 equivalent). Turns on AF's coarse-grained `kubernaut.ai/console` authorization check, so `consoleAccessGroups` actually takes effect (kubernaut#1919, kubernaut-operator#338/#346). Defaults to `false` (authentication-only) so a zero-config CR deploys with a working console; set `true` after populating `consoleAccessGroups` to enforce it. Per-tool authorization is unaffected either way and remains unconditionally fail-closed. |

!!! info "`consoleAccessGroups` default differs from the Helm chart (kubernaut-operator#289)"
    When **unset** (`nil` -- the field has no `omitempty`, so an explicit `[]` is a distinct, meaningful value from "unset"), the operator defaults `consoleAccessGroups` to the deduplicated union of every group already present in `roleBindings` above -- **not** the Helm chart's static list of the 6 built-in persona names. This makes the Operator path upgrade-safe by construction: any group with an existing per-tool binding automatically keeps console access, with no risk of the tool-call lockout described in [Security & RBAC: Console-access authorization gate](../architecture/security-rbac.md#console-access-gate).

    - Omit the field to keep this auto-derived default.
    - Set an explicit non-empty list for independent, narrower control.
    - Set an explicit empty list (`consoleAccessGroups: []`) to deny console access to everyone via this gate.

    Regardless of how this is set, it has no effect until `consoleAccessAuthorizationCheckEnabled` is also set to `true` -- see [Security & RBAC: `consoleAccessAuthorizationCheckEnabled`](../architecture/security-rbac.md#console-access-authorization-check-enabled).

### ToolRoleBinding {: #toolrolebinding }

Exactly one of `role` or `clusterRoleName` must be set. Entries with both or neither are rejected by CR validation.

| Field | Type | Description |
|---|---|---|
| `role` | string | Built-in persona name. One of: `sre`, `ai-orchestrator`, `cicd`, `observability`, `l3-audit`, `remediation-approver`. Mutually exclusive with `clusterRoleName`. |
| `clusterRoleName` | string | Reference to a **user-managed** ClusterRole for custom tool authorization. The operator creates only the ClusterRoleBinding; the ClusterRole must be pre-created by the user with rules granting verb `use` on resource `tools` in apiGroup `kubernaut.ai`. Mutually exclusive with `role`. |
| `groups` | []string | OIDC group names to bind to this role (min 1) |

**Example (built-in personas only):**

```yaml
spec:
  apiFrontend:
    rbac:
      roleBindings:
        - role: sre
          groups: ["sre-team", "platform-eng"]
        - role: observability
          groups: ["monitoring-team"]
        - role: remediation-approver
          groups: ["change-mgmt"]
```

**Example (mixed -- built-in + custom ClusterRoles):**

```yaml
spec:
  apiFrontend:
    rbac:
      roleBindings:
        # Built-in persona: operator manages the ClusterRole
        - role: sre
          groups: ["senior-sres"]
        # User-managed ClusterRole: operator creates only the CRB
        - clusterRoleName: kubernaut-restricted-investigator
          groups: ["junior-sres"]
        - clusterRoleName: kubernaut-readonly-audit
          groups: ["compliance-team"]
```

See [Custom ClusterRoles](../architecture/security-rbac.md#custom-clusterroles) for how to create user-managed ClusterRoles with fine-grained tool subsets.

### APIFrontendRateLimitSpec {: #apifrontendratelimitspec }

Defaults changed in v1alpha2 to align with the Helm chart's tuned values (F7):

| Field | Type | Default (v1alpha1) | Default (v1alpha2) |
|---|---|---|---|
| `ipRequestsPerSec` | *int | `50` | `10000` |
| `userRequestsPerSec` | *int | `20` | `100` |
| `toolCallsPerMinute` | *int | `60` | `600` |
| `maxConcurrentSessions` | *int | `100` | `50` |

### APIFrontendRouteSpec {: #apifrontendroutespec }

Unlike [RouteSpec](#routespec) (Gateway's route), defaults to disabled -- external access is opt-in.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `false` | Create an OCP Route for the API Frontend |
| `hostname` | string | no | — | Custom route hostname. When empty, OCP derives the hostname from the route name and cluster ingress domain. |

### APIFrontendSPIRESpec {: #apifrontendspirespec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `nil` (treated as `true`) | Enable SPIRE integration via kagenti. When `true`, the operator labels the namespace with `kagenti-enabled=true` and `pod-security.kubernetes.io/enforce=privileged`, and creates an `AgentRuntime` CR. Set to `false` explicitly to disable. |
| `className` | string | no | — | SPIRE class name provisioned by kagenti (e.g., `zero-trust-workload-identity-manager-spire`). Must match the `SPIREClusterConfig` deployed by kagenti. |
| `trustDomain` | string | no | SPIRE's own trust-domain template variable | Overrides the SPIFFE ID trust domain. Set only if you need a fixed trust domain differing from the SPIRE server's. |

### APIFrontendShutdownSpec {: #apifrontendshutdownspec }

Also used, under its canonical name `ShutdownSpec`, at `spec.kubernautAgent.shutdown` (shared type for consistent knob naming across AF and KA).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `drainSeconds` | *int | no | `15` | Seconds to wait for in-flight requests to drain (0--300) |

### DataStorageSpec {: #datastoragespec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `endpointPropagationDelay` | string | no | `10s` | Delay before newly created endpoints are considered ready |
| `retention` | [RetentionSpec](#retentionspec) | no | — | Periodic purge of expired audit events (FedRAMP AU-11) |
| `signingCert` | [SigningCertSpec](#signingcertspec) | no | — | Audit export signing certificate (FedRAMP AU-9); mounted at `/etc/certs` when set |
| `telemetry` | [TelemetrySpec](#telemetryspec) | no | disabled | **New in v1alpha2 (v1.6).** OpenTelemetry distributed-trace export |
| `database` | [DataStorageDatabaseSpec](#datastoragedatabasespec) | no | prior hardcoded behavior | PostgreSQL connection-pool tuning |
| `server` | [DataStorageServerSpec](#datastorageserverspec) | no | prior hardcoded behavior | HTTP server timeout tuning |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |

#### DataStorageDatabaseSpec {: #datastoragedatabasespec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `maxOpenConns` | *int | no | `100` | Maximum number of open database connections |
| `maxIdleConns` | *int | no | `20` | Maximum number of idle database connections |
| `connMaxLifetime` | string | no | `1h` | Maximum amount of time a connection may be reused |
| `connMaxIdleTime` | string | no | `10m` | Maximum amount of time a connection may be idle before being closed |

#### DataStorageServerSpec {: #datastorageserverspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `readTimeout` | string | no | `30s` | HTTP server read timeout |
| `writeTimeout` | string | no | `30s` | HTTP server write timeout |

#### SigningCertSpec {: #signingcertspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `secretName` | string | **yes** | — | Kubernetes Secret containing the signing cert (`tls.crt`, `tls.key`) |
| `mountPath` | string | no | `/etc/certs` | Mount path inside the container |

#### RetentionSpec {: #retentionspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `false` | Whether the retention purge worker is active. Defaults to `false` -- no data is deleted without opt-in. |
| `interval` | string | no | `24h` | How often the purge worker runs |
| `batchSize` | *int | no | `1000` | Maximum number of rows deleted per batch |
| `defaultDays` | *int | no | `2555` | Number of days to retain audit events before purge. Clamped to a maximum of 2555 (~7 years per ADR-034 / SOC 2 / ISO 27001). |

### ConsoleSpec {: #consolespec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `false` | Opt-in Kubernaut Console deployment |
| `auth` | [ConsoleAuthSpec](#consoleauthspec) | when enabled | — | OIDC credentials for the console oauth2-proxy |
| `route` | [ConsoleRouteSpec](#consoleroutespec) | no | enabled | OCP Route for external access |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits for the Console container |

The Console OIDC issuer URL is derived from `spec.apiFrontend.auth.jwtProviders[0].issuerURL`, falling back to `spec.apiFrontend.auth.issuerURL`.

#### ConsoleAuthSpec {: #consoleauthspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `secretName` | string | **yes** (when `console.enabled`) | — | Pre-existing Secret with keys: `client-id`, `client-secret`, `cookie-secret` for OAuth2 Proxy |

#### ConsoleRouteSpec {: #consoleroutespec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Whether to create an OCP Route for the Console |
| `host` | string | no | auto-derived | Custom route hostname. When empty, derived from namespace. |

### NetworkPoliciesSpec

!!! warning "`enabled` toggle removed -- NetworkPolicies are now unconditional (F3)"
    v1alpha1's `networkPolicies.enabled` (default `false`, opt-in) is **gone**. NetworkPolicies are created for every component regardless, matching the Helm chart's actual (and always was) behavior and Red Hat's OpenShift Hardening trajectory. Converting a v1alpha1 CR that had `enabled: false` now creates NetworkPolicies where it previously did not -- the conversion webhook surfaces a `Warning` for this case. Every field below only tunes the shape of the already-created default-deny + explicit-allow policy set; none of them gate existence.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `apiServerCIDR` | string | no | — | Primary API server backend CIDR, for environments where default detection doesn't resolve correctly |
| `apiServerCIDRs` | []string | no | — | Additional API server backend endpoint IPs as `/32` CIDRs (HA control planes); merged with `apiServerCIDR` |
| `apiServerPort` | int32 | no | — | API server port override |
| `monitoring` | [NetworkPolicyMonitoringOverride](#networkpolicymonitoringoverride) | no | — | Where/how monitoring-stack ingress/egress rules are shaped |
| `externalWebhooks`, `externalRegistry`, `llm`, `mcpGateway`, `prometheus` | [NetworkPolicyEgressOverride](#networkpolicyegressoverride) | no | CIDR `0.0.0.0/0` | Per-target egress `cidr`/`port` override |
| `idp` | [NetworkPolicyIdPEgressOverride](#networkpolicyidpegressoverride) | no | CIDR `0.0.0.0/0` | Egress override plus `extraPorts` for dual-IdP deployments |
| `gateway`, `apifrontend`, `console` | [NetworkPolicyNamedIngressOverride](#networkpolicynamedingressoverride) | no | — | Ingress CIDRs/namespace selectors, plus a simple `ingressNamespaces` name-list |
| `datastorage`, `kubernautAgent` | [NetworkPolicyIngressOverride](#networkpolicyingressoverride) | no | — | Ingress CIDRs/namespace selectors only (no `ingressNamespaces` list) |

#### NetworkPolicyIngressOverride {: #networkpolicyingressoverride }

Adds allowed ingress sources beyond the operator's default same-namespace/component allow rules. CIDRs cover traffic not associated with any pod/namespace (e.g. NodePort-sourced host traffic, a hostNetwork-mode ingress controller); selectors cover cases the simple namespace-name list ([NetworkPolicyNamedIngressOverride](#networkpolicynamedingressoverride)) cannot express.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `ingressCIDRs` | []string | no | `[]` | CIDR blocks allowed as ingress sources |
| `ingressNamespaceSelectors` | []metav1.LabelSelector | no | `[]` | Raw namespace label selectors allowed as ingress sources |

#### NetworkPolicyNamedIngressOverride {: #networkpolicynamedingressoverride }

Extends [NetworkPolicyIngressOverride](#networkpolicyingressoverride) with a namespace-name allowlist, mirroring the subset of components (Gateway, APIFrontend, Console) the Helm chart exposes this simpler option on.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `ingressCIDRs` | []string | no | `[]` | (inherited from `NetworkPolicyIngressOverride`) |
| `ingressNamespaceSelectors` | []metav1.LabelSelector | no | `[]` | (inherited from `NetworkPolicyIngressOverride`) |
| `ingressNamespaces` | []string | no | `[]` | Namespaces allowed to send ingress (e.g. an ingress-controller namespace) |

#### NetworkPolicyEgressOverride {: #networkpolicyegressoverride }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `cidr` | string | no | `0.0.0.0/0` | Egress target CIDR |
| `port` | int32 | no | — | Egress target port |

#### NetworkPolicyIdPEgressOverride {: #networkpolicyidpegressoverride }

[NetworkPolicyEgressOverride](#networkpolicyegressoverride) plus a second port, for deployments where a service must reach two IdPs on two different ports.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `cidr` | string | no | `0.0.0.0/0` | (inherited from `NetworkPolicyEgressOverride`) |
| `port` | int32 | no | — | (inherited from `NetworkPolicyEgressOverride`) |
| `extraPorts` | []int32 | no | `[]` | Additional IdP ports to open egress on against the same `cidr` |

#### NetworkPolicyMonitoringOverride {: #networkpolicymonitoringoverride }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `namespace` | string | no | — | Namespace where Prometheus scrapes from |
| `prometheusPort` | int32 | no | `9090` | Prometheus port to allow in the NetworkPolicy egress rule |
| `alertManagerPort` | int32 | no | `9093` | AlertManager port to allow in the NetworkPolicy egress rule |

---

## `status` (KubernautStatus)

| Field | Type | Description |
|---|---|---|
| `phase` | KubernautPhase | Current phase: `Validating`, `Migrating`, `Deploying`, `Running`, `Degraded`, `Error` |
| `conditions` | []metav1.Condition | Standard Kubernetes conditions (includes `AnsibleReady`, `ToolRBACBound`) |
| `services` | [][ServiceStatus](#servicestatus) | Per-service readiness |
| `lastMigrationHash` | string | Hash of last successful DB migration |
| `lastMigrationTime` | metav1.Time | Timestamp of last migration |
| `boundAdditionalClusterRoles` | []string | Currently bound additional ClusterRoles |
| `boundToolRoleBindings` | []string | Currently managed tool role binding CRB names (for stale-pruning and finalizer cleanup) |

### ServiceStatus {: #servicestatus }

| Field | Type | Description |
|---|---|---|
| `name` | string | Service name (e.g. `gateway`, `datastorage`) |
| `ready` | bool | Whether the service has all desired replicas ready |
| `readyReplicas` | int32 | Number of ready replicas |
| `desiredReplicas` | int32 | Desired number of replicas |

---

## RBAC

The operator creates baseline ClusterRoles (namespace-prefixed as `{namespace}-{base}`), plus monitoring-only ClusterRoles gated on `spec.monitoring.prometheus.enabled`/`alertManager.enabled` (both default `true`), 6 per-persona tool ClusterRoles for SAR authorization, and optionally an Ansible ClusterRole. See [Security & RBAC](../architecture/security-rbac.md) for the full permission matrix.

| ClusterRole base name | Component | Notes |
|---|---|---|
| `gateway-role` | Gateway | |
| `aianalysis-controller` | AI Analysis | |
| `kubernaut-agent-client` | KA <-> service access | |
| `kubernaut-agent-investigator` | KA cluster-wide read | |
| `signalprocessing-controller` | Signal Processing | |
| `remediationorchestrator-controller` | Remediation Orchestrator | |
| `workflowexecution-controller` | Workflow Execution | |
| `workflow-runner` | Workflow Runner (Jobs) | |
| `effectivenessmonitor-controller` | Effectiveness Monitor | |
| `notification-controller` | Notification | |
| `data-storage-auth-middleware` | DataStorage auth | |
| `data-storage-client` | DataStorage client | |
| `authwebhook-role` | Auth Webhook | |
| `apifrontend-role` | API Frontend | SAR, InvestigationSession/AgentSession CRD access, RR/RAR access, cluster context triage |
| `alertmanager-view` | Monitoring only | Gated on `spec.monitoring.alertManager.enabled` (default `true`) |
| `gateway-signal-source` | Monitoring only | Gated on `spec.monitoring.prometheus.enabled`/`alertManager.enabled` (default `true`) |
| `kubernaut-tool-sre` | SAR tool persona | From `spec.apiFrontend.rbac.roleBindings` |
| `kubernaut-tool-ai-orchestrator` | SAR tool persona | |
| `kubernaut-tool-cicd` | SAR tool persona | |
| `kubernaut-tool-observability` | SAR tool persona | |
| `kubernaut-tool-l3-audit` | SAR tool persona | |
| `kubernaut-tool-remediation-approver` | SAR tool persona | |
| `workflowexecution-awx` | Ansible only | When `spec.workflowExecution.ansible.enabled: true` (moved from top-level `spec.ansible`, F4) |
