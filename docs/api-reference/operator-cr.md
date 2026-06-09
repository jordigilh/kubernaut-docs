# Operator CR API Reference

The `Kubernaut` custom resource (`kubernaut.ai/v1alpha1`) is the single deployment artifact for the Kubernaut Operator. One CR named `kubernaut` per namespace configures the entire platform.

**Source**: [`kubernaut-operator/api/v1alpha1/kubernaut_types.go`](https://github.com/jordigilh/kubernaut-operator/blob/main/api/v1alpha1/kubernaut_types.go)  
**CRD schema**: [`kubernaut-operator/config/crd/bases/kubernaut.ai_kubernauts.yaml`](https://github.com/jordigilh/kubernaut-operator/blob/main/config/crd/bases/kubernaut.ai_kubernauts.yaml)

---

## `spec` (KubernautSpec)

!!! warning "CR validation ([kubernaut-operator#128](https://github.com/jordigilh/kubernaut-operator/issues/128))"
    The operator runs `ValidateKubernaut` checks and **rejects the CR** if any of the following are missing:

    - `spec.aiAnalysis.policy.configMapName` — must reference a ConfigMap containing key `approval.rego`
    - `spec.signalProcessing.policy.configMapName` — must reference a ConfigMap containing key `policy.rego`
    - `spec.kubernautAgent.llm.provider` — LLM provider name
    - `spec.kubernautAgent.llm.model` — LLM model name
    - `spec.kubernautAgent.llm.credentialsSecretName` — Secret with LLM API credentials

    Create these resources **before** applying the Kubernaut CR. See [Installation Prerequisites](../getting-started/installation.md#prerequisites).

### Required fields

| Field | Type | Description |
|---|---|---|
| `postgresql` | [PostgreSQLSpec](#postgresqlspec) | BYO PostgreSQL connection |
| `valkey` | [ValkeySpec](#valkeyspec) | BYO Valkey/Redis connection |
| `kubernautAgent` | [KubernautAgentSpec](#kubernautagentspec) | LLM and agent configuration |

### Optional fields

| Field | Type | Default | Description |
|---|---|---|---|
| `image` | [ImageSpec](#imagespec) | — | Pull policy, secrets, and per-component image overrides |
| `ansible` | [AnsibleSpec](#ansiblespec) | disabled | AWX/AAP integration |
| `monitoring` | [MonitoringSpec](#monitoringspec) | enabled | OCP monitoring integration (Prometheus/AlertManager RBAC) |
| `notification` | NotificationSpec | — | Slack, routing ConfigMap, logging, resources |
| `aiAnalysis` | [AIAnalysisSpec](#aianalysisspec) | — | **Required policy ConfigMap** — Rego approval policy, confidence threshold |
| `signalProcessing` | [SignalProcessingSpec](#signalprocessingspec) | — | **Required policy ConfigMap** — Rego classification policy, proactive mappings |
| `remediationOrchestrator` | [RemediationOrchestratorSpec](#remediationorchestratorspec) | — | Timeouts, routing, dry-run, retention |
| `workflowExecution` | [WorkflowExecutionSpec](#workflowexecutionspec) | — | Execution namespace, cooldown, Tekton toggle |
| `effectivenessMonitor` | EffectivenessMonitorSpec | — | Stabilization/validity windows |
| `gateway` | [GatewaySpec](#gatewayspec) | — | Route, CORS, trusted proxies, deduplication |
| `apiFrontend` | [APIFrontendSpec](#apifrontendspec) | enabled | MCP/A2A gateway, OIDC auth, SAR-based tool authorization (v1.5+) |
| `authWebhook` | AuthWebhookSpec | — | Logging, resources |
| `dataStorage` | [DataStorageSpec](#datastoragespec) | — | Endpoint propagation delay, retention, logging, resources |
| `networkPolicies` | [NetworkPoliciesSpec](#networkpoliciesspec) | disabled | Kubernetes NetworkPolicy creation |

---

## Type Definitions

### PostgreSQLSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `host` | string | **yes** | — | PostgreSQL hostname |
| `port` | int | no | `5432` | PostgreSQL port |
| `secretName` | string | **yes** | — | Secret containing `username`, `password`, `database` keys |
| `sslMode` | string | no | — | SSL mode: `require`, `verify-ca`, `verify-full`. The `disable` value is rejected by CR validation. |

### ValkeySpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `host` | string | **yes** | — | Valkey/Redis hostname |
| `port` | int | no | `6379` | Valkey port |
| `secretName` | string | **yes** | — | Secret containing `password` key |

### ImageSpec

| Field | Type | Description |
|---|---|---|
| `pullPolicy` | string | Default `IfNotPresent` |
| `pullSecrets` | []LocalObjectReference | Image pull secrets |
| `overrides` | map[string]string | Per-component image overrides (key = component name) |

### KubernautAgentSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `llm` | [LLMSpec](#llmspec) | **yes** | — | Primary LLM configuration |
| `maxTurns` | int | no | `40` | Max tool-call turns per investigation (min: 1) |
| `session` | SessionSpec | no | — | Session TTL configuration |
| `audit` | AuditSpec | no | enabled | Audit event logging |
| `alignmentCheck` | [AlignmentCheckSpec](#alignmentcheckspec) | no | disabled | Shadow agent alignment check |
| `summarizer` | SummarizerSpec | no | — | Token summarization threshold and max output size |
| `safety` | [SafetySpec](#safetyspec) | no | — | LLM safety guardrails |
| `additionalClusterRoleBindings` | []string | no | — | Pre-existing ClusterRole names to bind to agent SA (max 64). **Privilege escalation risk** — restrict who may edit the Kubernaut CR |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |

### LLMSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `provider` | string | **yes** | — | LLM provider: `openai`, `ollama`, `azure`, `vertex`, `vertexAi`, `anthropic`, `bedrock`, `huggingface`, `mistral` |
| `model` | string | **yes** | — | Model name (e.g., `gpt-4o`, `gemini-2.5-pro`) |
| `credentialsSecretName` | string | **yes** | — | Secret containing API key |
| `endpoint` | string | no | — | Custom endpoint (required for `ollama`, `azure`, `mistral`) |
| `temperature` | string | no | — | LLM temperature |
| `maxRetries` | int | no | — | Retry count per LLM call |
| `timeoutSeconds` | int | no | — | Per-call timeout |
| `vertexProject` | string | no | — | Vertex AI project ID |
| `vertexLocation` | string | no | — | Vertex AI location |
| `bedrockRegion` | string | no | — | AWS Bedrock region |
| `azureApiVersion` | string | no | — | Azure OpenAI API version |
| `tlsCaFile` | string | no | — | Custom CA certificate file path |
| `oauth2` | OAuth2Spec | no | — | OAuth2 client credentials flow |
| `runtimeConfigMapName` | string | no | — | BYO hot-reloadable ConfigMap name (key: `llm-runtime.yaml`) |

### AlignmentCheckSpec

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | bool | `false` | Enable shadow agent alignment checking |
| `timeout` | string | `10s` | Timeout per alignment check |
| `maxStepTokens` | int | `500` | Max tokens per alignment step |
| `llm` | AlignmentCheckLLMSpec | — | Optional dedicated LLM for alignment (separate from primary) |

### SafetySpec

| Field | Type | Description |
|---|---|---|
| `sanitization.injectionPatternsEnabled` | *bool | Prompt injection pattern detection (default: `true`) |
| `sanitization.credentialScrubEnabled` | *bool | Credential scrubbing in tool output (default: `true`) |
| `anomaly.maxToolCallsPerTool` | *int | Max calls per individual tool (default: `10`) |
| `anomaly.maxTotalToolCalls` | *int | Max total tool calls (default: `40`) |
| `anomaly.maxRepeatedFailures` | *int | Max repeated failures before circuit-breaker (default: `3`) |

### AnsibleSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | bool | no | `false` | Enable AWX/AAP integration |
| `apiURL` | string | if enabled | — | AWX API URL (required when `enabled: true`) |
| `organizationID` | int | no | `1` | AWX organization ID (min: 1) |
| `tokenSecretRef` | SecretKeyRef | no | — | AWX API token secret reference |
| `caCertSecretRef` | CACertSecretRef | no | — | CA certificate for AWX TLS |

### MonitoringSpec

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | *bool | `true` | When true, operator auto-derives Prometheus/AlertManager URLs and provisions 2 additional ClusterRoles (`alertmanager-view`, `gateway-signal-source`) |

### SignalProcessingSpec

| Field | Type | Description |
|---|---|---|
| `policy.configMapName` | string | **Required** — ConfigMap containing key `policy.rego` with SP classification rules |
| `proactiveSignalMappings.configMapName` | string | ConfigMap containing proactive signal mapping YAML |

### AIAnalysisSpec

| Field | Type | Description |
|---|---|---|
| `policy.configMapName` | string | **Required** — ConfigMap containing key `approval.rego` |
| `confidenceThreshold` | string | Minimum confidence score for auto-approval |

### RemediationOrchestratorSpec

| Field | Type | Description |
|---|---|---|
| `timeouts` | ROTimeoutsSpec | Per-phase timeouts: `global`, `processing`, `analyzing`, `executing`, `awaitingApproval`, `verifying` |
| `routing` | RORoutingSpec | Backoff, cooldown, and failure threshold settings |
| `effectivenessAssessment` | ROEffectivenessSpec | Stabilization window |
| `asyncPropagation` | ROAsyncPropagationSpec | Delays for GitOps sync, operator reconcile, proactive alerts |
| `dryRun` | bool | Enable global dry-run (Stage 1 — Observe) |
| `dryRunHoldPeriod` | string | Hold period before marking DryRun complete |
| `notifications` | RONotificationsSpec | Self-resolved notification toggle |
| `retention` | RORetentionSpec | Terminal RR retention period (default: 24h) |

### WorkflowExecutionSpec

| Field | Type | Default | Description |
|---|---|---|---|
| `workflowNamespace` | string | — | Namespace for workflow Jobs/PipelineRuns |
| `cooldownPeriod` | string | — | Deduplication cooldown between executions |
| `tekton.enabled` | *bool | — | Enable Tekton PipelineRun engine |

### GatewaySpec

| Field | Type | Description |
|---|---|---|
| `route.enabled` | *bool | Create an OCP Route |
| `route.hostname` | string | Custom route hostname |
| `config.k8sRequestTimeout` | string | Kubernetes API request timeout |
| `config.trustedProxyCIDRs` | []string | Trusted proxy CIDRs for X-Forwarded-For |
| `config.corsAllowedOrigins` | []string | CORS allowed origins |
| `config.deduplicationCooldown` | string | Signal deduplication cooldown |

### APIFrontendSpec (v1.5+) {: #apifrontendspec }

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | *bool | no | `true` | Deploy the API Frontend. Set `false` to skip all AF resources |
| `auth` | [APIFrontendAuthSpec](#apifrontendauthspec) | no | — | OIDC authentication |
| `rateLimit` | [APIFrontendRateLimitSpec](#apifrontendratelimitspec) | no | — | Request rate limiting |
| `shutdown` | [APIFrontendShutdownSpec](#apifrontendshutdownspec) | no | — | Graceful shutdown |
| `externalURL` | string | no | auto-derived | A2A agent card discovery URL (must be HTTPS when set) |
| `rbac` | [APIFrontendRBACSpec](#apifrontendrbacspec) | no | — | SAR-based tool authorization and role bindings |
| `logging` | LoggingSpec | no | — | Log level |
| `resources` | ResourceRequirements | no | — | CPU/memory requests and limits |

### APIFrontendAuthSpec {: #apifrontendauthspec }

| Field | Type | Default | Description |
|---|---|---|---|
| `issuerURL` | string | — | OIDC issuer URL (e.g., `https://login.kubernaut.ai/realms/kubernaut`) |
| `audience` | string | `kubernaut-apifrontend` | Expected JWT audience claim |
| `jwtProviders` | [][JWTProviderSpec](#jwtproviderspec) | — | One or more OIDC JWT providers |
| `allowInsecureJWKS` | bool | `false` | Permit HTTP JWKS URLs for dev/test. **Must be `false` in production.** |

### JWTProviderSpec {: #jwtproviderspec }

| Field | Type | Description |
|---|---|---|
| `name` | string | Human-readable provider name (1–63 chars) |
| `jwksURL` | string | JWKS endpoint URL. Must use HTTPS unless `allowInsecureJWKS` is true |

### APIFrontendRBACSpec {: #apifrontendrbacspec }

| Field | Type | Default | Description |
|---|---|---|---|
| `sarCacheTTL` | string | `30s` | Cache duration for SAR results (Go duration format) |
| `roleBindings` | [][ToolRoleBinding](#toolrolebinding) | — | Maps persona-based tool roles to OIDC groups |

### ToolRoleBinding {: #toolrolebinding }

| Field | Type | Description |
|---|---|---|
| `role` | string | Persona name. One of: `sre`, `ai-orchestrator`, `cicd`, `observability`, `l3-audit`, `remediation-approver` |
| `groups` | []string | OIDC group names to bind to this role (min 1) |

**Example:**

```yaml
spec:
  apiFrontend:
    auth:
      issuerURL: https://dex.kubernaut.svc.cluster.local:5556/dex
      audience: kubernaut-apifrontend
    rbac:
      sarCacheTTL: 30s
      roleBindings:
        - role: sre
          groups: ["sre-team", "platform-eng"]
        - role: observability
          groups: ["monitoring-team"]
        - role: remediation-approver
          groups: ["change-mgmt"]
```

### APIFrontendRateLimitSpec {: #apifrontendratelimitspec }

| Field | Type | Default | Description |
|---|---|---|---|
| `ipRequestsPerSec` | *int | `50` | Per-IP requests per second |
| `userRequestsPerSec` | *int | `20` | Per-user requests per second |
| `maxConcurrentSessions` | *int | `100` | Maximum concurrent MCP/A2A sessions |

### APIFrontendShutdownSpec {: #apifrontendshutdownspec }

| Field | Type | Default | Description |
|---|---|---|---|
| `drainSeconds` | *int | `15` | Seconds to wait for in-flight requests to drain (0–300) |

### DataStorageSpec {: #datastoragespec }

| Field | Type | Default | Description |
|---|---|---|---|
| `endpointPropagationDelay` | string | `10s` | Delay before newly created endpoints are considered ready |
| `retention` | RetentionSpec | — | Periodic purge of expired audit events (FedRAMP AU-11) |
| `logging` | LoggingSpec | — | Log level |
| `resources` | ResourceRequirements | — | CPU/memory requests and limits |

### NetworkPoliciesSpec

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | *bool | `false` | Create NetworkPolicy resources (default-deny ingress posture) |
| `apiServerCIDR` | string | — | API server CIDR for egress rules |
| `monitoringNamespace` | string | — | Namespace for Prometheus scrape ingress |
| `gatewayIngressNamespaces` | []string | — | Namespaces allowed to send traffic to Gateway |

---

## `status` (KubernautStatus)

| Field | Type | Description |
|---|---|---|
| `phase` | KubernautPhase | Current phase: `Validating`, `Migrating`, `Deploying`, `Running`, `Degraded`, `Error` |
| `conditions` | []metav1.Condition | Standard Kubernetes conditions (includes `AnsibleReady`, `ToolRBACBound`) |
| `services` | []ServiceStatus | Per-service readiness (`name`, `ready`, `readyReplicas`, `desiredReplicas`) |
| `lastMigrationHash` | string | Hash of last successful DB migration |
| `lastMigrationTime` | metav1.Time | Timestamp of last migration |
| `boundAdditionalClusterRoles` | []string | Currently bound additional ClusterRoles |
| `boundToolRoleBindings` | []string | Currently managed tool role binding CRB names (for stale-pruning and finalizer cleanup) |

---

## RBAC

The operator creates **14** baseline ClusterRoles (namespace-prefixed as `{namespace}-{base}`), plus **2** monitoring-only ClusterRoles when `spec.monitoring.enabled: true`, **6** per-persona tool ClusterRoles for SAR authorization, and optionally **1** Ansible ClusterRole. See [Security & RBAC](../architecture/security-rbac.md) for the full permission matrix.

| ClusterRole base name | Component | Notes |
|---|---|---|
| `gateway-role` | Gateway | |
| `aianalysis-controller` | AI Analysis | |
| `kubernaut-agent-client` | KA ↔ service access | |
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
| `apifrontend-role` | API Frontend | v1.5+ — SAR, InvestigationSession CRD, RR/RAR access, cluster context triage |
| `alertmanager-view` | Monitoring only | When `spec.monitoring.enabled: true` |
| `gateway-signal-source` | Monitoring only | When `spec.monitoring.enabled: true` |
| `kubernaut-tool-sre` | SAR tool persona | v1.5+ — from `spec.apiFrontend.rbac.roleBindings` |
| `kubernaut-tool-ai-orchestrator` | SAR tool persona | v1.5+ |
| `kubernaut-tool-cicd` | SAR tool persona | v1.5+ |
| `kubernaut-tool-observability` | SAR tool persona | v1.5+ |
| `kubernaut-tool-l3-audit` | SAR tool persona | v1.5+ |
| `kubernaut-tool-remediation-approver` | SAR tool persona | v1.5+ |
| `workflowexecution-awx` | Ansible only | When `spec.ansible.enabled: true` |
