# System Overview

Kubernaut is built as a set of loosely-coupled microservices that communicate through Kubernetes Custom Resources. This page describes the system topology, design principles, and key architectural decisions.

## Design Principles

### CRDs as the Communication Backbone

Every inter-service interaction in the remediation pipeline uses Kubernetes CRDs. The Remediation Orchestrator creates child CRDs; specialized controllers reconcile them. This provides:

- **Crash resilience** -- Controllers restart and resume from CRD state
- **Observability** -- `kubectl get <crd>` shows the current state of every stage
- **Auditability** -- Status transitions are recorded as Kubernetes events and audit trail entries
- **Decoupling** -- Services have no direct dependency on each other

The only exceptions are:

- **DataStorage** -- Called via REST API for audit events, workflow catalog, remediation history, and effectiveness data
- **HolmesGPT API** -- Called via REST API (session-based async) for LLM-driven root cause analysis, infrastructure label detection, and workflow discovery

### Orchestrator Pattern

The **Remediation Orchestrator** is the central coordinator. It watches `RemediationRequest` CRDs and drives the lifecycle by creating child CRDs in sequence:

```
RemediationRequest (Gateway)
  └─ SignalProcessing (Orchestrator → SP Controller)
  └─ AIAnalysis (Orchestrator → AA Controller → HolmesGPT API)
  └─ RemediationApprovalRequest (Orchestrator, when approval needed)
  └─ WorkflowExecution (Orchestrator → WE Controller)
  └─ EffectivenessAssessment (Orchestrator → EM Controller)
  └─ NotificationRequest (Orchestrator → Notification Controller)
```

All child CRDs have owner references to the parent RR, enabling cascade deletion when the RR is garbage collected. The Orchestrator watches all child CRDs to detect status changes and advance the parent through its [phase state machine](remediation-routing.md#phase-state-machine).

### Separation of Concerns

Each service has a single responsibility:

| Service | Responsibility | Architecture Page |
|---|---|---|
| **Gateway** | Signal ingestion, authentication, scope checking, deduplication, RR creation | [Gateway](gateway.md) |
| **Signal Processing** | Kubernetes context enrichment, Rego-based classification (environment, severity, priority, signal mode), business categorization | [Signal Processing](signal-processing.md) |
| **AI Analysis** | Orchestrates HolmesGPT investigation session, evaluates Rego approval policy | [AI Analysis](ai-analysis.md) |
| **HolmesGPT API** | LLM-driven investigation with K8s tools, infrastructure label detection, remediation history, three-step workflow discovery | [Investigation Pipeline](hapi-investigation.md) |
| **Remediation Orchestrator** | Lifecycle coordination, routing engine, timeout enforcement, child CRD management | [Remediation Routing](remediation-routing.md) |
| **Workflow Execution** | Dependency resolution, Job/Tekton execution, cooldown, deterministic locking | [Workflow Execution](workflow-execution.md) |
| **Notification** | Multi-channel delivery with routing, retry, circuit breaker | [Notification Pipeline](notification.md) |
| **Effectiveness Monitor** | Post-remediation health, alert, metrics, and spec hash assessment | [Effectiveness Assessment](effectiveness.md) |
| **DataStorage** | Persistent storage (audit, workflow catalog, remediation history, effectiveness), workflow scoring | [Data Persistence](data-persistence.md) |

## Service Topology

```mermaid
graph TB
    subgraph Ingress["Signal Ingestion"]
        GW[Gateway<br/><small>HTTP → CRD</small>]
    end

    subgraph Core["Core Pipeline"]
        RO[Remediation<br/>Orchestrator]
        SP[Signal<br/>Processing]
        AA[AI<br/>Analysis]
        WE[Workflow<br/>Execution]
    end

    subgraph Closing["Close the Loop"]
        NF[Notification]
        EM[Effectiveness<br/>Monitor]
    end

    subgraph External["External Services"]
        HAPI[HolmesGPT API<br/><small>Python/FastAPI</small>]
        DS[DataStorage<br/><small>REST API</small>]
        LLM[LLM Provider]
    end

    subgraph Infra["Infrastructure"]
        PG[(PostgreSQL)]
        RD[(Valkey)]
    end

    GW -->|RemediationRequest| RO
    RO -->|SignalProcessing| SP
    RO -->|AIAnalysis| AA
    RO -->|WorkflowExecution| WE
    RO -->|NotificationRequest| NF
    RO -->|EffectivenessAssessment| EM

    AA -.->|session async| HAPI
    HAPI -.-> LLM
    HAPI -.-> DS

    SP -.-> DS
    AA -.-> DS
    WE -.-> DS
    NF -.-> DS
    EM -.-> DS
    RO -.-> DS
    GW -.-> DS

    DS --- PG
    DS --- RD
```

### CRD Lifecycle

The complete CRD lifecycle for a single remediation follows the natural flow:

| Step | CRD Created | By | Controller | Purpose |
|---|---|---|---|---|
| 1 | `RemediationRequest` | Gateway | Orchestrator | Root lifecycle object |
| 2 | `SignalProcessing` | Orchestrator | SP Controller | Enrichment and classification |
| 3 | `AIAnalysis` | Orchestrator | AA Controller | RCA, workflow selection via HAPI |
| 4 | `RemediationApprovalRequest` | Orchestrator | (human) | Approval gate (when needed) |
| 5 | `WorkflowExecution` | Orchestrator | WE Controller | Run remediation workflow |
| 6 | `EffectivenessAssessment` | Orchestrator | EM Controller | Post-execution verification |
| 7 | `NotificationRequest` | Orchestrator | NT Controller | Outcome notification |

Each CRD has its own phase state machine. The Orchestrator monitors child CRD status and advances the parent RR accordingly.

## Namespace Model

All Kubernaut services run in the `kubernaut-system` namespace. Workflow execution (Jobs/Tekton PipelineRuns) runs in a separate `kubernaut-workflows` namespace with a shared ServiceAccount (`kubernaut-workflow-runner`). Per-workflow scoped RBAC is planned for v1.2.

## Configuration

Services are configured via **YAML ConfigMaps** following ADR-030. Each service reads its configuration from a file mounted at `/etc/<service>/config.yaml`. All Rego policies and YAML-based configurations (proactive signal mappings, notification routing) support [hot-reload](../user-guide/configuration.md#hot-reload-and-graceful-shutdown) via `fsnotify` file watchers.

See [Configuration Reference](../user-guide/configuration.md) for all configurable parameters.

## Security Model

### RBAC

Each service runs under a dedicated ServiceAccount with least-privilege permissions. See [Security & RBAC](security-rbac.md) for the full reference including controller permissions, workflow execution RBAC, signal source authentication, and internal service communication.

### Admission Webhooks

An internal admission webhook validates and audits:

- WorkflowExecution mutations (block clearance)
- RemediationApprovalRequest mutations (approval/rejection)
- RemediationRequest status mutations (timeout configuration)
- NotificationRequest deletions (attribution)

### Authentication

- **DataStorage** -- Kubernetes TokenReview + SubjectAccessReview middleware (DD-AUTH-014)
- **Gateway** -- Kubernetes TokenReview + SubjectAccessReview middleware for signal ingestion (see [Security & RBAC](security-rbac.md#signal-ingestion))
- **NetworkPolicies** -- Not included in Helm chart ([GitHub #285](https://github.com/jordigilh/kubernaut/issues/285)); recommended for production deployments
- **TLS** -- Not configured for internal service-to-service traffic in v1.0

## Error Handling Patterns

All controllers share common error handling patterns:

| Pattern | Implementation | Reference |
|---|---|---|
| **Exponential backoff** | `pkg/shared/backoff` -- base × multiplier^(failures-1) ± jitter | DD-SHARED-001 |
| **Transient vs permanent errors** | Transient → retry with backoff; permanent → terminal phase | Per-controller |
| **Consecutive failure tracking** | `ConsecutiveFailures` counter on CRD status; reset on success | DD-SHARED-001 |
| **Graceful shutdown** | Context cancellation → flush audit buffers → stop watchers | DD-007, ADR-032 |
| **Hot-reload** | `fsnotify` file watcher → debounce 200ms → swap config under mutex | DD-INFRA-001 |

## Next Steps

- [Gateway](gateway.md) -- Signal ingestion entry point
- [Signal Processing](signal-processing.md) -- Enrichment and classification
- [AI Analysis](ai-analysis.md) -- HolmesGPT integration
- [Remediation Routing](remediation-routing.md) -- Orchestrator lifecycle management
- [Audit Pipeline](audit-pipeline.md) -- How audit events flow through the system
