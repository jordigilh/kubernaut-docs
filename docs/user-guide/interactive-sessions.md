# Interactive Sessions

Interactive MCP sessions let operators and AI agents connect to Kubernaut for real-time investigation, workflow discovery, and remediation steering. This is an alternative to the fully autonomous pipeline — operators stay in the loop and make decisions at key points.

## Overview

The interactive flow has four phases:

```
  Investigate → Discover Workflows → Select Workflow → Watch Effectiveness
```

1. **Investigate** — Connect to Kubernaut and start (or join) an investigation. The LLM performs root cause analysis with full Kubernetes tool access while streaming findings in real time via SSE.
2. **Discover Workflows** — After RCA, Kubernaut presents matching workflows with LLM-populated parameters. Operators review the options.
3. **Select Workflow** — Operator selects a workflow (or decides no action is needed). Parameters can be reviewed and edited before execution.
4. **Watch Effectiveness** — After execution, the AF watches the RemediationRequest CRD and relays phase transitions back to the user.

## Connecting via MCP

Any MCP-compatible client can connect to Kubernaut's interactive sessions. The API Frontend exposes a MCP Streamable HTTP endpoint (`POST /mcp`) with 23 `kubernaut_*` MCP tools spanning CRD operations, investigation, interactive session lifecycle, data/history, and presentation. The AF dispatches interactive lifecycle and workflow-discovery tools to the Kubernaut Agent's MCP server (v1.6: `kubernaut_list_workflows` is KA-backed, not DataStorage-backed, per DD-WORKFLOW-019); other tools are handled locally or via DataStorage.

### Prerequisites

- OIDC provider configured for the API Frontend (DEX, Keycloak, etc.)
- User has a `ClusterRoleBinding` to one of the [per-persona ClusterRoles](../architecture/security-rbac.md#tool-authorization-v15) (e.g., `kubernaut-tool-sre`)
- MCP client supporting Streamable HTTP transport (spec 2025-03-26)

## MCP Tools

The API Frontend exposes **23 MCP tools** on `POST /mcp`. For interactive investigation, the key tools are:

### Interactive session lifecycle

The AF decomposes the Kubernaut Agent's single `kubernaut_investigate` tool (which uses an `action` parameter internally) into separate MCP tools. Each tool below has its own input schema and is individually SAR-gated.

| Tool | Description |
|---|---|
| `kubernaut_investigate` | Start a new investigation — by existing RR (`rr_id`) or by creating one (`api_version` + `namespace` + `kind` + `name`) |
| `kubernaut_await_session` | Wait for an active investigation session to become ready |
| `kubernaut_message` | Send a follow-up message in a multi-turn conversation |
| `kubernaut_complete` | Mark the investigation as complete (maps to KA `action=complete`) |
| `kubernaut_cancel` | Cancel the investigation |
| `kubernaut_status` | Check the current status — returns mode (`autonomous` / `interactive` / `not_found`) and driver |
| `kubernaut_reconnect` | Reconnect to an existing session after a disconnect |
| `kubernaut_discover_workflows` | After RCA, discover matching workflows with LLM-populated parameters |

### `kubernaut_investigate`

Start an interactive investigation. Provide either an existing RR name **or** target resource coordinates to create a new RR + InvestigationSession:

**Existing RR:**

```json
{
  "rr_id": "oom-fix-abc"
}
```

**New RR (creates RR + IS):**

```json
{
  "api_version": "apps/v1",
  "namespace": "production",
  "kind": "Deployment",
  "name": "checkout-service"
}
```

### `kubernaut_message`

Send a follow-up message in an active session:

```json
{
  "rr_id": "oom-fix-abc",
  "message": "Can you also check the memory limits on the sidecar containers?"
}
```

### `kubernaut_complete` / `kubernaut_cancel` / `kubernaut_status` / `kubernaut_reconnect`

All four tools share the same input schema:

```json
{
  "rr_id": "oom-fix-abc"
}
```

`kubernaut_complete` closes the investigation with an RCA summary. If no workflow is needed, use `kubernaut_complete_no_action` instead.

### `kubernaut_complete_no_action` (v1.5.1)

Closes the investigation without selecting a workflow. Two behavior paths:

- **Dismiss** (no `escalation_reason`): the investigation completes with `IsActionable=false`. The RR transitions to `completed_no_action`.
- **Escalate** (with `escalation_reason`): sets `HumanReviewNeeded=true` and `HumanReviewReason=operator_escalation`. The Remediation Orchestrator creates a `ManualReviewRequired` and sends a notification to the `ops-escalation-channel`.

This tool is available on the **MCP bridge only** (DD-AF-007) -- it is not registered in the A2A agent's tool list. The Kubernaut Console uses it for its dismiss and escalation buttons.

### `kubernaut_discover_workflows`

Discover available workflows after RCA:

```json
{
  "rr_id": "oom-fix-abc"
}
```

### `kubernaut_select_workflow`

Select a workflow from the discovery results. Requires a prior `kubernaut_discover_workflows` call.

**Input schema:**

```json
{
  "rr_id": "oom-fix-abc",
  "workflow_id": "rollback-config",
  "kind": "Deployment",
  "name": "checkout-service",
  "namespace": "production",
  "parameters": {
    "rollback_revision": "3"
  }
}
```

Only `rr_id` and `workflow_id` are required. When `kind` is provided, enrichment runs (owner chain resolution, labels, history) before catalog lookup. `parameters` passes workflow-specific key-value pairs validated against the workflow's declared schema.

## SSE Streaming

Real-time investigation output is available via the Kubernaut Agent's SSE endpoint:

```
GET /api/v1/incident/session/{session_id}/stream
```

The API Frontend subscribes to this stream and relays events to MCP clients. Events include token-by-token LLM output, tool call notifications, and phase transitions.

## Session Management

Interactive sessions are managed by the **Kubernaut Agent's MCP layer** using Kubernetes Leases for distributed locking.

### Session lifecycle

Each interactive session is backed by a Kubernetes Lease (prefix: `kubernaut-interactive-`) in the `kubernaut-system` namespace:

1. **Start** — A Lease is created; the session is bound to the authenticated user
2. **Active** — The session is renewed periodically; investigation proceeds
3. **Message** — Multi-turn conversation within the active session
4. **Reconnect** — The same user can reconnect after a disconnect
5. **Join** — A different user connecting via `kubernaut_investigate` causes the original session to transition (DD-INTERACTIVE-002)
6. **Complete/Cancel** — The session Lease is released

### Session limits and timeouts

| Setting | Default | Description |
|---|---|---|
| Session TTL | 30 minutes | Maximum session duration before auto-expiry |
| Inactivity timeout | Configurable | Session expires after period of no activity |
| Max concurrent sessions | Configurable | Rejects new sessions when capacity is exhausted (SEC-03) |

### Disconnect handling

If a client disconnects unexpectedly, the Kubernaut Agent's `SessionClosedHandler` detects the MCP connection closure and triggers session release and reconstruction (DD-INTERACTIVE-002). The same user can reconnect via `kubernaut_reconnect`.

### Pod restarts

On KA pod restart, the `LeaseSessionManager` scans for orphaned Leases (those whose holder identity no longer exists) and reclaims them. The `SessionDrainer` handles graceful shutdown — notifying connected clients and releasing all Leases before the pod terminates (BR-OPS-013).

## Autonomous vs Interactive

Kubernaut supports both modes simultaneously:

| Aspect | Autonomous | Interactive |
|---|---|---|
| **Trigger** | Alert webhook (Prometheus, K8s Event) | Operator starts on demand or joins an autonomous session via MCP |
| **Workflow selection** | LLM selects automatically | Operator chooses from alternatives via `discover_workflows` |
| **Approval** | Rego policy + RAR gate | Same Rego policy + RAR gate; operator identity is exposed via `input.identity` (user, groups), enabling policies to auto-approve trusted operators |
| **Visibility** | Post-hoc via kubectl, notifications | Real-time SSE streaming |
| **Pipeline** | Full 6-stage pipeline | Same pipeline, operator-driven at selection stage |

Both modes produce the same CRDs, audit events, and effectiveness assessments. An investigation started autonomously (from an alert) can be joined mid-flight by an operator via `kubernaut_investigate` — the KA upgrades the running session to interactive **in-place** (Jump-In, #1390), preserving all LLM context from the autonomous RCA phase. See [Jump-In session upgrade](../architecture/apifrontend.md#jump-in) for details.

!!! note "Interactive-Autonomous parity (#1377)"
    As of v1.5.0, the interactive and autonomous pipelines share the same KA tool set, enrichment pipeline, and scoring logic. The KA agent uses the same `kubernaut_investigate` tool internally for both modes — the only difference is whether the AF or an alert webhook initiates the investigation, and whether a `leaseHolder` is set on the `InvestigationSession`.
