# Monitoring

All Kubernaut services expose Prometheus-compatible metrics and standard health check endpoints.

## Health Checks

Services expose health endpoints at different paths depending on their framework:

| Service Type | Liveness | Readiness | Notes |
|---|---|---|---|
| **Go CRD controllers** (RO, SP, AA, WFE, NT, EM) | `GET /healthz` | `GET /readyz` | controller-runtime defaults |
| **Gateway** | `GET /health` | `GET /ready` | Also supports `GET /healthz` |
| **DataStorage** | `GET /health/live` | `GET /health/ready` | Nested structure; checks PostgreSQL |
| **HolmesGPT API** | `GET /health` | `GET /ready` | Readiness includes LLM connectivity |

## Prometheus Metrics

All services expose metrics at `:9090/metrics` in Prometheus exposition format.

### Per-Service Metrics

| Service | Key Metrics |
|---|---|
| **Gateway** | Signals received, signals dropped (scope/dedup), RemediationRequests created |
| **Signal Processing** | Enrichment duration, classification results, phase transitions |
| **AI Analysis** | Investigation duration, HolmesGPT latency, Rego evaluation results, approval rates |
| **Orchestrator** | Remediation lifecycle duration, phase transition counts, child CRD creation rates |
| **Workflow Execution** | Execution duration, success/failure rates by engine (Job vs Tekton) |
| **Notification** | Delivery attempts, success/failure rates by channel |
| **Effectiveness Monitor** | Assessment duration, effectiveness scores, health check results |
| **DataStorage** | Audit event ingestion rate, query latencies, workflow catalog size |

### Common Labels

All metrics include standard labels:

- `service` — Service name
- `namespace` — Kubernetes namespace

### Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: kubernaut
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: [kubernaut-system]
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: (.+)
        replacement: ${1}:9090
```

## Logging

All services use **structured JSON logging** with configurable log levels:

```json
{
  "level": "info",
  "ts": "2026-03-04T10:30:00.000Z",
  "msg": "Reconciling RemediationRequest",
  "controller": "remediationorchestrator",
  "name": "rr-abc123",
  "namespace": "kubernaut-system",
  "phase": "Processing"
}
```

## Diagnostics

The **must-gather** tool collects comprehensive diagnostics:

```bash
kubectl run must-gather \
  --image=quay.io/kubernaut-ai/must-gather:latest \
  --restart=Never \
  -n kubernaut-system \
  -- collect
```

This gathers CRDs, logs, Tekton resources, DataStorage state, events, and metrics into a single archive for troubleshooting.

## Next Steps

- [Troubleshooting](troubleshooting.md) — Common issues and resolutions
- [Configuration Reference](../user-guide/configuration.md) — Tuning service parameters
