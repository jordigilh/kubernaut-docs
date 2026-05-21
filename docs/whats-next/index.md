---
hide:
  - navigation
  - toc
---

# What's Next

The features below are planned for future Kubernaut releases. For features that shipped in v1.5 (Interactive Sessions, API Frontend, MCP tool authorization), see [What's New: v1.5](../whats-new/index.md#v15).

## Backstage Console

A Backstage plugin providing an operator dashboard for investigation management, workflow oversight, and approve/reject/override controls through a web UI.

!!! example "Conceptual mockups"
    The following mockups show the planned Backstage console experience. Designs are subject to change.

### Fleet Overview

Natural language query bar for intent-driven navigation. KPI cards (active investigations, resolved, critical alerts, avg resolution time), cluster health grid, and a filtered alerts table — all driven by the operator's query.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/backstage-console-fleet.svg" alt="Backstage Console — Fleet Overview" style="width:100%">
</div>

### Investigation View

Chat-style investigation transcript showing the Kubernaut Agent's live reasoning, tool calls, and root cause analysis. Operators can follow the AI's investigation in real time and intervene when needed.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/backstage-investigation.svg" alt="Backstage Console — Investigation View" style="width:100%">
</div>

### Workflow Catalog

Searchable workflow catalog with natural language filtering, KPI metrics, and a table showing workflow status, action types, match count, and effectiveness scores.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/backstage-workflows.svg" alt="Backstage Console — Workflow Catalog" style="width:100%">
</div>

## Expanded MCP Tool Surface & A2A Protocol

!!! note "v1.5 ships the core MCP tools"
    The API Frontend and its core investigation/discovery tools (`kubernaut_investigate`, `discover_workflows`, `select_workflow`, `complete_no_action`, `stream_investigation`) shipped in v1.5. See [What's New: v1.5](../whats-new/index.md#v15). The items below are the planned expansion.

The full 20-tool MCP surface will span four domains:

- **Remediation lifecycle** — `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_approve`, `kubernaut_cancel_remediation`, `kubernaut_watch`, `kubernaut_submit_signal`
- **Investigation** — `kubernaut_start_investigation`, `kubernaut_poll_investigation`, `kubernaut_select_workflow`, `kubernaut_present_decision`
- **Data & history** — `kubernaut_list_workflows`, `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail`
- **Cluster context** — `af_list_events`, `af_get_pods`, `af_get_workloads`, `af_resolve_owner`, `af_check_existing_rr`, `af_create_rr`

A2A (Agent-to-Agent) protocol support is planned with agent card discovery at `/.well-known/agent-card.json`, ADK executor integration, and `InvestigationSession` CRDs linking A2A task IDs to remediation context.

## Declarative Recipes

SREs define reusable agentic workflows as declarative [Goose recipes](https://block.github.io/goose/docs/guides/recipes/) — YAML-based configurations that package instructions, MCP extensions, and parameters into shareable, reproducible agent behaviors. Kubernaut injects them at three pipeline points via the Goose runtime, each calling external MCP tools. Each injection point accepts multiple stacked recipes.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/recipe-injection.svg" alt="Declarative Recipes — 3 pipeline injection points" style="width:100%">
</div>

### Injection 1: Pre-Investigation (Kubernaut Agent)

Context injected into the LLM prompt before analysis begins.

**Example: `check-maintenance-window`** — Calls a CMDB MCP server to check if the resource is in a maintenance window or had recent deployments. The result is injected into the investigation context before the LLM starts. If under maintenance, alerting is skipped and the RCA is annotated as expected downtime.

### Injection 2: Pre-Workflow Selection (Kubernaut Agent)

Constraints injected to bias workflow choice.

**Example: `enforce-cost-guardrails`** — Calls a Cost/Resource MCP for budget utilization and scaling limits for the namespace. Returns constraints such as "do not select scale-up workflows", nudging the LLM toward restart/rollback over resource-intensive remediations.

### Injection 3: EM Direct Execution (via Goose)

Recipe runs via Kubernaut Agent endpoint at effectiveness assessment time.

**Example: `verify-business-slo`** — Calls an SLO/Business Metrics MCP to check p95 latency, error rate, and order throughput against SLO budget. Returns a structured pass/fail verdict with business impact data, replacing the default Kubernetes health check with SRE-defined assessment SOPs.

## Fleet Operations

Hub-and-spoke deployment using [OCM](https://open-cluster-management.io/) (Open Cluster Management) — 7 steps from alert to remediation, zero remote footprint.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/fleet-operations.svg" alt="Fleet Operations — Hub-and-spoke remediation flow" style="width:100%">
</div>

### Remediation flow

1. Remote Prometheus forwards metrics to Thanos on hub
2. Alertmanager fires alert → Kubernaut Engine triggers pipeline
3. KE obtains JWT from Keycloak for MCP investigation
4. KE calls MCP on target remote cluster for RCA investigation
5. KE obtains JWT from Keycloak for remediation execution
6. KE dispatches remediation playbook to AWX
7. AWX executes fix on target remote cluster via ephemeral SA

!!! tip "Zero persistent credentials"
    Remediation uses ephemeral ServiceAccounts with OCM-managed lifecycle — no long-lived secrets stored on remote clusters.

## Natural Language Signal Intake

Accept signals described in plain language — not just structured Prometheus alerts or Kubernetes events. Operators, chat bots, and external agents can trigger investigations by describing symptoms conversationally. Kubernaut resolves the intent (cluster, service, symptom) and opens an investigation automatically. Operators, chat bots, and external agents can trigger investigations by describing symptoms conversationally. See [Interactive Sessions](../user-guide/interactive-sessions.md) for examples.

## Observe Mode (Trust Ladder Level 2)

Building on v1.4's global dry-run mode, v1.5 adds operator dashboard visibility through the Backstage console and a guided onboarding path for new clusters.

---

!!! info "Subject to change"
    Features listed here are planned but may change. See the [Kubernaut milestones](https://github.com/jordigilh/kubernaut/milestones) for the latest status.
