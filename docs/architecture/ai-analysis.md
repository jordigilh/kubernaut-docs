# AI Analysis

The AI Analysis service performs root cause investigation using an LLM (via HolmesGPT) and decides whether the selected workflow should be auto-approved or require human review.

## Architecture

```mermaid
graph TB
    AA[AI Analysis<br/>Controller] -->|session submit| HAPI[HolmesGPT API]
    AA -->|session poll| HAPI
    AA -->|session result| HAPI
    HAPI -->|LLM call| LLM[LLM Provider<br/><small>Vertex AI / OpenAI</small>]
    HAPI -->|workflow query| DS[DataStorage]
    AA -->|Rego eval| REGO[Approval Policy]
    AA -->|audit| DS
```

## Session-Based Async Pattern

The AI Analysis controller communicates with HolmesGPT using a **session-based asynchronous** pattern (BR-AA-HAPI-064):

### Flow

1. **Submit** — `POST /api/v1/incident/analyze` → `202 Accepted` + `session_id`
2. **Poll** — `GET /api/v1/incident/session/{session_id}` → status (`pending`, `investigating`, `completed`, `failed`)
3. **Result** — `GET /api/v1/incident/session/{session_id}/result` → full analysis

```mermaid
sequenceDiagram
    participant AA as AI Analysis Controller
    participant HAPI as HolmesGPT API
    participant LLM as LLM Provider

    AA->>HAPI: POST /api/v1/incident/analyze
    HAPI-->>AA: 202 {session_id}
    Note over AA: Phase: Investigating

    HAPI->>LLM: Run investigation (kubectl access)
    LLM-->>HAPI: Analysis result

    AA->>HAPI: GET /session/{id}
    HAPI-->>AA: {status: "completed"}

    AA->>HAPI: GET /session/{id}/result
    HAPI-->>AA: IncidentResponse
    Note over AA: Phase: Analyzing
```

This pattern avoids long HTTP timeouts and allows the controller to use Kubernetes-native requeue mechanisms (`RequeueAfter`) while the LLM investigation runs. The controller polls at a **constant 15-second interval** (configurable from 1s to 5m via `--session-poll-interval` flag or `WithSessionPollInterval` option).

### Session Recovery

If HolmesGPT API restarts and returns `404` for a session, the controller regenerates the session (up to 5 attempts per BR-AA-HAPI-064.5/064.6).

## Timeout Configuration

The Orchestrator passes per-analysis timeout configuration via the AIAnalysis CRD spec:

| Field | Default | Description |
|---|---|---|
| `investigatingTimeout` | Inherited from RR | Maximum time in the Investigating phase |
| `analyzingTimeout` | Inherited from RR | Maximum time in the Analyzing phase |

If either timeout expires, the AIAnalysis transitions to `Failed`.

## Phases

| Phase | Description |
|---|---|
| `Pending` | CRD created by Orchestrator |
| `Investigating` | Session submitted to HolmesGPT, polling for completion |
| `Analyzing` | Results received, evaluating Rego approval policy |
| `Completed` | Analysis and approval decision recorded |
| `Failed` | Investigation or analysis failed |

## HolmesGPT Investigation

HolmesGPT is a Python FastAPI service that orchestrates LLM-driven investigation with live Kubernetes access and configurable observability toolsets. During investigation, it:

1. **Reads the enriched signal** — Alert details, target resource, namespace context
2. **Investigates using K8s tools** — Inspects pod logs, events, resource state, and live metrics via `kubectl`; optionally queries Prometheus, Grafana Loki/Tempo, and other configured toolsets
3. **Produces a root cause analysis** — Structured explanation of what went wrong
4. **Resolves the target resource** — Calls `get_resource_context` to resolve the owner chain, compute a spec hash, fetch **remediation history** (past outcomes and effectiveness scores from DataStorage), and detect **infrastructure labels** (GitOps, Helm, service mesh, HPA, PDB)
5. **Discovers workflows via DataStorage** — The LLM uses a three-step protocol: `list_available_actions` → `list_workflows` → `get_workflow`. Signal context and detected labels are auto-injected as filters; DataStorage orders results by label-match scoring (scores not exposed to the LLM).
6. **LLM selects a workflow** — Based on workflow descriptions (`what`, `whenToUse`, `whenNotToUse`), detected infrastructure context, and remediation history

## Response Processing

When the controller receives the analysis result, it applies two confidence thresholds:

### Investigation Threshold (0.7)

Applied in the response processor during the Investigating phase:

- **Confidence >= 0.7 with no workflow** — Treated as "problem already resolved" (no remediation needed)
- **Confidence < 0.7 with a selected workflow** — Workflow selection rejected as low-confidence

### Approval Threshold (0.8, configurable)

Applied via Rego policy during the Analyzing phase:

- **Confidence >= threshold** — Auto-approved; Orchestrator proceeds to execution
- **Confidence < threshold** — Requires human approval; Orchestrator creates `RemediationApprovalRequest`

## Rego Approval Policy

The approval decision is made by a Rego policy (`approval.rego`) that evaluates:

```rego
default confidence_threshold := 0.8

confidence_threshold := input.confidence_threshold if {
    input.confidence_threshold
}

is_high_confidence if {
    input.confidence >= confidence_threshold
}
```

The threshold is configurable via Helm: `aianalysis.rego.confidenceThreshold`.

The Rego policy also receives `input.detected_labels` (a map of **snake_case** keys, e.g., `"stateful"`, `"pdb_protected"`, `"hpa_enabled"`) and `input.failed_detections` (detection errors). These come from the `DetectedLabels` computed by HolmesGPT post-RCA and resolved by the Analyzing handler.

## Next Steps

- [Remediation Routing](remediation-routing.md) — How the Orchestrator routes the result
- [Workflow Selection](workflow-selection.md) — Catalog query and scoring details
- [Human Approval](../user-guide/approval.md) — The approval flow
