# DataStorage API

The DataStorage service provides a REST API for audit events, workflow catalog management, and RemediationRequest reconstruction. All Kubernaut services access PostgreSQL exclusively through this API.

!!! note "OpenAPI Spec"
    The full OpenAPI specification is available at [`api/openapi/data-storage-v1.yaml`](https://github.com/jordigilh/kubernaut/blob/main/api/openapi/data-storage-v1.yaml) in the main repository.

## Base URL

```
http://datastorage.kubernaut-system.svc:8080
```

## Endpoints

### Audit Events

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/audit/events/batch` | Store a batch of audit events |
| `GET` | `/api/v1/audit/events` | Query audit events (with filters) |

### Remediation Reconstruction

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/audit/remediation-requests/{correlation_id}/reconstruct` | Reconstruct a RemediationRequest from audit events |

### Workflow Catalog

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/workflows` | Register a workflow from OCI schema image (`{"schemaImage": "<oci-ref>"}`) |
| `GET` | `/api/v1/workflows` | List workflow schemas |
| `GET` | `/api/v1/workflows/{name}` | Get a specific workflow |
| `GET` | `/api/v1/workflows/search` | Search workflows by labels |

### Action History

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/action-histories` | Store action history record |
| `GET` | `/api/v1/action-histories` | Query action histories |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe |
| `GET` | `/metrics` | Prometheus metrics |

## Authentication

DataStorage uses **Kubernetes TokenReview** authentication. Clients must present a valid ServiceAccount token in the `Authorization` header.

## Next Steps

- [Data Persistence](../architecture/data-persistence.md) — PostgreSQL schema details
- [HolmesGPT API](holmesgpt-api.md) — LLM integration API
- [CRD Reference](crds.md) — Custom Resource definitions
