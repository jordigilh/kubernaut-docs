# Why Kubernaut

## The Problem

When something breaks in a Kubernetes cluster — a pod crashlooping, a certificate expired, resources exhausted — an operator gets paged. They open a terminal, check alerts, read logs, correlate events with metrics, form a hypothesis, and execute a fix. If it doesn't work, they try something else.

This process depends on tribal knowledge, runbooks that drift out of date, and human availability. Mean time to resolution (MTTR) is measured in tens of minutes to hours. The same class of incidents recurs, and the response is manual every time.

Rule-based remediation tools improve this for **known, deterministic problems**. "If pod restarts exceed 5, delete it." "If memory exceeds 90%, scale up." They're fast, predictable, and easy to audit. But they can only match symptoms to predefined actions — they don't investigate *why* something is happening.

When the same symptom has multiple root causes, or the right fix depends on context the rule can't see, rule-based tools either pick the wrong action or do nothing.

### Depth of Kubernetes Remediation

Most remediation tools operate at the **surface level** — they detect a symptom and apply a static rule. Kubernaut goes deeper:

| Depth | What happens | Who typically does this |
|---|---|---|
| **Surface** | Alert fires, symptom detected | Monitoring tools |
| **Triage** | Classify severity, deduplicate, route | Rule-based automation |
| **Investigation** | Read logs, correlate events, inspect resources, check metrics, trace owner chains | SRE (manual) or Kubernaut Agent (automated) |
| **Root-Cause Analysis** | Identify *why* it happened, not just *what* happened | Senior SRE or Kubernaut Agent with 36 inspection tools |
| **Remediation** | Select and execute the right fix from a catalog | Kubernaut workflow engine |
| **Verification** | Confirm the fix worked — alert resolved, no drift, health score | Kubernaut Effectiveness Monitor |
| **Learning** | Feed outcomes back so the same mistake isn't repeated | Kubernaut remediation history |

<div style="max-width:100%;overflow-x:auto;margin:1.5rem 0">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 480" style="width:100%;height:auto" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" aria-label="Depth of Kubernetes Remediation as an iceberg diagram">
  <defs>
    <clipPath id="kn-ice-z1" clipPathUnits="userSpaceOnUse">
      <polygon points="190,40 240,180 140,180"/>
    </clipPath>
    <clipPath id="kn-ice-z2" clipPathUnits="userSpaceOnUse">
      <polygon points="140,180 240,180 261.429,240 118.571,240"/>
    </clipPath>
    <clipPath id="kn-ice-z3" clipPathUnits="userSpaceOnUse">
      <polygon points="118.571,240 261.429,240 300.714,350 79.286,350"/>
    </clipPath>
    <clipPath id="kn-ice-z4" clipPathUnits="userSpaceOnUse">
      <polygon points="79.286,350 300.714,350 340,460 40,460"/>
    </clipPath>
  </defs>
  <rect width="860" height="480" fill="#FFFFFF"/>
  <g clip-path="url(#kn-ice-z1)">
    <rect x="0" y="0" width="860" height="480" fill="#0891B2" fill-opacity="0.08"/>
  </g>
  <g clip-path="url(#kn-ice-z2)">
    <rect x="0" y="0" width="860" height="480" fill="#0891B2" fill-opacity="0.12"/>
  </g>
  <g clip-path="url(#kn-ice-z3)">
    <rect x="0" y="0" width="860" height="480" fill="#0F172A" fill-opacity="0.06"/>
  </g>
  <g clip-path="url(#kn-ice-z4)">
    <rect x="0" y="0" width="860" height="480" fill="#0F172A" fill-opacity="0.12"/>
  </g>
  <polygon points="190,40 340,460 40,460" fill="none" stroke="#94A3B8" stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="24" y1="240" x2="376" y2="240" stroke="#64748B" stroke-width="1.5" stroke-dasharray="8 6"/>
  <text x="448" y="266" font-size="10" font-style="italic" fill="#64748B">waterline &#x2014; what the market covers today</text>
  <rect x="380" y="40" width="4" height="140" fill="#64748B" rx="1"/>
  <text x="392" y="56" font-size="14" font-weight="700" fill="#0F172A">1. Signal Intake</text>
  <text x="392" y="76" font-size="11" fill="#334155">AlertManager webhooks, K8s Events, Rego</text>
  <text x="392" y="91" font-size="11" fill="#334155">classification, fingerprint dedup</text>
  <text x="392" y="112" font-size="10" font-style="italic" fill="#64748B">Industry standard &#x2014; every monitoring</text>
  <text x="392" y="126" font-size="10" font-style="italic" fill="#64748B">platform does this</text>
  <rect x="380" y="180" width="4" height="60" fill="#64748B" rx="1"/>
  <text x="392" y="194" font-size="14" font-weight="700" fill="#0F172A">2. Investigation</text>
  <text x="392" y="211" font-size="11" fill="#334155">LLM + 36 client-go tools, Prometheus</text>
  <text x="392" y="226" font-size="11" fill="#334155">queries, owner chain, remediation history</text>
  <text x="392" y="242" font-size="10" font-style="italic" fill="#64748B">Predictive AI covers this &#x2014; Dynatrace</text>
  <text x="392" y="252" font-size="10" font-style="italic" fill="#64748B">Davis, Datadog Watchdog</text>
  <rect x="380" y="240" width="4" height="110" fill="#0891B2" rx="1"/>
  <text x="392" y="290" font-size="14" font-weight="700" fill="#0F172A">3. Execution</text>
  <text x="392" y="308" font-size="11" fill="#334155">Tekton, K8s Jobs, Ansible &#x2014; policy-gated</text>
  <text x="392" y="323" font-size="11" fill="#334155">(OPA/Rego), declarative CRD workflows</text>
  <text x="392" y="344" font-size="10" font-weight="700" font-style="italic" fill="#0891B2">Few solutions &#x2014; no pre-approved catalog,</text>
  <text x="392" y="358" font-size="10" font-weight="700" font-style="italic" fill="#0891B2">no per-remediation approval</text>
  <rect x="380" y="350" width="4" height="110" fill="#0F172A" rx="1"/>
  <text x="392" y="376" font-size="14" font-weight="700" fill="#0F172A">4. Closing the Loop</text>
  <text x="392" y="394" font-size="11" fill="#334155">4-dimension effectiveness scoring,</text>
  <text x="392" y="409" font-size="11" fill="#334155">structured feedback loop, audit trail</text>
  <text x="392" y="430" font-size="10" font-weight="700" font-style="italic" fill="#0891B2">Kubernaut unique &#x2014; no competitor</text>
  <text x="392" y="444" font-size="10" font-weight="700" font-style="italic" fill="#0891B2">covers this</text>
</svg>
</div>

## How Kubernaut Solves It

Kubernaut turns remediation into a declarative, AI-driven, closed-loop process:

1. **Detects** the signal (Prometheus alert, Kubernetes event)
2. **Investigates** the root cause using an LLM with live `kubectl` access, logs, metrics, and remediation history
3. **Selects** a remediation workflow from a catalog based on the investigation, not a static rule
4. **Executes** the fix via Tekton Pipelines, Kubernetes Jobs, or Ansible (AWX/AAP)
5. **Verifies** the fix worked through health checks, alert resolution, and spec drift detection
6. **Notifies** the team (Slack, console, file) with the full remediation outcome and effectiveness assessment
7. **Learns** — effectiveness scores feed back into future investigations so the LLM avoids repeating what failed before

See [Architecture Overview](architecture-overview.md) for the full pipeline.

## Comparison: Rule-Based, Predictive AI, and Generative AI

The AIOps remediation landscape has three distinct approaches. Kubernaut uses generative AI but is designed to integrate with predictive AI platforms as complementary tools.

| Capability | Rule-Based | Predictive AI (Davis, Watchdog) | Kubernaut (Generative AI) |
|---|---|---|---|
| **Trigger** | Pattern match on alert name/labels | Statistical anomaly detection, baseline deviation | Same as rule-based — Prometheus alerts, K8s events |
| **Root cause analysis** | None — assumes symptom = cause | Topology-aware correlation across known dependency graphs | LLM investigates live cluster state, logs, metrics, and history |
| **Novel failure handling** | Cannot handle — no matching rule | Cannot handle — no historical baseline to correlate against | Reasons about novel situations using Kubernetes semantics and context |
| **Remediation selection** | Static mapping (if X then Y) | Triggers pre-configured runbooks | AI selects from workflow catalog based on investigation context |
| **Context awareness** | Alert labels only | Vendor telemetry (traces, metrics, topology) | Full cluster state, GitOps labels, Rego policies, business metadata |
| **Verification** | Typically fire-and-forget | Monitors recovery metrics | Closed-loop: health checks, alert resolution, spec hash comparison |
| **Learning from failure** | None — repeats the same action | Adjusts baselines over time | Effectiveness scores feed into future investigations |
| **Cold start** | None — works immediately | Weeks/months of baseline data required | None — useful from day one |
| **Latency** | Milliseconds | Seconds (pre-computed models) | 10-30s (LLM investigation) |
| **Token cost** | None | Vendor license | Per-investigation (includes LLM-driven workflow selection in the same session) |
| **Auditability** | Deterministic, easy to trace | Deterministic, vendor-specific dashboards | Full audit trail with 7-year retention (SOC2-aligned); LLM reasoning is probabilistic |
| **Vendor coupling** | Low | High — deep integration with vendor telemetry stack | Low — works with any monitoring stack |

**Where rule-based tools win**: speed, zero token cost, deterministic auditability, and simplicity for well-understood single-action problems. Kubernaut's workflow catalog uses label-based scoring to rank candidates, but the LLM drives the final selection decision in a dedicated Phase 3 session -- investigation, enrichment, and workflow selection all happen in one agent session.

**Where predictive AI fits**: anomaly detection and topology-aware correlation for known failure patterns. Rather than competing with generative AI, predictive AI platforms are most valuable as **knowledge-based agents** that the LLM can query during investigation — confirming hypotheses, providing dependency context, and boosting confidence. See [AIOps Remediation Landscape](aiops-landscape.md) for the full integration architecture.

**Where Kubernaut wins**: novel or variable failures, multi-path remediation, environments where the same alert can have different root causes, and scenarios where verification and learning matter. When integrated with predictive AI, Kubernaut can cross-validate its root cause analysis against statistical correlations — increasing confidence when they agree, and flagging discrepancies when they don't.

For a detailed comparison against specific products and platforms in the agentic remediation space, see [Agentic Remediation Market Comparison](market-comparison.md).

## Investigation Approach: Unconstrained Reasoning vs Pre-Scripted Skills

The prevailing approach in SRE automation is to encode investigation knowledge as **skills** — natural-language implementations of operational runbooks that tell the LLM exactly what commands to run, in what order, and how to interpret the results. Teams translate their existing runbooks into per-alert-type skill definitions that prescribe a fixed decision tree of investigation steps and predefined root cause categories.

A typical skill for a single alert type consists of:

- A natural-language investigation playbook derived from the team's runbook, prescribing exact steps, commands, and branching logic
- Bundled diagnostic scripts for specific platform variants
- A report template with a fixed checklist of known root causes
- Total: hundreds to nearly a thousand lines of investigation code per alert type

Skills can extend beyond investigation into remediation — orchestration skills chain multiple sub-skills into end-to-end workflows (e.g., validate → gather context → generate playbook → execute → verify), and the LLM can use investigation findings to inform a remediation plan. However, this means the **remediation itself is LLM-executed** — the LLM interprets the skill's instructions, generates commands, and runs them. This consumes tokens for what are fundamentally deterministic actions, and introduces the LLM's inherent non-determinism into the execution path. The same skill invoked twice may produce subtly different execution plans, command orderings, or parameter choices — an undesirable property for production remediation where repeatability matters.

Converting a runbook into a skill also does not reduce the amount of code — moderate-complexity SOPs typically expand 2-3x when translated into a structured skill (the original SOP plus report templates, reference docs, and safety constraints). Complex SOPs compress slightly but require custom diagnostic scripts that add significant engineering effort.

Kubernaut takes a fundamentally different approach: the LLM investigates **freely** using its full tool set — pod logs, events, resource state, owner chains, metrics, and remediation history. There is no pre-scripted playbook constraining which paths the investigation can follow.

### The Signal Target Problem

A critical limitation of pre-scripted skills is the assumption that the **signal target** (the resource that triggered the alert) is closely related to the **RCA target** (the actual root cause). In practice, these frequently diverge. An API availability alert fires because probes detect the API server is unreachable, but the root cause might be:

- Control plane nodes under memory pressure from an unrelated workload
- A network policy change that blocked probe traffic
- An etcd member failure caused by disk I/O saturation from a log-heavy pod on a shared node
- A DNS resolution failure triggered by a CoreDNS OOM event

A skill for this alert pre-maps a fixed set of investigation paths. If the actual root cause falls outside those predefined paths, the skill falls through to "requires further investigation" and pages a human. The skill author must anticipate every possible root cause at authoring time.

Kubernaut Agent follows the evidence wherever it leads — from the API availability alert, to slow API server response, to memory saturation on a control plane node, to a logging sidecar DaemonSet consuming excessive memory. No skill author anticipated "logging sidecar DaemonSet on control plane nodes" as a root cause for an API availability alert. But the LLM, reasoning from first principles with access to cluster state, follows the causal chain.

### Scaling Characteristics

The skill-based approach scales **linearly** — each new alert type requires a new skill, with its own investigation playbook, diagnostic scripts, and report template. Even with a **skill generator** that automates the conversion of moderate-complexity runbooks into draft skills, complex SOPs with multi-phase decision trees and cross-tool investigation resist template generation and require significant hand-crafting.

Kubernaut scales with the **LLM's reasoning capabilities** rather than with engineering headcount. Adding coverage for a new class of alerts means authoring a remediation workflow that defines the *action*, not the *investigation*. The investigation is universal — the same LLM reasoning process applies regardless of which alert fired.

Kubernaut draws a deliberate boundary: the LLM drives **investigation and workflow selection** — where reasoning, judgment, and non-determinism are strengths — but remediation is executed by **deterministic workflow executors** (Tekton pipelines and Kubernetes Jobs). The LLM selects *which* workflow to run, but the workflow itself executes the same way every time, with no token cost and no risk of deviation.

### The Long Tail

The most significant advantage is handling the **long tail** of alert types. In any production environment, the majority of alert types are infrequent — they fire a few times per month or less. Building skills for these alerts has poor ROI because the engineering cost per alert is constant regardless of frequency.

Kubernaut handles long-tail alerts with the same investigation quality as high-frequency alerts because the investigation process is universal. A skill-based system returns "no skill found" for unseen alert types and pages a human. Kubernaut investigates and may resolve the incident autonomously, even for novel failure modes.

### Agentic Injection Points (v1.7)

The strongest argument for skills is **institutional knowledge** — environment-specific tribal wisdom that isn't captured in SOPs or available in the LLM's training data. Rather than embedding this knowledge in rigid per-alert playbooks, Kubernaut's architecture defines three **agentic workflow injection points** (planned for [v1.7, Q3 2026](../whats-next/index.md#custom-agent-injection)) where operators will contribute domain-specific context without constraining the LLM's reasoning:

1. **Pre-Investigation** — Agent workflows that execute before investigation begins, contributing **context** (not instructions) such as environment-specific diagnostics, SOP knowledge, or data from external systems (CMDB, change management)
2. **Pre-Workflow Selection** — Agent workflows that influence which remediation workflows are surfaced as candidates, enabling **policy-aware remediation** (e.g., FinOps cost constraints) without hardcoding policies into workflow definitions
3. **Custom Effectiveness Probes** — Custom validation workflows to confirm whether a remediation succeeded for resources outside Kubernetes' native observability (databases, cloud services, external infrastructure)

These injection points are **multiplicative** — one pre-investigation agent for etcd diagnostics benefits all etcd alert types; one cost-optimization agent at workflow discovery applies to every remediation across the platform. Building 3 injection point workflows provides equivalent contextual enrichment to dozens of per-alert skills.

### Skills vs Kubernaut: Trade-Offs

| Aspect | Skills | Kubernaut |
|---|---|---|
| **Determinism** | Same investigation steps every time — easy to audit | LLM reasoning is probabilistic — different investigations may follow different paths |
| **Speed** | No reasoning overhead — runs commands immediately | 10-30s investigation time for LLM reasoning |
| **Novel failures** | Cannot handle — no matching playbook | Investigates from first principles |
| **Signal ≠ RCA target** | Must pre-map all possible RCA targets | Discovers RCA target dynamically |
| **Coverage scaling** | Linear with engineering effort | Scales with LLM capability |
| **Remediation execution** | LLM-executed: consumes tokens, non-deterministic | Deterministic workflow executors (Tekton/Jobs) |
| **Long tail** | No coverage without a skill | Same investigation quality for all alerts |

The determinism and speed advantages of skills are narrowing: Kubernaut's full audit pipeline records every tool call and decision, making the reasoning path reviewable. The 10-30s investigation time replaces 10-30 minutes of manual SRE work. And the pre-investigation injection point provides a structured mechanism for encoding institutional knowledge without constraining investigation.

## When to Use Kubernaut

**Good fit:**

- Incidents where the root cause varies (e.g., OOMKill could be a memory leak, a misconfigured limit, or a noisy neighbor)
- Environments with many workflow types and the right choice depends on context
- Teams that want closed-loop verification, not fire-and-forget
- Organizations that need remediation history and effectiveness tracking for compliance

**Consider simpler tools when:**

- The problem is fully deterministic with a single known fix
- Latency under 1 second is critical
- The environment is simple enough that a handful of rules covers all cases

## Safety and Trust

Kubernaut is designed for production. The question operators ask is: *"What happens when the LLM is wrong?"*

- **Human approval gates** — `RemediationApprovalRequest` CRDs pause execution until an operator approves, for any workflow that requires it
- **OPA/Rego policies** — Constrain which remediations are allowed for which resources, namespaces, or conditions
- **Blast radius controls** — Scope management via `kubernaut.ai/managed=true` labels limits which resources Kubernaut can touch
- **Cooldown periods** — Prevent rapid re-remediation of the same resource
- **Effectiveness verification** — After execution, Kubernaut checks whether the fix actually worked before marking it successful
- **Escalation** — If remediation fails or the LLM isn't confident, Kubernaut escalates to a human with the full investigation context rather than retrying blindly

See [Human Approval](../user-guide/approval.md) and [Rego Policies](../user-guide/policies.md) for configuration details.

## The Feedback Loop

Most remediation tools operate in open loop: trigger, execute, done. Kubernaut closes the loop.

After every remediation, the [effectiveness monitor](../user-guide/effectiveness.md) evaluates whether the fix worked across four dimensions: pod health, alert resolution, metrics improvement, and spec drift detection. The result is an effectiveness score attached to the remediation record.

When the same resource triggers a future alert, Kubernaut Agent receives the remediation history — including what was tried before and whether it worked. The LLM uses this to avoid repeating failed approaches and to select alternatives.

This means Kubernaut gets better at remediating a specific resource over time, without any manual tuning of rules or weights.

See [Remediation History Feedback](../use-cases/remediation-history-feedback.md) for a worked example.
