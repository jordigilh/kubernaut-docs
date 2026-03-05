# Kubernaut User Guide Documentation Triage Report

**Date**: 2026-03-04  
**Scope**: `/docs/user-guide/*.md` vs `/Users/jgil/go/src/github.com/jordigilh/kubernaut` source code  
**Method**: Line-by-line verification of technical claims against API types, controllers, and configuration

---

## Executive Summary

| Category | HIGH | MEDIUM | LOW | GAPS |
|----------|------|--------|-----|------|
| **Concepts** | 1 | 2 | 1 | 2 |
| **Workflows** | 2 | 1 | 0 | 1 |
| **Signals** | 1 | 0 | 0 | 0 |
| **Approval** | 0 | 1 | 1 | 1 |
| **Effectiveness** | 0 | 0 | 0 | 0 |
| **Audit** | 0 | 0 | 0 | 1 |
| **Data Lifecycle** | 0 | 0 | 0 | 0 |
| **Configuration** | 0 | 1 | 0 | 2 |

---

## 1. Concepts Page (`concepts.md`)

### INCONSISTENCIES

#### HIGH: RemediationRequest phases incomplete

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Phases table (lines 82–93) | Lists: Pending, Processing, Analyzing, AwaitingApproval, Executing, Completed, Failed, Rejected | `api/remediation/v1alpha1/remediationrequest_types.go` defines additional phases: **Blocked**, **TimedOut**, **Skipped**, **Cancelled** |

**Severity**: HIGH — Operators will not understand Blocked, TimedOut, Skipped, or Cancelled states.

---

#### MEDIUM: Pipeline stage naming

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Pipeline diagram (lines 10–17) | "Close the Loop" stage | No CRD named "Close the Loop". The NotificationRequest and EffectivenessAssessment CRDs are created after workflow completion, but the pipeline diagram oversimplifies. |

**Severity**: MEDIUM — Misleading; "Close the Loop" is conceptual, not a single CRD stage.

---

#### MEDIUM: Workflow catalog execution engines

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| WorkflowExecution section (lines 56–63) | "Runs remediation via **Tekton Pipelines** (multi-step) or **Kubernetes Jobs** (single-step)" | `pkg/datastorage/models/workflow_schema.go` WorkflowExecution struct validates: `"tekton", "ansible", "lambda", "shell"` — **no "job"** in schema. However, fixtures use `engine: job` (e.g. `oomkill-increase-memory-job/workflow-schema.yaml`). Parser/WorkflowExecution controller may map "job" differently. |

**Note**: Fixtures use `engine: job` and it works. The `workflow_schema.go` validate tag says `oneof=tekton ansible lambda shell` — "job" would fail validation. **Verification needed**: Either schema validation is bypassed for "job", or docs are wrong. Fixtures prove "job" is used in practice.

**Severity**: MEDIUM — Schema validation excludes "job" but fixtures use it; documentation may be correct and schema validation outdated.

---

#### LOW: TargetResource vs TargetResource

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| RemediationRequest (line 26) | "TargetResource — The Kubernetes resource that triggered the alert" | Spec uses `TargetResource` (ResourceIdentifier with Kind, Name, Namespace). Correct. |

**Severity**: LOW — No inconsistency; minor terminology check only.

---

### GAPS

1. **Blocked phase semantics** — Docs do not explain the Blocked phase (ConsecutiveFailures, ResourceBusy, RecentlyRemediated, ExponentialBackoff, DuplicateInProgress, UnmanagedResource, IneffectiveChain). Critical for operators debugging stuck remediations.

2. **Rejected vs Cancelled** — "Rejected" is for human rejection of approval. "Cancelled" is for manual cancellation of the RR. Docs mention Rejected but not Cancelled.

---

## 2. Workflows Page (`workflows.md`)

### INCONSISTENCIES

#### HIGH: Gateway/AlertManager webhook endpoints

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Signals page reference | AlertManager: `POST /api/v1/alerts` | Gateway uses `POST /api/v1/signals/prometheus` (`pkg/gateway/adapters/prometheus_adapter.go`) |
| Signals page reference | K8s events: `POST /api/v1/events` | Gateway uses `POST /api/v1/signals/kubernetes-event` (`pkg/gateway/adapters/kubernetes_event_adapter.go`) |

**Severity**: HIGH — AlertManager and Event Exporter configuration will fail if users follow docs.

---

#### HIGH: Workflow schema execution structure

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Required fields table (line 56) | `execution.engine`: `job` or `tekton` | `pkg/datastorage/models/workflow_schema.go` WorkflowExecution struct has `validate:"omitempty,oneof=tekton ansible lambda shell"` — **"job" excluded**. However, `pkg/datastorage/models/workflow.go` defines `ExecutionEngineJob = "job"`, OpenAPI enum is `[tekton, job]`, and fixtures use `engine: job` successfully. |

**Severity**: HIGH — Schema validation in `workflow_schema.go` is outdated; runtime supports "job". Docs are correct; code validation should add "job".

---

#### MEDIUM: Workflow registration API host

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Registering Workflows (lines 159–166) | `curl -X POST http://datastorage.kubernaut-system.svc:8080/api/v1/workflows` | Correct path. Body format `{"schemaImage":"..."}` is correct per `pkg/datastorage/server/workflow_handlers.go`. |

**Severity**: None — Verified correct.

---

### GAPS

1. **detectedLabels gitOpsTool values** — Docs say `gitOpsTool: flux | argocd | "*"`. Code (`workflow_schema.go` detectedLabelsFieldSpecs) uses `"argocd"` and `"flux"` (lowercase). Doc has "argocd" correct; order differs. Minor.

---

## 3. Signals Page (`signals.md`)

### INCONSISTENCIES

#### HIGH: Webhook endpoints wrong

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Prometheus AlertManager (lines 10–12) | `POST /api/v1/alerts` | Actual: `POST /api/v1/signals/prometheus` |
| Kubernetes Events (lines 38–39) | `POST /api/v1/events` | Actual: `POST /api/v1/signals/kubernetes-event` |
| alertmanager.yml example (line 21) | `url: http://gateway.kubernaut-system.svc:8080/api/v1/alerts` | Should be `/api/v1/signals/prometheus` |

**Severity**: HIGH — Users configuring AlertManager will get 404s.

---

### GAPS

None identified beyond endpoint corrections.

---

## 4. Approval Page (`approval.md`)

### INCONSISTENCIES

#### MEDIUM: Approval patch field name

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Approve example (lines 60–62) | `{"status":{"decision":"Approved","reason":"RCA looks correct"}}` | RAR status uses `decisionMessage` for the human-provided message, not `reason`. `reason` exists but is machine-readable. Deploy scripts use `decisionMessage`. |

**Severity**: MEDIUM — Patch may work if `reason` is accepted, but `decisionMessage` is the intended field per CRD and examples.

---

#### LOW: Production always requires approval

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Confidence thresholds | Rego policy controls approval | `config/rego/aianalysis/approval.rego` line 115: **Production ALWAYS requires approval** regardless of confidence. Doc says "When confidence is at or above the threshold, auto-approved" but does not state that production overrides this. |

**Severity**: LOW — Doc could clarify that production namespaces always require approval regardless of confidence.

---

### GAPS

1. **0.7 threshold (Investigating phase)** — Doc mentions 0.7 for "Investigating (response processor)" to reject low-confidence workflow selections. Code: `pkg/aianalysis/handlers/investigating.go` and tests reference 0.7 for `needs_human_review` / transition to Failed. The 0.7 is used in AIAnalysis for "problem resolved" / low-confidence rejection, not in Rego. Doc is partially correct but could clarify where 0.7 applies (HAPI response processing vs Rego).

---

## 5. Effectiveness Page (`effectiveness.md`)

### INCONSISTENCIES

None. Timing model, assessment dimensions (Spec Hash, Health, Metric Recovery, Validity Window), and Helm paths match:

- `remediationorchestrator.config.effectivenessAssessment.stabilizationWindow`
- `remediationorchestrator.config.asyncPropagation.gitOpsSyncDelay`
- `remediationorchestrator.config.asyncPropagation.operatorReconcileDelay`

---

### GAPS

None identified.

---

## 6. Audit & Observability Page (`audit-and-observability.md`)

### INCONSISTENCIES

None. Audit event structure, retention (2555 days), and service list match the codebase.

---

### GAPS

1. **eventExporter** — Event Exporter is in the Helm chart (`eventExporter` in values.yaml) and forwards K8s events to the Gateway. Audit page does not mention it, though Signals page does. Low impact.

---

## 7. Data Lifecycle Page (`data-lifecycle.md`)

### INCONSISTENCIES

None. Verified:

- CRD retention: 24 hours via `retentionExpiryTime`
- PostgreSQL `audit_events` retention: 2555 days (7 years)
- Reconstruction endpoint: `POST /api/v1/audit/remediation-requests/{correlation_id}/reconstruct`
- Reconstruction pipeline phases

---

### GAPS

None identified.

---

## 8. Configuration Page (`configuration.md`)

### INCONSISTENCIES

#### MEDIUM: Missing Helm values

| Location | Doc Claim | Code Reality |
|----------|-----------|--------------|
| Configuration Reference | Documents listed components | `values.yaml` includes **authwebhook** and **eventExporter** which are not documented. **hooks** (migrations, seedWorkflows, tlsCerts) also not documented. |

**Severity**: MEDIUM — Operators cannot configure AuthWebhook or Event Exporter via docs.

---

### GAPS

1. **authwebhook** — No table for `authwebhook.resources`, `authwebhook` config, etc.

2. **eventExporter** — No table for `eventExporter.image`, `eventExporter.resources`. Event Exporter uses `ghcr.io/resmoio/kubernetes-event-exporter:latest`.

3. **hooks** — `hooks.migrations`, `hooks.seedWorkflows`, `hooks.tlsCerts` with image overrides are not documented.

---

## Summary of Required Doc Updates

### Critical (HIGH)

1. **Signals + Workflows**: Replace `/api/v1/alerts` with `/api/v1/signals/prometheus` and `/api/v1/events` with `/api/v1/signals/kubernetes-event` in all examples.
2. **Concepts**: Add Blocked, TimedOut, Skipped, Cancelled to the phases table and describe Blocked semantics.
3. **Workflows**: Align `execution.engine` docs with schema: either add "job" to schema validation or document only tekton/ansible/lambda/shell.

### Important (MEDIUM)

4. **Approval**: Change approval example from `"reason"` to `"decisionMessage"`.
5. **Approval**: Clarify that production namespaces always require approval.
6. **Configuration**: Add sections for authwebhook, eventExporter, and hooks.

### Nice to Have (LOW)

7. **Concepts**: Clarify "Close the Loop" as NotificationRequest + EffectivenessAssessment.
8. **Approval**: Clarify where the 0.7 threshold applies (Investigating phase vs Rego).

---

## Verification Sources

| Doc Section | Primary Code References |
|-------------|-------------------------|
| Concepts | `api/remediation/v1alpha1/remediationrequest_types.go`, `api/signalprocessing/`, `api/aianalysis/`, `api/effectivenessassessment/` |
| Workflows | `pkg/datastorage/models/workflow_schema.go`, `pkg/datastorage/server/workflow_handlers.go`, `test/fixtures/workflows/` |
| Signals | `pkg/gateway/adapters/prometheus_adapter.go`, `pkg/gateway/adapters/kubernetes_event_adapter.go` |
| Approval | `config/rego/aianalysis/approval.rego`, `pkg/aianalysis/handlers/analyzing.go`, `api/remediation/v1alpha1/remediationapprovalrequest_types.go` |
| Effectiveness | `api/effectivenessassessment/`, `internal/config/remediationorchestrator/`, `charts/kubernaut/values.yaml` |
| Audit | `pkg/audit/event.go`, `pkg/datastorage/repository/audit_events_repository.go`, `migrations/013_create_audit_events_table.sql` |
| Data Lifecycle | `pkg/datastorage/ogen-client/`, `holmesgpt-api/src/clients/datastorage/` |
| Configuration | `charts/kubernaut/values.yaml`, `charts/kubernaut/templates/` |
