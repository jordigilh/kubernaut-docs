# User Guide

Learn how to operate Kubernaut and get the most out of automated remediation.

- **[Core Concepts](concepts.md)** — The data model, service roles, and remediation lifecycle
- **[Signals & Alert Routing](signals.md)** — How alerts reach Kubernaut and how scope is managed
- **[Remediation Workflows](workflows.md)** — Writing, building, and registering workflow schemas, action types, lifecycle management, and scoring
- **[Rego Policies](policies.md)** — Signal classification policies (severity, priority, environment) and AI Analysis approval gates
- **[Notification Channels](notifications.md)** — Configuring console, file, log, and Slack notification channels with routing and credentials
- **[Human Approval](approval.md)** — Approval gates, confidence thresholds, and the approval flow
- **[Effectiveness Monitoring](effectiveness.md)** — How Kubernaut evaluates whether a fix worked
- **[Audit & Observability](audit-and-observability.md)** — Audit trails, event types, and compliance
- **[Data Lifecycle](data-lifecycle.md)** — CRD retention, PostgreSQL persistence, and reconstruction
- **[Configuration Reference](configuration.md)** — Namespace labels, signal source RBAC, LLM provider setup, timeouts, TLS, hot-reload, and all Helm values
