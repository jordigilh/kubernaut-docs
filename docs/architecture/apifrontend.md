# API Frontend Architecture

The API Frontend (AF) is the unified external protocol layer introduced in v1.5. It provides MCP, A2A, and REST access to Kubernaut for operators, AI agents, and the Backstage console.

## Overview

The AF sits between external clients and the Kubernaut Engine, handling:

- **Protocol translation** — MCP tool calls and A2A tasks are translated into internal Kubernaut API calls
- **Authentication** — OIDC/OAuth2 via JWKS validation with JWT claim extraction
- **Authorization** — Kubernetes-native SAR-based tool authorization (PR #1222); fail-closed with TTL cache
- **MCP bridge** — Dispatches 23 `kubernaut_*` MCP tools to their backends (K8s API, KA MCP, DataStorage, Prometheus) with per-tool routing. When `interactive.enabled: false` (#1366), 11 session-dependent tools are hidden, leaving 12 stateless tools for CRD and data operations only (13 with `kubernaut_list_alerts` if Prometheus is configured).
- **Streaming** — Relays Server-Sent Events from KA's SSE endpoint to MCP clients

## Agentic Architecture

<div style="max-width:100%;overflow-x:auto;margin:1.5rem 0">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 420" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" style="width:100%;height:auto">
  <rect width="820" height="420" fill="white"/>

  <!-- ── External Clients row ── -->
  <text x="410" y="22" text-anchor="middle" font-size="11" font-weight="700" fill="#64748B" letter-spacing="1.5">EXTERNAL CLIENTS</text>

  <rect x="16" y="34" width="186" height="52" rx="8" fill="#F5F5F5" stroke="#E0E0E0"/>
  <rect x="16" y="34" width="186" height="5" rx="3" fill="#0891B2"/>
  <text x="109" y="58" text-anchor="middle" font-size="12" font-weight="700" fill="#1a1a1a">MCP (AI Interface)</text>
  <text x="109" y="74" text-anchor="middle" font-size="9" fill="#888">Claude, Copilot, custom agents</text>

  <rect x="214" y="34" width="186" height="52" rx="8" fill="#F5F5F5" stroke="#E0E0E0"/>
  <rect x="214" y="34" width="186" height="5" rx="3" fill="#0891B2"/>
  <text x="307" y="58" text-anchor="middle" font-size="12" font-weight="700" fill="#1a1a1a">A2A Agent</text>
  <text x="307" y="74" text-anchor="middle" font-size="9" fill="#888">Agent-to-Agent protocol</text>

  <rect x="412" y="34" width="186" height="52" rx="8" fill="#F5F5F5" stroke="#E0E0E0"/>
  <rect x="412" y="34" width="186" height="5" rx="3" fill="#0891B2"/>
  <text x="505" y="58" text-anchor="middle" font-size="12" font-weight="700" fill="#1a1a1a">Backstage</text>
  <text x="505" y="74" text-anchor="middle" font-size="9" fill="#888">Operator console</text>

  <rect x="610" y="34" width="194" height="52" rx="8" fill="#F5F5F5" stroke="#E0E0E0"/>
  <rect x="610" y="34" width="194" height="5" rx="3" fill="#0891B2"/>
  <text x="707" y="58" text-anchor="middle" font-size="12" font-weight="700" fill="#1a1a1a">OIDC / OAuth2</text>
  <text x="707" y="74" text-anchor="middle" font-size="9" fill="#888">DEX, Keycloak</text>

  <!-- ── Arrows: clients → AF ── -->
  <line x1="109" y1="86" x2="109" y2="106" stroke="#B0B0B0" stroke-width="1.3"/>
  <line x1="307" y1="86" x2="307" y2="106" stroke="#B0B0B0" stroke-width="1.3"/>
  <line x1="505" y1="86" x2="505" y2="106" stroke="#B0B0B0" stroke-width="1.3"/>
  <line x1="707" y1="86" x2="707" y2="106" stroke="#B0B0B0" stroke-width="1.3"/>

  <!-- ── API Frontend bar ── -->
  <rect x="16" y="108" width="788" height="56" rx="10" fill="#8B5CF6" stroke="#7C3AED" stroke-width="1.5"/>
  <text x="410" y="134" text-anchor="middle" font-size="16" font-weight="700" fill="white">API Frontend</text>
  <text x="410" y="152" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.8)">MCP Streamable HTTP · A2A JSON-RPC · OIDC Auth · RBAC</text>

  <!-- ── Arrows: AF → Engine ── -->
  <line x1="250" y1="164" x2="250" y2="190" stroke="#B0B0B0" stroke-width="1.3"/>
  <line x1="570" y1="164" x2="570" y2="190" stroke="#B0B0B0" stroke-width="1.3"/>

  <!-- ── Kubernaut Engine container ── -->
  <rect x="16" y="192" width="788" height="214" rx="12" fill="#0F172A"/>
  <text x="410" y="216" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,0.9)" letter-spacing="1">KUBERNAUT ENGINE</text>

  <!-- Row 1: Gateway + Remediation Orchestrator -->
  <rect x="36" y="228" width="160" height="48" rx="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)"/>
  <rect x="36" y="228" width="160" height="4" rx="2" fill="#0891B2"/>
  <text x="116" y="252" text-anchor="middle" font-size="11" font-weight="700" fill="white">Gateway</text>
  <text x="116" y="266" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.55)">Webhook intake + dedup</text>

  <rect x="216" y="228" width="380" height="48" rx="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)"/>
  <rect x="216" y="228" width="380" height="4" rx="2" fill="white"/>
  <text x="406" y="252" text-anchor="middle" font-size="12" font-weight="700" fill="white">Remediation Orchestrator</text>
  <text x="406" y="266" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.55)">Owns RR lifecycle — creates child CRDs</text>

  <rect x="616" y="228" width="168" height="48" rx="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)"/>
  <rect x="616" y="228" width="168" height="4" rx="2" fill="#6366F1"/>
  <text x="700" y="252" text-anchor="middle" font-size="11" font-weight="700" fill="white">Kubernaut Agent</text>
  <text x="700" y="266" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.55)">LLM investigation (Go)</text>

  <!-- Row 2: 5 phase controllers -->
  <rect x="36" y="290" width="142" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="36" y="290" width="142" height="3" rx="2" fill="#0891B2"/>
  <text x="107" y="312" text-anchor="middle" font-size="10" font-weight="600" fill="white">Signal Processing</text>
  <text x="107" y="325" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.45)">Rego classification</text>

  <rect x="188" y="290" width="142" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="188" y="290" width="142" height="3" rx="2" fill="#6366F1"/>
  <text x="259" y="312" text-anchor="middle" font-size="10" font-weight="600" fill="white">AI Analysis</text>
  <text x="259" y="325" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.45)">LLM RCA + selection</text>

  <rect x="340" y="290" width="142" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="340" y="290" width="142" height="3" rx="2" fill="#D97706"/>
  <text x="411" y="312" text-anchor="middle" font-size="10" font-weight="600" fill="white">Workflow Exec.</text>
  <text x="411" y="325" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.45)">Tekton / Job / Ansible</text>

  <rect x="492" y="290" width="142" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="492" y="290" width="142" height="3" rx="2" fill="#059669"/>
  <text x="563" y="312" text-anchor="middle" font-size="10" font-weight="600" fill="white">Effectiveness</text>
  <text x="563" y="325" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.45)">Health scoring + drift</text>

  <rect x="644" y="290" width="142" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="644" y="290" width="142" height="3" rx="2" fill="#DC2626"/>
  <text x="715" y="312" text-anchor="middle" font-size="10" font-weight="600" fill="white">Notification</text>
  <text x="715" y="325" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.45)">Slack / PD / Teams</text>

  <!-- Row 3: Support services -->
  <rect x="36" y="348" width="240" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="36" y="348" width="3" height="44" rx="2" fill="#64748B"/>
  <text x="54" y="370" font-size="10" font-weight="600" fill="white">DataStorage</text>
  <text x="54" y="383" font-size="8" fill="rgba(255,255,255,0.45)">PostgreSQL + Valkey</text>

  <rect x="290" y="348" width="240" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="290" y="348" width="3" height="44" rx="2" fill="#64748B"/>
  <text x="308" y="370" font-size="10" font-weight="600" fill="white">AuthWebhook</text>
  <text x="308" y="383" font-size="8" fill="rgba(255,255,255,0.45)">RAR override validation</text>

  <rect x="544" y="348" width="240" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="544" y="348" width="3" height="44" rx="2" fill="#64748B"/>
  <text x="562" y="370" font-size="10" font-weight="600" fill="white">LLM Provider</text>
  <text x="562" y="383" font-size="8" fill="rgba(255,255,255,0.45)">OpenAI / Anthropic / Vertex AI</text>
</svg>
</div>

## Session Lifecycle

Session management spans two layers:

- **KA MCP layer** (`internal/kubernautagent/mcp/`) — Owns interactive investigation state via Lease-based single-driver locking. The AF dispatches interactive tools (`kubernaut_investigate`, `kubernaut_message`, `kubernaut_complete`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect`, `kubernaut_select_workflow`, `kubernaut_discover_workflows`) to KA's MCP server.
- **AF session layer** (`pkg/apifrontend/session/`) — Manages `InvestigationSession` CRDs with **deferred creation**: the CRD is not created when the A2A session starts, but only once `kubernaut_investigate` (or `kubernaut_investigate_alert`) has created the `RemediationRequest`, at which point `ISSignaler.SignalInteractive` co-creates the IS CRD via `CreateInvestigationSession()`. (Design change #1293→#1332: the IS-creation trigger moved off the `kubernaut_remediate` / `MaterializeCRD()` path — that tool is now autonomous-only and never creates an IS.) Sessions that never produce a RemediationRequest leave no cluster footprint.

### Lease-based distributed locking

The `LeaseSessionManager` in KA uses Kubernetes coordination/v1 Leases (prefix: `kubernaut-interactive-`) for single-driver guarantee (BR-INTERACTIVE-002):

- **Acquisition** — On `action:start`, KA creates a Lease in `kubernaut-system`
- **TTL** — Default session TTL is 30 minutes; configurable via `InteractiveConfig.SessionTTL`
- **Inactivity timeout** — Sessions expire after a configurable period of no activity
- **Max sessions** — Configurable cap; rejects new sessions when capacity is exhausted (SEC-03)
- **Orphan reclamation** — On startup, KA scans for Leases whose holder identity no longer exists and reclaims them
- **Same-user reconnect** — If the same user reconnects, the existing Lease is reused

### Session takeover (SEC-TAKEOVER-001)

When User B connects to a session owned by User A:

1. User A's investigation is **abandoned** (not completed) — prevents identity confusion
2. The Lease holder is updated to User B
3. An audit event is emitted recording the takeover
4. User B starts a fresh investigation in the same session context

### Jump-In session upgrade (#1390) {: #jump-in }

When an operator calls `kubernaut_investigate` for an RR that already has a running **autonomous** investigation, the KA upgrades the session to interactive **in-place** rather than cancelling and recreating it. This preserves the LLM context accumulated during the autonomous RCA phase.

1. KA sets an `interactiveUpgrade` atomic flag on the session
2. The running investigation goroutine sees the flag at its next `InteractiveHold` check and pauses for operator input
3. KA's `UpgradeToInteractive` acquires the per-RR interactive-driver Lease and writes `AgentSession.Status.Interactive=true` (v1.6, DD-AA-KA-001) -- the AA controller and the API Frontend both watch this field rather than inferring interactivity from `InvestigationSession` existence
4. Session ID and correlation ID are preserved throughout

If the autonomous session has already completed (`ErrSessionTerminal`), the system falls back to `ForceTransitionToUserDriving` to start a fresh interactive session.

### Disconnect handling (DD-INTERACTIVE-002)

The `SessionClosedHandler` monitors MCP connection closures via the `DelegatingEventStore`. On disconnect, it triggers session release and reconstruction.

### Graceful shutdown — SessionDrainer

When a KA pod receives SIGTERM (BR-OPS-013):

1. The `SessionDrainer` notifies all connected MCP clients that the server is shutting down
2. In-flight tool executions are given time to complete
3. All active session Leases are released
4. Pod terminates only after all sessions are drained

### Session closure via AgentSession watch (v1.6, #2214)

The AF owns closing `InvestigationSession` to a terminal phase -- the AIAnalysis controller has zero IS interaction as of v1.6. A dedicated `AgentSessionTerminalCloseReconciler` (`internal/controller/apifrontend/agentsession_close.go`) watches the correlated [`AgentSession`](../api-reference/crds.md#agentsession) and closes the IS via the same `CRDSessionService.FinalizeSessionByRR` primitive the AF's own MCP complete/cancel tools use:

| `AgentSession` transition | `InvestigationSession` phase |
|---|---|
| `Status.Phase = Completed` | `Completed` |
| `Status.Phase = Failed` | `Failed` |
| Object deleted (e.g. AA's cascade-cancel on `ParentCancelled`) | `Cancelled` |

A `TerminalCloseFinalizer` on the `AgentSession` guarantees the close happens before the object is actually removed, regardless of who deletes it.

## SSE Streaming

The AF streams investigation output to clients via **Server-Sent Events**:

- Token-by-token output from LLM responses
- Keepalive pings at regular intervals to maintain the connection
- Investigation progress events (phase transitions, tool calls, results)

## Integration Points

| Target | Protocol | Purpose |
|---|---|---|
| **Kubernaut Agent** | MCP JSON-RPC + HTTP/REST | MCP tool proxying, SSE streaming |
| **AgentSession CRD** (v1.6+) | Kubernetes watch | `Status.Interactive` ack (replaces the retired `AwaitISPhaseActive` poll-loop); terminal-phase/deletion signal for closing `InvestigationSession` |
| **DataStorage** | HTTP/REST | Remediation history, audit events |
| **LLM Provider** | HTTP/REST (via KA) | Severity triage with configurable confidence threshold |
| **OIDC Provider** | OAuth2/OIDC | User authentication via JWKS |
| **Kubernetes API** | SubjectAccessReview | SAR-based tool authorization (verb `use`, group `kubernaut.ai`, resource `tools`) |

## LLM Provider (A2A Agent)

The AF runs its own LLM-backed agent for the A2A handler. The LLM config (`agent.llm` in the AF config.yaml) mirrors the KA `ai.llm` schema so operators use one config style across services.

Supported providers: `openai` (OpenAI-compatible endpoints — requires `endpoint`; operator translates to `openai_compatible` and appends `/v1`), `vertex_ai` (Claude on Vertex AI — requires `vertexProject` + `vertexLocation`), `gemini` (Gemini API direct — requires `apiKeyFile` or OAuth2), `anthropic` (Anthropic API direct — requires `apiKeyFile` or OAuth2). When `provider` is empty, the A2A handler returns HTTP 501.

**Multi-provider factory** — The AF uses a transport chain that resolves the provider at startup, wires TLS (including mTLS client certificates for corporate LLM gateways via `tlsCertFile`/`tlsKeyFile` — #1342), and applies an optional circuit breaker around all outbound LLM HTTP calls.

**File-based API key** — The `apiKeyFile` field replaces the former `LLM_API_KEY` environment variable (#1251). Mount the key as a Kubernetes Secret volume; the AF reads it at startup and trims whitespace.

**OAuth2 client credentials** — For auth-gated LLM gateways, configure `oauth2.enabled: true` with `tokenURL`, `scopes`, and a `credentialsDir` containing `client-id` and `client-secret` files. Token refresh is handled automatically.

**InstructionProvider** (#1276) — The A2A agent's system prompt is dynamically generated per-request by the `InstructionProvider`. This replaces the static `Instruction` string and injects the controller namespace, available tool names, and persona context into the LLM prompt at runtime.

**KA bearer token** — The `kaBearerTokenFile` config field provides the AF with a bearer token for authenticating to the KA MCP server (#1287). When set, the AF includes this token in the `Authorization` header of all KA MCP requests.

**Rate limiters** (#1392) — Two rate limiters protect the AF:

- **ProviderLimiter** — Rate-limits JWKS endpoint fetches. When the limit is hit, cached keys are returned instead of fetching new ones.
- **LLMSemaphore** — Bounds concurrent LLM requests. Requests exceeding capacity are rejected with `ErrLLMCapacity` (HTTP 429).

**Re-invocation loop** (#1392) — The `StreamingExecutor` re-invokes the LLM agent when a turn ends with text-only output (no tool calls), up to `MaxReinvocations`. This handles cases where the LLM produces reasoning text before deciding on a tool call.

**JWT ClaimMappings** (#1392) — CEL expressions for extracting username and groups from JWT claims (e.g., `claims.email`, `claims.roles`). Falls back to hardcoded paths (`preferred_username`/`sub`/`groups`) when expressions are empty, preserving backward compatibility.

See [AF LLM Configuration](../user-guide/configuration.md#af-llm-configuration-v15) for the full field reference.

## A2A Streaming Events

A2A streaming uses `TaskStatusUpdateEvent` messages classified by `metadata.type`:

| `metadata.type` | Purpose | `status.message` |
|---|---|---|
| `reasoning` | LLM inner thoughts / investigation deltas | Set (sanitized text) |
| `status` | Orchestration progress (tool starts, phase transitions) | Set |
| `output` | Final LLM answer | Set |
| `investigation` | Investigation-specific events from KA | Set |
| `keepalive` | Proxy idle-timeout prevention | **Not set** (metadata-only) |

**Keepalive events** are emitted every **5 seconds** during long-running KA tool executions. They carry `{"type":"keepalive", "dot":"."}` in metadata but no `status.message`, preventing them from polluting the A2A task history. Clients that only render `status.message` will not see keepalive dots (by design).

A2A integrators should inspect `metadata.type` to distinguish ephemeral events from history-worthy messages.

## Health Checks

| Probe | Endpoint | Port |
|---|---|---|
| Liveness | `GET /healthz` | **8081** (plain HTTP) |
| Readiness | `GET /readyz` | **8081** (plain HTTP) |
| Metrics | `/metrics` | **9090** (plain HTTP) |
| API | HTTPS | **8443** |
