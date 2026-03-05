# Custom Resources (CRDs)

Kubernaut defines 7 Custom Resource types under the `kubernaut.ai` API group. This page provides the spec, status, and phase reference for each.

!!! note "Authoritative Source"
    The CRD type definitions in the [source code](https://github.com/jordigilh/kubernaut/tree/main/api) are the authoritative reference. This page is derived from those definitions.

## RemediationRequest

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Gateway
**Watched by**: Remediation Orchestrator

### Spec

| Field | Type | Description |
|---|---|---|
| `targetResource` | `ResourceIdentifier` | The Kubernetes resource that triggered the signal (namespace, name, kind, apiVersion) |
| `signalName` | `string` | Alert or event name (e.g., `KubePodCrashLooping`) |
| `signalFingerprint` | `string` | SHA256 fingerprint for deduplication (immutable) |
| `signalType` | `string` | Signal type (`alert` or `event`) |
| `signalSource` | `string` | Source adapter (e.g., `prometheus`, `kubernetes-event`) |
| `severity` | `string` | Signal severity |
| `firingTime` | `*Time` | When the signal first fired |
| `signalLabels` | `map[string]string` | Original signal labels |
| `providerData` | `string` | Raw provider data |

!!! note
    See `config/crd/bases/kubernaut.ai_remediationrequests.yaml` for the complete field reference including `signalAnnotations`, `originalPayload`, `targetType`, `deduplication`, and storm-related fields.

### Status

| Field | Type | Description |
|---|---|---|
| `overallPhase` | `string` | Current lifecycle phase |
| `signalProcessingRef` | `*ObjectReference` | Reference to child SignalProcessing CRD |
| `aiAnalysisRef` | `*ObjectReference` | Reference to child AIAnalysis CRD |
| `workflowExecutionRef` | `*ObjectReference` | Reference to child WorkflowExecution CRD |
| `blockReason` | `string` | Why the RR is blocked (if applicable) |
| `blockMessage` | `string` | Human-readable block description |
| `blockedUntil` | `*Time` | When the block expires |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |
| `completedAt` | `*Time` | When the remediation completed |
| `retentionExpiryTime` | `*Time` | When the CRD should be cleaned up (24h after completion) |
| `timeoutConfig` | `TimeoutConfig` | Timeout settings for the remediation |

### Phases

`Pending` → `Processing` → `Analyzing` → `AwaitingApproval` → `Executing` → `Completed` / `Failed` / `Blocked` / `TimedOut` / `Skipped` / `Cancelled`

---

## RemediationApprovalRequest

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Remediation Orchestrator (RAR audit controller)

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `ObjectReference` | Reference to parent RemediationRequest |
| `analysisContext` | `AnalysisContext` | RCA results and workflow recommendation |
| `confidenceScore` | `float64` | AI confidence score |

### Status

| Field | Type | Description |
|---|---|---|
| `decision` | `string` | `Approved` or `Rejected` |
| `reason` | `string` | Human-provided reason |
| `decidedBy` | `string` | Operator identity (from admission webhook) |
| `decidedAt` | `*Time` | When the decision was made |

---

## SignalProcessing

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Signal Processing

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `ObjectReference` | Reference to parent RemediationRequest |
| `signal` | `Signal` | Signal data to enrich |
| `enrichmentConfig` | `EnrichmentConfig` | Enrichment settings (includes enrichment timeout and cache TTL) |

### Status

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current processing phase |
| `enrichedData` | `EnrichedData` | Enrichment results (owner chain, namespace context, classification) |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

### Phases

`Pending` → `Enriching` → `Classifying` → `Categorizing` → `Completed` / `Failed`

---

## AIAnalysis

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: AI Analysis

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `ObjectReference` | Reference to parent RemediationRequest |
| `remediationID` | `string` | Unique remediation identifier |
| `analysisRequest` | `AnalysisRequest` | Analysis configuration (signal context, analysis types) |
| `timeoutConfig` | `*AIAnalysisTimeoutConfig` | Optional timeouts: `investigatingTimeout`, `analyzingTimeout` (passed from RR by RO) |

### Status

**Lifecycle**:

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current analysis phase |
| `message` | `string` | Phase message |
| `reason` | `string` | Failure category |
| `startedAt` | `*Time` | When analysis started |
| `completedAt` | `*Time` | When analysis completed |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

**Analysis Results**:

| Field | Type | Description |
|---|---|---|
| `rootCause` | `string` | Identified root cause summary |
| `rootCauseAnalysis` | `*RootCauseAnalysis` | Detailed RCA with tools used and evidence |
| `selectedWorkflow` | `*SelectedWorkflow` | Recommended workflow for remediation |
| `alternativeWorkflows` | `[]AlternativeWorkflow` | Other candidate workflows considered |
| `postRCAContext` | `*PostRCAContext` | Post-RCA resource context including detected labels |

**Session Tracking**:

| Field | Type | Description |
|---|---|---|
| `investigationSession` | `InvestigationSession` | HolmesGPT async session state |

`InvestigationSession` fields: `id` (session ID), `generation` (regeneration counter), `pollCount` (poll attempts), `lastPolled`, `createdAt`.

**Approval & Human Review**:

| Field | Type | Description |
|---|---|---|
| `approvalRequired` | `bool` | Whether human approval is needed |
| `approvalReason` | `string` | Why approval is required |
| `needsHumanReview` | `bool` | Whether the case requires human review |
| `humanReviewReason` | `string` | Reason for human review escalation |

!!! note
    See `config/crd/bases/kubernaut.ai_aianalyses.yaml` for the complete field reference including `approvalContext`, `validationAttemptsHistory`, `degradedMode`, and additional metadata fields.

### Phases

`Pending` → `Investigating` → `Analyzing` → `Completed` / `Failed`

---

## WorkflowExecution

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Workflow Execution

### Spec

| Field | Type | Description |
|---|---|---|
| `workflowRef` | `WorkflowRef` | Reference to the workflow schema |
| `targetResource` | `ResourceIdentifier` | Kubernetes resource to remediate |
| `parameters` | `[]Parameter` | Runtime parameters for the workflow |
| `executionEngine` | `string` | `job` or `tekton` (default: `tekton`) |

### Status

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current execution phase |
| `executionRef` | `*LocalObjectReference` | Reference to the underlying Job or Tekton PipelineRun |
| `startedAt` | `*Time` | When execution started |
| `completedAt` | `*Time` | When execution completed |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

### Phases

`Pending` → `Running` → `Completed` / `Failed`

---

## NotificationRequest

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Notification

### Spec

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Notification type |
| `priority` | `string` | Notification priority |
| `recipients` | `[]Recipient` | Target recipients/channels |
| `subject` | `string` | Notification subject |
| `body` | `string` | Notification body |
| `metadata` | `map[string]string` | Additional metadata |

### Status

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current delivery phase |
| `deliveryResults` | `[]DeliveryResult` | Per-channel delivery outcomes |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

---

## EffectivenessAssessment

**API Group**: `kubernaut.ai/v1alpha1`
**Created by**: Remediation Orchestrator
**Watched by**: Effectiveness Monitor

### Spec

| Field | Type | Description |
|---|---|---|
| `remediationRequestRef` | `ObjectReference` | Reference to parent RemediationRequest |
| `targetResource` | `TargetResource` | Resource being assessed |
| `assessmentConfig` | `AssessmentConfig` | Timing and evaluation configuration |

### Status

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current assessment phase |
| `assessmentResult` | `AssessmentResult` | Effectiveness scoring results |
| `conditions` | `[]Condition` | Standard Kubernetes conditions |

### Phases

`Pending` → `Assessing` → `Completed` / `Failed`
