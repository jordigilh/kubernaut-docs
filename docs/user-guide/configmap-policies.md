# SignalProcessing Rego Policies

The SignalProcessing controller uses Rego policies for signal classification (environment, priority, severity, business unit, custom labels) and proactive signal mappings. This page documents the bundle format, required filenames, and customization.

## Overview

| Property | Value |
|---|---|
| ConfigMap name | `signalprocessing-policies` (Rego files) + `signalprocessing-proactive-signal-mappings` (mappings) |
| Mount path | `/etc/signalprocessing/policies` (Rego) + `/etc/signalprocessing/proactive-signal-mappings.yaml` (mappings) |
| Required | Yes -- chart fails at install if neither `policies.content` nor `policies.existingConfigMap` is set |

## Provisioning

### Option A: YAML bundle via --set-file (recommended)

Provide a single YAML file containing all Rego policies and proactive signal mappings. The chart parses this bundle via `fromYaml` and creates two ConfigMaps.

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file signalprocessing.policies.content=my-sp-policies.yaml \
  ...
```

### Option B: Pre-existing ConfigMap

Create the ConfigMaps yourself and reference them. When using `existingConfigMap`, you are responsible for creating both ConfigMaps (`signalprocessing-policies` for Rego files and `signalprocessing-proactive-signal-mappings` for mappings).

```bash
helm install kubernaut charts/kubernaut/ \
  --set signalprocessing.policies.existingConfigMap=my-sp-configmap \
  ...
```

## Bundle Format

The YAML bundle is a flat map where each key is a filename and the value is the file content:

```yaml
environment.rego: |
  package signalprocessing.environment
  ...

priority.rego: |
  package signalprocessing.priority
  ...

business.rego: |
  package signalprocessing.business
  ...

severity.rego: |
  package signalprocessing.severity
  ...

customlabels.rego: |
  package signalprocessing.customlabels
  ...

proactive-signal-mappings.yaml: |
  proactive_signal_mappings:
    PredictedOOMKill: OOMKilled
    ...
```

### Required Files

The controller expects exactly these filenames:

| Filename | Package | Purpose |
|---|---|---|
| `environment.rego` | `signalprocessing.environment` | Determines environment from namespace labels/name |
| `priority.rego` | `signalprocessing.priority` | Computes priority (P0--P3) from severity + environment |
| `business.rego` | `signalprocessing.business` | Extracts business unit from namespace labels |
| `severity.rego` | `signalprocessing.severity` | Normalizes signal severity to standard levels |
| `customlabels.rego` | `signalprocessing.customlabels` | Extracts `kubernaut.ai/label-*` labels for workflow scoring |

### Proactive Signal Mappings

The `proactive-signal-mappings.yaml` key maps proactive alert names to their reactive counterparts. This is used by the deduplication engine to correlate proactive signals with reactive ones.

If no ActionTypes with proactive signals are registered, set the mappings to empty:

```yaml
proactive-signal-mappings.yaml: |
  proactive_signal_mappings: {}
```

## Customization

### Adding a Custom Environment

Edit `environment.rego` to add new environment mappings:

```rego
result := {"environment": "canary", "source": "namespace-name"} if {
  not input.namespace.labels["kubernaut.ai/environment"]
  startswith(input.namespace.name, "canary-")
}
```

### Adjusting Priority Scoring

Edit `priority.rego` to change the scoring thresholds:

```rego
result := {"priority": "P0", "policy_name": "score-based"} if { composite_score >= 5 }
```

### Hot-Reload

Rego policies support hot-reload via fsnotify (~60s kubelet sync delay). If a policy has a syntax error, the previous policy is kept and an error is logged.

## Reference File

A complete example bundle is available in the chart: `charts/kubernaut/examples/signalprocessing-policies.yaml`

See also: [Rego Policies](policies.md) for the Rego language reference and input/output contracts.
