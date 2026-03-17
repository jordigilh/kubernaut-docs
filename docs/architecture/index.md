# Architecture

Deep-dive documentation for Kubernaut's internal design. Pages are ordered by the **natural remediation flow** -- from signal ingestion through effectiveness assessment.

- **[System Overview](overview.md)** — Service topology, CRD relationships, and design principles. Introduces the orchestrator pattern, CRDs as the communication backbone, and separation of concerns.
- **[Gateway](gateway.md)** — Signal ingestion, adapters, authentication, scope checking, deduplication, CRD creation. Details how signals enter the system and become RemediationRequest CRDs.
- **[Signal Processing](signal-processing.md)** — Context enrichment, severity/priority/environment classification, and signal mode. Covers enrichment, Rego-based classification, and signal mode handling.
- **[AI Analysis](ai-analysis.md)** — HolmesGPT integration, session-based async, Rego approval. Explains HolmesGPT integration, async session handling, and Rego approval gates.
- **[Investigation Pipeline](hapi-investigation.md)** — LLM investigation phases, resource context, remediation history, workflow selection, decision outcomes, approval gate. Describes the LLM investigation flow and workflow selection logic.
- **[Remediation Routing](remediation-routing.md)** — Orchestrator routing engine, phase transitions, timeout system, child CRD lifecycle, escalation. Covers orchestration, phase state machine, and escalation behavior.
- **[Workflow Selection](workflow-selection.md)** — Catalog query, label matching, confidence scoring. Details how workflows are queried, matched, and scored for selection.
- **[Workflow Execution](workflow-execution.md)** — Tekton and Job executors, dependency resolution, cooldown, deterministic locking. Explains executors, dependency resolution, and locking semantics.
- **[Effectiveness Assessment](effectiveness.md)** — Timing model, propagation delays, health scoring. Describes how Kubernaut determines whether a remediation succeeded.
- **[Notification Pipeline](notification.md)** — Delivery orchestration, routing resolution, retry/circuit breaker, channel implementations. Covers delivery flow, routing, and channel behavior.
- **[Async Propagation](async-propagation.md)** — GitOps and operator delay model. Explains how Kubernaut handles GitOps and operator propagation delays.
- **[Audit Pipeline](audit-pipeline.md)** — Buffered store, batching, per-service events, operator attribution. Details the audit store, batching, and event attribution.
- **[Data Persistence](data-persistence.md)** — PostgreSQL schema, partitioning, retention, reconstruction. Covers the PostgreSQL schema, partitioning strategy, and data lifecycle.
- **[AIOps Remediation Landscape](aiops-landscape.md)** — Comparison of rule-based, predictive AI, and generative AI approaches to AIOps remediation. Covers predictive AI as a knowledge-based agent for the LLM, hallucination safeguards via cross-validation, and integration architecture.
