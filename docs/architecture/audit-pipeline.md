# Audit Pipeline

!!! info "Operator guide"
    For retention policies, observability metrics, and event correlation, see [Audit & Observability](../user-guide/audit-and-observability.md).

Kubernaut's audit pipeline provides a complete record of every action taken during remediation -- from signal ingestion to effectiveness assessment, including human approval decisions. Every service includes a buffered audit store that batches events and sends them to DataStorage for persistent storage.

## Architecture

```mermaid
graph LR
    subgraph Service["Each Kubernaut Service"]
        H[Handler / Reconciler] -->|StoreAudit| B[Buffered Store]
        B -->|batch POST| DS
    end

    DS[DataStorage<br/>REST API] --> PG[(PostgreSQL<br/>audit_events)]
    DS -.->|"single-event paths only"| RD[(Valkey<br/>DLQ)]
```

### Design Principles

- **Fire-and-forget** -- Audit failures never block remediation (DD-AUDIT-002)
- **Buffered batching** -- Events are queued in-memory and sent in configurable batches
- **Graceful shutdown** -- Buffers flush on pod termination (DD-007, ADR-032)
- **Per-service isolation** -- Each service has its own audit client with service-specific event types
- **Hash chain integrity** -- Events are chained via `SHA256(previous_hash + event_json)` for tamper detection

## Buffered Audit Store

Every Go service instantiates a `BufferedAuditStore` from `pkg/audit/store.go`:

### Interface

| Method | Behavior |
|---|---|
| `StoreAudit(ctx, event)` | Non-blocking enqueue. If the buffer is full, the event is **dropped** (not blocking) |
| `Flush(ctx)` | Blocks until all buffered events are written |
| `Close()` | Flushes remaining events and stops the background worker |

### Flush Triggers

Events are flushed in four scenarios:

1. **Batch full** -- When the in-memory batch reaches `BatchSize`, it is sent immediately
2. **Timer** -- Every `FlushInterval`, the current batch is sent regardless of size
3. **Explicit flush** -- `Flush()` drains the buffer and sends all remaining events
4. **Shutdown** -- `Close()` performs a final flush before stopping

### Retry Logic

- **Max retries**: 3 per batch (3 total attempts, 2 backoff waits)
- **Backoff**: 1s, 4s (quadratic: `n²` seconds). A third backoff (9s) would only occur if `MaxRetries` is increased beyond 3.
- **4xx errors**: No retry (permanent failure)
- **5xx / network errors**: Retry with backoff

### Configuration

| Parameter | Default | Recommendation |
|---|---|---|
| `BufferSize` | 10,000 | 10k--50k (DD-AUDIT-004) |
| `BatchSize` | 1,000 (library default; Gateway chart overrides to 100) | 100–1,000 |
| `FlushInterval` | 1 second | 1s |
| `MaxRetries` | 3 | 3 |

### Observability

The buffered store exposes one registered Prometheus metric:

| Metric | Type | Labels | Description |
|---|---|---|---|
| `audit_events_dropped_total` | CounterVec | `service` | Events dropped due to full buffer |

Additionally, internal atomic counters (`buffered_count`, `written_count`, `failed_batch_count`) are tracked for debug logging but are **not** registered as Prometheus metrics.

## Event Flow

1. A handler or reconciler calls `auditStore.StoreAudit(ctx, event)` with a structured `AuditEvent`
2. The buffered store enqueues the event into an in-memory channel (non-blocking)
3. A background goroutine batches events and sends them via `POST /api/v1/audit/events/batch` to DataStorage
4. DataStorage validates, converts, and inserts the batch into the `audit_events` PostgreSQL table within a transaction
5. On PostgreSQL failure, the batch endpoint returns HTTP 500 — the caller's retry logic handles re-delivery. The batch handler does **not** use the Valkey DLQ (this is a known gap; see GAP-10 in the DataStorage source).
6. On shutdown, `auditStore.Close()` flushes remaining events

## Event Structure

Every audit event includes:

| Field | Type | Description |
|---|---|---|
| `event_id` | `UUID` | Unique identifier (auto-generated) |
| `event_version` | `string` | Schema version (default: `1.0`) |
| `event_timestamp` | `timestamptz` | When the event occurred |
| `event_type` | `string` | Hierarchical type (e.g., `gateway.signal.received`) |
| `event_category` | `string` | Category (e.g., `signal`, `remediation`) |
| `event_action` | `string` | Action (e.g., `received`, `completed`) |
| `event_outcome` | `string` | `success`, `failure`, `pending` |
| `actor_type` | `string` | `service` or `human` |
| `actor_id` | `string` | Service name or operator identity |
| `resource_type` | `string` | Target resource type |
| `resource_id` | `string` | Target resource identifier |
| `correlation_id` | `string` | Links all events for one remediation |
| `namespace` | `string` | Kubernetes namespace |
| `event_data` | `JSONB` | Service-specific payload |
| `event_hash` | `string` | SHA256 hash chain for integrity |
| `previous_event_hash` | `string` | Previous event's hash |
| `retention_days` | `int` | Default: 2555 (7 years) |
| `is_sensitive` | `bool` | PII flag |

### Hash Chain (Tamper Detection)

Events form a hash chain for integrity verification:

```
event_hash = SHA256(previous_event_hash + canonical_event_json)
```

Fields excluded from the hash: `event_hash`, `previous_event_hash`, `event_date`, `legal_hold` fields. This enables after-the-fact detection of any audit event modification.

## Correlation

All audit events for a single remediation share a `correlation_id` set to the `RemediationRequest` name (DD-AUDIT-CORRELATION-002). This enables:

- **Timeline reconstruction** -- Query all events for one remediation in chronological order
- **CRD reconstruction** -- Rebuild the full RemediationRequest from audit data (see [Data Persistence: Reconstruction](data-persistence.md#remediationrequest-reconstruction))
- **Cross-service tracing** -- Follow a remediation across all services

## Emitting Services

All 11 Go services (`cmd/*/main.go`: Gateway, Signal Processing, AI Analysis, Remediation Orchestrator, Workflow Execution, Effectiveness Monitor, Notification, Auth Webhook, DataStorage, Kubernaut Agent, API Frontend) emit audit events:

| Service | Event Prefix | Key Events |
|---|---|---|
| **Gateway** | `gateway.*` | `signal.received`, `signal.deduplicated`, `crd.created`, `crd.failed` |
| **Signal Processing** | `signalprocessing.*` | `enrichment.completed`, `classification.completed`, `phase.transition` |
| **AI Analysis** | `aianalysis.*` | `investigation.submitted`, `analysis.completed`, `rego.evaluation`, `approval.decision` |
| **Kubernaut Agent** | `aiagent.*` | `enrichment.completed`, `enrichment.failed` |
| **Remediation Orchestrator** | `orchestrator.*` | `lifecycle.created`, `phase.transition`, `child.created`, `timeout` |
| **Workflow Execution** | `workflowexecution.*` | `selection.completed`, `execution.started`, `execution.completed`, `block.cleared` |
| **Notification** | `notification.*` | `message.sent`, `message.failed`, `message.acknowledged`, `message.escalated` |
| **Effectiveness Monitor** | `effectiveness.*` | `health.assessed`, `hash.computed`, `alert.assessed`, `metrics.assessed`, `assessment.completed` |
| **Auth Webhook** | `webhook.*`, `remediationworkflow.*`, `actiontype.*` | `remediationapprovalrequest.decided`, `remediationrequest.timeout_modified`, `notification.cancelled`, `remediationworkflow.admitted.create`, `remediationworkflow.admitted.delete`, `remediationworkflow.admitted.denied`, `actiontype.admitted.create`, `actiontype.admitted.update`, `actiontype.admitted.delete`, `actiontype.denied.create`, `actiontype.denied.update`, `actiontype.denied.delete` |
| **DataStorage** | `datastorage.*`, `workflow.catalog.*` | `workflow.created`, `workflow.updated`, `actiontype.created`, `actiontype.updated`, `actiontype.disabled`, `actiontype.reenabled`, `actiontype.disable_denied`, `workflow.catalog.actions_listed`, `workflow.catalog.workflows_listed`, `workflow.catalog.workflow_retrieved`, `workflow.catalog.selection_validated` |
| **API Frontend** | `apifrontend.*` | `rr.created`, `rr.deduplicated`, `ka.delegated`, `ka.result_received`, `user.decision`, `severity_triage.completed`, `severity_triage.failed`, `session.completed`, `impersonation.created`, `jwt.delegation`, `mcp.session_init`, `circuitbreaker.trip`, `triage.started`, `triage.completed` |

## Operator Attribution

The **admission webhook** captures human identity for all operator-driven actions:

| Action | Event Type | What's Recorded |
|---|---|---|
| Approve/reject remediation | `webhook.remediationapprovalrequest.decided` | Actor identity, decision, reason |
| Clear execution block | `workflowexecution.block.cleared` | Actor identity, execution ref |
| Modify timeout | `webhook.remediationrequest.timeout_modified` | Actor identity, old/new values |
| Cancel notification | `webhook.notification.cancelled` | Actor identity, notification ref |
| Register workflow (CRD CREATE) | `remediationworkflow.admitted.create` | Actor identity, workflow name, version |
| Delete workflow (CRD DELETE) | `remediationworkflow.admitted.delete` | Actor identity, workflow name |
| Register action type (CRD CREATE) | `actiontype.admitted.create` | Actor identity, action type name |
| Update action type (CRD UPDATE) | `actiontype.admitted.update` | Actor identity, action type, changed fields |
| Delete action type (CRD DELETE) | `actiontype.admitted.delete` | Actor identity, action type name |

This ensures every human action has a recorded identity, timestamp, and context -- critical for SOC2 Type II readiness.

## Dead Letter Queue

DataStorage uses Valkey streams as a dead letter queue for **single-event write paths** (e.g., notification audit events). The **batch endpoint** (`POST /api/v1/audit/events/batch`) does **not** use the DLQ — it returns HTTP 500 on PostgreSQL failure and relies on the caller's retry logic (see GAP-10 in the source).

| Stream | Purpose |
|---|---|
| `audit:dlq:events` | Generic audit event batches |
| `audit:dlq:notifications` | Notification-specific audit events |
| `audit:dead-letter:{type}` | Events that exceeded retry attempts |

The DLQ uses Valkey consumer groups (`XREADGROUP`) for reliable delivery and `XAck` for acknowledgment. Maximum stream length is 10,000 entries.

## Next Steps

- [Data Persistence](data-persistence.md) -- PostgreSQL schema, partitioning, and reconstruction
- [Audit & Observability](../user-guide/audit-and-observability.md) -- User guide for audit features
- [System Overview](overview.md) -- How audit fits into the overall architecture
