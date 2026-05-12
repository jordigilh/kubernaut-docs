# What's New

This page summarises the notable changes in each Kubernaut release.
Kubernaut does not support in-place upgrades — each release is a fresh install.
Review the changes below to understand what differs from the version you are currently running.

---

## v1.3

### Kubernaut Agent (formerly HolmesGPT)

The LLM integration component has been renamed from **HolmesGPT / HAPI** to **Kubernaut Agent** across all services, Helm values, ConfigMaps, and documentation.

| Before (v1.2) | After (v1.3) |
|---|---|
| `holmesgptApi.*` Helm values | `kubernautAgent.*` |
| `holmesgpt-sdk-config` ConfigMap | `kubernaut-agent-sdk-config` |
| `holmesgpt-config` ConfigMap | `kubernaut-agent-config` |

### Two-invocation investigation architecture

The investigation pipeline has been redesigned from a single three-phase LLM session (v1.1/v1.2) into **two independent LLM invocations**:

1. **Invocation 1 — Root Cause Analysis**: A full tool-access session that performs live Kubernetes inspection and produces a structured RCA result.
2. **Invocation 2 — Workflow Selection**: A separate session with no memory of Invocation 1, receiving only structured context fields. Selects a workflow or reports that none is applicable.

This separation improves reliability and makes each invocation independently testable.

### mTLS and three-port model

All inter-service communication can now be secured with **mutual TLS**. Each service exposes three ports:

- **HTTPS serving port** — mTLS-protected API traffic
- **Health port** — plaintext liveness/readiness probes
- **Metrics port** — plaintext Prometheus scrape target

Certificate rotation is handled automatically when `tls.mode: hook` is set, or delegated to cert-manager.

### SDK config hot-reload

The Kubernaut Agent SDK config (LLM model, endpoint, API key, toolset settings) now supports **hot-reload** via `fsnotify`. Active investigations pin a config snapshot at session start, so in-flight work is unaffected. Provider-level settings (`llm.provider`, OAuth2 credentials) still require a pod restart.

### Expanded LLM provider support

The Kubernaut Agent now supports **Vertex AI, OpenAI, Anthropic, Bedrock, Ollama**, and additional providers via **LangChainGo**.

### Trust Ladder

New operator guide documenting a four-level graduation path for building automation confidence:

| Level | Name | Description |
|---|---|---|
| 1 | Observe | See what Kubernaut *would* do — no execution (planned for v1.5) |
| 2 | Selective Trust | Trusted workflows execute; new ones go through review (planned for v1.5) |
| 3 | **Approve** | All matched workflows proposed via RAR — operator approves or rejects |
| 4 | **Automate** | Matched workflows execute without human intervention |

### Effectiveness Monitor improvements

- `maxConcurrentReconciles` for parallel EA processing
- Configurable `connectionTimeout`, `prometheusLookback`, and `scrapeInterval`
- Clarified stabilization window semantics (EM-internal vs RO-configured `EA.spec`)

### Notification coverage

Block reasons and terminal failure states now produce notifications (BR-ORCH-036), closing gaps where operators were not informed of remediation failures.

### Data persistence

Comprehensive schema documentation rewritten from the live v1.3 database, including enrichment tables, metric baselines, and updated entity-relationship diagrams.

### Feature enrichments and metrics

New documentation for feature enrichment pipeline stages and the notification metrics design decision (DD-METRICS-001).

---

## v1.2

### Per-workflow ServiceAccount and RBAC

Each workflow execution now runs under its own **ServiceAccount** with a dedicated **TokenRequest**. This replaces the shared SA model from v1.1 and provides fine-grained RBAC isolation per remediation workflow.

### Declarative workflow catalog

The workflow catalog has moved from OCI-containerized workflow bundles to **declarative `RemediationWorkflow` CRDs** with category and label-based matching plus confidence scoring.

### Effectiveness and notification pipeline

Updated effectiveness assessment configuration, notification routing semantics, and EM config key alignment.

### DataStorage, audit, and monitoring

Updated data access patterns, audit event documentation, and monitoring metric names.

### Signal Processing and Gateway

Rego policy entrypoint corrections, gateway label contract updates, and HAPI Tier-1 semantics fixes.

---

## v1.1

Initial documented release of Kubernaut.

- CRD-based microservices architecture with the full six-stage remediation pipeline
- Prometheus AlertManager and Kubernetes Event ingestion
- LLM-powered root cause analysis with Kubernetes inspection tools
- Remediation execution via Kubernetes Jobs, Tekton Pipelines, or Ansible (AWX/AAP)
- Effectiveness assessment with four-dimensional scoring
- Human approval gates via RemediationApprovalRequest CRDs
- Rego-based policy evaluation for signal processing and approval
- Multichannel notifications (Slack, PagerDuty, email, webhook)
- Full audit trail with 7-year retention and CRD reconstruction
- Demo content seeding via `demoContent.enabled`
- Alert decay detection (DD-EM-003)
- Resource lock persistence with deterministic naming (DD-WE-003)

---

## v1.0

End-of-life. No longer documented or supported.
