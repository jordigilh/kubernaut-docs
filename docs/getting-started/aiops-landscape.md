# AIOps Remediation Landscape

The AIOps remediation space has three distinct approaches to handling Kubernetes incidents. Each has a different model for detection, diagnosis, and action. Understanding where each excels -- and where they fall short -- informs how Kubernaut integrates with the broader ecosystem rather than replacing it.

## Three Approaches

**Rule-based remediation** (Rundeck, PagerDuty Process Automation, StackStorm) maps alert patterns to predefined actions. "If `KubePodCrashLooping` and namespace matches `prod-*`, execute rollback runbook." Fast, deterministic, and auditable, but limited to known patterns with known fixes.

**Predictive AI** (Dynatrace Davis AI, Datadog Watchdog, Moogsoft) uses statistical models trained on historical telemetry to detect anomalies, correlate events across dependency graphs, and identify probable root causes. The models are pre-computed and deterministic -- same telemetry patterns yield the same correlation. They excel at high-fidelity anomaly detection within vendor-instrumented environments.

**Generative AI** (Kubernaut) uses an LLM with live tool access -- `kubectl`, Prometheus, logs, remediation history, and workflow catalogs -- to investigate incidents, reason about root causes, and select context-appropriate remediation. The model reasons rather than pattern-matches, which means it can handle situations it has never seen before.

## How Predictive AI Works

Platforms like Dynatrace Davis and Datadog Watchdog build their intelligence from historical observation:

- **Statistical baselines**: After weeks or months of collecting metrics, the model learns what "normal" looks like for each service, endpoint, and infrastructure component. Deviations from the baseline trigger anomaly alerts.
- **Topology-aware correlation**: Davis builds a real-time dependency graph (Smartscape) using OneAgent instrumentation. When multiple anomalies fire simultaneously, the topology model traces them to a common upstream cause. Watchdog uses similar dependency inference from Datadog's APM traces.
- **Causal inference rules**: Pre-built heuristics map correlated anomaly patterns to probable causes. "Service A latency spiked, and its database dependency shows query time increase -- probable root cause is the database."

### Strengths

- **Deterministic**: Same telemetry input always produces the same correlation output. Easy to audit and predict.
- **Low latency**: Models are pre-computed. Correlation happens in seconds, not the 10-30 seconds an LLM investigation takes.
- **Deep telemetry integration**: OneAgent-level instrumentation sees method-level traces, process metrics, and infrastructure topology that Kubernetes-level monitoring cannot reach.
- **Proven at enterprise scale**: Battle-tested across thousands of production environments over many years.

### Weaknesses

- **Cold start**: The model has nothing to correlate against until it accumulates weeks of baseline data. A new deployment, a new cluster, or a major architecture change resets the learning period.
- **Novel failure blindness**: If the failure mode has never been observed, the statistical model has no baseline to compare against and no correlation to offer. This is the fundamental gap: the incidents that cause the most damage are often the ones that haven't happened before.
- **Rigid remediation**: Correlation identifies the probable cause, but the response is a pre-configured runbook. The platform cannot reason about *which* fix is appropriate given the current environment context -- GitOps management, Rego policies, risk tolerance labels, or whether the workload is stateful.
- **Vendor lock-in**: The depth of telemetry integration is both the strength and the trap. Switching from Dynatrace to Datadog (or vice versa) means losing the dependency graph, the baselines, and the correlation history.

## How Generative AI Works (Kubernaut)

Kubernaut's LLM investigates each incident as an open-ended question rather than a pattern match:

1. The LLM receives the alert context, affected resource metadata, namespace labels, and remediation history.
2. It queries live cluster state via tool calls -- `kubectl get`, `kubectl describe`, `kubectl logs`, Prometheus queries.
3. It reasons about the root cause, considering that the signal resource (e.g., a crashing Pod) may differ from the actual cause (e.g., a broken ConfigMap or an exhausted ResourceQuota).
4. It selects a remediation workflow from the catalog based on the diagnosed cause, environmental context (GitOps-managed? production? stateful?), and confidence level.

### Strengths

- **Handles novel situations**: The LLM understands Kubernetes semantics, not statistical patterns. It can diagnose a failure mode it has never encountered by reasoning about the cluster state.
- **Context-aware remediation selection**: The choice of workflow depends on whether the environment is GitOps-managed, which approval policies apply, what the risk tolerance is, and whether previous remediations for this resource succeeded or failed.
- **No cold start**: Useful from day one. No baseline period required.
- **Vendor-agnostic**: Works with any monitoring stack -- Prometheus, Alertmanager, or any webhook-capable alerting system.
- **Cross-resource RCA**: Can trace a pod crash to a ConfigMap misconfiguration, a ResourceQuota exhaustion, or a NetworkPolicy denial -- following causality chains that statistical models cannot represent.

### Weaknesses

- **Non-deterministic**: The same input may produce different reasoning paths. This complicates auditing, though Kubernaut mitigates this with full investigation transcripts and structured output.
- **Latency**: LLM investigation adds 10-30 seconds. For incidents where millisecond response matters, rule-based workflows can bypass LLM reasoning entirely.
- **Hallucination risk**: The LLM may confidently diagnose the wrong root cause. Kubernaut addresses this through approval gates, Rego policies, effectiveness verification, and the cross-validation architecture described below.
- **Per-token cost**: Each investigation consumes LLM API tokens. Kubernaut minimizes this by skipping LLM reasoning when signal labels directly match a workflow.

## Predictive AI as a Knowledge-Based Agent

The key architectural insight is that predictive AI and generative AI are not competing approaches. They operate at different layers, and the most effective architecture **composes** them: predictive AI as a tool the LLM calls during investigation, alongside `kubectl`, Prometheus, and logs.

In this model, the predictive AI platform (Davis, Watchdog, or any system with a query API) becomes a **knowledge-based agent** -- a source of structured evidence that the LLM incorporates into its reasoning.

### How the LLM Uses Predictive AI

During an investigation, the LLM can query the predictive AI to:

- **Confirm an RCA hypothesis**: "I diagnosed the root cause as database connection exhaustion. Does the predictive AI's dependency graph show latency correlation between the application and the database?" If yes, the confidence score increases.
- **Extract topology context**: The LLM cannot infer service dependency graphs from `kubectl` alone. A predictive AI platform with distributed tracing has this information and can provide it as structured context.
- **Identify correlated anomalies**: "Are there other services experiencing anomalies correlated with this incident?" The LLM uses this to widen or narrow its investigation scope.

### Confidence Calibration

The interaction between the LLM's findings and the predictive AI's correlations creates a natural confidence calibration mechanism:

| LLM Diagnosis | Predictive AI Response | Effect |
|---|---|---|
| Root cause X identified | Confirms correlation supporting X | Confidence **increases**; auto-approval more likely |
| Root cause X identified | Shows correlation pointing to Y instead | Confidence **decreases**; discrepancy flagged; manual approval likely |
| Root cause X identified | No data (novel case, no baseline) | Confidence **unchanged**; genAI is sole source of truth |
| No clear root cause | Identifies correlation pattern | LLM uses the correlation as a starting hypothesis |

This is analogous to how the LLM already cross-references `kubectl` output, Prometheus metrics, and container logs. Predictive AI is another evidence source -- valuable when it has data, gracefully absent when it doesn't.

### Investigation Loop

```
Signal arrives (Prometheus alert, Kubernetes event)
  |
  v
LLM Investigation
  |-- kubectl get/describe/logs (cluster state)
  |-- Prometheus query (metrics)
  |-- Remediation history (what was tried before)
  |-- Predictive AI query (correlation, topology)   <-- knowledge agent
  |
  v
Cross-validate findings
  |-- Do tool results converge on the same root cause?
  |-- Does predictive AI confirm or contradict?
  |
  v
Confidence score + workflow selection
  |-- High confidence, sources agree  -> may auto-approve
  |-- Low confidence, sources diverge -> require manual approval
  |-- Novel case, no predictive data  -> genAI reasoning stands alone
```

## Hallucination Safeguards via Cross-Validation

One of the primary concerns with generative AI in production is hallucination -- the LLM confidently asserting an incorrect root cause. Predictive AI integration provides a structural safeguard.

If the LLM diagnoses root cause X but the predictive AI's correlation engine shows no supporting evidence (or points to a different cause), the system can:

1. **Lower the confidence score** -- pushing the remediation toward the approval gate rather than auto-execution.
2. **Trigger approval via Rego policy** -- a policy rule like `require_approval if { predictive_ai_disagrees }` ensures human review when the two systems diverge.
3. **Include the discrepancy in the RCA report** -- the operator sees both the LLM's reasoning and the predictive AI's correlations, making an informed approval decision.

When the predictive AI has no relevant data (novel failure, new deployment, cold start period), the genAI approach remains the sole source of truth. This is precisely the scenario where generative AI's reasoning ability is most valuable -- the statistical model has nothing to offer, and the LLM reasons from first principles about Kubernetes semantics.

The combination means:

- **Known patterns**: Predictive AI confirms the LLM, boosting confidence and enabling faster auto-approval.
- **Ambiguous patterns**: Divergence between the two systems triggers human review, catching potential hallucinations.
- **Novel failures**: The LLM operates independently, providing value that no amount of historical data can.

## Integration Architecture

Kubernaut integrates with predictive AI platforms at two levels:

### Signal Source

Predictive AI platforms can feed alerts into Kubernaut's Gateway alongside Prometheus. Davis-detected anomalies or Watchdog alerts become signals that trigger the remediation pipeline. This allows organizations to use their existing monitoring investment as the detection layer while Kubernaut handles investigation, remediation selection, and execution.

### Investigation Tool

During HAPI's LLM investigation, the predictive AI platform is exposed as a tool call. The LLM can query:

- **Dynatrace Davis API**: Problem details, root cause entities, impact analysis, topology context
- **Datadog Watchdog API**: Anomaly details, correlated metrics, service dependency information
- **Any platform with a REST API**: The tool interface is generic and extensible

The LLM decides when and whether to query the predictive AI based on the investigation context. For simple, high-confidence diagnoses (e.g., a ConfigMap syntax error causing a crash), the LLM may not need external confirmation. For complex, multi-service incidents, the predictive AI's topology and correlation data becomes highly valuable.

## When to Use Each Approach

| Scenario | Recommended Approach |
|---|---|
| Well-understood, single-action problems (restart pod, scale HPA) | Rule-based |
| Anomaly detection and baseline monitoring | Predictive AI |
| Novel failures with no historical precedent | Generative AI (Kubernaut) |
| Multi-path remediation where context determines the fix | Generative AI (Kubernaut) |
| High-confidence RCA with cross-validation | Generative AI + Predictive AI |
| Topology-dependent incidents across microservices | Predictive AI as knowledge agent for Generative AI |
| Environments requiring closed-loop verification | Generative AI (Kubernaut) |
| Air-gapped / disconnected clusters | Generative AI (Kubernaut) with a [locally hosted LLM](../operations/disconnected-install.md) -- predictive AI platforms typically require cloud connectivity |
| Full lifecycle: detect, investigate, remediate, verify, learn | Combined: Predictive AI for detection and context, Generative AI for reasoning and execution |

The strongest architecture uses predictive AI for what it does best -- high-fidelity anomaly detection, topology mapping, and correlation of known patterns -- and generative AI for what statistical models cannot do: reason about novel situations, select context-appropriate remediations, and verify outcomes in a closed loop.
