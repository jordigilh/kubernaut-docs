# DataStorage API

The DataStorage service provides a REST API for audit events, workflow catalog management, and RemediationRequest reconstruction. All Kubernaut services access PostgreSQL exclusively through this API.

!!! note "OpenAPI Spec"
    The full OpenAPI specification is available at [`api/openapi/data-storage-v1.yaml`](https://github.com/jordigilh/kubernaut/blob/main/api/openapi/data-storage-v1.yaml) in the main repository.

!!! note "OpenAPI enum values"
    Catalog status enums align with the CRD typed-enum convention and use **PascalCase** (for example, `active` → `Active`, `deprecated` → `Deprecated`). Other fields (such as severity filters) may remain lowercase depending on the schema. API clients should follow each endpoint's declared enum values.

!!! note "Deterministic catalog IDs"
    Workflow catalog IDs (`workflowId`) are **deterministic UUIDs** (UUIDv5) and remain stable across PVC wipes for unchanged workflow specifications. Action types are keyed by their `actionType` identifier string.

## Base URL

```
https://data-storage-service.kubernaut-system.svc.cluster.local:8080
```

## Endpoints

### Audit Events

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/audit/events` | Store a single audit event |
| `POST` | `/api/v1/audit/events/batch` | Store a batch of audit events |
| `GET` | `/api/v1/audit/events` | Query audit events (with filters, including JSONB `detail_key`/`detail_value` for correlation — PR #1201) |
| `POST` | `/api/v1/audit/notifications` | Store a notification audit event |

### Remediation Reconstruction

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/audit/remediation-requests/{correlation_id}/reconstruct` | Reconstruct a RemediationRequest from audit events |

### Audit Compliance

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/audit/verify-chain` | Verify audit event chain integrity |
| `POST` | `/api/v1/audit/legal-hold` | Place a legal hold on audit events for a correlation ID |
| `DELETE` | `/api/v1/audit/legal-hold/{correlation_id}` | Release a legal hold |
| `GET` | `/api/v1/audit/legal-hold` | List active legal holds |
| `GET` | `/api/v1/audit/export` | Export audit events (for compliance) |

### Effectiveness & Remediation History

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/effectiveness/{correlation_id}` | Get effectiveness score for a remediation |
| `GET` | `/api/v1/remediation-history/context` | Get remediation history for a target resource (called internally by Kubernaut Agent resource-context tools during investigation; not LLM-callable directly) |

### Workflow Catalog

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/workflows` | Register a workflow (called by Auth Webhook on `RemediationWorkflow` CRD admission) |
| `GET` | `/api/v1/workflows` | List workflows (filter by `status`, `environment`, `priority`, `component`, `workflow_name`) |
| `GET` | `/api/v1/workflows/{workflow_id}` | Get a specific workflow |
| `PATCH` | `/api/v1/workflows/{workflow_id}` | Update a workflow |
| `GET` | `/api/v1/workflows/actions` | List available action types (Step 1 of discovery protocol) |
| `GET` | `/api/v1/workflows/actions/{action_type}` | Get workflows by action type (Step 2 of discovery protocol) |
| `PATCH` | `/api/v1/workflows/{workflow_id}/disable` | Disable a workflow |
| `PATCH` | `/api/v1/workflows/{workflow_id}/enable` | Enable a workflow |
| `PATCH` | `/api/v1/workflows/{workflow_id}/deprecate` | Deprecate a workflow |

#### Workflow registration: content integrity and idempotency

`POST /api/v1/workflows` (Auth Webhook on `RemediationWorkflow` admission) is **idempotent** when the same `(name, version)` is submitted with the **same content hash** — the API returns **200 OK** and does not create duplicate rows.

If the client registers a workflow with the same `(name, version)` but a **different** content hash, the request **conflicts** with the existing row: the API returns **HTTP 409 Conflict** with an [RFC 7807](https://www.rfc-editor.org/rfc/rfc9457) problem body:

| Field | Value |
|-------|--------|
| `type` | `content-integrity-violation` |
| `title` | `Content Changed Without Version Bump` |

Bump the workflow **version** (or reconcile with the stored definition) so catalog identity matches the new content.

### Action Type Taxonomy

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/action-types` | Register an action type |
| `PATCH` | `/api/v1/action-types/{name}` | Update an action type description |
| `PATCH` | `/api/v1/action-types/{name}/disable` | Disable an action type |
| `GET` | `/api/v1/action-types/{name}/workflow-count` | Get the number of active workflows for an action type |

### Health and metrics (v1.3+)

Operational endpoints are **not** on the API port: **liveness and readiness** are on **port 8081** (plain HTTP) at `GET /healthz` and `GET /readyz` respectively. **Prometheus** metrics are on **port 9090** at `GET /metrics` (plain HTTP). The REST API on **8080** uses **HTTPS** when inter-service TLS is configured (`tls.interService.certDir`).

| Port | Path | Description |
|------|------|-------------|
| 8081 | `GET /healthz` | Liveness |
| 8081 | `GET /readyz` | Readiness (PostgreSQL connectivity + shutdown) |
| 9090 | `GET /metrics` | Prometheus exposition |

## Error Responses

All error responses (4xx, 5xx) use [RFC 7807 Problem Details](index.md#error-responses-rfc-7807) format with `Content-Type: application/problem+json`. See the [error type catalog](index.md#error-type-catalog) for the full list of error types.

**Example** (invalid batch request):

```json
{
  "type": "https://kubernaut.ai/problems/validation-error",
  "title": "Bad Request",
  "detail": "Batch must contain between 1 and 1000 events",
  "status": 400
}
```

## Authentication

DataStorage uses **Kubernetes TokenReview** authentication. Clients must present a valid ServiceAccount token in the `Authorization` header.

## Next Steps

- [Data Persistence](../architecture/data-persistence.md) — PostgreSQL schema details
- [Kubernaut Agent](kubernaut-agent-api.md) — LLM integration API
- [CRD Reference](crds.md) — Custom Resource definitions
