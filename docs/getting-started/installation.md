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

Prometheus and AlertManager integration is disabled by default. To enable effectiveness assessments based on alert resolution and metric queries, set `effectivenessmonitor.external.prometheusEnabled=true` and `effectivenessmonitor.external.alertManagerEnabled=true`.

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

All required secrets **must** be pre-created before running `helm install`. The chart validates the presence of database and cache secrets at template time and fails with a descriptive error if any are missing.

#### PostgreSQL + DataStorage (consolidated secret)

PostgreSQL and DataStorage share a single secret. The `db-secrets.yaml` key must use the **same password** as `POSTGRES_PASSWORD` to avoid authentication mismatches.

```bash
PG_PASSWORD=$(openssl rand -base64 24)
kubectl create secret generic postgresql-secret \
  --from-literal=POSTGRES_USER=slm_user \
  --from-literal=POSTGRES_PASSWORD="$PG_PASSWORD" \
  --from-literal=POSTGRES_DB=action_history \
  --from-literal=db-secrets.yaml="$(printf 'username: slm_user\npassword: %s' "$PG_PASSWORD")" \
  -n kubernaut-system
```

#### Valkey

```bash
kubectl create secret generic valkey-secret \
  --from-literal=valkey-secrets.yaml="$(printf 'password: %s' "$(openssl rand -base64 24)")" \
  -n kubernaut-system
```

#### Required secrets summary

| Secret Name | Required Keys | Consumed By |
|---|---|---|
| `postgresql-secret` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `db-secrets.yaml` | PostgreSQL (env vars), DataStorage (file mount), migration hook |
| `valkey-secret` | `valkey-secrets.yaml` | DataStorage (file mount) |
| `llm-credentials` | Provider-specific (see [below](#llm-credentials-required-for-ai-analysis)) | Kubernaut Agent |

To use custom secret names for database/cache secrets, pass `--set postgresql.auth.existingSecret=<name>` and `--set valkey.existingSecret=<name>` at install time. For LLM credentials, use `--set kubernautAgent.llm.credentialsSecretName=<name>`.

#### LLM credentials (required for AI analysis)

=== "OpenAI / Azure"

    ```bash
    kubectl create secret generic llm-credentials \
      --from-literal=OPENAI_API_KEY=sk-... \
      -n kubernaut-system
    ```

=== "Google Vertex AI"

    ```bash
    kubectl create secret generic llm-credentials \
      --from-file=application_default_credentials.json=path/to/service-account-key.json \
      -n kubernaut-system
    ```

    Kubernaut Agent auto-detects `application_default_credentials.json` in the mounted secret and sets `GOOGLE_APPLICATION_CREDENTIALS` to the mount path at runtime.
    With GCP Workload Identity the secret can be omitted.

    !!! note "Vertex AI requires an SDK config file"
        The quickstart `--set kubernautAgent.llm.provider=...` path only supports OpenAI and Anthropic. Vertex AI requires `gcp_project_id` and `gcp_region`, which must be provided via `sdkConfigContent` or `existingSdkConfigMap`. See [Advanced Configuration](#advanced-configuration) and the [Vertex AI SDK config example](../user-guide/configmap-kubernaut-agent.md#google-vertex-ai).

| Chart Value | Secret Name | Required Keys |
|---|---|---|
| `kubernautAgent.llm.credentialsSecretName` | `llm-credentials` (default) | Provider-specific: `OPENAI_API_KEY`, `AZURE_API_KEY`, or `application_default_credentials.json` (file) |

#### Notification credentials (optional, Slack only)

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

The chart is distributed as an OCI artifact. With the namespace and secrets provisioned in [Pre-Installation](#pre-installation), install using `helm install`:

### Kind / Vanilla Kubernetes

```bash
helm install kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --namespace kubernaut-system \
  --set kubernautAgent.llm.provider=openai \
  --set kubernautAgent.llm.model=gpt-4o
```

### OpenShift (OCP)

OpenShift requires additional configuration: cert-manager TLS mode, OCP monitoring endpoints (TLS + service-serving CA), and the Red Hat PostgreSQL image. Download the OCP values overlay from the [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios) repository and layer it on top:

```bash
helm install kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --namespace kubernaut-system \
  --values kubernaut-ocp-values.yaml \
  --set kubernautAgent.llm.provider=openai \
  --set kubernautAgent.llm.model=gpt-4o
```

The OCP values overlay configures:

| Setting | Value |
|---|---|
| TLS mode | `cert-manager` with a `selfsigned-issuer` ClusterIssuer |
| Signal source | `alertmanager-main` in `openshift-monitoring` |
| Prometheus URL | `https://prometheus-k8s.openshift-monitoring.svc:9091` (TLS) |
| AlertManager URL | `https://alertmanager-main.openshift-monitoring.svc:9094` (TLS) |
| PostgreSQL image | `registry.redhat.io/rhel10/postgresql-16` |

See the [kubernaut-ocp-values.yaml](https://github.com/jordigilh/kubernaut-demo-scenarios/blob/main/helm/kubernaut-ocp-values.yaml) reference file for the full configuration.

!!! tip "Disconnected / air-gapped clusters"
    If your OCP cluster has no internet access, see the [Disconnected Installation Guide](../operations/disconnected-install.md) for mirroring images and configuring the chart for offline use.

### Advanced Configuration

For advanced LLM configurations (Vertex AI, local models) or custom Rego policies, use `--set-file` to inject configuration files:

```bash
helm install kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --namespace kubernaut-system \
  --set-file kubernautAgent.sdkConfigContent=my-sdk-config.yaml \
  --set-file aianalysis.policies.content=my-approval.rego \
  --set-file signalprocessing.policy=my-policy.rego
```

See the [sdk-config.yaml.example](https://github.com/jordigilh/kubernaut-demo-scenarios/blob/main/helm/sdk-config.yaml.example) for a reference SDK config covering Vertex AI, Anthropic, OpenAI, and local models.

To pin a specific chart version, add `--version <version>`. Omitting `--version` pulls the latest release.

!!! tip "Production: disable demo fixtures"
    The chart seeds demo ActionTypes and RemediationWorkflows by default (`demoContent.enabled: true`) as a convenience path for getting started quickly. For production deployments where you want only your own workflows, add `--set demoContent.enabled=false`. See [Action Types and Workflows (Demo Content)](#action-types-and-workflows-demo-content) for details.

!!! tip "Start with minimal toolsets"
    The default SDK config ships with `toolsets: {}` (no optional toolsets). This is the recommended starting point — the Kubernetes core toolset is always available and handles most incident types (CrashLoopBackOff, config errors, OOMKilled). Enable additional toolsets like `prometheus/metrics` only for workloads that require metric-driven investigation. Unused toolsets add ~30% token overhead per investigation. See [Toolset Optimization](../user-guide/configmap-kubernaut-agent.md#toolset-optimization-pre-v12) for details.

### Quickstart

For a complete end-to-end demo environment (Kind cluster, monitoring stack, Kubernaut, infrastructure dependencies, workflow catalog), use the [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios) repository:

```bash
git clone https://github.com/jordigilh/kubernaut-demo-scenarios.git
cd kubernaut-demo-scenarios

# Configure your LLM provider
export KUBERNAUT_LLM_PROVIDER=openai
export KUBERNAUT_LLM_MODEL=gpt-4o

# Create the full demo environment (~10 minutes)
./scripts/setup-demo-cluster.sh
```

The setup script creates a Kind cluster, installs Prometheus/Grafana, deploys Kubernaut, and installs infrastructure dependencies (cert-manager, metrics-server, Istio, blackbox-exporter). Gitea and ArgoCD are installed automatically when running GitOps scenarios. See the [demo scenarios README](https://github.com/jordigilh/kubernaut-demo-scenarios#readme) for all options including OCP support and advanced LLM configuration.

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

See the [Upgrading Guide](../operations/upgrading/index.md) for general upgrade procedures, CRD schema change handling, and version-specific migration notes.

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
