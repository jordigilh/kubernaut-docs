# Interactive Sessions

!!! warning "This page is under active development for v1.5 GA"

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

Any MCP-compatible client can connect to Kubernaut's interactive sessions. The API Frontend exposes a MCP Streamable HTTP endpoint (`POST /mcp`) with 23 `kubernaut_*` MCP tools spanning CRD operations, investigation, interactive session lifecycle, data/history, and presentation. The AF dispatches interactive lifecycle tools to the Kubernaut Agent's MCP server; other tools are handled locally or via REST/DataStorage.

### Prerequisites

- OIDC provider configured for the API Frontend (DEX, Keycloak, etc.)
- User has a `ClusterRoleBinding` to one of the [per-persona ClusterRoles](../architecture/security-rbac.md#tool-authorization-v15) (e.g., `kubernaut-tool-sre`)
- MCP client supporting Streamable HTTP transport (spec 2025-03-26)

## MCP Tools

The API Frontend exposes **23 MCP tools** on `POST /mcp`. For interactive investigation, the key tools are:

### Interactive session lifecycle

These tools are dispatched to the Kubernaut Agent's MCP server (`kubernaut_investigate` with per-action routing):

| Tool | Description |
|---|---|
| `kubernaut_investigate` | Start, resume, or join an investigation (consolidates former `start_investigation`, `poll_investigation`, `stream_investigation`, `takeover`) |
| `kubernaut_await_session` | Wait for an active investigation session to become available |
| `kubernaut_message` | Send a follow-up message in a multi-turn conversation |
| `kubernaut_complete` | Mark the investigation as complete |
| `kubernaut_cancel` | Cancel the investigation |
| `kubernaut_status` | Check the current status — returns mode (autonomous/interactive/not_found) and driver |
| `kubernaut_reconnect` | Reconnect to an existing session after a disconnect |
| `kubernaut_discover_workflows` | After RCA, run workflow discovery and return alternatives with LLM-populated parameters |

**Input schema:**

```json
{
  "rr_id": "rr-b83e19d4a7f1-5c2d09ae",
  "action": "start"
}
```

All actions require `rr_id` — the tool operates on an existing RemediationRequest. The `message` action additionally requires a `message` field for multi-turn conversation.

**Start an investigation:**

```json
{
  "rr_id": "rr-b83e19d4a7f1-5c2d09ae",
  "action": "start"
}
```

**Send a follow-up message:**

```json
{
  "rr_id": "rr-b83e19d4a7f1-5c2d09ae",
  "action": "message",
  "message": "Can you also check the memory limits on the sidecar containers?"
}
```

**Discover workflows after RCA:**

```json
{
  "rr_id": "rr-b83e19d4a7f1-5c2d09ae",
  "action": "discover_workflows"
}
```

### `kubernaut_select_workflow`

Select a workflow from the discovery results. Requires a prior `discover_workflows` call.

**Input schema:**

```json
{
  "rr_id": "rr-b83e19d4a7f1-5c2d09ae",
  "workflow_id": "rollback-config",
  "kind": "Deployment",
  "name": "checkout-service",
  "namespace": "production",
  "api_version": "apps/v1",
  "spec_hash": "a1b2c3d4",
  "incident_id": "inc-2026-0512"
}
```

Only `rr_id` and `workflow_id` are required. The remaining fields are optional — when `kind` is provided, enrichment runs (owner chain resolution, labels, history) before catalog lookup. `api_version` disambiguates Kinds that exist in multiple API groups (e.g., `Event`). `spec_hash` and `incident_id` enable correlation with prior investigations.

Parameters are validated against the workflow's declared schema. If validation fails, the LLM attempts self-correction automatically (PR #1187).

### `kubernaut_complete_no_action`

Close an investigation without selecting a workflow. Can be called at any point in the session — no discovery gate required.

**Input schema:**

```json
{
  "rr_id": "rr-b83e19d4a7f1-5c2d09ae",
  "reason": "Root cause is external — vendor API outage, not actionable by us"
}
```

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

If a client disconnects unexpectedly, the Kubernaut Agent's `SessionClosedHandler` detects the MCP connection closure and triggers session release and reconstruction (DD-INTERACTIVE-002). The same user can reconnect via `action:reconnect`.

### Pod restarts

On KA pod restart, the `LeaseSessionManager` scans for orphaned Leases (those whose holder identity no longer exists) and reclaims them. The `SessionDrainer` handles graceful shutdown — notifying connected clients and releasing all Leases before the pod terminates (BR-OPS-013).

## Autonomous vs Interactive

Kubernaut supports both modes simultaneously:

| Aspect | Autonomous | Interactive |
|---|---|---|
| **Trigger** | Alert webhook (Prometheus, K8s Event) | Operator connects via MCP |
| **Workflow selection** | LLM selects automatically | Operator chooses from alternatives via `discover_workflows` |
| **Approval** | Rego policy + RAR gate | Same Rego policy + RAR gate; operator identity is exposed via `input.identity` (user, groups), enabling policies to auto-approve trusted operators |
| **Visibility** | Post-hoc via kubectl, notifications | Real-time SSE streaming |
| **Pipeline** | Full 6-stage pipeline | Same pipeline, operator-driven at selection stage |

Both modes produce the same CRDs, audit events, and effectiveness assessments. An investigation started autonomously (from an alert) can be joined mid-flight by an operator via `kubernaut_await_session` followed by `kubernaut_reconnect`.
