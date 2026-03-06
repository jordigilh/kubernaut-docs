# Installation

This guide walks you through installing Kubernaut on a Kubernetes cluster using Helm.

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Kubernetes | v1.34+ | Kind recommended for development |
| Helm | v3.12+ | |
| kubectl | Matching cluster version | Must have cluster-admin access |
| LLM Provider | — | Vertex AI, OpenAI, or any LiteLLM-compatible provider |

Kubernaut deploys the following infrastructure components alongside its services:

- **PostgreSQL** — Stores audit events, workflow catalog, and action history
- **Redis** — Dead-letter queue for DataStorage

## Helm Installation

!!! warning "Development Only"
    The Helm chart is currently configured for demo and development environments. Production hardening (HA, resource tuning, TLS, network policies) is in progress.

### Install from Source

Kubernaut is currently installed from the local chart in the repository:

```bash
git clone https://github.com/jordigilh/kubernaut.git
cd kubernaut
```

=== "Development (Kind)"

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

=== "With Existing Secrets (Production Path)"

    ```bash
    # 1. Create secrets ahead of time
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

    # 2. Install with existing secrets
    kubectl apply -f charts/kubernaut/crds/
    helm install kubernaut charts/kubernaut \
      --namespace kubernaut-system \
      --set postgresql.auth.existingSecret=postgresql-secret \
      --set datastorage.dbExistingSecret=datastorage-db-secret \
      --set redis.existingSecret=redis-secret \
      --set holmesgptApi.llm.provider=vertex_ai \
      --set holmesgptApi.llm.model=gemini-2.5-pro \
      --set holmesgptApi.llm.gcpProjectId=my-project \
      --set holmesgptApi.llm.gcpRegion=us-central1 \
      --skip-crds --wait --timeout 10m
    ```

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
