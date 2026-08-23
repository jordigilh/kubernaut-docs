---
hide:
  - navigation
  - toc
---

# What's Next

The features below are planned for future Kubernaut releases. For features that shipped in v1.5, see [What's New: v1.5](../whats-new/index.md#v15). For features that shipped in v1.5.1 (Kubernaut Console, per-phase LLM routing, multi-provider JWT, severity triage LLM, SSE status endpoint), see [What's New: v1.5.1](../whats-new/index.md#v151). For Fleet Management, the `AgentSession` CRD, the v1alpha2 Operator CRD, and the LLM provider rewrite shipped in v1.6, see [What's New: v1.6](../whats-new/index.md#v16).

!!! info "Fleet's shipped design differs from the earlier ACM/OCM plan below"
    The Fleet Operations concept previously outlined here (hub-and-spoke via raw ACM/OCM, direct AWX playbook dispatch, per-hop Keycloak JWTs) was **superseded** by the [Fleet Management architecture](../architecture/fleet.md) that actually shipped in v1.6: a pluggable scope backend (FMC or ACM Search) plus an MCP Gateway (Kuadrant/Envoy AI Gateway) for cluster-transparent tool access, with OAuth2 client-credentials auth and no remote Ansible/AWX support. See [What's New: v1.6](../whats-new/index.md#v16) for what shipped.

## Next up

### ServiceNow Incident Triage

Consume ServiceNow incidents as signals through the API Frontend, enabling Kubernaut to investigate and remediate ITSM tickets alongside Kubernetes alerts ([#1338](https://github.com/jordigilh/kubernaut/issues/1338)). Design work is underway ([ADR-063](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/ADR-063-servicenow-signal-integration.md), [DD-INT-020](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/DD-INT-020-servicenow-signal-target-type.md)); no implementation has landed as of v1.6.

### Fleet backend expansion

Rancher and Clusterpedia as additional pluggable scope backends alongside the FMC and ACM Search backends that shipped in v1.6 — see [Fleet Management: Pluggable scope backend](../architecture/fleet.md).

---

## Future

### Pluggable Investigation Agent Harness

!!! info "Evolves the earlier Custom Agent Injection concept"
    The three-injection-point structure below is unchanged, but the mechanism behind the first two points has changed: **Pre-Investigation** and **Pre-Workflow Selection** move from declarative Goose-recipe context injection to hosting fully pluggable custom agents. **EM Direct Execution** (effectiveness probes) is unaffected and remains Goose-recipe-based.

Kubernaut Agent's investigation loop (RCA and workflow discovery) is currently a bespoke Go implementation (`internal/kubernautagent/investigator/`). [Issue #1740](https://github.com/jordigilh/kubernaut/issues/1740) and its accompanying [PR #1742](https://github.com/jordigilh/kubernaut/pull/1742) propose making this harness **pluggable**: Kubernaut defines the contract (inputs, tools, output schema, audit hooks), and operators choose the runtime — the current Go agent remains the default. A validated spike using a NousResearch Hermes-based harness correctly identified root cause and prior revision history on a real OpenShift cluster, with no hallucination, in 74 seconds. This proposal is in draft, pending maintainer review — not yet approved.

This pluggability is what lets the **Pre-Investigation** and **Pre-Workflow Selection** injection points host fully custom investigation and workflow-discovery agents, rather than recipe-driven context injection into one generalist agent. It's also the architectural prerequisite for a further step: **[signal-type-to-agent dispatch](https://github.com/jordigilh/kubernaut/issues/2266)** — routing each investigation to a dedicated agent instance selected by its signal type or pillar. This is what would let Kubernaut's already-proposed multi-pillar vision — [Threat Remediation](https://github.com/jordigilh/kubernaut/issues/554), Cost Optimization (#555), and [Compliance Continuous Remediation](https://github.com/jordigilh/kubernaut/issues/669) — plug in a domain-tuned investigation agent per pillar (e.g., a Falco/Trivy-aware agent for threat signals) instead of forcing every signal type through one RCA loop, extending Kubernaut past Kubernetes alerts.

#### Injection 3: EM Direct Execution (via Goose) — unchanged

Recipe runs via Kubernaut Agent endpoint at effectiveness assessment time.

**Example: `verify-business-slo`** — Calls an SLO/Business Metrics MCP to check p95 latency, error rate, and order throughput against SLO budget. Returns a structured pass/fail verdict with business impact data, replacing the default Kubernetes health check with SRE-defined assessment SOPs.

---

!!! success "Shipped in v1.6"
    **Fleet Management** — multi-cluster investigation and remediation via a pluggable scope backend (FMC/ACM Search) and MCP Gateway. See [What's New: v1.6](../whats-new/index.md#v16).

!!! success "Shipped in v1.5.1"
    **Kubernaut Console** — Web UI for interactive investigation and remediation. See [What's New: v1.5.1](../whats-new/index.md#v151).

!!! info "Subject to change"
    Features listed here are planned but may change. See the [Kubernaut milestones](https://github.com/jordigilh/kubernaut/milestones) for the latest status. For the full roadmap including Collective Intelligence and Operational Expansion (cost, security, non-K8s), see [ROADMAP.md](https://github.com/jordigilh/kubernaut/blob/main/docs/roadmap/ROADMAP.md).
