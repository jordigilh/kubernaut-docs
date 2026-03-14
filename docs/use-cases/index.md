---
hide:
  - toc
---

# Use Cases

Real-world AIOps behavior observed during Kubernaut demo validation. These are not synthetic
examples -- they capture actual LLM decisions, remediation outcomes, and pipeline behavior
from live Kubernetes clusters.

## Deep Dives

- [Multiple Remediation Paths](multi-path-remediation.md) -- How the LLM chose an alternative
  fix for a GitOps-managed Certificate failure, and why both approaches are valid
- [Remediation History Feedback](remediation-history-feedback.md) -- How the LLM refused to
  repeat a failed workflow after remediation history revealed the prior attempt's failure,
  escalating to human review instead

## Demo Scenario Catalog

The following scenarios demonstrate Kubernaut's remediation pipeline across different failure
modes, infrastructure patterns, and pipeline behaviors. Each scenario injects a fault,
triggers a Prometheus alert, and validates the full remediation lifecycle.

All scenarios are available in the [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios) repository with run scripts, manifests, and step-by-step instructions.

### Pod Lifecycle

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| [crashloop](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/crashloop) | `KubePodCrashLooping` | `RollbackDeployment` | Bad ConfigMap causes CrashLoopBackOff, rollback restores previous revision |
| [crashloop-helm](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/crashloop-helm) | `KubePodCrashLooping` | `HelmRollback` | Helm-managed workload crash, Helm rollback to last known-good release |
| [stuck-rollout](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/stuck-rollout) | `KubeDeploymentRolloutStuck` | `RollbackDeployment` | Bad image tag stalls rollout, rollback restores healthy revision |
| [memory-leak](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/memory-leak) | `PredictedMemoryExhaustion` | `GracefulRestart` | Proactive: `predict_linear()` detects memory growth before OOM |
| [memory-escalation](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/memory-escalation) | `KubePodOOMKilled` | `IncreaseMemoryLimits` | OOM kills trigger memory limit increase; escalates to human if limits are already high |
| [slo-burn](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/slo-burn) | `SLOErrorBudgetBurn` | `RollbackDeployment` | Error budget burn rate exceeds threshold, proactive rollback |

### GitOps

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| [gitops-drift](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/gitops-drift) | `KubePodCrashLooping` | `GitRevertCommit` | Bad ConfigMap commit in Gitea, LLM selects git revert over kubectl rollback |
| [cert-failure-gitops](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/cert-failure-gitops) | `CertManagerCertNotReady` | `GitRevertCommit` / `FixCertificate` | Broken ClusterIssuer via git; LLM may choose git revert or direct fix ([details](multi-path-remediation.md)) |

### Infrastructure

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| [cert-failure](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/cert-failure) | `CertManagerCertNotReady` | `FixCertificate` | CA Secret deleted, workflow recreates it to restore certificate issuance |
| [hpa-maxed](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/hpa-maxed) | `HPAMaxedOut` | `ScaleHPA` | HPA at max replicas under sustained load |
| [resource-contention](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/resource-contention) | `KubePodOOMKilled` | `IncreaseMemoryLimits` | Memory contention causes OOM kills across competing workloads |
| [resource-quota-exhaustion](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/resource-quota-exhaustion) | `KubeResourceQuotaExhausted` | `AdjustResourceQuota` | Namespace quota prevents scaling ([details](remediation-history-feedback.md)) |
| [network-policy-block](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/network-policy-block) | `KubeDeploymentReplicasMismatch` | `FixNetworkPolicy` | Deny-all NetworkPolicy blocks traffic; readiness-based signal self-resolves after remediation |
| [statefulset-pvc-failure](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/statefulset-pvc-failure) | `StatefulSetPVCFailure` | `FixStatefulSetPVC` | PVC binding failure prevents StatefulSet pod scheduling |

### Multi-Node

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| [autoscale](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/autoscale) | `ClusterCapacityExhausted` | `AddNode` | Cluster autoscaling via kubeadm join |
| [pending-taint](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/pending-taint) | `KubePodPending` | `RemoveTaint` | Node taint prevents pod scheduling |
| [pdb-deadlock](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/pdb-deadlock) | `PDBDeadlock` | `ResolvePDBDeadlock` | PodDisruptionBudget prevents necessary evictions |
| [node-notready](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/node-notready) | `KubeNodeNotReady` | `CordonDrain` | Node health failure triggers cordon and workload migration |

### Advanced Pipeline

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| [duplicate-alert-suppression](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/duplicate-alert-suppression) | `KubePodCrashLooping` | `RollbackDeployment` | Validates that duplicate alerts for the same incident are suppressed |
| [concurrent-cross-namespace](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/concurrent-cross-namespace) | `KubePodCrashLooping` | Per-team workflow | Two teams hit the same fault; LLM selects different workflows based on risk labels |
| [orphaned-pvc-no-action](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/orphaned-pvc-no-action) | `DiskPressure` | None (NoActionRequired) | LLM correctly identifies no remediation is needed |

### Service Mesh

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| [mesh-routing-failure](https://github.com/jordigilh/kubernaut-demo-scenarios/tree/main/scenarios/mesh-routing-failure) | `LinkerdRoutingFailure` | `FixServiceMeshRouting` | Linkerd service mesh routing misconfiguration |
