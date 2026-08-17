# What's New

This page summarises the notable changes in each Kubernaut release.
Kubernaut does not support in-place upgrades — each release is a fresh install.
Review the changes below to understand what differs from the version you are currently running.

---

## v1.5.6

### Security: Console-access authorization gate

v1.5.6 adds a **coarse-grained console-access SAR check** in front of every AF tool call, independent of the existing per-tool authorization (#1919, #1941, AC-3/AC-6/AU-12). Every `POST /mcp` and `POST /a2a/invoke` request must now pass both the new `kubernaut.ai/console` "use" check and the pre-existing per-tool `kubernaut.ai/tools` check. A new advisory `GET /a2a/access` endpoint lets UI clients pre-flight the gate.

!!! danger "Operator action may be required"
    The Helm chart's `apifrontend.config.rbac.consoleAccessGroups` value defaults to all 6 built-in persona group names, so deployments using only those defaults need no changes. If you configured a **custom** group under `apifrontend.config.rbac.personas`, you must add that same group name to `consoleAccessGroups`, or its members will have **every** tool call denied after upgrading — even though their existing per-tool grants are unchanged. `helm install`/`helm upgrade` now prints a `NOTES.txt` warning listing any `personas` group missing from `consoleAccessGroups` to catch this at deploy time.

    Deployments via the **Kubernaut Operator** are not at risk of this: when `spec.apiFrontend.rbac.consoleAccessGroups` is left unset, the operator auto-derives it as the union of groups already present in `roleBindings`, so every group with existing tool access keeps console access automatically.

See [Security & RBAC: Console-access authorization gate](../architecture/security-rbac.md#console-access-gate) for the full model, and [Configuration: RBAC](../user-guide/configuration.md) for the Helm value.

### Platform hardening

Several reliability fixes to the interactive investigation pipeline, most notably:

- **`kubernaut_present_decision` crashed the entire interactive approve/decline/dismiss flow on every grounded decision (#2110)** — a structured RCA substitution was assigned as a non-`gob`-registered struct pointer, which failed the a2a artifact deep-copy pipeline. Fixed by assigning a plain map instead.
- **`workflow_discovery` could hang indefinitely** when a same-kind/API-version validation gate's non-streamed retry call exceeded AF's inactivity budget (#2086), or after the LLM's terminal decision response with no timeout at all (#1949) — both now emit keepalive events / are wired into inactivity-cancel paths.
- **Interactive session capacity eroded under sustained load** before configured concurrency limits were reached (#2100), and the active-sessions gauge drifted upward instead of tracking real capacity (#2103) — the previously-unused `SessionJanitor` is now wired in, and every completion path decrements the gauge centrally.
- **`apiVersion` could fail to reach KA's workflow-discovery filter**, silently degrading to kind-only matching and risking the wrong workflow being selected when a Kind exists in more than one API group (#2061, #2064, #2066) — closed across the CRD-fallback resolver, AA's request to KA, and Gateway's event/alert resolution.

See the [v1.5.6 release notes](https://github.com/jordigilh/kubernaut/releases/tag/v1.5.6) for the complete list (23 fixed issues in this release).

### Security: CVE remediation

- **CVE-2026-56852** in `golang.org/x/text`, pulled in transitively by the `db-migrate` image's goose builder (#1763, #1781) — pinned to the patched version.

---

## v1.5.5

### Fixed: Kubernaut Agent `temperature` is no longer sent unless explicitly configured

Some models (e.g. `claude-opus-4-8`) reject the LLM `temperature` parameter outright with an HTTP 400, which previously surfaced to users as a generic `internal_error` during workflow discovery (#1749, BR-HAPI-199). `Temperature` is now a pointer end-to-end, and the `kubernaut-agent-llm-runtime` ConfigMap rendered by the Helm chart **omits `temperature` by default** instead of defaulting to `0.7`.

!!! info "Action needed only if your model requires an explicit temperature"
    Set `kubernautAgent.llm.temperature` explicitly (including `0`) if your model supports and requires it. See [Kubernaut Agent Config: Temperature Tuning](../user-guide/configmap-kubernaut-agent.md#temperature-tuning).

---

## v1.5.4

Primarily a CI/Helm-smoke-test infrastructure release (a CI runner Kind version bump exposed four latent chart/test gaps, all backported fixes of issues already fixed independently on `main`). One change affects real cluster installs:

- **`networkPolicies.apiServerCIDR` auto-discovery** — previously required manually setting the API-server CIDR/port for NetworkPolicy-selected pods to reach the Kubernetes API server (a hard requirement for `authwebhook`'s startup init container). The chart now auto-discovers the real backend endpoint IP(s) and port via a Helm `lookup` against the live `kubernetes` Endpoints object during any real `helm install`/`upgrade` — no manual `--set` needed in the common case. Manual override remains available and is **required** for `helm template`/GitOps rendering, where `lookup` has no live-cluster access.

---

## v1.5.3

### Fixed: workflow registration no longer pre-flights the registry

DataStorage no longer performs a registry existence check (`execution.bundle`) at workflow registration time (#1642) — that check ran from DataStorage's own network/credential context and couldn't validate self-signed or credential-required private registries reachable only by the workflow execution environment. An incorrect or unreachable image now registers successfully and fails later, at Job/PipelineRun image-pull time. See [Workflow Schema Reference: Bundle Digest Format](../user-guide/workflows.md#bundle-digest-format) for the operator-facing detail.

---

## v1.5.2

### Breaking: 4-level severity model (ADR-066)

The severity model was collapsed from a free-form scheme to 4 canonical values: `critical`, `high`, `warning`, `info` (plus `unknown` as the classification fallback) — replacing `medium` with `warning` and `low` with `info` across CRD enums, OpenAPI specs, Rego policies, LLM prompt templates, and mock-LLM fixtures (#1484).

`medium` and `low` remain accepted as **input aliases** in the shipped example Rego policy (mapped down to `warning`/`info` respectively) for backward compatibility with existing AlertManager/webhook severity labels — but no Kubernaut component ever stores or emits `medium`/`low` as an output value anymore. If you have external tooling, dashboards, or custom Rego policies that branch on the literal strings `medium` or `low` coming out of Kubernaut's `SignalProcessing.status.severity` (or the equivalent `Signal.severity` audit field), update them to `warning`/`info`.

### Added: OpenAI-compatible LLM adapter

A new `openai_compatible` provider lets the **Kubernaut Agent** connect to OpenAI-compatible endpoints (LlamaStack, vLLM, Ollama, Azure OpenAI) over plain `net/http` with `http.Client` injection for mTLS transport chains — supporting streaming (SSE), tool-call accumulation, and generation-config forwarding (#1487, BR-INTEGRATION-1254). Configure via `ai.llm.provider: openai` and an `endpoint` pointing at the server origin. See [Kubernaut Agent Config: OpenAI-Compatible](../user-guide/configmap-kubernaut-agent.md#openai-compatible-vllm-localai-tgi).

!!! warning "Not available for severity triage"
    The API Frontend's `severityTriage.llm` block does **not** go through this adapter — it only supports `vertex_ai`, `gemini`, and `anthropic`. Setting `severityTriage.llm.provider: openai` or `openai_compatible` passes config validation but fails at runtime with `unsupported triage LLM provider`. See [Configuration: Severity Triage](../user-guide/configuration.md#severity-triage-v151).

### Fixed

- **Cluster-scoped namespace strip (#1480, #1477)** — Dynamic scope resolution via RESTMapper for `ka_investigate_mcp`, self-healing namespace strip for cluster-scoped resources in AF, and scope-aware namespace resolution in Effectiveness Monitor target resource fetch.

### Security

- **CVE remediation in db-migrate (#1485)** — Pinned `x/crypto` and `x/net` to resolve known CVEs.

---

## v1.5.1

### Kubernaut Console

Kubernaut v1.5.1 introduces the **Kubernaut Console**, a web UI for interactive investigation and remediation. Operators can chat with the Kubernaut Agent in real time, view live RCA progress, approve remediation actions, and inspect audit trails from a single pane of glass.

Key capabilities:

- **A2A chat interface** — interactive investigation via `POST /a2a/invoke` with real-time SSE streaming of agent reasoning, tool calls, and investigation events
- **Thinking panel** — live visualization of the agent's reasoning with collapsible sections for `reasoning`, `tool_call`, and `investigation` events
- **RCA cards** — structured root cause analysis display with causal chain, confidence score, severity, and tool call count
- **Workflow selection** — recommended remediation workflows with countdown confirmation and alignment verdicts
- **Approval gate** — approve or decline `RemediationApprovalRequest` via `kubernaut_approve` on the MCP bridge
- **Escalation input** — inline escalation with reason capture via `kubernaut_complete_no_action` with `escalation_reason`
- **Verification timer** — live stabilization window countdown tracking `stabilization_elapsed`, `spec_hash_computed`, `alert_check`, and `health_check` steps
- **Phase indicator** — real-time lifecycle banner (Investigating, Decision, Remediation, Verifying, Complete) with elapsed timer
- **Real-time status streaming** — separate SSE subscription to `POST /a2a/status` for RR phase changes with automatic reconnection

The Console deploys as a single pod with two containers: an **oauth2-proxy** sidecar (OIDC authentication, port 4180) and an **nginx** container serving the SPA and proxying API calls to the API Frontend (port 8080). On OpenShift, a TLS-terminated Route is created automatically.

#### Deployment

**Prerequisites**: Kubernetes 1.28+ or OpenShift 4.14+, Kubernaut API Frontend deployed, OIDC provider (Keycloak, Dex).

```bash
# 1. Create the OIDC secret
kubectl create secret generic kubernaut-console-oidc \
  --namespace kubernaut-system \
  --from-literal=client-id=kubernaut-console \
  --from-literal=client-secret=<YOUR_CLIENT_SECRET> \
  --from-literal=cookie-secret=$(openssl rand -base64 32)

# 2. Install the chart
helm install kubernaut-console ./chart \
  --namespace kubernaut-system \
  --set auth.issuerUrl=https://your-keycloak/realms/kubernaut \
  --set auth.clientId=kubernaut-console \
  --set apiFrontend.url=http://apifrontend-service.kubernaut-system.svc:8443
```

When deploying via the **Kubernaut Operator**, use `spec.console` instead (see [ConsoleSpec](../api-reference/operator-cr.md#consolespec)).

#### Helm values

| Value | Default | Description |
|---|---|---|
| `image.repository` | `ghcr.io/jordigilh/kubernaut-console` | Container image |
| `image.tag` | `latest` | Image version (pin by digest for production) |
| `apiFrontend.url` | `http://apifrontend.kubernaut-system.svc:8443` | API Frontend service URL |
| `auth.provider` | `oidc` | OAuth2 Proxy provider |
| `auth.issuerUrl` | — | OIDC issuer URL |
| `auth.clientId` | `kubernaut-console` | OIDC client ID |
| `auth.existingSecret` | `kubernaut-console-oidc` | Secret with keys: `client-id`, `client-secret`, `cookie-secret` |
| `auth.skipTlsVerify` | `true` | Skip TLS for dev (must be `false` in production) |
| `auth.redirectUrl` | — | OAuth2 callback URL |
| `service.type` | `ClusterIP` | Service type |
| `service.port` | `4180` | Service port (OAuth2 Proxy) |
| `route.enabled` | `true` | Create OpenShift Route |
| `route.host` | auto-derived | Custom route hostname |
| `route.tls.termination` | `edge` | TLS termination mode |

#### Nginx proxy routes

| Location | Target | Timeout | Notes |
|---|---|---|---|
| `/a2a/` | API Frontend | 3600s | SSE streaming, buffering disabled |
| `/mcp` | API Frontend | 30s | JSON-RPC tool calls |
| `/.well-known/` | API Frontend | default | Agent card discovery |
| `/healthz` | local 200 | — | Liveness/readiness probe |
| `/` | static files | — | SPA fallback to `index.html` |

#### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 502 on `/a2a/` | AF not reachable | Check AF service DNS and port |
| OIDC redirect loop | Incorrect redirect URI | Verify Keycloak/Dex client config matches `auth.redirectUrl` |
| SSE disconnects | Proxy timeout too low | Ensure 3600s timeouts on SSE route |
| Stale UI after deploy | Image pull policy `IfNotPresent` | Use `Always` or pin by digest |

See the [Kubernaut Console repository](https://github.com/jordigilh/kubernaut-console) for full architecture, Kind demo deployment, and development setup.

### Interactive GitOps remediation demo

A video demonstrating **GitOps drift remediation in interactive mode** has been added to the [Kubernaut README](https://github.com/jordigilh/kubernaut). The demo shows the full journey: a bad commit breaks a ConfigMap in a GitOps-managed production namespace, Kubernaut traces the pod crash to the ConfigMap root cause, selects `git revert` over `kubectl rollback` because the environment is GitOps-managed, pauses for human approval (production namespace), and executes the fix via ArgoCD sync.

<div align="center">
  <video src="https://github.com/user-attachments/assets/b95290db-412b-4d6d-81b8-f766ef4657e2" controls width="100%"></video>
</div>

### Per-phase LLM routing (`phaseModels`)

Configure different LLM models for each phase of the investigation pipeline via the `phaseModels` map in the `kubernaut-agent-llm-runtime` ConfigMap:

| Phase key | Description |
|---|---|
| `rca` | Root-cause analysis loop (K8s + Prometheus tools) |
| `workflow_discovery` | Workflow selection and discovery |
| `validation` | Post-selection validation |

Override fields per phase: `provider`, `endpoint`, `model`, `apiKey`, plus cloud-specific fields (`azureApiVersion`, `vertexProject`, `vertexLocation`, `bedrockRegion`). Non-empty fields override the base config; `temperature`, `maxRetries`, and `timeoutSeconds` are always inherited. Hot-reloadable via FileWatcher — no pod restart needed.

**Configuration paths**: operator CR (`spec.kubernautAgent.llm.phaseModels`) or direct ConfigMap patch. The Helm chart does not yet expose `phaseModels` as a value key.

See [Kubernaut Agent Config: phaseModels](../user-guide/configmap-kubernaut-agent.md#per-phase-llm-routing-v151) for the full reference.

### Severity triage LLM configuration

The severity triage pipeline can now use a **dedicated LLM** instead of sharing the agent's LLM. Configure via a ConfigMap overlay under `severityTriage.llm` — supports `provider` (vertex_ai, gemini, anthropic), `model`, `endpoint`, `apiKeyFile`, `timeoutSeconds`, `oauth2`, `circuitBreaker`, and `customHeaders`.

The Helm chart exposes only two severity triage values: `cacheTTLSeconds` (default 30) and `llmConfidence` (default 0.7). The full `LLMConfig` block requires a ConfigMap overlay. The operator auto-derives severity triage enablement from `spec.monitoring.enabled`.

See [Configuration: Severity Triage](../user-guide/configuration.md#severity-triage-v151) for the full reference.

### Multi-provider JWT authentication

Both the Kubernaut Agent and API Frontend now support **multiple JWT providers** via a `jwtProviders[]` array, enabling dual-provider configurations (e.g., Keycloak + SPIRE). The two services use intentionally different schemas:

| Field | Kubernaut Agent | API Frontend |
|---|---|---|
| Issuer | `issuer` (string) | `issuerURL` (string) |
| Audience | `audience` (singular string) | `audiences` (string array) |
| JWKS URL | `jwksURL` (required) | `jwksURL` (optional, falls back to issuerURL) |
| Claim mappings | Simple claim names, dot-notation | CEL expressions or claim paths |

`ClaimMappingsSpec` supports `username` and `groups` fields. Legacy single-provider fields (`issuerURL` + `audience`) remain supported for backward compatibility.

See [Configuration: JWT Providers](../user-guide/configuration.md#jwt-providers-v151) for the full reference.

### MCP tool surface: 21 to 23

Two tools join the public MCP bridge:

| Tool | Condition | Purpose |
|---|---|---|
| `kubernaut_list_alerts` | Registered when `severityTriage.enabled: true` and Prometheus is configured | Query firing alerts with `namespace`, `severity`, `state` filters |
| `kubernaut_complete_no_action` | Always registered | Complete an investigation with no remediation — dismiss or escalate to operator |

When `interactive.enabled: false`, **11 session-dependent tools** are hidden (up from 10), leaving **12 stateless tools** on MCP (13 with `list_alerts` if Prometheus is configured).

See [MCP Tool Reference](../api-reference/mcp-tools.md) for the updated tool list.

### Breaking: `kubernaut_approve` removed from A2A agent (DD-AF-006)

`kubernaut_approve` is **structurally absent** from the A2A agent's `buildToolList()`. It remains available on the MCP bridge for the Kubernaut Console's Approve/Reject buttons. This prevents an LLM from autonomously approving RemediationApprovalRequests via prompt injection, preserving the human consent gate that RARs exist to enforce.

Defense-in-depth: (1) tool absent from `buildToolList()`, (2) explicit prompt instruction, (3) SAR RBAC on the MCP path, (4) audit trail attributing every approval to the human user.

### `POST /a2a/status` SSE endpoint (DD-AF-008)

New endpoint for real-time remediation status streaming. Clients subscribe to phase transitions for a specific RemediationRequest.

- **Request**: JSON-RPC 2.0 body with method `status/subscribe` and `params.rr_id`
- **Events**: `status/update` (phase, timestamp, final, metadata) and `status/closing` (reason, reconnect)
- **Heartbeat**: 15-second keepalive
- **Auth**: same OIDC chain as `/mcp` and `/a2a/invoke`

See [API Frontend API: Status SSE](../api-reference/apifrontend-api.md#status-sse-v151) for the full reference.

### CRD changes

- **`HumanReviewReason`** enum: added `operator_escalation` — triggered by `kubernaut_complete_no_action` with `escalation_reason`
- **`SubReason`** enum: added `OperatorEscalation`
- **AIAnalysis reasons**: added `InteractiveCancelled` and `ParentCancelled`

See [CRD Reference](../api-reference/crds.md) for the updated enum tables.

### Operator CR updates

The Kubernaut Operator CRD now includes:

- **`JWTProviderSpec`** at `spec.kubernautAgent.interactive.jwtProviders[]` and `spec.apiFrontend.auth.jwtProviders[]` — `name`, `issuerURL`, `jwksURL`, `audiences`, `claimMappings` (`username`, `groups`)
- **`phaseModels`** at `spec.kubernautAgent.llm.phaseModels` — per-phase LLM override map with CEL validation for keys (`rca`, `workflow_discovery`, `validation`)
- **`ConsoleSpec`** at `spec.console` — `enabled`, `auth.secretName`, `route.enabled`, `route.host`, `resources`

See [Operator CR Reference](../api-reference/operator-cr.md) for the full schema.

### Platform hardening

- **Cascade terminal phase** — When a RemediationRequest enters a terminal phase, all child resources (AIAnalysis, SignalProcessing, WorkflowExecution) are patched to `PhaseFailed`. Idempotent, non-fatal.
- **`alignment_verdict` audit event** — Emitted after every investigation with structured payload: `result` (aligned/suspicious), `circuit_breaker_activated`, `summary`, `findings[]`, and optional `grounding_review`

---

## v1.5

### API Frontend — new service

Kubernaut v1.5 introduces the **API Frontend** (AF), the 11th microservice. It acts as the unified external protocol layer for MCP, A2A, and REST clients — replacing direct access to internal services with a single authenticated entry point.

- **MCP gateway** — Exposes investigation, workflow discovery, and remediation tools via the Model Context Protocol
- **A2A support** — Agent-to-Agent protocol with agent card discovery at `/.well-known/agent-card.json`
- **SSE streaming** — Real-time investigation output streamed token-by-token via Server-Sent Events
- **SAR authorization** — Kubernetes-native SubjectAccessReview tool authorization with 6 per-persona ClusterRoles, fail-closed, and TTL-cached results
- **MCP bridge** — Dispatches 23 `kubernaut_*` MCP tools to their backends (K8s API, KA MCP, DataStorage) with per-tool RBAC, rate limiting, and audit. Not a transparent proxy — each tool has its own handler and routing

See [API Frontend Architecture](../architecture/apifrontend.md) for the full design, and [Configuration: API Frontend](../user-guide/configuration.md#api-frontend-v15) for Helm values.

### Interactive MCP sessions

Operators and AI agents can now connect to Kubernaut via MCP for **interactive investigation and remediation**. This is the flagship v1.5 feature, replacing the autonomous-only pipeline with an operator-in-the-loop model when desired.

The API Frontend exposes **23 `kubernaut_*` MCP tools** on its MCP endpoint (`POST /mcp`), organized by domain:

| Domain | Tools |
|---|---|
| **Investigation & session lifecycle** | `kubernaut_investigate`, `kubernaut_message`, `kubernaut_complete`, `kubernaut_complete_no_action`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect` |
| **CRD operations** | `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_approve`, `kubernaut_cancel_remediation`, `kubernaut_watch`, `kubernaut_list_approval_requests`, `kubernaut_get_approval_request`, `kubernaut_await_session` |
| **Workflow** | `kubernaut_discover_workflows`, `kubernaut_select_workflow` |
| **Data & history** | `kubernaut_list_workflows`, `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail` |
| **Presentation** | `kubernaut_present_decision` |
| **Alerts (conditional)** | `kubernaut_list_alerts` — registered only when `severityTriage.enabled: true` and Prometheus is configured (v1.5.2+) |

The Kubernaut Agent also runs a separate MCP server (`/api/v1/mcp`) with 3 tools (`kubernaut_investigate`, `kubernaut_select_workflow`, `kubernaut_complete_no_action`) for direct client connections with Lease-based session management.

See [Interactive Sessions](../user-guide/interactive-sessions.md) for the operator guide and [API Frontend API](../api-reference/apifrontend-api.md) for the full tool reference.

### Interactive workflow discovery with LLM-populated parameters

The `discover_workflows` action on `kubernaut_investigate` returns workflow alternatives with **parameters pre-populated by the LLM** based on the root cause analysis (PR #1171, PR #1188). Operators review and edit parameters before confirming execution via `kubernaut_select_workflow`.

Parameter safety is enforced through **comprehensive validation with LLM self-correction** (PR #1187): type checking against the workflow's declared parameter schema, regex pattern matching, required field enforcement, and automatic retry when the LLM provides invalid values.

See [Workflow Authoring: Parameters](../user-guide/workflows.md#parameters) for the parameter schema reference.

### Breaking: SAR-based tool authorization replaces file-based RBAC

The API Frontend's static `rbac_roles.yaml` ConfigMap has been **replaced by Kubernetes-native SubjectAccessReview (SAR)** authorization at `tools/call` time (PR #1222). `tools/list` remains unfiltered (ADR-020).

**Migration required**: customers who customized `rbac_roles.yaml` must create equivalent `ClusterRoleBinding` resources. The Helm chart ships 6 per-persona `ClusterRoles`:

| ClusterRole | Persona | MCP Tools |
|---|---|---|
| `kubernaut-tool-sre` | Investigation + remediation (no approval) | 20 |
| `kubernaut-tool-ai-orchestrator` | Automated agent orchestration | 15 |
| `kubernaut-tool-cicd` | CI/CD pipeline integration | 3 |
| `kubernaut-tool-observability` | Read-only observability | 5 |
| `kubernaut-tool-l3-audit` | Compliance and auditing | 6 |
| `kubernaut-tool-remediation-approver` | Human approval workflows | 4 |

SAR uses verb `use` on resource `tools` in apiGroup `kubernaut.ai`. Authorization is fail-closed: SAR API errors deny the tool call. Results are cached with a configurable TTL (default 30s via `apifrontend.config.rbac.sarCacheTTL`).

See [Security & RBAC: Tool Authorization](../architecture/security-rbac.md#tool-authorization-v15) for the full model and binding examples.

### Unified ServiceAccount model (ADR-022)

All AF Kubernetes API calls use the **AF pod's own ServiceAccount** — there is no per-user impersonation or token forwarding. Application-level authorization is enforced entirely through SAR-based tool gating; user attribution is preserved in the application audit trail (`tool.executed` events with `UserID`, `actor_ip`).

See [Security & RBAC: Unified SA model](../architecture/security-rbac.md#unified-sa-model) for accepted risks and mitigations.

### Generic cluster context tools replace narrow triage tools

The 4 narrow AF triage tools (`af_get_pods`, `af_get_workloads`, `af_list_events`, `af_resolve_owner`) have been replaced with 3 generic **internal** tools that can inspect any namespaced Kubernetes resource (#1230):

| New Tool | Replaces | Purpose |
|---|---|---|
| `kubectl_get` | `af_get_pods`, `af_get_workloads` (single) | Get any namespaced resource by kind/name/namespace |
| `kubectl_list` | `af_get_pods`, `af_get_workloads` (list) | List any namespaced resources with optional label selector |
| `kubectl_list_events` | `af_list_events` | List events with reason/object filters (renamed for consistency) |

`af_resolve_owner` is removed — KA independently resolves the owner chain during RCA. The new tools use `RESTMapper` for dynamic kind-to-GVR resolution. Secret `.data` fields are redacted before returning to the LLM.

All internal tools (`kubectl_*`, `kubernaut_check_existing_remediation`, `kubernaut_remediate`) run inside the AF's A2A agent loop and are not exposed on the MCP bridge. They are still SAR-gated via `newRBACGuard()` and included in per-persona ClusterRoles. The external MCP surface consists of **23 `kubernaut_*` MCP tools** spanning CRD operations, investigation, interactive session lifecycle, alerts, analytics, and presentation.

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
