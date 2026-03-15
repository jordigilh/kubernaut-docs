# Rego Policies

Kubernaut uses [OPA Rego](https://www.openpolicyagent.org/docs/latest/policy-language/) policies for two critical decision points: **Signal Processing classification** (severity, priority, environment, business, custom labels) and **AI Analysis approval gates** (whether human approval is required before execution).

All policies are deployed as ConfigMaps and can be customized by editing the Helm chart files.

## Policy Overview

| Policy | Service | Purpose | Hot-Reload |
|---|---|---|---|
| `severity.rego` | Signal Processing | Normalize alert severity to `critical`/`high`/`medium`/`low` | Yes |
| `priority.rego` | Signal Processing | Assign priority P0--P3 from severity + environment | Yes |
| `environment.rego` | Signal Processing | Classify environment from namespace labels or name | Yes |
| `business.rego` | Signal Processing | Extract business unit classification | Yes |
| `customlabels.rego` | Signal Processing | Extract custom labels from `kubernaut.ai/label-*` | Yes |
| `approval.rego` | AI Analysis | Decide if human approval is required for a remediation | Yes |

!!! tip "Complete input field reference"
    For a full listing of every `input.*` field available in each policy -- including types, descriptions, and usage examples for writing custom policies -- see the [Rego Policy Reference](rego-reference.md).

## Signal Processing Policies

These five policies run during signal enrichment, before the signal reaches AI Analysis. Their output directly feeds into workflow discovery -- see [Workflow Search and Scoring](workflows.md#workflow-search-and-scoring).

### Severity Policy

Normalizes the raw alert severity to one of Kubernaut's standard values. This is the first policy evaluated.

**Output:** `determine_severity` -- one of `critical`, `high`, `medium`, `low`, `unknown`

**Default mapping:**

| Input (case-insensitive) | Output |
|---|---|
| `critical`, `sev1`, `p0`, `p1`, `error` | `critical` |
| `high`, `sev2`, `p2`, `warning` | `high` |
| `medium`, `sev3` | `medium` |
| `low`, `p3` | `low` |
| Anything else | `unknown` |

**Input:** `input.signal.severity` (the raw severity string from the alert source)

**ConfigMap:** `signalprocessing-severity-policy`

!!! warning "Severity determines workflow discoverability"
    The severity value produced by this policy feeds into Layer 1 mandatory label filtering in DataStorage. If this policy maps an alert to `"unknown"` and no workflow declares `severity: ["unknown"]` or `severity: ["*"]`, no workflows will be found. Ensure your severity mappings cover all values your alert sources produce.

**Customization example:** To add support for a PagerDuty P0--P4 scheme, add rules like:

```rego
determine_severity := "critical" if {
    lower(input.signal.severity) == "p0"
}
```

A complete example with conservative and permissive fallback strategies is available at `config/severity-policy-example.rego` in the source repository.

### Priority Policy

Assigns a priority level (P0--P3) using a composite score from severity and environment.

**Output:** `result` -- `{"priority": "P0"|"P1"|"P2"|"P3", "policy_name": "..."}`

**Scoring matrix:**

| Severity | Score | | Environment | Score |
|---|---|---|---|---|
| `critical` | 3 | | `production` | 3 |
| `warning` / `high` | 2 | | `staging` | 2 |
| `info` | 1 | | `development` / `test` | 1 |
| Other | 0 | | Other | 0 |

Namespace label `tier=critical` adds +3, `tier=high` adds +2 (highest wins).

**Priority assignment:** `composite_score = severity_score + env_score`

| Composite Score | Priority |
|---|---|
| >= 6 | P0 |
| 5 | P1 |
| 4 | P2 |
| < 4 | P3 |

**Example:** A `critical` alert in `production` = 3 + 3 = 6 = **P0**. A `warning` alert in `development` = 2 + 1 = 3 = **P3**.

**ConfigMap:** `signalprocessing-priority-policy`

### Environment Policy

Classifies the environment from namespace metadata. Used for workflow filtering and approval decisions.

**Output:** `result` -- `{"environment": string, "source": string}`

**Resolution order** (default policy):

1. `kubernaut.ai/environment` namespace label (if present)
2. Namespace name convention: `production`/`prod` → `production`, `staging` → `staging`, `development`/`dev` → `development`
3. Default: `"unknown"`

!!! tip "Workload labels for cluster-scoped resources"
    The Rego input includes `workload_labels` from the target resource. Custom environment policies can use these for cluster-scoped resources (e.g., Nodes) where namespace labels are not available. The default policy does not use workload labels, but operators can extend it to classify environments based on workload metadata.

**ConfigMap:** `signalprocessing-environment-policy`

**Customization:** Add rules for your namespace naming conventions:

```rego
result := {"environment": "production", "source": "namespace-name"} if {
    not input.namespace.labels["kubernaut.ai/environment"]
    endswith(input.namespace.name, "-prod")
}
```

### Business Policy

Extracts business unit classification from namespace labels.

**Output:** `result` -- `{"business_unit": string, "confidence": float, "policy_name": string}`

**Default behavior:**

- If `kubernaut.io/business-unit` label exists → uses the label value (confidence: 0.95)
- Otherwise → `"unknown"` (confidence: 0.0)

**ConfigMap:** `signalprocessing-business-policy`

!!! note "Business classification and workflow discovery"
    Business classification is **not used in workflow discovery** (neither filtering nor scoring). It enriches the LLM prompt context only. See [Why business classification is not used for discovery](workflows.md#connection-to-signal-processing-rego-policies) for the design rationale.

### Custom Labels Policy

Extracts operator-defined labels from namespace annotations with the `kubernaut.ai/label-` prefix.

**Output:** `labels` -- map of key-value pairs

**Example:** A namespace with:

```yaml
labels:
  kubernaut.ai/label-team: payments
  kubernaut.ai/label-tier: gold
```

Produces: `{"team": "payments", "tier": "gold"}`

These labels feed into Layer 2 scoring at +0.15 per exact match. See [Workflow Search and Scoring](workflows.md#workflow-search-and-scoring).

**ConfigMap:** `signalprocessing-customlabels-policy`

## Signal Mode Configuration

Signal mode is configured via YAML (not Rego). A mapping file determines which alert names are treated as proactive vs reactive.

**ConfigMap:** `signalprocessing-proactive-signal-mappings`

**Default mappings:**

```yaml
proactive_signal_mappings:
  PredictedOOMKill: OOMKilled
  PredictedCPUThrottling: CPUThrottling
  PredictedDiskPressure: DiskPressure
  PredictedNodeNotReady: NodeNotReady
```

Signal names that match a key in this map are classified as `proactive`; all others default to `reactive`. The mapped value is the base signal name used for workflow catalog lookup.

Signal mode determines which prompt variant HolmesGPT uses during investigation (reactive: "Investigate the Incident" vs proactive: "Investigate the Anticipated Incident"). See [Investigation Pipeline](../architecture/hapi-investigation.md#reactive-vs-proactive-mode) for details.

!!! info "Signal mode mappings are not hot-reloaded"
    Unlike Rego policies, the proactive signal mappings are loaded once at startup. Changes require a pod restart.

## AI Analysis Approval Policy

The approval policy runs after HAPI returns a successful workflow selection. It determines whether the remediation requires human approval or can proceed automatically.

**Package:** `aianalysis.approval`

**ConfigMap:** `approval.rego` mounted via `charts/kubernaut/files/rego/aianalysis/approval.rego`

### Input Fields

| Field | Source | Description |
|---|---|---|
| `input.environment` | SP enrichment | `production`, `staging`, `development`, `qa`, `test` |
| `input.confidence` | HAPI `SelectedWorkflow.Confidence` | LLM confidence score (0.0--1.0) |
| `input.confidence_threshold` | Helm config (optional) | Overrides default 0.8 |
| `input.affected_resource` | HAPI `RootCauseAnalysis.AffectedResource` | `{kind, name, namespace}` |
| `input.detected_labels` | HAPI `PostRCAContext.DetectedLabels` | Infrastructure characteristics |
| `input.failed_detections` | HAPI `PostRCAContext.DetectedLabels.FailedDetections` | Detection errors |
| `input.warnings` | HAPI investigation warnings | Array of warning strings |

### Approval Rules

Two mandatory triggers:

1. **Missing affected resource** -- If `affected_resource` is absent or has an empty `kind`, approval is always required. Safety net for incomplete RCA.

2. **Production environment** -- All production remediations require human approval, regardless of confidence. Controlled by setting `kubernaut.ai/environment=production` on the namespace.

Non-production environments (development, staging, qa, test) auto-approve when `affected_resource` is present.

### Confidence Threshold

```rego
default confidence_threshold := 0.8

confidence_threshold := input.confidence_threshold if {
    input.confidence_threshold
}

is_high_confidence if {
    input.confidence >= confidence_threshold
}
```

The default threshold is **0.8** (80%). Override via Helm:

```yaml
aianalysis:
  rego:
    confidenceThreshold: 0.9  # Require 90% confidence
```

The `is_high_confidence` helper is defined but not currently used in the approval rules. It is available for operators to add custom rules.

### Risk Factors

Scored risk factors determine the human-readable reason shown in the `RemediationApprovalRequest`:

| Score | Condition | Reason |
|---|---|---|
| 90 | Missing affected resource | "Cannot determine remediation target" |
| 80 | Production + sensitive resource (Node, StatefulSet) | "Production environment with sensitive resource kind" |
| 70 | Production environment | "Production environment - requires manual approval" |

The highest-scoring factor becomes the approval reason. Scores affect the reason text only, not the approval decision.

### Customization Examples

**Require approval for StatefulSet remediations in staging:**

```rego
require_approval if {
    input.environment == "staging"
    input.affected_resource.kind == "StatefulSet"
}

risk_factors contains {"score": 60, "reason": "Staging StatefulSet remediation requires approval"} if {
    input.environment == "staging"
    input.affected_resource.kind == "StatefulSet"
}
```

**Require approval when confidence is below threshold in any environment:**

```rego
require_approval if {
    not is_high_confidence
}

risk_factors contains {"score": 65, "reason": "Low confidence remediation requires approval"} if {
    not is_high_confidence
}
```

## Deployment and Update

### Where Policies Live

| Policy | Helm Location |
|---|---|
| SP severity | Inline in `charts/kubernaut/templates/signalprocessing/signalprocessing.yaml` |
| SP priority | Inline in `charts/kubernaut/templates/signalprocessing/signalprocessing.yaml` |
| SP environment | Inline in `charts/kubernaut/templates/signalprocessing/signalprocessing.yaml` |
| SP business | Inline in `charts/kubernaut/templates/signalprocessing/signalprocessing.yaml` |
| SP custom labels | Inline in `charts/kubernaut/templates/signalprocessing/signalprocessing.yaml` |
| AA approval | `charts/kubernaut/files/rego/aianalysis/approval.rego` |
| Signal mode | Inline in `charts/kubernaut/templates/signalprocessing/signalprocessing.yaml` |

### Hot-Reload

SP Rego policies and the AA approval policy support **hot-reload** via fsnotify file watchers:

1. Edit the policy in the Helm chart
2. Run `helm upgrade` to update the ConfigMap
3. Kubelet syncs the ConfigMap update to the pod (~60 seconds)
4. fsnotify detects the file change and reloads the policy (<1 second)
5. The new policy takes effect without pod restart

The reload is **validated** -- if the new policy has a syntax error, the previous policy is kept and an error is logged. No service interruption occurs.

!!! info "Current limitation"
    SP policies are currently **inline** in the Helm template, not in separate files. To customize them, you need to edit the template directly or use Helm post-rendering. A future enhancement may expose policy content via Helm values for easier customization.

## Next Steps

- [Remediation Workflows](workflows.md) -- How policies feed into workflow discovery and scoring
- [Investigation Pipeline](../architecture/hapi-investigation.md) -- How the approval policy integrates with the investigation outcomes
- [Human Approval](approval.md) -- What happens when approval is required
- [Configuration Reference](configuration.md) -- Other configurable aspects of Kubernaut
