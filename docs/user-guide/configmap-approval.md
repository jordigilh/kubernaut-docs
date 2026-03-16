# AIAnalysis Approval Policy

The AIAnalysis controller uses a Rego policy to determine whether a proposed remediation requires human approval. This page documents the policy schema, input contract, and customization.

## Overview

| Property | Value |
|---|---|
| ConfigMap name | `aianalysis-policies` |
| Key | `approval.rego` |
| Mount path | `/etc/aianalysis/policies/` |
| Required | Yes -- chart fails at install if neither `policies.content` nor `policies.existingConfigMap` is set |

## Provisioning

### Option A: Inline content via --set-file (recommended)

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file aianalysis.policies.content=my-approval.rego \
  ...
```

### Option B: Pre-existing ConfigMap

```bash
kubectl create configmap aianalysis-policies \
  --from-file=approval.rego=my-approval.rego \
  -n kubernaut-system

helm install kubernaut charts/kubernaut/ \
  --set aianalysis.policies.existingConfigMap=aianalysis-policies \
  ...
```

## Input Contract

The approval policy receives this input from the AIAnalysis controller:

| Field | Type | Description |
|---|---|---|
| `environment` | string | Namespace environment (`production`, `staging`, `development`, etc.) |
| `confidence` | float | LLM investigation confidence score (0.0--1.0) |
| `confidence_threshold` | float | Configurable threshold (default 0.8, via `aianalysis.rego.confidenceThreshold`) |
| `affected_resource` | object | LLM-identified affected resource (`kind`, `name`, `namespace`) |
| `target_resource` | object | Original alert target resource |
| `detected_labels` | map | Detected workload labels (`stateful`, `gitOpsManaged`, `pdbProtected`) |
| `failed_detections` | array | Detection fields that failed (e.g., `["gitOpsManaged"]`) |
| `warnings` | array | Investigation warnings |

## Output Contract

The policy must produce these outputs:

| Output | Type | Description |
|---|---|---|
| `require_approval` | boolean | `true` to require human approval, `false` to auto-approve |
| `reason` | string | Human-readable explanation for the decision |

## Default Behavior

The reference policy (`charts/kubernaut/examples/approval.rego`) implements:

- **Production environments**: Always require approval (controlled via `kubernaut.ai/environment=production` namespace label)
- **Sensitive resources** (Node, StatefulSet): Always require approval regardless of environment
- **Missing affected resource**: Always require approval (safety default)
- **Non-production**: Auto-approved unless critical safety conditions are met

## Risk Factors

The reference policy uses scored risk factors for reason generation:

| Score | Condition |
|---|---|
| 90 | Missing affected resource |
| 85 | Sensitive resource kind (Node/StatefulSet) |
| 80 | Production + sensitive resource |
| 70 | Production environment |

The highest-scoring factor determines the approval reason.

## Customization

### Always Require Approval

```rego
package aianalysis.approval
import rego.v1
default require_approval := true
default reason := "All remediations require manual approval"
```

### Auto-Approve Everything (testing only)

```rego
package aianalysis.approval
import rego.v1
default require_approval := false
default reason := "Auto-approved (testing mode)"
```

### Environment-Specific Thresholds

```rego
require_approval if {
  input.environment == "staging"
  input.confidence < 0.9
}
```

## Hot-Reload

The approval policy supports hot-reload via fsnotify (~60s kubelet sync delay). If the new policy has a syntax error, the previous policy is kept and an error is logged.

## Reference File

A complete reference policy is available in the chart: `charts/kubernaut/examples/approval.rego`
