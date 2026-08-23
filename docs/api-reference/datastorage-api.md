# DataStorage API

The DataStorage service provides a REST API for audit events, compliance operations, and RemediationRequest reconstruction. All Kubernaut services access PostgreSQL exclusively through this API.

!!! warning "v1.6: Workflow Catalog and Action Type Taxonomy REST endpoints retired"
    Through v1.5, this page also documented a Workflow Catalog (`/api/v1/workflows*`) and Action Type Taxonomy (`/api/v1/action-types*`) REST surface. **As of v1.6** (DD-WORKFLOW-018/019), neither exists anymore — confirmed against the DataStorage route table, which has no remaining registration for either path. The `RemediationWorkflow`/`ActionType` CRDs (etcd) are the sole source of truth now: the Auth Webhook admits them directly, and Kubernaut Agent serves discovery/scoring from its own in-memory, informer-cache-backed catalog. See [Workflow Catalog Migration](../architecture/data-persistence.md#workflow-catalog-migration-v16), [Registration Model](../user-guide/workflows.md#registration-model), and [Kubernaut Agent API](kubernaut-agent-api.md) for the current architecture.

!!! note "OpenAPI Spec"
    The full OpenAPI specification is available at [`api/openapi/data-storage-v1.yaml`](https://github.com/jordigilh/kubernaut/blob/main/api/openapi/data-storage-v1.yaml) in the main repository.

!!! note "OpenAPI enum values"
    Enum values in the OpenAPI schema follow each endpoint's declared casing convention — API clients should follow each endpoint's declared enum values rather than assume a single global convention.

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
