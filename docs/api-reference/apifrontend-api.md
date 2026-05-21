# API Frontend API

!!! warning "This page is under active development for v1.5 GA"

The API Frontend (AF) is the unified external gateway introduced in v1.5. It exposes MCP, A2A, and REST protocols for operators, AI agents, and the Backstage console.

## Base URL

```
https://kubernaut-apifrontend.kubernaut-system.svc.cluster.local:8443
```

External clients connect via the cluster ingress or OpenShift Route configured for the API Frontend.

## Authentication

All requests require a valid OIDC/OAuth2 bearer token:

```
Authorization: Bearer <jwt-token>
```

The AF validates tokens via the configured OIDC provider (DEX, Keycloak) and extracts user identity from JWT claims.

## Authorization

Every MCP tool call is authorized via Kubernetes **SubjectAccessReview (SAR)**:

- **Resource**: `tools/<tool-name>`
- **API Group**: `kubernaut.ai`
- **Verb**: `use`

Authorization is **fail-closed** — if the SAR API is unreachable, the tool call is denied. Results are cached with a configurable TTL (default 30s).

See [Security & RBAC: Tool Authorization](../architecture/security-rbac.md#tool-authorization-v15) for ClusterRole definitions and binding examples.

## MCP Endpoints

### Tool Invocation

```
POST /mcp/tools/{tool_name}
```

Invokes an MCP tool. The AF performs SAR authorization, then proxies the call to the appropriate backend service (Kubernaut Agent or DataStorage).

**Request**: Tool-specific JSON payload

**Response**: `200 OK` — Tool result

```json
{
  "result": { ... },
  "metadata": {
    "tool": "kubernaut_investigate",
    "duration_ms": 1250
  }
}
```

### Tool Discovery

```
GET /mcp/tools
```

Returns the list of available MCP tools with their schemas. Filtered by the caller's SAR permissions — only tools the user is authorized to invoke are returned.

**Response**: `200 OK`

```json
{
  "tools": [
    {
      "name": "kubernaut_investigate",
      "description": "Start, reconnect to, check status of, or complete an investigation",
      "input_schema": { ... }
    }
  ]
}
```

## SSE Streaming

### Subscribe to Investigation Stream

```
GET /mcp/stream/{session_id}
```

Opens a Server-Sent Events connection for real-time investigation output.

**Event types**:

| Event | Data | Description |
|---|---|---|
| `token` | `{"text": "..."}` | LLM output token |
| `tool_call` | `{"tool": "...", "args": {...}}` | Tool invocation by the LLM |
| `tool_result` | `{"tool": "...", "result": {...}}` | Tool result returned to the LLM |
| `phase` | `{"phase": "rca_complete"}` | Investigation phase transition |
| `keepalive` | `{}` | Connection keepalive ping |
| `error` | `{"message": "..."}` | Stream error |
| `done` | `{"session_id": "..."}` | Investigation complete |

**Example SSE stream**:

```
event: token
data: {"text": "Checking pod logs for "}

event: token
data: {"text": "checkout-service..."}

event: tool_call
data: {"tool": "kubectl_logs", "args": {"pod": "checkout-service-7b4d9", "namespace": "production"}}

event: tool_result
data: {"tool": "kubectl_logs", "result": {"truncated": true, "lines": 50}}

event: phase
data: {"phase": "rca_complete"}

event: done
data: {"session_id": "sess-a1b2c3d4"}
```

## A2A Endpoints

### Agent Card Discovery

```
GET /.well-known/agent-card.json
```

Returns the A2A agent card for protocol discovery.

### Task Submission

```
POST /a2a/tasks
```

Submits an A2A task. The AF creates an `InvestigationSession` CRD linking the A2A task ID to remediation context.

## Session Management

### List Active Sessions

```
GET /api/v1/sessions
```

Returns active MCP/A2A sessions for the authenticated user.

### Get Session

```
GET /api/v1/sessions/{session_id}
```

Returns session details including state, user, and linked investigation.

## Audit Events

The AF emits audit events to DataStorage for all significant operations:

| Event Type | Trigger |
|---|---|
| `af.tool.invoked` | MCP tool call executed |
| `af.tool.denied` | SAR denied a tool call |
| `af.session.created` | New interactive session started |
| `af.session.reconnected` | User reconnected to existing session |
| `af.session.takeover` | Session taken over by different user (SEC-TAKEOVER-001) |
| `af.session.abandoned` | Session abandoned due to takeover or timeout |
| `af.session.completed` | Session completed normally |
| `af.session.drained` | Session drained during pod shutdown |
| `af.a2a.task.created` | A2A task submitted |

## Health and Metrics

| Method | Port | Path | Description |
|---|---|---|---|
| `GET` | 8081 | `/healthz` | Liveness |
| `GET` | 8081 | `/readyz` | Readiness (checks OIDC provider, KA connectivity) |
| `GET` | 9090 | `/metrics` | Prometheus metrics |
| HTTPS | 8443 | `/mcp/*`, `/a2a/*`, `/api/*` | Primary API |

See [Monitoring: API Frontend Metrics](../operations/monitoring.md#api-frontend-metrics-v15) for the full metrics reference.

## Error Responses

All error responses use [RFC 7807 Problem Details](index.md#error-responses-rfc-7807) format.

**Example** (SAR denied):

```json
{
  "type": "https://kubernaut.ai/problems/forbidden",
  "title": "Forbidden",
  "detail": "User 'developer@example.com' is not authorized to invoke tool 'kubernaut_investigate'",
  "status": 403,
  "instance": "/mcp/tools/kubernaut_investigate"
}
```

## Next Steps

- [API Frontend Architecture](../architecture/apifrontend.md) — Design and session lifecycle
- [Interactive Sessions](../user-guide/interactive-sessions.md) — Operator guide for MCP sessions
- [Security & RBAC: Tool Authorization](../architecture/security-rbac.md#tool-authorization-v15) — SAR model and ClusterRoles
