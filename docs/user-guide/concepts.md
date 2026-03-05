# Core Concepts

This page explains the key building blocks of Kubernaut: the data model, the services, and how a remediation flows through the system.

## The Remediation Pipeline

Every remediation in Kubernaut follows the same five-stage pipeline:

```mermaid
graph LR
    SD["Signal<br/>Detection"] --> SP["Signal<br/>Processing"]
    SP --> AA["AI<br/>Analysis"]
    AA --> WE["Workflow<br/>Execution"]
    WE --> CL["Close the<br/>Loop"]
```

Each stage is represented by a **Custom Resource (CRD)** in Kubernetes. The **Remediation Orchestrator** coordinates the flow by creating child CRDs and watching their status.

## Custom Resources

### RemediationRequest

The top-level resource. Created by the Gateway when a signal arrives. Contains:

- **TargetResource** — The Kubernetes resource that triggered the alert (namespace, name, kind)
- **Signal metadata** — Alert name, signal type, labels, annotations, original payload
- **OverallPhase** — Current lifecycle phase (Pending → Processing → Analyzing → Executing → Completed/Failed)

The RemediationRequest is the "parent" — all other CRDs are children created by the Orchestrator.

### SignalProcessing

Created after a RemediationRequest is accepted. The Signal Processing controller enriches the signal with:

- **Kubernetes context** — Owner chain (Deployment → ReplicaSet → Pod), namespace labels
- **Severity classification** — Based on alert labels and Rego policies
- **Signal mode** — Reactive (something broke) or proactive (something is predicted to break)
- **Deduplication** — Prevents duplicate remediations for the same issue

### AIAnalysis

Created after signal enrichment completes. The AI Analysis controller:

1. Submits the enriched signal to **HolmesGPT** for live root cause investigation
2. HolmesGPT uses `kubectl` to inspect pods, logs, events, and resource limits
3. Produces a **root cause analysis (RCA)** and searches the workflow catalog for a match
4. Evaluates whether auto-approval is safe via a **Rego policy** (configurable confidence threshold)

### RemediationApprovalRequest

Created when the AI Analysis confidence is below the approval threshold, or when the Rego policy requires human review. A human operator approves or rejects the remediation.

### WorkflowExecution

Created after approval (auto or human). The Workflow Execution controller:

1. Resolves the workflow from the catalog (via DataStorage)
2. Validates dependencies (required Secrets, ConfigMaps)
3. Runs the remediation via **Tekton Pipelines** (multi-step) or **Kubernetes Jobs** (single-step)
4. Injects parameters (namespace, deployment name, etc.)

### NotificationRequest

Created after the workflow completes (or on escalation). Delivers a notification via configured channels:

- **Slack** — Rich messages with RCA summary and remediation outcome
- **Console / Log** — For development and testing
- **File** — For integration testing

### EffectivenessAssessment

Created after the workflow completes. The Effectiveness Monitor evaluates whether the fix actually resolved the issue:

- **Spec hash comparison** — Did the resource spec change as expected?
- **Health checks** — Is the workload healthy now?
- **Metric evaluation** — Did the triggering metric recover? (via Prometheus/AlertManager)

## Phases

A `RemediationRequest` progresses through these phases:

| Phase | Description |
|---|---|
| **Pending** | Created by Gateway, waiting for Orchestrator pickup |
| **Processing** | Signal Processing is enriching the signal |
| **Analyzing** | AI Analysis is performing RCA and workflow selection |
| **AwaitingApproval** | Human approval required (low confidence or policy mandate) |
| **Executing** | Workflow is running the remediation |
| **Completed** | Remediation finished successfully |
| **Failed** | Remediation failed at any stage |
| **Rejected** | Human rejected the remediation |

## Signal Modes

Kubernaut classifies signals into two modes:

- **Reactive** — Responding to an active incident (e.g., `KubePodCrashLooping`, `KubePodOOMKilled`)
- **Proactive** — Responding to a predicted issue (e.g., Prometheus `predict_linear()` alerts for disk pressure, memory exhaustion)

Signal mode affects how urgency is evaluated and which workflows are considered.

## Resource Scope

Kubernaut uses a **label-based opt-in model**. Only namespaces and resources with the `kubernaut.ai/managed=true` label are eligible for remediation. The Gateway validates this label before creating a RemediationRequest.

```bash
# Opt a namespace into Kubernaut management
kubectl label namespace my-app kubernaut.ai/managed=true
```

## Workflow Catalog

Remediation workflows are packaged as **OCI images** containing a `workflow-schema.yaml` and stored in the **DataStorage** service as a searchable catalog. Each workflow has:

- **Metadata** — Workflow ID, version, structured description (what, whenToUse, whenNotToUse, preconditions)
- **Action type** — Taxonomy type (e.g., `RestartPod`, `RollbackDeployment`, `IncreaseMemoryLimits`)
- **Labels** — Signal name, severity, environment, component, priority (with wildcard and multi-value support)
- **Parameters** — Typed inputs injected at runtime as environment variables (`UPPER_SNAKE_CASE`)
- **Execution config** — Engine (`job` or `tekton`) and OCI bundle reference with digest

AI Analysis queries the catalog using enriched signal labels and selects the best match based on label overlap and confidence scoring. See [Remediation Workflows](workflows.md) for the full schema reference.

## Next Steps

- [Signals & Alert Routing](signals.md) — How signals enter the system
- [Remediation Workflows](workflows.md) — Writing your own workflows
- [Human Approval](approval.md) — Understanding the approval flow
