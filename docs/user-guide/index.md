# User Guide

Learn how to operate Kubernaut and get the most out of automated remediation.

- **[Core Concepts](concepts.md)** — The data model, service roles, and remediation lifecycle. Explains the six-stage pipeline, phase state machine, and the role of each CRD in the system.
- **[Signals & Alert Routing](signals.md)** — How alerts reach Kubernaut and how scope is managed. Details the Gateway ingestion flow, adapters, and how scope is determined for signal processing.
- **[Remediation Workflows](workflows.md)** — Writing, building, and registering workflow schemas, action types, lifecycle management, and scoring. Covers the full workflow schema model and how workflows are scored and selected.
- **[Rego Policies](policies.md)** — Signal classification policies (severity, priority, environment) and AI Analysis approval gates. Shows how to configure classification rules and AI approval thresholds.
- **[Notification Channels](notifications.md)** — Configuring console, file, log, and Slack notification channels with routing and credentials. Covers all supported channel types, routing rules, and credential management.
- **[Human Approval](approval.md)** — Approval gates, confidence thresholds, and the approval flow. Describes when approval is required and how to configure confidence thresholds.
- **[Effectiveness Monitoring](effectiveness.md)** — How Kubernaut evaluates whether a fix worked. Explains the timing model, health scoring, and how Kubernaut determines if a fix succeeded.
- **[Audit & Observability](audit-and-observability.md)** — Audit trails, event types, and compliance. Documents audit trails, event types, and compliance reporting.
- **[Data Lifecycle](data-lifecycle.md)** — CRD retention, PostgreSQL persistence, and reconstruction. Describes retention policies, PostgreSQL persistence, and data reconstruction.
- **[Configuration Reference](configuration.md)** — Namespace labels, signal source RBAC, LLM provider setup, timeouts, TLS, hot-reload, and all Helm values. Complete reference for all Helm values and service configuration.
