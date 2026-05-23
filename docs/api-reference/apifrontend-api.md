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

The AF runs its own MCP server with **23 `kubernaut_*` MCP tools** (see [A2A tools](#a2a-json-rpc-20) for the full list). Each tool dispatches to its backend: K8s API (CRD operations), KA REST (autonomous investigation), KA MCP (workflow selection/discovery and interactive session lifecycle), DataStorage (analytics), or local (presentation). The Kubernaut Agent runs a separate MCP server at `/api/v1/mcp` with 3 interactive-mode tools (`kubernaut_investigate`, `kubernaut_select_workflow`, `kubernaut_complete_no_action`) for direct client connections.

### A2A JSON-RPC 2.0

```
POST /a2a/invoke
```

Agent-to-Agent protocol endpoint accepting JSON-RPC 2.0 messages. Supported methods include `message/send`. Requires Bearer JWT authentication.

The A2A agent uses **23 SAR-gated `kubernaut_*` MCP tools** exposed on the MCP endpoint, organized in six domains:

| Domain | Tools | Backend |
|---|---|---|
| **CRD operations** | `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_approve`, `kubernaut_cancel_remediation`, `kubernaut_watch`, `kubernaut_list_approval_requests`, `kubernaut_get_approval_request` | K8s API (AF SA) |
| **Autonomous investigation** | `kubernaut_start_investigation`, `kubernaut_poll_investigation`, `kubernaut_stream_investigation` | KA REST |
| **Interactive session lifecycle** | `kubernaut_takeover`, `kubernaut_message`, `kubernaut_complete`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect` | KA MCP |
| **Workflow** | `kubernaut_discover_workflows`, `kubernaut_select_workflow` | KA MCP |
| **Data & history** | `kubernaut_list_workflows`, `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail` | DataStorage REST |
| **Presentation** | `kubernaut_present_decision` | Local |

!!! note "Upstream Helm gap ([#1239](https://github.com/jordigilh/kubernaut/issues/1239))"
    `kubernaut_list_approval_requests` and `kubernaut_get_approval_request` are not yet in the Helm `values.yaml` persona definitions. They belong in the `remediation-approver` persona per [#1235](https://github.com/jordigilh/kubernaut/issues/1235). The documentation reflects the intended design. See [per-persona ClusterRoles](../architecture/security-rbac.md#per-persona-clusterroles).

The `kubernaut_*` investigation tools dispatch to the Kubernaut Agent (`kubernaut_start_investigation`/`kubernaut_poll_investigation` via KA REST; `kubernaut_select_workflow`/`kubernaut_discover_workflows` via KA MCP). The `kubernaut_*` CRD tools operate on RemediationRequest and RemediationApprovalRequest resources via the Kubernetes API using the AF ServiceAccount ([unified SA model](../architecture/security-rbac.md#unified-sa-model)). The `kubernaut_*` data tools query DataStorage. `kubernaut_present_decision` is handled locally by the AF.

The AF's LLM agent also uses **5 internal tools** that are not exposed via MCP — they run inside the AF's own agent loop for cluster inspection and RR creation:

| Tool | Purpose |
|---|---|
| `kubectl_get` | Get any namespaced K8s resource by kind/name/namespace (Secret `.data` redacted) |
| `kubectl_list` | List namespaced K8s resources with optional label selector (Secret `.data` redacted) |
| `kubectl_list_events` | List K8s events with reason/object filters |
| `af_check_existing_rr` | Check for duplicate RemediationRequest before creation |
| `af_create_rr` | Create RemediationRequest CRD; triggers deferred `InvestigationSession` CRD materialization |

All internal tools use the AF ServiceAccount ([unified SA model](../architecture/security-rbac.md#unified-sa-model)) and are SAR-gated on the A2A path via the same `newRBACGuard()` as MCP tools.

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
