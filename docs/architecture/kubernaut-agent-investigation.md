# Investigation Pipeline

The Kubernaut Agent (KA) is the intelligence core of Kubernaut. It receives an enriched signal from the AI Analysis controller, orchestrates an LLM-driven investigation using live Kubernetes access, identifies the root cause, gathers infrastructure context and remediation history, selects a workflow, and returns a structured recommendation.

This page documents the full investigation pipeline from the LLM's perspective -- what context it receives, what tools it uses, how it makes decisions, and how those decisions flow back through the system.

!!! tip "Related pages"
    - [AI Analysis](ai-analysis.md) covers the **AA controller** (session management, phase transitions, Rego evaluation)
    - [Workflow Selection](workflow-selection.md) covers the **DataStorage scoring algorithm** (label filtering, semantic scoring)
    - This page covers the **KA internals** (prompt construction, LLM investigation, resource context, decision outcomes)

## Service Configuration

KA uses two ConfigMaps, each mounted at a well-known path:

| ConfigMap | Mount Path | Content |
|---|---|---|
| `kubernaut-agent-config` | `/etc/kubernaut-agent/` (file: `config.yaml`) | Service config: ports, logging, auth secret references |
| `kubernaut-agent-sdk-config` | `/etc/kubernaut-agent/sdk/` | SDK config: LLM settings, toolsets (Prometheus, etc.), GCP project/region |

The SDK ConfigMap controls which Kubernaut Agent toolsets are available to the investigation agent. The Kubernetes core toolset is always enabled. Additional toolsets (e.g., `prometheus/metrics`) are configured in the SDK config:

```yaml
llm:
  provider: openai
  model: gpt-4o
  endpoint: ""
toolsets:
  prometheus/metrics:
    enabled: true
    config:
      prometheus_url: "http://kube-prometheus-stack-prometheus.monitoring.svc:9090"
```

!!! tip "Token overhead from unused toolsets"
    Each enabled toolset adds its full tool schema to every LLM context turn, even if none of its tools are called. This can add ~30% token overhead and bias the LLM toward irrelevant investigation paths. Enable only the toolsets your workload needs. See [Toolset Optimization](../user-guide/configmap-kubernaut-agent.md#toolset-optimization) for guidance and an incident-type mapping table.

The Helm chart supports three tiers for providing the SDK config -- see [Configuration Reference: Kubernaut Agent](../user-guide/configuration.md#kubernaut-agent-llm-integration).

**SDK config hot-reload (v1.3):** The mounted SDK config supports **hot-reload** via `fsnotify` when files change. **Active investigations** pin a **config snapshot** at session start, so in-flight work is not affected mid-stream.

| Category | Settings |
|---|---|
| **Restart required** (process must restart to take effect) | `llm.provider`, `llm.oauth2.token_url`, `llm.oauth2.client_id`, `llm.oauth2.client_secret` |
| **Hot-reloadable** | `model`, `endpoint`, `api_key`, `temperature`, and other non-provider/core-auth LLM and toolset options |

## Pipeline Overview

In **v1.3** the pipeline uses **two distinct LLM invocations** (new v1.3 architecture, superseding the v1.1 three-phase, single-session design). The sessions do not share model chat memory. The first performs RCA with full tool access; the second performs workflow selection from structured inputs only, then Kubernaut Agent merges results.

```mermaid
flowchart LR
    I1["Invocation 1: RCA"] -->|structured context| I2["Invocation 2: Workflow selection"]
```

### Invocation 1 (RCA)

A **new** LLM session. The system prompt and iterative **tool calls** drive root cause analysis. The model submits a constrained result with the **`submit_result` sentinel tool** and **`RCAResultSchema`**, which includes:

- **`root_cause_analysis` object** — `summary`, `severity`, `contributing_factors`, `remediation_target` (`Kind`, `Name`, `Namespace`), and `investigation_analysis` (under 500 words)
- **Top-level `severity`**, **`confidence`** (0–1), and **`investigation_outcome` enum** — `actionable`, `not_actionable`, `problem_resolved`, `insufficient_data`, `inconclusive`
- **`actionable`**, and **`detected_labels`**

### Invocation 2 (Workflow selection)

A **new** LLM session with **no memory** of Invocation 1. Only **seven** structured input fields are injected: **`RCASummary`**, **`Severity`**, **`ContributingFactors`**, **`RemediationTarget`**, **`InvestigationOutcome`**, **`Confidence`**, and **`InvestigationAnalysis`**.

The model must finish via a sentinel tool:

- **`submit_result_with_workflow`** — schema **`WithWorkflowResultSchema`** (equivalent in shape to the full `InvestigationResultSchema`), including **`selected_workflow`** and **`alternative_workflows`**
- **`submit_result_no_workflow`** — schema **`NoWorkflowResultSchema`**, with a **reasoning** string; only **`root_cause_analysis`** is required on this path

### Post-invocation merge: `mergePhase1Fallbacks`

After Invocation 2, **`mergePhase1Fallbacks`** backfills **only** `severity`, `contributing_factors`, `confidence`, and `investigation_outcome` from Invocation 1 when the workflow-selection result omits them. It does **not** backfill `InvestigationAnalysis` or `RemediationTarget` (Invocation 2 always wins for those). **Special case:** if Invocation 1’s `investigation_outcome` is `problem_resolved`, it **overrides** a contradictory `HumanReviewNeeded` from Invocation 2.

In reactive mode, **Invocation 1 (RCA)** investigates an active incident. In proactive mode (`signal_mode=proactive`), **Invocation 1** assesses whether a predicted incident is likely to materialize -- "no action needed" is a valid outcome.

Remediation history is included when the first invocation’s resource-context tools run: an internal DataStorage lookup (`get_remediation_history_context` API) provides tiered history by spec hash (24h with full detail, 90d with summary detail) in the **resource context tool result** during **Invocation 1**.

The LLM operates as an autonomous agent -- it calls Kubernetes tools iteratively, synthesizes findings, and makes decisions. KA provides the prompt framing, tools, and validation; the LLM drives the investigation.

## LLM output resilience

Kubernaut Agent applies several **defense layers** (v1.3) so malformed or partial model output is handled predictably.

| Defense | Purpose |
|---|---|
| **Double-serialization unwrap** | Recovers when the model double–JSON-encodes its response |
| **Balanced JSON extraction** | Strips trailing garbage after a first complete JSON object |
| **Single-element array unwrap** | Unwraps `[{...}]` to `{...}` for schema parsing |
| **Type coercion** | e.g. string `confidence` coerced to float where applicable |
| **Partial RCA guard** | Rejects responses that include `confidence` but lack a usable summary/workflow in the expected shape |
| **Truncation detection + retry** | When `finish_reason == "length"`: one retry with **2×** max completion tokens, **capped at 16384** (default before escalation **8192**). If the second response is still truncated, processing continues without further token escalation |
| **RCA parse retry** | One retry that constrains the model to **tool-only** completion using **`submit_result`** with `RCAResultSchema` |

These paths apply in addition to schema-constrained provider output where the runtime supports it.

!!! warning "Mandatory structured JSON responses"
    KA requires the LLM provider/runtime to support schema-constrained JSON responses. This ensures the LLM returns structured payloads that KA can parse reliably. Most modern providers (OpenAI, Azure OpenAI, Anthropic) support this natively.

!!! note "LLM model-dependent escalation behavior"
    Escalation behavior (e.g., when the LLM decides to switch from a failing workflow to human review) depends on the specific LLM model's reasoning capabilities. Different models may make different escalation decisions given the same remediation history context. In v1.2, KA's structured response parsing/validation path was hardened (#624), improving reliability of repeated analysis cycles.

## Pre-RCA: Prompt Construction

Before any tools are called, KA assembles the initial prompt from the enriched signal. This context frames the entire investigation:

**Signal metadata:**

- Signal name, severity, namespace, resource kind/name
- Environment, priority, risk tolerance, business category
- Error message and description

**Timing information:**

- Alert firing time and received time
- Cluster name and signal source

**Deduplication context:**

- Whether the signal is a duplicate, occurrence count, first/last seen

**Signal mode** (reactive or proactive) determines the prompt variant -- see [Reactive vs Proactive](#reactive-vs-proactive-mode) below.

No tools are called during prompt construction. All initial context comes from the enriched signal passed by the AI Analysis controller.

## Reactive vs Proactive Mode

The `signal_mode` field determines how the LLM frames its investigation. The toolset is identical for both modes; only the prompt framing differs.

### Reactive Mode (default)

The LLM investigates an **active incident**:

- **Invocation 1 (RCA):** "Use your Kubernetes tools to investigate the incident" -- check pod status, events, logs, resource usage, node conditions. Identify the root cause -- determine if the signal is the root cause or a symptom of a deeper issue. Resolve the target via owner chain, spec hash, labels, and remediation history using the **resource context tools** as needed.
- **Invocation 2 (Workflow selection):** **Structured** workflow discovery and a sentinel-tool JSON result (`submit_result_with_workflow` or `submit_result_no_workflow`); no free-form continuation of the RCA chat.

### Proactive Mode

The LLM investigates an **anticipated incident**:

- **Invocation 1 (RCA):** "Assess utilization trends, recent deployments, and whether the prediction is likely to materialize." Decide if the anticipated incident is likely and what preventive actions to take -- **"no action needed" is a valid outcome** if the prediction is unlikely. Use the same resource context tooling as reactive mode when a concrete target is identified.
- **Invocation 2 (Workflow selection):** Same sentinel-tool protocol as reactive mode; the model may conclude that no remediation is warranted.

The proactive mode distinction is important: it tells the LLM that doing nothing is acceptable, preventing unnecessary remediations for predictions that may not materialize.

## RCA Execution

During **Invocation 1 (RCA)**, the LLM uses Kubernetes tools to investigate the cluster. It operates autonomously, calling tools iteratively until it reaches a diagnosis:

1. **Inspect the target resource** -- `kubectl describe`, `kubectl get` for the resource mentioned in the signal
2. **Read pod logs** -- Current and previous container logs to identify errors, panics, or OOM events
3. **Check events** -- Kubernetes events for the resource, namespace, or node
4. **Examine live metrics** -- `kubectl top pods` for CPU/memory pressure
5. **Synthesize a root cause** -- The LLM determines what went wrong, whether the signal is the root cause or a symptom, and what resource is actually affected

**Invocation 1** is unconstrained in tool choice -- the LLM decides which tools to call and in what order based on what it discovers. A CrashLoopBackOff investigation might start with pod status, move to logs, then check events for OOM signals. A NodePressure investigation might start with `top pods`, then check for pending pods and resource quotas.

## Post-RCA: Resource Context

During **Invocation 1 (RCA)**, once the LLM has identified the affected resource, it calls `get_namespaced_resource_context(kind, name, namespace)` (or `get_cluster_resource_context(kind, name)` for cluster-scoped resources such as **Nodes**, **PVs**, **ClusterRoles**, and other **cluster-scoped** kinds). This is the pivotal moment in the first session -- it transforms the investigation from "what happened" to "what should we do about it, given what we've tried before."

**Namespace normalization (`normalizeNamespace`):** When the scope resolver determines the target is **cluster-scoped**, the client namespace is cleared to `""` for enrichment and DataStorage calls. If resolution fails, the original namespace is **kept** and a **warning** is logged.

**Per-investigation cache:** Enrichment for a given `kind` / `name` / `namespace` is **cached** for the **lifetime of that investigation**, avoiding duplicate work when the same target is re-requested.

**Gateway fingerprint (target identity):** The Gateway uses a **SHA256** over `namespace:kind:name` for the **root owner** (after owner-chain resolution). For **cluster-scoped** resources, the namespace is **empty**, producing fingerprints such as **`:Node:worker-1`**.

The tool performs four operations in sequence:

### 1. Owner Chain Resolution

Walks the Kubernetes ownership hierarchy to find the **root managing resource**:

```
Pod → ReplicaSet → Deployment
Pod → StatefulSet
Pod → DaemonSet
Pod → Job
```

All subsequent context (spec hash, history, detected labels) is about the root owner, not the individual pod. This ensures that history is tracked at the right level -- a Deployment, not an ephemeral ReplicaSet.

### 2. Spec Hash Computation

Computes a canonical SHA-256 hash of the **root owner** resource's `.spec` (v1.3+ for `get_namespaced_resource_context` / `get_cluster_resource_context`: the tool resolves the owner chain first, then hashes the root). This differs from the **Effectiveness Monitor generic enricher**, which hashes the **direct** remediation target. See [Effectiveness: Spec hash: root owner vs direct resource (v1.3)](effectiveness.md#spec-hash-root-owner-vs-direct-resource-v13).

```
sha256(canonicalize(rootOwner.spec))
```

This fingerprint uniquely identifies the current configuration state. When sent to DataStorage, it enables the history endpoint to distinguish between:

- **Same config, tried before** -- the current spec matches a previous pre-remediation state (regression)
- **Config changed since last remediation** -- the spec was modified (fresh start or different problem)
- **Config unchanged after remediation** -- the spec matches a previous post-remediation state

### 3. Detected Infrastructure Labels

Probes the cluster to detect infrastructure characteristics of the root owner:

| Label | Detection Method | Category |
|---|---|---|
| `gitOpsManaged` | ArgoCD/Flux annotations or owner references | GitOps |
| `gitOpsTool` | Which GitOps tool (`argocd`, `flux`) | GitOps |
| `helmManaged` | Helm release labels | Workload |
| `pdbProtected` | PodDisruptionBudget exists for the resource | Protection |
| `hpaEnabled` | HorizontalPodAutoscaler targets the resource | Protection |
| `stateful` | Resource is StatefulSet or has PersistentVolumeClaims | Workload |
| `networkIsolated` | NetworkPolicy exists in the namespace | Security |
| `serviceMesh` | Istio/Linkerd sidecar annotations | Security |
| `resourceQuotaConstrained` | Namespace has an active `ResourceQuota` | Constraints |
| `virtualMachine` | VM/VMI/VMIM/DataVolume in owner chain or target kind (#1378) | CNV |
| `liveMigratable` | VM has `spec.evictionStrategy=LiveMigrate` (only when `virtualMachine` is true) | CNV |
| `cdiManaged` | PVC has `cdi.kubevirt.io/storage.import.*` annotations | CNV |
| `storageBackend` | StorageClass provisioner mapping: `odf-ceph`, `lvms`, `local` | CNV |

CNV detection uses a RESTMapper pre-check and skips gracefully on non-CNV/KubeVirt clusters.

When `resourceQuotaConstrained` is detected, the `LabelDetector` also surfaces **`quota_details`** as a structured `map[string]QuotaResourceUsage` in the resource context response, containing per-resource `hard` and `used` values from all `ResourceQuota` objects in the namespace (e.g., `cpu: {hard: "4", used: "2.5"}`). This gives the LLM visibility into capacity constraints during workflow selection — for example, preferring a scale-down workflow over scale-up when the namespace is near its quota.

The detection pipeline is: `Investigator.Investigate` → `resolveEnrichmentCached` → `Enricher.Enrich` → `LabelDetector.DetectLabels` → `detectResourceQuota`. On detection failure (empty namespace, API error), `"resourceQuotaConstrained"` is appended to `failedDetections` and the enrichment continues with best-effort results.

!!! note "LimitRange detection"
    LimitRange detection is **not implemented** in v1.3. Only ResourceQuota constraints are surfaced. LimitRange may be added in a future release.

These labels are stored in `session_state` and automatically injected into all subsequent workflow discovery queries. They serve two purposes:

1. **Workflow scoring** -- DataStorage uses detected labels for semantic scoring (see [Workflow Selection](workflow-selection.md))
2. **LLM context** -- The `list_available_actions` tool response includes a `cluster_context` section (e.g., "target is GitOps-managed with ArgoCD") so the LLM can factor infrastructure into its decision

Detection runs once per investigation. If it fails, an empty label set is used (graceful degradation).

### 4. Remediation History

Fetches the tiered remediation history from DataStorage:

```
GET /api/v1/remediation-history/context
  ?targetKind=Deployment
  &targetName=my-app
  &targetNamespace=production
  &currentSpecHash=sha256:abc123...
```

The response contains two tiers of history with different query strategies, time windows, and detail levels:

| Tier | Window | Query Strategy | Detail Level |
|---|---|---|---|
| **Tier 1** | Last 24 hours | By `spec_hash` via `QueryROEventsBySpecHash` | Full: effectiveness score, health checks, metric deltas, hash match |
| **Tier 2** | 24 hours – 90 days | By `spec_hash` via `QueryROEventsBySpecHash` | Summary: effectiveness score, hash match, assessment reason |

- **Tier 1** queries directly by spec hash for the last 24h, returning high-detail recent entries for the same configuration.
- **Tier 2** queries directly by spec hash, surfacing only outcomes for the same configuration. This helps the LLM identify recurring patterns across a longer time horizon.

**How the chain is visible:** Every entry in both tiers carries `preRemediationSpecHash` and `postRemediationSpecHash`. DataStorage annotates each entry with a `hashMatch` field by comparing the caller's `currentSpecHash` against these stored hashes. This lets the LLM trace the full chain of configuration transitions and outcomes.

## How Remediation History Influences the LLM

The history bundled in the resource context tools is the mechanism by which Kubernaut learns from past remediation outcomes. The LLM receives the full `RemediationHistoryContext` as part of the tool result, and the **Invocation 1 (RCA)** resource-context framing instructs: *"Use this to avoid repeating recently failed workflows."*

### Three-Way Hash Comparison

For each history entry, DataStorage compares the `currentSpecHash` (from KA) against both stored hashes:

| Comparison | `hashMatch` Value | Meaning |
|---|---|---|
| `currentSpecHash == preRemediationHash` | `preRemediation` | **Regression** -- the resource reverted to a previously-remediated configuration |
| `currentSpecHash == postRemediationHash` | `postRemediation` | Config unchanged since the last remediation |
| Neither matches | `none` | Config has changed -- different problem or manual fix applied |

When any entry has `hashMatch = "preRemediation"`, the response sets `regressionDetected: true`. This is a strong signal that a previous fix was undone.

### Tier 1 Example: Chain of Escalating Remediations

Consider a Deployment `my-app` in production that has been failing repeatedly in the last 24 hours. The current spec hash is `sha256:AAA` (the original broken config). Here's what happened:

1. **First attempt**: Config was at `AAA`, `RestartPod` was tried, scored 0.35 (poor), config stayed at `AAA`
2. **Second attempt**: Config still at `AAA`, `IncreaseMemory` was tried, scored 0.60 (moderate), config changed to `BBB`
3. **Third attempt**: Config now at `BBB`, `RollbackDeployment` was tried, scored 0.20 (poor), config changed to `CCC`
4. **GitOps reverted the rollback**, pushing config back to `AAA` -- triggering this new investigation

Tier 1 returns entries in the last 24 hours that match the current spec-hash correlation criteria:

```json
{
  "targetResource": "production/Deployment/my-app",
  "currentSpecHash": "sha256:AAA",
  "regressionDetected": true,
  "tier1": {
    "window": "24h",
    "chain": [
      {
        "remediationUID": "rr-001",
        "completedAt": "2026-03-04T08:00:00Z",
        "workflowType": "RestartPod",
        "outcome": "completed",
        "effectivenessScore": 0.35,
        "preRemediationSpecHash": "sha256:AAA",
        "postRemediationSpecHash": "sha256:AAA",
        "hashMatch": "preRemediation",
        "signalResolved": false,
        "healthChecks": {
          "podRunning": true,
          "readinessPass": false,
          "restartDelta": 3,
          "crashLoops": true
        }
      },
      {
        "remediationUID": "rr-002",
        "completedAt": "2026-03-04T10:00:00Z",
        "workflowType": "IncreaseMemory",
        "outcome": "completed",
        "effectivenessScore": 0.60,
        "preRemediationSpecHash": "sha256:AAA",
        "postRemediationSpecHash": "sha256:BBB",
        "hashMatch": "preRemediation",
        "signalResolved": false,
        "healthChecks": {
          "podRunning": true,
          "readinessPass": true,
          "restartDelta": 0,
          "crashLoops": false
        }
      },
      {
        "remediationUID": "rr-003",
        "completedAt": "2026-03-04T14:00:00Z",
        "workflowType": "RollbackDeployment",
        "outcome": "completed",
        "effectivenessScore": 0.20,
        "preRemediationSpecHash": "sha256:BBB",
        "postRemediationSpecHash": "sha256:CCC",
        "hashMatch": "none",
        "signalResolved": false
      }
    ]
  }
}
```

The LLM can trace the full chain:

- `rr-001`: `RestartPod` on config `AAA` -> stayed at `AAA`, scored 0.35, crash loops continued. **hashMatch = preRemediation** (current config matches this entry's pre-hash, confirming regression).
- `rr-002`: `IncreaseMemory` on config `AAA` -> changed to `BBB`, scored 0.60, readiness passed but signal wasn't resolved. **hashMatch = preRemediation** (same regression -- started from `AAA`).
- `rr-003`: `RollbackDeployment` on config `BBB` -> changed to `CCC`, scored 0.20, made things worse. **hashMatch = none** (this entry started from `BBB`, not the current config `AAA`).

From this chain, the LLM can reason: *"We're back at config `AAA`. `RestartPod` failed on this config (0.35). `IncreaseMemory` partially helped (0.60) but the signal recurred. The rollback from `BBB` to `CCC` was counterproductive (0.20). The best option is either `IncreaseMemory` again (it was the most effective) or escalating to human review since three attempts have failed."*

### Tier 2 Example: Historical Regression Detection

Now suppose the Deployment was stable for months but a bad release reverted it to a config last seen 45 days ago (spec hash `sha256:XXX`). Tier 1 is empty (no remediations in the last 24 hours), but Tier 2 finds older history by matching `pre_remediation_spec_hash = sha256:XXX`:

```json
{
  "targetResource": "production/Deployment/my-app",
  "currentSpecHash": "sha256:XXX",
  "regressionDetected": true,
  "tier1": { "window": "24h", "chain": [] },
  "tier2": {
    "window": "2160h",
    "chain": [
      {
        "remediationUID": "rr-old-001",
        "completedAt": "2026-01-18T09:00:00Z",
        "workflowType": "RollbackDeployment",
        "outcome": "completed",
        "effectivenessScore": 0.92,
        "hashMatch": "preRemediation",
        "signalResolved": true
      }
    ]
  }
}
```

The LLM sees: *"45 days ago, this exact configuration was remediated with `RollbackDeployment` and it worked well (0.92, signal resolved). This is a regression to a known-bad config. `RollbackDeployment` is a strong candidate."*

Without Tier 2, this historical insight would be invisible -- the LLM would have no context and might try less effective approaches first.

### Formatted History Warnings

The Kubernaut Agent Python codebase (not the kubernaut Go repository) includes a `build_remediation_history_section()` module that converts raw history into structured warnings and reasoning guidance when history context is injected into the system prompt:

| Warning | Trigger | Guidance |
|---|---|---|
| **Configuration regression** | `regressionDetected: true` | "The current resource spec matches a pre-remediation state. Consider a different remediation approach." |
| **Declining effectiveness** | Same `workflowType` used 3+ times with monotonically decreasing scores | "Each successive application is less effective, suggesting the workflow treats the symptom rather than the root cause." |
| **Repeated ineffective remediation** | Same `workflowType` completed N+ times for the same signal but the issue recurs | "Recommend selecting `needs_human_review` or an alternative escalation workflow." |
| **Spec drift (inconclusive)** | `assessmentReason == "SpecDrift"` | "The target resource spec was modified during the assessment window, invalidating effectiveness data. Do not treat as a failed remediation." |
| **Spec drift (causal chain)** | Spec drift entry's `postRemediationSpecHash` matches a subsequent entry's `preRemediationSpecHash` | "The outcome was unstable, and a subsequent remediation was triggered from the resulting state." |

The section concludes with explicit reasoning guidance: *"Avoid repeating workflows that previously failed or had poor effectiveness. If a workflow completed successfully multiple times but the same signal keeps recurring, escalate to human review."*

### The Feedback Loop

This history mechanism creates a continuous feedback loop:

```mermaid
flowchart LR
    RO["RO<br/>Captures pre-hash"] --> WFE["WFE<br/>Executes workflow"]
    WFE --> EM["EM<br/>Evaluates effectiveness"]
    EM --> DS["DS<br/>Stores audit events"]
    DS --> KA["Kubernaut Agent<br/>Fetches history"]
    KA --> LLM["LLM<br/>Avoids past failures"]
    LLM --> RO
```

1. **RO** captures the pre-remediation spec hash before workflow execution
2. **EM** evaluates the outcome (health, alert, metrics, hash) after stabilization and stores component-level audit events in DataStorage
3. **DataStorage** indexes events by `target_resource` and `pre_remediation_spec_hash`
4. **KA** fetches history with the current spec hash when the next incident occurs
5. **LLM** uses the history to avoid repeating failed approaches and favor effective ones

This is Kubernaut's "learning" mechanism -- not model fine-tuning, but contextual memory via the audit trail. The more remediations a resource undergoes, the richer the context available to the LLM for future decisions.

### IneffectiveChain Guardrails (v1.2)

To prevent unbounded remediation loops, the Remediation Orchestrator enforces two configurable thresholds:

| Config Key | Default | Description |
|---|---|---|
| `remediationorchestrator.config.routing.ineffectiveChainThreshold` | 3 | Maximum ineffective remediation-chain depth before the RR is blocked with `IneffectiveChain` |
| `remediationorchestrator.config.routing.recurrenceCountThreshold` | 5 | Safety-net cap on ineffective-chain remediation entries within the routing lookback window |

When either threshold is exceeded, the Orchestrator blocks the RemediationRequest and emits a notification directing operators to investigate manually. The dual-hash query semantics (matching both `pre_remediation_spec_hash` and `post_remediation_spec_hash`) enable accurate chain detection via DataStorage.

## Workflow Selection: Three-Step Discovery

**Invocation 2 (Workflow selection)** is a **separate** session that runs the three-step DataStorage protocol with **no tool transcript from Invocation 1** — it relies on the **structured RCA fields** injected at session start, plus the usual workflow tools.

Labels and other signal context that were **detected or resolved in Invocation 1** (e.g. `session_state["detected_labels"]` and enriched signal metadata) are available to the workflow step and are **automatically applied** to DataStorage queries (e.g. as context filters in `list_available_actions`).

### Step 1: List Available Actions

```
list_available_actions(offset=0, limit=20)
```

KA sends signal context filters (`severity`, `component`, `environment`, `priority`, `custom_labels`) and `detected_labels` as query parameters to DataStorage. DataStorage uses these to **filter and rank** the action types -- only action types with workflows matching the signal context are returned. The LLM sees the filtered results with structured descriptions:

- `what` -- What the action does
- `whenToUse` -- When this action is appropriate
- `whenNotToUse` -- When to avoid this action
- `workflow_count` -- How many workflows implement this action (within the filtered context)

When detected labels are available, the response also includes a `cluster_context` section (e.g., "Target resource is GitOps-managed with ArgoCD, Helm-managed, PDB-protected"). For GitOps-managed resources, KA adds a prescriptive instruction telling the LLM to prefer git-based action types over direct kubectl actions.

### Step 2: List Workflows for Action Type

```
list_workflows(action_type="RollbackDeployment", offset=0, limit=10)
```

For the chosen action type, the LLM sees workflow summaries ordered by DataStorage's internal label-match score. The score itself is not exposed -- the LLM sees workflows in ranked order and selects based on descriptions, parameter requirements, and infrastructure fit.

Pagination is supported (`hasMore` flag) for action types with many workflows.

### Step 3: Get Workflow Details

```
get_workflow(workflow_id="rollback-deployment-v1")
```

The LLM retrieves full details including the parameter schema to confirm the selection and populate execution parameters from its investigation findings.

### What Drives the Final Decision

The LLM makes the final selection based on:

1. **Workflow descriptions** -- `what`, `whenToUse`, `whenNotToUse` from the action type taxonomy
2. **Remediation history** -- Which workflows failed or succeeded on this resource (and with what effectiveness)
3. **Detected infrastructure context** -- GitOps-managed resources need git-based workflows, not direct kubectl rollbacks
4. **Parameter fit** -- Whether the investigation findings provide the data needed for the workflow's parameters

DataStorage's scoring determines the presentation order but not the selection. A workflow ranked #2 by label-match score can still be selected if its description better matches the root cause.

## Investigation Outcomes

The LLM investigation (two invocations, merged) can produce 9 distinct outcomes, each handled differently by the system:

```mermaid
flowchart TD
    subgraph ka2["KA: two invocations + merge"]
    I1["Invocation 1: RCA"] -->|structured context| I2["Invocation 2: Workflow selection"]
    I2 --> MERGE["mergePhase1Fallbacks"]
    end
    MERGE --> KA["KA merged response"]
    KA --> NHR{"needs_human_review?"}
    NHR -->|true| HasWFReview{"selected_workflow?"}
    HasWFReview -->|present| HRFailed["Human Review + Workflow<br/><small>AA Phase: Failed (any review scenario)</small>"]
    HasWFReview -->|null| HRCompleted["Manual Review Required<br/><small>AA Phase: Completed</small>"]
    NHR -->|false| HasWF{"selected_workflow?"}
    HasWF -->|null| Resolved{"Resolved or<br/>not actionable?"}
    HasWF -->|present| Confidence{"confidence >= 0.7?"}
    Resolved -->|"resolved / not actionable"| NoAction["No Action Required<br/><small>AA Phase: Completed<br/>(Outcome 2 or 9)</small>"]
    Resolved -->|no| NoMatch["No catalog match (Outcome 4)<br/><small>AA Phase: Completed, Needs human review (NoMatchingWorkflows)</small>"]
    Confidence -->|no| LowConf["Low Confidence<br/><small>AA Phase: Failed</small>"]
    Confidence -->|yes| Rego["Rego Evaluation<br/><small>AA Phase: Analyzing</small>"]
```

### Outcome 1: Success (Workflow Selected)

**Invocation 2** returns a `selected_workflow` with `workflow_id`, `confidence`, and `parameters` (through **`submit_result_with_workflow`**), after `mergePhase1Fallbacks` when needed. KA then injects the three canonical `TARGET_RESOURCE_*` parameters and constructs `remediationTarget` from the K8s-verified `root_owner` (resolved in **Invocation 1** via `get_namespaced_resource_context` or `get_cluster_resource_context`). This is the only outcome that proceeds to Rego evaluation.

**Fields:** `needs_human_review=false`, `selected_workflow` present, `confidence >= 0.7`
**Next:** AA transitions to `Analyzing` phase → Rego evaluation

### Outcome 2: Problem Self-Resolved

The LLM determines the issue is no longer occurring — the resource is healthy, no active errors. Detection relies on KA appending a "problem self-resolved" warning to the response when `investigation_outcome=resolved`. The AA response processor detects this warning string to identify the self-resolved state.

**Fields:** `selected_workflow=null`, `confidence >= 0.7`, no warning signals, no substantive RCA
**Next:** AA sets `Reason=WorkflowNotNeeded`, `Outcome=NoActionRequired`. No workflow execution, no approval. Rego is never evaluated.

**Defense-in-depth:** Two checks prevent false "resolved" classification:

- `hasNoWorkflowWarningSignal` -- If KA warnings contain "inconclusive", "no workflows matched", or "human review recommended", the response is not treated as resolved
- `hasSubstantiveRCA` -- If the RCA has a non-empty summary with contributing factors, there is a real problem -- route to human review instead

### Outcome 3: Investigation Inconclusive

The LLM cannot determine the root cause or current state. Sets `investigation_outcome=inconclusive`.

**Fields:** `needs_human_review=true`, `human_review_reason=investigation_inconclusive`
**Next:** Routed to human review. Rego is never evaluated.

### Outcome 4: No Matching Workflows

The first invocation may identify a root cause, but the **workflow selection** step finds **no** suitable entry in the catalog. In the second invocation, the model completes with the **`submit_result_no_workflow`** sentinel tool, which is how Kubernaut Agent encodes a **"no matching workflows"** path.

**Parser routing:** In **`applyOutcomeRouting`**, the response is classified with **`HumanReviewNeeded=true`**, **`HumanReviewReason="no_matching_workflows"`**.

**AA controller handling:** The **`handleNoMatchingWorkflowsCompleted`** path sets the AIAnalysis to **`Phase=Completed`**, **`Reason=AnalysisCompleted`**, **`SubReason=NoMatchingWorkflows`**, and **`NeedsHumanReview=true`**.

**Fields (logical):** `selected_workflow=null` (and no self-resolved / not-actionable completion), `needs_human_review=true`, `human_review_reason=no_matching_workflows` after routing.

**Next:** Human review. Operators should check whether a suitable workflow exists or needs to be authored.

### Outcome 5: RCA Incomplete

KA could not determine the target resource identity because `root_owner` is missing from `session_state` -- either `get_namespaced_resource_context` / `get_cluster_resource_context` was never called during the investigation or it returned no owner chain. Without a verified target, KA cannot inject the canonical `TARGET_RESOURCE_*` parameters and the investigation is unsafe to proceed.

**Fields:** `needs_human_review=true`, `human_review_reason=rca_incomplete`
**Next:** Routed to human review.

### Outcome 6: Workflow Validation Failed

The LLM selected a workflow that fails catalog validation (wrong ID, image mismatch, invalid parameters). KA retries up to 3 times, feeding validation errors back to the LLM as correction prompts. If all retries fail:

**Fields:** `needs_human_review=true`, `human_review_reason` from the validation error (`workflow_not_found`, `image_mismatch`, or `parameter_validation_failed`)
**Next:** Routed to human review. The `validation_attempts_history` field contains the full retry record.

### Outcome 7: Low Confidence

The LLM returns a workflow with `confidence` below the investigation threshold (0.7). KA does not enforce this threshold — it passes the confidence through. The AA controller's `handleLowConfidenceFailure` handler detects the low confidence and transitions the AIAnalysis to `Failed`.

**Fields:** `selected_workflow` present, `confidence < 0.7`
**Next:** AA controller rejects the low-confidence selection via `handleLowConfidenceFailure`, transitions to `Failed`, and the Orchestrator routes to human review. Rego is never evaluated.

### Outcome 8: LLM Explicitly Requests Human Review

The LLM itself determines that the situation requires human judgment and sets `needs_human_review=true` or provides a `human_review_reason`. KA preserves these values.

**Next:** Routed to human review.

### Outcome 9: Alert Not Actionable

The LLM investigates and determines the alert is not actionable — for example, a transient resource pressure that does not warrant remediation. Distinct from Outcome 2 (self-resolved): the problem may still exist but does not meet the threshold for automated action.

**Fields:** `selected_workflow=null`, `Outcome=WorkflowNotNeeded`, `SubReason=NotActionable`
**Next:** AA sets `Outcome=NoActionRequired`. No workflow execution. Rego is never evaluated.

!!! note "Confidence floor for not-actionable responses"
    When the LLM returns `actionable=false` with a confidence below 0.8, KA floors the confidence to 0.8. This prevents the AA controller from misclassifying a deliberate "not actionable" determination as a low-confidence failure (Outcome 7).

!!! note "Only Outcome 1 reaches Rego"
    Outcomes 2–9 are all handled by the AA controller's response processor **before** Rego evaluation. The Rego approval policy only runs when the LLM successfully selects a workflow with `needs_human_review=false` and `confidence >= 0.7`.

## Approval Gate: AA Rego Evaluation

When the LLM successfully selects a workflow (Outcome 1), the AA controller transitions to the `Analyzing` phase and evaluates whether human approval is required using a Rego policy.

### When Rego Runs

Rego evaluation is the **last gate** before remediation execution. It only runs when all of these are true:

- KA returned `needs_human_review=false`
- A `selected_workflow` is present
- The AA response processor validated `confidence >= 0.7`
- The AA controller transitioned to the `Analyzing` phase

### Rego Input

The `buildPolicyInput()` function assembles the Rego input from the KA response and signal context:

| Input Field | Source | Purpose |
|---|---|---|
| `environment` | Signal context (from SP enrichment) | Production vs non-production |
| `confidence` | `SelectedWorkflow.Confidence` | LLM's confidence in the selection |
| `confidence_threshold` | Operator config (Helm), default 0.8 | Configurable threshold |
| `remediation_target` | `RootCauseAnalysis.RemediationTarget` | LLM-identified target resource |
| `detected_labels` | `PostRCAContext.DetectedLabels` | Infrastructure characteristics |
| `failed_detections` | `PostRCAContext.DetectedLabels.FailedDetections` | Detection errors |
| `warnings` | `Status.Warnings` | KA investigation warnings |
| `business_classification` | SP enrichment | Business unit, SLA tier, criticality |

### Approval Rules

The default policy has two mandatory approval triggers:

1. **Missing remediation target** -- If `remediation_target` is absent or has an empty `kind`, approval is always required. This is a safety net for incomplete RCA.

2. **Production environment** -- All production remediations require human approval, regardless of confidence. Operators control this by setting `kubernaut.ai/environment=production` on the namespace.

Non-production environments (development, staging, qa, test) auto-approve when `remediation_target` is present.

### Confidence Threshold

The default confidence threshold is **0.8** in the Rego policy, overridable via Helm:

```yaml
aianalysis:
  rego:
    confidenceThreshold: 0.9  # Override the default 0.8
```

The `is_high_confidence` helper is defined in the policy but not currently used in the approval rules. It is available for operators to add custom rules (e.g., "require approval when confidence < threshold even in staging").

### Risk Factors

Scored risk factors determine the human-readable approval reason but do not change the approval decision:

| Score | Risk Factor |
|---|---|
| 90 | Missing remediation target |
| 80 | Production environment with sensitive resource kind |
| 70 | Production environment |

The highest-scoring factor becomes the `ApprovalReason` shown in the `RemediationApprovalRequest`.

### Degraded Mode

If the Rego policy fails to load or evaluate, the evaluator returns `Degraded=true` with `ApprovalRequired=true` (safe default). The AA status reflects the degraded state so operators can investigate.

### Downstream

| Rego Result | AA Action | RO Action |
|---|---|---|
| `ApprovalRequired=true` | Stores approval context (investigation summary, recommended workflow, evidence, alternatives) | Creates `RemediationApprovalRequest` + approval `NotificationRequest`, transitions RR to `AwaitingApproval` |
| `ApprovalRequired=false` | Sets `AutoApproved` | Creates `WorkflowExecution` directly, transitions RR to `Executing` |

## apiVersion Validation Gate (v1.4)

When a CRD Kind exists in multiple API groups (e.g., a custom `Certificate` kind alongside `cert-manager.io/Certificate`), `kubectl` operations may target the wrong group. The apiVersion validation gate (#1044) detects these ambiguous Kinds during investigation and halts execution — the `RemediationRequest` transitions to **ManualReviewRequired** with a notification explaining the collision. This prevents incorrect remediation actions against the wrong API resource.

## Parallel tool execution and batching (v1.4)

When the LLM emits **multiple tool calls in one turn**, the investigation loop executes them **concurrently**, so independent tools finish in parallel instead of strictly one-after-another (#970). The investigation **system prompt** also instructs the model to **batch logically independent tool calls** in a single assistant message whenever safe, trimming LLM ↔ runtime round trips (#971).

## Tool output limits

Kubernaut Agent and the Kubernaut Agent SDK cap tool and audit text so the model context stays bounded (v1.3).

- **`MaxToolOutputSize`:** default **100,000** characters. Excess output is **hard-truncated** and an **`[TRUNCATED]`** suffix is appended to the result passed to the LLM.
- **`Summarizer.MaybeSummarize`:** optional **LLM-based summarization** of oversize tool output may run **before** a hard cap is applied, when the summarizer is enabled in configuration.
- **Audit previews:** for audit log emission, the pipeline uses **`truncatePreview(500)`**-style behavior so long payloads do not bloat event records; full payloads may be stored elsewhere in the system.

## LLM Tool Reference

**Invocation 1 (RCA)** uses Kubernetes core, metrics, and **resource context** tools. **Invocation 2 (Workflow selection)** uses the **workflow discovery** tools (`list_available_actions`, `list_workflows`, `get_workflow`) and the **sentinel submit** tools. Complete list:

### Kubernetes Core

| Tool | Description |
|---|---|
| `kubectl_describe` | Describe a Kubernetes resource |
| `kubectl_get` | Get resource YAML or JSON. Optional `api_group` parameter for kind disambiguation (#1311). |
| `kubectl_find_resource` | Find resources by label or name pattern |
| `kubectl_events` | Get events for a resource or namespace |
| `kubectl_get_yaml` | Get raw YAML for a resource |
| `kubectl_count` | Count resources matching criteria |

### Kubernetes Logs

| Tool | Description |
|---|---|
| `kubectl_logs` | Get current container logs |
| `kubectl_previous_logs` | Get logs from previous container instance |

### Kubernetes Live Metrics

| Tool | Description |
|---|---|
| `kubectl_top_pods` | Get CPU/memory usage for pods |

### Resource Context (Custom)

| Tool | Description | Parameters |
|---|---|---|
| `get_namespaced_resource_context` | Resolve root owner, compute spec hash, detect infrastructure labels, fetch remediation history (via internal DataStorage lookup) for **namespaced** resources | `kind`, `name`, `namespace` |
| `get_cluster_resource_context` | Same resolution and history behavior as the namespaced tool for **cluster-scoped** resources — e.g. **Nodes**, **PersistentVolumes**, **ClusterRoles** / **ClusterRoleBindings**, and other cluster-scoped kinds | `kind`, `name` |

### Workflow Discovery (Custom)

| Tool | Description | Parameters |
|---|---|---|
| `list_available_actions` | List action types with descriptions and workflow counts | `offset`, `limit` |
| `list_workflows` | List workflows for an action type, ordered by relevance | `action_type`, `offset`, `limit` |
| `get_workflow` | Get full workflow details and parameter schema | `workflow_id` |

!!! info "Tool result sanitization"
    All tool results are sanitized before reaching the LLM (BR-HAPI-211) to prevent credential leakage from Kubernetes secrets, ConfigMaps, or environment variables.

## Next Steps

- [AI Analysis](ai-analysis.md) -- The AA controller that orchestrates KA sessions
- [Workflow Selection](workflow-selection.md) -- DataStorage scoring algorithm details
- [Effectiveness Assessment](effectiveness.md) -- How remediations are evaluated after execution
- [Remediation Workflows](../user-guide/workflows.md) -- How to author workflows that the LLM can discover
- [Rego Policies](../user-guide/policies.md) -- Customizing the approval policy
- [Human Approval](../user-guide/approval.md) -- The approval flow for operators
