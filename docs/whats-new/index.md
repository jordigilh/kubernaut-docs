# What's New

This page summarises the notable changes in each Kubernaut release.
Kubernaut does not support in-place upgrades — each release is a fresh install.
Review the changes below to understand what differs from the version you are currently running.

---

## v1.5

### API Frontend — new service

Kubernaut v1.5 introduces the **API Frontend** (AF), the 11th microservice. It acts as the unified external protocol layer for MCP, A2A, and REST clients — replacing direct access to internal services with a single authenticated entry point.

- **MCP gateway** — Exposes investigation, workflow discovery, and remediation tools via the Model Context Protocol
- **A2A support** — Agent-to-Agent protocol with agent card discovery at `/.well-known/agent-card.json`
- **SSE streaming** — Real-time investigation output streamed token-by-token via Server-Sent Events
- **SAR authorization** — Kubernetes-native SubjectAccessReview tool authorization with 6 per-persona ClusterRoles, fail-closed, and TTL-cached results
- **MCP proxy** — Proxies MCP Streamable HTTP and A2A JSON-RPC to the Kubernaut Agent, where session management (Lease-based locking, orphan reclamation, `SessionDrainer`) is implemented

See [API Frontend Architecture](../architecture/apifrontend.md) for the full design, and [Configuration: API Frontend](../user-guide/configuration.md#api-frontend-v15) for Helm values.

### Interactive MCP sessions

Operators and AI agents can now connect to Kubernaut via MCP for **interactive investigation and remediation**. This is the flagship v1.5 feature, replacing the autonomous-only pipeline with an operator-in-the-loop model when desired.

The Kubernaut Agent registers **3 MCP tools** via the go-sdk MCP server:

| Tool | Purpose |
|---|---|
| `kubernaut_investigate` | Start, reconnect to, take over, check status of, send messages, discover workflows, or complete an investigation (8 actions: `start`, `message`, `complete`, `cancel`, `takeover`, `status`, `reconnect`, `discover_workflows`) |
| `kubernaut_select_workflow` | Operator selects a workflow from the discovery results; triggers enrichment and catalog lookup |
| `kubernaut_complete_no_action` | Operator decides no remediation is needed — can be called at any point |

See [Interactive Sessions](../user-guide/interactive-sessions.md) for the operator guide.

### Interactive workflow discovery with LLM-populated parameters

The `discover_workflows` action on `kubernaut_investigate` returns workflow alternatives with **parameters pre-populated by the LLM** based on the root cause analysis (PR #1171, PR #1188). Operators review and edit parameters before confirming execution via `kubernaut_select_workflow`.

Parameter safety is enforced through **comprehensive validation with LLM self-correction** (PR #1187): type checking against the workflow's declared parameter schema, regex pattern matching, required field enforcement, and automatic retry when the LLM provides invalid values.

See [Workflow Authoring: Parameters](../user-guide/workflows.md#parameters) for the parameter schema reference.

### Breaking: SAR-based tool authorization replaces file-based RBAC

The API Frontend's static `rbac_roles.yaml` ConfigMap has been **replaced by Kubernetes-native SubjectAccessReview (SAR)** authorization at `tools/call` time (PR #1222). `tools/list` remains unfiltered (ADR-020).

**Migration required**: customers who customized `rbac_roles.yaml` must create equivalent `ClusterRoleBinding` resources. The Helm chart ships 6 per-persona `ClusterRoles`:

| ClusterRole | Persona |
|---|---|
| `kubernaut-tool-sre` | Full SRE access (all 19 tools) |
| `kubernaut-tool-ai-orchestrator` | Automated agent orchestration |
| `kubernaut-tool-cicd` | CI/CD pipeline integration |
| `kubernaut-tool-observability` | Read-only observability |
| `kubernaut-tool-l3-audit` | Compliance and auditing |
| `kubernaut-tool-remediation-approver` | Human approval workflows |

SAR uses verb `use` on resource `tools` in apiGroup `kubernaut.ai`. Authorization is fail-closed: SAR API errors deny the tool call. Results are cached with a configurable TTL (default 30s via `apifrontend.config.rbac.sarCacheTTL`).

See [Security & RBAC: Tool Authorization](../architecture/security-rbac.md#tool-authorization-v15) for the full model and binding examples.

### OIDC-direct mode for triage tools

An opt-in authentication mode (PR #1227) that forwards the user's raw OIDC JWT as a bearer token to the K8s API server, eliminating the need for impersonation privileges. Enable via `apifrontend.config.rbac.useOIDCDirect: true`. Compatible with any deployment where the K8s API server trusts the same OIDC provider as the API Frontend. Impersonation remains the default for non-compatible environments.

Additionally, `serviceaccounts` has been removed from the AF ClusterRole's impersonation resources — no AF code path impersonates a service account.

See [Security & RBAC: OIDC-direct mode](../architecture/security-rbac.md#oidc-direct-mode-eliminating-impersonation-v15) for the full model and compatibility matrix.

### Session takeover security (SEC-TAKEOVER-001)

When a second user connects to an active MCP session, the original user's investigation is **abandoned, not completed**. This prevents a takeover from inheriting or completing work under a different identity. The abandoned session is logged as an audit event.

### DataStorage advanced configuration (v1.5)

Three new configuration sub-blocks for DataStorage:

- **`server`** — `maxBodySize` (5 MiB default), `corsAllowedOrigins` for browser-based access, `signerCertDir` for audit event signing
- **`redis`** — `dlqMaxLen` (10,000), TLS configuration for Redis/Valkey connections
- **`retention`** — Automatic data retention cleanup with configurable `interval` (24h), `batchSize` (1,000), and `defaultDays` (2,555 ≈ 7 years)

See [Configuration: DataStorage](../user-guide/configuration.md#datastorage) for all parameters.

### OLM-first disconnected installation

The [disconnected installation guide](../operations/disconnected-install.md) has been rewritten with the **Operator (OLM) path as the primary method**. The Helm chart path is retained as a development/testing appendix.

The OLM flow uses `oc-mirror` v2 with an upstream digest-pinned `ImageSetConfiguration` from the operator repository, producing IDMS and CatalogSource resources automatically.

### Lease RBAC for session management

The Kubernaut Agent ServiceAccount now requires `list` permission on `coordination.k8s.io/leases` (in addition to the existing create/get/update/delete) for orphaned session reclamation at startup. The Helm chart and Operator both provision this automatically.

### Platform hardening

- **SessionDrainer** (BR-OPS-013) — Active MCP sessions are drained before KA pod termination during rolling updates
- **Race-safe session transitions** — Mutex-protected session state machine prevents concurrent state corruption

---

## v1.4

### Prompt injection defense — Shadow Agent

Kubernaut v1.4 introduces a **fail-closed shadow agent** that evaluates every LLM tool output for prompt injection. Two evaluation layers provide defense-in-depth:

- **Per-step scanning** with random boundary markers and data exfiltration detection
- **Full-context grounding review** at the RCA-to-workflow boundary that detects distributed "boiling frog" injection attacks

Enforcement modes (`monitor` or `enforce`) control whether suspicious content is logged or triggers a circuit breaker that cancels the investigation. See [Security & RBAC: Shadow Agent](../architecture/security-rbac.md#shadow-agent) for details.

### Operator workflow overrides

Operators can now **override the AI-selected workflow** when approving a `RemediationApprovalRequest`. The authwebhook validates that the override workflow exists and is active; the orchestrator merges the override with full audit trail. See [Human Approval: Overrides](../user-guide/approval.md#operator-workflow-overrides-v14).

### PagerDuty and Microsoft Teams notifications

Two new delivery channels join Slack:

- **PagerDuty** — Events API v2 delivery with circuit breaker and `CredentialRef` config pattern
- **Microsoft Teams** — Adaptive Card delivery with circuit breaker

All delivery channels now share a generic circuit breaker pattern. See [Notification Channels](../user-guide/notifications.md#pagerduty-setup-v14).

### NetworkPolicies

12 NetworkPolicy templates with **default-deny** ingress posture are deployed for all Kubernaut services. Configurable CIDRs and per-service toggles via `networkPolicies.<service>.enabled`. See [Security & RBAC: NetworkPolicies](../architecture/security-rbac.md#networkpolicies-v14).

### Breaking: Kubernaut Agent config restructured

The Kubernaut Agent configuration has three breaking changes:

1. **camelCase migration** (#908) — All YAML config fields migrated from `snake_case` to `camelCase`
2. **Three-domain layout** — Config reorganized into `runtime`, `ai`, and `integrations` top-level domains
3. **Config split** (#916) — Static ConfigMap (mounted at startup) and hot-reloadable ConfigMap (watched at runtime)

See [Kubernaut Agent SDK Config](../user-guide/configmap-kubernaut-agent.md) for the updated reference.

### Parallel tool execution

The [investigation pipeline](../architecture/kubernaut-agent-investigation.md) now executes multiple LLM tool calls concurrently when the model returns batched requests. The investigation prompt also instructs the LLM to batch independent tool calls for reduced round-trips.

### Platform hardening

- **Inconclusive outcome exponential backoff** (#1091) — `Inconclusive` outcomes trigger exponential backoff (1m → 10m cap) and 3-strikes blocking, preventing RR flood for persistent alerts
- **SA token refresh** (#1055) — Custom token path constructor with 401 cache invalidation for Kubernaut Agent
- **CRD-aware engine registration** (#868) — Engine registration validates CRD availability; enters degraded status when required CRDs are missing
- **Session hardening** (#1078) — Panic recovery, two-tier TTL eviction, 25-minute wall-clock investigation timeout
- **Gateway security hardening** (#673) — 256KB body limits, generic RFC 7807 errors, header stripping, RBAC least-privilege, trusted proxy middleware
- **Unified monitoring config** (#463) — Prometheus and AlertManager configuration unified into a single `monitoring` block
- **Standardized log levels** (#875) — Log level configuration standardized across all services
- **Verdict label rename** (#1077) — `VerdictClean` changed from `"clean"` to `"aligned"`. **Breaking**: update Prometheus queries
- **Audit event batching fix** (#1056) — Audit 401/403 errors reclassified as retryable; token source extracted for shared cache across all callers
- **API version validation gate** (#1044) — Detects when the LLM omits `api_version` for ambiguous Kubernetes Kinds (e.g., `Event` in both `v1` and `events.k8s.io/v1`), retries with a correction listing all conflicting API groups, and escalates to human review on exhaustion to prevent incorrect RBAC grants
- **CRD TTL enforcement** (#265) — Terminal `RemediationRequest` resources are garbage-collected after 24h (configurable via `retention.period`), preventing CRD accumulation in high-volume clusters

### Dry-run mode

When `dryRun` is enabled, the pipeline stops after AI analysis — no WorkflowExecution, RAR, or EA CRDs are created. The RemediationRequest completes with outcome `DryRun`.

### Kubernaut Operator

The [Kubernaut Operator](https://github.com/jordigilh/kubernaut-operator) — introduced in v1.3 — is the recommended deployment method for OpenShift. v1.4 adds:

- **OLM lifecycle management** — Install, upgrade, and uninstall via Operator Lifecycle Manager with automatic CRD installation and cleanup
- **Supply chain security** — Container images ship with SBOM, Cosign signatures, and SLSA provenance attestations
- **`postgresql.sslMode`** — Configurable SSL mode for PostgreSQL connections (`disable`, `require`, `verify-ca`, `verify-full`)
- **`notification.routing` BYO** — Bring-your-own routing ConfigMap with hot-reload support
- **`runtimeConfigMapName`** — Separate hot-reloadable ConfigMap for Kubernaut Agent runtime configuration
- **Init image mirroring** — `RELATED_IMAGE_*` environment variables for disconnected/air-gapped installs

See the [Operator installation guide](https://github.com/jordigilh/kubernaut-operator/tree/main/docs/installation) for deployment instructions.

### Deprecated: OCP-specific Helm chart

The OCP-specific Helm chart is deprecated (#848). Use the unified `kubernaut` chart with the Kubernaut Operator for OpenShift deployments.

### Removed: Conversation API

Conversational mode for Kubernaut Agent (#592) has been removed from v1.4 and deferred to v1.5 as part of the interactive session model.

---

## v1.3

### Kubernaut Agent (formerly HolmesGPT)

The LLM integration component has been renamed from **HolmesGPT / HAPI** to **Kubernaut Agent** across all services, Helm values, ConfigMaps, and documentation.

| Before (v1.2) | After (v1.3) |
|---|---|
| `holmesgptApi.*` Helm values | `kubernautAgent.*` |
| `holmesgpt-sdk-config` ConfigMap | `kubernaut-agent-sdk-config` |
| `holmesgpt-config` ConfigMap | `kubernaut-agent-config` |

### Two-invocation investigation architecture

The [investigation pipeline](../architecture/kubernaut-agent-investigation.md) has been redesigned from a single three-phase LLM session (v1.1/v1.2) into **two independent LLM invocations**:

1. **Invocation 1 — Root Cause Analysis**: A full tool-access session that performs live Kubernetes inspection and produces a structured RCA result.
2. **Invocation 2 — Workflow Selection**: A separate session with no memory of Invocation 1, receiving only structured context fields. Selects a workflow or reports that none is applicable.

This separation improves reliability and makes each invocation independently testable.

### mTLS and three-port model

All inter-service communication can now be secured with **mutual TLS**. API-serving components (Gateway, DataStorage, Kubernaut Agent, AIAnalysis) expose three ports:

- **HTTPS serving port** — mTLS-protected API traffic
- **Health port** — plaintext liveness/readiness probes
- **Metrics port** — plaintext Prometheus scrape target

Certificate rotation is handled automatically when `tls.mode: hook` is set, or delegated to cert-manager. See [Monitoring](../operations/monitoring.md) for port details and probe configuration.

### SDK config hot-reload

The [Kubernaut Agent SDK config](../user-guide/configmap-kubernaut-agent.md) (LLM model, endpoint, API key, toolset settings) now supports **hot-reload** via `fsnotify`. Active investigations pin a config snapshot at session start, so in-flight work is unaffected. Provider-level settings (`llm.provider`, OAuth2 credentials) still require a pod restart.

### Expanded LLM provider support

The Kubernaut Agent now supports **Vertex AI, OpenAI, Anthropic, Bedrock, Ollama**, and additional providers via **LangChainGo**.

### Custom HTTP headers for LLM endpoints

Users can now inject [custom HTTP headers](../user-guide/configmap-kubernaut-agent.md#custom-headers) into outbound LLM API requests. This supports LLM proxies, API gateways, and corporate firewalls that require additional authentication headers. Three value sources are available: static values, Kubernetes Secret references (via environment variables), and file paths (for rotating tokens).

### Effectiveness Monitor improvements

- `maxConcurrentReconciles` for parallel EA processing
- Configurable `connectionTimeout`, `prometheusLookback`, and `scrapeInterval`
- Clarified stabilization window semantics (EM-internal vs RO-configured `EA.spec`)

See [Effectiveness](../user-guide/effectiveness.md) for configuration details.

### Notification coverage

Block reasons and terminal failure states now produce [notifications](../user-guide/notifications.md) (BR-ORCH-036), closing gaps where operators were not informed of remediation failures.

### Prometheus metric rename

Kubernaut Agent metrics have been renamed from the legacy `holmesgpt_*` namespace to `aiagent_api_*`. Update any Prometheus queries, alerting rules, or dashboards that reference the old metric names. See [Monitoring](../operations/monitoring.md) for the current metric reference.

### New notification types

v1.3 introduces additional notification types that may require [routing configuration](../user-guide/notifications.md) updates:

- **Escalation** notifications for trust-ladder escalation events
- **StatusUpdate** notifications for transient block conditions
- **ManualReview** notifications now split by review-source for finer routing control

### Data persistence

Comprehensive [schema documentation](../architecture/data-persistence.md) rewritten from the live v1.3 database, including enrichment tables, metric baselines, and updated entity-relationship diagrams.

### Feature enrichments and metrics

New documentation for feature enrichment pipeline stages and the notification metrics design decision (DD-METRICS-001).

---

## v1.2

### Per-workflow ServiceAccount and RBAC

Each workflow execution now runs under its own **ServiceAccount** with a dedicated **TokenRequest**. This replaces the shared SA model from v1.1 and provides fine-grained RBAC isolation per remediation workflow.

### Declarative workflow catalog

The workflow catalog has moved from OCI-containerized workflow bundles to **declarative `RemediationWorkflow` CRDs** with category and label-based matching plus confidence scoring.

### Effectiveness and notification pipeline

Updated effectiveness assessment configuration, notification routing semantics, and EM config key alignment.

### DataStorage, audit, and monitoring

Updated data access patterns, audit event documentation, and monitoring metric names.

### Signal Processing and Gateway

Rego policy entrypoint corrections, gateway label contract updates, and investigation tier-1 semantics fixes.

---

## v1.1

Initial documented release of Kubernaut.

- CRD-based microservices architecture with the full six-stage remediation pipeline
- Prometheus AlertManager and Kubernetes Event ingestion
- LLM-powered root cause analysis with Kubernetes inspection tools
- Remediation execution via Kubernetes Jobs, Tekton Pipelines, or Ansible (AWX/AAP)
- Effectiveness assessment with four-dimensional scoring
- Human approval gates via RemediationApprovalRequest CRDs
- Rego-based policy evaluation for signal processing and approval
- Multichannel notifications (Slack, console, log, file)
- Full audit trail with 7-year retention and CRD reconstruction
- ActionType and RemediationWorkflow CRD registration via Auth Webhook
- Alert decay detection (DD-EM-003)
- Resource lock persistence with deterministic naming (DD-WE-003)

---

## v1.0

End-of-life. No longer documented or supported.
