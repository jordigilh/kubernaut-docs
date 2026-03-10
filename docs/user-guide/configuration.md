# Configuration Reference

Kubernaut is configured via **Helm values** and per-service **ConfigMaps**. This page documents the operator-facing configuration surfaces -- from Helm values to namespace labels, signal sources, LLM providers, and operational tuning.

!!! warning "Development Chart"
    Many ConfigMap values are currently hardcoded in Helm templates. To customize them beyond Helm values, edit the templates directly or use Helm post-rendering. Production-grade configurability is in progress.

## Namespace and Resource Labels

Kubernaut uses `kubernaut.ai/*` labels on namespaces and resources to control scope, enrichment, and classification. These labels are the primary way operators integrate their workloads with Kubernaut.

### Scope Control

| Label | Values | Description |
|---|---|---|
| `kubernaut.ai/managed` | `true` / `false` | Opt-in scope control. Only resources in managed namespaces (or with this label) are remediated. |

**Resolution order:** Resource label > Namespace label > Default (unmanaged)

To enable Kubernaut for a namespace:

```bash
kubectl label namespace my-app kubernaut.ai/managed=true
```

### Classification Labels

| Label | Values | Used By | Purpose |
|---|---|---|---|
| `kubernaut.ai/environment` | `production`, `staging`, `development`, `qa`, `test` | SP `environment.rego`, AA approval | Environment classification and approval gates |
| `kubernaut.ai/business-unit` | Any string | SP `business.rego` | Business unit classification (LLM context only) |
| `kubernaut.ai/service-owner` | Any string | SP `business.rego` | Service owner team |
| `kubernaut.ai/criticality` | `critical`, `high`, `medium`, `low` | SP `business.rego` | Business criticality |
| `kubernaut.ai/sla-tier` | `platinum`, `gold`, `silver`, `bronze` | SP `business.rego` | SLA tier |

### Custom Labels

| Label Pattern | Used By | Purpose |
|---|---|---|
| `kubernaut.ai/label-*` | SP `customlabels.rego` | Arbitrary key-value pairs fed into workflow scoring (+0.15 per exact match, +0.075 wildcard) |

The `kubernaut.ai/label-` prefix is stripped by SP before passing to workflow discovery. Example:

```yaml
metadata:
  labels:
    kubernaut.ai/managed: "true"
    kubernaut.ai/environment: production
    kubernaut.ai/business-unit: payments
    kubernaut.ai/criticality: critical
    kubernaut.ai/label-team: checkout
    kubernaut.ai/label-region: us-east-1
```

See [Rego Policies](policies.md) for how each label feeds into enrichment, and [Workflow Search and Scoring](workflows.md#workflow-search-and-scoring) for how labels affect workflow discovery.

## Helm Values

### Global Settings

| Parameter | Default | Description |
|---|---|---|
| `global.image.registry` | `quay.io/kubernaut-ai` | Container image registry |
| `global.image.tag` | Chart `appVersion` | Image tag (overrides per-service) |
| `global.image.pullPolicy` | `IfNotPresent` | Image pull policy |
| `global.nodeSelector` | `{}` | Node selector for all components |
| `global.tolerations` | `[]` | Tolerations for all components |

### Gateway

| Parameter | Default | Description |
|---|---|---|
| `gateway.replicas` | `1` | Replica count |
| `gateway.resources` | 100m-500m CPU, 256Mi-512Mi mem | Resource requests/limits |
| `gateway.service.type` | `ClusterIP` | Service type |
| `gateway.service.nodePort` | -- | NodePort (when service type is NodePort) |
| `gateway.auth.signalSources` | `[]` | External signal source ServiceAccounts (see below) |

### DataStorage

| Parameter | Default | Description |
|---|---|---|
| `datastorage.replicas` | `1` | Replica count |
| `datastorage.dbExistingSecret` | `""` | Pre-created Secret name for DB credentials |
| `datastorage.resources` | 250m-500m CPU, 256Mi-512Mi mem | Resource requests/limits |

### AI Analysis

| Parameter | Default | Description |
|---|---|---|
| `aianalysis.rego.confidenceThreshold` | `null` (Rego default: 0.8) | Auto-approval confidence threshold |
| `aianalysis.resources` | 100m-500m CPU, 128Mi-256Mi mem | Resource requests/limits |

### HolmesGPT API

| Parameter | Default | Description |
|---|---|---|
| `holmesgptApi.replicas` | `1` | Replica count |
| `holmesgptApi.llm.provider` | `""` | LLM provider (see [LLM Provider Setup](#llm-provider-setup)) |
| `holmesgptApi.llm.model` | `""` | Model name |
| `holmesgptApi.llm.endpoint` | `""` | LLM endpoint URL |
| `holmesgptApi.llm.gcpProjectId` | `""` | GCP project ID (Vertex AI) |
| `holmesgptApi.llm.gcpRegion` | `""` | GCP region (Vertex AI) |
| `holmesgptApi.llm.maxRetries` | `3` | Max retry attempts for LLM calls |
| `holmesgptApi.llm.timeoutSeconds` | `120` | LLM call timeout |
| `holmesgptApi.llm.temperature` | `0.7` | Sampling temperature |
| `holmesgptApi.resources` | 200m-1000m CPU, 256Mi-1Gi mem | Resource requests/limits |

### Remediation Orchestrator

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.resources` | 100m-500m CPU, 128Mi-256Mi mem | Resource requests/limits |
| `remediationorchestrator.config.effectivenessAssessment.stabilizationWindow` | `5m` | Wait time after remediation before assessing |
| `remediationorchestrator.config.asyncPropagation.gitOpsSyncDelay` | `3m` | Expected GitOps sync time |
| `remediationorchestrator.config.asyncPropagation.operatorReconcileDelay` | `1m` | Expected operator reconciliation time |

### Notification

| Parameter | Default | Description |
|---|---|---|
| `notification.slack.enabled` | `false` | Enable Slack delivery |
| `notification.slack.channel` | `#kubernaut-alerts` | Default Slack channel |
| `notification.credentials` | `[]` | Credential Secret projections (see [Notification Channels](notifications.md)) |
| `notification.resources` | 100m-500m CPU, 128Mi-512Mi mem | Resource requests/limits |

### Infrastructure

| Parameter | Default | Description |
|---|---|---|
| `postgresql.auth.existingSecret` | `""` | Pre-created DB credentials Secret |
| `postgresql.auth.username` | `slm_user` | Database username |
| `postgresql.auth.database` | `action_history` | Database name |
| `postgresql.storage.size` | `10Gi` | PostgreSQL PVC size |
| `redis.existingSecret` | `""` | Pre-created Redis credentials Secret |
| `redis.storage.size` | `512Mi` | Redis PVC size |

## Signal Source Authentication

The Gateway authenticates all signal ingestion requests using **Kubernetes TokenReview + SubjectAccessReview (SAR)**. Callers must present a valid Kubernetes ServiceAccount bearer token in the `Authorization` header. The Gateway validates the token via TokenReview and then checks that the authenticated identity has `create` permission on `services/gateway-service` in the platform namespace via SAR.

This means:

1. Every signal source needs a Kubernetes ServiceAccount
2. That ServiceAccount needs an RBAC binding granting `create` on `services/gateway-service`
3. The caller must include the ServiceAccount token as a bearer token

### Configuring Signal Sources

External alert sources (AlertManager, custom webhooks) need RBAC authorization. Configure via Helm:

```yaml
gateway:
  auth:
    signalSources:
      - name: alertmanager
        serviceAccount: alertmanager-kube-prometheus-stack-alertmanager
        namespace: monitoring
```

Each entry creates a `ClusterRoleBinding` granting the ServiceAccount permission to submit signals. The Kubernetes Event Exporter is automatically configured by the chart.

### AlertManager Integration

Configure AlertManager to send webhooks to the Gateway with bearer token authentication:

```yaml
# AlertManager receiver configuration
receivers:
  - name: kubernaut
    webhook_configs:
      - url: "http://gateway-service.kubernaut-system.svc.cluster.local:8080/api/v1/signals/prometheus"
        send_resolved: true
        bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
```

The `bearer_token_file` directive tells AlertManager to read the ServiceAccount token from the pod's projected volume and include it as a bearer token in every webhook request. Without this, the Gateway rejects the request with `401 Unauthorized`.

## LLM Provider Setup

HAPI supports any LiteLLM-compatible provider. Common configurations:

### OpenAI

```yaml
holmesgptApi:
  llm:
    provider: "openai"
    model: "gpt-4o"
    endpoint: ""  # Uses default OpenAI endpoint
    temperature: 0.7
    timeoutSeconds: 120
```

Create the API key Secret:

```bash
kubectl create secret generic llm-credentials \
  --namespace kubernaut-system \
  --from-literal=OPENAI_API_KEY="sk-..."
```

### Google Vertex AI

```yaml
holmesgptApi:
  llm:
    provider: "vertex-ai"
    model: "gemini-2.5-pro"
    gcpProjectId: "my-project-id"
    gcpRegion: "us-central1"
    temperature: 0.7
    timeoutSeconds: 180
```

Authentication uses GCP Workload Identity or a service account key mounted as a Secret.

### Temperature Tuning

The `temperature` parameter (default 0.7) controls the LLM's creativity vs determinism:

- **Lower (0.3--0.5):** More deterministic workflow selection. Recommended for production environments where consistency is critical.
- **Default (0.7):** Balanced. Good for most environments.
- **Higher (0.8--1.0):** More creative investigation. May discover non-obvious root causes but with less consistent workflow selection.

## Remediation Timeouts and Routing

The RO ConfigMap controls per-phase timeouts and routing behavior. These values are currently hardcoded in the template.

### Phase Timeouts

| Phase | Default | Description |
|---|---|---|
| `global` | 1 hour | Total remediation timeout |
| `processing` | 5 minutes | Signal Processing phase |
| `analyzing` | 10 minutes | AI Analysis (HAPI investigation) |
| `executing` | 30 minutes | Workflow execution |
| `verifying` | 30 minutes | Effectiveness assessment |

These are ConfigMap defaults. Individual `RemediationRequest` resources can override timeouts via `spec.timeouts`.

### Routing Configuration

| Parameter | Default | Description |
|---|---|---|
| `consecutiveFailureThreshold` | 3 | Block a resource after N consecutive remediation failures |
| `consecutiveFailureCooldown` | 1 hour | How long to block after hitting the threshold |
| `recentlyRemediatedCooldown` | 5 minutes | Minimum interval between successful remediations for the same resource |
| `ineffectiveChainThreshold` | 3 | Consecutive ineffective remediations before escalation |
| `recurrenceCountThreshold` | 5 | Safety-net recurrence count |
| `ineffectiveTimeWindow` | 4 hours | Lookback window for ineffective chain detection |

These settings prevent remediation storms and avoid repeating failed approaches.

## Execution Namespace

Workflow Jobs and Tekton PipelineRuns execute in a dedicated namespace, separate from the target resource's namespace. This creates a security boundary.

| Parameter | Default | Description |
|---|---|---|
| `execution.namespace` | `kubernaut-workflows` | Namespace for workflow execution |
| `execution.serviceAccount` | `kubernaut-workflow-runner` | ServiceAccount for workflow pods |
| `execution.cooldownPeriod` | 1 minute | Cooldown between executions |

The `kubernaut-workflow-runner` ServiceAccount has pre-configured RBAC to read and patch resources across namespaces (limited to the Kubernetes verbs needed for remediation).

## TLS and Certificate Management

The Auth Webhook requires TLS certificates for Kubernetes admission webhook communication.

### Development (Helm Hook)

The Helm chart generates self-signed certificates via a pre-install hook job:

- Uses OpenSSL to generate a CA and TLS certificate
- Certificate validity: 365 days
- Creates Secret `authwebhook-tls` and ConfigMap `authwebhook-ca`
- Patches webhook configurations with the CA bundle

This is suitable for development and demo environments.

### Production (cert-manager)

For production, **cert-manager** is the recommended approach. The Kustomize deployment path (`deploy/authwebhook/`) includes cert-manager integration:

```yaml
# Certificate resource
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: authwebhook-tls
spec:
  secretName: authwebhook-tls
  issuerRef:
    name: selfsigned-issuer
    kind: ClusterIssuer
  dnsNames:
    - authwebhook.kubernaut-system.svc
    - authwebhook.kubernaut-system.svc.cluster.local
  duration: 8760h    # 1 year
  renewBefore: 720h  # 30 days
```

Webhook configurations use the `cert-manager.io/inject-ca-from` annotation for automatic CA injection and renewal.

cert-manager is a **production prerequisite** -- Kubernaut does not manage certificate lifecycle in production. Operators should install and configure cert-manager independently.

## Hot-Reload and Graceful Shutdown

Understanding which configuration changes take effect live vs which require a restart is critical for operational confidence.

### Hot-Reload Support

| Configuration | Hot-Reload | Mechanism | Latency |
|---|---|---|---|
| SP Rego policies (severity, priority, environment, business, custom labels) | Yes | fsnotify file watcher | ~60s (kubelet sync) |
| AA approval policy | Yes | fsnotify file watcher | ~60s |
| Notification credentials | Yes | fsnotify file watcher | ~60s |
| Notification routing | Yes | fsnotify file watcher | ~60s |
| HolmesGPT config | Yes | Python watchdog | ~60s |
| Gateway config | No | Restart required | -- |
| DataStorage config | No | Restart required | -- |
| Proactive signal mappings | No | Restart required | -- |

Policies are validated before reload -- if the new policy has a syntax error, the previous policy is kept and an error is logged. No service interruption occurs.

### Graceful Shutdown

All services implement graceful shutdown to ensure in-flight remediations are not disrupted during rolling updates:

| Service | Shutdown Behavior |
|---|---|
| **Gateway** | Sets shutdown flag → readiness probe returns 503 → waits 5s for endpoint removal → drains in-flight requests → closes resources |
| **DataStorage** | Same 4-step sequence as Gateway |
| **CRD Controllers** (SP, AA, RO, WFE, EM, NT) | controller-runtime built-in signal handling; in-flight reconciles complete |
| **HolmesGPT API** | Python SIGTERM handler; readiness returns 503; in-flight investigations complete |

This means `helm upgrade` and rolling updates do not disrupt in-flight remediations. The readiness probe change ensures no new traffic reaches the pod during drain.

## Next Steps

- [Rego Policies](policies.md) -- Customizing classification and approval policies
- [Notification Channels](notifications.md) -- Setting up Slack and other channels
- [Remediation Workflows](workflows.md) -- Authoring and registering workflows
- [Installation](../getting-started/installation.md) -- Using these values during deployment
