# Kubernaut Documentation Triage Report

**Date**: 2025-03-04  
**Scope**: Getting Started docs + landing page vs. source code in `kubernaut` repo  
**Files Triaged**: index.md, installation.md, quickstart.md, architecture-overview.md, docs/index.md

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | 4     |
| MEDIUM   | 6     |
| LOW      | 3     |
| GAPS     | 5     |

---

## INCONSISTENCIES

### installation.md

#### 1. PostgreSQL Secret Username (HIGH)
- **Section**: "With Existing Secrets (Production Path)"
- **Doc claims**: `POSTGRES_USER=kubernaut`
- **Code shows**: `charts/kubernaut/values.yaml` has `postgresql.auth.username: slm_user`; `platform-helper.sh` creates secrets with `slm_user`; datastorage config template has `user: slm_user` hardcoded
- **Impact**: Production users following the doc would create a secret with `kubernaut` while the chart defaults and demo flow use `slm_user`. If they use `existingSecret` without overriding `postgresql.auth.username`, the datastorage `db-secrets.yaml` must match. The doc should either: (a) use `slm_user` for consistency with chart defaults, or (b) explicitly state that both postgresql-secret and datastorage-db-secret must use the same username (and that `kubernaut` is an example).
- **Severity**: HIGH — credential mismatch would cause connection failures

#### 2. Service Count and authwebhook Omission (MEDIUM)
- **Section**: "Verify" (pod list)
- **Doc claims**: "10 services plus infrastructure" — lists 10 service pods + postgresql-0 + redis-0
- **Code shows**: Helm templates deploy **11** application services: gateway, datastorage, remediationorchestrator, signalprocessing, aianalysis, workflowexecution, effectivenessmonitor, notification, holmesgpt-api, event-exporter, **authwebhook**
- **Impact**: authwebhook (admission controller) is deployed but not documented. Users may be surprised by an extra pod or not understand its role.
- **Severity**: MEDIUM — misleading but not blocking

#### 3. Kubernetes Version v1.34+ (MEDIUM)
- **Section**: Prerequisites table
- **Doc claims**: Kubernetes v1.34+
- **Code shows**: No explicit version check in codebase. Internal docs reference 1.25, 1.27, 1.28, 1.29. E2E uses Kind with v1.27.3. Kubernetes v1.34 exists (released ~2025) but is newer than what the project appears to test against.
- **Impact**: May exclude users on older clusters; version may be aspirational rather than validated.
- **Severity**: MEDIUM — potentially overly strict or unvalidated

---

### quickstart.md

#### 4. Kind Cluster Config Path (MEDIUM)
- **Section**: Prerequisites table, Manual Setup
- **Doc claims**: `kind create cluster --config deploy/demo/overlays/kind/kind-cluster-config.yaml`
- **Code shows**: `run.sh` uses `deploy/demo/scenarios/kind-config-singlenode.yaml` via `ensure_kind_cluster "${SCRIPT_DIR}/../kind-config-singlenode.yaml"`
- **Impact**: Two valid configs exist: `overlays/kind/kind-cluster-config.yaml` (control-plane + worker) and `scenarios/kind-config-singlenode.yaml` (single-node). The crashloop demo uses singlenode. Manual setup doc should align with what the automated run.sh uses, or clarify when to use each.
- **Severity**: MEDIUM — different configs may cause confusion

#### 5. kubectl Watch Command Resource Name (LOW)
- **Section**: Step 5 "Wait for Alert and Pipeline"
- **Doc claims**: `kubectl get remediationrequests,signalprocessing,aianalysis,workflowexecution,effectivenessassessment`
- **Code shows**: CRD resources are plural: `remediationrequests`, `signalprocessings`, `aianalyses`, `workflowexecutions`, `effectivenessassessments`. The doc uses `effectivenessassessment` (singular) — should be `effectivenessassessments`.
- **Impact**: `kubectl get effectivenessassessment` may fail; correct form is `effectivenessassessments`.
- **Severity**: LOW — quick fix

#### 6. Deployment YAML — resources and probes (LOW)
- **Section**: Step 1 "Deploy the Healthy Workload" (inline deployment YAML)
- **Doc claims**: Deployment without `resources` or `initialDelaySeconds`/`periodSeconds` on probes
- **Code shows**: `deploy/demo/scenarios/crashloop/manifests/deployment.yaml` includes `resources`, `initialDelaySeconds`, and `periodSeconds` on liveness/readiness probes
- **Impact**: Doc is a simplified example; actual manifests are more complete. Not wrong, but slightly inconsistent.
- **Severity**: LOW — doc is illustrative

---

### architecture-overview.md

#### 7. CRD API Groups (HIGH)
- **Section**: "Custom Resources" table
- **Doc claims**: API groups like `remediation.kubernaut.io`, `signalprocessing.kubernaut.io`, `aianalysis.kubernaut.io`, etc.
- **Code shows**: All CRDs use **`kubernaut.ai`** (single API group). See `api/*/v1alpha1/groupversion_info.go` and CRD files `kubernaut.ai_*.yaml`.
- **Impact**: Users running `kubectl get remediationrequests.remediation.kubernaut.io` would fail. Correct: `remediationrequests.kubernaut.ai`.
- **Severity**: HIGH — factually wrong

#### 8. Remediation Lifecycle — Missing Phases (MEDIUM)
- **Section**: "Remediation Lifecycle" state diagram
- **Doc claims**: Phases Pending → Processing → Analyzing → AwaitingApproval/Executing → Completed/Failed/Rejected
- **Code shows**: `RemediationPhase` in `api/remediation/v1alpha1/remediationrequest_types.go` includes additional phases: **Blocked**, **TimedOut**, **Skipped**, **Cancelled**
- **Impact**: Diagram omits important states (Blocked, TimedOut, Skipped, Cancelled) that users will see in production.
- **Severity**: MEDIUM — incomplete

---

### docs/index.md (Landing Page)

#### 9. "10-service" Architecture (MEDIUM)
- **Section**: Architecture card, "How It Works"
- **Doc claims**: "10-service microservices architecture"
- **Code shows**: 11 application services (including authwebhook) + event-exporter
- **Severity**: MEDIUM — same as #2

---

## GAPS (Code Does This, Docs Don't Mention)

### GAP 1: AuthWebhook Service
- **What**: Admission webhook for RemediationRequest/RemediationApprovalRequest validation and mutation
- **Where**: `charts/kubernaut/templates/authwebhook/`, `cmd/authwebhook/`
- **Impact**: Users don't know this component exists or what it does

### GAP 2: kubernaut-workflows Namespace
- **What**: Dedicated namespace for workflow execution (Tekton Pipelines, Jobs)
- **Where**: `charts/kubernaut/templates/workflowexecution/workflowexecution.yaml`, `dependency-reader-rbac.yaml`
- **Impact**: Operators may not know to create or label this namespace

### GAP 3: Blocked Phase and BlockReason
- **What**: RemediationRequest can be in `Blocked` phase with reasons (ResourceBusy, RecentlyRemediated, DuplicateInProgress, etc.)
- **Where**: `api/remediation/v1alpha1/remediationrequest_types.go`
- **Impact**: Users seeing "Blocked" won't find it explained in lifecycle docs

### GAP 4: Helm Chart — Development vs. Published Repo
- **What**: Quickstart Manual Setup uses `helm install kubernaut charts/kubernaut` (local chart). Installation doc uses `helm repo add kubernaut https://jordigilh.github.io/kubernaut` (remote).
- **Where**: installation.md vs. quickstart.md
- **Impact**: Two different install paths; relationship between "development" and "published" chart could be clearer

### GAP 5: run.sh Alert Timing Discrepancy
- **What**: run.sh comment says "The KubePodCrashLooping alert fires after >3 restarts in 10 min" but prometheus-rule uses `[3m]` window
- **Where**: `deploy/demo/scenarios/crashloop/run.sh` line 65 vs. `manifests/prometheus-rule.yaml`
- **Impact**: Minor — run.sh comment is stale (should say 3m)

---

## VERIFIED CORRECT

- **Namespace**: `kubernaut-system` — matches code
- **Demo namespace**: `demo-crashloop` — matches
- **Workflow ID**: `crashloop-rollback-v1` — matches `workflow-schema.yaml`
- **inject-bad-config.sh**: Exists and matches doc description
- **PrometheusRule**: `KubePodCrashLooping` alert, `release: prometheus` — kube-prometheus-stack-values uses `ruleSelector: {}` so all rules are selected
- **Label**: `kubernaut.ai/managed=true` — used throughout
- **PostgreSQL database name**: `action_history` — correct
- **Redis**: Used for DataStorage DLQ — correct
- **Service names**: gateway-service, data-storage-service — match templates

---

## RECOMMENDATIONS

1. **HIGH**: Fix CRD API groups in architecture-overview.md to `kubernaut.ai` for all CRDs.
2. **HIGH**: Align installation.md PostgreSQL secret example with chart defaults (`slm_user`) or document the requirement that both secrets must match.
3. **MEDIUM**: Add authwebhook to the service list and document its role.
4. **MEDIUM**: Update service count to 11 (or clarify that "10" excludes authwebhook/event-exporter if intentional).
5. **MEDIUM**: Add Blocked, TimedOut, Skipped, Cancelled to the remediation lifecycle diagram.
6. **MEDIUM**: Align Kind config path in quickstart with run.sh or document both options.
7. **LOW**: Fix `effectivenessassessment` → `effectivenessassessments` in quickstart kubectl command.
8. **LOW**: Consider validating or relaxing Kubernetes version (e.g., 1.27+ to match E2E).
