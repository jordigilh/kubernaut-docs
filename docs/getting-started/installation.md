# Installation

This guide walks you through installing Kubernaut on a Kubernetes cluster using Helm.

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Kubernetes | 1.32+ | selectableFields GA in 1.32; required for CRD field selectors |
| Helm | 3.12+ | |
| StorageClass | dynamic provisioning | For PostgreSQL and Valkey PVCs |
| cert-manager | 1.12+ (production) | Required when `tls.mode=cert-manager`. Optional for dev (`tls.mode=hook` is default). |

**Workflow execution engine** (at least one):

- Kubernetes Jobs (built-in, no extra dependency)
- Tekton Pipelines (optional)
- Ansible Automation Platform (AAP) / AWX (optional)

**External monitoring** (recommended):

- [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack) provides:
  - Alert-based signal ingestion (AlertManager sends alerts to Gateway)
  - Metrics enrichment for effectiveness assessments (Prometheus queries)
  - Alert resolution checks (AlertManager API)
  - Metrics scraping for all Kubernaut services (all pods expose `/metrics`)

If Prometheus and AlertManager are not deployed, set `effectivenessmonitor.external.prometheusEnabled=false` and `effectivenessmonitor.external.alertManagerEnabled=false`.

## Infrastructure Setup

Complete these steps before installing the Kubernaut chart.

### Storage

PostgreSQL and Valkey each require a PersistentVolumeClaim for data persistence:

| Component | PVC Name | Default Size | Values |
|---|---|---|---|
| PostgreSQL | `postgresql-data` | `10Gi` | `postgresql.storage.size`, `postgresql.storage.storageClassName` |
| Valkey | `valkey-data` | `512Mi` | `valkey.storage.size`, `valkey.storage.storageClassName` |

Both PVCs are annotated with `helm.sh/resource-policy: keep` so data survives `helm uninstall`.

If the cluster has no default StorageClass, set `storageClassName` explicitly:

```yaml
postgresql:
  storage:
    size: 50Gi
    storageClassName: gp3-encrypted
valkey:
  storage:
    storageClassName: gp3-encrypted
```

To skip in-chart databases entirely and use external instances, set `postgresql.enabled=false` and/or `valkey.enabled=false` and configure `postgresql.host`/`valkey.host` values in the [Configuration Reference](../user-guide/configuration.md).

### Prometheus and AlertManager

Kubernaut integrates with Prometheus and AlertManager at two levels:

**1. EffectivenessMonitor queries** -- EM queries Prometheus for metric-based assessment enrichment and AlertManager for alert resolution checks. The expected service endpoints (configurable):

| Service | Default URL | Override |
|---|---|---|
| Prometheus | `http://kube-prometheus-stack-prometheus.monitoring.svc:9090` | `effectivenessmonitor.external.prometheusUrl` |
| AlertManager | `http://kube-prometheus-stack-alertmanager.monitoring.svc:9093` | `effectivenessmonitor.external.alertManagerUrl` |

**2. AlertManager sends alerts to Gateway** -- The Gateway authenticates every signal ingestion request using Kubernetes TokenReview + SubjectAccessReview (SAR). AlertManager must include a bearer token in its webhook requests. See [Signal Source Authentication](#signal-source-authentication) below for the full configuration.

### Signal Source Authentication

The Gateway authenticates **every** signal ingestion request using Kubernetes TokenReview + SubjectAccessReview (SAR). Signal sources (e.g., AlertManager) must present a valid ServiceAccount bearer token, and that ServiceAccount must have RBAC permission to submit signals.

The chart provides a `gateway-signal-source` ClusterRole that grants `create` on the `gateway-service` resource. Each entry in `gateway.auth.signalSources` creates a ClusterRoleBinding binding this role to the specified ServiceAccount.

See [Security & RBAC](../architecture/security-rbac.md#signal-ingestion) for the full TokenReview + SAR flow, Gateway RBAC details, and the `gateway-signal-source` ClusterRole definition.

#### Configuring AlertManager

AlertManager must include `http_config.bearer_token_file` in its webhook receiver so the Gateway can authenticate the request. The Gateway service is `gateway-service` on port `8080`, and the AlertManager adapter path is `/api/v1/signals/prometheus`.

```yaml
# alertmanager.yml (standalone)
receivers:
  - name: kubernaut
    webhook_configs:
      - url: "http://gateway-service.kubernaut-system.svc.cluster.local:8080/api/v1/signals/prometheus"
        send_resolved: true
        http_config:
          bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token

route:
  routes:
    - receiver: kubernaut
      matchers:
        - alertname!=""
      continue: true
```

For **kube-prometheus-stack**, configure via Helm values:

```yaml
# kube-prometheus-stack values.yaml
alertmanager:
  config:
    receivers:
      - name: kubernaut
        webhook_configs:
          - url: "http://gateway-service.kubernaut-system.svc.cluster.local:8080/api/v1/signals/prometheus"
            send_resolved: true
            http_config:
              bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    route:
      routes:
        - receiver: kubernaut
          matchers:
            - alertname!=""
          continue: true
```

Then register AlertManager's ServiceAccount as an authorized signal source in your **Kubernaut** values:

```yaml
# kubernaut values.yaml
gateway:
  auth:
    signalSources:
      - name: alertmanager
        serviceAccount: alertmanager-kube-prometheus-stack-alertmanager
        namespace: monitoring
```

!!! warning
    Without `bearer_token_file`, AlertManager sends unauthenticated requests and the Gateway rejects them with `401 Unauthorized`. Without the `signalSources` entry, the token is valid but SAR denies access with `403 Forbidden`.

## Pre-Installation

Kubernaut uses 9 Custom Resource Definitions. Helm installs them automatically from the chart's `crds/` directory on first install -- no manual step is needed. For upgrades, see [Upgrading](#upgrading).

### 1. Create the Namespace

```bash
kubectl create namespace kubernaut-system
```

### 2. Provision Secrets

The chart **auto-generates** credentials for PostgreSQL, DataStorage, and Valkey on first install using random alphanumeric passwords. For most deployments (including quickstart), no manual secret creation is needed for these services.

!!! tip "Production: bring your own secrets"
    To use specific credentials (e.g., managed databases, password policies), create the secrets before install and reference them via Helm values. The chart skips auto-generation when an existing secret is found.

    | Chart Value | Auto-generated Secret | Required Keys |
    |---|---|---|
    | `postgresql.auth.existingSecret` | `postgresql-secret` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
    | `datastorage.dbExistingSecret` | `datastorage-db-secret` | `db-secrets.yaml` (YAML with `username` and `password`) |
    | `valkey.existingSecret` | `valkey-secret` | `valkey-secrets.yaml` (YAML with `password`) |

**LLM credentials** (required for AI analysis):

=== "OpenAI / Azure"

    ```bash
    kubectl create secret generic llm-credentials \
      --from-literal=OPENAI_API_KEY=sk-... \
      -n kubernaut-system
    ```

=== "Google Vertex AI"

    ```bash
    kubectl create secret generic llm-credentials \
      --from-file=GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json \
      -n kubernaut-system
    ```

    The chart mounts this file and sets `GOOGLE_APPLICATION_CREDENTIALS` automatically.
    With GCP Workload Identity the secret can be omitted.

| Chart Value | Secret Name | Required Keys |
|---|---|---|
| `holmesgptApi.llm.credentialsSecretName` | `llm-credentials` (default) | Provider-specific: `OPENAI_API_KEY`, `AZURE_API_KEY`, or `GOOGLE_APPLICATION_CREDENTIALS` (file) |

The LLM credentials secret **must** exist before installing the chart. Without valid credentials, AI analysis cannot function.

**Notification credentials** (optional, only for Slack delivery):

```bash
kubectl create secret generic slack-webhook \
  --from-literal=webhook-url=https://hooks.slack.com/services/T.../B.../... \
  -n kubernaut-system
```

| Chart Value | Secret Name | Required Keys |
|---|---|---|
| `notification.slack.secretName` | `slack-webhook` (example) | `webhook-url` |

Only required when Slack delivery is configured. When using console-only routing (default), no notification secret is needed. For advanced multi-receiver routing, use `notification.credentials[]` and `notification.routing.content` instead of the Slack shortcut.

## Install

### Standard (Kind / vanilla Kubernetes)

With namespace and LLM credentials provisioned, the chart handles everything else (DB secrets, default policies, demo content):

```bash
helm install kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --namespace kubernaut-system \
  --set holmesgptApi.llm.provider=openai \
  --set holmesgptApi.llm.model=gpt-4o
```

For advanced LLM configurations (Vertex AI, local models) or custom Rego policies, use `--set-file`:

```bash
helm install kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --namespace kubernaut-system \
  --set-file holmesgptApi.sdkConfigContent=my-sdk-config.yaml \
  --set-file aianalysis.policies.content=my-approval.rego \
  --set-file signalprocessing.policy=my-policy.rego
```

See `charts/kubernaut/examples/` for reference configuration files you can copy and customize.

!!! tip "Production: disable demo fixtures"
    The chart seeds demo ActionTypes and RemediationWorkflows by default (`demoContent.enabled: true`) as a convenience path for getting started quickly. For production deployments where you want only your own workflows, disable it:

    ```bash
    helm install kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
      --namespace kubernaut-system \
      --set demoContent.enabled=false \
      --set holmesgptApi.llm.provider=openai \
      --set holmesgptApi.llm.model=gpt-4o
    ```

    See [Action Types and Workflows (Demo Content)](#action-types-and-workflows-demo-content) for details.

### OpenShift (OCP)

Layer the `values-ocp.yaml` overlay to switch to Red Hat catalog images and configure OCP monitoring endpoints:

```bash
helm install kubernaut charts/kubernaut/ \
  --namespace kubernaut-system \
  -f charts/kubernaut/values-ocp.yaml \
  --set holmesgptApi.llm.provider=openai \
  --set holmesgptApi.llm.model=gpt-4o
```

!!! tip "Disconnected / air-gapped clusters"
    If your OCP cluster has no internet access, see the [Disconnected Installation Guide](../operations/disconnected-install.md) for mirroring images and configuring the chart for offline use.

### From OCI Registry

```bash
helm install kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --version {{ chart_version }} \
  --namespace kubernaut-system \
  -f my-values.yaml
```

### Quickstart

The only customization required is the LLM provider credentials. The chart auto-generates all infrastructure secrets, embeds default Rego policies, and seeds demo ActionTypes and RemediationWorkflows.

```bash
# 1. Create namespace and LLM credentials
kubectl create namespace kubernaut-system
kubectl create secret generic llm-credentials \
  --from-literal=OPENAI_API_KEY=sk-... \
  -n kubernaut-system

# 2. Install Kubernaut
helm install kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --namespace kubernaut-system \
  --set holmesgptApi.llm.provider=openai \
  --set holmesgptApi.llm.model=gpt-4o
```

!!! tip "Start with minimal toolsets"
    The auto-generated SDK config ships with `toolsets: {}` (no optional toolsets). This is the recommended starting point — the Kubernetes core toolset is always available and handles most incident types (CrashLoopBackOff, config errors, OOMKilled). Enable additional toolsets like `prometheus/metrics` only for workloads that require metric-driven investigation. Unused toolsets add ~30% token overhead per investigation. See [Toolset Optimization](../user-guide/configmap-holmesgpt.md#toolset-optimization-pre-v12) for details.

See the [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios) repository for complete demo scenarios that exercise the full remediation pipeline.

### Post-Install Verification

```bash
# All pods should be 1/1 Running (readiness probes confirm service health)
kubectl get pods -n kubernaut-system

# Verify workflow catalog
kubectl get remediationworkflows -A
```

## Post-Installation

### Action Types and Workflows (Demo Content)

When `demoContent.enabled: true` (the default), the chart seeds demo ActionType definitions and RemediationWorkflows into the catalog as a convenience path for getting started quickly. These are not built-in product features -- they are reusable demo content covering common remediation scenarios (CrashLoopBackOff rollback, OOM memory increase, GitOps revert, etc.). No manual loading is required.

To disable demo content for production, add `--set demoContent.enabled=false` during install. See the [production tip](#install) in the Install section.

### Custom Remediation Workflows

Each RemediationWorkflow references an ActionType by name. When `demoContent.enabled: true` (default), demo ActionTypes are available in the catalog. For production deployments with `demoContent.enabled=false`, register your own ActionType CRs before creating RemediationWorkflows. See [Authoring Workflows](../user-guide/workflow-authoring.md) for guidelines and the [Action Type reference](../user-guide/workflows.md#action-type-taxonomy) for the full list.

## Resource Scope

After installation, Kubernaut only manages namespaces and resources that opt in via labels:

```bash
kubectl label namespace my-app kubernaut.ai/managed=true
```

See [Signals & Alert Routing](../user-guide/signals.md) for details on scope management.

## Upgrading

Helm does **not** upgrade CRDs on `helm upgrade`. When upgrading to a chart version with CRD schema changes, extract and apply the new CRDs first:

```bash
# 1. Pull the new chart version and extract CRDs
helm pull oci://quay.io/kubernaut-ai/charts/kubernaut \
  --version <new-version> --untar
kubectl apply --server-side --force-conflicts -f kubernaut/crds/

# 2. Upgrade the release
helm upgrade kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --version <new-version> \
  -n kubernaut-system -f my-values.yaml
```

Key upgrade behaviors:

- **TLS certificates** (`tls.mode: hook`): Renewed automatically if expiring within 30 days. In `cert-manager` mode, cert-manager handles renewal.
- **Database migrations** run automatically via the post-upgrade hook.
- **PVCs** are not modified (immutable for bound claims).
- **ConfigMaps and Secrets** are updated to reflect new values.

## Uninstalling

```bash
helm uninstall kubernaut -n kubernaut-system
```

### What is retained after uninstall

| Resource | Behavior | Manual cleanup |
|---|---|---|
| PostgreSQL PVC (`postgresql-data`) | **Retained** (`resource-policy: keep`) | `kubectl delete pvc postgresql-data -n kubernaut-system` |
| Valkey PVC (`valkey-data`) | **Retained** (`resource-policy: keep`) | `kubectl delete pvc valkey-data -n kubernaut-system` |
| CRDs (9 definitions) | **Retained** (standard Helm behavior) | `kubectl delete crd <name>.kubernaut.ai` for each CRD |
| CR instances | **Retained** until CRDs are deleted | Deleted when parent CRD is deleted |
| Hook ClusterRole/CRB | **Retained** (hook resources not tracked by Helm) | `kubectl delete clusterrole kubernaut-hook-role --ignore-not-found` and `kubectl delete clusterrolebinding kubernaut-hook-rolebinding --ignore-not-found` |
| TLS Secret and CA ConfigMap | **Deleted** by post-delete hook (`hook` mode) or by cert-manager (`cert-manager` mode) | -- |
| Cluster-scoped RBAC | **Deleted** by Helm | -- |
| `kubernaut-workflows` namespace | **Deleted** by Helm | May get stuck if it contains active Jobs; see below |

If the `kubernaut-workflows` namespace gets stuck in `Terminating` state:

```bash
kubectl get all -n kubernaut-workflows
kubectl delete jobs --all -n kubernaut-workflows
```

### Full cleanup

To remove everything including persistent data:

```bash
helm uninstall kubernaut -n kubernaut-system

# Remove PVCs retained by resource policy
kubectl delete pvc postgresql-data valkey-data -n kubernaut-system

# Remove hook-created cluster resources (not tracked by Helm)
kubectl delete clusterrole kubernaut-hook-role --ignore-not-found
kubectl delete clusterrolebinding kubernaut-hook-rolebinding --ignore-not-found

# Remove CRDs and all CR instances
kubectl delete crd actiontypes.kubernaut.ai aianalyses.kubernaut.ai \
  effectivenessassessments.kubernaut.ai notificationrequests.kubernaut.ai \
  remediationapprovalrequests.kubernaut.ai remediationrequests.kubernaut.ai \
  remediationworkflows.kubernaut.ai signalprocessings.kubernaut.ai \
  workflowexecutions.kubernaut.ai

kubectl delete namespace kubernaut-system
```

## Known Limitations

- **Single installation per cluster**: Cluster-scoped resources (ClusterRoles, ClusterRoleBindings, WebhookConfigurations) use static names. Installing multiple releases in different namespaces will cause conflicts.
- **Init container timeouts**: The `wait-for-postgres` init containers in DataStorage and the migration Job have no timeout. If PostgreSQL is unavailable, these containers will block indefinitely.

## Next Steps

- [Quickstart](quickstart.md) -- Trigger your first automated remediation
- [Architecture Overview](architecture-overview.md) -- Understand how the services work together
- [Configuration Reference](../user-guide/configuration.md) -- Tune Kubernaut for your environment
- [Rego Policies](../user-guide/policies.md) -- Customize classification and approval policies
- [Workflows](../user-guide/workflows.md) -- Author and register remediation workflows
