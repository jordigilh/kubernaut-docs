# Signal Processing

The Signal Processing pipeline transforms raw alerts and events into enriched, classified signals ready for AI analysis.

## Pipeline Stages

```mermaid
graph LR
    SP[SignalProcessing<br/>CRD created] --> E[Enrichment]
    E --> C[Classification]
    C --> CAT[Categorization]
    CAT --> DONE[Completed]
```

### Phases

| Phase | Description |
|---|---|
| `Pending` | CRD created by Orchestrator, awaiting pickup |
| `Enriching` | Gathering Kubernetes context (owner chain, namespace, workload) and custom labels (Rego) |
| `Classifying` | Evaluating Rego policies for environment, priority, severity, and signal mode |
| `Categorizing` | Business classification (business unit, criticality, SLA requirement) |
| `Completed` | Enrichment complete, results stored in status |
| `Failed` | An error occurred during processing |

## Enrichment

The enrichment stage gathers Kubernetes context about the target resource:

### Owner Chain Resolution

Traces the ownership hierarchy to find the controlling resource:

```
Pod → ReplicaSet → Deployment
Pod → StatefulSet
Pod → DaemonSet
Pod → Job → CronJob
```

This identifies the resource to remediate (e.g., the Deployment, not the individual Pod).

### Namespace Context

Extracts metadata from the target namespace:

- Namespace name
- Namespace labels (environment, team, tier)
- Namespace annotations

### Workload Details

Captures metadata about the target workload:

- Kind and name
- Labels and annotations

!!! note "Operational details fetched by HAPI"
    Pod conditions, container statuses, events, and resource requests/limits are **not** captured by Signal Processing. HolmesGPT fetches these on demand via `kubectl` during the AI investigation phase.

## Classification (Rego Policies)

Rego policies evaluate the enriched signal to produce structured labels:

| Policy | Output | Description |
|---|---|---|
| `environment` | `production`, `staging`, `development` | Based on namespace labels |
| `severity` | `critical`, `high`, `medium`, `low`, `unknown` | Normalized from external severity via Rego (DD-SEVERITY-001 v1.1) |
| `priority` | `P0`, `P1`, `P2`, `P3` | Business impact based on environment + severity composite score |
| `business` | Custom labels | Organization-specific classification |
| `customlabels` | Custom labels | Extension point for additional classification |

!!! note "Policy Files"
    Rego policy files are located at `/etc/signalprocessing/policies/` inside the container. The Helm chart embeds all 5 policies (`environment.rego`, `severity.rego`, `priority.rego`, `business.rego`, `customlabels.rego`) inline in the ConfigMap. The `deploy/signalprocessing/policies/` directory contains only 3 of these (environment, priority, business) for non-Helm deployments.

### Signal Mode Classification

Signal mode is determined by a **YAML-based configuration** (`proactive-signal-mappings.yaml` per BR-SP-106), not a Rego policy. The `SignalModeClassifier` evaluates alert names against proactive signal patterns.

| Mode | Indicators | Examples |
|---|---|---|
| **Reactive** | Active alerts, failed health checks, crash loops | `KubePodCrashLooping`, `KubePodOOMKilled` |
| **Proactive** | Predictive alerts, threshold approaches | `PredictDiskFull` (`predict_linear()`), `MemoryApproaching90Percent` |

## Deduplication

Deduplication is handled entirely at the **Gateway level** — Signal Processing does not perform deduplication.

The Gateway computes an **owner-chain-based fingerprint** (`SHA256(namespace:Kind:name)`) for the top-level owning resource (e.g., Deployment, not Pod). It then performs a CRD-based check: if an active RemediationRequest with the same fingerprint exists in a non-terminal phase, the signal is deduplicated. The owner chain is resolved via a metadata informer cache with direct API (`apiReader`) fallbacks: on cache miss (#282) the resolver fetches the resource directly; on stale cache entries missing ownerReferences (#284) the resolver re-verifies via the direct API before deciding whether the resource is a genuine standalone Pod or a stale entry. If the resource is confirmed deleted, the signal is dropped.

## Data Flow

```mermaid
sequenceDiagram
    participant RO as Orchestrator
    participant SP as Signal Processing
    participant K8s as Kubernetes API
    participant DS as DataStorage

    RO->>SP: Create SignalProcessing CRD
    SP->>K8s: Get target resource + owner chain
    SP->>K8s: Get namespace labels
    SP->>SP: Evaluate Rego policies
    SP->>DS: Store audit event
    SP->>SP: Update CRD status (Completed)
    RO->>RO: Detect SP completion → create AIAnalysis
```

## Next Steps

- [AI Analysis](ai-analysis.md) — How the enriched signal is analyzed
- [Architecture Overview](overview.md) — System topology
