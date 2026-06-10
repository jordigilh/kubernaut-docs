---
hide:
  - navigation
  - toc
---

# What's Next

The features below are planned for future Kubernaut releases. For features that shipped in v1.5 (Interactive MCP Sessions, API Frontend, SAR-based tool authorization, severity triage pipeline), see [What's New: v1.5](../whats-new/index.md#v15).

## v1.5.x — Custom Agent Injection & ITSM (upcoming)

### Custom Agent Injection

Pluggable investigation and remediation agents via the **AgenticWorkflow CRD**, enabling operators to inject domain-specific automation into the Kubernaut pipeline ([#1242](https://github.com/jordigilh/kubernaut/issues/1242), [#883](https://github.com/jordigilh/kubernaut/issues/883), [#711](https://github.com/jordigilh/kubernaut/issues/711)).

SREs define reusable agentic workflows as declarative [Goose recipes](https://block.github.io/goose/docs/guides/recipes/) — YAML-based configurations that package instructions, MCP extensions, and parameters into shareable, reproducible agent behaviors. Kubernaut injects them at three pipeline points via the Goose runtime, each calling external MCP tools. Each injection point accepts multiple stacked recipes.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/recipe-injection.svg" alt="Declarative Recipes — 3 pipeline injection points" style="width:100%">
</div>

#### Injection 1: Pre-Investigation (Kubernaut Agent)

Context injected into the LLM prompt before analysis begins.

**Example: `check-maintenance-window`** — Calls a CMDB MCP server to check if the resource is in a maintenance window or had recent deployments. The result is injected into the investigation context before the LLM starts. If under maintenance, alerting is skipped and the RCA is annotated as expected downtime.

#### Injection 2: Pre-Workflow Selection (Kubernaut Agent)

Constraints injected to bias workflow choice.

**Example: `enforce-cost-guardrails`** — Calls a Cost/Resource MCP for budget utilization and scaling limits for the namespace. Returns constraints such as "do not select scale-up workflows", nudging the LLM toward restart/rollback over resource-intensive remediations.

#### Injection 3: EM Direct Execution (via Goose)

Recipe runs via Kubernaut Agent endpoint at effectiveness assessment time.

**Example: `verify-business-slo`** — Calls an SLO/Business Metrics MCP to check p95 latency, error rate, and order throughput against SLO budget. Returns a structured pass/fail verdict with business impact data, replacing the default Kubernetes health check with SRE-defined assessment SOPs.

### ServiceNow Incident Triage

Consume ServiceNow incidents as signals through the API Frontend, enabling Kubernaut to investigate and remediate ITSM tickets alongside Kubernetes alerts ([#1338](https://github.com/jordigilh/kubernaut/issues/1338)).

---

## v1.6 — Fleet Management (next)

### Fleet Operations

Hub-and-spoke deployment using [ACM/OCM](https://open-cluster-management.io/) (Open Cluster Management) — policy-driven remediation across fleet-scale Kubernetes environments, 7 steps from alert to remediation, zero remote footprint.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/fleet-operations.svg" alt="Fleet Operations — Hub-and-spoke remediation flow" style="width:100%">
</div>

#### Remediation flow

1. Remote Prometheus forwards metrics to Thanos on hub
2. Alertmanager fires alert → Kubernaut Engine triggers pipeline
3. KE obtains JWT from Keycloak for MCP investigation
4. KE calls MCP on target remote cluster for RCA investigation
5. KE obtains JWT from Keycloak for remediation execution
6. KE dispatches remediation playbook to AWX
7. AWX executes fix on target remote cluster via ephemeral SA

!!! tip "Zero persistent credentials"
    Remediation uses ephemeral ServiceAccounts with OCM-managed lifecycle — no long-lived secrets stored on remote clusters.

### Kubernaut Console

Web UI for interactive investigation, remediation monitoring, and workflow management.

!!! example "Conceptual mockups"
    The following mockups show the planned Kubernaut Console experience. Designs are subject to change.

#### Fleet Overview

Natural language query bar for intent-driven navigation. KPI cards (active investigations, resolved, critical alerts, avg resolution time), cluster health grid, and a filtered alerts table — all driven by the operator's query.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/backstage-console-fleet.svg" alt="Kubernaut Console — Fleet Overview" style="width:100%">
</div>

#### Investigation View

Chat-style investigation transcript showing the Kubernaut Agent's live reasoning, tool calls, and root cause analysis. Operators can follow the AI's investigation in real time and intervene when needed.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/backstage-investigation.svg" alt="Kubernaut Console — Investigation View" style="width:100%">
</div>

#### Workflow Catalog

Searchable workflow catalog with natural language filtering, KPI metrics, and a table showing workflow status, action types, match count, and effectiveness scores.

<div style="max-width:100%;overflow-x:auto;margin:1rem 0">
<img src="../assets/images/backstage-workflows.svg" alt="Kubernaut Console — Workflow Catalog" style="width:100%">
</div>

---

!!! info "Subject to change"
    Features listed here are planned but may change. See the [Kubernaut milestones](https://github.com/jordigilh/kubernaut/milestones) for the latest status. For the full roadmap including Collective Intelligence and Operational Expansion (cost, security, non-K8s), see [ROADMAP.md](https://github.com/jordigilh/kubernaut/blob/main/docs/roadmap/ROADMAP.md).
