# Configuration Reference

Kubernaut is configured via **Helm values** and per-service **ConfigMaps**. This page documents the operator-facing configuration surfaces -- from Helm values to namespace labels, signal sources, LLM providers, and operational tuning.

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

All values are validated against `values.schema.json`. Run `helm lint` to check your overrides before installing.

### Global Settings

| Parameter | Description | Default |
|---|---|---|
| `global.image.registry` | Container image registry | `quay.io/kubernaut-ai` |
| `global.image.tag` | Image tag override (defaults to `appVersion`) | `""` |
| `global.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `global.nodeSelector` | Global node selector applied to all pods | `{}` |
| `global.tolerations` | Global tolerations applied to all pods | `[]` |

### Gateway

| Parameter | Description | Default |
|---|---|---|
| `gateway.replicas` | Number of gateway replicas | `1` |
| `gateway.resources` | CPU/memory requests and limits | See `values.yaml` |
| `gateway.service.type` | Kubernetes Service type | `ClusterIP` |
| `gateway.auth.signalSources` | External signal sources requiring RBAC | `[]` |

### DataStorage

| Parameter | Description | Default |
|---|---|---|
| `datastorage.replicas` | Number of datastorage replicas | `1` |
| `datastorage.dbExistingSecret` | Pre-created Secret with `db-secrets.yaml` key | `""` |
| `datastorage.resources` | CPU/memory requests and limits | See `values.yaml` |
| `datastorage.service.type` | Kubernetes Service type | `ClusterIP` |

### HolmesGPT API (LLM Integration)

| Parameter | Description | Default |
|---|---|---|
| `holmesgptApi.replicas` | Number of replicas | `1` |
| `holmesgptApi.llm.provider` | LLM provider (e.g., `openai`, `azure`, `vertexai`) | `""` |
| `holmesgptApi.llm.model` | LLM model name | `""` |
| `holmesgptApi.llm.endpoint` | Custom LLM endpoint URL | `""` |
| `holmesgptApi.llm.maxRetries` | Maximum LLM call retries | `3` |
| `holmesgptApi.llm.timeoutSeconds` | LLM call timeout | `120` |
| `holmesgptApi.llm.temperature` | LLM sampling temperature | `0.7` |
| `holmesgptApi.llm.credentialsSecretName` | Name of pre-existing Secret with LLM API keys | `llm-credentials` |

### Notification Controller

| Parameter | Description | Default |
|---|---|---|
| `notification.replicas` | Number of replicas | `1` |
| `notification.slack.enabled` | Enable Slack delivery channel | `false` |
| `notification.slack.channel` | Default Slack channel | `#kubernaut-alerts` |
| `notification.credentials` | Projected volume sources from K8s Secrets | `[]` |

When `slack.enabled` is `true`, add credentials entries pointing to your pre-existing secrets:

```yaml
notification:
  slack:
    enabled: true
    channel: "#kubernaut-alerts"
  credentials:
    - name: slack-webhook
      secretName: slack-webhook
      secretKey: webhook-url
```

### Controllers (Common Parameters)

All controllers (`aianalysis`, `signalprocessing`, `remediationorchestrator`, `workflowexecution`, `effectivenessmonitor`, `authwebhook`, `notification`) accept:

| Parameter | Description | Default |
|---|---|---|
| `<controller>.replicas` | Number of replicas | `1` |
| `<controller>.resources` | CPU/memory requests and limits | See `values.yaml` |
| `<controller>.podSecurityContext` | Pod-level security context override | `runAsNonRoot: true` + `seccompProfile: RuntimeDefault` (Tier 1); `seccompProfile: RuntimeDefault` only (Tier 2: postgresql, valkey) |
| `<controller>.containerSecurityContext` | Container-level security context override | `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]` |
| `<controller>.nodeSelector` | Per-component node selector (overrides global) | `{}` |
| `<controller>.tolerations` | Per-component tolerations (overrides global) | `[]` |
| `<controller>.affinity` | Pod affinity/anti-affinity rules | `{}` |
| `<controller>.topologySpreadConstraints` | Topology spread constraints | `[]` |
| `<controller>.pdb.enabled` | Create a PodDisruptionBudget | `false` |
| `<controller>.pdb.minAvailable` | PDB minimum available pods | -- |
| `<controller>.pdb.maxUnavailable` | PDB maximum unavailable pods | -- |

### WorkflowExecution

| Parameter | Description | Default |
|---|---|---|
| `workflowexecution.workflowNamespace` | Namespace for Job/PipelineRun execution | `kubernaut-workflows` |

### EffectivenessMonitor

| Parameter | Description | Default |
|---|---|---|
| `effectivenessmonitor.external.prometheusUrl` | Prometheus URL | `http://kube-prometheus-stack-prometheus.monitoring.svc:9090` |
| `effectivenessmonitor.external.prometheusEnabled` | Enable Prometheus integration | `true` |
| `effectivenessmonitor.external.alertManagerUrl` | AlertManager URL | `http://kube-prometheus-stack-alertmanager.monitoring.svc:9093` |
| `effectivenessmonitor.external.alertManagerEnabled` | Enable AlertManager integration | `true` |

### Event Exporter

| Parameter | Description | Default |
|---|---|---|
| `eventExporter.enabled` | Deploy the event exporter | `true` |
| `eventExporter.replicas` | Number of replicas | `1` |
| `eventExporter.image` | Container image | `ghcr.io/resmoio/kubernetes-event-exporter:v1.7` |
| `eventExporter.resources` | CPU/memory requests and limits | See `values.yaml` |

Set `eventExporter.enabled=false` to skip deploying the event exporter (e.g., on OpenShift where no Red Hat-supported equivalent image exists). Users should provide their own Kubernetes event forwarding when disabled.

### PostgreSQL

| Parameter | Description | Default |
|---|---|---|
| `postgresql.enabled` | Deploy in-chart PostgreSQL | `true` |
| `postgresql.replicas` | Number of replicas | `1` |
| `postgresql.image` | PostgreSQL container image | `postgres:16-alpine` |
| `postgresql.auth.existingSecret` | Pre-created Secret name | `""` |
| `postgresql.auth.username` | Database username | `slm_user` |
| `postgresql.auth.password` | Database password (required if no `existingSecret`) | `""` |
| `postgresql.auth.database` | Database name | `action_history` |
| `postgresql.storage.size` | PVC size | `10Gi` |
| `postgresql.storage.storageClassName` | StorageClass (empty = cluster default) | `""` |

### External PostgreSQL (BYO)

Set `postgresql.enabled=false` and configure these values to use a pre-existing PostgreSQL instance:

| Parameter | Description | Default |
|---|---|---|
| `externalPostgresql.host` | External PostgreSQL hostname (required) | `""` |
| `externalPostgresql.port` | External PostgreSQL port | `5432` |
| `externalPostgresql.auth.existingSecret` | Pre-created Secret name | `""` |
| `externalPostgresql.auth.username` | Database username | `slm_user` |
| `externalPostgresql.auth.password` | Database password | `""` |
| `externalPostgresql.auth.database` | Database name | `action_history` |

### Valkey

| Parameter | Description | Default |
|---|---|---|
| `valkey.enabled` | Deploy in-chart Valkey | `true` |
| `valkey.replicas` | Number of replicas | `1` |
| `valkey.image` | Valkey container image | `valkey/valkey:8-alpine` |
| `valkey.existingSecret` | Pre-created Secret name | `""` |
| `valkey.password` | Valkey password | `""` |
| `valkey.storage.size` | PVC size | `512Mi` |
| `valkey.storage.storageClassName` | StorageClass (empty = cluster default) | `""` |

### External Valkey (BYO)

Set `valkey.enabled=false` and configure these values to use a pre-existing Valkey (or Redis-compatible) instance:

| Parameter | Description | Default |
|---|---|---|
| `externalValkey.host` | External Valkey hostname (required) | `""` |
| `externalValkey.port` | External Valkey port | `6379` |
| `externalValkey.existingSecret` | Pre-created Secret name | `""` |
| `externalValkey.password` | Valkey password | `""` |

### Network Policies

| Parameter | Description | Default |
|---|---|---|
| `networkPolicies.enabled` | Create NetworkPolicy resources | `false` |

When enabled, NetworkPolicies restrict ingress/egress traffic for gateway, datastorage, and authwebhook. DNS egress (port 53) is always allowed.

## Signal Source Authentication

External signal sources need RBAC authorization. Configure via Helm:

```yaml
gateway:
  auth:
    signalSources:
      - name: alertmanager
        serviceAccount: alertmanager-kube-prometheus-stack-alertmanager
        namespace: monitoring
```

Each entry creates a `ClusterRoleBinding` granting the ServiceAccount permission to submit signals. The Kubernetes Event Exporter is automatically configured by the chart.

See [Security & RBAC -- Signal Ingestion](../architecture/security-rbac.md#signal-ingestion) for the full TokenReview + SAR authentication flow and RBAC details. See [Installation -- Signal Source Authentication](../getting-started/installation.md#signal-source-authentication) for AlertManager and Event Exporter configuration examples.

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
    provider: "vertex_ai"
    model: "gemini-2.5-pro"
    gcpProjectId: "my-project-id"
    gcpRegion: "us-central1"
    temperature: 0.7
    timeoutSeconds: 180
```

Create the credentials Secret from a GCP service account key file:

```bash
kubectl create secret generic llm-credentials \
  --namespace kubernaut-system \
  --from-file=GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
```

The Helm chart mounts this file at `/etc/holmesgpt/credentials/GOOGLE_APPLICATION_CREDENTIALS`
and sets the `GOOGLE_APPLICATION_CREDENTIALS` environment variable automatically when
`provider` is `vertex_ai`. GCP Workload Identity is also supported -- in that case the
secret can be omitted and authentication is handled by the node metadata service.

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

The `kubernaut-workflow-runner` ServiceAccount has pre-configured RBAC to read and patch resources across namespaces. See [Security & RBAC -- Workflow Execution](../architecture/security-rbac.md#workflow-execution) for the full permission list.

## TLS and Certificate Management

The Auth Webhook requires TLS certificates for Kubernetes admission webhook communication.

The chart supports two modes for managing TLS certificates used by the admission webhooks, controlled by `tls.mode`:

### Hook Mode (`tls.mode: hook`) -- Default

Self-signed certificates are generated and managed by Helm hooks. No external dependencies required. Suitable for development, testing, and CI environments.

**How it works:**

1. **Pre-install/pre-upgrade** (`tls-cert-gen`): Generates a self-signed CA and server certificate, stored as the `authwebhook-tls` Secret and `authwebhook-ca` ConfigMap.
2. **Post-install/post-upgrade** (`tls-cabundle-patch`): Patches the `caBundle` field on the webhook configurations.
3. **Post-delete** (`tls-cleanup`): Removes the `authwebhook-tls` Secret and `authwebhook-ca` ConfigMap.

**Automatic renewal**: On `helm upgrade`, if the certificate expires within 30 days, it is automatically regenerated.

**Recovery**: If the `authwebhook-ca` ConfigMap is accidentally deleted while `authwebhook-tls` still exists, delete the `authwebhook-tls` Secret and run `helm upgrade` to regenerate both:

```bash
kubectl delete secret authwebhook-tls -n kubernaut-system
helm upgrade kubernaut kubernaut/kubernaut -n kubernaut-system -f my-values.yaml
```

> **Note**: `helm template` output will not show `caBundle` on webhook configurations. This is expected -- the hook injects it at runtime after the webhook resources are created.

### cert-manager Mode (`tls.mode: cert-manager`) -- Production

Certificates are managed by [cert-manager](https://cert-manager.io/). Recommended for production environments. cert-manager handles issuance, renewal, and `caBundle` injection automatically.

**Prerequisites:**

1. Install cert-manager (v1.12+):

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=120s
```

2. Create an Issuer or ClusterIssuer. For development with cert-manager, a self-signed issuer works:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-issuer
spec:
  selfSigned: {}
```

For production, use your organization's CA or an ACME issuer (e.g., Let's Encrypt).

3. Install the chart with cert-manager mode:

```bash
helm install kubernaut kubernaut/kubernaut \
  --namespace kubernaut-system \
  --set tls.mode=cert-manager \
  --set tls.certManager.issuerRef.name=selfsigned-issuer \
  -f my-values.yaml
```

The chart creates a `Certificate` resource (`authwebhook-cert`) that provisions the `authwebhook-tls` Secret. cert-manager's `cainjector` automatically writes the `caBundle` into the webhook configurations via the `cert-manager.io/inject-ca-from` annotation.

**No TLS hook jobs** are created in this mode -- cert-manager handles the full lifecycle including renewal.

### Migrating from Hook to cert-manager

To switch an existing installation from `tls.mode=hook` to `tls.mode=cert-manager`:

1. Install cert-manager and create an Issuer/ClusterIssuer (see [Installation](../getting-started/installation.md))
2. Upgrade with the new mode:

    ```bash
    helm upgrade kubernaut charts/kubernaut \
      --namespace kubernaut-system \
      --set tls.mode=cert-manager \
      --set tls.certManager.issuerRef.name=your-issuer \
      -f my-values.yaml
    ```

3. The hook-generated Secret and ConfigMap are replaced by cert-manager-managed resources. The old hook cleanup job removes the previous artifacts.
4. Verify the webhook is serving the new certificate:

    ```bash
    kubectl get certificate -n kubernaut-system
    kubectl get secret authwebhook-tls -n kubernaut-system -o jsonpath='{.metadata.annotations}'
    ```

See [Troubleshooting](../operations/troubleshooting.md) if webhook calls fail after migration.

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
