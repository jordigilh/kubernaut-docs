# Rego Policy Reference

This page is the authoritative reference for all input fields available to Rego policies in Kubernaut. Use it when writing or customizing policies for **Signal Processing** (SP) classification and **AI Analysis** (AA) approval gates.

All policies are deployed as ConfigMaps and support hot-reload. See [Rego Policies](policies.md) for an overview of each policy's purpose and default behavior.

!!! tip "Writing custom policies"
    Every `input.*` field listed below is available in your Rego rules. The default policies shipped with Kubernaut use only a subset -- you can reference any field to build richer logic tailored to your organization.

---

## Signal Processing Policies

SP policies run during signal enrichment, before the signal reaches AI Analysis. Each classifier passes a specific input schema to its Rego policy.

### Severity Policy

**Package:** `signalprocessing.severity`

**Rego query:** `data.signalprocessing.severity.determine_severity`

**Expected output:** A string -- one of `critical`, `high`, `medium`, `low`, `unknown`

#### Input Fields

| Field | Type | Description |
|---|---|---|
| `input.signal.severity` | `string` | Raw severity string from the alert source (e.g., `critical`, `P0`, `Sev1`) |
| `input.signal.type` | `string` | Signal type (e.g., `alert`, `event`) |
| `input.signal.source` | `string` | Alert source identifier (e.g., `prometheus`, `pagerduty`) |

#### Example: PagerDuty P0--P4 Mapping

```rego
package signalprocessing.severity

import rego.v1

severity_map := {
    "p0": "critical",
    "p1": "critical",
    "p2": "high",
    "p3": "medium",
    "p4": "low",
}

determine_severity := severity_map[lower(input.signal.severity)] if {
    lower(input.signal.severity) in object.keys(severity_map)
}

# Fallback: unmapped severity escalates to critical (conservative)
default determine_severity := "critical"
```

#### Example: Source-Aware Severity

```rego
package signalprocessing.severity

import rego.v1

# PagerDuty alerts use P0-P4
determine_severity := "critical" if {
    input.signal.source == "pagerduty"
    lower(input.signal.severity) in {"p0", "p1"}
}

# Prometheus alerts use standard severity labels
determine_severity := input.signal.severity if {
    input.signal.source == "prometheus"
    input.signal.severity in {"critical", "high", "medium", "low"}
}

default determine_severity := "unknown"
```

---

### Environment Policy

**Package:** `signalprocessing.environment`

**Rego query:** `data.signalprocessing.environment.result`

**Expected output:** `{"environment": string, "source": string}`

#### Input Fields

| Field | Type | Description |
|---|---|---|
| `input.namespace.name` | `string` | Kubernetes namespace name |
| `input.namespace.labels` | `map[string]string` | All labels on the namespace |
| `input.signal.labels` | `map[string]string` | Labels attached to the incoming signal/alert |

#### Example: Label-Based with Namespace Name Fallback

```rego
package signalprocessing.environment

import rego.v1

# Primary: kubernaut.ai/environment namespace label
result := {"environment": lower(env), "source": "namespace-labels"} if {
    env := input.namespace.labels["kubernaut.ai/environment"]
    env != ""
}

# Fallback: namespace name convention
result := {"environment": "production", "source": "namespace-name"} if {
    not input.namespace.labels["kubernaut.ai/environment"]
    startswith(input.namespace.name, "prod")
}

result := {"environment": "staging", "source": "namespace-name"} if {
    not input.namespace.labels["kubernaut.ai/environment"]
    startswith(input.namespace.name, "staging")
}

default result := {"environment": "", "source": "unclassified"}
```

#### Example: Signal Label Override

```rego
package signalprocessing.environment

import rego.v1

# Allow alerts to carry an explicit environment label
result := {"environment": lower(env), "source": "signal-labels"} if {
    env := input.signal.labels["environment"]
    env != ""
}

# Otherwise use namespace label
result := {"environment": lower(env), "source": "namespace-labels"} if {
    not input.signal.labels["environment"]
    env := input.namespace.labels["kubernaut.ai/environment"]
    env != ""
}

default result := {"environment": "", "source": "unclassified"}
```

---

### Priority Policy

**Package:** `signalprocessing.priority`

**Rego query:** `data.signalprocessing.priority.result`

**Expected output:** `{"priority": "P0"|"P1"|"P2"|"P3", "policy_name": string}`

#### Input Fields

| Field | Type | Description |
|---|---|---|
| `input.signal.severity` | `string` | Normalized severity from the severity policy (`critical`, `high`, etc.) |
| `input.signal.source` | `string` | Alert source identifier |
| `input.environment` | `string` | Environment classification from the environment policy |
| `input.namespace_labels` | `map[string]string` | All labels on the namespace (empty `{}` if unavailable) |
| `input.workload_labels` | `map[string]string` | All labels on the workload (empty `{}` if unavailable) |

#### Example: Score-Based Priority (Default)

```rego
package signalprocessing.priority

import rego.v1

# Severity dimension
severity_score := 3 if { lower(input.signal.severity) == "critical" }
severity_score := 2 if { lower(input.signal.severity) == "warning" }
severity_score := 1 if { lower(input.signal.severity) == "info" }
default severity_score := 0

# Environment dimension
env_scores contains 3 if { lower(input.environment) == "production" }
env_scores contains 2 if { lower(input.environment) == "staging" }
env_scores contains 1 if { lower(input.environment) == "development" }

# Tier label boost
env_scores contains 3 if { input.namespace_labels["tier"] == "critical" }
env_scores contains 2 if { input.namespace_labels["tier"] == "high" }

env_score := max(env_scores) if { count(env_scores) > 0 }
default env_score := 0

composite_score := severity_score + env_score

result := {"priority": "P0", "policy_name": "score-based"} if { composite_score >= 6 }
result := {"priority": "P1", "policy_name": "score-based"} if { composite_score == 5 }
result := {"priority": "P2", "policy_name": "score-based"} if { composite_score == 4 }
result := {"priority": "P3", "policy_name": "score-based"} if { composite_score < 4; composite_score > 0 }

default result := {"priority": "P3", "policy_name": "default-catch-all"}
```

#### Example: Workload-Label Boost

```rego
package signalprocessing.priority

import rego.v1

# Payment services always get P0
result := {"priority": "P0", "policy_name": "payment-override"} if {
    input.workload_labels["app"] == "payment-service"
    lower(input.signal.severity) in {"critical", "high"}
}

# Otherwise fall through to score-based (omitted for brevity)
```

---

### Business Policy

**Package:** `signalprocessing.business`

**Rego query:** `data.signalprocessing.business.result`

**Expected output:** `{"business_unit": string, "service_owner": string, "criticality": string, "sla": string, "source": string}`

#### Input Fields

| Field | Type | Description |
|---|---|---|
| `input.environment` | `string` | Environment classification from the environment policy |
| `input.namespace.name` | `string` | Kubernetes namespace name |
| `input.namespace.labels` | `map[string]string` | All labels on the namespace |
| `input.namespace.annotations` | `map[string]string` | All annotations on the namespace |
| `input.workload.kind` | `string` | Workload kind (`Deployment`, `StatefulSet`, etc.) |
| `input.workload.name` | `string` | Workload name |
| `input.workload.labels` | `map[string]string` | All labels on the workload |
| `input.workload.annotations` | `map[string]string` | All annotations on the workload |

!!! note "Well-known label keys"
    The default policy reads `kubernaut.ai/business-unit`, `kubernaut.ai/service-owner`, `kubernaut.ai/criticality`, and `kubernaut.ai/sla-tier` from namespace labels. Custom policies can read any labels or annotations.

#### Example: Label-Based Classification (Default)

```rego
package signalprocessing.business

import rego.v1

result := {
    "business_unit": bu,
    "service_owner": owner,
    "criticality": crit,
    "sla": sla,
    "source": "namespace-labels",
} if {
    bu := object.get(input.namespace.labels, "kubernaut.ai/business-unit", "")
    bu != ""
    owner := object.get(input.namespace.labels, "kubernaut.ai/service-owner", "")
    crit := object.get(input.namespace.labels, "kubernaut.ai/criticality", "medium")
    sla := object.get(input.namespace.labels, "kubernaut.ai/sla-tier", "tier-3")
}

default result := {
    "business_unit": "",
    "service_owner": "",
    "criticality": "",
    "sla": "",
    "source": "unclassified",
}
```

#### Example: Workload Annotation Override

```rego
package signalprocessing.business

import rego.v1

# Workload annotations take precedence over namespace labels
result := {
    "business_unit": bu,
    "service_owner": owner,
    "criticality": crit,
    "sla": sla,
    "source": "workload-annotations",
} if {
    bu := input.workload.annotations["team.company.com/business-unit"]
    bu != ""
    owner := object.get(input.workload.annotations, "team.company.com/owner", "")
    crit := object.get(input.workload.annotations, "team.company.com/criticality", "medium")
    sla := object.get(input.workload.annotations, "team.company.com/sla", "tier-3")
}
```

---

### Custom Labels Policy

**Package:** `signalprocessing.customlabels`

**Rego query:** `data.signalprocessing.customlabels.labels`

**Expected output:** `map[string]string` -- key-value pairs extracted for workflow scoring

#### Input Fields

| Field | Type | Description |
|---|---|---|
| `input.kubernetes.namespace.name` | `string` | Kubernetes namespace name |
| `input.kubernetes.namespace.labels` | `map[string]string` | All labels on the namespace |
| `input.kubernetes.namespace.annotations` | `map[string]string` | All annotations on the namespace |
| `input.kubernetes.workload.kind` | `string` | Workload kind (`Deployment`, `StatefulSet`, etc.) |
| `input.kubernetes.workload.name` | `string` | Workload name |
| `input.kubernetes.workload.labels` | `map[string]string` | All labels on the workload |
| `input.kubernetes.workload.annotations` | `map[string]string` | All annotations on the workload |
| `input.kubernetes.ownerChain` | `[]object` | Owner reference chain (e.g., Pod → ReplicaSet → Deployment) |
| `input.signal.type` | `string` | Signal type |
| `input.signal.severity` | `string` | Raw severity string |
| `input.signal.source` | `string` | Alert source identifier |

!!! info "Validation limits"
    Custom labels are validated against hard limits: max 10 keys, max 5 values per key, max 63 chars per key, max 100 chars per value. Keys starting with `kubernaut.ai/` or `system/` are reserved and will be rejected.

#### Example: Extract `kubernaut.ai/label-*` Namespace Labels (Default)

```rego
package signalprocessing.customlabels

import rego.v1

labels[key] := value if {
    some k, v in input.kubernetes.namespace.labels
    startswith(k, "kubernaut.ai/label-")
    key := trim_prefix(k, "kubernaut.ai/label-")
    value := v
}
```

#### Example: Combine Namespace and Workload Labels

```rego
package signalprocessing.customlabels

import rego.v1

# Extract from namespace labels (kubernaut.ai/label-*)
labels[key] := value if {
    some k, v in input.kubernetes.namespace.labels
    startswith(k, "kubernaut.ai/label-")
    key := trim_prefix(k, "kubernaut.ai/label-")
    value := v
}

# Also extract from workload labels (app.kubernetes.io/*)
labels[key] := value if {
    some k, v in input.kubernetes.workload.labels
    startswith(k, "app.kubernetes.io/")
    key := trim_prefix(k, "app.kubernetes.io/")
    value := v
}
```

#### Example: Severity-Aware Custom Labels

```rego
package signalprocessing.customlabels

import rego.v1

# Tag critical alerts with an escalation label
labels["escalation"] := "immediate" if {
    input.signal.severity == "critical"
    input.kubernetes.namespace.labels["kubernaut.ai/environment"] == "production"
}

labels["escalation"] := "standard" if {
    input.signal.severity != "critical"
}
```

---

## AI Analysis Approval Policy

The approval policy runs after the investigation pipeline returns a successful workflow selection. It determines whether the remediation requires human approval or can proceed automatically.

**Package:** `aianalysis.approval`

**Rego query:** `data.aianalysis.approval`

**Expected outputs:**

| Output | Type | Description |
|---|---|---|
| `require_approval` | `bool` | `true` if human approval is needed |
| `reason` | `string` | Explanation shown in the `RemediationApprovalRequest` |

### Input Fields

#### Signal Context

| Field | Type | Description |
|---|---|---|
| `input.signal_type` | `string` | Signal name that triggered the analysis (e.g., `OOMKilled`, `CrashLoopBackOff`) |
| `input.severity` | `string` | Normalized severity from SP (`critical`, `high`, `medium`, `low`) |
| `input.environment` | `string` | Environment classification from SP (`production`, `staging`, etc.) |
| `input.business_priority` | `string` | Priority assigned by SP (`P0`--`P3`) |

#### Target and Affected Resources

| Field | Type | Description |
|---|---|---|
| `input.target_resource.kind` | `string` | Kind of the resource targeted by the signal (e.g., `Deployment`) |
| `input.target_resource.name` | `string` | Name of the target resource |
| `input.target_resource.namespace` | `string` | Namespace of the target resource |
| `input.affected_resource` | `object` or `null` | LLM-identified resource for remediation (ADR-055). `null` when the LLM could not identify the root cause resource |
| `input.affected_resource.kind` | `string` | Kind of the affected resource (e.g., `Deployment`, `StatefulSet`, `Node`) |
| `input.affected_resource.name` | `string` | Name of the affected resource |
| `input.affected_resource.namespace` | `string` | Namespace of the affected resource |

#### Investigation Results

| Field | Type | Description |
|---|---|---|
| `input.confidence` | `float` | LLM confidence score for the selected workflow (0.0--1.0) |
| `input.confidence_threshold` | `float` or absent | Operator-configurable threshold (default: 0.8). Set via Helm `aianalysis.rego.confidenceThreshold` |
| `input.warnings` | `[]string` | Warnings from the investigation pipeline |
| `input.failed_detections` | `[]string` | Labels that the LLM could not determine (e.g., `"gitOpsManaged"`, `"pdbProtected"`) |

#### Detected Labels (Post-RCA)

These are infrastructure characteristics detected by the LLM during root cause analysis.

| Field | Type | Description |
|---|---|---|
| `input.detected_labels.git_ops_managed` | `bool` | Whether the workload is managed by a GitOps tool |
| `input.detected_labels.git_ops_tool` | `string` | GitOps tool name (e.g., `argocd`, `flux`). Empty if not GitOps-managed |
| `input.detected_labels.pdb_protected` | `bool` | Whether a PodDisruptionBudget protects the workload |
| `input.detected_labels.hpa_enabled` | `bool` | Whether a HorizontalPodAutoscaler is configured |
| `input.detected_labels.stateful` | `bool` | Whether the workload is stateful (StatefulSet, PVC-backed) |
| `input.detected_labels.helm_managed` | `bool` | Whether the workload was deployed via Helm |
| `input.detected_labels.network_isolated` | `bool` | Whether NetworkPolicies restrict the workload |
| `input.detected_labels.service_mesh` | `string` | Service mesh name (e.g., `istio`, `linkerd`). Empty if none |

#### Custom Labels and Business Classification

| Field | Type | Description |
|---|---|---|
| `input.custom_labels` | `map[string][]string` | Operator-defined labels from the custom labels policy |
| `input.business_classification.business_unit` | `string` | Business unit from the business policy |
| `input.business_classification.service_owner` | `string` | Service owner team |
| `input.business_classification.criticality` | `string` | Criticality level (`critical`, `high`, `medium`, `low`) |
| `input.business_classification.sla_requirement` | `string` | SLA tier (e.g., `platinum`, `gold`, `silver`, `bronze`) |

### Example: Default Policy (Environment-Gated)

The default policy shipped with Kubernaut requires approval for all production remediations and when the LLM cannot identify the affected resource:

```rego
package aianalysis.approval

import rego.v1

default require_approval := false
default reason := "Auto-approved"

has_affected_resource if {
    input.affected_resource
    input.affected_resource.kind != ""
}

is_production if {
    input.environment == "production"
}

require_approval if { not has_affected_resource }
require_approval if { is_production }

risk_factors contains {"score": 90, "reason": "Missing affected resource"} if {
    not has_affected_resource
}
risk_factors contains {"score": 70, "reason": "Production environment"} if {
    is_production
}

all_scores contains f.score if { some f in risk_factors }
max_risk_score := max(all_scores) if { count(all_scores) > 0 }
reason := f.reason if { some f in risk_factors; f.score == max_risk_score }
```

### Example: Confidence-Gated Approval

Require approval only when confidence is below the threshold:

```rego
package aianalysis.approval

import rego.v1

default require_approval := false
default reason := "Auto-approved (high confidence)"

default confidence_threshold := 0.8

confidence_threshold := input.confidence_threshold if {
    input.confidence_threshold
}

is_high_confidence if {
    input.confidence >= confidence_threshold
}

has_affected_resource if {
    input.affected_resource
    input.affected_resource.kind != ""
}

# Always require approval when affected resource is unknown
require_approval if { not has_affected_resource }

# Low confidence in any environment
require_approval if { not is_high_confidence }

risk_factors contains {"score": 90, "reason": "Missing affected resource"} if {
    not has_affected_resource
}
risk_factors contains {"score": 65, "reason": "Low confidence score"} if {
    not is_high_confidence
}

all_scores contains f.score if { some f in risk_factors }
max_risk_score := max(all_scores) if { count(all_scores) > 0 }
reason := f.reason if { some f in risk_factors; f.score == max_risk_score }
```

### Example: Business-Criticality-Aware Approval

Gate approval based on business classification and detected infrastructure characteristics:

```rego
package aianalysis.approval

import rego.v1

default require_approval := false
default reason := "Auto-approved"

has_affected_resource if {
    input.affected_resource
    input.affected_resource.kind != ""
}

# Critical business services always require approval
require_approval if {
    input.business_classification.criticality == "critical"
}

# Stateful workloads in production require approval
require_approval if {
    input.environment == "production"
    input.detected_labels.stateful == true
}

# GitOps-managed workloads with low confidence require approval
require_approval if {
    input.detected_labels.git_ops_managed == true
    input.confidence < 0.9
}

# PDB-protected workloads require approval (disruption risk)
require_approval if {
    input.detected_labels.pdb_protected == true
}

require_approval if { not has_affected_resource }

risk_factors contains {"score": 85, "reason": "Critical business service"} if {
    input.business_classification.criticality == "critical"
}
risk_factors contains {"score": 90, "reason": "Missing affected resource"} if {
    not has_affected_resource
}
risk_factors contains {"score": 75, "reason": "Stateful production workload"} if {
    input.environment == "production"
    input.detected_labels.stateful == true
}
risk_factors contains {"score": 70, "reason": "GitOps-managed with low confidence"} if {
    input.detected_labels.git_ops_managed == true
    input.confidence < 0.9
}
risk_factors contains {"score": 60, "reason": "PDB-protected workload"} if {
    input.detected_labels.pdb_protected == true
}

all_scores contains f.score if { some f in risk_factors }
max_risk_score := max(all_scores) if { count(all_scores) > 0 }
reason := f.reason if { some f in risk_factors; f.score == max_risk_score }
```

### Example: Custom-Label-Driven Approval

Use operator-defined custom labels to control approval flow:

```rego
package aianalysis.approval

import rego.v1

default require_approval := false
default reason := "Auto-approved"

# Require approval if custom label "approval-required" is set to "true"
require_approval if {
    "true" in input.custom_labels["approval-required"]
}

# Require approval for specific teams
require_approval if {
    "payments" in input.custom_labels["team"]
    input.environment == "production"
}

risk_factors contains {"score": 80, "reason": "Team-mandated approval for payments in production"} if {
    "payments" in input.custom_labels["team"]
    input.environment == "production"
}
risk_factors contains {"score": 70, "reason": "Namespace-level approval requirement"} if {
    "true" in input.custom_labels["approval-required"]
}

all_scores contains f.score if { some f in risk_factors }
max_risk_score := max(all_scores) if { count(all_scores) > 0 }
reason := f.reason if { some f in risk_factors; f.score == max_risk_score }
```

---

## Quick Reference: All Input Fields

### Signal Processing

| Policy | Input Path | Fields |
|---|---|---|
| **Severity** | `input.signal.*` | `severity`, `type`, `source` |
| **Environment** | `input.namespace.*`, `input.signal.*` | `namespace.name`, `namespace.labels`, `signal.labels` |
| **Priority** | `input.signal.*`, `input.*` | `signal.severity`, `signal.source`, `environment`, `namespace_labels`, `workload_labels` |
| **Business** | `input.namespace.*`, `input.workload.*`, `input.*` | `namespace.name/labels/annotations`, `workload.kind/name/labels/annotations`, `environment` |
| **Custom Labels** | `input.kubernetes.*`, `input.signal.*` | `kubernetes.namespace.name/labels/annotations`, `kubernetes.workload.kind/name/labels/annotations`, `kubernetes.ownerChain`, `signal.type/severity/source` |

### AI Analysis Approval

| Category | Input Path | Fields |
|---|---|---|
| **Signal context** | `input.*` | `signal_type`, `severity`, `environment`, `business_priority` |
| **Target resource** | `input.target_resource.*` | `kind`, `name`, `namespace` |
| **Affected resource** | `input.affected_resource.*` | `kind`, `name`, `namespace` (or `null`) |
| **Investigation** | `input.*` | `confidence`, `confidence_threshold`, `warnings`, `failed_detections` |
| **Detected labels** | `input.detected_labels.*` | `git_ops_managed`, `git_ops_tool`, `pdb_protected`, `hpa_enabled`, `stateful`, `helm_managed`, `network_isolated`, `service_mesh` |
| **Classification** | `input.custom_labels`, `input.business_classification.*` | `custom_labels` (map), `business_unit`, `service_owner`, `criticality`, `sla_requirement` |

---

## Source Code References

| Component | Source File |
|---|---|
| Severity classifier | [`pkg/signalprocessing/classifier/severity.go`](https://github.com/jordigilh/kubernaut/blob/main/pkg/signalprocessing/classifier/severity.go) |
| Priority classifier | [`pkg/signalprocessing/classifier/priority.go`](https://github.com/jordigilh/kubernaut/blob/main/pkg/signalprocessing/classifier/priority.go) |
| Environment classifier | [`pkg/signalprocessing/classifier/environment.go`](https://github.com/jordigilh/kubernaut/blob/main/pkg/signalprocessing/classifier/environment.go) |
| Business classifier | [`pkg/signalprocessing/classifier/business.go`](https://github.com/jordigilh/kubernaut/blob/main/pkg/signalprocessing/classifier/business.go) |
| Custom labels engine | [`pkg/signalprocessing/rego/engine.go`](https://github.com/jordigilh/kubernaut/blob/main/pkg/signalprocessing/rego/engine.go) |
| AA approval evaluator | [`pkg/aianalysis/rego/evaluator.go`](https://github.com/jordigilh/kubernaut/blob/main/pkg/aianalysis/rego/evaluator.go) |
| AA input builder | [`pkg/aianalysis/handlers/analyzing.go`](https://github.com/jordigilh/kubernaut/blob/main/pkg/aianalysis/handlers/analyzing.go) |
| Default approval policy | [`config/rego/aianalysis/approval.rego`](https://github.com/jordigilh/kubernaut/blob/main/config/rego/aianalysis/approval.rego) |
| Default SP policies | [`deploy/signalprocessing/policies/`](https://github.com/jordigilh/kubernaut/tree/main/deploy/signalprocessing/policies) |
