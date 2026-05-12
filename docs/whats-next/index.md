# What's Next

Kubernaut v1.5 is the next major milestone, focused on agentic architecture and interactive sessions. The features below are in active development.

## Interactive Sessions

Conversational RAR enabling operators to interact with Kubernaut Agent during approval review. Live investigation streaming and cancellation. Planned clients include an OCP Console Plugin, Slack bot, and kubectl plugin.

## Backstage Console

Rebranded from RHDH Console. Provides an operator dashboard for investigation management, workflow oversight, and approve/reject/override controls through a web UI integrated with Backstage.

## MCP & A2A Integration

MCP (Model Context Protocol) server exposing Kubernaut capabilities as tools: `kubernaut_investigate`, `kubernaut_enrich`, `kubernaut_select_workflow`, `kubernaut_watch`. A2A (Agent-to-Agent) protocol for delegating tasks between AI agents. Unified API Frontend service acts as the MCP/A2A gateway.

## Declarative Recipes

Goose runtime with MCP injection points for composing multi-step remediation recipes declaratively. Enables complex remediation workflows without custom code.

## Fleet Operations

Hub-and-spoke model using ACM (Advanced Cluster Management) for managing Kubernaut across multiple clusters from a central hub.

## Natural Language Signal Intake

Accept signals described in plain language — not just structured Prometheus alerts or Kubernetes events. Enables operators, chat bots, and external agents to trigger investigations by describing symptoms in natural language.

## Dry-run / Observe Mode

Trust Ladder Level 1: see what Kubernaut would do without executing any remediation. Provides a safe onboarding path for new clusters.

---

!!! info "Subject to change"
    Features listed here are planned but may change. See the [Kubernaut milestones](https://github.com/jordigilh/kubernaut/milestones) for the latest status.
