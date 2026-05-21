# Monitoring

All Kubernaut services expose Prometheus-compatible metrics and standard health check endpoints. This page provides a complete metrics reference for building Grafana dashboards and alerting rules.

In **v1.3**, the Kubernaut Agent metrics were renamed from the legacy `holmesgpt_*` namespace to `aiagent_api_*`. **Effectiveness Monitor** metrics remain stable from v1.2. **Notification** metrics were refactored internally (DD-METRICS-001: 3-layer → 1-layer) but the metric names and semantics are unchanged.

## Health Checks

**v1.3+ (three-port components):** Gateway, DataStorage, Kubernaut Agent, and the AIAnalysis controller split traffic by port: **8080** (primary API; **HTTPS** when inter-service TLS is enabled), **8081** (health only -- **plain HTTP**), and **9090** (`/metrics` -- **plain HTTP**). Probes use **8081** with `GET /healthz` (liveness) and `GET /readyz` (readiness). **`/livez` is not a registered path** (do not use it in probes or docs).

| Service Type | Liveness | Readiness | Port | Notes |
|---|---|---|---|---|
| **Go CRD controllers** (RO, SP, WFE, NT, EM) | `GET /healthz` | `GET /readyz` | **8081** (plain HTTP) | Metrics on **9090** only -- no 8080 API |
| **AIAnalysis** | `GET /healthz` | `GET /readyz` | **8081** (plain HTTP) | Three-port: API **8080**, metrics **9090** |
| **Gateway** | `GET /healthz` | `GET /readyz` | **8081** (plain HTTP) | Ingestion API on **8080** |
| **DataStorage** | `GET /healthz` | `GET /readyz` | **8081** (plain HTTP) | Readiness checks PostgreSQL; REST API on **8080** |
| **Kubernaut Agent** | `GET /healthz` | `GET /readyz` | **8081** (plain HTTP) | Readiness includes LLM connectivity |
| **API Frontend** | `GET /healthz` | `GET /readyz` | **8081** (plain HTTP) | API on **8443**, metrics on **9090** (v1.5+) |
| **Auth Webhook** | `GET /healthz` | `GET /readyz` | **8081** (plain HTTP) | Service **443** → targetPort **9443** for admission |

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
| `kubernaut_alignment_grounding_total` | Counter | `result` | Shadow agent grounding review verdicts (v1.4) |
| `kubernaut_alignment_grounding_duration_seconds` | Histogram | | Grounding review latency (v1.4) |
| `alignmentCircuitBreakerTotal` | Counter | | Investigations cancelled by alignment circuit breaker (v1.4) |
| `aiagent_api_llm_circuit_breaker_state` | Gauge | | LLM HTTP client circuit breaker state (v1.4) |
| `aiagent_api_ds_circuit_breaker_state` | Gauge | | DataStorage HTTP client circuit breaker state (v1.4) |

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

!!! note "DD-METRICS-001: Metrics wiring pattern"
    In v1.3, the Notification controller's metrics were collapsed from a **3-layer stack** (interface → recorder → raw metrics) to a **single dependency-injected `*Metrics` struct**, matching the pattern mandated by DD-METRICS-001 for all CRD controllers. The metrics struct is injected into both the reconciler and the delivery orchestrator at startup via `NewMetrics()`. Test isolation uses `NewMetricsWithRegistry(prometheus.NewRegistry())` instead of interface mocking.

| Metric | Type | Labels | Description |
|---|---|---|---|
| `kubernaut_notification_reconciler_active` | Gauge | `phase` | Active notification backlog by phase (Pending, Sending, Sent, Retrying, PartiallySent, Failed) |
| `kubernaut_notification_delivery_attempts_total` | Counter | `channel`, `status` | Delivery attempts per channel |
| `kubernaut_notification_delivery_duration_seconds` | Histogram | `channel` | Delivery duration per channel |
| `kubernaut_notification_delivery_retries_total` | Counter | `channel` | Delivery retries per channel |
| `kubernaut_notification_channel_circuit_breaker_state` | Gauge | `channel` | Circuit breaker state (0=closed, 1=open, 2=half-open) |
| `kubernaut_notification_channel_health_score` | Gauge | `channel` | Channel health score (0–100) |

## Effectiveness Monitor Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `kubernaut_effectivenessmonitor_component_scores` | Histogram | `component` | Score distribution (0.0--1.0) per component |
| `kubernaut_effectivenessmonitor_component_assessments_total` | Counter | `component`, `result` | Component assessments (health, hash, alert, metrics) |
| `kubernaut_effectivenessmonitor_assessments_completed_total` | Counter | `reason` | Assessments completed (`Full`, `Partial`, `Expired`, and other `AssessmentReason` values) |
| `kubernaut_effectivenessmonitor_validity_expirations_total` | Counter | -- | Assessments that expired before completion |
| `kubernaut_effectivenessmonitor_external_call_errors_total` | Counter | `service`, `operation`, `error_type` | Prometheus/AlertManager call errors |

## DataStorage Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `datastorage_write_duration_seconds` | Histogram | `table` | Duration of write operations in seconds |
| `datastorage_audit_lag_seconds` | Histogram | `service` | Lag between event occurrence and write |
| `datastorage_dlq_warning` | Gauge | `stream` | DLQ at 80% capacity (1 = warning) |
| `datastorage_dlq_critical` | Gauge | `stream` | DLQ at 90% capacity (1 = critical) |

## API Frontend Metrics (v1.5+)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `af_http_requests_total` | Counter | `method`, `path`, `status` | Total HTTP requests |
| `af_http_request_duration_seconds` | Histogram | `method`, `path`, `status` | HTTP request latency distribution |
| `af_http_panics_total` | Counter | -- | HTTP handler panics recovered |
| `af_tool_calls_total` | Counter | `tool`, `result` | MCP/A2A tool invocations by tool name and result |
| `af_tool_call_duration_seconds` | Histogram | `tool`, `type` | Tool execution latency by tool name and type |
| `af_downstream_request_duration_seconds` | Histogram | `dependency`, `status_class` | Downstream HTTP request duration (KA, DS) |
| `af_auth_duration_seconds` | Histogram | `result` | Authentication latency distribution |
| `af_rate_limit_rejections_total` | Counter | `tier`, `reason` | Rate limit rejections |
| `af_sse_active_connections` | Gauge | -- | Currently active SSE connections |
| `af_llm_tokens_total` | Counter | `direction` | LLM tokens consumed (input/output) |
| `af_sessions_active` | Gauge | `phase` | Active InvestigationSessions by phase |

## Kubernaut Agent Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `aiagent_api_investigations_total` | Counter | `status` | Investigation requests by outcome |
| `aiagent_api_investigations_duration_seconds` | Histogram | -- | End-to-end investigation duration |
| `aiagent_api_llm_requests_total` | Counter | `status` | LLM API calls by outcome (`success`, `error`) |
| `aiagent_api_llm_request_duration_seconds` | Histogram | -- | LLM request latency |
| `aiagent_api_llm_tokens_total` | Counter | `type` | LLM token consumption; use label `type` to distinguish **prompt** vs **completion** tokens (increments on each completed LLM call) |

The Kubernaut Agent exposes **prompt** and **completion** token counts as **counters** via `aiagent_api_llm_tokens_total` (see [LLM Token Cost Tracking](#llm-token-cost-tracking) for example PromQL).

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
histogram_quantile(0.99, rate(aiagent_api_llm_request_duration_seconds_bucket[5m]))
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
# Alert when any channel circuit breaker opens
kubernaut_notification_channel_circuit_breaker_state > 0
```

### LLM Token Cost Tracking

```promql
# Tokens consumed per hour by type (prompt vs completion)
sum by (type) (increase(aiagent_api_llm_tokens_total[1h]))
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

## Operator Monitoring Configuration

When deploying via the Kubernaut Operator, monitoring integration is controlled by `spec.monitoring.enabled` (default: `true`). When enabled, the operator:

1. **Auto-derives** Prometheus and AlertManager URLs from the OCP monitoring stack
2. **Creates 2 additional ClusterRoles**: `{namespace}-alertmanager-view` and `{namespace}-gateway-signal-source`
3. **Binds** the Effectiveness Monitor and Kubernaut Agent ServiceAccounts to `cluster-monitoring-view` for Prometheus query access
4. **Binds** the OCP AlertManager ServiceAccount to `gateway-signal-source` for signal ingestion

```yaml
apiVersion: kubernaut.ai/v1alpha1
kind: Kubernaut
spec:
  monitoring:
    enabled: true   # default; set to false to disable monitoring RBAC
```

!!! warning "Disabling monitoring"
    Setting `spec.monitoring.enabled: false` removes the 2 monitoring ClusterRoles and their bindings. The Effectiveness Monitor will not be able to query Prometheus for post-remediation health checks, and AlertManager will not have RBAC to send alerts to the Gateway.

See the [Operator CR API Reference](../api-reference/operator-cr.md#monitoringspec) for all monitoring-related fields.

## Next Steps

- [Troubleshooting](troubleshooting.md) -- Common issues and resolutions
- [Configuration Reference](../user-guide/configuration.md) -- Tuning service parameters
- [Audit & Observability](../user-guide/audit-and-observability.md) -- Audit event reference
