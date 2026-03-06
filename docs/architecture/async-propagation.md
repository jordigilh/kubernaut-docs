# Async Propagation

Many Kubernetes environments use **GitOps tools** (ArgoCD, Flux) or **operators** that introduce propagation delays between a change being applied and that change taking full effect. Kubernaut accounts for these delays in its effectiveness assessment model.

## The Problem

When Kubernaut patches a Deployment:

1. The patch is applied to the Kubernetes API → **immediate**
2. ArgoCD detects drift and syncs → **1-5 minutes**
3. The operator reconciles the new state → **seconds to minutes**
4. New pods roll out and become ready → **seconds to minutes**

If the effectiveness assessment runs immediately after the patch, it may see an unhealthy state even though the fix is working — it just hasn't propagated yet.

## Delay Model

Kubernaut uses configurable propagation delays that are **additive based on detected target characteristics**. The Orchestrator detects whether the remediation target is GitOps-managed or an operator-managed CR and computes the total propagation delay accordingly.

| Parameter | Default | Applies When | Configurable Via |
|---|---|---|---|
| `gitOpsSyncDelay` | 3 minutes | Target is GitOps-managed (ArgoCD/Flux) | `remediationorchestrator.config.asyncPropagation.gitOpsSyncDelay` |
| `operatorReconcileDelay` | 1 minute | Target is an operator-managed CR | `remediationorchestrator.config.asyncPropagation.operatorReconcileDelay` |
| `stabilizationWindow` | 5 minutes | Always (all targets) | `remediationorchestrator.config.effectivenessAssessment.stabilizationWindow` |

## When Delays Apply

The propagation delay is computed from two independent flags (`isGitOps`, `isCRD`):

| Target Type | Propagation Delay | Total Wait Before Assessment |
|---|---|---|
| **Sync target** (direct patch) | 0 | `stabilizationWindow` |
| **GitOps-managed** | `gitOpsSyncDelay` | `gitOpsSyncDelay` + `stabilizationWindow` |
| **Operator-managed CR** | `operatorReconcileDelay` | `operatorReconcileDelay` + `stabilizationWindow` |
| **GitOps + operator CR** (both) | `gitOpsSyncDelay` + `operatorReconcileDelay` | Both delays + `stabilizationWindow` |

The delays are additive — if a target is both GitOps-managed and an operator CR, both delays compound. Setting either delay to `0` disables that stage.

The Orchestrator computes a `hashComputeDelay` duration (sum of applicable propagation delays) and sets it on the `EffectivenessAssessment` CRD spec. The Effectiveness Monitor then computes the deferral deadline as `EA creation time + hashComputeDelay` and enters a `WaitingForPropagation` phase until this deadline passes, ensuring the spec hash is computed after the change has fully propagated.

## Tuning

For environments with faster or slower propagation:

```yaml
# values.yaml
remediationorchestrator:
  config:
    effectivenessAssessment:
      stabilizationWindow: "10m"  # longer for slow rollouts
    asyncPropagation:
      gitOpsSyncDelay: "5m"       # longer for slow ArgoCD sync
      operatorReconcileDelay: "2m" # longer for complex operators
```

## Next Steps

- [Effectiveness Assessment](effectiveness.md) — Full assessment model
- [Configuration Reference](../user-guide/configuration.md) — All configurable parameters
