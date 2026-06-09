# MCP Tool Reference

The API Frontend exposes **21 `kubernaut_*` MCP tools** on its Streamable HTTP endpoint (`POST /mcp`).
Each tool is SAR-gated via [per-persona ClusterRoles](../architecture/security-rbac.md#per-persona-clusterroles), rate-limited, and audit-logged.

All tools return JSON in MCP `CallToolResult` text content. Default timeout is 30 s (configurable per tool).
RBAC is fail-closed — SAR errors deny the call.

!!! info "Conditional tool surface (#1366)"
    When [`interactive.enabled`](../user-guide/configuration.md) is `false`, **10 session-dependent tools** are hidden from MCP `tools/list` and the A2A agent, leaving **11 stateless tools** (CRD operations + data/history). Hidden tools: `kubernaut_investigate`, `kubernaut_discover_workflows`, `kubernaut_select_workflow`, `kubernaut_present_decision`, `kubernaut_message`, `kubernaut_complete`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect`, `kubernaut_await_session`.

!!! tip "Building skills on Kubernaut tools"
    When authoring MCP skills or prompts that call these tools, use the **"When to use"** guidance below each tool to select the right one.
    Check the [Persona Access Matrix](#persona-access-matrix) to ensure the caller's ClusterRole includes the tool.

---

## RemediationRequest

Backend: **K8s API** (AF ServiceAccount) — operates on `kubernaut.ai/v1alpha1/remediationrequests`.

!!! info "Namespace model (ADR-057)"
    All CRD tools operate in the **controller namespace** (typically `kubernaut-system`), injected server-side. The `namespace` parameter is **not exposed** to callers. `rr_id` and `rar_id` are **plain resource names** (e.g. `oom-fix-abc`), not `namespace/name` pairs.

- **`kubernaut_list_remediations`** — List active and recent remediations with optional filtering

    - `phase` (`string`) — Filter by `status.overallPhase` (e.g. `Pending`, `Running`, `Completed`, `Failed`)
    - `kind` (`string`) — Filter by `spec.targetResource.kind`
    - `name` (`string`) — Filter by `spec.targetResource.name`

    **When to use:** First step in any remediation workflow — discover what's active before drilling into a specific RR.

    ??? example "Response"
        ```json
        {
          "remediations": [
            {
              "id": "oom-fix-abc",
              "name": "oom-fix-abc",
              "phase": "Running",
              "kind": "Deployment",
              "target": "api-server"
            }
          ],
          "count": 1
        }
        ```

    **Personas:** SRE, AI Orchestrator, CI/CD, Observability, L3 Audit, Remediation Approver

---

- **`kubernaut_get_remediation`** — Get details of a specific remediation

    - `rr_id` (`string`) — RR name
    - `name` (`string`) — RR name (alias for `rr_id`)

    Provide `rr_id` **or** `name`.

    **When to use:** Inspect a known remediation for phase, target resource, and status. Follow up after `kubernaut_list_remediations`.

    ??? example "Response"
        ```json
        {
          "id": "oom-fix-abc",
          "name": "oom-fix-abc",
          "phase": "Completed",
          "kind": "Deployment",
          "target": "api-server"
        }
        ```

    **Personas:** SRE, AI Orchestrator, CI/CD, Observability, L3 Audit, Remediation Approver

---

- **`kubernaut_cancel_remediation`** — Cancel an active remediation that has not yet reached a terminal state

    - `rr_id` (`string`) — RR name
    - `name` (`string`) — RR name (alias for `rr_id`)

    Provide `rr_id` **or** `name`. Fails if the phase is already terminal (`Completed`, `Failed`, `Cancelled`).

    **When to use:** Abort a remediation that is no longer needed or was started in error. Check phase with `kubernaut_get_remediation` first.

    ??? example "Response"
        ```json
        {
          "status": "Cancelled",
          "message": "Remediation prod/oom-fix-abc cancelled"
        }
        ```

    **Personas:** SRE

---

- **`kubernaut_watch`** — Stream live status updates for a remediation and its related resources

    - `rr_id` (`string`) — RR name
    - `name` (`string`) — RR name (alias for `rr_id`)

    Blocks until terminal phase, `AwaitingApproval` (yields so the LLM can approve), context cancellation, or internal 15-minute cap.

    **When to use:** Stay in the remediation journey — call after `kubernaut_select_workflow` to see phase transitions in real time (`Pending` → `Approved` → `Running` → `Completed`/`Failed`).

    ??? example "Response"
        ```json
        {
          "events": [
            {
              "timestamp": "2026-05-23T18:30:00Z",
              "resource": "RemediationRequest",
              "phase": "Running",
              "message": "Workflow execution started"
            }
          ],
          "status": "completed"
        }
        ```

    **Personas:** SRE, AI Orchestrator, CI/CD, Observability, Remediation Approver

---

## RemediationApprovalRequest

Backend: **K8s API** (AF ServiceAccount) — operates on `kubernaut.ai/v1alpha1/remediationapprovalrequests`.

- **`kubernaut_list_approval_requests`** — List approval requests with optional filtering by decision status

    - `decision` (`string`) — Filter: `pending`, `approved`, `rejected`, `expired` (empty = all)

    **When to use:** Discover pending approval requests. First step in the approval UX flow before drilling into a specific RAR.

    ??? example "Response"
        ```json
        {
          "approval_requests": [
            {
              "name": "rar-oom-fix-abc",
              "namespace": "prod",
              "decision": "Pending",
              "remediation_request": "oom-fix-abc",
              "confidence": 0.85,
              "confidence_level": "High",
              "time_remaining": "28m",
              "required_by": "2026-05-23T19:00:00Z"
            }
          ],
          "count": 1
        }
        ```

    **Personas:** Remediation Approver

---

- **`kubernaut_get_approval_request`** — Get full details of a specific approval request for review before deciding

    - `rar_id` (`string`) — RAR name
    - `name` (`string`) — RAR name (alias for `rar_id`)

    Provide `rar_id` **or** `name`.

    **When to use:** Inspect an RAR's investigation summary, evidence, recommended actions, and alternatives before calling `kubernaut_approve`.

    ??? example "Response"
        ```json
        {
          "name": "rar-oom-fix-abc",
          "namespace": "prod",
          "remediation_request": "oom-fix-abc",
          "ai_analysis": "Memory limit insufficient for traffic spike",
          "confidence": 0.85,
          "confidence_level": "High",
          "investigation_summary": "Root cause: memory limit 256Mi too low...",
          "why_approval_required": "Confidence below auto-approve threshold",
          "recommended_workflow": { "name": "adjust-memory-limits", "version": "v2" },
          "recommended_actions": [
            { "action": "Increase memory limit to 512Mi", "rationale": "Matches p99 usage" }
          ],
          "evidence_collected": [
            "pod/api-server-xyz OOMKilled",
            "metrics: mem_usage_p99=480Mi"
          ],
          "alternatives_considered": [
            { "approach": "HPA scale-out", "pros_cons": "Cheaper but doesn't fix root cause" }
          ],
          "decision": "Pending",
          "time_remaining": "28m",
          "expired": false
        }
        ```

    **Personas:** Remediation Approver

---

- **`kubernaut_approve`** — Approve or reject a pending remediation approval request

    - `rar_name` (`string`) **(required)** — RemediationApprovalRequest name
    - `decision` (`string`) **(required)** — `Approved` or `Rejected` (enforced via InputSchema enum — `Expired` is **not** a valid input)
    - `reason` (`string`) — Decision rationale (stored as `status.decisionMessage`)
    - `workflow_override` (`string`) — Override workflow (stored as `status.workflowOverride.workflowName`)

    **When to use:** Final step in the approval flow after reviewing the RAR with `kubernaut_get_approval_request`. Always provide a `reason` for audit trail traceability.

    ??? example "Response"
        ```json
        {
          "status": "Approved",
          "message": "Remediation approval Approved by alice@corp.com"
        }
        ```

    **Personas:** Remediation Approver

---

## Investigation

- **`kubernaut_investigate`** — Start or join an investigation (consolidates former `start_investigation`, `poll_investigation`, `stream_investigation`, and `takeover` — #1307, #1332)

    Backend: **KA MCP** — dispatches to the Kubernaut Agent's MCP server.

    - `rr_id` (`string`) — Existing RR name (starts investigation on that RR)
    - `api_version` (`string`) — Kubernetes API group/version, e.g. `apps/v1`, `v1` (required when creating a new RR, #1372)
    - `namespace` (`string`) — Target resource namespace (for creating a new RR + IS)
    - `kind` (`string`) — Target resource kind (required with `namespace`/`name`)
    - `name` (`string`) — Target resource name (required with `namespace`/`name`)

    Provide `rr_id` for an existing RR, **or** `api_version`+`namespace`+`kind`+`name` to create a new RR and InvestigationSession for interactive use. Service accounts cannot start interactive investigations (namespace/kind/name path).

    In A2A mode, blocks until the investigation completes and returns the full RCA summary. On the MCP bridge, returns immediately; live events are streamed in the background via SSE. If the RR already has an active investigation driven by another user, a structured `session_active` result is returned instead of an error.

    **When to use:** Single entry point for all investigation workflows. Follow up with `kubernaut_discover_workflows` after the investigation completes.

    ??? example "Response"
        ```json
        {
          "session_id": "sess-abc123",
          "status": "completed",
          "summary": "Root cause identified: OOMKilled due to memory limit...",
          "rr_id": "oom-fix-abc"
        }
        ```

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_await_session`** — Wait for an investigation session to become ready on a RemediationRequest

    Backend: **K8s API** — watches/polls AIAnalysis resources until `status.investigationSession.id` is populated.

    - `rr_name` (`string`) **(required)** — RemediationRequest name

    Blocks until the AIAnalysis for the given RR has a non-empty session ID or timeout (default: **3 minutes**). Useful when the operator wants to interact with a session that was triggered autonomously (from an alert) but hasn't yet been submitted to KA.

    **When to use:** Wait for an autonomous investigation to become joinable before calling `kubernaut_message` or `kubernaut_reconnect`.

    ??? example "Response"
        ```json
        {
          "session_id": "sess-abc123",
          "status": "ready"
        }
        ```

    **Personas:** SRE, AI Orchestrator, CI/CD, Observability, Remediation Approver

---

### Interactive Session Lifecycle

Backend: **KA MCP** — dispatches to the Kubernaut Agent's MCP server (`POST /api/v1/mcp`).

All interactive tools share a common response shape:

```json
{
  "session_id": "string (optional)",
  "status": "string",
  "message": "string (optional)"
}
```

- **`kubernaut_message`** — Send a message to an active investigation session

    - `rr_id` (`string`) **(required)** — Remediation request ID
    - `message` (`string`) **(required)** — Message content (max 10 240 chars)

    **When to use:** Converse with the AI agent during an interactive session — provide context, ask questions, or steer the investigation.

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_complete`** — Complete an investigation session

    - `rr_id` (`string`) **(required)** — Remediation request ID
    - `message` (`string`) — Optional completion message

    **When to use:** Signal that the investigation is done. If a workflow was selected, this triggers the remediation pipeline.

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_cancel`** — Cancel an active investigation session

    - `rr_id` (`string`) **(required)** — Remediation request ID
    - `message` (`string`) — Optional cancellation reason

    **When to use:** Abort an interactive session that is no longer needed. The session is released and the MCP lease is freed.

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_status`** — Get the current status of an investigation session

    - `rr_id` (`string`) **(required)** — Remediation request ID

    **When to use:** Check session state (active, completed, disconnected) before sending a message or reconnecting.

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_reconnect`** — Reconnect to a disconnected investigation session

    - `rr_id` (`string`) **(required)** — Remediation request ID
    - `message` (`string`) — Optional message

    **When to use:** Resume a session after a network disconnect or client restart. Check status with `kubernaut_status` first.

    **Personas:** SRE, AI Orchestrator

---

## Workflow

- **`kubernaut_discover_workflows`** — Discover available workflows with parameter schemas for a remediation

    Backend: **KA MCP**

    - `rr_id` (`string`) **(required)** — Remediation request ID
    - `workflow_id` (`string`) — Filter to a specific workflow
    - `kind` (`string`) — Filter by resource kind

    Requires an active investigation session. Triggers LLM-driven workflow discovery based on investigation context. Parameters are pre-populated by the AI agent.

    **When to use:** After the investigation completes and the user asks to fix/remediate — present workflow options with pre-populated parameters. Follow up with `kubernaut_select_workflow`.

    ??? example "Response"
        ```json
        {
          "workflows": [
            {
              "workflow_id": "adjust-memory-limits",
              "name": "Adjust Memory Limits",
              "description": "Increase container memory limits based on usage analysis",
              "kind": "Deployment",
              "parameters": [
                {
                  "name": "memory_limit",
                  "type": "string",
                  "description": "New memory limit (e.g. 512Mi)",
                  "required": true,
                  "default": "512Mi"
                }
              ]
            }
          ],
          "count": 1
        }
        ```

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_select_workflow`** — Select a workflow for execution

    Backend: **KA MCP**

    - `rr_id` (`string`) **(required)** — Remediation request ID
    - `workflow_id` (`string`) **(required)** — Workflow to select (must be from discovery results)
    - `kind` (`string`) — Target resource kind
    - `name` (`string`) — Target resource name
    - `namespace` (`string`) — Target namespace
    - `parameters` (`object`) — Workflow parameter values

    Requires a prior `kubernaut_discover_workflows` call — the `workflow_id` must be from the discovery results.

    **When to use:** User has chosen a workflow from the discovery results. This triggers enrichment and creates a RemediationRequest. Follow up with `kubernaut_watch` to track execution.

    ??? example "Response"
        ```json
        {
          "status": "selected",
          "message": "Workflow adjust-memory-limits selected for prod/api-server"
        }
        ```

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_list_workflows`** — List available remediation workflows from the catalog

    Backend: **DataStorage**

    - `kind` (`string`) — Filter by resource kind

    !!! note "Bridge-only for AF agent"
        This tool is available on the MCP bridge for remote clients but was **removed from the AF agent's internal LLM tool set** (AC-6 security). The AF agent uses `kubernaut_discover_workflows` instead, which follows the RCA → discovery → selection pipeline.

    **When to use:** Browse the full workflow catalog without an active investigation. Unlike `kubernaut_discover_workflows`, this does not require a session and returns catalog entries without LLM-based recommendations.

    ??? example "Response"
        ```json
        {
          "workflows": [
            {
              "id": "adjust-memory-limits",
              "name": "Adjust Memory Limits",
              "description": "Increase container memory limits",
              "kind": "Deployment"
            }
          ],
          "count": 1
        }
        ```

    **Personas:** SRE, Observability, L3 Audit

---

## Data & History

Backend: **DataStorage** — queries the Kubernaut DataStorage service.

- **`kubernaut_get_remediation_history`** — Query historical remediations with optional filtering

    - `namespace` (`string`) — Filter by namespace
    - `kind` (`string`) — Filter by target kind
    - `name` (`string`) — Filter by target name
    - `since` (`string`) — Time filter

    **When to use:** Analyze past remediation outcomes for a resource, namespace, or time window. Useful for trend analysis and post-incident reviews.

    ??? example "Response"
        ```json
        {
          "remediations": [
            {
              "id": "prod/oom-fix-abc",
              "namespace": "prod",
              "phase": "Completed",
              "created_at": "2026-05-22T14:00:00Z",
              "workflow": "adjust-memory-limits"
            }
          ],
          "count": 1
        }
        ```

    **Personas:** SRE, L3 Audit

---

- **`kubernaut_get_effectiveness`** — Get effectiveness scores and metrics for remediation workflows

    - `workflow_id` (`string`) — Filter by workflow
    - `namespace` (`string`) — Filter by namespace

    **When to use:** Evaluate how well a workflow performs before recommending it. Compare success rates across workflows or namespaces.

    ??? example "Response"
        ```json
        {
          "workflow_id": "adjust-memory-limits",
          "success_rate": 0.92,
          "avg_duration": "4m30s",
          "sample_size": 24
        }
        ```

    **Personas:** SRE, Observability, L3 Audit

---

- **`kubernaut_get_audit_trail`** — Retrieve the audit trail for a remediation, showing all actions and decisions

    - `rr_id` (`string`) **(required)** — Remediation request ID
    - `event_type` (`string`) — Filter by event type

    **When to use:** Compliance review — trace every action taken on a remediation from signal to completion. Required for L3 audits and post-incident reports.

    ??? example "Response"
        ```json
        {
          "events": [
            {
              "timestamp": "2026-05-23T18:30:00Z",
              "event_type": "tool.executed",
              "actor": "alice@corp.com",
              "detail": "kubernaut_approve: Approved"
            }
          ],
          "count": 1
        }
        ```

    **Personas:** SRE, L3 Audit

---

## Presentation

- **`kubernaut_present_decision`** — Present investigation results and remediation options to the user for a decision

    Backend: **Local** (no backend call — formats a human-readable decision prompt)

    - `session_id` (`string`) **(required)** — Investigation session ID
    - `summary` (`string`) **(required)** — Investigation summary / RCA text
    - `options` (`array`) **(required)** — Workflow choices to present
        - `options[].workflow_id` (`string`) **(required)** — Workflow identifier
        - `options[].name` (`string`) **(required)** — Display name
        - `options[].description` (`string`) **(required)** — Option description
        - `options[].risk` (`string`) — Risk label

    **When to use:** Called by the AF agent to format investigation results into a structured decision prompt. Typically not called directly by external skills — the AF agent calls it internally after streaming an investigation.

    ??? example "Response"
        ```json
        {
          "presented": true,
          "message": "Investigation complete.\n\nSummary: Memory limit insufficient...\n\nAvailable actions:\n  1. Adjust Memory Limits (Risk: Low)"
        }
        ```

    **Personas:** SRE, AI Orchestrator

---

## Common UX Flows

### Approval flow

```
kubernaut_list_approval_requests(decision="pending")
  → kubernaut_get_approval_request(rar_id)
    → kubernaut_approve(rar_name, decision, reason)
```

### Autonomous investigation flow

```
kubernaut_investigate(rr_id)
  → kubernaut_discover_workflows(rr_id)
    → kubernaut_select_workflow(rr_id, workflow_id)
      → kubernaut_watch(rr_id)
```

### Interactive investigation flow (new RR)

```
kubernaut_investigate(api_version, namespace, kind, name)  # creates RR + IS
  → kubernaut_message(rr_id, message)            # repeat as needed
    → kubernaut_discover_workflows(rr_id)
      → kubernaut_select_workflow(rr_id, workflow_id)
        → kubernaut_watch(rr_id)
```

### Interactive investigation flow (existing RR)

```
kubernaut_list_remediations()
  → kubernaut_await_session(rr_name)
    → kubernaut_message(rr_id, message)          # repeat as needed
      → kubernaut_discover_workflows(rr_id)
        → kubernaut_select_workflow(rr_id, workflow_id)
          → kubernaut_watch(rr_id)
```

### Compliance audit flow

```
kubernaut_list_remediations()
  → kubernaut_get_remediation(rr_id)
    → kubernaut_get_audit_trail(rr_id)
      → kubernaut_get_effectiveness(workflow_id)
```

---

## Backend Routing Summary

| Backend | Tools |
|---------|-------|
| **K8s API** (AF SA) | `list_remediations`, `get_remediation`, `cancel_remediation`, `watch`, `approve`, `list_approval_requests`, `get_approval_request`, `await_session` |
| **KA MCP** | `investigate`, `message`, `complete`, `cancel`, `status`, `reconnect`, `discover_workflows`, `select_workflow` |
| **DataStorage** | `list_workflows`, `get_remediation_history`, `get_effectiveness`, `get_audit_trail` |
| **Local** | `present_decision` |

---

## Persona Access Matrix

All tool names below are prefixed with `kubernaut_`.

| Tool | SRE | AI Orch. | CI/CD | Obs. | L3 Audit | Approver |
|------|:---:|:--------:|:-----:|:----:|:--------:|:--------:|
| `list_remediations` | :material-check: | :material-check: | :material-check: | :material-check: | :material-check: | :material-check: |
| `get_remediation` | :material-check: | :material-check: | :material-check: | :material-check: | :material-check: | :material-check: |
| `cancel_remediation` | :material-check: | | | | | |
| `watch` | :material-check: | :material-check: | :material-check: | :material-check: | | :material-check: |
| `list_approval_requests` | | | | | | :material-check: |
| `get_approval_request` | | | | | | :material-check: |
| `approve` | :material-check: | | | | | :material-check: |
| `await_session` | :material-check: | :material-check: | :material-check: | :material-check: | | :material-check: |
| `investigate` | :material-check: | :material-check: | | | | |
| `message` | :material-check: | :material-check: | | | | |
| `complete` | :material-check: | :material-check: | | | | |
| `cancel` | :material-check: | :material-check: | | | | |
| `status` | :material-check: | :material-check: | | | | |
| `reconnect` | :material-check: | :material-check: | | | | |
| `discover_workflows` | :material-check: | :material-check: | | | | |
| `select_workflow` | :material-check: | :material-check: | | | | |
| `present_decision` | :material-check: | :material-check: | | | | |
| `list_workflows` | :material-check: | | | :material-check: | :material-check: | |
| `get_remediation_history` | :material-check: | | | | :material-check: | |
| `get_effectiveness` | :material-check: | | | :material-check: | :material-check: | |
| `get_audit_trail` | :material-check: | | | | :material-check: | |

---

## Internal Tools (A2A Agent Only)

The AF agent uses additional tools inside its A2A agent loop.
These are **not** exposed on the MCP bridge and cannot be called by external MCP clients.
However, they **are** SAR-gated on the A2A path via `newRBACGuard()` and are included in per-persona ClusterRoles in `values.yaml`.

### Core internal tools (always registered)

| Tool | Purpose |
|------|---------|
| `kubectl_get` | Get any namespaced K8s resource by kind/name/namespace (Secret `.data` redacted). GVR resolved via RESTMapper + static table. |
| `kubectl_list` | List namespaced K8s resources with optional label selector (Secret `.data` redacted). GVR resolved via RESTMapper + static table. |
| `kubectl_list_events` | List K8s events with reason/object filters |
| `kubernaut_check_existing_remediation` | Check for duplicate RemediationRequest before creation. Params: `namespace`, `kind`, `name`. |
| `kubernaut_remediate` | Create a new RemediationRequest CRD. Params: `namespace`, `kind`, `name`, `api_version` (required with namespace/kind/name, #1372), `description`, `rr_id`. |

### Alert tools (registered when `severityTriage.enabled: true` + Prometheus configured) {: #alert-tools }

These tools are only available when the AF has a Prometheus connection configured via `severityTriage.prometheusURL`. They enable the A2A agent to query firing alerts and create alert-driven RemediationRequests.

| Tool | Purpose |
|------|---------|
| `list_alerts` | Query Prometheus alerts with optional filters. Params: `namespace`, `severity` (critical/high/medium/low/info/warning), `state` (firing/pending). Returns redacted `AlertSummary` array. |
| `get_alert_details` | Get details of a specific alert. Params: `alert_name` (required), `namespace` (optional). Returns matching `AlertSummary` array. |
| `kubernaut_investigate_alert` | Alert-first RR creation with scope validation. Params: `alert_name`, `api_version`, `kind`, `name` (all required), `namespace` (optional for cluster-scoped). Validates alert exists in Prometheus and checks namespace/cluster scope via RESTMapper before creating the RR (#1372). |

!!! note "KA kubectl tools have `api_group`"
    The **Kubernaut Agent's** kubectl tools (`kubectl_get`, `kubectl_list` in KA) support an `api_group` parameter for kind disambiguation (#1311). The **AF's** internal `kubectl_get`/`kubectl_list` do not — they resolve GVR via RESTMapper and a static GVK table.
