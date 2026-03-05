# Kubernaut Documentation Triage Report

**Date**: March 4, 2026
**Scope**: v1.0 authoritative documents only
**Methodology**: Compare existing internal docs against current codebase; newer artifact = authority in case of conflict

---

## Executive Summary

The triage identified **60+ inconsistencies** across 6 categories. The most severe pattern is that several architecture and service documents describe an **earlier design** (pre-ADR-025, pre-DD-GATEWAY-012, pre-ADR-EM-001) while the code has evolved significantly. Key themes:

1. **Deprecated services still documented as active** (Context API, KubernetesExecutor)
2. **CRD schemas in docs don't match actual type definitions** (6 HIGH-severity field mismatches)
3. **EffectivenessMonitor architecture fundamentally changed** (stateless HTTP → CRD controller)
4. **Gateway Redis dependency removed** but docs still describe it
5. **Naming drift** ("RemediationProcessing" → "SignalProcessing", "RemediationExecution" → "WorkflowExecution")
6. **Configuration docs outdated** (CONFIG_STANDARDS.md is from Dec 2025)

---

## Age Reference Table (Key Files)

| File | Last Modified | Role |
|------|---------------|------|
| `api/notification/v1alpha1/notificationrequest_types.go` | 2026-03-04 | **CODE** (newest) |
| `api/effectivenessassessment/v1alpha1/effectivenessassessment_types.go` | 2026-03-03 | CODE |
| `charts/kubernaut/values.yaml` | 2026-03-03 | CODE |
| `cmd/notification/main.go` | 2026-03-03 | CODE |
| `cmd/remediationorchestrator/main.go` | 2026-03-03 | CODE |
| `cmd/signalprocessing/main.go` | 2026-03-02 | CODE |
| `cmd/workflowexecution/main.go` | 2026-03-02 | CODE |
| `cmd/datastorage/main.go` | 2026-03-01 | CODE |
| `api/remediation/v1alpha1/remediationrequest_types.go` | 2026-02-28 | CODE |
| `api/signalprocessing/v1alpha1/signalprocessing_types.go` | 2026-02-28 | CODE |
| `api/aianalysis/v1alpha1/aianalysis_types.go` | 2026-02-28 | CODE |
| `README.md` | 2026-02-28 | DOC |
| `api/workflowexecution/v1alpha1/workflowexecution_types.go` | 2026-02-25 | CODE |
| `docs/architecture/CRD_SCHEMAS.md` | 2026-02-25 | DOC (stale) |
| `docs/architecture/SERVICE_DEPENDENCY_MAP.md` | 2026-02-24 | DOC (stale) |
| `docs/architecture/KUBERNAUT_CRD_ARCHITECTURE.md` | 2026-02-23 | DOC (stale) |
| `docs/services/crd-controllers/README.md` | 2026-02-15 | DOC (stale) |
| `docs/architecture/APPROVED_MICROSERVICES_ARCHITECTURE.md` | 2026-02-11 | DOC (stale) |
| `docs/configuration/CONFIG_STANDARDS.md` | 2025-12-29 | DOC (very stale) |
| `docs/services/stateless/README.md` | 2025-10-13 | DOC (very stale) |

**Authority rule**: Code files (Feb-Mar 2026) supersede docs from Jan 2026 or earlier in all cases.

---

## Category 1: README Inconsistencies

| # | Severity | What | Authority | Recommendation |
|---|----------|------|-----------|----------------|
| R-1 | HIGH | Links to `docs/demo/README.md` but actual file is `deploy/demo/README.md` | Code (path exists) | Fix link |
| R-2 | HIGH | Links to `deploy/notification/README.md` which doesn't exist | Code | Remove link or create file |
| R-3 | HIGH | HolmesGPT API listed as stateless service under `cmd/` pattern but it's Python in `holmesgpt-api/` | Code | Clarify in docs that HAPI is a separate Python service |
| R-4 | HIGH | `make build-all` doesn't build HolmesGPT API (Go-only) | Code (Makefile) | Document `make build-holmesgpt-api` separately |
| R-5 | MEDIUM | Service count: README says "6 CRD + 4 stateless"; APPROVED_MICROSERVICES_ARCHITECTURE.md says "5 CRD + 5 stateless" | Code: 6 CRD + 4 stateless | Fix architecture doc to match |
| R-6 | MEDIUM | CRDs not listed in README (7 kinds exist) | Code | Add CRD reference section |
| R-7 | MEDIUM | Deployment table omits EffectivenessMonitor and RemediationOrchestrator | Code | Complete the table |
| R-8 | LOW | Go badge says "1.25.3"; go.mod says "1.25" + toolchain "1.25.3" | Minor | Use "Go 1.25+" |

---

## Category 2: Architecture & CRD Schema Inconsistencies

### 2a. Service Topology

| # | Severity | What | Doc File | Code Evidence | Authority |
|---|----------|------|----------|---------------|-----------|
| A-1 | HIGH | Context API documented as active service | SERVICE_DEPENDENCY_MAP.md (Feb 24) | No `cmd/context-api`; DD-CONTEXT-006 deprecates it | Code (newer) |
| A-2 | HIGH | KubernetesExecutor documented in deployment order | SERVICE_DEPENDENCY_MAP.md | No `cmd/kubernetesexecutor`; ADR-025 deprecates | Code (newer) |
| A-3 | MEDIUM | AuthWebhook not documented in architecture docs | SERVICE_DEPENDENCY_MAP.md | `cmd/authwebhook/main.go` exists (Feb 17) | Code (missing from docs) |
| A-4 | MEDIUM | "RemediationExecution" naming used throughout | KUBERNAUT_CRD_ARCHITECTURE.md | CRD kind is `WorkflowExecution` | Code (newer) |
| A-5 | HIGH | EffectivenessAssessment CRD missing from CRD architecture doc | KUBERNAUT_CRD_ARCHITECTURE.md | `api/effectivenessassessment/` exists (Mar 3) | Code (newer) |

### 2b. CRD Field Mismatches (Code is authoritative in ALL cases)

| # | Severity | CRD | Doc Says | Code Says | Doc File |
|---|----------|-----|----------|-----------|----------|
| C-1 | HIGH | RemediationRequest Spec | `environment`, `priority`, `namespace`, `resource` | `TargetResource`; environment/priority REMOVED per schema update | KUBERNAUT_CRD_ARCHITECTURE.md, CRD_SCHEMAS.md |
| C-2 | HIGH | RemediationRequest Status | Refs as strings | `*corev1.ObjectReference` + `RemediationProcessingRef` | KUBERNAUT_CRD_ARCHITECTURE.md |
| C-3 | HIGH | SignalProcessing Spec | `alertData`, `isRecoveryAttempt`, `failedRemediationRef` | `Signal`, `RemediationRequestRef`, `EnrichmentConfig` | KUBERNAUT_CRD_ARCHITECTURE.md |
| C-4 | HIGH | AIAnalysis Spec | `enrichmentData` with `kubernetesContext`, `environment` | `AnalysisRequest` with `SignalContext`, `AnalysisTypes` | KUBERNAUT_CRD_ARCHITECTURE.md |
| C-5 | HIGH | WorkflowExecution Spec | `workflowType`, `reason`, `steps` | `WorkflowRef`, `TargetResource`, `Parameters`, `ExecutionEngine` | KUBERNAUT_CRD_ARCHITECTURE.md |
| C-6 | MEDIUM | NotificationRequest Spec | `notificationType`, `channels`, `content` | `Type`, `Priority`, `Recipients`, `Subject`, `Body`, `Metadata` | KUBERNAUT_CRD_ARCHITECTURE.md |
| C-7 | MEDIUM | AIAnalysis Phases | Pending, Investigating, Analyzing, Approving, Ready, Failed, Rejected | Pending, Investigating, Analyzing, Completed, Failed | KUBERNAUT_CRD_ARCHITECTURE.md |
| C-8 | LOW | WorkflowExecution Phases | "Executing" | "Running" | KUBERNAUT_CRD_ARCHITECTURE.md |
| C-9 | LOW | SignalProcessing Phases | Missing "Categorizing" | Includes `PhaseCategorizing` | KUBERNAUT_CRD_ARCHITECTURE.md |
| C-10 | LOW | API Group | `.ai` domain | `.io` domain | CRD_SCHEMAS.md |
| C-11 | MEDIUM | RR TimeoutConfig | In spec | In status | CRD_SCHEMAS.md |
| C-12 | LOW | RR ProviderData | `json.RawMessage` | `string` | CRD_SCHEMAS.md |

---

## Category 3: Service-Level Documentation Inconsistencies

| # | Severity | Service | What | Doc File | Code Evidence |
|---|----------|---------|------|----------|---------------|
| S-1 | HIGH | Gateway | Redis described as dedup backend | gateway-service/overview.md | Redis removed per DD-GATEWAY-012; CRD Status used instead |
| S-2 | HIGH | EffectivenessMonitor | Described as stateless HTTP API (`GET /api/v1/assess/effectiveness/:actionID`) | effectiveness-monitor/overview.md | CRD controller watching EffectivenessAssessment (Mar 3 code) |
| S-3 | HIGH | EffectivenessMonitor | Triggered by Context API HTTP call | effectiveness-monitor/overview.md | RO creates EffectivenessAssessment CRD on terminal phases |
| S-4 | HIGH | Notification | Upstream calls HTTP `POST /api/v1/notify/escalation` | notification/integration-points.md | CRD-based: RO creates NotificationRequest CRD |
| S-5 | HIGH | RemediationOrchestrator | Creates "RemediationProcessing" | remediationorchestrator/overview.md | Creates `SignalProcessing` |
| S-6 | HIGH | RemediationOrchestrator | No mention of EffectivenessAssessment creation | remediationorchestrator/overview.md | Creates EA on terminal phases (ADR-EM-001) |
| S-7 | MEDIUM | RemediationOrchestrator | No mention of RAR audit controller | remediationorchestrator/overview.md | `RARReconciler` exists in `main.go` |
| S-8 | MEDIUM | Notification | Lists Email, Teams, SMS, PagerDuty channels | notification/integration-points.md | Actual: Console, File, Log, Slack |
| S-9 | MEDIUM | EffectivenessMonitor | Describes hybrid AI analysis with HolmesGPT | effectiveness-monitor/overview.md | Uses Prometheus/AlertManager only; no HolmesGPT |
| S-10 | MEDIUM | Gateway | Ports 8080 (API), 8081 (health), 9090 (metrics) | gateway-service/overview.md | Single `ListenAddr` (default `:8080`) |
| S-11 | MEDIUM | AuthWebhook | Lists 3 handlers | DD-WEBHOOK-001 | Actual: 4 handlers (includes /mutate-remediationrequest) |
| S-12 | LOW | SignalProcessing | "RemediationProcessing" naming in some docs | Various | CRD is `SignalProcessing` |
| S-13 | LOW | AIAnalysis | "RemediationProcessing" as upstream name | aianalysis/integration-points.md | Upstream is `SignalProcessing` |

### Services with NO or Minimal Documentation

| Service | Gap |
|---------|-----|
| WorkflowExecution | No dedicated overview in `docs/services/` |
| DataStorage | No high-level overview (only DD-STORAGE-008 and integration-points) |
| AuthWebhook | No dedicated `docs/services/` directory |

---

## Category 4: Configuration Inconsistencies

| # | Severity | What | Doc File | Code Evidence |
|---|----------|------|----------|---------------|
| CF-1 | HIGH | Gateway requires Redis (crash-if-missing: yes) | CONFIG_STANDARDS.md (Dec 2025) | Redis removed per DD-GATEWAY-012 (Feb 2026 code) |
| CF-2 | HIGH | Gateway config has `redis`, `storm_detection` | CONFIG_STANDARDS.md | Not in actual config or Helm template |
| CF-3 | MEDIUM | Field naming: `listen_addr` (snake_case) | CONFIG_STANDARDS.md | Actual: `listenAddr` (camelCase) per CRD_FIELD_NAMING_CONVENTION |
| CF-4 | MEDIUM | ConfigMap names differ (e.g. `notification-config` vs `notification-controller-config`) | CONFIG_STANDARDS.md | Helm templates use different names |
| CF-5 | MEDIUM | Confidence threshold: 0.7 in response_processor.go vs 0.8 in Rego | CONFIG_STANDARDS.md | Two different defaults in code |
| CF-6 | MEDIUM | HolmesGPT config: `api_key`, `timeout` | CONFIG_STANDARDS.md | Actual: `llm.provider`, `llm.model`, `llm.endpoint`, `llm.maxRetries`, etc. |
| CF-7 | MEDIUM | values.yaml params not documented: `remediationorchestrator.config.asyncPropagation.*`, `notification.slack.*`, `aianalysis.rego.confidenceThreshold` | Missing | Exist in values.yaml (Mar 3) |
| CF-8 | MEDIUM | Most ConfigMap content hardcoded in templates, not wired to values.yaml | N/A | Gateway, DataStorage, EffectivenessMonitor, SignalProcessing, WorkflowExecution, AuthWebhook all hardcoded |
| CF-9 | LOW | DB user: docs say `kubernaut`; actual `slm_user`. DB name: docs say `kubernaut`; actual `action_history` | CONFIG_STANDARDS.md | Helm template values |

---

## Category 5: ADR/DD Issues (v1.0 Scope)

### Superseded (documented but decision reversed)

| ADR/DD | Title | Superseded By | Action |
|--------|-------|---------------|--------|
| DD-WORKFLOW-005 | Automated Schema Extraction | DD-WORKFLOW-017 | Mark in docs index |
| DD-WORKFLOW-007 | Manual Workflow Registration | DD-WORKFLOW-017 | Mark in docs index |
| DD-WORKFLOW-002 | MCP Workflow Catalog Architecture | DD-WORKFLOW-016 | Mark in docs index |
| DD-GATEWAY-007 | Fallback Namespace Strategy | ADR-053 | README index still says "Approved" |
| DD-EFFECTIVENESS-003 | Watch RR Instead of WE | ADR-EM-001 / EA CRD | README index still says "V1.0 (applies to Level 1)" |
| DD-WE-005 | Workflow Scoped RBAC | Scenario 3 | Mark in docs index |

### Drift (ADR says X, code does Y)

| ADR/DD | Issue | Evidence |
|--------|-------|----------|
| DD-INFRA-001 / DD-AUTH-011 | Namespace: ADR says `kubernaut-system` per #229 | Code: `deploy/notification/` uses `kubernaut-notifications`; `router.go` has `DefaultConfigMapNamespace = "kubernaut-notifications"` |
| DD-TEST-001 | Immudb references remain | `datastorage_e2e_suite_test.go.tf` lines 47, 151 mention Immudb; DD-TEST-001 v2.6 removed it |

### Naming Collision

| Issue | Evidence |
|-------|----------|
| DD-017 number collision | Two different DDs share "DD-017": (1) Effectiveness Monitor v1.1 deferral, (2) K8s Enrichment Depth Strategy. References are ambiguous. |

---

## Category 6: Cross-Cutting Naming Inconsistencies

These naming issues appear across multiple documents and should be resolved globally:

| Old Name | Current Name | Occurrences |
|----------|-------------|-------------|
| RemediationProcessing | SignalProcessing | SERVICE_DEPENDENCY_MAP, RO overview, AI integration-points, various |
| RemediationExecution | WorkflowExecution | KUBERNAUT_CRD_ARCHITECTURE (dozens of references) |
| Context API | (deprecated, merged into DataStorage) | SERVICE_DEPENDENCY_MAP, EM overview, various |
| KubernetesExecutor | (deprecated per ADR-025) | SERVICE_DEPENDENCY_MAP, CRD controllers README, notification integration-points |
| Notification Service (stateless HTTP) | Notification Controller (CRD) | stateless/README.md, notification integration-points |

---

## Follow-Up Questions

Before proceeding with the kubernaut-docs site, I'd like to clarify:

1. **Confidence threshold discrepancy**: `response_processor.go` uses 0.7 as default; `approval.rego` uses 0.8. Which is the v1.0 authoritative value? (Code is newer but they're in different layers -- Go code vs Rego policy.)

2. **Notification namespace**: Code still uses `kubernaut-notifications` in several places despite ADR-057 / issue #229 deciding on `kubernaut-system`. Is the migration incomplete, or was the decision reversed?

3. **EffectivenessMonitor classification**: README says "CRD controller" (correct per code). The architecture doc says "stateless service". For the public docs, should I document it as a CRD controller?

4. **AuthWebhook**: Should the public docs describe this as a distinct service, or is it considered internal infrastructure that doesn't need a user-facing page?

5. **HolmesGPT API session-based async flow**: The current docs reference synchronous endpoints (`POST /api/v1/incident/analyze`). The code appears to use a session-based async pattern (BR-AA-HAPI-064). Which model should the public docs describe?

6. **Should any of these inconsistencies be filed as separate GitHub issues** for tracking fixes to the internal docs in the main repo, or is the plan to only fix them in the new public-facing docs site?
