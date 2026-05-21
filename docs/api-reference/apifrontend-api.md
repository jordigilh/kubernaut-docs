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

The AF validates tokens via JWKS from the configured OIDC provider and extracts user identity from JWT claims.

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

The AF emits audit events to DataStorage for significant operations. Audit event support was wired in PR #1191 (shared AuditStore normalization) and PR #1192 (14 production audit events).

!!! note "Audit event names are approximate"
    Exact event type names should be verified against the DataStorage OpenAPI spec (`api/datastorage/openapi/`). The categories below reflect the scope of the implementation.

Audit coverage includes: tool invocations, authorization decisions, session lifecycle events (create, reconnect, takeover, abandon, drain), and A2A task lifecycle.

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
