---
hide:
  - navigation
  - toc
---

# Kubernaut

## AIOps Platform for Intelligent Kubernetes Remediation

Kubernaut is an open-source AIOps platform that closes the loop from Kubernetes alert to automated remediation. It operates in two modes: **autonomously** — detecting signals, investigating root causes, selecting a workflow, and executing fixes end-to-end — and **interactively** — letting operators start an investigation on demand or join one already in progress via MCP or A2A, guide the agent, and steer remediation decisions in real time. Both modes share the same approval gates, OPA policies, and audit trails. When something goes wrong in your cluster (an OOMKill, a CrashLoopBackOff, node pressure), Kubernaut detects the signal, enriches it with context, sends it to an LLM-powered agent for live root cause investigation, selects a remediation workflow from a searchable catalog, and executes the fix — or escalates to a human with a full RCA when it can't.

**Mean time to resolution drops from 60 minutes to under 5**, while humans stay in control through approval gates, configurable confidence thresholds, and audit trails designed for SOC2 alignment.

---

<div class="grid cards" markdown>

-   :material-head-question:{ .lg .middle } **Why Kubernaut?**

    ---

    The problem with manual remediation, how Kubernaut compares to rule-based tools, and when to use it.

    [:octicons-arrow-right-24: Why Kubernaut](getting-started/why-kubernaut.md)

-   :material-rocket-launch:{ .lg .middle } **Getting Started**

    ---

    Install Kubernaut with Helm and run your first automated remediation in under 5 minutes.

    [:octicons-arrow-right-24: Installation](getting-started/installation.md)

-   :material-shield-check:{ .lg .middle } **Trust Ladder**

    ---

    Build confidence incrementally — from approval gates to full autonomous remediation, at your own pace.

    [:octicons-arrow-right-24: Building Confidence](user-guide/trust-ladder.md)

-   :material-book-open-variant:{ .lg .middle } **User Guide**

    ---

    Learn core concepts — signals, workflows, approval gates, effectiveness monitoring, and audit trails.

    [:octicons-arrow-right-24: Core Concepts](user-guide/concepts.md)

-   :material-sitemap:{ .lg .middle } **Architecture**

    ---

    Understand the 11-service microservices architecture, CRD communication patterns, and data flows.

    [:octicons-arrow-right-24: Architecture Overview](getting-started/architecture-overview.md)

-   :material-api:{ .lg .middle } **API Reference**

    ---

    CRD specifications, DataStorage REST API, and Kubernaut Agent API reference.

    [:octicons-arrow-right-24: API Reference](api-reference/index.md)

-   :material-new-box:{ .lg .middle } **What's New in v1.5**

    ---

    API Frontend, interactive MCP sessions, SAR-based tool authorization, unified SA model, and more.

    [:octicons-arrow-right-24: Release Highlights](whats-new/index.md)

-   :material-crystal-ball:{ .lg .middle } **What's Next**

    ---

    Custom agent injection, ServiceNow ITSM integration, fleet operations, Kubernaut Console.

    [:octicons-arrow-right-24: Roadmap](whats-next/index.md)

-   :material-frequently-asked-questions:{ .lg .middle } **FAQ**

    ---

    Common questions about LLM support, safety, cost, air-gapped operation, and execution engines.

    [:octicons-arrow-right-24: FAQ](faq.md)

</div>

---

## How It Works

Kubernaut automates the entire incident response lifecycle through a CRD-native pipeline.

<div style="max-width:100%;overflow-x:auto;margin:1.5rem 0" id="pipeline-svg-wrap">
<object data="assets/images/pipeline-phases.svg" type="image/svg+xml" style="width:100%;height:auto" id="pipeline-svg" aria-label="Kubernaut Remediation Pipeline — 6 phases + interactive mode"></object>
</div>

Click a phase card above, or select a tab:

=== "1 · Signal Processing"

    **CRD:** `SignalProcessing`

    AlertManager webhooks, Kubernetes Events, and A2A/Interactive sessions (v1.5) are ingested, enriched with Kubernetes context (owner chain, namespace labels, workload metadata), and classified by OPA/Rego policies across multiple dimensions:

    - **Severity** — normalized to a standard scale (critical, high, medium, low).
    - **Environment** — inferred from namespace labels (production, staging, development).
    - **Priority** — P0–P3 based on policy evaluation.
    - **Signal mode** — reactive (active incident) or proactive (predicted issue).
    - **Business classification** — service owner, criticality, SLA requirements.

    Each signal is fingerprinted for deduplication at the Gateway before entering the pipeline.

=== "2 · AI Analysis"

    **CRD:** `AIAnalysis`

    Three-phased pipeline:

    - **Investigate** — The LLM investigates the incident using 36 built-in tools and produces a root cause analysis (RCA).
    - **Enrich** — Server-side enrichment adds historical context, detectable labels, and prior remediation outcomes.
    - **Select** — Using the RCA and enrichment data, the LLM selects a workflow from the existing user-created `RemediationWorkflow` catalog.

    **Kubernaut Agent** — The AI Analysis phase is powered by the Kubernaut Agent (KA), which drives both autonomous and interactive investigations:

    - **Autonomous** — KA runs LLM-driven investigation with 36 native Go tools, performs server-side enrichment, and selects the best-matching workflow without operator involvement.
    - **Interactive (v1.5)** — When an operator connects via the API Frontend, KA manages Lease-based sessions with SSE streaming of investigation events. The operator guides workflow selection through the AF's MCP/A2A tools while KA handles the underlying investigation and enrichment.

=== "3 · Approval"

    **CRD:** `RemediationApprovalRequest`

    Policy-gated safety checkpoint:

    - **Auto-approve** low-risk actions based on OPA/Rego policies and confidence thresholds.
    - **Operator notified** via Slack, Teams, or PagerDuty for higher-risk remediations.
    - **Operator overrides** allow substituting workflow parameters via the `WorkflowOverride` CRD, with authwebhook validation and full audit trail.

=== "4 · Execution"

    **CRD:** `WorkflowExecution`

    Three execution engines:

    - **Tekton Pipelines** — cloud-native CI/CD pipelines for complex multi-step workflows.
    - **Kubernetes Jobs** — lightweight, single-task remediation actions.
    - **Ansible (AWX/AAP)** — infrastructure-level remediation beyond the cluster boundary.

    Each workflow runs under a dedicated ServiceAccount with short-lived TokenRequest authentication, ensuring no standing privileges.

=== "5 · Effectiveness"

    **CRD:** `EffectivenessAssessment`

    Post-remediation verification:

    - **Alert resolution** — confirms the original alert has cleared.
    - **Drift detection** — checks for spec changes after the fix.
    - **Cooldown monitoring** — watches for alert recurrence within a configurable window.
    - **Health scoring** — four-dimensional assessment (0–100%) combining alert status, metrics, health, and spec stability.

    Outcomes feed back into the Kubernaut Agent so the LLM avoids repeating failed remediations.

=== "6 · Notification"

    **CRD:** `NotificationRequest`

    Multi-channel delivery with full lifecycle tracking:

    - **Channels:** Slack, PagerDuty, Microsoft Teams, console, log, file.
    - **Routing:** Label-based rules with regex matching and fan-out to multiple channels.
    - **Reliability:** Circuit-breaker retry with exponential backoff per channel.
    - **Audit:** Every delivery attempt (success or failure) is recorded with correlation IDs linking back to the originating `RemediationRequest`.

=== "API Frontend (v1.5)"

    **CRD:** `InvestigationSession` &nbsp; **Services:** API Frontend ↔ Kubernaut Agent

    The interactive path is a **parallel entry point**, not a pipeline phase. The API Frontend connects to the Kubernaut Agent for a 4-phase interactive journey:

    1. **Investigate** — AF subscribes to KA's SSE stream and relays investigation events in real-time as the LLM works.
    2. **Discover** — After RCA, AF calls `kubernaut_discover_workflows` to present workflow options with LLM-populated parameters.
    3. **Select** — Operator picks a workflow via `kubernaut_select_workflow` → KA creates the `RemediationRequest`, entering the same autonomous pipeline (Approval → Execution → Effectiveness → Notification).
    4. **Watch** — AF monitors CRD status transitions and reports progress to the user until a terminal phase.

    The investigation creates an `InvestigationSession` CRD (deferred until RR creation). The same Rego approval gates apply — identity-aware policies can auto-approve trusted operators. See [Interactive Sessions](user-guide/interactive-sessions.md).

    **SAR-gated personas** — All MCP/A2A tool access is gated by SubjectAccessReview against 6 per-persona ClusterRoles:

    | Persona | MCP Tools | Tool Domains |
    |---|---|---|
    | **SRE** | 19 | **RemediationRequest:** `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_cancel_remediation`, `kubernaut_watch`, `kubernaut_await_session`, `kubernaut_approve`<br>**Investigation:** `kubernaut_investigate`<br>**Interactive:** `kubernaut_message`, `kubernaut_complete`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect`<br>**Workflow:** `kubernaut_discover_workflows`, `kubernaut_select_workflow`, `kubernaut_list_workflows`<br>**Data:** `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail`<br>**Presentation:** `kubernaut_present_decision` |
    | **AI Orchestrator** | 13 | **RemediationRequest:** `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_watch`, `kubernaut_await_session`<br>**Investigation:** `kubernaut_investigate`<br>**Interactive:** `kubernaut_message`, `kubernaut_complete`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect`<br>**Workflow:** `kubernaut_discover_workflows`, `kubernaut_select_workflow`<br>**Presentation:** `kubernaut_present_decision` |
    | **CI/CD** | 4 | **RemediationRequest:** `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_watch`, `kubernaut_await_session` |
    | **Observability** | 6 | **RemediationRequest:** `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_watch`, `kubernaut_await_session`<br>**Workflow:** `kubernaut_list_workflows`<br>**Data:** `kubernaut_get_effectiveness` |
    | **L3 Audit** | 6 | **RemediationRequest:** `kubernaut_list_remediations`, `kubernaut_get_remediation`<br>**Workflow:** `kubernaut_list_workflows`<br>**Data:** `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail` |
    | **Remediation Approver** | 7 | **RemediationApprovalRequest:** `kubernaut_list_approval_requests`, `kubernaut_get_approval_request`, `kubernaut_approve`<br>**RemediationRequest:** `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_watch`, `kubernaut_await_session` |

    See [MCP Tool Reference](api-reference/mcp-tools.md) for full tool descriptions, parameters, and response examples. See [Per-persona ClusterRoles](architecture/security-rbac.md#per-persona-clusterroles) for the RBAC reference.

---

## Key Capabilities

| Capability | Description |
|---|---|
| **Dual-Mode Operation** | **Autonomous** — end-to-end from alert to fix: investigation, workflow selection, and execution without operator involvement. **Interactive** — operators join via MCP or A2A to guide the investigation, steer workflow selection, and review remediations in real time. Both modes enforce the same approval gates and OPA policies. Operators can jump into an autonomous session mid-flight without restarting it. |
| **Multi-Source Signal Ingestion** | Prometheus alerts (reactive and proactive), Kubernetes events, fingerprint-based deduplication at the Gateway, signal mode classification |
| **AI-Powered Root Cause Analysis** | Kubernaut Agent with LLM providers (Vertex AI, OpenAI, Anthropic, Bedrock, Ollama, and more via LangChainGo), Kubernetes inspection tools, and Prometheus metrics (when enabled) |
| **Workflow Catalog** | Searchable declarative `RemediationWorkflow` CRDs with category and label-based matching plus confidence scoring |
| **Flexible Execution** | Kubernetes Jobs, Tekton Pipelines, or Ansible (AWX/AAP) |
| **Resource Scope Management** | Label-based opt-in (`kubernaut.ai/managed=true`) controls which resources Kubernaut manages |
| **Safety-First Design** | Admission webhooks, human approval gates, configurable confidence thresholds, effectiveness tracking |
| **SOC2 Alignment** | Full audit trails with 7-year retention, CRD reconstruction from audit events, operator attribution |
| **Effectiveness Tracking** | Four-dimensional assessment (health, alert resolution, metrics, spec drift) with weighted scoring; remediation history feeds into the Kubernaut Agent so the LLM avoids repeating failed remediations |

---

## Project Links

- [:fontawesome-brands-github: GitHub Repository](https://github.com/jordigilh/kubernaut)
- [:fontawesome-brands-github: Issues & Feature Requests](https://github.com/jordigilh/kubernaut/issues)
- [:fontawesome-brands-github: Discussions](https://github.com/jordigilh/kubernaut/discussions)
