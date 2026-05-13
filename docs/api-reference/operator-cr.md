# Operator CR API Reference

The `Kubernaut` custom resource (`kubernaut.ai/v1alpha1`) is the single deployment artifact for the Kubernaut Operator. One CR named `kubernaut` per namespace configures the entire platform.

**Source**: [`kubernaut-operator/api/v1alpha1/kubernaut_types.go`](https://github.com/jordigilh/kubernaut-operator/blob/main/api/v1alpha1/kubernaut_types.go)  
**CRD schema**: [`kubernaut-operator/config/crd/bases/kubernaut.ai_kubernauts.yaml`](https://github.com/jordigilh/kubernaut-operator/blob/main/config/crd/bases/kubernaut.ai_kubernauts.yaml)

---

## `spec` (KubernautSpec)

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
| `aiAnalysis` | [AIAnalysisSpec](#aianalysisspec) | — | Rego approval policy ConfigMap, confidence threshold |
| `signalProcessing` | SignalProcessingSpec | — | Rego classification policy ConfigMap, proactive mappings |
| `remediationOrchestrator` | [RemediationOrchestratorSpec](#remediationorchestratorspec) | — | Timeouts, routing, dry-run, retention |
| `workflowExecution` | [WorkflowExecutionSpec](#workflowexecutionspec) | — | Execution namespace, cooldown, Tekton toggle |
| `effectivenessMonitor` | EffectivenessMonitorSpec | — | Stabilization/validity windows |
| `gateway` | [GatewaySpec](#gatewayspec) | — | Route, CORS, trusted proxies, deduplication |
| `authWebhook` | AuthWebhookSpec | — | Logging, resources |
| `dataStorage` | DataStorageSpec | — | Logging, resources |
| `networkPolicies` | [NetworkPoliciesSpec](#networkpoliciesspec) | disabled | Kubernetes NetworkPolicy creation |

---

## Type Definitions

### PostgreSQLSpec

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `host` | string | **yes** | — | PostgreSQL hostname |
| `port` | int | no | `5432` | PostgreSQL port |
| `secretName` | string | **yes** | — | Secret containing `username`, `password`, `database` keys |
| `sslMode` | string | no | — | SSL mode: `disable`, `require`, `verify-ca`, `verify-full` |

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

### AIAnalysisSpec

| Field | Type | Description |
|---|---|---|
| `policy.configMapName` | string | **Required** — ConfigMap containing `approval.rego` |
| `confidenceThreshold` | string | Minimum confidence score for auto-approval |

### RemediationOrchestratorSpec

| Field | Type | Description |
|---|---|---|
| `timeouts` | ROTimeoutsSpec | Per-phase timeouts: `global`, `processing`, `analyzing`, `executing`, `awaitingApproval`, `verifying` |
| `routing` | RORoutingSpec | Backoff, cooldown, and failure threshold settings |
| `effectivenessAssessment` | ROEffectivenessSpec | Stabilization window |
| `asyncPropagation` | ROAsyncPropagationSpec | Delays for GitOps sync, operator reconcile, proactive alerts |
| `dryRun` | bool | Enable global dry-run (Level 1 — Observe) |
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
| `conditions` | []metav1.Condition | Standard Kubernetes conditions |
| `services` | []ServiceStatus | Per-service readiness (`name`, `ready`, `readyReplicas`, `desiredReplicas`) |
| `lastMigrationHash` | string | Hash of last successful DB migration |
| `lastMigrationTime` | metav1.Time | Timestamp of last migration |
| `boundAdditionalClusterRoles` | []string | Currently bound additional ClusterRoles |

---

## RBAC

The operator creates **13** baseline ClusterRoles (namespace-prefixed as `{namespace}-{base}`), plus **2** monitoring-only ClusterRoles when `spec.monitoring.enabled: true`. See [Security & RBAC](../architecture/security-rbac.md) for the full permission matrix.

| ClusterRole base name | Component |
|---|---|
| `gateway-role` | Gateway |
| `aianalysis-controller` | AI Analysis |
| `kubernaut-agent-client` | KA ↔ service access |
| `kubernaut-agent-investigator` | KA cluster-wide read |
| `signalprocessing-controller` | Signal Processing |
| `remediationorchestrator-controller` | Remediation Orchestrator |
| `workflowexecution-controller` | Workflow Execution |
| `workflow-runner` | Workflow Runner (Jobs) |
| `effectivenessmonitor-controller` | Effectiveness Monitor |
| `notification-controller` | Notification |
| `data-storage-auth-middleware` | DataStorage auth |
| `data-storage-client` | DataStorage client |
| `authwebhook-role` | Auth Webhook |
| `alertmanager-view` | Monitoring only |
| `gateway-signal-source` | Monitoring only |
| `workflowexecution-awx` | Ansible only |
