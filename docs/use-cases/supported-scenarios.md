# Supported Scenarios

Kubernaut validates remediation end to end against a **catalog of real-world scenarios**. Each scenario is mapped to an [ITIL](https://en.wikipedia.org/wiki/ITIL)-style support tier (L0–L3): from autonomous platform triage through known-error fixes, specialist remediation, and problem-management style root-cause work. Coverage is **37 validated scenarios** plus **6 planned** (see table). The catalog below is tagged **v1.4**.

| ITIL tier | Subgroup | Scenario | Status |
|-----------|----------|----------|--------|
| L0 — Automated Detection & Triage | — | Signal classification & severity normalization | Validated |
| L0 — Automated Detection & Triage | — | Duplicate Alert Suppression | Validated |
| L0 — Automated Detection & Triage | — | Concurrent Cross-Namespace | Validated |
| L0 — Automated Detection & Triage | — | Prompt Injection | Planned |
| L1 — Known Error Resolution | — | CrashLoopBackOff | Validated |
| L1 — Known Error Resolution | — | CrashLoopBackOff (Helm) | Validated |
| L1 — Known Error Resolution | — | Stuck Rollout | Validated |
| L1 — Known Error Resolution | — | Certificate Failure | Validated |
| L1 — Known Error Resolution | — | NetworkPolicy Block | Validated |
| L1 — Known Error Resolution | — | Orphaned PVCs (no-action) | Validated |
| L1 — Known Error Resolution | — | Image Pull Failure | Validated |
| L1 — Known Error Resolution | — | Route Misconfiguration | Validated |
| L1 — Known Error Resolution | — | Build Failure (S2I) | Validated |
| L1 — Known Error Resolution | — | SCC Violation | Validated |
| L1 — Known Error Resolution | — | Operator Health (OLM) | Validated |
| L1 — Known Error Resolution | — | RBAC Failure | Validated |
| L1 — Known Error Resolution | — | VM Boot Failure | Planned |
| L2 — Specialist Remediation | Capacity & Availability | Memory Leak (Proactive) | Validated |
| L2 — Specialist Remediation | Capacity & Availability | Memory Escalation | Validated |
| L2 — Specialist Remediation | Capacity & Availability | SLO Burn Rate | Validated |
| L2 — Specialist Remediation | Capacity & Availability | HPA Maxed Out | Validated |
| L2 — Specialist Remediation | Capacity & Availability | PDB Deadlock | Validated |
| L2 — Specialist Remediation | Infrastructure | Pending Taint | Validated |
| L2 — Specialist Remediation | Infrastructure | Node NotReady | Validated |
| L2 — Specialist Remediation | Infrastructure | Mesh Routing Failure | Validated |
| L2 — Specialist Remediation | Infrastructure | GitOps Drift (ArgoCD) | Validated |
| L2 — Specialist Remediation | Advanced Diagnostics | Cross-Namespace Dependency | Validated |
| L2 — Specialist Remediation | Advanced Diagnostics | Severity Misdirection | Validated |
| L2 — Specialist Remediation | Advanced Diagnostics | Red-Herring Noise | Validated |
| L2 — Specialist Remediation | Advanced Diagnostics | Alert Misdirection | Validated |
| L2 — Specialist Remediation | OpenShift Virtualization | VM Migration Failure | Planned |
| L2 — Specialist Remediation | OpenShift Virtualization | VM Network Post-Migration | Planned |
| L3 — Problem Management / Root-Cause Analysis | Capacity & Storage | Autoscale (cluster) | Validated |
| L3 — Problem Management / Root-Cause Analysis | Capacity & Storage | StatefulSet PVC Failure | Validated |
| L3 — Problem Management / Root-Cause Analysis | Capacity & Storage | DiskPressure Migration † | Validated |
| L3 — Problem Management / Root-Cause Analysis | Capacity & Storage | PVC Capacity Forecast | Validated |
| L3 — Problem Management / Root-Cause Analysis | Root-Cause & Cascade | Resource Contention | Validated |
| L3 — Problem Management / Root-Cause Analysis | Root-Cause & Cascade | DB Connection Saturation | Validated |
| L3 — Problem Management / Root-Cause Analysis | Root-Cause & Cascade | Cascading Service Failure | Validated |
| L3 — Problem Management / Root-Cause Analysis | Root-Cause & Cascade | etcd Defrag Forecast | Validated |
| L3 — Problem Management / Root-Cause Analysis | Platform Behavior | ResourceQuota Exhaustion | Validated |
| L3 — Problem Management / Root-Cause Analysis | OpenShift Virtualization | VM Storage Degradation | Planned |
| L3 — Problem Management / Root-Cause Analysis | OpenShift Virtualization | VM Cascading Migration Drain | Planned |

† **DiskPressure Migration** spans multiple L3 sub-categories (storage, infrastructure, proactive, GitOps-aware), with OCP and Ansible Automation Platform integration.

Planned rows follow the Kubernaut v1.4 ITIL mapping appendix: additional L0/L1 items and OpenShift Virtualization scenarios are targeted for **v1.5**. Scenarios are **E2E tested with golden transcripts** as part of validation.
