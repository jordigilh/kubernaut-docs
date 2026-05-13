# Supported Scenarios

Kubernaut validates remediation end to end against a catalog of real-world **OpenShift Container Platform (OCP)** incident scenarios. Each scenario is mapped to an ITIL-style support tier (L0–L3) reflecting how OCP operations teams typically triage and escalate platform issues — from autonomous detection through known-error resolution, specialist investigation, and deep root-cause analysis.

Coverage as of v1.4: **39 validated scenarios** with E2E golden transcript testing, plus **7 planned** for future releases (OpenShift Virtualization, interactive forensic post-mortems, and TSM incident record creation).

## L0 — Automated Detection & Triage

Platform handles autonomously — no human trigger required.

| Scenario | Status |
|----------|--------|
| Signal classification & severity normalization | Validated |
| Duplicate Alert Suppression | Validated |
| Concurrent Cross-Namespace | Validated |
| Prompt Injection | Validated |

## L1 — Known Error Resolution

Standard workflow from catalog — first-line OCP support applies a documented fix.

| Scenario | Status |
|----------|--------|
| CrashLoopBackOff | Validated |
| CrashLoopBackOff (Helm) | Validated |
| Stuck Rollout | Validated |
| Certificate Failure | Validated |
| NetworkPolicy Block | Validated |
| Orphaned PVCs (no-action) | Validated |
| Image Pull Failure | Validated |
| Route Misconfiguration | Validated |
| Build Failure (S2I) | Validated |
| SCC Violation | Validated |
| Operator Health (OLM) | Validated |
| RBAC Failure | Validated |
| VM Boot Failure | Planned (v1.5) |

## L2 — Specialist Remediation

Deep investigation with targeted remediation — OCP resolver group level.

### Capacity & Availability

| Scenario | Status |
|----------|--------|
| Memory Leak (Proactive) | Validated |
| Memory Escalation | Validated |
| SLO Burn Rate | Validated |
| HPA Maxed Out | Validated |
| PDB Deadlock | Validated |

### Infrastructure

| Scenario | Status |
|----------|--------|
| Pending Taint | Validated |
| Node NotReady | Validated |
| Mesh Routing Failure | Validated |
| GitOps Drift (ArgoCD) | Validated |

### Advanced Diagnostics

| Scenario | Status |
|----------|--------|
| Cross-Namespace Dependency | Validated |
| Severity Misdirection | Validated |
| Red-Herring Noise | Validated |
| Alert Misdirection | Validated |

### OpenShift Virtualization

| Scenario | Status |
|----------|--------|
| VM Migration Failure | Planned (v1.5) |
| VM Network Post-Migration | Planned (v1.5) |

## L3 — Problem Management / Root-Cause Analysis

Deep RCA, capacity planning, and cascading failure analysis across the OCP platform.

### Capacity & Storage

| Scenario | Status |
|----------|--------|
| Autoscale (cluster) | Validated |
| StatefulSet PVC Failure | Validated |
| DiskPressure Migration | Validated |
| PVC Capacity Forecast | Validated |

### Root-Cause & Cascade

| Scenario | Status |
|----------|--------|
| Resource Contention | Validated |
| DB Connection Saturation | Validated |
| Cascading Service Failure | Validated |
| etcd Defrag Forecast | Validated |

### Platform Behavior

| Scenario | Status |
|----------|--------|
| ResourceQuota Exhaustion | Validated |

### Post-Incident Review

| Scenario | Status |
|----------|--------|
| Post Incident Review | Validated |
| Interactive forensic post-mortem | Planned (v1.5) |
| Incident record creation (TSM) | Planned (v1.6+) |

### OpenShift Virtualization

| Scenario | Status |
|----------|--------|
| VM Storage Degradation | Planned (v1.5) |
| VM Cascading Migration Drain | Planned (v1.5) |

---

!!! note "DiskPressure Migration"
    DiskPressure Migration spans multiple L3 sub-categories (storage, infrastructure, proactive, GitOps-aware) with OCP and Ansible Automation Platform (AAP) integration.

!!! info "Validation methodology"
    All validated scenarios are E2E tested with **golden transcripts** from the [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios) repository — recorded investigation and remediation sessions that serve as regression baselines. Planned scenarios for v1.5 focus on OpenShift Virtualization workloads and interactive forensic post-mortems. Incident record creation via TSM integration is targeted for v1.6+.
