# Frequently Asked Questions

## Does Kubernaut replace operators?

No. Kubernaut handles predictable, repeatable remediation so operators can focus on systemic issues, architecture improvements, and incident patterns that require human judgment. It reduces toil and 3am pages — it doesn't eliminate the need for people who understand the system.

When Kubernaut can't confidently remediate an issue, it escalates to a human with the full root cause analysis, remediation history, and investigation context. The operator gets a head start instead of starting from scratch.

## What LLMs does it support?

Kubernaut supports any LLM provider compatible with the OpenAI API format:

- **Google Vertex AI** (Gemini models) — used in production testing
- **OpenAI** (GPT-4, GPT-4o)
- **LiteLLM** — proxy that supports 100+ model providers (Anthropic, Azure, AWS Bedrock, local models, etc.)
- **Any OpenAI-compatible endpoint** — including locally hosted models

Configure the provider in the HolmesGPT API service. See [Configuration Reference](user-guide/configuration.md) for details.

## Is it safe for production?

Yes, with multiple layers of safety:

- **Human approval gates** — Workflows can require operator approval before execution via `RemediationApprovalRequest` CRDs
- **OPA/Rego policies** — Constrain which remediations are permitted for which resources and conditions
- **Scope management** — Only resources labeled `kubernaut.ai/managed=true` are eligible for remediation
- **Cooldown periods** — Prevent rapid re-remediation of the same resource
- **Effectiveness verification** — Post-execution checks confirm the fix actually worked
- **Escalation** — Automatic escalation to humans after configurable failure thresholds

See [Why Kubernaut — Safety and Trust](getting-started/why-kubernaut.md#safety-and-trust) for the full safety story.

## What about token cost?

LLM tokens are consumed only during the investigation phase (root cause analysis via HolmesGPT). Workflow selection from the catalog is entirely label-based — it uses weighted SQL scoring against mandatory and detected labels with no LLM invocation.

Cost depends on the LLM provider and model. A typical investigation with Gemini 1.5 Pro costs a fraction of a cent. For cost-sensitive environments, you can use smaller models or locally hosted LLMs via LiteLLM.

## Can I run it air-gapped?

Yes. Point the HolmesGPT API service at a locally hosted LLM endpoint (via LiteLLM or any OpenAI-compatible server). All other components — the CRD controllers, DataStorage, workflow execution — run entirely within the cluster with no external network dependencies.

Container images are available from `quay.io/kubernaut-ai/` and can be mirrored to an internal registry. For a complete walkthrough of mirroring images and installing on a disconnected OpenShift cluster, see the [Disconnected Installation Guide](operations/disconnected-install.md).

## What execution engines are supported?

Kubernaut supports three execution engines for remediation workflows:

| Engine | Best For |
|---|---|
| **Tekton Pipelines** | Multi-step workflows with complex DAGs, parameterized steps, and pipeline reuse |
| **Kubernetes Jobs** | Simple single-step remediations (restart, scale, delete, patch) |
| **Ansible (AWX/AAP)** | Infrastructure-level changes, GitOps operations, playbook-driven remediation |

Workflows are authored as `RemediationWorkflow` CRDs that reference the execution engine. See [Authoring Workflows](user-guide/workflow-authoring.md) for examples.

## How does it handle repeated failures?

Kubernaut has a multi-layered approach to repeated failures:

1. **Effectiveness feedback** — After each remediation, the effectiveness monitor evaluates whether it worked. Failed remediations are recorded with their effectiveness scores.
2. **History-aware investigation** — When the same resource triggers again, HolmesGPT receives the full remediation history, including what was tried and whether it worked. The LLM avoids repeating failed approaches.
3. **Alternative selection** — If the first workflow fails, the system can select a different workflow from the catalog on the next attempt.
4. **Escalation** — After configurable attempts, Kubernaut stops remediating and escalates to a human with the full context: investigation, what was tried, why it failed.
5. **NoActionRequired** — If the LLM investigation finds no active problem with the resource (e.g., the alert has resolved or the issue was transient), the remediation request is closed as NoActionRequired. This avoids unnecessary workflow execution when the signal is no longer relevant.

See [Remediation History Feedback](use-cases/remediation-history-feedback.md) for a worked example of the feedback loop in action.

## How is it different from PagerDuty / Shoreline / Datadog Workflows?

Those platforms offer runbook automation triggered by alerts — essentially managed rule-based remediation with a UI. They're effective for organizations already invested in those ecosystems.

Kubernaut differs in three ways:

1. **Root cause investigation** — It doesn't just trigger a runbook; it investigates *why* the alert fired using an LLM with live cluster access before choosing a response
2. **Kubernetes-native** — Everything is a CRD. Workflows, approval gates, effectiveness assessments — all managed with `kubectl`, Helm, and GitOps, not a proprietary control plane
3. **Closed-loop verification** — Effectiveness monitoring confirms the fix worked and feeds results back into future decisions

## What Kubernetes versions are supported?

Kubernaut requires Kubernetes v1.34 or later. It's tested with KIND for development/CI and OpenShift for production workloads.
