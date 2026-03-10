# Custom Resources (CRDs)

Kubernaut defines 9 Custom Resource types under the `kubernaut.ai` API group. All CRD specs are **immutable after creation** (ADR-001).

!!! note "Authoritative Source"
    The Go type definitions in [`api/`](https://github.com/jordigilh/kubernaut/tree/main/api) and the generated CRD manifests in `config/crd/bases/` are the authoritative reference. This page documents the key fields; see the CRD YAML for the complete schema including all nested types and validation constraints.

---

## RemediationRequest

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Gateway
**Watched by**: Remediation Orchestrator

The root CRD for every remediation lifecycle. All other CRDs are children of a RemediationRequest.

### Spec

| Field | Type | Description |
|---|---|---|
| `targetResource` | `ResourceIdentifier` | Target Kubernetes resource (`kind`, `name`, `namespace`) |
| `signalName` | `string` | Alert name (e.g., `KubePodCrashLooping`). Max 253 chars |
| `signalFingerprint` | `string` | SHA256 fingerprint for deduplication. 64-char hex, immutable |
| `signalType` | `string` | Always `alert` (adapter-specific values are deprecated) |
| `signalSource` | `string` | Source adapter (e.g., `prometheus-adapter`, `k8s-event-adapter`) |
| `severity` | `string` | External severity from signal provider (normalized by SP via Rego) |
| `targetType` | `string` | Target system type. Enum: `kubernetes`, `aws`, `azure`, `gcp`, `datadog` |
| `firingTime` | `*Time` | When the signal first fired |
| `receivedTime` | `Time` | When the Gateway received the signal |
| `signalLabels` | `map[string]string` | Signal labels extracted from provider data |
| `signalAnnotations` | `map[string]string` | Signal annotations extracted from provider data |
| `providerData` | `string` | Raw provider-specific fields (JSON string) |
| `originalPayload` | `string` | Complete original webhook payload (for audit/debug) |
| `deduplication` | `DeduplicationInfo` | Deprecated (DD-GATEWAY-011): moved to `status.deduplication` |

### Status

| Field | Type | Description |
|---|---|---|
| `overallPhase` | `RemediationPhase` | Current lifecycle phase (see Phases below) |
| `message` | `string` | Human-readable status description |
| `outcome` | `string` | Result when completed. Enum: `Remediated`, `NoActionRequired`, `ManualReviewRequired`, `VerificationTimedOut` |
| `startTime` | `*Time` | When remediation started |
| `completedAt` | `*Time` | When the remediation completed |
| `retentionExpiryTime` | `*Time` | When the CRD should be cleaned up. Not enforced in v1.0 ([#265](https://github.com/jordigilh/kubernaut/issues/265)) |
| **Child CRD References** | | |
| `signalProcessingRef` | `*ObjectReference` | Reference to child SignalProcessing CRD |
| `aiAnalysisRef` | `*ObjectReference` | Reference to child AIAnalysis CRD |
| `workflowExecutionRef` | `*ObjectReference` | Reference to child WorkflowExecution CRD |
| `effectivenessAssessmentRef` | `*ObjectReference` | Reference to child EffectivenessAssessment CRD |
| `notificationRequestRefs` | `[]ObjectReference` | References to all notification CRDs created for this remediation |
| **Blocked Phase Tracking** | | |
| `blockReason` | `string` | Why the RR is blocked. Values: `ConsecutiveFailures`, `ResourceBusy`, `RecentlyRemediated`, `ExponentialBackoff`, `DuplicateInProgress`, `UnmanagedResource`, `IneffectiveChain` |
| `blockMessage` | `string` | Human-readable block description |
| `blockedUntil` | `*Time` | When time-based block expires (nil for event-based blocks) |
| `blockingWorkflowExecution` | `string` | WFE causing the block (for `ResourceBusy`, `RecentlyRemediated`, `ExponentialBackoff`) |
| **Duplicate Tracking** | | |
| `duplicateOf` | `string` | Parent RR name when this is a duplicate |
| `duplicateCount` | `int` | Number of duplicate RRs skipped for this RR |
| `duplicateRefs` | `[]string` | Names of skipped duplicate RRs |
| **Failure / Timeout Tracking** | | |
| `failurePhase` | `*string` | Which phase failed (e.g., `ai_analysis`, `workflow_execution`) |
| `failureReason` | `*string` | Human-readable failure reason |
| `timeoutPhase` | `*string` | Which phase timed out |
| `timeoutTime` | `*Time` | When timeout occurred |
| `requiresManualReview` | `bool` | Requires operator intervention (exhausted retries, execution failure, low confidence) |
| **Exponential Backoff** | | |
| `consecutiveFailureCount` | `int32` | How many times this fingerprint has failed consecutively |
| `nextAllowedExecution` | `*Time` | When retry is allowed after backoff (1m, 2m, 4m, 8m, cap 10m) |
| **Skip Tracking** | | |
| `skipReason` | `string` | Why remediation was skipped. Values: `ResourceBusy`, `RecentlyRemediated`, `ExponentialBackoff`, `ExhaustedRetries`, `PreviousExecutionFailed` |
| `skipMessage` | `string` | Human-readable skip details |
| **Operational** | | |
| `deduplication` | `*DeduplicationStatus` | Signal deduplication tracking (owned by Gateway) |
| `preRemediationSpecHash` | `string` | Spec hash before remediation (immutable once set, used by EM for drift detection) |
| `notificationStatus` | `string` | Notification lifecycle. Enum: `Pending`, `InProgress`, `Sent`, `Failed`, `Cancelled` |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

!!! note
    See `config/crd/bases/kubernaut.ai_remediationrequests.yaml` for additional fields including per-phase start times (`processingStartTime`, `analyzingStartTime`, `executingStartTime`), timeout configuration, and audit attribution (`lastModifiedBy`, `lastModifiedAt`).

### Phases

`Pending` → `Processing` → `Analyzing` → `AwaitingApproval` → `Executing` → `Verifying` → `Completed` / `Failed` / `Blocked` / `TimedOut` / `Skipped` / `Cancelled`

---

## RemediationApprovalRequest

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Remediation Orchestrator (RAR audit controller)

Created when AI analysis confidence is below the auto-approve threshold (typically 0.6–0.79) or when Rego policy requires human approval.

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `ObjectReference` | Reference to parent RemediationRequest (owner) |
| `aiAnalysisRef` | `ObjectRef` | Lightweight reference to the AIAnalysis (name only) |
| `confidence` | `float64` | AI confidence score (0.0–1.0) |
| `confidenceLevel` | `string` | Derived level. Enum: `low`, `medium`, `high` |
| `reason` | `string` | Why approval is required |
| `recommendedWorkflow` | `RecommendedWorkflowSummary` | Workflow ID, version, OCI bundle, rationale |
| `investigationSummary` | `string` | Investigation summary from HolmesGPT |
| `evidenceCollected` | `[]string` | Evidence gathered during investigation |
| `recommendedActions` | `[]ApprovalRecommendedAction` | Recommended actions with rationale |
| `alternativesConsidered` | `[]ApprovalAlternative` | Alternative approaches with pros/cons |
| `whyApprovalRequired` | `string` | Detailed explanation |
| `policyEvaluation` | `*ApprovalPolicyEvaluation` | Rego policy evaluation results (policyName, matchedRules, decision) |
| `requiredBy` | `Time` | Approval deadline (default: 15m, configurable per hierarchy) |

### Status

| Field | Type | Description |
|---|---|---|
| `decision` | `ApprovalDecision` | `Approved`, `Rejected`, `Expired`, or empty (pending) |
| `decidedBy` | `string` | Operator identity or `system` (for timeout) |
| `decidedAt` | `*Time` | When the decision was made |
| `decisionMessage` | `string` | Optional message from decision maker |
| `expired` | `bool` | Whether the request has expired |
| `timeRemaining` | `string` | Human-readable time until expiration |
| `conditions` | `[]Condition` | Standard Kubernetes conditions (`Approved`, `Rejected`, `Expired`) |

---

## SignalProcessing

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Signal Processing

Enriches, classifies, and categorizes the incoming signal using Rego policies and Kubernetes context.

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `ObjectReference` | Reference to parent RemediationRequest |
| `signal` | `SignalData` | Signal data copied from RR for self-contained processing (fingerprint, name, severity, type, source, targetType, targetResource, labels, annotations, firingTime, receivedTime, providerData) |
| `enrichmentConfig` | `EnrichmentConfig` | Enrichment toggles: `enableClusterState`, `enableMetrics`, `enableHistorical`, `timeout` |

### Status

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current processing phase |
| `startTime` | `*Time` | When processing started |
| `completionTime` | `*Time` | When processing completed |
| `kubernetesContext` | `*KubernetesContext` | Enrichment results (owner chain, namespace context, resource state) |
| `environmentClassification` | `*EnvironmentClassification` | Environment tier (production, staging, development) |
| `priorityAssignment` | `*PriorityAssignment` | Business priority (P0, P1, P2, P3) based on Rego policy or severity-based fallback |
| `businessClassification` | `*BusinessClassification` | Organization-specific classification |
| `severity` | `string` | Normalized severity from Rego policy. Enum: `critical`, `high`, `medium`, `low`, `unknown` |
| `signalMode` | `string` | Signal mode. Enum: `reactive`, `proactive` |
| `signalName` | `string` | Normalized signal name for downstream consumers |
| `policyHash` | `string` | SHA256 of the Rego policy used for severity determination |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

### Phases

`Pending` → `Enriching` → `Classifying` → `Categorizing` → `Completed` / `Failed`

---

## AIAnalysis

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: AI Analysis

Manages the async HolmesGPT investigation session, root cause analysis, workflow selection, and approval determination.

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `ObjectReference` | Reference to parent RemediationRequest |
| `remediationID` | `string` | Unique remediation identifier (JSON: `remediationId`) |
| `analysisRequest` | `AnalysisRequest` | Analysis configuration containing `signalContext` (fingerprint, severity, signalName, signalMode, environment, businessPriority, targetResource, enrichmentResults) and `analysisTypes` |
| `timeoutConfig` | `*AIAnalysisTimeoutConfig` | Optional: `investigatingTimeout` (default 60s), `analyzingTimeout` (default 5s) |

### Status

**Lifecycle**:

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current analysis phase |
| `message` | `string` | Phase message |
| `reason` | `string` | Failure category |
| `subReason` | `string` | Failure sub-category. Enum: `WorkflowNotFound`, `ImageMismatch`, `ParameterValidationFailed`, `NoMatchingWorkflows`, `LowConfidence`, `LLMParsingError`, `ValidationError`, `TransientError`, `PermanentError`, `InvestigationInconclusive`, `ProblemResolved`, `MaxRetriesExceeded`, `SessionRegenerationExceeded` |
| `startedAt` | `*Time` | When analysis started |
| `completedAt` | `*Time` | When analysis completed |
| `totalAnalysisTime` | `int64` | Total duration in seconds |
| `degradedMode` | `bool` | Analysis ran with degraded capabilities |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

**Analysis Results**:

| Field | Type | Description |
|---|---|---|
| `rootCause` | `string` | Identified root cause summary |
| `rootCauseAnalysis` | `*RootCauseAnalysis` | Detailed RCA (summary, severity, contributingFactors, affectedResource) |
| `selectedWorkflow` | `*SelectedWorkflow` | Recommended workflow for remediation |
| `alternativeWorkflows` | `[]AlternativeWorkflow` | Other candidate workflows considered |
| `postRCAContext` | `*PostRCAContext` | Post-RCA resource context including `detectedLabels` (snake_case keys) |
| `investigationId` | `string` | HolmesGPT investigation ID |
| `investigationTime` | `int64` | Investigation duration in seconds |
| `warnings` | `[]string` | Non-fatal HolmesGPT warnings |

**Session Tracking**:

| Field | Type | Description |
|---|---|---|
| `investigationSession` | `InvestigationSession` | HolmesGPT async session state: `id` (session ID), `generation` (regeneration counter), `pollCount` (poll attempts), `lastPolled`, `createdAt` |

**Approval & Human Review**:

| Field | Type | Description |
|---|---|---|
| `approvalRequired` | `bool` | Whether human approval is needed |
| `approvalReason` | `string` | Why approval is required |
| `approvalContext` | `*ApprovalContext` | Rich approval context (reason, confidence, evidence) |
| `needsHumanReview` | `bool` | Whether the case requires human review |
| `humanReviewReason` | `string` | Reason for human review escalation |

!!! note
    See `config/crd/bases/kubernaut.ai_aianalyses.yaml` for the complete schema including `validationAttemptsHistory` (HAPI retry history) and `consecutiveFailures` (backoff counter).

### Phases

`Pending` → `Investigating` → `Analyzing` → `Completed` / `Failed`

---

## WorkflowExecution

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Workflow Execution

Creates and monitors a Tekton PipelineRun, Kubernetes Job, or Ansible AWX job in the `kubernaut-workflows` namespace.

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `ObjectReference` | Reference to parent RemediationRequest |
| `workflowRef` | `WorkflowRef` | Workflow catalog reference: `workflowId`, `version`, `executionBundle` (OCI), `executionBundleDigest`, `engineConfig` (engine-specific JSON, e.g. AWX `jobTemplateName`, `inventoryName`) |
| `targetResource` | `string` | Target resource string (`namespace/kind/name`) for resource locking |
| `parameters` | `map[string]string` | Runtime parameters (UPPER_SNAKE_CASE keys). `TARGET_RESOURCE` is always injected as a built-in |
| `confidence` | `float64` | LLM confidence score (audit trail) |
| `rationale` | `string` | LLM rationale (audit trail) |
| `executionEngine` | `string` | `tekton` (default), `job`, or `ansible` |
| `executionConfig` | `*ExecutionConfig` | Optional: `timeout`, `serviceAccountName` (default: `kubernaut-workflow-runner`) |

### Status

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current execution phase |
| `executionRef` | `*LocalObjectReference` | Reference to the underlying PipelineRun or Job |
| `startTime` | `*Time` | When execution started |
| `completionTime` | `*Time` | When execution completed |
| `duration` | `string` | Execution duration |
| `executionStatus` | `*ExecutionStatusSummary` | Key execution resource status fields |
| `failureReason` | `string` | Deprecated: use `failureDetails` |
| `failureDetails` | `*FailureDetails` | Structured failure info: `failedTaskName`, `failedStepName`, `reason` (enum: `OOMKilled`, `DeadlineExceeded`, `Forbidden`, `ResourceExhausted`, `ConfigurationError`, `ImagePullBackOff`, `TaskFailed`, `Unknown`), `exitCode`, `naturalLanguageSummary` |
| `blockClearance` | `*BlockClearanceDetails` | SOC2 audit trail for block clearance: `clearedAt`, `clearedBy`, `clearReason`, `clearMethod` |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

### Phases

`Pending` → `Running` → `Completed` / `Failed`

---

## NotificationRequest

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Notification

Channel selection is driven entirely by config-based routing rules (Alertmanager-style, from ConfigMap `notification-routing-config`), matching on spec attributes like `type`, `severity`, `phase`, and `metadata`.

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `*ObjectReference` | Reference to parent RR (optional — can be standalone) |
| `type` | `NotificationType` | Notification type. Enum: `escalation`, `simple`, `status-update`, `approval`, `manual-review`, `completion` |
| `priority` | `string` | Priority. Enum: `critical`, `high`, `medium` (default), `low` |
| `subject` | `string` | Notification subject (max 500 chars) |
| `body` | `string` | Notification body |
| `severity` | `string` | Severity from originating signal (used as routing attribute) |
| `phase` | `string` | Phase that triggered this notification (used as routing attribute) |
| `reviewSource` | `string` | What triggered manual review (used as routing attribute) |
| `metadata` | `map[string]string` | Context key-value pairs (e.g., `environment`, `namespace`, `skip-reason`, `investigation-outcome`). Used as routing attributes |
| `actionLinks` | `[]ActionLink` | Links to external services (e.g., Grafana dashboard, GitHub PR) with `service`, `url`, `label` |
| `retryPolicy` | `*RetryPolicy` | Delivery retry: `maxAttempts` (default 5, max 10), `initialBackoffSeconds`, `maxBackoffSeconds`, `backoffMultiplier` |
| `retentionDays` | `int` | Retention after completion (default: 7, max: 90) |

!!! warning "Planned removal"
    The `recipients` field ([#276](https://github.com/jordigilh/kubernaut/issues/276)) is present in the CRD but is not used for routing or delivery in v1.0. It will be removed in a future release. Channel selection is determined solely by routing rules in the `notification-routing-config` ConfigMap.

### Channel Types

The CRD schema accepts: `email`, `slack`, `teams`, `sms`, `webhook`, `console`, `file`, `log`

**Implemented in v1.0**: `console`, `file`, `log`, `slack`. The remaining channel types (`email`, `teams`, `sms`, `webhook`) are defined in the schema but do not have delivery implementations yet. PagerDuty delivery is planned via the `webhook` channel type.

### Status

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Delivery phase |
| `deliveryAttempts` | `[]DeliveryAttempt` | All delivery attempts: `channel`, `attempt` (1-based), `timestamp`, `status`, `error`, `durationSeconds` |
| `totalAttempts` | `int` | Total delivery attempts across all channels |
| `successfulDeliveries` | `int` | Number of successful deliveries |
| `failedDeliveries` | `int` | Number of failed deliveries |
| `queuedAt` | `*Time` | When notification was queued for processing |
| `processingStartedAt` | `*Time` | When delivery processing started |
| `completionTime` | `*Time` | When all delivery attempts completed |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

### Phases

`Pending` → `Sending` → `Retrying` → `Sent` / `PartiallySent` / `Failed`

---

## EffectivenessAssessment

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Effectiveness Monitor

Assesses whether the remediation was effective by checking health, alert resolution, spec drift, and metrics.

### Spec

| Field | Type | Description |
|---|---|---|
| `correlationID` | `string` | Parent RemediationRequest name (audit correlation) |
| `remediationRequestPhase` | `string` | RR phase at EA creation. Enum: `Verifying`, `Completed`, `Failed`, `TimedOut` |
| `signalTarget` | `TargetResource` | Resource that triggered the alert (`kind`, `name`, `namespace`) |
| `remediationTarget` | `TargetResource` | Resource the workflow modified (from AIAnalysis RCA) |
| `config` | `EAConfig` | Assessment config: `stabilizationWindow` (Duration, set by RO), `hashComputeDelay` (*Duration, defers spec hash computation for async targets; EM computes deadline as `creation + hashComputeDelay`), `alertCheckDelay` (*Duration, additional delay for proactive alert resolution checks) |
| `preRemediationSpecHash` | `string` | Spec hash before remediation (for drift detection) |
| `signalName` | `string` | Original alert name from RR |
| `remediationCreatedAt` | `*Time` | RR creation timestamp (for computing resolution time) |

### Status

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current assessment phase |
| `validityDeadline` | `*Time` | When the assessment window expires (computed by EM) |
| `prometheusCheckAfter` | `*Time` | Earliest time to query Prometheus (computed by EM) |
| `alertManagerCheckAfter` | `*Time` | Earliest time to check AlertManager (computed by EM) |
| `components` | `EAComponents` | Per-component results (see below) |
| `assessmentReason` | `string` | Outcome reason. Enum: `full`, `partial`, `no_execution`, `metrics_timed_out`, `expired`, `spec_drift` |
| `completedAt` | `*Time` | When the assessment finished |
| `message` | `string` | Human-readable details about current state |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

**EAComponents**:

| Field | Type | Description |
|---|---|---|
| `healthAssessed` / `healthScore` | `bool` / `*float64` | Health check (0.0–1.0) |
| `hashComputed` / `postRemediationSpecHash` / `currentSpecHash` | `bool` / `string` / `string` | Spec hash comparison and drift detection |
| `alertAssessed` / `alertScore` | `bool` / `*float64` | Alert resolution (0.0 or 1.0) |
| `metricsAssessed` / `metricsScore` | `bool` / `*float64` | Metric comparison (0.0–1.0) |

### Phases

`Pending` → `WaitingForPropagation` → `Stabilizing` → `Assessing` → `Completed` / `Failed`

---

## RemediationWorkflow

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Operator (`kubectl apply`)
**Watched by**: Auth Webhook (admission) → DataStorage catalog

Kubernetes-native workflow registration. The Auth Webhook intercepts CREATE and DELETE mutations, registers or disables the workflow in the DataStorage catalog, captures operator identity for SOC2 audit, and computes a content hash for deduplication. If a workflow with different content already exists under the same `workflowName` + `version`, the existing workflow is marked `superseded` and the new one is registered.

### Spec

| Field | Type | Description |
|---|---|---|
| `metadata` | `RemediationWorkflowMetadata` | Workflow identity: `workflowName`, `version`, `description` (structured: `what`, `whenToUse`, `whenNotToUse`, `preconditions`), `maintainers` (name, email) |
| `actionType` | `string` | Action type this workflow implements (must match an existing ActionType CRD name) |
| `labels` | `RemediationWorkflowLabels` | Signal-matching labels: `severity` (list), `environment` (list), `component`, `priority` |
| `customLabels` | `map[string]string` | Organization-specific labels for additional matching |
| `detectedLabels` | `JSON` | Infrastructure labels detected by HAPI that influence workflow selection (e.g., `is_gitops`, `has_hpa`) |
| `execution` | `RemediationWorkflowExecution` | Execution config: `engine` (`tekton`, `job`, or `ansible`), `bundle` (OCI ref), `bundleDigest`, `engineConfig` (engine-specific JSON, e.g. AWX `jobTemplateName`) |
| `dependencies` | `*RemediationWorkflowDependencies` | Required K8s resources: `secrets` and `configMaps` (validated before execution) |
| `parameters` | `[]RemediationWorkflowParameter` | Workflow parameters: `name`, `type`, `required`, `description`, `enum`, `pattern`, `minimum`, `maximum`, `default`, `dependsOn` |
| `rollbackParameters` | `[]RemediationWorkflowParameter` | Parameters for rollback execution |

### Status

| Field | Type | Description |
|---|---|---|
| `workflowId` | `string` | Catalog-assigned workflow UUID |
| `catalogStatus` | `string` | Catalog state: `active`, `disabled`, `superseded` |
| `registeredBy` | `string` | Operator identity from admission webhook |
| `registeredAt` | `*Time` | Registration timestamp |
| `previouslyExisted` | `bool` | Whether a disabled workflow was re-enabled |

---

## ActionType

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Operator (`kubectl apply`)
**Watched by**: Auth Webhook (admission) → DataStorage taxonomy

Kubernetes-native action type taxonomy definition. Action types categorize what kind of remediation a workflow performs (e.g., `RestartPod`, `ScaleReplicas`, `RollbackDeployment`). The Auth Webhook intercepts CREATE and DELETE mutations, registers or disables the action type in the DataStorage taxonomy, and captures operator identity for SOC2 audit.

### Spec

| Field | Type | Description |
|---|---|---|
| `name` | `string` | PascalCase action type identifier (e.g., `RestartPod`, `ScaleReplicas`). Immutable after creation. Max 255 chars |
| `description` | `ActionTypeDescription` | Structured description: `what`, `whenToUse`, `whenNotToUse` (optional), `preconditions` (optional). These fields are shown to the LLM during workflow discovery |

### Status

| Field | Type | Description |
|---|---|---|
| `registered` | `bool` | Whether registered in the DataStorage catalog |
| `registeredAt` | `*Time` | Registration timestamp |
| `registeredBy` | `string` | Operator identity from admission webhook |
| `previouslyExisted` | `bool` | Whether a disabled action type was re-enabled |
| `activeWorkflowCount` | `int` | Number of active RemediationWorkflows referencing this action type |
| `catalogStatus` | `string` | Catalog state: `active`, `disabled` |
