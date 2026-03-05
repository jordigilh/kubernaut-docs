# Architecture

Deep-dive documentation for Kubernaut's internal design.

- **[System Overview](overview.md)** — Service topology, CRD relationships, and design principles
- **[Signal Processing](signal-processing.md)** — Alert ingestion, enrichment, classification, and deduplication
- **[AI Analysis](ai-analysis.md)** — HolmesGPT integration, session-based async, Rego approval
- **[Remediation Routing](remediation-routing.md)** — Orchestrator routing engine, phase transitions, escalation
- **[Workflow Selection](workflow-selection.md)** — Catalog query, label matching, confidence scoring
- **[Workflow Execution](workflow-execution.md)** — Tekton and Job executors, RBAC, parameter injection
- **[Effectiveness Assessment](effectiveness.md)** — Timing model, propagation delays, health scoring
- **[Async Propagation](async-propagation.md)** — GitOps and operator delay model
- **[Audit Pipeline](audit-pipeline.md)** — Buffered store, batching, per-service events, operator attribution
- **[Data Persistence](data-persistence.md)** — PostgreSQL schema, partitioning, retention, reconstruction
