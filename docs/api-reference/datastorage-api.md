# DataStorage API

The DataStorage service provides a REST API for audit events, workflow catalog management, and RemediationRequest reconstruction. All Kubernaut services access PostgreSQL exclusively through this API.

!!! note "OpenAPI Spec"
    The full OpenAPI specification is available at [`api/openapi/data-storage-v1.yaml`](https://github.com/jordigilh/kubernaut/blob/main/api/openapi/data-storage-v1.yaml) in the main repository.

## Base URL

```
http://data-storage-service.kubernaut-system.svc.cluster.local:8080
```

## Endpoints

### Audit Events

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/audit/events` | Store a single audit event |
| `POST` | `/api/v1/audit/events/batch` | Store a batch of audit events |
| `GET` | `/api/v1/audit/events` | Query audit events (with filters) |
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
| `GET` | `/api/v1/remediation-history/context` | Get remediation history for a target resource (used by HolmesGPT for LLM prompt enrichment) |

### Workflow Catalog

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/workflows` | Register a workflow (called by Auth Webhook on `RemediationWorkflow` CRD admission; also supports direct registration from OCI schema image via `{"schemaImage": "<oci-ref>"}`) |
| `GET` | `/api/v1/workflows` | List workflows (filter by `status`, `environment`, `priority`, `component`, `workflow_name`) |
| `GET` | `/api/v1/workflows/{workflow_id}` | Get a specific workflow |
| `PATCH` | `/api/v1/workflows/{workflow_id}` | Update a workflow |
| `GET` | `/api/v1/workflows/actions` | List available action types (Step 1 of discovery protocol) |
| `GET` | `/api/v1/workflows/actions/{action_type}` | Get workflows by action type (Step 2 of discovery protocol) |
| `PATCH` | `/api/v1/workflows/{workflow_id}/disable` | Disable a workflow |
| `PATCH` | `/api/v1/workflows/{workflow_id}/enable` | Enable a workflow |
| `PATCH` | `/api/v1/workflows/{workflow_id}/deprecate` | Deprecate a workflow |

### Action Type Taxonomy

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/action-types` | Register an action type |
| `PATCH` | `/api/v1/action-types/{name}` | Update an action type description |
| `PATCH` | `/api/v1/action-types/{name}/disable` | Disable an action type |
| `GET` | `/api/v1/action-types/{name}/workflow-count` | Get the number of active workflows for an action type |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (checks PostgreSQL connectivity) |
| `GET` | `/health/live` | Liveness probe (always 200) |
| `GET` | `/health/ready` | Readiness probe (checks PostgreSQL connectivity + shutdown flag) |
| `GET` | `/metrics` | Prometheus metrics (`:9090/metrics`) |

## Authentication

DataStorage uses **Kubernetes TokenReview** authentication. Clients must present a valid ServiceAccount token in the `Authorization` header.

## Next Steps

- [Data Persistence](../architecture/data-persistence.md) — PostgreSQL schema details
- [HolmesGPT API](holmesgpt-api.md) — LLM integration API
- [CRD Reference](crds.md) — Custom Resource definitions
