# Architecture Overview

Kubernaut is a microservices platform with 10 services that communicate through Kubernetes Custom Resources (CRDs). This page provides a high-level view of how the services work together.

## System Diagram

<figure markdown="span">
  ![Kubernaut Layered Architecture](../assets/diagrams/kubernaut-layered-architecture.svg){ width="100%" }
</figure>

The **Gateway** receives signals (Prometheus alerts, Kubernetes events) and creates RemediationRequest CRDs. The **Remediation Orchestrator** coordinates the pipeline, creating child CRDs for each phase. Five CRD controllers -- Signal Processing, AI Analysis, Workflow Execution, Notification, Effectiveness Monitor -- each handle one phase. The **DataStorage** foundation layer persists audit events, the workflow catalog, and remediation history to PostgreSQL (with Redis for the DLQ). All services emit audit events to DataStorage over HTTP. AI Analysis delegates to HolmesGPT API for LLM-driven investigation, and HolmesGPT API queries DataStorage for the workflow catalog and remediation history.

## Services

Kubernaut runs **10 services**: 6 CRD controllers, 2 stateless HTTP services, 1 admission webhook, and 1 Python API service.

### CRD Controllers

These services watch Kubernetes Custom Resources and reconcile state:

| Service | Watches | Creates | Role |
|---|---|---|---|
| **Remediation Orchestrator** | RemediationRequest + all child CRDs | SignalProcessing, AIAnalysis, WorkflowExecution, NotificationRequest, EffectivenessAssessment, RemediationApprovalRequest | Coordinates the full remediation lifecycle with routing engine (blocking conditions, exponential backoff, resource locks) |
| **Signal Processing** | SignalProcessing | — | Enriches signals with K8s context (owner chain, namespace, workload), environment classification, priority assignment, business classification, severity normalization, and signal mode |
| **AI Analysis** | AIAnalysis | — | Submits session-based async investigations to HolmesGPT API for RCA, evaluates approval via Rego policy |
| **Workflow Execution** | WorkflowExecution | Tekton PipelineRun, Job, or AWX Job | Validates dependencies (Secrets, ConfigMaps), runs remediation workflows via Tekton, K8s Jobs, or Ansible (AWX/AAP) |
| **Notification** | NotificationRequest | — | Delivers notifications via Slack, console, file, or log channels with retry backoff |
| **Effectiveness Monitor** | EffectivenessAssessment | — | Four-dimensional assessment: health checks (K8s), alert resolution (AlertManager), metric comparison (Prometheus), and spec hash drift detection |

### Stateless Services

| Service | Role |
|---|---|
| **Gateway** | HTTP entry point for AlertManager webhooks and K8s events; authenticates callers via Kubernetes TokenReview + SubjectAccessReview, validates resource scope, resolves owner chains, performs fingerprint-based deduplication, and creates RemediationRequest CRDs |
| **DataStorage** | PostgreSQL-backed REST API for audit events, workflow catalog, remediation history, and effectiveness data (Redis for DLQ) |
| **Auth Webhook** | Kubernetes admission webhook that captures operator identity for SOC2 audit attribution on CRD mutations, and bridges RemediationWorkflow and ActionType CRD lifecycle with the DataStorage workflow catalog and action type taxonomy (registers on CREATE, disables on DELETE) |
| **HolmesGPT API** | Python FastAPI service that orchestrates LLM-driven root cause analysis using Kubernetes inspection tools and configurable observability toolsets (Prometheus, Grafana Loki/Tempo); detects infrastructure labels (GitOps, Helm, service mesh, HPA, PDB) that influence workflow selection and catalog search; fetches remediation history so the LLM avoids repeating failed remediations |

## Communication Pattern

All inter-service communication in the remediation pipeline uses **Kubernetes CRDs**. The HTTP exceptions are: all controllers emit audit events to DataStorage, WFE queries DataStorage for the workflow catalog, RO queries DataStorage for remediation history, AA calls HolmesGPT API for AI investigation, and EM queries AlertManager and Prometheus for effectiveness assessment.

This architecture provides:

- **Resilience** — If a controller restarts, it picks up from the CRD's current state
- **Observability** — Every stage is visible as a Kubernetes resource (`kubectl get`)
- **Auditability** — CRD status transitions are tracked; full audit events go to PostgreSQL
- **Scalability** — Each controller scales independently

## Custom Resources

Kubernaut defines 9 CRD types:

| CRD | API Group | Created By | Watched By |
|---|---|---|---|
| `RemediationRequest` | `kubernaut.ai` | Gateway | Remediation Orchestrator |
| `RemediationApprovalRequest` | `kubernaut.ai` | Remediation Orchestrator | Remediation Orchestrator (RAR audit) |
| `SignalProcessing` | `kubernaut.ai` | Remediation Orchestrator | Signal Processing |
| `AIAnalysis` | `kubernaut.ai` | Remediation Orchestrator | AI Analysis |
| `WorkflowExecution` | `kubernaut.ai` | Remediation Orchestrator | Workflow Execution |
| `NotificationRequest` | `kubernaut.ai` | Remediation Orchestrator | Notification |
| `EffectivenessAssessment` | `kubernaut.ai` | Remediation Orchestrator | Effectiveness Monitor |
| `RemediationWorkflow` | `kubernaut.ai` | Operator (`kubectl apply`) | Auth Webhook (admission) → DataStorage catalog |
| `ActionType` | `kubernaut.ai` | Operator (`kubectl apply`) | Auth Webhook (admission) → DataStorage taxonomy |

## Remediation Lifecycle

A `RemediationRequest` progresses through these phases:

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Processing: Create SignalProcessing
    Pending --> Blocked: Routing condition
    Processing --> Analyzing: Enrichment complete
    Analyzing --> Completed: No remediation needed
    Analyzing --> AwaitingApproval: Rego policy requires approval
    Analyzing --> Executing: Workflow selected, auto-approved
    Analyzing --> Blocked: Routing condition
    Analyzing --> Failed: AI investigation failed
    AwaitingApproval --> Executing: Human approves
    AwaitingApproval --> Failed: Human rejects
    Executing --> Verifying: Workflow succeeded
    Executing --> Failed: Workflow fails
    Verifying --> Completed: Effectiveness assessed
    Blocked --> Failed: Cooldown expires
    Blocked --> Analyzing: Block cleared
    Blocked --> Pending: Block cleared
    Completed --> [*]
    Failed --> [*]
    TimedOut --> [*]
    Skipped --> [*]
    Cancelled --> [*]
```

### AI Analysis Outcomes

The **Analyzing** phase represents the LLM investigation via HolmesGPT API. The AI produces one of these outcomes:

| Outcome | RR Transition | Description |
|---|---|---|
| **No remediation needed** | Completed (NoActionRequired) | LLM determines the issue does not require remediation — either the problem self-resolved (e.g., pod recovered) or the condition is benign (e.g., dangling PVC that doesn't warrant action) |
| **Workflow selected** | Executing or AwaitingApproval | LLM identified root cause and selected a workflow; Rego policy determines if approval is required |
| **Investigation inconclusive** | Failed (ManualReviewRequired) | LLM could not produce a reliable RCA (low confidence, incomplete analysis) |
| **No matching workflow** | Failed (ManualReviewRequired) | RCA succeeded but no workflow matches the detected labels |
| **Infrastructure failure** | Failed | API error, timeout, or max retries exceeded communicating with the LLM |

### Blocked Phase

The **Blocked** phase is non-terminal and covers 6 routing scenarios managed by the Orchestrator (not the LLM):

| Block Reason | Exit Condition | Resumes To |
|---|---|---|
| ConsecutiveFailures | Cooldown expires | Failed (terminal) |
| ResourceBusy | Blocking workflow completes | Analyzing |
| DuplicateInProgress | Original RR completes | Pending |
| RecentlyRemediated | Cooldown expires | Failed (terminal) |
| ExponentialBackoff | Backoff window expires | Failed (terminal) |
| UnmanagedResource | Scope label added | Pending |

After reaching a terminal phase, the Orchestrator creates a **NotificationRequest** to inform the team. On successful completion, it also creates an **EffectivenessAssessment** to evaluate whether the fix worked.

## Data Flow

Every service emits audit events to DataStorage as it processes its CRD. These events capture the full context: what happened, when, why, and who was involved. The long-term record of every remediation lives in **PostgreSQL** via the audit pipeline, so even if CRDs are removed from the cluster, the complete data is preserved. A `RemediationRequest` can be [reconstructed from audit data](../user-guide/data-lifecycle.md) at any time.

## Next Steps

- [Core Concepts](../user-guide/concepts.md) — Detailed explanation of each stage
- [System Overview](../architecture/overview.md) — Deep-dive architecture documentation
- [CRD Reference](../api-reference/crds.md) — Complete CRD spec/status definitions
