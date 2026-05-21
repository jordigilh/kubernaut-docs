# Interactive Sessions

!!! warning "This page is under active development for v1.5 GA"

Interactive MCP sessions let operators and AI agents connect to Kubernaut for real-time investigation, workflow discovery, and remediation steering. This is an alternative to the fully autonomous pipeline — operators stay in the loop and make decisions at key points.

## Overview

The interactive flow has four phases:

```
  Investigate → Discover Workflows → Select Workflow → Watch Effectiveness
```

1. **Investigate** — Connect to Kubernaut and start (or join) an investigation. The LLM performs root cause analysis with full Kubernetes tool access while streaming findings in real time.
2. **Discover Workflows** — After RCA, Kubernaut presents matching workflows with LLM-populated parameters. Operators review the options.
3. **Select Workflow** — Operator selects a workflow (or decides no action is needed). Parameters can be reviewed and edited before execution.
4. **Watch Effectiveness** — After execution, the effectiveness assessment runs and results are streamed back.

## Connecting via MCP

Any MCP-compatible client can connect to Kubernaut's interactive sessions. The API Frontend handles authentication (OIDC/OAuth2) and authorization (SAR-based).

### Prerequisites

- OIDC provider configured (e.g., DEX)
- User has a `ClusterRoleBinding` to one of the [tool-level ClusterRoles](../architecture/security-rbac.md#tool-authorization-v15)
- MCP client capable of SSE streaming

## MCP Tools

### `kubernaut_investigate`

The primary investigation tool with four actions:

| Action | Description |
|---|---|
| `start` | Start a new investigation for a signal or resource |
| `reconnect` | Reconnect to an existing in-progress investigation |
| `status` | Check the current status of an investigation |
| `complete` | Mark an investigation as complete |

**Start a new investigation:**

```json
{
  "action": "start",
  "signal_name": "PodCrashLoopBackOff",
  "namespace": "production",
  "resource_kind": "Deployment",
  "resource_name": "checkout-service"
}
```

**Join a running investigation:**

```json
{
  "action": "reconnect",
  "session_id": "sess-a1b2c3d4"
}
```

### `discover_workflows`

After root cause analysis, returns matching workflows with parameters pre-populated by the LLM:

```json
{
  "alternatives": [
    {
      "workflow_id": "restart-and-patch-memory",
      "description": "Bump memory limit to 768Mi + rolling restart",
      "confidence": 0.91,
      "risk": "low",
      "parameters": {
        "memory_limit": "768Mi",
        "target_deployment": "checkout-service"
      }
    },
    {
      "workflow_id": "rollback-config",
      "description": "Revert ConfigMap to pre-incident version",
      "confidence": 0.85,
      "risk": "low",
      "parameters": {
        "configmap_name": "checkout-config",
        "target_revision": "v42"
      }
    }
  ]
}
```

### `select_workflow`

Select a workflow from the discovery results:

```json
{
  "workflow_id": "rollback-config",
  "parameters": {
    "configmap_name": "checkout-config",
    "target_revision": "v42"
  }
}
```

Parameters are validated against the workflow's declared schema. If validation fails, the LLM attempts self-correction automatically.

### `complete_no_action`

If no workflow is suitable, the operator can close the investigation without remediation:

```json
{
  "reason": "Root cause is external — vendor API outage, not actionable by us"
}
```

### `stream_investigation`

Subscribe to a real-time SSE stream of investigation progress:

- Token-by-token LLM output
- Tool call events (which Kubernetes resources are being inspected)
- Phase transitions (RCA complete, discovery started, etc.)
- Keepalive pings to maintain the connection

## Session Management

### Session lifecycle

Each interactive session is backed by a Kubernetes Lease for distributed locking:

1. **Start** — A Lease is created in `kubernaut-system`; the session is bound to the authenticated user
2. **Active** — The Lease is renewed periodically; investigation proceeds
3. **Reconnect** — The same user can reconnect to their session after a disconnect
4. **Takeover** — A different user connecting causes the original session to be abandoned (SEC-TAKEOVER-001)
5. **Complete** — The session Lease is released

### Disconnect handling

If a client disconnects unexpectedly:

- The session remains active for the duration of `session.disconnectTTL` (default: 10m)
- The same user can reconnect within this window using `action:reconnect`
- After the TTL expires, the session is cleaned up

### Pod restarts

On KA pod restart, orphaned Leases (from the previous pod) are automatically reclaimed. In-progress investigations are not lost — clients reconnect to the new pod transparently.

## Autonomous vs Interactive

Kubernaut supports both modes simultaneously:

| Aspect | Autonomous | Interactive |
|---|---|---|
| **Trigger** | Alert webhook (Prometheus, K8s Event) | Operator connects via MCP |
| **Workflow selection** | LLM selects automatically | Operator chooses from alternatives |
| **Approval** | Rego policy + RAR gate | Operator's selection is the approval |
| **Visibility** | Post-hoc via kubectl, notifications | Real-time SSE streaming |
| **Pipeline** | Full 6-stage pipeline | Same pipeline, operator-driven at selection stage |

Both modes produce the same CRDs, audit events, and effectiveness assessments. An investigation started autonomously (from an alert) can be joined mid-flight by an operator via `action:reconnect`.
