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

The AF proxies tool calls to the Kubernaut Agent's MCP server, where the 3 interactive tools (`kubernaut_investigate`, `kubernaut_select_workflow`, `kubernaut_complete_no_action`) are registered.

### A2A JSON-RPC 2.0

```
POST /a2a/invoke
```

Agent-to-Agent protocol endpoint accepting JSON-RPC 2.0 messages. Supported methods include `message/send`. Requires Bearer JWT authentication.

The A2A agent uses **19 SAR-gated Google ADK tools** organized in four domains:

| Domain | Tools |
|---|---|
| **Remediation lifecycle** | `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_approve`, `kubernaut_cancel_remediation`, `kubernaut_watch` |
| **Investigation** | `kubernaut_start_investigation`, `kubernaut_poll_investigation`, `kubernaut_select_workflow`, `kubernaut_present_decision` |
| **Data & history** | `kubernaut_list_workflows`, `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail` |
| **Cluster context** | `af_list_events`, `af_get_pods`, `af_get_workloads`, `af_resolve_owner`, `af_check_existing_rr`, `af_create_rr` |

The `kubernaut_*` investigation tools proxy to the Kubernaut Agent (via REST or MCP). The `kubernaut_*` CRD tools operate on RemediationRequest resources via the Kubernetes API. The `af_*` cluster context tools query the Kubernetes API using the authenticated user's identity (via impersonation or [OIDC-direct mode](../architecture/security-rbac.md#oidc-direct-mode-eliminating-impersonation-v15)). The `kubernaut_*` data tools query DataStorage. The AF also uses internal orchestration tools (`kubernaut_discover_workflows`, `kubernaut_stream_investigation`) that are not SAR-gated — they are invoked by the AF's own agent loop, not exposed directly to A2A callers.

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
| **Auth** | `impersonation.created`, `jwt.delegation` |
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
