# Configuration Reference

Kubernaut is configured via **Helm values**. This page documents all configurable parameters.

!!! warning "Development Chart"
    The Helm chart is currently configured for demo and development environments. Many ConfigMap values are hardcoded in templates. Production-grade configurability is in progress.

## Global Settings

| Parameter | Default | Description |
|---|---|---|
| `global.image.registry` | `quay.io/kubernaut-ai` | Container image registry |
| `global.image.tag` | Chart `appVersion` | Image tag (overrides per-service) |
| `global.image.pullPolicy` | `IfNotPresent` | Image pull policy |
| `global.nodeSelector` | `{}` | Node selector for all components |
| `global.tolerations` | `[]` | Tolerations for all components |

## Gateway

| Parameter | Default | Description |
|---|---|---|
| `gateway.replicas` | `1` | Replica count |
| `gateway.resources` | 100m-500m CPU, 256Mi-512Mi mem | Resource requests/limits |
| `gateway.service.type` | `ClusterIP` | Service type |
| `gateway.service.nodePort` | — | NodePort (when service type is NodePort) |

## DataStorage

| Parameter | Default | Description |
|---|---|---|
| `datastorage.replicas` | `1` | Replica count |
| `datastorage.dbExistingSecret` | `""` | Pre-created Secret name for DB credentials |
| `datastorage.resources` | 250m-500m CPU, 256Mi-512Mi mem | Resource requests/limits |
| `datastorage.service.type` | `ClusterIP` | Service type |

## AI Analysis

| Parameter | Default | Description |
|---|---|---|
| `aianalysis.rego.confidenceThreshold` | `null` (Rego default: 0.8) | Auto-approval confidence threshold. Set to override the Rego policy default. |
| `aianalysis.resources` | 100m-500m CPU, 128Mi-256Mi mem | Resource requests/limits |

## Signal Processing

| Parameter | Default | Description |
|---|---|---|
| `signalprocessing.resources` | 100m-500m CPU, 128Mi-256Mi mem | Resource requests/limits |

## Remediation Orchestrator

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.resources` | 100m-500m CPU, 128Mi-256Mi mem | Resource requests/limits |
| `remediationorchestrator.config.effectivenessAssessment.stabilizationWindow` | `5m` | Wait time after remediation before assessing effectiveness |
| `remediationorchestrator.config.asyncPropagation.gitOpsSyncDelay` | `3m` | Expected GitOps tool sync time (ArgoCD, Flux) |
| `remediationorchestrator.config.asyncPropagation.operatorReconcileDelay` | `1m` | Expected operator reconciliation time |

## Workflow Execution

| Parameter | Default | Description |
|---|---|---|
| `workflowexecution.resources` | 100m-500m CPU, 64Mi-256Mi mem | Resource requests/limits |

## Notification

| Parameter | Default | Description |
|---|---|---|
| `notification.slack.enabled` | `false` | Enable Slack delivery channel |
| `notification.slack.channel` | `#kubernaut-alerts` | Default Slack channel |
| `notification.credentials` | See below | Per-receiver credential configuration |
| `notification.resources` | 100m-500m CPU, 128Mi-512Mi mem | Resource requests/limits |

### Notification Credentials

Credentials for notification channels are provided via Kubernetes Secrets projected into the Notification pod:

```yaml
notification:
  credentials:
    - name: slack-webhook
      secretName: slack-webhook
      secretKey: webhook-url
```

## Effectiveness Monitor

| Parameter | Default | Description |
|---|---|---|
| `effectivenessmonitor.resources` | 50m-500m CPU, 64Mi-256Mi mem | Resource requests/limits |

## HolmesGPT API

| Parameter | Default | Description |
|---|---|---|
| `holmesgptApi.replicas` | `1` | Replica count |
| `holmesgptApi.resources` | 200m-1000m CPU, 256Mi-1Gi mem | Resource requests/limits |
| `holmesgptApi.service.type` | `ClusterIP` | Service type |
| `holmesgptApi.llm.provider` | `""` | LLM provider (`openai`, `vertex_ai`, `azure`, or any LiteLLM provider) |
| `holmesgptApi.llm.model` | `""` | LLM model name |
| `holmesgptApi.llm.endpoint` | `""` | LLM endpoint URL |
| `holmesgptApi.llm.gcpProjectId` | `""` | GCP project ID (Vertex AI) |
| `holmesgptApi.llm.gcpRegion` | `""` | GCP region (Vertex AI) |
| `holmesgptApi.llm.maxRetries` | `3` | Max retry attempts for LLM calls |
| `holmesgptApi.llm.timeoutSeconds` | `120` | LLM call timeout |
| `holmesgptApi.llm.temperature` | `0.7` | LLM temperature parameter |

## Infrastructure

### PostgreSQL

| Parameter | Default | Description |
|---|---|---|
| `postgresql.image` | `postgres:16-alpine` | PostgreSQL image |
| `postgresql.auth.existingSecret` | `""` | Pre-created Secret with credentials |
| `postgresql.auth.username` | `slm_user` | Database username |
| `postgresql.auth.password` | `""` | Database password (required if no existing secret) |
| `postgresql.auth.database` | `action_history` | Database name |
| `postgresql.storage.size` | `10Gi` | PVC size |
| `postgresql.storage.storageClassName` | `""` | Storage class (empty = cluster default) |
| `postgresql.resources` | 250m-500m CPU, 256Mi-512Mi mem | Resource requests/limits |

### Redis

| Parameter | Default | Description |
|---|---|---|
| `redis.image` | `quay.io/jordigilh/redis:7-alpine` | Redis image |
| `redis.existingSecret` | `""` | Pre-created Secret with credentials |
| `redis.password` | `""` | Redis password (empty allowed for dev) |
| `redis.storage.size` | `512Mi` | PVC size |
| `redis.storage.storageClassName` | `""` | Storage class (empty = cluster default) |
| `redis.resources` | 100m-200m CPU, 128Mi-256Mi mem | Resource requests/limits |

## Next Steps

- [Installation](../getting-started/installation.md) — Using these values during deployment
- [Human Approval](approval.md) — Configuring confidence thresholds
- [Effectiveness Monitoring](effectiveness.md) — Tuning propagation delays
