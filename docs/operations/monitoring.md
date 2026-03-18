# Monitoring

All Kubernaut services expose Prometheus-compatible metrics and standard health check endpoints. This page provides a complete metrics reference for building Grafana dashboards and alerting rules.

## Health Checks

Services expose health endpoints at different paths depending on their framework:

| Service Type | Liveness | Readiness | Notes |
|---|---|---|---|
| **Go CRD controllers** (RO, SP, AA, WFE, NT, EM) | `GET /healthz` | `GET /readyz` | controller-runtime defaults |
| **Gateway** | `GET /health` | `GET /ready` | Also supports `GET /healthz` |
| **DataStorage** | `GET /health/live` | `GET /health/ready` | Nested structure; checks PostgreSQL |
| **HolmesGPT API** | `GET /health` | `GET /ready` | Readiness includes LLM connectivity |

## Scrape Configuration

All services expose metrics at `:9090/metrics` in Prometheus exposition format.

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

## Gateway Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `gateway_signals_received_total` | Counter | `source_type`, `severity` | Total signals received by source type and severity |
| `gateway_signals_deduplicated_total` | Counter | `signal_name` | Signals deduplicated (duplicate fingerprint) |
| `gateway_signals_rejected_total` | Counter | `reason` | Signals rejected by scope filtering |
| `gateway_crds_created_total` | Counter | `source_type`, `status` | RemediationRequest CRDs created |
| `gateway_crd_creation_errors_total` | Counter | `error_type` | CRD creation errors |
| `gateway_http_request_duration_seconds` | Histogram | `endpoint`, `method`, `status` | HTTP request duration |
| `gateway_circuit_breaker_state` | Gauge | `name` | Circuit breaker state (0=closed, 1=half-open, 2=open) |

## Signal Processing Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `signalprocessing_processing_total` | Counter | `phase`, `result` | Processing operations by phase and result |
| `signalprocessing_processing_duration_seconds` | Histogram | `phase` | Processing duration per phase |
| `signalprocessing_enrichment_errors_total` | Counter | `error_type` | Enrichment errors (K8s API issues) |

## AI Analysis Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `aianalysis_confidence_score_distribution` | Histogram | `signal_type` | LLM confidence score distribution |
| `aianalysis_approval_decisions_total` | Counter | `decision`, `environment` | Approval decisions (auto-approved, approval-required) |
| `aianalysis_failures_total` | Counter | `reason`, `sub_reason` | Analysis failures by reason |
| `aianalysis_rego_evaluations_total` | Counter | `outcome`, `degraded` | Rego policy evaluations |

## Remediation Orchestrator Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `kubernaut_remediationorchestrator_phase_transitions_total` | Counter | `from_phase`, `to_phase`, `namespace` | Phase transitions -- core throughput and failure metric |
| `kubernaut_remediationorchestrator_reconcile_duration_seconds` | Histogram | `namespace`, `phase` | Reconciliation duration per phase |
| `kubernaut_remediationorchestrator_timeouts_total` | Counter | `phase`, `namespace` | Remediation timeouts by phase |
| `kubernaut_remediationorchestrator_blocked_total` | Counter | `namespace`, `reason` | RRs blocked by routing engine |
| `kubernaut_remediationorchestrator_current_blocked` | Gauge | `namespace` | Currently blocked RRs |
| `kubernaut_remediationorchestrator_child_crd_creations_total` | Counter | `child_type`, `namespace` | Child CRD creations by type |
| `kubernaut_remediationorchestrator_no_action_needed_total` | Counter | `reason`, `namespace` | Remediations where no action was needed |
| `kubernaut_remediationorchestrator_duplicates_skipped_total` | Counter | `skip_reason`, `namespace` | Duplicate remediations skipped |
| `kubernaut_remediationorchestrator_approval_decisions_total` | Counter | `decision`, `namespace` | Human approval throughput |

## Workflow Execution Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `workflowexecution_reconciler_total` | Counter | `outcome` | Workflow executions by outcome (success/failure) |
| `workflowexecution_reconciler_duration_seconds` | Histogram | `outcome` | Execution duration |

## Notification Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `kubernaut_notification_delivery_attempts_total` | Counter | `channel`, `status` | Delivery attempts per channel |
| `kubernaut_notification_delivery_duration_seconds` | Histogram | `channel` | Delivery duration per channel |
| `kubernaut_notification_delivery_retries_total` | Counter | `channel`, `reason` | Delivery retries per channel |
| `kubernaut_notification_channel_circuit_breaker_state` | Gauge | `channel` | Circuit breaker state (0=closed, 1=open, 2=half-open) |
| `kubernaut_notification_channel_health_score` | Gauge | `channel` | Channel health score (0--100) |
| `kubernaut_notification_reconciler_active` | Gauge | `phase` | Active notification backlog by phase |

## Effectiveness Monitor Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `kubernaut_effectivenessmonitor_component_scores` | Histogram | `component` | Score distribution (0.0--1.0) per component |
| `kubernaut_effectivenessmonitor_component_assessments_total` | Counter | `component`, `result` | Component assessments (health, hash, alert, metrics) |
| `kubernaut_effectivenessmonitor_assessments_completed_total` | Counter | `reason` | Assessments completed (full, partial, expired) |
| `kubernaut_effectivenessmonitor_validity_expirations_total` | Counter | -- | Assessments that expired before completion |
| `kubernaut_effectivenessmonitor_external_call_errors_total` | Counter | `service`, `operation`, `error_type` | Prometheus/AlertManager call errors |

## DataStorage Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `datastorage_write_duration_seconds` | Histogram | `table` | Write latency |
| `datastorage_audit_lag_seconds` | Histogram | `service` | Lag between event occurrence and write |
| `datastorage_dlq_warning` | Gauge | `stream` | DLQ at 80% capacity (1 = warning) |
| `datastorage_dlq_critical` | Gauge | `stream` | DLQ at 90% capacity (1 = critical) |

## AI Agent API Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `aiagent_api_investigations_total` | Counter | `status` | Investigation requests by outcome |
| `aiagent_api_investigations_duration_seconds` | Histogram | -- | End-to-end investigation duration |
| `aiagent_api_llm_calls_total` | Counter | `provider`, `model`, `status` | LLM API calls by provider and outcome |
| `aiagent_api_llm_call_duration_seconds` | Histogram | `provider`, `model` | LLM call latency |
| `aiagent_api_llm_token_usage_total` | Counter | `provider`, `model`, `type` | Token consumption (prompt, completion) |

## Audit Pipeline Metrics

These metrics are shared across all Go services via the buffered audit store:

| Metric | Type | Labels | Description |
|---|---|---|---|
| `audit_events_dropped_total` | Counter | `service` | Events dropped due to full buffer -- data loss indicator |

## Controller-Runtime Built-in Metrics

All Go CRD controllers also expose standard controller-runtime metrics:

| Metric | Type | Description |
|---|---|---|
| `controller_runtime_reconcile_total` | Counter | Total reconciliations (`controller`, `result` labels) |
| `controller_runtime_reconcile_errors_total` | Counter | Reconciliation errors |
| `controller_runtime_reconcile_time_seconds` | Histogram | Reconciliation duration |
| `workqueue_depth` | Gauge | Current work queue depth |
| `workqueue_adds_total` | Counter | Work queue additions |
| `workqueue_queue_duration_seconds` | Histogram | Time items spend in queue |
| `workqueue_retries_total` | Counter | Work queue retries |

## Example PromQL Queries

### Remediation Throughput

```promql
# Remediations completed per minute
rate(kubernaut_remediationorchestrator_phase_transitions_total{to_phase="Completed"}[5m]) * 60
```

### Failure Rate

```promql
# Percentage of remediations that fail
sum(rate(kubernaut_remediationorchestrator_phase_transitions_total{to_phase="Failed"}[1h]))
/
sum(rate(kubernaut_remediationorchestrator_phase_transitions_total{to_phase=~"Completed|Failed|TimedOut"}[1h]))
* 100
```

### LLM Latency (p99)

```promql
histogram_quantile(0.99, rate(aiagent_api_llm_call_duration_seconds_bucket[5m]))
```

### Signal Deduplication Rate

```promql
sum(rate(gateway_signals_deduplicated_total[5m]))
/
(sum(rate(gateway_signals_received_total[5m])) + sum(rate(gateway_signals_deduplicated_total[5m])))
* 100
```

### Audit Pipeline Health

```promql
# Events being dropped -- alert if non-zero drop rate
rate(audit_events_dropped_total[5m]) > 0

# DLQ at warning capacity -- alert if any stream is at 80%
datastorage_dlq_warning > 0
```

### Effectiveness Score Distribution

```promql
# Median health score across assessments
histogram_quantile(0.5, rate(kubernaut_effectivenessmonitor_component_scores_bucket{component="health"}[1h]))
```

### Notification Circuit Breaker

```promql
# Alert when Slack circuit breaker opens
kubernaut_notification_channel_circuit_breaker_state{channel="slack"} > 0
```

### LLM Token Cost Tracking

```promql
# Tokens consumed per hour by provider
sum by (provider, type) (increase(aiagent_api_llm_token_usage_total[1h]))
```

## Logging

All services use **structured JSON logging** with configurable log levels:

```json
{
  "level": "info",
  "ts": "2026-03-04T10:30:00.000Z",
  "msg": "Reconciling RemediationRequest",
  "controller": "remediationorchestrator",
  "name": "rr-b157a3a9e42f-1c2b5576",
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

- [Troubleshooting](troubleshooting.md) -- Common issues and resolutions
- [Configuration Reference](../user-guide/configuration.md) -- Tuning service parameters
- [Audit & Observability](../user-guide/audit-and-observability.md) -- Audit event reference
