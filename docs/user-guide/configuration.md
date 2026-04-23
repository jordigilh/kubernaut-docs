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
| `datastorage.dbExistingSecret` | **Deprecated.** Override secret name for DataStorage DB credentials. Leave empty to use the consolidated `postgresql-secret`. Only needed when DataStorage must read from a separate secret (e.g., BYO PostgreSQL with split credentials). | `""` |
| `datastorage.config.database.sslMode` | PostgreSQL SSL mode | `disable` |
| `datastorage.config.database.maxOpenConns` | Maximum open database connections | `100` |
| `datastorage.config.database.maxIdleConns` | Maximum idle database connections | `20` |
| `datastorage.config.database.connMaxLifetime` | Maximum connection lifetime | `1h` |
| `datastorage.resources` | CPU/memory requests and limits | See `values.yaml` |
| `datastorage.service.type` | Kubernetes Service type | `ClusterIP` |

### Kubernaut Agent (LLM integration)

| Parameter | Description | Default |
|---|---|---|
| `kubernautAgent.replicas` | Number of replicas | `1` |
| `kubernautAgent.llm.credentialsSecretName` | Name of pre-existing Secret with LLM API keys | `llm-credentials` |
| `kubernautAgent.sdkConfigContent` | SDK config YAML content (via `--set-file`). Used to create the `kubernaut-agent-sdk-config` ConfigMap. | `""` |
| `kubernautAgent.existingSdkConfigMap` | Pre-existing ConfigMap name for SDK config. Takes priority over `sdkConfigContent`. | `""` |

Kubernaut Agent uses two ConfigMaps: a **service config** (ports, logging, auth secret references) and an **SDK config** (LLM settings, toolsets, MCP servers). The SDK config is provided in one of two ways:

1. **Inline content** (recommended): Provide full SDK config content via `--set-file kubernautAgent.sdkConfigContent=my-sdk-config.yaml`. The chart creates the `kubernaut-agent-sdk-config` ConfigMap from this content.
2. **External ConfigMap**: Set `kubernautAgent.existingSdkConfigMap` to reference a pre-existing ConfigMap (takes priority over `sdkConfigContent`).

One of these two options **must** be provided; the chart will fail at install time if neither is set.

### Notification Controller

| Parameter | Description | Default |
|---|---|---|
| `notification.replicas` | Number of replicas | `1` |
| `notification.routing.content` | Routing config YAML content (via `--set-file`). Chart creates ConfigMap from this. | `""` |
| `notification.routing.existingConfigMap` | Pre-existing ConfigMap name for routing config. Takes priority over `routing.content`. | `""` |
| `notification.credentials` | Projected volume sources from K8s Secrets | `[]` |

When neither `routing.content` nor `routing.existingConfigMap` is set, the chart generates a default routing config:

- If `notification.slack.secretName` **is set**, the chart generates a **`slack-and-console`** catch-all receiver that routes all notification types to both Slack and console.
- If `notification.slack.secretName` **is not set**, the chart generates a **console-only** default.

To provide fully custom routing:

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
| `effectivenessmonitor.config.assessment.stabilizationWindow` | EM-internal stabilization window (logged at startup). **Note:** the actual stabilization delay enforced by the EM reconciler is read from `EA.spec.config.stabilizationWindow`, which is set by the RO (default `5m` via `remediationorchestrator.config.effectivenessAssessment.stabilizationWindow`). | `30s` |
| `effectivenessmonitor.config.assessment.validityWindow` | Time window for assessment validity | `300s` |
| `effectivenessmonitor.config.assessment.maxConcurrentReconciles` | Maximum concurrent EA reconciliations | `5` |
| `effectivenessmonitor.external.prometheusUrl` | Prometheus URL | `http://kube-prometheus-stack-prometheus.monitoring.svc:9090` |
| `effectivenessmonitor.external.prometheusEnabled` | Enable Prometheus integration | `false` |
| `effectivenessmonitor.external.alertManagerUrl` | AlertManager URL | `http://kube-prometheus-stack-alertmanager.monitoring.svc:9093` |
| `effectivenessmonitor.external.alertManagerEnabled` | Enable AlertManager integration | `false` |
| `effectivenessmonitor.external.connectionTimeout` | HTTP client timeout for Prometheus/AlertManager connections | `10s` |
| `effectivenessmonitor.external.prometheusLookback` | Duration before EA creation to query Prometheus for baseline metrics. Min: `1m`. | `30m` |
| `effectivenessmonitor.external.scrapeInterval` | Prometheus scrape interval used to derive requeue timing for metric assessment. Min: `5s`. | `60s` |
| `effectivenessmonitor.external.tlsCaFile` | Path to PEM CA bundle for HTTPS connections to Prometheus/AlertManager. On OCP with `ocpMonitoringRbac`, set to `/etc/ssl/em/service-ca.crt` (auto-mounted). | `""` |
| `effectivenessmonitor.external.ocpMonitoringRbac` | Create `cluster-monitoring-view` ClusterRoleBinding and (when `alertManagerEnabled`) a ClusterRole granting `monitoring.coreos.com/alertmanagers/api` access for OCP's `kube-rbac-proxy`. Also sets `IS_OPENSHIFT` env and auto-configures TLS CA trust via a service-CA ConfigMap. | `false` |

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

LLM configuration lives in the **SDK config** file, not in `values.yaml`. See [Kubernaut Agent SDK config](configmap-kubernaut-agent.md) for the full schema and provider examples.

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
  --set-file kubernautAgent.sdkConfigContent=my-sdk-config.yaml \
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
| `remediationorchestrator.config.timeouts.analyzing` | `10m` | AI Analysis (Kubernaut Agent investigation) |
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

## Ansible Engine (AWX/AAP)

To enable the Ansible execution engine for workflows that run Ansible playbooks via AWX or AAP, configure the `workflowexecution.config.ansible` block.

### 1. Create the AWX API token secret

Generate an API token in your AWX/AAP instance and store it in a Kubernetes Secret. The secret name is user-chosen -- it just needs to match `tokenSecretRef.name` in step 3.

```bash
kubectl create secret generic awx-api-token \
  --from-literal=token=<YOUR_AWX_API_TOKEN> \
  -n kubernaut-system
```

Replace `awx-api-token` with your preferred name (e.g. `aap-api-token` for AAP deployments).

### 2. Grant RBAC for the token secret

The `workflowexecution-controller` ServiceAccount needs permission to read the token secret at startup. The chart does **not** create this RBAC automatically -- you must create it:

```bash
kubectl create role awx-token-reader \
  --verb=get --resource=secrets --resource-name=awx-api-token \
  -n kubernaut-system

kubectl create rolebinding awx-token-reader \
  --role=awx-token-reader \
  --serviceaccount=kubernaut-system:workflowexecution-controller \
  -n kubernaut-system
```

Replace `awx-api-token` in `--resource-name` with the secret name you chose in step 1.

!!! warning "Without this RBAC, the ansible executor is silently skipped"
    The controller logs `"Failed to read AWX token secret, ansible executor not available"` and only registers the `job` and `tekton` engines. Any `WorkflowExecution` with `engine: ansible` will fail with `unsupported execution engine: "ansible"`.

### 3. Configure Helm values

Uncomment the ansible block in your values file:

```yaml
workflowexecution:
  config:
    ansible:
      apiURL: "https://awx.example.com"
      insecure: false            # set true to skip TLS verification
      organizationID: 1          # AWX organization ID for credential creation
      tokenSecretRef:
        name: awx-api-token      # Secret created in step 1
        key: token               # key within the Secret
        namespace: ""            # empty = release namespace (kubernaut-system)
```

| Parameter | Required | Default | Description |
|---|---|---|---|
| `ansible.apiURL` | Yes | -- | AWX/AAP API base URL |
| `ansible.insecure` | No | `false` | Skip TLS certificate verification |
| `ansible.organizationID` | No | `1` | AWX organization ID for ephemeral credential creation |
| `ansible.tokenSecretRef.name` | Yes | -- | Kubernetes Secret name containing the AWX API token |
| `ansible.tokenSecretRef.key` | No | `token` | Key within the Secret |
| `ansible.tokenSecretRef.namespace` | No | release namespace | Namespace of the token Secret |

### 4. Verify

After installing or upgrading with the ansible config, check the controller logs:

```bash
kubectl logs -n kubernaut-system deployment/workflowexecution-controller | grep -i ansible
```

Expected output:

```
"Ansible executor registered" "awxURL"="https://awx.example.com" "organizationID"=1
```

```
"Executor registry initialized" "engines"=["tekton","job","ansible"]
```

!!! note "Automatic K8s API credentials for playbooks"
    The ansible executor automatically injects the WE controller's in-cluster ServiceAccount token as an ephemeral AWX credential on every job launch. Playbooks using `kubernetes.core` modules receive `K8S_AUTH_HOST`, `K8S_AUTH_API_KEY`, and `K8S_AUTH_SSL_CA_CERT` without manual credential configuration. If the in-cluster environment is unavailable, the job proceeds without K8s credentials.

For authoring ansible workflows, see [Ansible (AWX/AAP) in Remediation Workflows](workflows.md#ansible-awxaap) and [Workflow Execution Architecture](../architecture/workflow-execution.md#ansible-awxaap).

## TLS and Certificate Management

Kubernaut configures **inter-service TLS** (REST between components) and **admission webhook TLS** (Auth Webhook). The Helm values below cover both surfaces; the following subsections describe how admission webhook certificates are generated in each mode.

### Inter-service TLS (Helm)

These values control mTLS and HTTPS for internal service-to-service calls (for example, Gateway → DataStorage). When the server finds TLS material under `tls.interService.certDir`, the primary API port (**8080**) uses HTTPS; health (**8081**) and metrics (**9090**) stay plain HTTP.

| Parameter | Description | Default |
|---|---|---|
| `tls.mode` | How TLS is provisioned: **`hook`** (default) or **`cert-manager`**. A separate **`manual`** mode exists for **admission webhook** certificates only; see [Manual Mode](#manual-mode-tlsmode-manual--external-pki) below. | `hook` |
| `tls.interService.certDir` | Directory mounted in pods containing the server cert/key (and related material) for inter-service listeners. | `/etc/tls` |
| `tls.interService.caFile` | Path to the PEM CA bundle used to **verify peer** certificates (client CA). | `/etc/tls-ca/ca.crt` |
| `tls.certManager.issuerRef.name` | **Required** when `tls.mode=cert-manager` -- Issuer or ClusterIssuer that signs inter-service and webhook certificates. | -- |
| `tls.certManager.issuerRef.kind` | Issuer kind (`Issuer` or `ClusterIssuer`). | `ClusterIssuer` |
| `tls.certManager.issuerRef.group` | API group for the Issuer reference. | `cert-manager.io` |

When `tls.mode=cert-manager`, the chart creates **cert-manager** `Certificate` resources. Recommended renewal settings (align with the chart defaults): **`duration: 8760h`** (365 days), **`renewBefore: 720h`** (30 days before expiry).

**Kubernaut Agent** (scraping / TLS to peers):

| Parameter | Description | Default |
|---|---|---|
| `kubernautAgent.prometheus.tls.enabled` | Enable TLS for Prometheus client connections from the agent. | (see `values.yaml`) |
| `kubernautAgent.prometheus.tls.caConfigMapName` | ConfigMap name holding the CA to trust. | (see `values.yaml`) |
| `kubernautAgent.prometheus.tls.caConfigMapKey` | Key within that ConfigMap for the PEM CA. | (see `values.yaml`) |

### Admission webhook TLS modes

The Auth Webhook requires a TLS server certificate for traffic from the Kubernetes API server. Inter-service and webhook TLS use the same `tls.mode` (and cert-manager issuer when applicable). The chart supports **three** modes for **admission** certificates, all selected with `tls.mode`:

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
| Kubernaut Agent config | Yes | file watcher (fsnotify) | ~60s |
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
| **Kubernaut Agent** | Go graceful shutdown; readiness returns 503; in-flight investigations complete |

This means `helm upgrade` and rolling updates do not disrupt in-flight remediations. The readiness probe change ensures no new traffic reaches the pod during drain.

## Next Steps

- [Kubernaut Agent SDK config](configmap-kubernaut-agent.md) -- LLM provider, toolsets, and MCP server configuration
- [SignalProcessing Rego Policies](configmap-policies.md) -- Policy bundle format and customization
- [AIAnalysis Approval Policy](configmap-approval.md) -- Approval gates and risk factors
- [Notification Routing](configmap-notification.md) -- Routing schema and Slack setup
- [Rego Policies](policies.md) -- Rego language reference for classification policies
- [Notification Channels](notifications.md) -- Setting up Slack and other channels
- [Remediation Workflows](workflows.md) -- Authoring and registering workflows
- [Installation](../getting-started/installation.md) -- Using these values during deployment
