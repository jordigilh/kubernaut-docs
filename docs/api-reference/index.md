# API Reference

- **[Custom Resources (CRDs)](crds.md)** — Spec, status, and phase definitions for all 9 CRD types
- **[DataStorage API](datastorage-api.md)** — REST API for audit events, workflow catalog, and reconstruction
- **[HolmesGPT API](holmesgpt-api.md)** — Session-based async API for LLM-powered root cause analysis

## Error Responses (RFC 7807)

All Kubernaut HTTP APIs return errors in [RFC 7807 Problem Details](https://datatracker.ietf.org/doc/html/rfc7807) format. This applies to the Gateway signal ingestion endpoint, the DataStorage REST API, and the HolmesGPT API.

**Content-Type**: `application/problem+json`

**Structure**:

```json
{
  "type": "https://kubernaut.ai/problems/validation-error",
  "title": "Bad Request",
  "detail": "Missing required field: alertname",
  "status": 400,
  "instance": "/api/v1/signals/prometheus",
  "request_id": "req-abc123"
}
```

| Field | Required | Description |
|---|---|---|
| `type` | Yes | URI identifying the problem type (`https://kubernaut.ai/problems/{error-type}`) |
| `title` | Yes | Short, human-readable summary (e.g., "Bad Request") |
| `detail` | Yes | Human-readable explanation of the specific error |
| `status` | Yes | HTTP status code |
| `instance` | Yes | URI of the request that caused the error |
| `request_id` | No | Request ID for distributed tracing (Gateway and DataStorage) |

### Error Type Catalog

| HTTP Status | Error Type URI | Title |
|---|---|---|
| `400` | `https://kubernaut.ai/problems/validation-error` | Bad Request |
| `405` | `https://kubernaut.ai/problems/method-not-allowed` | Method Not Allowed |
| `415` | `https://kubernaut.ai/problems/unsupported-media-type` | Unsupported Media Type |
| `429` | `https://kubernaut.ai/problems/too-many-requests` | Too Many Requests |
| `500` | `https://kubernaut.ai/problems/internal-error` | Internal Server Error |
| `503` | `https://kubernaut.ai/problems/service-unavailable` | Service Unavailable |

### Client Integration

Clients can distinguish between success and error responses by checking the `Content-Type` header:

- `application/json` — success (2xx)
- `application/problem+json` — error (4xx/5xx)

Standard RFC 7807 client libraries (available for Go, Python, Java, and most languages) can parse these responses directly.

!!! info "Design Decision"
    RFC 7807 was adopted as the mandatory error format across all services per [DD-004](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-004-RFC7807-ERROR-RESPONSES.md).
