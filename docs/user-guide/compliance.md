# SOC2 Alignment

Kubernaut's audit pipeline is **designed to align** with SOC2 Type II trust service criteria for automated remediation systems. This page maps Kubernaut's audit capabilities to specific SOC2 controls and explains how each control is addressed.

!!! warning "Not a certification claim"
    This page documents how Kubernaut's audit architecture **aims to support** SOC2 compliance. It is not a certification claim. Formal SOC2 Type II compliance requires an independent auditor's assessment of the operating organization's controls, processes, and evidence -- which is outside the scope of Kubernaut itself. Items with version annotations (e.g., "planned for v1.2") indicate capabilities not yet available in the current release.

!!! info "Scope"
    This mapping covers Kubernaut's **internal** audit capabilities -- the audit events it generates, how they are stored, and what integrity guarantees it provides. Organizational controls (access policies, HR processes, vendor management) are outside Kubernaut's scope and must be addressed by the operating organization's SOC2 program.

## Authoritative Sources

The control mapping on this page is derived from the following internal design documents in the [kubernaut repository](https://github.com/jordigilh/kubernaut):

| Document | Scope |
|---|---|
| [BR-AUDIT-006](https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-AUDIT-006-remediation-approval-audit-trail.md) | Remediation approval audit trail |
| [BR-AUDIT-021-030](https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-AUDIT-021-030-WORKFLOW-SELECTION-AUDIT-TRAIL.md) | Workflow selection audit trail |
| [BR-GATEWAY-058](https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-GATEWAY-058-audit-event-emission-requirements.md) | Audit event emission requirements |
| [BR-WE-013](https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-WE-013-audit-tracked-block-clearing.md) | Audit-tracked block clearing |
| [ADR-034](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/ADR-034-unified-audit-table-design.md) | Unified audit table design (event sourcing, hash chain, partitioning) |
| [ADR-038](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/ADR-038-async-buffered-audit-ingestion.md) | Async buffered audit ingestion (fire-and-forget, DLQ) |
| [DD-AUDIT-001](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-AUDIT-001-audit-responsibility-pattern.md) | Audit responsibility pattern |
| [DD-AUDIT-002](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-AUDIT-002-audit-shared-library-design.md) | Shared audit library design |
| [DD-AUDIT-003](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-AUDIT-003-service-audit-trace-requirements.md) | Per-service audit trace requirements (P0/P1 classification) |
| [DD-WEBHOOK-003](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-WEBHOOK-003-webhook-complete-audit-pattern.md) | Webhook complete audit pattern (operator attribution) |

## Control Mapping

### CC6.8 -- Non-Repudiation

**Requirement**: Actions cannot be denied by the actor after the fact.

**How Kubernaut addresses this**:

- Every human action (approval, rejection, block clearance, workflow registration, action type management) is captured by the **Auth Webhook** using `req.UserInfo.Username` from Kubernetes admission control. The operator identity comes from Kubernetes authentication -- it cannot be spoofed or omitted ([DD-WEBHOOK-003]).
- Audit events are **immutable and append-only**. Once written to the `audit_events` PostgreSQL table, events cannot be modified or deleted (deletion is deferred to retention expiry, not yet implemented) ([ADR-034]).
- Events form a **SHA256 hash chain** (`event_hash = SHA256(previous_event_hash + canonical_event_json)`), enabling after-the-fact detection of any modification or deletion ([ADR-034]).

**Evidence**: [Operator Attribution](audit-and-observability.md#operator-attribution), [Hash Chain](../architecture/audit-pipeline.md#hash-chain-tamper-detection)

---

### CC7.2 -- Monitoring Activities

**Requirement**: The organization monitors system components and detects anomalies.

**How Kubernaut addresses this**:

- **9 services** emit structured audit events covering the full remediation lifecycle, from signal ingestion through effectiveness assessment. Every phase transition, routing decision, approval, execution, and notification is recorded ([DD-AUDIT-003]).
- The **workflow discovery audit trail** records every step of the LLM's 3-step selection protocol: which action types were listed, which workflows were scored, which workflow was retrieved, and whether the selection passed validation ([BR-AUDIT-021-030]).
- All events share a `correlation_id` (the RemediationRequest name), enabling complete timeline reconstruction for any remediation.
- ~115 Prometheus metrics provide real-time operational monitoring of throughput, latency, errors, audit health, and LLM cost.

**Evidence**: [What Gets Audited](audit-and-observability.md#what-gets-audited), [Emitting Services](../architecture/audit-pipeline.md#emitting-services), [Metrics](audit-and-observability.md#metrics)

---

### CC7.3 -- Immutability and Retention

**Requirement**: Audit records are protected from unauthorized modification and retained for an appropriate period.

**How Kubernaut addresses this**:

- Audit events are stored in PostgreSQL with a default retention of **2,555 days (7 years)**, recorded per event in the `retention_days` field.
- The `audit_events` table is **append-only** by design (event sourcing pattern, [ADR-034]). There are no UPDATE or DELETE operations exposed through the DataStorage API.
- The **hash chain** provides cryptographic tamper detection. Any modification to a stored event breaks the chain and is detectable by walking the hash sequence ([ADR-034]).
- The table is **partitioned by month** for efficient storage and querying at scale.

!!! note "Retention enforcement (v1.1)"
    The retention period is recorded per event, but automatic deletion of expired events is deferred to v1.2. Events currently accumulate indefinitely -- retention is effectively unlimited.

**Evidence**: [Retention](audit-and-observability.md#retention), [Event Structure](../architecture/audit-pipeline.md#event-structure)

---

### CC7.4 -- Completeness

**Requirement**: Audit records capture all relevant events without gaps.

**How Kubernaut addresses this**:

- Audit emission is **fire-and-forget with retry** ([ADR-038]). If DataStorage is temporarily unavailable, events are retried (3 attempts with quadratic backoff). If retries are exhausted, the batch is sent to a **Valkey Dead Letter Queue** (DLQ) for later reprocessing.
- Business logic **never blocks** on audit writes. This means a transient audit failure cannot prevent remediation from proceeding, and the DLQ ensures events are not silently lost.
- Every service uses the same **shared audit library** (`pkg/audit/`) ([DD-AUDIT-002]), ensuring consistent event structure, batching, and retry behavior across all services.
- The `correlation_id` links all events for a single remediation, making it possible to detect gaps by querying for a remediation and checking whether all expected event types are present.

**Evidence**: [Buffered Audit Store](../architecture/audit-pipeline.md#buffered-audit-store), [Dead Letter Queue](../architecture/audit-pipeline.md#dead-letter-queue)

---

### CC8.1 -- User Attribution

**Requirement**: Actions are attributable to a specific individual.

**How Kubernaut addresses this**:

- The **Auth Webhook** captures operator identity for every human-initiated action through Kubernetes admission control ([DD-WEBHOOK-003]):

    | Action | Event Type |
    |---|---|
    | Approve/reject remediation | `webhook.remediationapprovalrequest.decided` |
    | Clear execution block | `workflowexecution.block.cleared` |
    | Modify timeout | `webhook.remediationrequest.timeout_modified` |
    | Cancel notification | `webhook.notification.cancelled` |
    | Register/delete workflow | `remediationworkflow.admitted.create`, `remediationworkflow.admitted.delete` |
    | Create/update/delete action type | `actiontype.admitted.create`, `actiontype.admitted.update`, `actiontype.admitted.delete` |

- System-initiated actions (controller reconciliation, LLM analysis) are attributed to the service name (`actor_type: service`, `actor_id: ai-analysis`) ([DD-AUDIT-001]).
- Each event records `actor_type` (service or human), `actor_id`, and `event_timestamp`.

**Evidence**: [Operator Attribution](audit-and-observability.md#operator-attribution), [Operator Attribution (architecture)](../architecture/audit-pipeline.md#operator-attribution)

---

### CC4.2 -- Change Tracking

**Requirement**: Changes to system components are tracked.

**How Kubernaut addresses this**:

- Every CRD phase transition is recorded as an audit event with the previous and current phase. Each emitting service follows the responsibility pattern defined in [DD-AUDIT-001], where the controller that owns the phase transition is responsible for emitting the event.
- Workflow catalog changes (create, update, disable, re-enable) are audited by both the Auth Webhook (operator identity per [DD-WEBHOOK-003]) and DataStorage (catalog state change). This dual-event pattern ensures both the "who" and the "what" are captured independently.
- Action type taxonomy changes follow the same dual-event pattern.
- Block clearance events record the original block reason, the clearing operator, and the justification (minimum 10-character reason required, [BR-WE-013]).
- Approval decisions record the operator, decision (approve/reject), and rationale in an immutable event ([BR-AUDIT-006]).

**Evidence**: [Emitting Services](../architecture/audit-pipeline.md#emitting-services), [Operator Attribution](../architecture/audit-pipeline.md#operator-attribution), [What Gets Audited](audit-and-observability.md#what-gets-audited)

---

### AU-2 -- Auditable Events

**Requirement**: The organization determines which events are auditable.

**How Kubernaut addresses this**:

Kubernaut defines auditable events per service in [DD-AUDIT-003]. Seven services have mandatory (P0) audit requirements; two have recommended (P1). Event types are hierarchically named (`service.category.action`) and documented in the [audit event catalog](../architecture/audit-pipeline.md#emitting-services).

---

### AU-9 -- Audit Protection

**Requirement**: Audit records are protected from unauthorized access, modification, and deletion.

**How Kubernaut addresses this**:

- The DataStorage REST API does not expose UPDATE or DELETE endpoints for audit events.
- PostgreSQL access is restricted to the DataStorage service's database credentials.
- The hash chain provides a cryptographic integrity guarantee that is independent of database access controls ([ADR-034]).
- Legal hold support (`legal_hold`, `legal_hold_reason`, `legal_hold_set_at`, `legal_hold_set_by`) is available at the event level to prevent retention-based deletion of specific events.

!!! note "CLI verification tools (v1.1)"
    Client-side hash chain verification and digital signature verification CLI tools are planned for v1.2. Server-side integrity verification is available through the DataStorage API.

---

### AC-2 -- Account Management

**Requirement**: Actions are linked to authenticated user accounts.

**How Kubernaut addresses this**:

- All human actions flow through Kubernetes admission webhooks, which extract the authenticated identity from `req.UserInfo.Username` ([DD-WEBHOOK-003]).
- All signal ingestion requests are authenticated via Kubernetes TokenReview + SubjectAccessReview ([BR-GATEWAY-058]). The Gateway rejects unauthenticated signals.
- Audit events record the authenticated identity, linking every action to a specific Kubernetes ServiceAccount or user.

**Evidence**: [Signal Source Authentication](configuration.md#signal-source-authentication), [Operator Attribution](audit-and-observability.md#operator-attribution)

---

## Reconstruction and Evidence Production

For audits and compliance reviews, Kubernaut can **reconstruct a complete RemediationRequest** from audit data -- even after the Kubernetes CRD has been deleted:

```
POST /api/v1/audit/remediation-requests/{correlation_id}/reconstruct
```

This produces the full remediation record: what signal triggered it, what the LLM investigated, what workflow was selected, who approved it, what the execution did, and whether it was effective. See [Data Lifecycle: Reconstruction](data-lifecycle.md#remediationrequest-reconstruction) for details.

## Summary

| SOC2 Control | Kubernaut Capability | Key Sources |
|---|---|---|
| **CC6.8** Non-Repudiation | Immutable events, SHA256 hash chain, webhook-captured operator identity | [ADR-034], [DD-WEBHOOK-003] |
| **CC7.2** Monitoring | 9 services, full lifecycle audit, workflow discovery trail, Prometheus metrics | [DD-AUDIT-003], [BR-AUDIT-021-030] |
| **CC7.3** Immutability/Retention | Append-only table, 7-year retention, hash chain integrity | [ADR-034] |
| **CC7.4** Completeness | Fire-and-forget with retry, Valkey DLQ, shared audit library | [ADR-038], [DD-AUDIT-002] |
| **CC8.1** Attribution | Auth Webhook captures identity for all human actions | [DD-WEBHOOK-003] |
| **CC4.2** Change Tracking | Phase transitions, catalog changes, block clearance, approval decisions | [DD-AUDIT-001], [BR-WE-013], [BR-AUDIT-006] |
| **AU-2** Auditable Events | Defined per service (7 mandatory, 2 recommended) | [DD-AUDIT-003] |
| **AU-9** Audit Protection | No UPDATE/DELETE API, hash chain, legal hold support | [ADR-034] |
| **AC-2** Account Management | Kubernetes TokenReview + admission webhook identity | [DD-WEBHOOK-003], [BR-GATEWAY-058] |

[ADR-034]: https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/ADR-034-unified-audit-table-design.md
[ADR-038]: https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/ADR-038-async-buffered-audit-ingestion.md
[DD-AUDIT-001]: https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-AUDIT-001-audit-responsibility-pattern.md
[DD-AUDIT-002]: https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-AUDIT-002-audit-shared-library-design.md
[DD-AUDIT-003]: https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-AUDIT-003-service-audit-trace-requirements.md
[DD-WEBHOOK-003]: https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-WEBHOOK-003-webhook-complete-audit-pattern.md
[BR-AUDIT-006]: https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-AUDIT-006-remediation-approval-audit-trail.md
[BR-AUDIT-021-030]: https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-AUDIT-021-030-WORKFLOW-SELECTION-AUDIT-TRAIL.md
[BR-GATEWAY-058]: https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-GATEWAY-058-audit-event-emission-requirements.md
[BR-WE-013]: https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-WE-013-audit-tracked-block-clearing.md

## Next Steps

- [Audit & Observability](audit-and-observability.md) -- What gets audited and how to query it
- [Architecture: Audit Pipeline](../architecture/audit-pipeline.md) -- Technical deep-dive into the audit system
- [Data Lifecycle](data-lifecycle.md) -- CRD retention and reconstruction from audit data
- [Configuration Reference](configuration.md) -- Signal source authentication setup
