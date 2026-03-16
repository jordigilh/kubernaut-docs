# SignalProcessing Rego Policies

The SignalProcessing controller uses a single Rego policy file (`policy.rego`) for all signal classification: environment, priority, severity, and custom labels. Proactive signal mappings are separate YAML configuration.

## Overview

| Property | Value |
|---|---|
| ConfigMap name | `signalprocessing-policy` (Rego) + `signalprocessing-proactive-signal-mappings` (optional, YAML) |
| Mount path | `/etc/signalprocessing/policy.rego` (Rego) + `/etc/signalprocessing/proactive-signal-mappings.yaml` (mappings) |
| Required | Yes -- chart fails at install if neither `signalprocessing.policy` nor `signalprocessing.existingPolicyConfigMap` is set |

## Provisioning

### Option A: Inject via --set-file (recommended)

Provide a single `.rego` file directly:

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file signalprocessing.policy=my-policy.rego \
  ...
```

### Option B: Pre-existing ConfigMap

Create the ConfigMap yourself and reference it:

```bash
kubectl create configmap signalprocessing-policy \
  --from-file=policy.rego=my-policy.rego \
  -n kubernaut-system

helm install kubernaut charts/kubernaut/ \
  --set signalprocessing.existingPolicyConfigMap=signalprocessing-policy \
  ...
```

## Policy Structure

The policy file must use `package signalprocessing` and export 4 named rules:

```rego
package signalprocessing
import rego.v1

# ========== Environment ==========
# Returns: {"environment": string, "source": string}
default environment := {"environment": "unknown", "source": "default"}
environment := {"environment": "production", "source": "namespace-labels"} if {
    input.namespace.labels["env"] == "production"
}

# ========== Severity ==========
# Returns: string (critical/high/medium/low/unknown)
default severity := "unknown"
severity := "critical" if { input.signal.severity == "critical" }

# ========== Priority ==========
# Returns: {"priority": string, "policy_name": string}
# Can reference `environment` and `severity` directly
default priority := {"priority": "P3", "policy_name": "default"}
priority := {"priority": "P0", "policy_name": "production-critical"} if {
    environment.environment == "production"
    severity == "critical"
}

# ========== Custom Labels ==========
# Returns: map[string][]string
default labels := {}
```

### Input Schema

The Go controller sends a typed struct as Rego input:

| Path | Type | Description |
|---|---|---|
| `input.namespace.name` | string | Namespace name |
| `input.namespace.labels` | map | Namespace labels |
| `input.namespace.annotations` | map | Namespace annotations |
| `input.signal.severity` | string | External severity from alert source |
| `input.signal.type` | string | Signal type (e.g., `PodCrashLoop`) |
| `input.signal.source` | string | Gateway adapter that ingested signal |
| `input.signal.labels` | map | Signal labels |
| `input.workload.kind` | string | Target resource kind (e.g., `Deployment`) |
| `input.workload.name` | string | Target resource name |
| `input.workload.labels` | map | Target resource labels |

### Cross-rule References

Priority rules can reference `environment` and `severity` directly within the policy. Rego resolves these declaratively without requiring explicit Go-level sequencing:

```rego
priority := {"priority": "P0", "policy_name": "production-critical"} if {
    environment.environment == "production"   # references the environment rule
    severity == "critical"                     # references the severity rule
}
```

## Proactive Signal Mappings

Proactive signal mappings are YAML (not Rego) and injected separately. They map proactive alert names to their reactive counterparts for deduplication.

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file signalprocessing.proactiveSignalMappings.content=mappings.yaml \
  ...
```

Example content:

```yaml
proactive_signal_mappings:
  PredictedOOMKill: OOMKilled
  PredictedCPUThrottling: CPUThrottling
```

If no proactive signals are used, this is optional (omit both fields).

## Hot-Reload

Policy changes are detected via `fsnotify` (~60s kubelet sync delay for ConfigMap updates). If the new policy has a syntax error, the previous policy is kept active and an error is logged.

Since all rules share one file, any edit triggers a full reload. Structure your policy with clear section headers to make partial edits manageable.

## Reference File

A complete example policy is available in the chart: `charts/kubernaut/examples/signalprocessing-policy.rego`

See also: [Rego Policies](policies.md) for the Rego language reference.
