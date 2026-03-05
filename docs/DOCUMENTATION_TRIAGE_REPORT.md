# Kubernaut Documentation Triage Report

**Date**: March 4, 2026  
**Scope**: Public documentation vs. source code in `github.com/jordigilh/kubernaut`  
**Methodology**: Field-level verification against Go types, OpenAPI specs, and runtime behavior

---

## Executive Summary

| Page | Inconsistencies | Gaps | Critical Issues |
|------|-----------------|------|-----------------|
| CRDs | 25+ | 8 | 4 |
| DataStorage API | 5 | 3 | 2 |
| HolmesGPT API | 2 | 0 | 0 |
| Operations (Monitoring) | 3 | 2 | 1 |
| Operations (Troubleshooting) | 1 | 0 | 0 |
| Design Decisions | 2 | 0 | 0 |
| Contributing | 3 | 1 | 1 |

---

## 1. CRDs Page (`docs/api-reference/crds.md`)

### 1.1 RemediationRequest

| Location | Doc Claims | Code Reality | Severity |
|----------|------------|--------------|----------|
| Spec | `targetResource`, `signal`, `scope` | Spec has 30+ fields: `signalFingerprint`, `signalName`, `severity`, `signalType`, `targetResource`, `firingTime`, `receivedTime`, `providerData`, etc. No `signal` or `scope` types. | **HIGH** |
| Status | `signalProcessingRef` | Correct. Also has `remediationProcessingRef` (legacy), `currentProcessingRef`. | LOW |
| Phases | `Pending` → `Processing` → `Analyzing` → `AwaitingApproval` → `Executing` → `Completed` / `Failed` / `Rejected` | **Missing phases**: `Blocked`, `TimedOut`, `Skipped`, `Cancelled`. No `Rejected` as terminal phase (approval rejection sets `Failed` or `Skipped`). | **HIGH** |
| Status | `timeoutConfig` in status | Correct (moved from spec per Gap #8). | — |

**Gap**: Status has 50+ fields not documented: `blockReason`, `blockMessage`, `blockedUntil`, `skipReason`, `skipMessage`, `duplicateOf`, `notificationStatus`, `preRemediationSpecHash`, `effectivenessAssessmentRef`, etc.

---

### 1.2 RemediationApprovalRequest

| Location | Doc Claims | Code Reality | Severity |
|----------|------------|--------------|----------|
| Spec | `remediationRequestRef`, `analysisContext`, `confidenceScore` | Spec has: `remediationRequestRef`, `aiAnalysisRef`, `confidence` (not `confidenceScore`), `confidenceLevel`, `reason`, `recommendedWorkflow`, `investigationSummary`, `evidenceCollected`, `recommendedActions`, `alternativesConsidered`, `whyApprovalRequired`, `policyEvaluation`, `requiredBy`. No `analysisContext`. | **HIGH** |
| Status | `reason` | Code has `reason` and `decisionMessage`. `reason` is machine-readable; `decisionMessage` is human-provided. | MEDIUM |

---

### 1.3 SignalProcessing

| Location | Doc Claims | Code Reality | Severity |
|----------|------------|--------------|----------|
| Status | `enrichedData` (EnrichedData) | Status has: `kubernetesContext`, `environmentClassification`, `priorityAssignment`, `businessClassification`, `severity`, `signalMode`, `signalName`, `sourceSignalName`, `policyHash`. No `enrichedData` type. | **MEDIUM** |

---

### 1.4 AIAnalysis

| Location | Doc Claims | Code Reality | Severity |
|----------|------------|--------------|----------|
| Spec | `remediationID` | Code uses `remediationId` (camelCase). | LOW |
| Status | `analysisResult` (AnalysisResult) | Status has: `rootCause`, `rootCauseAnalysis`, `selectedWorkflow`, `alternativeWorkflows`, `approvalRequired`, `approvalContext`, `investigationSession`, `postRCAContext`. No `analysisResult` type. | **MEDIUM** |

---

### 1.5 WorkflowExecution

| Location | Doc Claims | Code Reality | Severity |
|----------|------------|--------------|----------|
| Spec | `workflowRef`, `targetResource`, `parameters`, `executionEngine` | **Missing**: `remediationRequestRef` (required). Also has `confidence`, `rationale`, `executionConfig`. | **HIGH** |
| Status | `jobRef`, `pipelineRunRef` | Code has `executionRef` (generic `*LocalObjectReference`) and `executionStatus`. No `jobRef` or `pipelineRunRef`. | **HIGH** |
| Status | `startedAt`, `completedAt` | Code has `startTime`, `completionTime`. | MEDIUM |

---

### 1.6 NotificationRequest

| Location | Doc Claims | Code Reality | Severity |
|----------|------------|--------------|----------|
| Spec | `type`, `priority`, `recipients`, `subject`, `body`, `metadata` | Spec also has: `remediationRequestRef`, `severity`, `phase`, `reviewSource`, `actionLinks`, `retryPolicy`, `retentionDays`. | LOW |
| Status | `deliveryResults` ([]DeliveryResult) | Code has `deliveryAttempts` ([]DeliveryAttempt), not `deliveryResults`. | **MEDIUM** |
| Status | Phase values | Doc implies simple phase. Code has: `Pending`, `Sending`, `Retrying`, `Sent`, `PartiallySent`, `Failed`. | LOW |

---

### 1.7 EffectivenessAssessment

| Location | Doc Claims | Code Reality | Severity |
|----------|------------|--------------|----------|
| Spec | `remediationRequestRef`, `targetResource`, `assessmentConfig` | Spec has: `correlationID`, `remediationRequestPhase`, `signalTarget`, `remediationTarget`, `config` (EAConfig), `remediationCreatedAt`, `signalName`, `preRemediationSpecHash`, `hashComputeAfter`, `gitOpsSyncDelay`, `operatorReconcileDelay`. No `remediationRequestRef` or `targetResource`. | **HIGH** |
| Status | `assessmentResult` (AssessmentResult) | Status has: `phase`, `validityDeadline`, `prometheusCheckAfter`, `alertManagerCheckAfter`, `components` (EAComponents), `assessmentReason`, `completedAt`, `message`, `conditions`. No `assessmentResult` type. | **MEDIUM** |
| Phases | `Pending` → `Assessing` → `Completed` / `Failed` | **Missing**: `Stabilizing`, `WaitingForPropagation`. | **MEDIUM** |

---

## 2. DataStorage API Page (`docs/api-reference/datastorage-api.md`)

### 2.1 Endpoint Inconsistencies

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| `GET /health` (liveness), `GET /ready` (readiness) | DataStorage exposes: `GET /health` (overall), `GET /health/ready` (readiness), `GET /health/live` (liveness). Doc implies `/health` and `/ready` as separate paths. | **MEDIUM** |
| `GET /api/v1/audit/events` (query) | OpenAPI: `POST /api/v1/audit/events` for write. `GET` for query may exist—need to verify. OpenAPI shows `POST` for both batch and single. | **LOW** |
| `GET /api/v1/workflows/search` | OpenAPI has no `/search` path. Workflow discovery uses `GET /api/v1/workflows` with query params (`environment`, `priority`, `component`, `workflow_name`, etc.) and `GET /api/v1/workflows/actions`, `GET /api/v1/workflows/actions/{action_type}`. | **HIGH** |
| `POST /api/v1/action-histories`, `GET /api/v1/action-histories` | **No such endpoints** in OpenAPI. DataStorage has `action_histories` table (DB schema) but no REST API for it in the public spec. | **HIGH** |

### 2.2 Workflow Registration Format

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| `{"schemaImage": "<oci-ref>"}` | OpenAPI `CreateWorkflowFromOCIRequest` uses `schemaImage` (camelCase). Correct. | — |

### 2.3 Gaps

- **Missing endpoints**: `/api/v1/workflows/actions`, `/api/v1/workflows/actions/{action_type}`, `/api/v1/audit/notifications`, `/api/v1/audit/legal-hold`, `/api/v1/audit/export`, `/api/v1/effectiveness/{correlation_id}`, `/api/v1/remediation-history/context`, workflow disable/enable/deprecate PATCH endpoints.
- **Health path clarification**: Doc should state DataStorage uses `/health/ready` and `/health/live` (not `/ready`).

---

## 3. HolmesGPT API Page (`docs/api-reference/holmesgpt-api.md`)

### 3.1 Verification

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| `POST /api/v1/incident/analyze` → 202 + session_id | OpenAPI confirms. | — |
| `GET /api/v1/incident/session/{id}` | OpenAPI confirms. | — |
| `GET /api/v1/incident/session/{id}/result` | OpenAPI confirms. | — |
| Session statuses: `pending`, `investigating`, `completed`, `failed` | OpenAPI does not enumerate; doc is consistent with typical implementation. | — |
| `/health`, `/ready`, `/config`, `/metrics` | OpenAPI has `/health`, `/ready`, `/config`. No `/metrics` in OpenAPI—may be added by framework. | LOW |
| LLM providers: OpenAI, Vertex AI, Azure, LiteLLM | Doc is accurate; LiteLLM supports these. | — |

### 3.2 Minor

- OpenAPI 202 response schema is empty `{}`; doc shows `{"session_id": "..."}`. Implementation likely returns session_id; spec could be tightened.

---

## 4. Operations – Monitoring (`docs/operations/monitoring.md`)

### 4.1 Metrics Port

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| Metrics at `:9090/metrics` | Controller-runtime services (AIAnalysis, etc.) expose metrics on the **main port** (e.g. `:8080/metrics`) via `metrics.Registry`. `pkg/signalprocessing/config`: `MetricsAddr: ":9090"` for SP. DataStorage: metrics on same server as API. **Inconsistent across services**: some use :9090, some use main port. | **MEDIUM** |
| Scrape config `__address__` replacement with `:9090` | May fail for services that use main port for metrics. | **MEDIUM** |

### 4.2 Health Endpoints

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| `GET /health`, `GET /ready` for every service | DataStorage uses `/health`, `/health/ready`, `/health/live`. Other services may vary. | LOW |

### 4.3 Log Format

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| Structured JSON with `level`, `ts`, `msg`, `controller`, `name`, `namespace`, `phase` | Controllers use logr/zap; structure depends on config. Example is plausible. | — |

### 4.4 Gaps

- **Metric names**: Doc lists "Signals received, signals dropped" etc. but does not list actual Prometheus metric names (e.g. `aianalysis_reconciler_reconciliations_total`, `remediationorchestrator_phase_transitions_total`). Operators need exact names for dashboards.
- **DataStorage metrics**: Doc says "Audit event ingestion rate, query latencies, workflow catalog size". OpenAPI lists: `datastorage_audit_traces_total`, `datastorage_audit_lag_seconds`, `datastorage_write_duration_seconds`, `datastorage_validation_failures_total`, `datastorage_legal_hold_successes_total`, `datastorage_legal_hold_failures_total`. No "workflow catalog size" metric in code.

---

## 5. Operations – Troubleshooting (`docs/operations/troubleshooting.md`)

### 5.1 Verification

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| `kubectl patch remediationapprovalrequest` with `status.decision`, `status.reason` | RAR status has `decision`, `decisionMessage`. `reason` exists but `decisionMessage` is the human-provided field. Doc uses `reason`—acceptable if operators use it. | LOW |
| DataStorage curl to `localhost:8080/ready` | DataStorage uses `/health/ready`, not `/ready`. Path is wrong. | **MEDIUM** |

---

## 6. Design Decisions Page (`docs/design-decisions/index.md`)

### 6.1 ADR/DD Existence Check

| Referenced | Exists | Notes |
|------------|--------|-------|
| ADR-001 | ✅ | `ADR-001-crd-microservices-architecture.md` |
| ADR-025 | ✅ | `ADR-025-kubernetesexecutor-service-elimination.md` |
| ADR-030 | ✅ | `ADR-030-service-configuration-management.md` (also `ADR-030-CONFIGURATION-MANAGEMENT.md`) |
| ADR-032 | ✅ | `ADR-032-data-access-layer-isolation.md` |
| ADR-034 | ✅ | `ADR-034-unified-audit-table-design.md` |
| ADR-045 | ✅ | `ADR-045-aianalysis-holmesgpt-api-contract.md` |
| ADR-053 | ✅ | `ADR-053-resource-scope-management.md` |
| ADR-057 | ✅ | `ADR-057-crd-namespace-consolidation.md` |
| DD-GATEWAY-012 | ✅ | `DD-GATEWAY-012-redis-removal.md` |
| DD-WORKFLOW-016 | ✅ | `DD-WORKFLOW-016-action-type-workflow-indexing.md` |
| DD-WORKFLOW-017 | ✅ | `DD-WORKFLOW-017-workflow-lifecycle-component-interactions.md` |
| DD-INFRA-001 | ✅ | `DD-INFRA-001-consolidated-namespace-strategy.md` (doc says "Namespace consolidation") |
| DD-AUTH-011 | ✅ | In `DD-AUTH-011/` directory |
| DD-AUTH-012 | ✅ | In `DD-AUTH-012/` directory |

All referenced ADRs/DDs exist.

### 6.2 Minor

- DD-WORKFLOW-016 doc summary says "Workflow catalog architecture"; actual file is "action-type-workflow-indexing". DD-WORKFLOW-017 covers "V1.0 workflow registration". Summary wording could be aligned with file titles.

---

## 7. Contributing Page (`docs/contributing.md`)

### 7.1 Build/Test Commands

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| `make build-all` | ✅ Exists. | — |
| `make test-tier-unit` | ✅ Exists. | — |
| `make test-integration-gateway` | ✅ Exists (pattern `test-integration-%`). | — |
| `make test-e2e-gateway` | ✅ Exists (pattern `test-e2e-%`). | — |

### 7.2 Prerequisites

| Doc Claims | Code Reality | Severity |
|------------|--------------|----------|
| Go 1.25+ | `go.mod` specifies `go 1.25` and `toolchain go1.25.3`. Correct. | — |

### 7.3 Gaps

- **Integration tests**: Doc says "requires Kind cluster". Some integration tests use envtest (no Kind); others use Kind. Wording could be clarified.
- **Project structure**: Doc does not mention `cmd/` service layout, `api/` CRD packages, or `pkg/` shared code. New contributors may need this.

---

## 8. API Reference Index (`docs/api-reference/index.md`)

- Claims "7 CRD types" — correct (RemediationRequest, RemediationApprovalRequest, SignalProcessing, AIAnalysis, WorkflowExecution, NotificationRequest, EffectivenessAssessment).
- Links to sub-pages are valid.

---

## Recommendations

### High Priority

1. **CRDs page**: Rewrite spec/status tables from actual Go types. Add missing phases (Blocked, TimedOut, Skipped, Cancelled) for RemediationRequest. Fix WorkflowExecution spec (add `remediationRequestRef`) and status (replace `jobRef`/`pipelineRunRef` with `executionRef`).
2. **DataStorage API**: Remove or correct `action-histories` endpoints. Replace `GET /api/v1/workflows/search` with `GET /api/v1/workflows` + query params. Document `/health/ready` and `/health/live`.
3. **Troubleshooting**: Change DataStorage readiness check from `/ready` to `/health/ready`.

### Medium Priority

4. **CRDs**: Align RemediationApprovalRequest, SignalProcessing, AIAnalysis, NotificationRequest, EffectivenessAssessment with actual types.
5. **Monitoring**: Document actual Prometheus metric names per service. Clarify metrics port (9090 vs main port) per service.
6. **DataStorage**: Add missing endpoints (workflow actions, audit notifications, legal hold, effectiveness, remediation-history).

### Low Priority

7. **Contributing**: Add project structure overview.
8. **Design Decisions**: Align summary text with ADR/DD titles where needed.

---

## Appendix: Source Files Verified

- `api/remediation/v1alpha1/remediationrequest_types.go`
- `api/remediation/v1alpha1/remediationapprovalrequest_types.go`
- `api/signalprocessing/v1alpha1/signalprocessing_types.go`
- `api/aianalysis/v1alpha1/aianalysis_types.go`
- `api/workflowexecution/v1alpha1/workflowexecution_types.go`
- `api/notification/v1alpha1/notificationrequest_types.go`
- `api/effectivenessassessment/v1alpha1/effectivenessassessment_types.go`
- `api/openapi/data-storage-v1.yaml`
- `holmesgpt-api/api/openapi.json`
- `pkg/datastorage/server/server.go`, `handlers.go`
- `pkg/*/metrics/metrics.go` (multiple services)
- `Makefile`
- `go.mod`
- `docs/architecture/decisions/*.md`
