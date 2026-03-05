# Quickstart

This guide walks you through the **CrashLoopBackOff remediation demo** — Kubernaut's most common scenario. You'll deploy a healthy workload, inject a bad configuration that causes a crash loop, and watch Kubernaut detect, diagnose, and fix the problem automatically.

## Prerequisites

| Component | Purpose | How to Set Up |
|---|---|---|
| **Kind cluster** | Local Kubernetes environment | `kind create cluster --config deploy/demo/overlays/kind/kind-cluster-config.yaml` |
| **Kubernaut platform** | All 10 services running | Helm chart (see below) |
| **Prometheus + AlertManager** | Fires `KubePodCrashLooping` alert | kube-prometheus-stack via Helm |
| **kube-state-metrics** | Exposes `kube_pod_container_status_restarts_total` | Included in kube-prometheus-stack |
| **LLM provider** | Root cause analysis | API key configured in `~/.kubernaut/helm/llm-values.yaml` |
| **Workflow catalog** | `crashloop-rollback-v1` workflow registered | Seeded by the demo runner or manually |

### Automated Setup

The demo runner handles all prerequisites automatically:

```bash
git clone https://github.com/jordigilh/kubernaut.git
cd kubernaut
./deploy/demo/scenarios/crashloop/run.sh
```

This script:

1. Creates a Kind cluster (if not running)
2. Installs kube-prometheus-stack (Prometheus, AlertManager, kube-state-metrics, Grafana)
3. Installs Kubernaut via Helm (all 10 services + infrastructure)
4. Seeds the `crashloop-rollback-v1` workflow into the catalog
5. Runs the full scenario

### Manual Setup

If you prefer to set up each component yourself:

```bash
# 1. Create Kind cluster
kind create cluster --config deploy/demo/overlays/kind/kind-cluster-config.yaml

# 2. Install monitoring stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --values deploy/demo/helm/kube-prometheus-stack-values.yaml \
  --wait --timeout 5m

# 3. Configure LLM credentials
mkdir -p ~/.kubernaut/helm
cp deploy/demo/helm/llm-values.yaml.example ~/.kubernaut/helm/llm-values.yaml
# Edit ~/.kubernaut/helm/llm-values.yaml with your LLM provider credentials

# 4. Install Kubernaut
kubectl apply -f charts/kubernaut/crds/
helm install kubernaut charts/kubernaut \
  --namespace kubernaut-system --create-namespace \
  --values deploy/demo/helm/kubernaut-kind-values.yaml \
  --values ~/.kubernaut/helm/llm-values.yaml \
  --skip-crds --wait --timeout 10m
```

---

## Step 1: Deploy the Healthy Workload

Deploy a namespace, a healthy nginx worker, and a Prometheus alerting rule:

```bash
kubectl apply -f deploy/demo/scenarios/crashloop/manifests/namespace.yaml
kubectl apply -f deploy/demo/scenarios/crashloop/manifests/configmap.yaml
kubectl apply -f deploy/demo/scenarios/crashloop/manifests/deployment.yaml
kubectl apply -f deploy/demo/scenarios/crashloop/manifests/prometheus-rule.yaml
```

The namespace is labeled for Kubernaut management:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: demo-crashloop
  labels:
    kubernaut.ai/managed: "true"
    kubernaut.ai/environment: production
    kubernaut.ai/business-unit: engineering
    kubernaut.ai/service-owner: backend-team
    kubernaut.ai/criticality: high
    kubernaut.ai/sla-tier: tier-1
```

The deployment runs an nginx worker with a valid configuration:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
  namespace: demo-crashloop
  labels:
    app: worker
    kubernaut.ai/managed: "true"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
      - name: worker
        image: nginx:1.27-alpine
        ports:
        - containerPort: 8080
        volumeMounts:
        - name: config
          mountPath: /etc/nginx/nginx.conf
          subPath: nginx.conf
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
        readinessProbe:
          httpGet:
            path: /healthz
            port: 8080
      volumes:
      - name: config
        configMap:
          name: worker-config
```

And the Prometheus alerting rule detects crash loops:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: kubernaut-crashloop-rules
  namespace: demo-crashloop
spec:
  groups:
  - name: kubernaut-crashloop
    rules:
    - alert: KubePodCrashLooping
      expr: |
        increase(
          kube_pod_container_status_restarts_total{
            namespace="demo-crashloop",
            container="worker"
          }[3m]
        ) > 3
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: >
          Container {{ $labels.container }} in pod {{ $labels.pod }} is in
          CrashLoopBackOff with {{ $value | humanize }} restarts in the last 3 minutes.
```

## Step 2: Verify the Healthy State

Wait for the deployment to become available, then confirm the pods are running:

```bash
kubectl wait --for=condition=Available deployment/worker \
  -n demo-crashloop --timeout=120s

kubectl get pods -n demo-crashloop
```

You should see:

```
NAME                      READY   STATUS    RESTARTS   AGE
worker-5d4b8c7f9-abc12   1/1     Running   0          30s
worker-5d4b8c7f9-def34   1/1     Running   0          30s
```

Let Prometheus establish a healthy baseline (wait ~20 seconds for at least one scrape cycle).

## Step 3: Inject Bad Configuration

Now break the deployment by injecting an invalid nginx configuration:

```bash
bash deploy/demo/scenarios/crashloop/inject-bad-config.sh
```

This script creates a new ConfigMap with an invalid nginx directive and patches the deployment to reference it:

```yaml
# The bad ConfigMap contains:
http {
    invalid_directive_that_breaks_nginx on;  # causes nginx to fail on startup
    ...
}
```

```bash
# What the script does:
kubectl apply -f <bad-configmap>
kubectl patch deployment worker -n demo-crashloop \
  --type=json \
  -p '[{"op":"replace","path":"/spec/template/spec/volumes/0/configMap/name","value":"worker-config-bad"}]'
```

## Step 4: Observe CrashLoopBackOff

Watch the pods crash:

```bash
kubectl get pods -n demo-crashloop -w
```

You'll see pods cycle through `Error` → `CrashLoopBackOff` → `Error`:

```
NAME                      READY   STATUS             RESTARTS   AGE
worker-7f8a9b3c2-xyz78   0/1     CrashLoopBackOff   3          45s
worker-7f8a9b3c2-uvw56   0/1     Error              2          45s
```

## Step 5: Wait for Alert and Pipeline

The `KubePodCrashLooping` alert fires after >3 restarts in 3 minutes (~2-3 min). You can check Prometheus directly:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090 &
# Open http://localhost:9090/alerts to see the alert firing
```

Once the alert fires, AlertManager sends it to Kubernaut's Gateway webhook. Watch the remediation pipeline progress:

```bash
kubectl get remediationrequests,signalprocessing,aianalysis,workflowexecution,effectivenessassessment \
  -n kubernaut-system -w
```

The pipeline flows through these stages:

| Stage | What's Happening | Duration |
|---|---|---|
| **Gateway** | Alert received, RemediationRequest created | Instant |
| **Signal Processing** | Enriches signal with K8s context (owner chain, namespace labels, severity) | ~5s |
| **AI Analysis** | HolmesGPT investigates via `kubectl` (pod logs, events, config) | 30-90s |
| **Approval** | Auto-approved if confidence >= 80%, otherwise awaits human review | Instant or manual |
| **Workflow Execution** | Runs `kubectl rollout undo deployment/worker` via Job | ~10s |
| **Effectiveness Monitor** | Confirms pods running, restart count stabilized | 5 min (stabilization window) |

## Step 6: Verify the Fix

After the pipeline completes, check that the workload is healthy again:

```bash
kubectl get pods -n demo-crashloop
```

```
NAME                      READY   STATUS    RESTARTS   AGE
worker-5d4b8c7f9-new12   1/1     Running   0          60s
worker-5d4b8c7f9-new34   1/1     Running   0          60s
```

The deployment was rolled back to the previous healthy revision:

```bash
kubectl rollout history deployment/worker -n demo-crashloop
```

## Clean Up

```bash
kubectl delete namespace demo-crashloop
```

## What Just Happened?

1. Kubernaut's **Gateway** received the `KubePodCrashLooping` alert from AlertManager
2. **Signal Processing** enriched it with Kubernetes context (owner chain: Pod → ReplicaSet → Deployment, namespace labels: production, high criticality)
3. **AI Analysis** submitted the enriched signal to HolmesGPT, which used `kubectl` to inspect the crashing pods, read their logs (`unknown directive "invalid_directive_that_breaks_nginx"`), and diagnosed the root cause as a bad ConfigMap
4. The LLM searched the workflow catalog and selected `crashloop-rollback-v1` (RollbackDeployment)
5. **Workflow Execution** ran the rollback Job, which executed `kubectl rollout undo deployment/worker`
6. **Effectiveness Monitor** waited for the stabilization window and confirmed the pods were healthy with no further restarts
7. **Notification** informed the team about the successful remediation

The full audit trail of every step is stored in PostgreSQL for compliance and post-mortem review.

## Next Steps

- [Core Concepts](../user-guide/concepts.md) — Understand the data model and lifecycle
- [Remediation Workflows](../user-guide/workflows.md) — Write your own workflow schemas
- [Human Approval](../user-guide/approval.md) — Configure approval gates and confidence thresholds
- [Architecture Overview](architecture-overview.md) — Dive deeper into the system design
