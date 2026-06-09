# API Frontend API

!!! warning "This page is under active development for v1.5 GA"

The API Frontend (AF) is the unified external gateway introduced in v1.5. It exposes MCP Streamable HTTP and A2A JSON-RPC protocols for operators, AI agents, and the Backstage console.

## Base URL

```
https://kubernaut-apifrontend.kubernaut-system.svc.cluster.local:8443
```

External clients connect via the cluster ingress or OpenShift Route configured for the API Frontend.

## Authentication

All protocol endpoints require a valid OIDC/OAuth2 bearer token:

```
Authorization: Bearer <jwt-token>
```

The AF validates tokens via JWKS from the configured OIDC provider and extracts user identity from JWT claims. Tool invocations are authorized via **Kubernetes SubjectAccessReview** — see [Security & RBAC: Tool Authorization](../architecture/security-rbac.md#tool-authorization-v15) for the SAR model and per-persona ClusterRoles.

## Protocol Endpoints

The AF exposes two protocol endpoints that proxy to backend services:

### MCP Streamable HTTP

```
POST /mcp
```

Model Context Protocol endpoint using Streamable HTTP transport (spec 2025-03-26). Accepts JSON-RPC 2.0 requests for `initialize`, `tools/list`, `tools/call`, and other MCP methods. The `Accept` header determines the response format:

- `application/json` — synchronous JSON response
- `text/event-stream` — SSE streaming response (for long-running tool calls)

Returns `501` when MCP is disabled in the AF configuration.

**Example — list available tools:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

**Example — invoke a tool:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "kubernaut_investigate",
    "arguments": {
      "rr_id": "rr-b83e19d4a7f1-5c2d09ae",
      "action": "start"
    }
  }
}
```

The AF runs its own MCP server with **21 `kubernaut_*` MCP tools** exposed on the MCP bridge (see [MCP Tool Reference](mcp-tools.md) for the full list). Each tool dispatches to its backend: K8s API (CRD operations), KA MCP (workflow selection/discovery and interactive session lifecycle), DataStorage (analytics), or local (presentation). Five additional internal tools (`kubectl_get`, `kubectl_list`, `kubectl_list_events`, `kubernaut_check_existing_remediation`, `kubernaut_remediate`) are used only inside the A2A agent loop and are not exposed on the MCP bridge.

### A2A JSON-RPC 2.0

```
POST /a2a/invoke
POST /                  # root alias — same handler
```

Agent-to-Agent protocol endpoint accepting JSON-RPC 2.0 messages. Supported methods include `message/send`. Requires Bearer JWT authentication. `POST /` is an alias for `POST /a2a/invoke`, providing A2A spec conformance for clients that expect the root path.

The A2A agent uses **21 SAR-gated `kubernaut_*` MCP tools** exposed on the MCP bridge, plus 5 internal tools, organized in six domains:

| Domain | Tools | Backend |
|---|---|---|
| **CRD operations** | `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_approve`, `kubernaut_cancel_remediation`, `kubernaut_watch`, `kubernaut_list_approval_requests`, `kubernaut_get_approval_request`, `kubernaut_await_session` | K8s API (AF SA) |
| **Investigation & session lifecycle** | `kubernaut_investigate`, `kubernaut_message`, `kubernaut_complete`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect` | KA MCP |
| **Workflow** | `kubernaut_discover_workflows`, `kubernaut_select_workflow` | KA MCP |
| **Data & history** | `kubernaut_list_workflows`, `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail` | DataStorage REST |
| **Presentation** | `kubernaut_present_decision` | Local |

!!! note "Upstream Helm gap ([#1239](https://github.com/jordigilh/kubernaut/issues/1239))"
    `kubernaut_list_approval_requests` and `kubernaut_get_approval_request` are not yet in the Helm `values.yaml` persona definitions. They belong in the `remediation-approver` persona per [#1235](https://github.com/jordigilh/kubernaut/issues/1235). The documentation reflects the intended design. See [per-persona ClusterRoles](../architecture/security-rbac.md#per-persona-clusterroles).

`kubernaut_investigate` dispatches to the Kubernaut Agent's MCP server (maps to KA's `kubernaut_investigate` with `action=start`). The AF decomposes the remaining KA actions (`message`, `complete`, `cancel`, `status`, `reconnect`, `discover_workflows`) into individual MCP tools. CRD tools operate on RemediationRequest and RemediationApprovalRequest resources via the Kubernetes API using the AF ServiceAccount ([unified SA model](../architecture/security-rbac.md#unified-sa-model)). Data tools query DataStorage. `kubernaut_present_decision` is handled locally by the AF.

The AF's A2A agent also uses **5 internal tools** that are SAR-gated but not exposed on the MCP bridge:

| Tool | Purpose |
|---|---|
| `kubectl_get` | Get any namespaced K8s resource by kind/name/namespace (Secret `.data` redacted) |
| `kubectl_list` | List namespaced K8s resources with optional label selector (Secret `.data` redacted) |
| `kubectl_list_events` | List K8s events with reason/object filters |
| `kubernaut_check_existing_remediation` | Check for duplicate RemediationRequest before creation |
| `kubernaut_remediate` | Create a new RemediationRequest CRD |

All internal tools use the AF ServiceAccount ([unified SA model](../architecture/security-rbac.md#unified-sa-model)) and are SAR-gated on the A2A path via `newRBACGuard()`.

### Agent Card Discovery

```
GET /.well-known/agent-card.json
```

Returns the A2A agent card for protocol discovery. Unauthenticated callers receive a shell card (metadata only, empty skills array). Authenticated callers receive the full card including available skills scoped to their RBAC role.

## Operational Endpoints

### Health Probes

| Method | Port | Path | Description |
|---|---|---|---|
| `GET` | 8081 | `/healthz` | Liveness — returns `ok` when the process is alive |
| `GET` | 8081 | `/readyz` | Readiness — checks JWKS loaded and dependencies reachable; returns `503` during drain |
| `GET` | 9090 | `/metrics` | Prometheus metrics in OpenMetrics format |

### Metrics

All AF metrics use the `af_` namespace. See [Monitoring: API Frontend Metrics](../operations/monitoring.md#api-frontend-metrics-v15) for the full reference.

## Audit Events

The AF emits **14 audit events** to DataStorage (PR #1191 shared AuditStore normalization, PR #1192 production wiring). All events use the `apifrontend.*` prefix.

| Category | Events |
|---|---|
| **Remediation** | `rr.created`, `rr.deduplicated` |
| **KA delegation** | `ka.delegated`, `ka.result_received` |
| **User decisions** | `user.decision` |
| **Severity triage** | `severity_triage.completed`, `severity_triage.failed` |
| **Session lifecycle** | `session.completed` (includes `duration_ms`) |
| **Auth** | `jwt.delegation` |
| **MCP** | `mcp.session_init` (deduplicated per `Mcp-Session-Id`) |
| **Resilience** | `circuitbreaker.trip` |
| **Triage** | `triage.started`, `triage.completed` |

See [Audit Pipeline: Emitting Services](../architecture/audit-pipeline.md#emitting-services) for the full cross-service audit reference.

## Error Responses

All error responses use [RFC 7807 Problem Details](index.md#error-responses-rfc-7807) format with `Content-Type: application/problem+json`.

**Example** (service not ready):

```json
{
  "type": "https://kubernaut.ai/problems/service-unavailable",
  "title": "Service Unavailable",
  "detail": "Service is draining — not accepting new requests",
  "status": 503
}
```

## Next Steps

- [API Frontend Architecture](../architecture/apifrontend.md) — Design and session lifecycle
- [Interactive Sessions](../user-guide/interactive-sessions.md) — Operator guide for MCP sessions
- [Security & RBAC: Tool Authorization](../architecture/security-rbac.md#tool-authorization-v15) — RBAC model for tool access
