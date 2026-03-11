# Installation

This guide walks you through installing Kubernaut on a Kubernetes cluster using Helm.

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Kubernetes | v1.34+ | Kind recommended for development |
| Helm | v3.12+ | |
| kubectl | Matching cluster version | Must have cluster-admin access |
| LLM Provider | — | Vertex AI, OpenAI, or any LiteLLM-compatible provider |
| cert-manager | v1.12+ (production only) | Required when `tls.mode=cert-manager`. Not needed for dev (`tls.mode=hook` is default). |

Kubernaut deploys the following infrastructure components alongside its services:

- **PostgreSQL** — Stores audit events, workflow catalog, and action history
- **Redis** — Dead-letter queue for DataStorage

## Before You Install

Depending on your environment, you may need to prepare several items before running `helm install`. Use this checklist as a guide -- development installs can skip most items.

| What | Required? | Where to Configure | Documentation |
|---|---|---|---|
| **LLM API credentials** | Always | Kubernetes Secret (`llm-credentials`) | [LLM Provider Configuration](#llm-provider-configuration) below |
| **Database passwords** | Always (dev can use inline `--set`) | Kubernetes Secrets or `--set` flags | [Production tab](#install-from-source) below |
| **Rego policies** (severity, priority, environment, custom labels, approval) | Optional -- defaults are provided | ConfigMaps via Helm chart templates | [Rego Policies](../user-guide/policies.md) |
| **Notification credentials** (Slack, etc.) | Optional | Kubernetes Secrets + Helm values | [Notifications](../user-guide/notifications.md) |
| **Namespace labeling strategy** | Post-install | `kubectl label namespace` | [Signals & Alert Routing](../user-guide/signals.md) |
| **Workflow catalog** | Post-install | DataStorage API | [Workflows](../user-guide/workflows.md), [Workflow Authoring](../user-guide/workflow-authoring.md) |
| **cert-manager + Issuer** | Production only (`tls.mode=cert-manager`) | Cluster-level | [Production tab](#install-from-source) below, [TLS Configuration](../user-guide/configuration.md#tls-and-certificate-management) |

!!! tip "Complete Helm values reference"
    The chart ships with a comprehensive README documenting every configurable parameter, including service resources, timeouts, feature flags, and operational tuning. See [`charts/kubernaut/README.md`](https://github.com/jordigilh/kubernaut/blob/main/charts/kubernaut/README.md) in the repository.

## Helm Installation

### Install from Source

Kubernaut is currently installed from the local chart in the repository:

```bash
git clone https://github.com/jordigilh/kubernaut.git
cd kubernaut
```

=== "Development (Kind)"

    Self-signed TLS certificates are generated automatically via Helm hooks (`tls.mode=hook`, the default). No cert-manager required.

    ```bash
    kubectl apply -f charts/kubernaut/crds/
    helm install kubernaut charts/kubernaut \
      --namespace kubernaut-system \
      --create-namespace \
      --set postgresql.auth.password=devpassword \
      --set redis.password=devpassword \
      --set holmesgptApi.llm.provider=openai \
      --set holmesgptApi.llm.model=gpt-4o \
      --set holmesgptApi.llm.endpoint=https://api.openai.com/v1 \
      --skip-crds --wait --timeout 10m
    ```

=== "Production (cert-manager)"

    For production, use `tls.mode=cert-manager` so cert-manager handles certificate issuance, renewal, and CA bundle injection.

    **1. Install cert-manager** (if not already installed):

    ```bash
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
    kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=120s
    ```

    **2. Create an Issuer or ClusterIssuer.** For a self-signed issuer (suitable for internal clusters):

    ```yaml
    apiVersion: cert-manager.io/v1
    kind: ClusterIssuer
    metadata:
      name: selfsigned-issuer
    spec:
      selfSigned: {}
    ```

    For production, use your organization's CA or an ACME issuer.

    **3. Create secrets and install:**

    ```bash
    kubectl create namespace kubernaut-system

    kubectl create secret generic postgresql-secret \
      --namespace kubernaut-system \
      --from-literal=POSTGRES_USER=kubernaut \
      --from-literal=POSTGRES_PASSWORD=<your-password> \
      --from-literal=POSTGRES_DB=action_history

    kubectl create secret generic datastorage-db-secret \
      --namespace kubernaut-system \
      --from-literal=db-secrets.yaml="username: kubernaut
    password: <your-password>"

    kubectl create secret generic redis-secret \
      --namespace kubernaut-system \
      --from-literal=redis-secrets.yaml="password: <your-password>"

    kubectl apply -f charts/kubernaut/crds/
    helm install kubernaut charts/kubernaut \
      --namespace kubernaut-system \
      --set tls.mode=cert-manager \
      --set tls.certManager.issuerRef.name=selfsigned-issuer \
      --set postgresql.auth.existingSecret=postgresql-secret \
      --set datastorage.dbExistingSecret=datastorage-db-secret \
      --set redis.existingSecret=redis-secret \
      --set holmesgptApi.llm.provider=vertex_ai \
      --set holmesgptApi.llm.model=gemini-2.5-pro \
      --set holmesgptApi.llm.gcpProjectId=my-project \
      --set holmesgptApi.llm.gcpRegion=us-central1 \
      --skip-crds --wait --timeout 10m
    ```

    The chart creates a `Certificate` resource that provisions the `authwebhook-tls` Secret. cert-manager's `cainjector` writes the `caBundle` into webhook configurations automatically via the `cert-manager.io/inject-ca-from` annotation. No TLS hook jobs are created in this mode.

### Verify

```bash
kubectl get pods -n kubernaut-system
```

You should see pods for all services plus infrastructure:

```
NAME                                        READY   STATUS    RESTARTS
gateway-<hash>                              1/1     Running   0
datastorage-<hash>                          1/1     Running   0
remediationorchestrator-<hash>              1/1     Running   0
signalprocessing-<hash>                     1/1     Running   0
aianalysis-<hash>                           1/1     Running   0
workflowexecution-<hash>                    1/1     Running   0
effectivenessmonitor-<hash>                 1/1     Running   0
notification-<hash>                         1/1     Running   0
holmesgpt-api-<hash>                        1/1     Running   0
authwebhook-<hash>                          1/1     Running   0
event-exporter-<hash>                       1/1     Running   0
postgresql-0                                1/1     Running   0
redis-0                                     1/1     Running   0
```

## LLM Provider Configuration

Kubernaut's AI analysis requires an LLM provider. HolmesGPT supports any provider compatible with LiteLLM.

| Provider | `llm.provider` | Required Values |
|---|---|---|
| OpenAI | `openai` | `model`, `endpoint` |
| Vertex AI | `vertex_ai` | `model`, `gcpProjectId`, `gcpRegion` |
| Azure OpenAI | `azure` | `model`, `endpoint` |
| Any LiteLLM provider | varies | See [LiteLLM docs](https://docs.litellm.ai/docs/providers) |

The LLM API key should be provided as a Kubernetes Secret mounted into the HolmesGPT API pod. See [Configuration Reference](../user-guide/configuration.md) for details.

## Resource Scope

After installation, Kubernaut only manages namespaces and resources that opt in via labels:

```bash
kubectl label namespace my-app kubernaut.ai/managed=true
```

See [Signals & Alert Routing](../user-guide/signals.md) for details on scope management.

## Next Steps

- [Quickstart](quickstart.md) — Trigger your first automated remediation
- [Architecture Overview](architecture-overview.md) — Understand how the services work together
- [Configuration Reference](../user-guide/configuration.md) — Tune Kubernaut for your environment
