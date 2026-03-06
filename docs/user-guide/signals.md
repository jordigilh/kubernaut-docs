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

## Fingerprinting

Before creating a RemediationRequest, the Gateway computes a **signal fingerprint** — a SHA256 hash based on the top-level owning resource (e.g., `Deployment`), not the individual Pod. This ensures that alerts from different Pods in the same Deployment produce the same fingerprint, enabling accurate deduplication.

The Gateway resolves the owner chain using a metadata-only informer cache. Two direct API fallback mechanisms handle race conditions during rollout restarts:

1. **Cache miss** (#282) — When a newly created pod isn't in the cache yet, the resolver falls back to a direct API read (`apiReader`) to fetch the resource and continue the owner chain walk.
2. **Stale cache** (#284) — When the cache returns a resource without controller ownerReferences (e.g., a terminating pod whose cached metadata lost its ownerRef), the resolver **re-fetches via the direct API** to verify. If the fresh metadata includes ownerReferences, the chain continues normally. If the resource genuinely has no owner (standalone Pod), the pod-level fingerprint is accepted. If the resource no longer exists, the signal is dropped.

This trust-but-verify approach prevents duplicate RemediationRequests caused by stale pod-level fingerprints while still supporting legitimate standalone Pods.

## Deduplication

The Gateway prevents duplicate remediations for the same issue using **CRD-based deduplication**. Before creating a new RemediationRequest, it checks whether an active (non-terminal) RemediationRequest already exists with the same signal fingerprint.

If a duplicate is detected, the new signal is dropped and logged.

## Signal Processing

After the Gateway creates a `RemediationRequest`, the Orchestrator creates a `SignalProcessing` CRD. The Signal Processing controller enriches the signal through several stages:

### Enrichment

- **Owner chain resolution** — Traces Pod → ReplicaSet → Deployment (or StatefulSet, DaemonSet, etc.)
- **Namespace labels** — Extracts environment, team, and other namespace-level metadata
- **Resource context** — Current resource status, events, and conditions

### Classification

Rego policies evaluate the enriched signal to determine:

- **Severity** — `critical`, `high`, `medium`, `low`, or `unknown`
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
