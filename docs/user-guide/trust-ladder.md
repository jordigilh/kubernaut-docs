# Building Confidence with Kubernaut

Operators rarely hand full control of cluster remediation to an AI on day one. Kubernaut provides an incremental **Trust Ladder** — a four-stage graduation path that lets teams build confidence at their own pace, starting with full human oversight and progressing toward autonomous remediation as trust grows.

## The Trust Ladder

<div style="max-width:100%;overflow-x:auto;margin:1.5rem 0">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 320" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" style="width:100%;height:auto">
  <rect width="820" height="320" fill="white"/>

  <!-- Title -->
  <text x="24" y="28" font-size="14" font-weight="700" fill="#0F172A" letter-spacing="0.5">Trust Ladder</text>
  <text x="24" y="46" font-size="10" fill="#64748B">Build confidence incrementally — from full human oversight to autonomous remediation.</text>

  <!-- L1: Observe (shortest — 120px tall) -->
  <rect x="16" y="180" width="186" height="120" rx="6" fill="white" stroke="#E5E7EB"/>
  <rect x="16" y="180" width="186" height="4" rx="3" fill="#DC2626"/>
  <text x="28" y="204" font-size="13" font-weight="700" fill="#0F172A">Observe</text>
  <text x="28" y="220" font-size="9" fill="#64748B">Global dry-run mode. Kubernaut</text>
  <text x="28" y="232" font-size="9" fill="#64748B">investigates and selects workflows</text>
  <text x="28" y="244" font-size="9" fill="#64748B">but does not execute. Operators</text>
  <text x="28" y="256" font-size="9" fill="#64748B">review RCA and selections via</text>
  <text x="28" y="268" font-size="9" fill="#64748B">audit events and notifications.</text>

  <!-- L2: Approve (160px tall) -->
  <rect x="214" y="140" width="186" height="160" rx="6" fill="white" stroke="#E5E7EB"/>
  <rect x="214" y="140" width="186" height="4" rx="3" fill="#DC2626"/>
  <text x="226" y="164" font-size="13" font-weight="700" fill="#0F172A">Approve</text>
  <text x="226" y="180" font-size="9" fill="#64748B">Rego policy gates remediation.</text>
  <text x="226" y="192" font-size="9" fill="#64748B">Human approves, rejects, or</text>
  <text x="226" y="204" font-size="9" fill="#64748B">overrides the AI-selected</text>
  <text x="226" y="216" font-size="9" fill="#64748B">workflow via RAR. Shadow agent</text>
  <text x="226" y="228" font-size="9" fill="#64748B">alignment provides an additional</text>
  <text x="226" y="240" font-size="9" fill="#64748B">safety layer independent of</text>
  <text x="226" y="252" font-size="9" fill="#64748B">the trust stage.</text>

  <!-- L3: Security & Autonomy (200px tall) -->
  <rect x="412" y="100" width="186" height="200" rx="6" fill="white" stroke="#E5E7EB"/>
  <rect x="412" y="100" width="186" height="4" rx="3" fill="#DC2626"/>
  <text x="424" y="124" font-size="13" font-weight="700" fill="#0F172A">Security &amp; Autonomy</text>
  <text x="424" y="140" font-size="9" fill="#64748B">SAR-based tool authorization</text>
  <text x="424" y="152" font-size="9" fill="#64748B">with 6 per-persona ClusterRoles.</text>
  <text x="424" y="164" font-size="9" fill="#64748B">Interactive MCP sessions for</text>
  <text x="424" y="176" font-size="9" fill="#64748B">operator-in-the-loop investigation</text>
  <text x="424" y="188" font-size="9" fill="#64748B">and workflow discovery. A2A</text>
  <text x="424" y="200" font-size="9" fill="#64748B">protocol for external agent</text>
  <text x="424" y="212" font-size="9" fill="#64748B">delegation. API Frontend as the</text>
  <text x="424" y="224" font-size="9" fill="#64748B">unified external protocol layer.</text>

  <!-- L4: Full Autonomy (240px tall) -->
  <rect x="610" y="60" width="194" height="240" rx="6" fill="white" stroke="#E5E7EB"/>
  <rect x="610" y="60" width="194" height="4" rx="3" fill="#DC2626"/>
  <text x="622" y="84" font-size="13" font-weight="700" fill="#0F172A">Full Autonomy</text>
  <text x="622" y="100" font-size="9" fill="#64748B">Matched workflows execute</text>
  <text x="622" y="112" font-size="9" fill="#64748B">without human intervention.</text>
  <text x="622" y="124" font-size="9" fill="#64748B">Effectiveness Monitor verifies</text>
  <text x="622" y="136" font-size="9" fill="#64748B">fixes and feeds scores back</text>
  <text x="622" y="148" font-size="9" fill="#64748B">into future investigations.</text>
  <text x="622" y="166" font-size="9" fill="#64748B">Operators monitor outcomes</text>
  <text x="622" y="178" font-size="9" fill="#64748B">via notifications, dashboards,</text>
  <text x="622" y="190" font-size="9" fill="#64748B">and Effectiveness Monitor</text>
  <text x="622" y="202" font-size="9" fill="#64748B">metrics. Rollback to Approve</text>
  <text x="622" y="214" font-size="9" fill="#64748B">at any time by updating the</text>
  <text x="622" y="226" font-size="9" fill="#64748B">Rego policy — no pod restart.</text>

  <!-- Arrows connecting the levels -->
  <line x1="202" y1="250" x2="214" y2="230" stroke="#D1D5DB" stroke-width="1.3" marker-end="url(#tl-arrow)"/>
  <line x1="400" y1="210" x2="412" y2="190" stroke="#D1D5DB" stroke-width="1.3" marker-end="url(#tl-arrow)"/>
  <line x1="598" y1="190" x2="610" y2="170" stroke="#D1D5DB" stroke-width="1.3" marker-end="url(#tl-arrow)"/>

  <defs>
    <marker id="tl-arrow" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0, 7 2.5, 0 5" fill="#D1D5DB"/>
    </marker>
  </defs>
</svg>
</div>

| Level | Name | Description |
|---|---|---|
| **1** | **Observe** | Operator sees what Kubernaut *would* do — no execution (global dry-run) |
| **2** | **Approve** | Rego policy gates remediation via RAR — operator approves/rejects/overrides |
| **3** | **Security & Autonomy** | SAR-based tool authorization, per-persona ClusterRoles, interactive MCP sessions, A2A delegation |
| **4** | **Full Autonomy** | Matched workflows execute without human intervention |

At every level, operators can connect via **[Interactive MCP Sessions](interactive-sessions.md)** (v1.5) for real-time investigation and workflow selection.

Operators typically start at Stage 1 (observe) or Stage 2 (approve) and graduate individual workflows or entire namespaces to Stage 4 as they gain confidence in Kubernaut's decision-making.

---

## Stage 2: Approve (Available Now) {: #stage-2-approve }

At this level, the Rego approval policy determines which remediations require human review. When `require_approval` evaluates to `true`, a **RemediationApprovalRequest (RAR)** is created before execution. The operator reviews Kubernaut's recommendation — the selected workflow, confidence score, root cause analysis, and detected infrastructure labels — and either approves or rejects it.

### How it works

1. Alert arrives → Signal Processing enriches it → Kubernaut Agent investigates root cause
2. Kubernaut Agent selects a workflow with a confidence score
3. The [Rego approval policy](approval.md) evaluates the selection and creates a **RAR** if approval is needed
4. Operator receives a notification with the full RCA and proposed remediation
5. Operator **approves** (execution proceeds), **rejects** (remediation stops), or **overrides** (substitutes workflow parameters via `WorkflowOverride`)
6. If no action is taken within the configured timeout, the RAR expires (default: **15 minutes**, configurable via `spec.requiredBy`)

### Configuration

The approval gate is controlled by the Rego policy deployed in the `aianalysis-policies` ConfigMap. The Helm chart does not ship a default policy — operators must supply one via `aianalysis.policies.content` or `aianalysis.policies.existingConfigMap`.

A typical starter policy requires approval for:

- **Production namespaces** (case-insensitive)
- **Sensitive resource kinds** (Node, StatefulSet)
- **Missing remediation targets** (safety net)
- **Low-confidence selections** (below `aianalysis.rego.confidenceThreshold`, default **0.8**)

Non-production namespaces with a valid remediation target and high confidence auto-approve.

To **require approval for everything** (strictest Stage 3), replace the default policy with:

```rego
package aianalysis.approval

default require_approval := true
```

To adjust the confidence threshold for approval:

```yaml
# Helm values
aianalysis:
  rego:
    confidenceThreshold: "0.9"  # Require approval below 90% confidence (default: 0.8)
```

### Operator workflow overrides (v1.4)

When approving a RAR, operators can substitute the AI-selected workflow or adjust its parameters via `status.workflowOverride`. Override requests are validated by the authwebhook and recorded in the audit trail. See [Operator Workflow Overrides](approval.md#operator-workflow-overrides-v14) for details.

### Alignment gate (v1.4)

When shadow-agent alignment is enabled, Kubernaut runs a secondary AI evaluation to verify the primary agent's recommendation. If alignment fails, the pipeline creates a **ManualReviewRequired** notification and stops execution — even if the Rego policy would have auto-approved. This provides an additional safety layer independent of the trust stage.

### Graduation signals

You're ready to graduate a workflow to Stage 4 when:

- The Effectiveness Monitor consistently scores remediations as successful (`Full` assessment reason with high weighted scores)
- You've approved the same workflow type multiple times without rejecting
- The workflow targets non-sensitive resources in well-understood namespaces
- Your team is comfortable with the workflow's blast radius

### References

- [Human Approval](approval.md) — full RAR lifecycle, Rego policy evaluation, and operator actions
- [AIAnalysis Approval Policy](configmap-approval.md) — ConfigMap reference and default behavior
- [Rego Policies](policies.md) — approval policy input fields and rules

---

## Stage 4: Full Autonomy (Available Now) {: #stage-4-automate }

At this level, matched workflows execute without human intervention. The operator monitors outcomes via notifications and Effectiveness Monitor dashboards.

### How it works

1. Alert arrives → Signal Processing → Kubernaut Agent → workflow selected
2. Rego policy evaluates and **does not require approval** (auto-approved)
3. Workflow executes immediately
4. Operator receives completion/failure notifications
5. Effectiveness Monitor verifies the fix worked (health checks, alert resolution, spec hash comparison, metrics)
6. Effectiveness scores feed back into future investigations

### Configuration

Auto-approval happens when the Rego policy returns `require_approval := false`. With the default policy, this occurs for:

- Non-production namespaces (`staging`, `development`, `qa`, `test`)
- Non-sensitive resource kinds (anything other than Node/StatefulSet)
- Valid remediation target present

To allow **specific production workflows** to run autonomously, customize the Rego policy:

```rego
package aianalysis.approval

import rego.v1

default require_approval := true

require_approval := false if {
    not is_production
}

require_approval := false if {
    is_production
    input.remediation_target.kind != "Node"
    input.remediation_target.kind != "StatefulSet"
    input.detected_labels["workflow_name"] in trusted_production_workflows
}

trusted_production_workflows := {
    "crashloop-rollback-v1",
    "restart-pod-v1",
    "increase-memory-limits-v1",
}

is_production if {
    lower(input.environment) == "production"
}
```

### Monitoring autonomous remediations

At Stage 4, monitoring replaces manual review:

| Signal | What to watch | Where |
|---|---|---|
| **Effectiveness scores** | Consistent `Full` assessments with high scores | Effectiveness Monitor metrics, audit events |
| **Notification volume** | Sudden spike may indicate oscillation | Notification metrics (`kubernaut_notification_reconciler_active`) |
| **Circuit breaker state** | Channel health degradation | `kubernaut_notification_channel_circuit_breaker_state` |
| **Assessment reasons** | `Expired`, `MetricsTimedOut`, or `Unrecoverable` indicate infrastructure issues | `kubernaut_effectivenessmonitor_assessments_completed_total` |
| **ManualReviewRequired** | Remediation needs human attention | Notification pipeline (ManualReview NRs) |

### Rollback to Stage 3

To move a workflow (or all workflows) back to Stage 3, update the Rego policy to require approval. Changes to the policy ConfigMap take effect on the next remediation cycle — no pod restart required.

### References

- [Effectiveness Monitoring](effectiveness.md) — how Kubernaut verifies fixes
- [Monitoring](../operations/monitoring.md) — Prometheus metrics for all services
- [Notification Channels](notifications.md) — configuring alerts for autonomous operations

---

## Stage 1: Observe (Available — v1.4) {: #stage-1-observe }

At this level, Kubernaut runs the full pipeline through AI Analysis — investigating root cause and selecting a workflow — but **stops before execution**. No `WorkflowExecution`, `RemediationApprovalRequest`, or `EffectivenessAssessment` CRDs are created. The `RemediationRequest` completes with outcome **`DryRun`**.

### How it works

1. Alert arrives → Signal Processing enriches it → Kubernaut Agent investigates root cause
2. Kubernaut Agent selects a workflow with a confidence score
3. Pipeline **stops** — the RR completes with outcome `DryRun`
4. A `dryRunHoldPeriod` is set on the RR to suppress re-triggering for the same signal fingerprint (default: 1 hour)
5. Operator reviews the RCA and selected workflow via audit events or notifications

### Configuration

Enable dry-run mode in the Remediation Orchestrator config:

```yaml
# remediationorchestrator-config ConfigMap
remediationOrchestrator:
  dryRun: true
  dryRunHoldPeriod: "1h"  # minimum: 5m
```

- **`dryRun`** — When `true`, the pipeline stops after AI Analysis. Default: `false`.
- **`dryRunHoldPeriod`** — Duration to suppress new RR creation for the same signal fingerprint after a dry-run completion. Minimum: `5m`. Default: `1h`.

**Goal:** Understand Kubernaut's decision-making without any risk. This is the recommended starting point for new installations.

---

## Stage 3: Security & Autonomy (v1.5) {: #stage-3-security-autonomy }

At this level, organizations layer **SAR-based tool authorization** and **interactive MCP sessions** on top of the existing approval gate, establishing fine-grained control over who can do what and enabling operator-in-the-loop investigation.

### What v1.5 adds

- **SAR-based tool authorization** — Kubernetes-native SubjectAccessReview replaces file-based RBAC. Six per-persona ClusterRoles control which tools each group can invoke. See [Security & RBAC: Tool Authorization](../architecture/security-rbac.md#tool-authorization-v15).
- **Interactive MCP sessions** — Operators connect via MCP for real-time investigation, workflow discovery with LLM-populated parameters, and guided remediation. See [Interactive Sessions](interactive-sessions.md).
- **Session takeover security** (SEC-TAKEOVER-001) — Identity-aware session management prevents privilege confusion during takeover.

### Configuration

SAR authorization is configured via the API Frontend's `rbac.personas` values. Bind per-persona ClusterRoles to OIDC groups:

```yaml
apifrontend:
  config:
    rbac:
      sarCacheTTL: 30s
      personas:
        sre: [kubernaut_list_remediations, kubernaut_get_remediation, ...]
        cicd: [kubernaut_list_remediations, kubernaut_get_remediation, kubernaut_watch]
```

See the [Helm values reference](../user-guide/configuration.md#api-frontend-v15) for the full persona-to-tool mapping.

**Goal:** Establish enterprise-grade security boundaries while enabling operator-AI collaboration.

---

## Suggestions: Always-On Safety Net (Planned — v1.5) {: #suggestions }

!!! note "Not yet available"
    The Suggestions feature depends on [kubernaut#115](https://github.com/jordigilh/kubernaut/issues/115), planned for v1.5.

When no workflow matches an alert — at **any** trust stage — Kubernaut will suggest step-by-step remediation actions via an LLM-generated Suggestion RAR. This is orthogonal to the trust ladder and operates as a permanent safety net for unknown scenarios.

**Planned capabilities:**

- LLM-generated remediation steps when no catalog workflow matches
- Natural language investigation via MCP/A2A protocols to refine the suggestion
- Option to convert a validated suggestion into a new registered workflow

**Goal:** Novel incidents become automated workflows through operator-AI collaboration. The workflow library grows organically.

---

## Recommended Adoption Path

For teams new to Kubernaut, we recommend the following progression:

| Phase | Timeline | What to do |
|---|---|---|
| **Week 1** | Observe | Install with `dryRun: true` (Stage 1). Kubernaut investigates and selects workflows but does not execute. Review RCAs and workflow selections via audit events. |
| **Week 2–3** | Approve | Disable dry-run, deploy a Rego approval policy (Stage 3). Production remediations require human approval; non-production auto-approves based on your policy. |
| **Week 3–4** | Validate | Review RAR decisions. Check Effectiveness Monitor scores. Build familiarity with Kubernaut's recommendations. |
| **Month 2** | Graduate non-prod | Confirm non-production workflows are consistently effective. Monitor autonomous execution. |
| **Month 2–3** | Graduate prod workflows | Customize the Rego policy to auto-approve specific, well-validated production workflows (e.g., `crashloop-rollback-v1`). |
| **Month 3+** | Expand | Add new workflow types in Stage 3 (approval). Graduate to Stage 4 as confidence grows. |

---

## Agentic Enhancements {: #agentic-enhancements }

v1.5 introduced agentic integration features that enhance every trust stage:

| Feature | Status | Enhancement |
|---|---|---|
| **MCP Interactive Mode** ([#703](https://github.com/jordigilh/kubernaut/issues/703)) | **Shipped (v1.5)** | Operators investigate and review remediations through any MCP-compatible chat interface |
| **A2A Protocol** | **Shipped (v1.5)** | External AI agents can delegate remediation to Kubernaut via `POST /a2a/invoke` |
| **SAR Tool Authorization** (PR #1222) | **Shipped (v1.5)** | Kubernetes-native per-persona tool authorization with 6 ClusterRoles |
| **Kubernaut Console** | **Planned** | Web dashboard with chat UI, live remediation streaming, and workflow management |
| **Natural Language Investigation** | **Planned** | Trigger investigations by describing the problem in plain text |

These features are **complementary** to the Trust Ladder — they enhance how operators interact at each stage (e.g., MCP chat during dry-run review at Stage 1, Console dashboards for monitoring at Stage 4) without changing the fundamental graduation model.
