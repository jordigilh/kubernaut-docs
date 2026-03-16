# Rego Policies

Kubernaut uses [OPA Rego](https://www.openpolicyagent.org/docs/latest/policy-language/) policies for two critical decision points: **Signal Processing classification** (severity, priority, environment, custom labels) and **AI Analysis approval gates** (whether human approval is required before execution).

All policies are deployed as ConfigMaps and can be customized. See [SignalProcessing Rego Policies](configmap-policies.md) for provisioning details.

## Policy Overview

| Policy File | Service | Purpose | Hot-Reload |
|---|---|---|---|
| `policy.rego` | Signal Processing | Unified classification: environment, severity, priority, custom labels (all rules in `package signalprocessing`) | Yes |
| `approval.rego` | AI Analysis | Decide if human approval is required for a remediation | Yes |

!!! tip "Complete input field reference"
    For a full listing of every `input.*` field available in each policy -- including types, descriptions, and usage examples for writing custom policies -- see the [Rego Policy Reference](rego-reference.md).

## Signal Processing Policies

Signal Processing uses a single unified `policy.rego` file under `package signalprocessing` ([ADR-060](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/ADR-060-unified-signalprocessing-rego-policy.md)). This file contains four rule groups that run during signal enrichment, before the signal reaches AI Analysis. Their output directly feeds into workflow discovery -- see [Workflow Search and Scoring](workflows.md#workflow-search-and-scoring).

**ConfigMap:** `signalprocessing-policy` (single key: `policy.rego`)

### Severity Rules

Normalizes the raw alert severity to one of Kubernaut's standard values.

**Rule name:** `severity`

**Output:** string -- one of `critical`, `high`, `medium`, `low`, `unknown`

**Default mapping:**

| Input (case-insensitive) | Output |
|---|---|
| `critical`, `sev1`, `p0`, `p1`, `error` | `critical` |
| `high`, `sev2`, `p2`, `warning` | `high` |
| `medium`, `sev3` | `medium` |
| `low`, `p3` | `low` |
| Anything else | `unknown` |

**Input:** `input.signal.severity` (the raw severity string from the alert source)

!!! warning "Severity determines workflow discoverability"
    The severity value produced by these rules feeds into Layer 1 mandatory label filtering in DataStorage. If this maps an alert to `"unknown"` and no workflow declares `severity: ["unknown"]` or `severity: ["*"]`, no workflows will be found. Ensure your severity mappings cover all values your alert sources produce.

**Customization example:** To add support for a PagerDuty P0--P4 scheme, add rules in `policy.rego`:

```rego
severity := "critical" if {
    lower(input.signal.severity) == "p0"
}
```

### Priority Rules

Assigns a priority level (P0--P3) using a composite score from severity and environment. Priority rules can reference the `severity` and `environment` rules directly via Rego cross-rule references.

**Rule name:** `priority`

**Output:** `{"priority": "P0"|"P1"|"P2"|"P3", "policy_name": "..."}`

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

**Cross-rule referencing:** Priority rules can reference `environment.environment` and `severity` directly:

```rego
priority := {"priority": "P0", "policy_name": "production-critical"} if {
    environment.environment == "production"
    severity == "critical"
}
```

### Environment Rules

Classifies the environment from namespace metadata. Used for workflow filtering, approval decisions, and cross-referenced by priority rules.

**Rule name:** `environment`

**Output:** `{"environment": string, "source": string}`

**Resolution order** (default policy):

1. `kubernaut.ai/environment` namespace label (if present)
2. Namespace name convention: `production`/`prod` → `production`, `staging` → `staging`, `development`/`dev` → `development`
3. Default: `"unknown"`

!!! tip "Workload labels for cluster-scoped resources"
    The Rego input includes `input.workload.labels` from the target resource. Custom environment rules can use these for cluster-scoped resources (e.g., Nodes) where namespace labels are not available. The default policy does not use workload labels, but operators can extend it to classify environments based on workload metadata.

**Customization:** Add rules in `policy.rego` for your namespace naming conventions:

```rego
environment := {"environment": "production", "source": "namespace-name"} if {
    not input.namespace.labels["kubernaut.ai/environment"]
    endswith(input.namespace.name, "-prod")
}
```

### Custom Labels Rules

Extracts operator-defined labels from namespace labels with the `kubernaut.ai/label-` prefix.

**Rule name:** `labels`

**Output:** map of key-value pairs (map[string][]string)

**Example:** A namespace with:

```yaml
labels:
  kubernaut.ai/label-team: payments
  kubernaut.ai/label-tier: gold
```

Produces: `{"team": ["payments"], "tier": ["gold"]}`

These labels feed into Layer 2 scoring at +0.15 per exact match. See [Workflow Search and Scoring](workflows.md#workflow-search-and-scoring).

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

| Policy | Provisioning |
|---|---|
| SP unified policy (`policy.rego`) | User-provided via `--set-file signalprocessing.policy=...` or `existingPolicyConfigMap` |
| SP proactive signal mappings | User-provided via `--set-file signalprocessing.proactiveSignalMappings.content=...` or `existingConfigMap` |
| AA approval | User-provided via `--set-file aianalysis.policies.content=...` or `existingConfigMap` |

See [SignalProcessing Rego Policies](configmap-policies.md) for full provisioning instructions and the example at `charts/kubernaut/examples/signalprocessing-policy.rego`.

### Hot-Reload

The SP unified Rego policy and the AA approval policy support **hot-reload** via fsnotify file watchers:

1. Update the policy file
2. Update the ConfigMap (via `helm upgrade`, `kubectl apply`, or direct edit)
3. Kubelet syncs the ConfigMap update to the pod (~60 seconds)
4. fsnotify detects the file change and reloads the policy (<1 second)
5. The new policy takes effect without pod restart

The reload is **validated** -- if the new policy has a syntax error, the previous policy is kept and an error is logged. No service interruption occurs.

!!! note "Single-file reload granularity"
    Since all SP classification rules share one `policy.rego` file, any edit triggers a full reload of all rules. Structure your policy with clear section headers to make partial edits manageable. See [SignalProcessing Rego Policies](configmap-policies.md) for the recommended file structure.

## Next Steps

- [Remediation Workflows](workflows.md) -- How policies feed into workflow discovery and scoring
- [Investigation Pipeline](../architecture/hapi-investigation.md) -- How the approval policy integrates with the investigation outcomes
- [Human Approval](approval.md) -- What happens when approval is required
- [Configuration Reference](configuration.md) -- Other configurable aspects of Kubernaut
