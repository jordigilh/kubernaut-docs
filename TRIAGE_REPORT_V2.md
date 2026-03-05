# Kubernaut Documentation Triage Report v2

**Date**: 2026-03-04  
**Scope**: Bidirectional triage of ALL services — code vs docs AND docs vs code  
**Method**: Source code is authoritative; BRs confirm planned v1.0 scope

---

## Summary

| Severity | Doc Inconsistencies | Gaps in Docs | Gaps in Code | Total |
|----------|-------------------|--------------|--------------|-------|
| **HIGH** | 8 | 6 | 5 | **19** |
| **MEDIUM** | 5 | 12 | 2 | **19** |
| **LOW** | 3 | 8 | 2 | **13** |
| **Total** | **16** | **26** | **9** | **51** |

---

## Part 1: HIGH Severity Findings

### H1. CRD API Groups Wrong Everywhere
- **Category**: INCONSISTENCY
- **Docs**: `crds.md` uses `remediation.kubernaut.io`, `signalprocessing.kubernaut.io`, `notification.kubernaut.io`, `aianalysis.kubernaut.io`
- **Code**: All CRDs use `kubernaut.ai` API group
- **Impact**: Users copying CRD references will get 404s
- **Fix**: Replace all `.kubernaut.io` with `.kubernaut.ai` in `crds.md`

### H2. Gateway Webhook Endpoints Wrong
- **Category**: INCONSISTENCY
- **Docs**: `signals.md` and `crds.md` use `/api/v1/alerts` and `/api/v1/events`
- **Code**: Actual paths are `POST /api/v1/signals/prometheus` and `POST /api/v1/signals/kubernetes-event`
- **Impact**: Integration guides will fail
- **Fix**: Update all endpoint references

### H3. EffectivenessAssessment CRD Spec Completely Wrong
- **Category**: INCONSISTENCY
- **Docs**: `crds.md` shows `remediationRequestRef`, `targetResource`, `assessmentConfig`
- **Code**: Actual spec uses `correlationID`, `signalTarget`, `remediationTarget`, `config`, `hashComputeAfter`, `preRemediationSpecHash`
- **Impact**: Users consulting CRD reference get entirely wrong field names
- **Fix**: Rewrite EA CRD section from `api/effectivenessassessment/v1alpha1/effectivenessassessment_types.go`

### H4. EffectivenessAssessment Phases Incomplete
- **Category**: GAP-IN-DOCS
- **Docs**: Lists 4 phases (Pending, Assessing, Completed, Failed)
- **Code**: Has 6 phases (Pending, WaitingForPropagation, Stabilizing, Assessing, Completed, Failed)
- **Impact**: Users won't understand why EA sits in "WaitingForPropagation" for minutes
- **Fix**: Document all 6 phases with transitions in both `effectiveness.md` and `crds.md`

### H5. AIAnalysis CRD Status Fields Wrong
- **Category**: INCONSISTENCY
- **Docs**: `crds.md` shows a single `analysisResult` status field
- **Code**: Status has `rootCause`, `selectedWorkflow`, `postRCAContext`, `confidence`, `investigationSession`, `approvalDecision`, etc.
- **Impact**: Users consulting CRD docs get wrong field names
- **Fix**: Rewrite AIAnalysis status section from `api/remediation/v1alpha1/aianalysis_types.go`

### H6. DataStorage API: Non-Existent Endpoints Documented
- **Category**: GAP-IN-CODE / INCONSISTENCY
- **Docs**: `datastorage-api.md` lists `GET /api/v1/workflows/search` and `POST/GET /api/v1/action-histories`
- **Code**: These endpoints do not exist. Workflow discovery uses a three-step flow: `GET /workflows/actions` → `GET /workflows/actions/{action_type}` → `GET /workflows/{workflowID}`
- **Impact**: API consumers will get 404s
- **Fix**: Remove fictitious endpoints; document actual three-step discovery flow

### H7. WorkflowExecution CRD Fields Wrong
- **Category**: INCONSISTENCY
- **Docs**: `crds.md` shows `jobRef` / `pipelineRunRef`
- **Code**: API uses `executionRef` (generic)
- **Impact**: Users referencing CRD status get wrong field names
- **Fix**: Update to use `executionRef`

### H8. Helm Gateway ConfigMap Key Mismatch
- **Category**: GAP-IN-CODE (potential bug)
- **Docs/Helm**: ConfigMap uses `processing.deduplication.ttl: 5m`
- **Code**: Config struct expects `cooldownPeriod`
- **Impact**: With wrong key, `CooldownPeriod` stays 0 and post-completion dedup cooldown is disabled
- **Fix**: Align Helm ConfigMap key with code expectation (either fix chart or fix config parsing)

### H9. DataStorage Success-Rate Endpoints Not Implemented
- **Category**: GAP-IN-CODE
- **BRs**: BR-STORAGE-031-01 (incident-type success rate) and BR-STORAGE-031-02 (workflow success rate) are marked "approved"
- **Code**: Endpoints are commented out in `server.go` with reference to issue #238
- **Impact**: Approved BRs not delivered in v1.0
- **Fix**: Either implement or update BR status to "deferred to v1.1"

---

## Part 2: MEDIUM Severity Findings

### M1. Service Count: 10 vs 11
- **Docs**: "10 services" throughout overview pages
- **Code**: 11 deployed components (includes AuthWebhook); Event Exporter is also deployed but external
- **Fix**: Update count or clarify what counts as a "service"

### M2. Kubernetes Version: v1.34+ Incorrect
- **Docs**: `installation.md` says "Kubernetes v1.34+"
- **Code**: E2E tests use Kind with 1.27–1.29; internal docs reference 1.27+
- **Fix**: Update to actual tested/supported version range

### M3. Notification Phases Incomplete
- **Docs**: Doesn't mention Retrying phase
- **Code**: Has Pending, Sending, Retrying, Sent, PartiallySent, Failed
- **Fix**: Add Retrying and PartiallySent to notification docs

### M4. NotificationRequest CRD Status Fields Wrong
- **Docs**: Uses `deliveryResults`
- **Code**: Uses `deliveryAttempts`, `totalAttempts`, `successfulDeliveries`, `failedDeliveries`
- **Fix**: Update `crds.md` NotificationRequest section

### M5. Approval Patch Field Name
- **Docs**: `approval.md` uses `"reason"` for human message
- **Code**: CRD uses `"decisionMessage"`
- **Fix**: Update approval kubectl example

### M6. Production Namespaces Always Require Approval
- **Docs**: Not mentioned
- **Code**: Rego approval policy forces approval for production namespaces regardless of confidence
- **Fix**: Add note to `approval.md`

### M7. Rego Policy Paths Incorrect
- **Docs**: References `config/rego/classification/`
- **Code**: Classification policies live in `deploy/signalprocessing/policies/` and are templated inline in Helm
- **Fix**: Correct paths or clarify that Rego is embedded in Helm charts

### M8. Severity Levels Don't Match
- **Docs**: "critical, warning, info"
- **Code**: Normalized severity uses "critical, high, medium, low, unknown" (DD-SEVERITY-001)
- **Fix**: Update severity references

### M9. Low-Confidence Behavior Mischaracterized
- **Docs**: `workflow-selection.md` says "< 0.7 — escalated to human review"
- **Code**: Low confidence (<0.7) with workflow leads to Failed phase (BR-AI-050), not human review
- **Fix**: Correct the confidence threshold behavior description

### M10. Rejected Phase May Not Exist as Distinct Phase
- **Docs**: Shows "Rejected" as a terminal phase
- **Code**: Implementation uses Failed with a rejection reason; Rejected may be set only via specific paths
- **Fix**: Verify and clarify the Rejected phase semantics

### M11. UnmanagedResource Block Expiry Logic Dead Code
- **Category**: GAP-IN-CODE
- **Code**: `HandleBlockedPhase` in `reconciler.go` (lines 2942-2998) implements BR-SCOPE-010 re-validation for UnmanagedResource blocks, but this handler is never called. The active `handleBlockedPhase` in `blocking.go` treats all time-based blocks the same (→ Failed).
- **Impact**: UnmanagedResource blocks don't re-validate scope on expiry; they transition to Failed instead of retrying
- **Fix**: Wire the UnmanagedResource re-check into the active handler

### M12. Phase Transition Map Incomplete
- **Code**: `ValidTransitions` map only allows `Blocked→Failed`, but `clearEventBasedBlock` also does `Blocked→Analyzing` (ResourceBusy) and `Blocked→Pending` (DuplicateInProgress)
- **Impact**: Transitions work in practice but aren't formally declared
- **Fix**: Update ValidTransitions map or document the implicit transitions

### M13. Session Endpoints Missing from HolmesGPT OpenAPI Spec
- **Code**: Go client calls session endpoints (`/api/v1/incident/sessions/{id}`, `/api/v1/incident/sessions/{id}/result`) via raw HTTP
- **OpenAPI**: `holmesgpt-api/api/openapi.json` doesn't include these endpoints
- **Fix**: Add session endpoints to OpenAPI spec or document they're intentionally outside the spec

### M14. AuthWebhook/EventExporter/Hooks Config Not Documented
- **Docs**: `configuration.md` omits authwebhook, eventExporter, and hooks (migrations, seedWorkflows, tlsCerts)
- **Code**: These are configurable in `values.yaml`
- **Fix**: Add these sections to configuration reference

### M15. Health Endpoints Mismatch
- **Docs**: DataStorage health at `/health`, `/ready`
- **Code**: Uses `/health`, `/health/ready`, `/health/live`
- **Fix**: Update endpoint paths

### M16. Workflow Selection Done by HolmesGPT, Not DataStorage
- **Docs**: `workflow-selection.md` implies DataStorage does the selection
- **Code**: HolmesGPT API performs the workflow selection; DataStorage only provides the catalog query
- **Fix**: Clarify the responsibility boundary

---

## Part 3: LOW Severity Findings

### L1. kubectl Resource Names Incorrect
- `effectivenessassessment` vs `effectivenessassessments` (plural)

### L2. Session Recovery Retry Count Unverified
- Docs say "up to 5 attempts per BR-AA-HAPI-064.5/064.6" — not clearly visible in code

### L3. Poll Interval: Docs Silent, Code Uses 15s
- AI Analysis session poll interval is 15s (configurable 1s–5m) but not documented

### L4. DetectedLabels Snake_Case Convention
- Rego uses snake_case for `detected_labels`, camelCase for `failed_detections` — convention not documented

### L5. Parameter Injection Env Vars
- Docs mention `NAMESPACE`, `RESOURCE_NAME`, `ALERT_NAME`; code injects `TARGET_RESOURCE` plus `wfe.Spec.Parameters`

### L6. Deployment YAML Examples Simplified
- Doc examples lack resource requests/limits and probe tuning vs actual manifests

### L7. Event Exporter Not Documented
- Deployed by Helm chart but has no docs page; config (image, resources, webhook endpoint) not documented

### L8. DataStorage Redis DLQ Worker Not Documented
- Redis retry worker and queue structure not described

### L9. Several DataStorage Endpoints Not Documented
- Legal-hold, export, verify-chain, effectiveness, remediation-history, workflow lifecycle (disable/enable/deprecate), three-step discovery

### L10. Assessment Reasons Not Documented
- EM assessment reasons (`no_execution`, `metrics_timed_out`, `spec_drift`) not in docs

### L11. BR Poll Interval Mismatch
- BR-064.8 recommends backoff (10s, 20s, 30s) but code uses constant 15s by design

---

## Part 4: Gaps in Code (Planned v1.0, Not Implemented)

| # | BR/DD | Feature | Status | Evidence |
|---|-------|---------|--------|----------|
| C1 | BR-STORAGE-031-01 | Incident-type success rate API | **Commented out** | `server.go` lines 451-463, issue #238 |
| C2 | BR-STORAGE-031-02 | Workflow success rate API | **Commented out** | Same as above |
| C3 | BR-SCOPE-010 | UnmanagedResource block re-validation on expiry | **Dead code** | `reconciler.go` lines 2942-2998 never called |
| C4 | DD-RO-002-ADDENDUM | ValidTransitions map doesn't include Blocked→Analyzing, Blocked→Pending | **Implicit only** | `phase/types.go` line 96 only has Blocked→Failed |
| C5 | BR-AA-HAPI-064.9 | Recovery async pattern in AA controller | **Not wired** | AA controller only uses incident flow |
| C6 | Helm ConfigMap | Gateway `cooldownPeriod` key alignment | **Mismatched** | Helm uses `ttl`, code expects `cooldownPeriod` |
| C7 | CRD TTL | RemediationRequest 24h TTL enforcement | **Not enforced** | Filed as issue #265 |

---

## Part 5: Documentation Pages That Need Fixing

### Must Fix (HIGH findings)

| Page | What's Wrong |
|------|-------------|
| `api-reference/crds.md` | Wrong API groups; wrong EA spec/status fields; wrong AA status fields; wrong WE fields; wrong NR status fields; incomplete phases for EA |
| `api-reference/datastorage-api.md` | Non-existent endpoints (`/workflows/search`, `/action-histories`); wrong health paths; missing three-step discovery flow |
| `user-guide/signals.md` | Wrong webhook endpoint paths |
| `architecture/signal-processing.md` | Wrong Rego paths; wrong severity levels |

### Should Fix (MEDIUM findings)

| Page | What's Wrong |
|------|-------------|
| `getting-started/installation.md` | Wrong Kubernetes version requirement |
| `getting-started/architecture-overview.md` | Service count (10 vs 11) |
| `architecture/overview.md` | Service count; missing Event Exporter |
| `architecture/workflow-selection.md` | Wrong low-confidence behavior; unclear HAPI vs DS responsibility |
| `architecture/effectiveness.md` | Missing 2 phases; no HashComputeAfter; no dual-target model |
| `user-guide/effectiveness.md` | Same phase gaps |
| `user-guide/approval.md` | Wrong field name; missing production-always-approve note |
| `user-guide/configuration.md` | Missing authwebhook, eventExporter, hooks config sections |
| `api-reference/holmesgpt-api.md` | Session endpoints not in OpenAPI |

### Nice to Fix (LOW findings)

| Page | What's Wrong |
|------|-------------|
| `architecture/audit-pipeline.md` | DataStorage not listed as audit emitter |
| `architecture/data-persistence.md` | Redis DLQ details; additional audit columns |
| `user-guide/audit-and-observability.md` | Notification retry policy not documented |

---

## Part 6: Verified Correct (No Issues)

The following claims in the docs were verified as accurate against code:

- Namespace `kubernaut-system` (default)
- Workflow execution namespace `kubernaut-workflows`
- OCI-based workflow registration via `POST /api/v1/workflows` with `schemaImage`
- Approval Rego policy (0.8 default, configurable via Helm)
- 0.7 investigation threshold (hardcoded in `response_processor.go`)
- Effectiveness timing defaults (stabilizationWindow=5m, gitOpsSyncDelay=3m, operatorReconcileDelay=1m)
- Additive propagation delays (isGitOps/isCRD flags)
- Audit event batch endpoint (`POST /api/v1/audit/events/batch`)
- Reconstruction endpoint (`POST /api/v1/audit/remediation-requests/{correlation_id}/reconstruct`)
- 2555-day audit retention
- Shared ServiceAccount for v1.0 workflow execution
- Dependency validation: Secrets and ConfigMaps only
- Deterministic PipelineRun/Job naming (DD-WE-003)
- Tekton bundle resolver (OCI)
- All 7 BlockReasons in routing engine
- Exponential backoff formula: min(base × 2^(failures-1), max)
- Cooldown defaults: ConsecutiveFailureCooldown=1h, RecentlyRemediatedCooldown=5m
- Child CRD ownership via ownerReference
- Fire-and-forget audit (DD-AUDIT-002)
- AuthWebhook mutations (RAR DecidedBy/DecidedAt, WE block clearance, RR timeout modification)
