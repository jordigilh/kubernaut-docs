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

<!-- Links will point to kubernaut-demo-scenarios repo once scenarios are migrated -->

### Pod Lifecycle

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| crashloop (#120) | `KubePodCrashLooping` | `RollbackDeployment` | Bad ConfigMap causes CrashLoopBackOff, rollback restores previous revision |
| crashloop-helm (#135) | `KubePodCrashLooping` | `HelmRollback` | Helm-managed workload crash, Helm rollback to last known-good release |
| stuck-rollout (#130) | `KubeDeploymentRolloutStuck` | `RollbackDeployment` | Bad image tag stalls rollout, rollback restores healthy revision |
| memory-leak (#129) | `PredictedMemoryExhaustion` | `GracefulRestart` | Proactive: `predict_linear()` detects memory growth before OOM |
| memory-escalation | `KubePodOOMKilled` | `IncreaseMemoryLimits` | OOM kills trigger memory limit increase; escalates to human if limits are already high |
| slo-burn (#128) | `SLOErrorBudgetBurn` | `RollbackDeployment` | Error budget burn rate exceeds threshold, proactive rollback |

### GitOps

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| gitops-drift (#125) | `KubePodCrashLooping` | `GitRevertCommit` | Bad ConfigMap commit in Gitea, LLM selects git revert over kubectl rollback |
| cert-failure-gitops (#134) | `CertManagerCertNotReady` | `GitRevertCommit` / `FixCertificate` | Broken ClusterIssuer via git; LLM may choose git revert or direct fix ([details](multi-path-remediation.md)) |

### Infrastructure

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| cert-failure (#133) | `CertManagerCertNotReady` | `FixCertificate` | CA Secret deleted, workflow recreates it to restore certificate issuance |
| hpa-maxed (#123) | `HPAMaxedOut` | `ScaleHPA` | HPA at max replicas under sustained load |
| resource-contention | `KubePodOOMKilled` | `IncreaseMemoryLimits` | Memory contention causes OOM kills across competing workloads |
| resource-quota-exhaustion | `KubeResourceQuotaExhausted` | `AdjustResourceQuota` | Namespace quota prevents scaling ([details](remediation-history-feedback.md)) |
| network-policy-block (#138) | `NetworkPolicyBlock` | `FixNetworkPolicy` | Restrictive NetworkPolicy blocks legitimate traffic |
| statefulset-pvc-failure (#137) | `StatefulSetPVCFailure` | `FixStatefulSetPVC` | PVC binding failure prevents StatefulSet pod scheduling |

### Multi-Node

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| autoscale (#126) | `ClusterCapacityExhausted` | `AddNode` | Cluster autoscaling via kubeadm join |
| pending-taint (#122) | `KubePodPending` | `RemoveTaint` | Node taint prevents pod scheduling |
| pdb-deadlock (#124) | `PDBDeadlock` | `ResolvePDBDeadlock` | PodDisruptionBudget prevents necessary evictions |
| node-notready (#127) | `KubeNodeNotReady` | `CordonDrain` | Node health failure triggers cordon and workload migration |

### Advanced Pipeline

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| duplicate-alert-suppression | `KubePodCrashLooping` | `RollbackDeployment` | Validates that duplicate alerts for the same incident are suppressed |
| concurrent-cross-namespace | `KubePodCrashLooping` | Per-team workflow | Two teams hit the same fault; LLM selects different workflows based on risk labels |
| orphaned-pvc-no-action (#122) | `DiskPressure` | None (NoActionRequired) | LLM correctly identifies no remediation is needed |

### Service Mesh

| Scenario | Signal | Remediation | Description |
|----------|--------|-------------|-------------|
| mesh-routing-failure (#136) | `LinkerdRoutingFailure` | `FixServiceMeshRouting` | Linkerd service mesh routing misconfiguration |
