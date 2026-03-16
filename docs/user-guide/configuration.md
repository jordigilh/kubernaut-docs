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
| `kubernaut.ai/environment` | `production`, `staging`, `development`, `qa`, `test` | SP `policy.rego` (environment rules), AA approval | Environment classification and approval gates |
| `kubernaut.ai/business-unit` | Any string | SP `policy.rego` (custom labels rules) | Business unit classification (LLM context only) |
| `kubernaut.ai/service-owner` | Any string | SP `policy.rego` (custom labels rules) | Service owner team |
| `kubernaut.ai/criticality` | `critical`, `high`, `medium`, `low` | SP `policy.rego` (custom labels rules) | Business criticality |
| `kubernaut.ai/sla-tier` | `platinum`, `gold`, `silver`, `bronze` | SP `policy.rego` (custom labels rules) | SLA tier |

### Custom Labels

| Label Pattern | Used By | Purpose |
|---|---|---|
| `kubernaut.ai/label-*` | SP `policy.rego` (custom labels rules) | Arbitrary key-value pairs fed into workflow scoring (+0.15 per exact match, +0.075 wildcard) |

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
| `global.image.registry` | Container image registry | `quay.io` |
| `global.image.namespace` | Image namespace/organization | `kubernaut-ai` |
| `global.image.separator` | Path separator (`/` for nested registries, `-` for flat registries like Docker Hub) | `/` |
| `global.image.tag` | Image tag override (defaults to `appVersion`) | `""` |
| `global.image.digest` | Immutable image digest; overrides tag when set (e.g., `sha256:abc...`) | `""` |
| `global.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `global.imagePullSecrets` | Array of image pull secret names for private registries | `[]` |
| `global.nodeSelector` | Global node selector applied to all pods | `{}` |
| `global.tolerations` | Global tolerations applied to all pods | `[]` |

Image paths are constructed as `{registry}{separator}{namespace}{separator}{service}:{tag}`. For example, with the defaults: `quay.io/kubernaut-ai/gateway:{{ image_tag }}`. For flat registries that don't support nested paths, set `separator: "-"` to produce `myregistry.example.com/kubernaut-ai-gateway:{{ image_tag }}`.

### Gateway

| Parameter | Description | Default |
|---|---|---|
| `gateway.replicas` | Number of gateway replicas | `1` |
| `gateway.resources` | CPU/memory requests and limits | See `values.yaml` |
| `gateway.service.type` | Kubernetes Service type | `ClusterIP` |
| `gateway.config.server.maxConcurrentRequests` | Maximum concurrent request processing | `100` |
| `gateway.config.server.readTimeout` | HTTP read timeout | `30s` |
| `gateway.config.server.writeTimeout` | HTTP write timeout | `30s` |
| `gateway.config.deduplication.cooldownPeriod` | Signal deduplication cooldown | `5m` |
| `gateway.auth.signalSources` | External signal sources requiring RBAC | `[]` |

### DataStorage

| Parameter | Description | Default |
|---|---|---|
| `datastorage.replicas` | Number of datastorage replicas | `1` |
| `datastorage.dbExistingSecret` | Pre-created Secret with `db-secrets.yaml` key | `""` |
| `datastorage.config.database.sslMode` | PostgreSQL SSL mode | `disable` |
| `datastorage.config.database.maxOpenConns` | Maximum open database connections | `100` |
| `datastorage.config.database.maxIdleConns` | Maximum idle database connections | `20` |
| `datastorage.config.database.connMaxLifetime` | Maximum connection lifetime | `1h` |
| `datastorage.resources` | CPU/memory requests and limits | See `values.yaml` |
| `datastorage.service.type` | Kubernetes Service type | `ClusterIP` |

### HolmesGPT API (LLM Integration)

| Parameter | Description | Default |
|---|---|---|
| `holmesgptApi.replicas` | Number of replicas | `1` |
| `holmesgptApi.llm.credentialsSecretName` | Name of pre-existing Secret with LLM API keys | `llm-credentials` |
| `holmesgptApi.sdkConfigContent` | SDK config YAML content (via `--set-file`). Used to create the `holmesgpt-sdk-config` ConfigMap. | `""` |
| `holmesgptApi.existingSdkConfigMap` | Pre-existing ConfigMap name for SDK config. Takes priority over `sdkConfigContent`. | `""` |

HAPI uses two ConfigMaps: a **service config** (ports, logging, auth secret references) and an **SDK config** (LLM settings, toolsets, MCP servers). The SDK config is provided in one of two ways:

1. **Inline content** (recommended): Provide full SDK config content via `--set-file holmesgptApi.sdkConfigContent=my-sdk-config.yaml`. The chart creates the `holmesgpt-sdk-config` ConfigMap from this content.
2. **External ConfigMap**: Set `holmesgptApi.existingSdkConfigMap` to reference a pre-existing ConfigMap (takes priority over `sdkConfigContent`).

One of these two options **must** be provided; the chart will fail at install time if neither is set.

### Notification Controller

| Parameter | Description | Default |
|---|---|---|
| `notification.replicas` | Number of replicas | `1` |
| `notification.routing.content` | Routing config YAML content (via `--set-file`). Chart creates ConfigMap from this. | `""` |
| `notification.routing.existingConfigMap` | Pre-existing ConfigMap name for routing config. Takes priority over `routing.content`. | `""` |
| `notification.credentials` | Projected volume sources from K8s Secrets | `[]` |

When neither `routing.content` nor `routing.existingConfigMap` is set, the chart generates a console-only default routing config. To enable Slack or other channels, provide a routing config:

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file notification.routing.content=my-routing.yaml \
  ...
```

Add credentials entries to mount the Slack webhook Secret into the notification pod:

```yaml
notification:
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
| `effectivenessmonitor.config.assessment.stabilizationWindow` | Wait time after remediation before assessment | `30s` |
| `effectivenessmonitor.config.assessment.validityWindow` | Time window for assessment validity | `120s` |
| `effectivenessmonitor.external.prometheusUrl` | Prometheus URL | `http://kube-prometheus-stack-prometheus.monitoring.svc:9090` |
| `effectivenessmonitor.external.prometheusEnabled` | Enable Prometheus integration | `true` |
| `effectivenessmonitor.external.alertManagerUrl` | AlertManager URL | `http://kube-prometheus-stack-alertmanager.monitoring.svc:9093` |
| `effectivenessmonitor.external.alertManagerEnabled` | Enable AlertManager integration | `true` |

### AIAnalysis

| Parameter | Description | Default |
|---|---|---|
| `aianalysis.replicas` | Number of replicas | `1` |
| `aianalysis.rego.confidenceThreshold` | Auto-approval confidence threshold (nil = use Rego default 0.8) | `null` |
| `aianalysis.policies.content` | Approval policy Rego content (via `--set-file`). Chart creates ConfigMap. | `""` |
| `aianalysis.policies.existingConfigMap` | Pre-existing ConfigMap name for approval policy. Takes priority. | `""` |

One of `policies.content` or `policies.existingConfigMap` **must** be provided; the chart fails at install if neither is set. See [AIAnalysis Approval Policy](configmap-approval.md) for the full schema and customization guide.

### SignalProcessing

| Parameter | Description | Default |
|---|---|---|
| `signalprocessing.replicas` | Number of replicas | `1` |
| `signalprocessing.policy` | Unified Rego policy content (via `--set-file`). Chart creates `signalprocessing-policy` ConfigMap. | `""` |
| `signalprocessing.existingPolicyConfigMap` | Pre-existing ConfigMap name for the unified Rego policy. Takes priority over `policy`. | `""` |
| `signalprocessing.proactiveSignalMappings.content` | Proactive signal mappings YAML (via `--set-file`). Chart creates ConfigMap. | `""` |
| `signalprocessing.proactiveSignalMappings.existingConfigMap` | Pre-existing ConfigMap name for proactive signal mappings. | `""` |

One of `policy` or `existingPolicyConfigMap` **must** be provided; the chart fails at install if neither is set. The policy file is a single `.rego` file (not a YAML bundle) containing all classification rules under `package signalprocessing`. Proactive signal mappings are optional and injected separately. See [SignalProcessing Rego Policies](configmap-policies.md) for the policy structure and customization guide.

### PostgreSQL

All PostgreSQL credentials must be provided via pre-created Kubernetes Secrets. See [Provision Secrets](../getting-started/installation.md#2-provision-secrets).

| Parameter | Description | Default |
|---|---|---|
| `postgresql.enabled` | Deploy in-chart PostgreSQL | `true` |
| `postgresql.variant` | PostgreSQL distribution variant (`upstream` or `ocp`). `ocp` uses Red Hat RHEL10 image with `POSTGRESQL_*` env vars and non-root UID 26, compatible with `restricted-v2` SCC. | `upstream` |
| `postgresql.replicas` | Number of replicas | `1` |
| `postgresql.image` | PostgreSQL container image | `postgres:16-alpine` |
| `postgresql.auth.existingSecret` | Pre-created Secret with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` keys (required) | `""` |
| `postgresql.auth.username` | Database username (only used when chart creates the DB) | `slm_user` |
| `postgresql.auth.database` | Database name (only used when chart creates the DB) | `action_history` |
| `postgresql.storage.size` | PVC size | `10Gi` |
| `postgresql.storage.storageClassName` | StorageClass (empty = cluster default) | `""` |

To use an external PostgreSQL instance, set `postgresql.enabled=false` and provide the connection details:

| Parameter | Description | Default |
|---|---|---|
| `postgresql.host` | External PostgreSQL hostname (required when `enabled=false`) | `""` |
| `postgresql.port` | External PostgreSQL port | `5432` |

### Valkey

All Valkey credentials must be provided via pre-created Kubernetes Secrets. See [Provision Secrets](../getting-started/installation.md#2-provision-secrets).

| Parameter | Description | Default |
|---|---|---|
| `valkey.enabled` | Deploy in-chart Valkey | `true` |
| `valkey.replicas` | Number of replicas | `1` |
| `valkey.image` | Valkey container image | `valkey/valkey:8-alpine` |
| `valkey.existingSecret` | Pre-created Secret with `valkey-secrets.yaml` key containing `password: <pass>` (required) | `""` |
| `valkey.storage.size` | PVC size | `512Mi` |
| `valkey.storage.storageClassName` | StorageClass (empty = cluster default) | `""` |

To use an external Valkey instance, set `valkey.enabled=false` and provide:

| Parameter | Description | Default |
|---|---|---|
| `valkey.host` | External Valkey hostname (required when `enabled=false`) | `""` |
| `valkey.port` | External Valkey port | `6379` |

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

Each entry creates a `ClusterRoleBinding` granting the ServiceAccount permission to submit signals.

See [Security & RBAC -- Signal Ingestion](../architecture/security-rbac.md#signal-ingestion) for the full TokenReview + SAR authentication flow and RBAC details. See [Installation -- Signal Source Authentication](../getting-started/installation.md#signal-source-authentication) for AlertManager configuration examples.

## LLM Provider Setup

LLM configuration lives in the **SDK config** file, not in `values.yaml`. See [HolmesGPT SDK Config](configmap-holmesgpt.md) for the full schema and provider examples.

**Quick setup:**

1. Copy the example SDK config from the chart:

```bash
cp charts/kubernaut/examples/sdk-config.yaml my-sdk-config.yaml
```

2. Edit `my-sdk-config.yaml` -- set `llm.provider`, `llm.model`, and any provider-specific fields.

3. Create the API key Secret:

```bash
kubectl create secret generic llm-credentials \
  --namespace kubernaut-system \
  --from-literal=OPENAI_API_KEY="sk-..."
```

4. Pass the SDK config during install:

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file holmesgptApi.sdkConfigContent=my-sdk-config.yaml \
  ...
```

### Temperature Tuning

The `temperature` parameter in the SDK config (default 0.7) controls the LLM's creativity vs determinism:

- **Lower (0.3--0.5):** More deterministic workflow selection. Recommended for production environments where consistency is critical.
- **Default (0.7):** Balanced. Good for most environments.
- **Higher (0.8--1.0):** More creative investigation. May discover non-obvious root causes but with less consistent workflow selection.

## Remediation Timeouts and Routing

The RemediationOrchestrator exposes per-phase timeouts and routing thresholds as `values.yaml` parameters under `remediationorchestrator.config`.

### Phase Timeouts

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.config.timeouts.global` | `1h` | Total remediation timeout |
| `remediationorchestrator.config.timeouts.processing` | `5m` | Signal Processing phase |
| `remediationorchestrator.config.timeouts.analyzing` | `10m` | AI Analysis (HAPI investigation) |
| `remediationorchestrator.config.timeouts.executing` | `30m` | Workflow execution |
| `remediationorchestrator.config.timeouts.verifying` | `30m` | Effectiveness assessment |

Individual `RemediationRequest` resources can override timeouts via `spec.timeouts`.

### Routing Configuration

| Parameter | Default | Description |
|---|---|---|
| `remediationorchestrator.config.routing.consecutiveFailureThreshold` | `3` | Block a resource after N consecutive remediation failures |
| `remediationorchestrator.config.routing.consecutiveFailureCooldown` | `1h` | How long to block after hitting the threshold |
| `remediationorchestrator.config.routing.recentlyRemediatedCooldown` | `5m` | Minimum interval between successful remediations for the same resource |
| `remediationorchestrator.config.routing.ineffectiveChainThreshold` | `3` | Consecutive ineffective remediations before escalation |
| `remediationorchestrator.config.routing.recurrenceCountThreshold` | `5` | Safety-net recurrence count |
| `remediationorchestrator.config.routing.ineffectiveTimeWindow` | `4h` | Lookback window for ineffective chain detection |

These settings prevent remediation storms and avoid repeating failed approaches.

## Execution Namespace

Workflow Jobs and Tekton PipelineRuns execute in a dedicated namespace, separate from the target resource's namespace. This creates a security boundary.

| Parameter | Default | Description |
|---|---|---|
| `workflowexecution.workflowNamespace` | `kubernaut-workflows` | Namespace for workflow execution |
| `workflowexecution.config.execution.cooldownPeriod` | `1m` | Cooldown between executions |

The `kubernaut-workflow-runner` ServiceAccount has pre-configured RBAC to read and patch resources across namespaces. See [Security & RBAC -- Workflow Execution](../architecture/security-rbac.md#workflow-execution) for the full permission list.

## TLS and Certificate Management

The Auth Webhook requires TLS certificates for Kubernetes admission webhook communication.

The chart supports three modes for managing TLS certificates used by the admission webhooks, controlled by `tls.mode`:

### Hook Mode (`tls.mode: hook`) -- Default

Self-signed certificates are generated and managed by Helm hooks. No external dependencies required. Suitable for development, testing, and CI environments.

**How it works:**

1. **Pre-install/pre-upgrade** (`tls-cert-gen`): Generates a self-signed CA and server certificate, stored as the `authwebhook-tls` Secret and `authwebhook-ca` ConfigMap.
2. **Post-install/post-upgrade** (`tls-cabundle-patch`): Patches the `caBundle` field on the webhook configurations.
3. **Post-delete** (`tls-cleanup`): Removes the `authwebhook-tls` Secret and `authwebhook-ca` ConfigMap.

**Automatic renewal**: On `helm upgrade`, if the certificate expires within 30 days, it is automatically regenerated. Additionally, the AuthWebhook init-container patches the `caBundle` on every pod restart, making the TLS configuration self-healing.

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

### Manual Mode (`tls.mode: manual`) -- External PKI

For environments where TLS certificates are managed externally (service mesh, external PKI, CI pipelines). The chart creates no TLS-related hook Jobs, no `Certificate` resources, and no `caBundle` patching.

**Operator responsibilities:**

1. Pre-create the `authwebhook-tls` Secret with `tls.crt` and `tls.key` entries
2. Pre-create the `authwebhook-ca` ConfigMap with the CA bundle
3. Ensure the `caBundle` field on `ValidatingWebhookConfiguration` resources matches the CA

```bash
helm install kubernaut charts/kubernaut/ \
  --namespace kubernaut-system \
  --set tls.mode=manual \
  -f my-values.yaml
```

This mode is useful when a service mesh (e.g., Istio) handles mTLS between the API server and webhooks, or when certificates are provisioned by an external PKI and injected via a sidecar or init container.

### CA Bundle Self-Healing

In `hook` mode, the AuthWebhook deployment includes an init-container that patches the `caBundle` field on the `ValidatingWebhookConfiguration` at startup. This makes TLS self-healing across Helm upgrades and interrupted installs -- if the `caBundle` drifts from the actual CA, the next pod restart corrects it automatically.

## Hot-Reload and Graceful Shutdown

Understanding which configuration changes take effect live vs which require a restart is critical for operational confidence.

### Hot-Reload Support

| Configuration | Hot-Reload | Mechanism | Latency |
|---|---|---|---|
| SP unified Rego policy (`policy.rego` -- environment, severity, priority, custom labels) | Yes | fsnotify file watcher | ~60s (kubelet sync) |
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

- [HolmesGPT SDK Config](configmap-holmesgpt.md) -- LLM provider, toolsets, and MCP server configuration
- [SignalProcessing Rego Policies](configmap-policies.md) -- Policy bundle format and customization
- [AIAnalysis Approval Policy](configmap-approval.md) -- Approval gates and risk factors
- [Notification Routing](configmap-notification.md) -- Routing schema and Slack setup
- [Rego Policies](policies.md) -- Rego language reference for classification policies
- [Notification Channels](notifications.md) -- Setting up Slack and other channels
- [Remediation Workflows](workflows.md) -- Authoring and registering workflows
- [Installation](../getting-started/installation.md) -- Using these values during deployment
