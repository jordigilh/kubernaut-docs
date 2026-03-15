# HolmesGPT API

HolmesGPT is a **Python FastAPI** service that wraps LLM calls with live Kubernetes access for root cause analysis. The AI Analysis controller communicates with it using a **session-based asynchronous** pattern.

!!! note "OpenAPI Spec"
    The full OpenAPI 3.1.0 specification is available at [`holmesgpt-api/api/openapi.json`](https://github.com/jordigilh/kubernaut/blob/main/holmesgpt-api/api/openapi.json) in the main repository. The Go client (`pkg/holmesgpt/client/`) uses the generated ogen client for all endpoints, including session management (DD-HAPI-003).

## Base URL

```
http://holmesgpt-api.kubernaut-system.svc.cluster.local:8080
```

Internal services use the short form `http://holmesgpt-api:8080` when communicating within the same namespace.

## Session-Based Async Pattern

The API uses a submit-poll-result pattern to handle long-running LLM investigations:

```mermaid
sequenceDiagram
    participant Client as AI Analysis Controller
    participant HAPI as HolmesGPT API
    participant LLM as LLM Provider

    Client->>HAPI: POST /api/v1/incident/analyze
    HAPI-->>Client: 202 {session_id}

    HAPI->>LLM: Run investigation
    Note over HAPI,LLM: kubectl access, log analysis

    Client->>HAPI: GET /api/v1/incident/session/{id}
    HAPI-->>Client: {status: "investigating"}

    LLM-->>HAPI: Analysis complete

    Client->>HAPI: GET /api/v1/incident/session/{id}
    HAPI-->>Client: {status: "completed"}

    Client->>HAPI: GET /api/v1/incident/session/{id}/result
    HAPI-->>Client: IncidentResponse
```

## Endpoints

### Incident Analysis

#### Submit Investigation

```
POST /api/v1/incident/analyze
```

Starts an asynchronous investigation session.

**Request**: `IncidentRequest` — enriched signal data, target resource, analysis parameters

**Response**: `202 Accepted`

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Poll Session Status

```
GET /api/v1/incident/session/{session_id}
```

Returns the current status of an investigation session.

**Response**: `200 OK`

```json
{
  "status": "investigating",
  "progress": "Analyzing pod logs..."
}
```

Session statuses: `pending`, `investigating`, `completed`, `failed`

**Response**: `404 Not Found` — Session does not exist (e.g., after pod restart). The AI Analysis controller handles this by regenerating the session (up to 5 attempts per BR-AA-HAPI-064.5/064.6).

#### Get Session Result

```
GET /api/v1/incident/session/{session_id}/result
```

Returns the analysis result when the session is complete.

**Response**: `200 OK` — `IncidentResponse` with RCA, selected workflow, confidence score, and `actionable` flag

Key response fields:

| Field | Type | Description |
|---|---|---|
| `root_cause` | string | Natural language root cause explanation |
| `confidence` | float | Investigation confidence (0.0--1.0) |
| `investigation_outcome` | string | Outcome classification (e.g., `resolved`, `workflow_selected`) |
| `selected_workflow` | object | Workflow recommendation (name, action type, parameters) |
| `actionable` | boolean | Whether the investigation identified a concrete remediation action |
| `affected_resource` | object | Target resource (kind, name, namespace) after owner chain resolution |
| `detected_labels` | object | Infrastructure labels detected during investigation |

**Response**: `409 Conflict` — Session not yet complete

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe (includes LLM connectivity) |
| `GET` | `/config` | Configuration snapshot (dev mode only) |
| `GET` | `/metrics` | Prometheus metrics |

## Error Responses

All error responses (4xx, 5xx) use [RFC 7807 Problem Details](index.md#error-responses-rfc-7807) format with `Content-Type: application/problem+json`. See the [error type catalog](index.md#error-type-catalog) for the full list of error types.

**Example** (session not ready):

```json
{
  "type": "https://kubernaut.ai/problems/conflict",
  "title": "Conflict",
  "detail": "Session is still investigating, result not yet available",
  "status": 409
}
```

## Session Management

- Sessions are stored **in-memory** in the HolmesGPT API pod
- If the pod restarts, sessions are lost — the AI Analysis controller handles this by regenerating sessions (up to 5 attempts)
- Session results are available until the pod restarts or the session is garbage-collected

## LLM Providers

HolmesGPT uses **LiteLLM** under the hood, supporting any compatible provider:

| Provider | Configuration |
|---|---|
| OpenAI | `provider: openai`, `model: gpt-4o` |
| Vertex AI | `provider: vertex_ai`, `model: gemini-2.5-pro`, `gcpProjectId`, `gcpRegion` |
| Azure OpenAI | `provider: azure`, `model: gpt-4o`, `endpoint` |
| Any LiteLLM provider | See [LiteLLM documentation](https://docs.litellm.ai/docs/providers) |

## Next Steps

- [AI Analysis Architecture](../architecture/ai-analysis.md) — How the controller uses this API
- [DataStorage API](datastorage-api.md) — Audit and workflow APIs
- [Configuration Reference](../user-guide/configuration.md) — LLM provider settings
