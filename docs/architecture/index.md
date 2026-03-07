# Architecture

Deep-dive documentation for Kubernaut's internal design. Pages are ordered by the **natural remediation flow** -- from signal ingestion through effectiveness assessment.

- **[System Overview](overview.md)** — Service topology, CRD relationships, and design principles
- **[Gateway](gateway.md)** — Signal ingestion, adapters, authentication, scope checking, deduplication, CRD creation
- **[Signal Processing](signal-processing.md)** — Context enrichment, severity/priority/environment classification, and signal mode
- **[AI Analysis](ai-analysis.md)** — HolmesGPT integration, session-based async, Rego approval
- **[Investigation Pipeline](hapi-investigation.md)** — LLM investigation phases, resource context, remediation history, workflow selection, decision outcomes, approval gate
- **[Remediation Routing](remediation-routing.md)** — Orchestrator routing engine, phase transitions, timeout system, child CRD lifecycle, escalation
- **[Workflow Selection](workflow-selection.md)** — Catalog query, label matching, confidence scoring
- **[Workflow Execution](workflow-execution.md)** — Tekton and Job executors, dependency resolution, cooldown, deterministic locking
- **[Effectiveness Assessment](effectiveness.md)** — Timing model, propagation delays, health scoring
- **[Notification Pipeline](notification.md)** — Delivery orchestration, routing resolution, retry/circuit breaker, channel implementations
- **[Async Propagation](async-propagation.md)** — GitOps and operator delay model
- **[Audit Pipeline](audit-pipeline.md)** — Buffered store, batching, per-service events, operator attribution
- **[Data Persistence](data-persistence.md)** — PostgreSQL schema, partitioning, retention, reconstruction
