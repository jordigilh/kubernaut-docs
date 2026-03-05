# Signals & Alert Routing

Kubernaut ingests signals from two sources: **Prometheus AlertManager** and **Kubernetes Events**. This page explains how signals reach the system, how resource scope is enforced, and how deduplication works.

## Signal Sources

### Prometheus AlertManager

The Gateway exposes an AlertManager-compatible webhook endpoint:

```
POST /api/v1/signals/prometheus
```

Configure AlertManager to send alerts to this endpoint:

```yaml
# alertmanager.yml
receivers:
  - name: kubernaut
    webhook_configs:
      - url: http://gateway-service.kubernaut-system.svc:8080/api/v1/signals/prometheus
        send_resolved: false

route:
  receiver: kubernaut
  routes:
    - match:
        severity: critical
      receiver: kubernaut
```

The Gateway validates each alert, extracts the target resource, checks scope labels, and creates a `RemediationRequest` CRD.

### Kubernetes Events

Kubernaut uses an **Event Exporter** (deployed as part of the Helm chart) to forward `Warning`-type Kubernetes events to the Gateway:

```
POST /api/v1/signals/kubernetes-event
```

This captures events like `BackOff`, `OOMKilled`, `FailedScheduling`, and `Unhealthy` without requiring a Prometheus rule for each.

## Signal Types

After ingestion, the Gateway normalizes signal types:

| Source | Signal Type | Example |
|---|---|---|
| AlertManager | `alert` | `KubePodCrashLooping`, `KubePodOOMKilled` |
| Kubernetes Event | `event` | `BackOff`, `OOMKilled`, `FailedScheduling` |

## Resource Scope Management

Kubernaut uses a **label-based opt-in model** to control which resources it manages.

### Namespace Scope

```bash
# Opt in a namespace
kubectl label namespace my-app kubernaut.ai/managed=true

# Opt out
kubectl label namespace my-app kubernaut.ai/managed-
```

The Gateway checks this label before creating a RemediationRequest. Signals targeting unmanaged namespaces are dropped silently.

### Resource-Level Scope

Individual resources can also be opted in or out:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    kubernaut.ai/managed: "true"
```

## Deduplication

The Gateway prevents duplicate remediations for the same issue using **CRD-based deduplication**. Before creating a new RemediationRequest, it checks whether an active (non-terminal) RemediationRequest already exists for the same target resource and alert name.

If a duplicate is detected, the new signal is dropped and logged.

## Signal Processing

After the Gateway creates a `RemediationRequest`, the Orchestrator creates a `SignalProcessing` CRD. The Signal Processing controller enriches the signal through several stages:

### Enrichment

- **Owner chain resolution** — Traces Pod → ReplicaSet → Deployment (or StatefulSet, DaemonSet, etc.)
- **Namespace labels** — Extracts environment, team, and other namespace-level metadata
- **Resource context** — Current resource status, events, and conditions

### Classification

Rego policies evaluate the enriched signal to determine:

- **Severity** — Critical, warning, or informational
- **Priority** — Business impact and urgency
- **Environment** — Production, staging, development
- **Signal mode** — Reactive or proactive

### Signal Mode

| Mode | Meaning | Example Alerts |
|---|---|---|
| **Reactive** | Active incident requiring remediation | `KubePodCrashLooping`, `KubePodOOMKilled` |
| **Proactive** | Predicted issue before user impact | `PredictDiskFull`, `PredictMemoryExhaustion` (via `predict_linear()`) |

Signal mode affects workflow selection and urgency evaluation during AI analysis.

## Next Steps

- [Core Concepts](concepts.md) — Understanding the full pipeline
- [Remediation Workflows](workflows.md) — How workflows are matched to signals
- [Configuration Reference](configuration.md) — Gateway and Signal Processing configuration
