# Unconstrained LLM Investigation vs Pre-Scripted Skills

Kubernaut uses an **unconstrained LLM investigation model** for the investigation and root cause analysis (RCA) phase — the AI agent freely investigates cluster state, logs, metrics, and resource relationships to determine root cause, rather than following pre-scripted investigation playbooks (skills) that prescribe specific commands, branching logic, and predefined RCA outcomes.

The architectural gap is widest in this phase: a skill can only investigate what it was written to check, while Kubernaut's free reasoning follows the evidence wherever it leads — correlating across resource boundaries, subsystems, and failure domains that no single runbook anticipated.

Institutional and domain-specific knowledge that would otherwise be embedded in skills will be injected through **three agentic workflow injection points** that enrich the LLM's context without constraining its reasoning (planned for v1.7, Q3 2026).

## Context

The prevailing approach in SRE automation is to encode investigation knowledge as **skills** — natural-language implementations of operational runbooks that tell the LLM exactly what commands to run, in what order, and how to interpret the results. Teams translate their existing runbooks into per-alert-type skill definitions that prescribe a fixed decision tree of investigation steps and predefined root cause categories.

A typical skill for a single alert type consists of:

- A natural-language investigation playbook derived from the team's runbook, prescribing exact steps, commands, and branching logic
- Bundled diagnostic scripts for specific platform variants
- A report template with a fixed checklist of known root causes
- Total: hundreds to nearly a thousand lines of investigation code per alert type

Skills can extend beyond investigation into remediation — orchestration skills chain multiple sub-skills into end-to-end workflows (e.g., validate → gather context → generate playbook → execute → verify), and the LLM can use investigation findings to inform a remediation plan. However, this means the **remediation itself is LLM-executed** — the LLM interprets the skill's instructions, generates commands, and runs them. This consumes tokens for what are fundamentally deterministic actions, and introduces the LLM's inherent non-determinism into the execution path. The same skill invoked twice may produce subtly different execution plans, command orderings, or parameter choices — an undesirable property for production remediation where repeatability matters.

Converting a runbook into a skill also does not reduce the amount of code — moderate-complexity SOPs typically expand 2-3x when translated into a structured skill (the original SOP plus report templates, reference docs, and safety constraints). Complex SOPs compress slightly but require custom diagnostic scripts that add significant engineering effort.

This approach works but carries structural limitations that become apparent at scale.

## The Signal Target Problem

A critical limitation of pre-scripted skills is the assumption that the **signal target** (the resource or subsystem that triggered the alert) is closely related to the **RCA target** (the actual root cause resource).

In practice, these frequently diverge. An API availability alert fires because blackbox probes detect the API server is unreachable. But the root cause might be:

- Control plane nodes under memory pressure from an unrelated workload
- A network policy change that blocked probe traffic
- An etcd member failure caused by disk I/O saturation from a log-heavy pod on a shared node
- A DNS resolution failure triggered by a CoreDNS OOM event

A skill for this alert pre-maps a fixed set of investigation paths — typically checking the probe infrastructure, control plane node health, DNS, and a few platform-specific conditions. If the actual root cause falls outside those predefined paths, the skill falls through to "requires further investigation" and pages a human.

The skill author must anticipate every possible root cause at authoring time. The investigation is bounded by the author's imagination and experience, not by the evidence available in the cluster.

### How Kubernaut handles this

Kubernaut Agent receives the alert context and investigates freely using its full tool set — pod logs, events, resource state, owner chains, metrics, and remediation history. The investigation follows the evidence:

1. The API availability alert fires
2. The agent checks API server health — it's responding slowly
3. It checks control plane node resources — memory is saturated on one node
4. It follows the memory pressure to discover a logging sidecar consuming excessive memory on a DaemonSet running on control plane nodes
5. It identifies the DaemonSet as the root cause and selects a workflow to fix the resource limits

No skill author anticipated "logging sidecar DaemonSet on control plane nodes" as a root cause for an API availability alert. But the LLM, reasoning from first principles with access to cluster state, follows the causal chain wherever it leads.

## Predefined RCA Categories vs Dynamic Discovery

Skills predefine the set of possible root causes. A typical skill includes a "Known Issue Match" checklist — a fixed enumeration of 5-10 root cause categories the skill was designed to detect. The LLM running the skill can only arrive at conclusions within this predefined taxonomy.

This creates two failure modes:

1. **False negatives** — The actual root cause isn't in the predefined list. The skill reports "no known issue match" and escalates to a human, even though the LLM would have been capable of identifying the root cause if it were allowed to investigate freely.

2. **False positives** — The skill's branching logic matches a predefined pattern that superficially resembles the current situation but isn't the actual root cause. For example, high control plane memory triggers the "resize required" path even when the memory pressure is caused by a transient workload spike that will self-resolve.

Kubernaut's unconstrained investigation doesn't suffer from either failure mode. The LLM constructs its root cause analysis from observed evidence, not from a lookup table. It can discover novel failure modes, identify multi-factor root causes, and distinguish between superficially similar symptoms that have different underlying causes.

## Scaling Characteristics

The skill-based approach scales **linearly** — each new alert type requires a new skill, with its own investigation playbook, diagnostic scripts, and report template. In practice, a team converting runbooks into skills produces 1-2 alert-specific skills per sprint. At this rate, achieving broad coverage across hundreds or thousands of unique alert types takes years, with the hardest alerts (etcd cluster health, upgrade pipelines, operator state machines) each requiring hand-crafted investigation logic that cannot be template-generated.

Even with a **skill generator** that automates the conversion of moderate-complexity runbooks into draft skills, the approach hits a ceiling: complex SOPs with multi-phase decision trees, cross-tool investigation (cluster CLI + cloud provider CLI + platform-specific tooling), and environment-specific branching resist template generation and require significant hand-crafting. The generator accelerates the middle tier but does not change the fundamental scaling curve for the hardest and most valuable alerts.

Kubernaut's approach scales with the **LLM's reasoning capabilities** rather than with engineering headcount. Workflows define **capabilities** (what the system can do), not **procedures** (what it should do for alert X). A single set of remediation workflows (restart, rollback, scale, reconfigure) applies across many alert types. The LLM bridges the gap between "something is wrong" and "here's how to fix it" through reasoning, not lookup tables.

Adding coverage for a new class of alerts in Kubernaut means authoring a remediation workflow that defines the *action*, not the *investigation*. The investigation is universal — the same LLM reasoning process applies regardless of which alert fired. Coverage grows with the LLM's capabilities, not with engineering headcount.

Kubernaut draws a deliberate boundary: the LLM drives **investigation and workflow selection** — where reasoning, judgment, and non-determinism are strengths — but remediation is executed by **deterministic workflow executors** (Tekton pipelines and Kubernetes Jobs). The LLM selects *which* workflow to run based on its investigation, but the workflow itself executes the same way every time, with no token cost and no risk of the LLM deviating from the intended remediation plan.

## Addressing Legitimate Gaps: Agentic Injection Points

The strongest argument for skills is **institutional knowledge** — environment-specific tribal wisdom that isn't captured in SOPs or available in the LLM's training data. For example: "On this platform, always check the banned-user pull-secret before investigating operator logs for this alert type."

Rather than embedding this knowledge in rigid per-alert playbooks, Kubernaut's architecture defines three **agentic workflow injection points** where operators will contribute domain-specific context without constraining the LLM's reasoning. These injection points will be implemented via the [`AgenticWorkflow` CRD](../whats-next/index.md#custom-agent-injection) in **v1.7** (Q3 2026).

### 1. Pre-Investigation

Operators will define agent workflows that execute before the LLM begins its investigation. These workflows will:

- Run environment-specific diagnostic checks and attach results to the investigation context
- Frontload SOP knowledge relevant to the alert type, cluster configuration, or business unit
- Gather data from external systems (CMDB, change management, deployment records) that the LLM wouldn't otherwise have access to

The key distinction from skills: the pre-investigation workflow contributes **context**, not **instructions**. It says "here's what we already know about this environment" rather than "here's what steps to follow." The LLM then reasons freely over the enriched context.

One pre-investigation agent for a category of alerts (e.g., "etcd alerts") would gather member health, quorum status, disk I/O, and recent node events — and all alert types in that category benefit from the same enriched context. With skills, each alert type needs its own investigation playbook even when the diagnostic data is largely shared.

### 2. Pre-Workflow Selection

Operators will define agent workflows that influence which remediation workflows are surfaced as candidates during the workflow selection phase. This injection point will enable **policy-aware remediation** without hardcoding policies into workflow definitions.

**Example: cost optimization.** An organization's FinOps policy discourages increasing resource limits as a default remediation. A pre-workflow discovery agent evaluates the current resource spend, team budget, and cluster capacity — then filters out or deprioritizes "increase memory limits" workflows for non-critical workloads.

Without this injection point, the LLM sees a pod OOMing and selects the most obvious fix: scale up resources. With the cost-optimization agent, the LLM reasons from a curated set of alternatives — restart the pod, identify a memory leak, roll back to a previous image, or tune application-level settings.

This is something skills fundamentally cannot do. A skill is a fixed investigation path with no mechanism to say "based on this organization's cost posture right now, choose a different remediation strategy." You would need a separate skill per cost tier, per team, per environment. With injection points, one agent workflow applies contextually across all alert types.

### 3. Custom Effectiveness Probes

Operators will define custom validation workflows to confirm whether a remediation was successful, targeting resources outside Kubernetes' native observability.

Kubernaut already validates Kubernetes-native remediations by checking pod health, deployment status, and alert resolution. But when remediation touches external systems — databases, cloud services, infrastructure components outside the cluster — operators need custom probes to confirm the fix actually worked.

This injection point will extend Kubernaut's closed-loop verification to non-Kubernetes resources without requiring the platform to natively understand every external system. The operator's validation workflow will run, and Kubernaut will interpret the result as part of its effectiveness assessment.

## Composability: Multiplicative vs Additive

Skills are **additive** — each new skill adds coverage for one alert type. The total coverage is the sum of individual skills.

Kubernaut's injection points are **multiplicative** — each injection point will apply across all alert types:

- One pre-investigation agent for etcd diagnostics would benefit all etcd alert types (leader election, insufficient members, members down, database growth, fsync latency) — a skill-based system needs a separate skill for each, or a single large skill with branching logic for all five
- One cost-optimization agent at workflow discovery would apply to every remediation across the platform — not just etcd, not just one alert type
- One effectiveness monitoring workflow for an external database would validate remediations for any alert that touches that database

Building 3 injection point workflows would provide equivalent contextual enrichment to dozens of per-alert skills, with significantly less authoring and maintenance effort. The contrast is sharpest with high-cardinality alert families: where a skill-based approach recommends "build one shared skill with branching logic" to avoid duplicating diagnostics across related alerts, Kubernaut's investigation is inherently shared — the LLM reasons over the same cluster state regardless of which specific alert fired.

## The Long Tail

The most significant architectural advantage is handling the **long tail** of alert types. In any production environment, the majority of alert types are infrequent — they fire a few times per month or less. Building skills for these alerts has poor ROI because the engineering cost per alert is constant regardless of frequency.

Kubernaut handles long-tail alerts with the same investigation quality as high-frequency alerts because the investigation process is universal. The LLM doesn't need a pre-authored playbook to investigate an alert it has never seen before — it reads the alert context, inspects the affected resources, correlates with cluster state, and reasons about root cause from first principles.

A skill-based system returns "no skill found" for unseen alert types and pages a human. Kubernaut investigates and may resolve the incident autonomously, even for novel failure modes.

## Trade-Offs

### Where skills have advantages

| Aspect | Skills | Kubernaut |
|---|---|---|
| **Determinism** | Same investigation steps every time — easy to audit | LLM reasoning is probabilistic — different investigations may follow different paths |
| **Speed** | No reasoning overhead — runs commands immediately | 10-30s investigation time for LLM reasoning |
| **Compliance** | Deterministic playbook satisfies "we know exactly what it will do" requirements | Requires audit trail of LLM reasoning to satisfy compliance |
| **Tribal knowledge encoding** | Directly embedded in the playbook | Requires pre-investigation agent workflows to inject |

### Where Kubernaut's approach wins

| Aspect | Skills | Kubernaut |
|---|---|---|
| **Novel failures** | Cannot handle — no matching playbook | Investigates from first principles |
| **Cross-domain correlation** | Limited to what the skill author included | Follows evidence across resource boundaries |
| **Signal ≠ RCA target** | Must pre-map all possible RCA targets | Discovers RCA target dynamically |
| **Maintenance** | One playbook per alert type, updated per SOP change | Remediation workflows are alert-agnostic |
| **Coverage scaling** | Linear with engineering effort | Scales with LLM capability |
| **Remediation execution** | LLM-executed: consumes tokens for deterministic actions, non-deterministic output | Deterministic workflow executors (Tekton/Jobs): LLM selects, executor runs |
| **Policy-aware remediation** | Requires per-policy skill variants | One injection point applies globally |
| **Long tail** | No coverage without a skill | Same investigation quality for all alerts |

### Narrowing gaps

The determinism and speed advantages of skills are narrowing:

- **Determinism**: Kubernaut's full audit pipeline records every tool call, observation, and decision the LLM makes during investigation. The reasoning path is logged and reviewable, even if it varies between investigations.
- **Speed**: The 10-30s investigation time includes root cause analysis, workflow selection, and context gathering — work that a human SRE would spend 10-30 minutes on. The absolute latency is acceptable for incident response.
- **Tribal knowledge**: The pre-investigation injection point provides a structured mechanism for encoding institutional knowledge without constraining investigation. As LLMs improve at reasoning from context, the gap between "knowledge embedded in a playbook" and "knowledge provided as context" continues to shrink.

## Conclusion

Skills solve a real problem — encoding investigation knowledge so that incidents can be handled consistently and quickly. But they solve it by constraining the LLM to a pre-authored decision tree, which limits the system to known failure modes and known investigation paths.

Kubernaut's unconstrained investigation model, augmented by agentic injection points for institutional knowledge, achieves broader coverage with less engineering effort, handles novel failures, discovers root causes that skills cannot anticipate, and scales with LLM capabilities rather than with engineering headcount.

The architectural choice is between building **automation that uses an LLM as a script runner** and building **an LLM-native system that uses automation as a capability**. Kubernaut chooses the latter.
