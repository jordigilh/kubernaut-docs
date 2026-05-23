# MCP Tool Reference

The API Frontend exposes **23 `kubernaut_*` MCP tools** on its Streamable HTTP endpoint (`POST /mcp`).
Each tool is SAR-gated via [per-persona ClusterRoles](../architecture/security-rbac.md#per-persona-clusterroles), rate-limited, and audit-logged.

All tools return JSON in MCP `CallToolResult` text content. Default timeout is 30 s (configurable per tool).
RBAC is fail-closed — SAR errors deny the call.

!!! tip "Building skills on Kubernaut tools"
    When authoring MCP skills or prompts that call these tools, use the **"When to use"** guidance below each tool to select the right one.
    Check the [Persona Access Matrix](#persona-access-matrix) to ensure the caller's ClusterRole includes the tool.

---

## RemediationRequest

Backend: **K8s API** (AF ServiceAccount) — operates on `kubernaut.ai/v1alpha1/remediationrequests`.

- **`kubernaut_list_remediations`** — List active and recent remediations with optional filtering

    - `namespace` (`string`) **(required)** — Kubernetes namespace
    - `phase` (`string`) — Filter by `status.overallPhase` (e.g. `Pending`, `Running`, `Completed`, `Failed`)
    - `kind` (`string`) — Filter by `spec.targetResource.kind`
    - `name` (`string`) — Filter by `spec.targetResource.name`

    **When to use:** First step in any remediation workflow — discover what's active before drilling into a specific RR.

    ??? example "Response"
        ```json
        {
          "remediations": [
            {
              "id": "prod/oom-fix-abc",
              "namespace": "prod",
              "name": "oom-fix-abc",
              "phase": "Running",
              "kind": "Deployment",
              "target": "api-server"
            }
          ],
          "count": 1
        }
        ```

    **Personas:** SRE, AI Orchestrator, CI/CD, Observability, L3 Audit

---

- **`kubernaut_get_remediation`** — Get details of a specific remediation

    - `namespace` (`string`) — Remediation namespace
    - `name` (`string`) — Remediation name
    - `rr_id` (`string`) — Shorthand `namespace/name`

    Provide `rr_id` **or** both `namespace` + `name`.

    **When to use:** Inspect a known remediation for phase, target resource, and status. Follow up after `kubernaut_list_remediations`.

    ??? example "Response"
        ```json
        {
          "id": "prod/oom-fix-abc",
          "namespace": "prod",
          "name": "oom-fix-abc",
          "phase": "Completed",
          "kind": "Deployment",
          "target": "api-server"
        }
        ```

    **Personas:** SRE, AI Orchestrator, CI/CD, Observability, L3 Audit

---

- **`kubernaut_cancel_remediation`** — Cancel an active remediation that has not yet reached a terminal state

    - `namespace` (`string`) — Remediation namespace
    - `name` (`string`) — Remediation name
    - `rr_id` (`string`) — Shorthand `namespace/name`

    Provide `rr_id` **or** both `namespace` + `name`. Fails if the phase is already terminal (`Completed`, `Failed`, `Cancelled`).

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

    - `namespace` (`string`) **(required)** — Remediation namespace
    - `name` (`string`) **(required)** — Remediation name

    Blocks until terminal phase, context cancellation, or internal 10-minute cap.

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

    - `namespace` (`string`) **(required)** — Namespace to list RARs in
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

    - `namespace` (`string`) — RAR namespace
    - `name` (`string`) — RAR name
    - `rar_id` (`string`) — Shorthand `namespace/name`

    Provide `rar_id` **or** both `namespace` + `name`.

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

    - `namespace` (`string`) **(required)** — RAR namespace
    - `rar_name` (`string`) **(required)** — RemediationApprovalRequest name
    - `decision` (`string`) **(required)** — `Approved`, `Rejected`, or `Expired`
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

### Autonomous

Backend: **KA REST** — dispatches to the Kubernaut Agent's REST API.

- **`kubernaut_start_investigation`** — Start an AI-powered investigation, returning a session ID for tracking

    - `namespace` (`string`) **(required)** — Target resource namespace
    - `name` (`string`) **(required)** — Target resource / RR name
    - `kind` (`string`) — Target resource kind

    **When to use:** Begin an autonomous investigation. Use the returned `session_id` with `kubernaut_poll_investigation` or `kubernaut_stream_investigation` to track progress.

    ??? example "Response"
        ```json
        {
          "session_id": "sess-abc123",
          "status": "started",
          "message": "Investigation started for prod/api-server (session: sess-abc123)"
        }
        ```

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_poll_investigation`** — Check investigation progress (blocks ~15 s, 5 polls at 3 s intervals)

    - `session_id` (`string`) **(required)** — Investigation session ID

    Re-call if status is `in_progress`.

    **When to use:** Lightweight polling alternative when SSE streaming is unavailable. Prefer `kubernaut_stream_investigation` for real-time narrative.

    ??? example "Response"
        ```json
        {
          "status": "completed",
          "summary": "Root cause identified: OOMKilled due to memory limit...",
          "poll_count": 3
        }
        ```

    **Personas:** SRE, AI Orchestrator

---

- **`kubernaut_stream_investigation`** — Stream live investigation events in real time (default timeout: 15 min)

    - `session_id` (`string`) **(required)** — Investigation session ID

    Blocks until terminal SSE event or timeout.

    **When to use:** Best experience for interactive users — see the AI agent's reasoning unfold in real time. Use after `kubernaut_start_investigation`.

    ??? example "Response"
        ```json
        {
          "status": "completed",
          "summary": "Root cause identified: OOMKilled due to memory limit...",
          "events": [
            { "type": "progress", "phase": "inspection", "text": "Checking pod status..." },
            { "type": "progress", "phase": "analysis", "text": "Analyzing resource limits..." }
          ],
          "event_log": "Checking pod status...\nAnalyzing resource limits..."
        }
        ```

    **Personas:** SRE, AI Orchestrator

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

- **`kubernaut_takeover`** — Take over an existing investigation for human-in-the-loop participation

    - `rr_id` (`string`) **(required)** — Remediation request ID (`namespace/name`)
    - `message` (`string`) — Optional message (max 10 240 chars)

    **When to use:** Join an in-progress autonomous investigation. The AI agent pauses and the session becomes interactive.

    **Personas:** SRE, AI Orchestrator

---

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
kubernaut_list_approval_requests(namespace, decision="pending")
  → kubernaut_get_approval_request(namespace, name)
    → kubernaut_approve(namespace, rar_name, decision, reason)
```

### Autonomous investigation flow

```
kubernaut_start_investigation(namespace, name)
  → kubernaut_stream_investigation(session_id)
    → kubernaut_discover_workflows(rr_id)
      → kubernaut_select_workflow(rr_id, workflow_id)
        → kubernaut_watch(namespace, name)
```

### Interactive investigation flow

```
kubernaut_list_remediations(namespace)
  → kubernaut_takeover(rr_id)
    → kubernaut_message(rr_id, message)  # repeat as needed
      → kubernaut_discover_workflows(rr_id)
        → kubernaut_select_workflow(rr_id, workflow_id)
          → kubernaut_watch(namespace, name)
```

### Compliance audit flow

```
kubernaut_list_remediations(namespace)
  → kubernaut_get_remediation(rr_id)
    → kubernaut_get_audit_trail(rr_id)
      → kubernaut_get_effectiveness(workflow_id)
```

---

## Backend Routing Summary

| Backend | Tools |
|---------|-------|
| **K8s API** (AF SA) | `list_remediations`, `get_remediation`, `cancel_remediation`, `watch`, `approve`, `list_approval_requests`, `get_approval_request` |
| **KA REST** | `start_investigation`, `poll_investigation`, `stream_investigation` |
| **KA MCP** | `takeover`, `message`, `complete`, `cancel`, `status`, `reconnect`, `discover_workflows`, `select_workflow` |
| **DataStorage** | `list_workflows`, `get_remediation_history`, `get_effectiveness`, `get_audit_trail` |
| **Local** | `present_decision` |

---

## Persona Access Matrix

All tool names below are prefixed with `kubernaut_`.

| Tool | SRE | AI Orch. | CI/CD | Obs. | L3 Audit | Approver |
|------|:---:|:--------:|:-----:|:----:|:--------:|:--------:|
| `list_remediations` | :material-check: | :material-check: | :material-check: | :material-check: | :material-check: | |
| `get_remediation` | :material-check: | :material-check: | :material-check: | :material-check: | :material-check: | |
| `cancel_remediation` | :material-check: | | | | | |
| `watch` | :material-check: | :material-check: | :material-check: | :material-check: | | :material-check: |
| `list_approval_requests` | | | | | | :material-check: |
| `get_approval_request` | | | | | | :material-check: |
| `approve` | | | | | | :material-check: |
| `start_investigation` | :material-check: | :material-check: | | | | |
| `poll_investigation` | :material-check: | :material-check: | | | | |
| `stream_investigation` | :material-check: | :material-check: | | | | |
| `takeover` | :material-check: | :material-check: | | | | |
| `message` | :material-check: | :material-check: | | | | |
| `complete` | :material-check: | :material-check: | | | | |
| `cancel` | :material-check: | :material-check: | | | | |
| `status` | :material-check: | :material-check: | | | | |
| `reconnect` | :material-check: | :material-check: | | | | |
| `discover_workflows` | :material-check: | :material-check: | | | | |
| `select_workflow` | :material-check: | :material-check: | | | | |
| `list_workflows` | :material-check: | | | :material-check: | :material-check: | |
| `get_remediation_history` | :material-check: | | | | :material-check: | |
| `get_effectiveness` | :material-check: | | | :material-check: | :material-check: | |
| `get_audit_trail` | :material-check: | | | | :material-check: | |
| `present_decision` | :material-check: | :material-check: | | | | |

---

## Internal Tools (Not MCP-Exposed)

The AF also uses 5 internal tools that run under the AF pod's own ServiceAccount inside the agent loop.
These are **not** exposed via MCP/A2A, are **not** SAR-gated, and cannot be called by external clients.

| Tool | Purpose |
|------|---------|
| `kubectl_get` | Get any namespaced K8s resource by kind/name/namespace (Secret `.data` redacted) |
| `kubectl_list` | List namespaced K8s resources with optional label selector (Secret `.data` redacted) |
| `kubectl_list_events` | List K8s events with reason/object filters |
| `af_check_existing_rr` | Check for duplicate RemediationRequest before creation |
| `af_create_rr` | Create a new RemediationRequest CRD |
