# Effectiveness Monitoring

After a remediation workflow completes, Kubernaut evaluates whether the fix actually resolved the issue. This is handled by the **Effectiveness Monitor** — a CRD controller that watches `EffectivenessAssessment` resources.

## How It Works

When a remediation reaches a terminal phase, the Orchestrator creates an `EffectivenessAssessment` CRD. The Effectiveness Monitor then:

1. **Waits for stabilization** — A configurable window (default: 5 minutes) allows the system to settle after the fix
2. **Evaluates effectiveness** through multiple dimensions
3. **Records the assessment** in the audit trail

```mermaid
sequenceDiagram
    participant RO as Orchestrator
    participant EA as EffectivenessAssessment CRD
    participant EM as Effectiveness Monitor
    participant DS as DataStorage

    RO->>EA: Create (on terminal phase)
    EM->>EA: Watch + reconcile
    Note over EM: Wait for stabilization window
    EM->>DS: Fetch pre-remediation hash
    EM->>EM: Evaluate effectiveness
    EM->>EA: Update status with assessment
    EM->>DS: Store audit event
```

## Assessment Components

The Effectiveness Monitor evaluates four components:

| Component | Method | What It Checks |
|---|---|---|
| **Health** | Kubernetes conditions (Pod Ready, Deployment Available) | Is the target resource healthy? |
| **Alert** | AlertManager query (if configured) | Has the triggering alert resolved? |
| **Metrics** | Prometheus query (if configured) | Have the relevant metrics recovered? |
| **Hash** | Compare pre/post resource spec hash | Did the resource spec change as expected? |

A **validity window** constrains when the assessment is meaningful — the monitor waits for the stabilization period before evaluating, ensuring transient states don't produce false results.

### Spec Hash Comparison

Before remediation, the system records a hash of the target resource's spec. After remediation, it compares:

- **Hash changed** → The resource was modified (expected for most remediations)
- **Hash unchanged** → No spec change detected (may indicate the fix didn't apply)

### Health Checks

The monitor checks Kubernetes-native health signals:

- Pod `Ready` conditions
- Deployment `Available` condition
- No `CrashLoopBackOff` or `OOMKilled` events

### Metric Evaluation

When Prometheus and AlertManager are configured, the monitor can check whether the triggering alert has resolved.

## Async Propagation Delays

Some remediations involve **asynchronous propagation** — for example, a GitOps tool syncing changes or an operator reconciling after a CR update. Kubernaut accounts for this with configurable delays:

| Delay | Default | Purpose |
|---|---|---|
| `stabilizationWindow` | 5 minutes | Time to wait after remediation before assessing |
| `gitOpsSyncDelay` | 3 minutes | Expected ArgoCD/Flux sync time |
| `operatorReconcileDelay` | 1 minute | Expected operator reconciliation time |

These are configurable via Helm values:

```yaml
remediationorchestrator:
  config:
    effectivenessAssessment:
      stabilizationWindow: "5m"
    asyncPropagation:
      gitOpsSyncDelay: "3m"
      operatorReconcileDelay: "1m"
```

## Effectiveness Scoring

The assessment produces an effectiveness score that captures:

- Whether the spec changed as expected
- Whether the resource is healthy
- Whether triggering metrics recovered
- How long the fix took to stabilize

This data is stored in DataStorage and provided to HolmesGPT as part of the remediation history context, enabling the LLM to consider past effectiveness when selecting workflows for similar incidents.

## Next Steps

- [Audit & Observability](audit-and-observability.md) — How assessments are recorded
- [Configuration Reference](configuration.md) — Tuning propagation delays and stabilization
- [Architecture: Effectiveness Assessment](../architecture/effectiveness.md) — Deep-dive into the timing model
