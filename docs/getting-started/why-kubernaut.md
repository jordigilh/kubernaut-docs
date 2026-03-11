# Why Kubernaut

## The Problem

When something breaks in a Kubernetes cluster — a pod crashlooping, a certificate expired, resources exhausted — an operator gets paged. They open a terminal, check alerts, read logs, correlate events with metrics, form a hypothesis, and execute a fix. If it doesn't work, they try something else.

This process depends on tribal knowledge, runbooks that drift out of date, and human availability. Mean time to resolution (MTTR) is measured in tens of minutes to hours. The same class of incidents recurs, and the response is manual every time.

Rule-based remediation tools improve this for **known, deterministic problems**. "If pod restarts exceed 5, delete it." "If memory exceeds 90%, scale up." They're fast, predictable, and easy to audit. But they can only match symptoms to predefined actions — they don't investigate *why* something is happening.

When the same symptom has multiple root causes, or the right fix depends on context the rule can't see, rule-based tools either pick the wrong action or do nothing.

## How Kubernaut Solves It

Kubernaut turns remediation into a declarative, AI-driven, closed-loop process:

1. **Detects** the signal (Prometheus alert, Kubernetes event)
2. **Investigates** the root cause using an LLM with live `kubectl` access, logs, metrics, and remediation history
3. **Selects** a remediation workflow from a catalog based on the investigation, not a static rule
4. **Executes** the fix via Tekton Pipelines, Kubernetes Jobs, or Ansible (AWX/AAP)
5. **Verifies** the fix worked through health checks, alert resolution, and spec drift detection
6. **Learns** — effectiveness scores feed back into future investigations so the LLM avoids repeating what failed before

See [Architecture Overview](architecture-overview.md) for the full pipeline.

## Comparison with Rule-Based Remediation

| Capability | Rule-Based Tools | Kubernaut |
|---|---|---|
| **Trigger** | Pattern match on alert name/labels | Same — Prometheus alerts, K8s events |
| **Root cause analysis** | None — assumes symptom = cause | LLM investigates live cluster state, logs, metrics, and history |
| **Remediation selection** | Static mapping (if X then Y) | AI selects from workflow catalog based on investigation context |
| **Multiple root causes for same symptom** | Cannot differentiate | Selects different workflows based on diagnosed cause |
| **Verification** | Typically fire-and-forget | Closed-loop: health checks, alert resolution, spec hash comparison |
| **Learning from failure** | None — repeats the same action | Effectiveness scores feed into future investigations |
| **Escalation** | Alert or retry | Escalates with full RCA after configurable attempts |
| **Latency** | Milliseconds | Seconds (LLM investigation adds 10-30s) |
| **Token cost** | None | Per-investigation cost (rule-matched workflows skip LLM) |
| **Auditability** | Deterministic, easy to trace | Full audit trail with SOC2 retention, but LLM reasoning is probabilistic |

**Where rule-based tools win**: speed, zero token cost, deterministic auditability, and simplicity for well-understood single-action problems. Kubernaut supports rule-based workflows too — when signal labels match a workflow exactly, it's selected without LLM reasoning.

**Where Kubernaut wins**: novel or variable failures, multi-path remediation, environments where the same alert can have different root causes, and scenarios where verification and learning matter.

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

When the same resource triggers a future alert, HolmesGPT receives the remediation history — including what was tried before and whether it worked. The LLM uses this to avoid repeating failed approaches and to select alternatives.

This means Kubernaut gets better at remediating a specific resource over time, without any manual tuning of rules or weights.

See [Remediation History Feedback](../use-cases/remediation-history-feedback.md) for a worked example.
