# Design Decisions

This section documents the key architectural decisions made during Kubernaut's development. Only **verified-current, v1.0** decisions are published here.

## Architecture

| Decision | Summary |
|---|---|
| **ADR-001** | CRD-based microservices architecture — inter-service communication via Kubernetes Custom Resources |
| **ADR-025** | Kubernetes Executor elimination — consolidated into Workflow Execution with Tekton + Job executors |
| **ADR-030** | Service configuration via YAML ConfigMaps (not environment variables) |
| **ADR-032** | Data access layer isolation — all PostgreSQL access through DataStorage REST API |
| **ADR-034** | Unified audit table design — single `audit_events` table with JSONB payloads |
| **ADR-053** | Resource scope management — label-based opt-in with `kubernaut.ai/managed=true` |
| **ADR-057** | CRD namespace consolidation — all CRDs in `kubernaut-system` |

## AI & Analysis

| Decision | Summary |
|---|---|
| **ADR-045** | AIAnalysis–HolmesGPT API contract — session-based async integration |
| **ADR-054** | Proactive signal mode classification — reactive vs proactive handling |
| **ADR-055** | LLM-driven context enrichment — using LLM for deeper signal understanding |
| **ADR-056** | Post-RCA label computation — deriving labels from AI analysis results |
| **ADR-EM-001** | Effectiveness Monitor as CRD controller — watches EffectivenessAssessment CRDs |

## Workflows

| Decision | Summary |
|---|---|
| **DD-WORKFLOW-016** | Workflow catalog architecture — searchable catalog in DataStorage |
| **DD-WORKFLOW-017** | V1.0 workflow registration — seed-workflows Helm hook for initial catalog |

## Gateway

| Decision | Summary |
|---|---|
| **DD-GATEWAY-012** | Redis removal — deduplication via CRD Status instead of Redis |

## Notification

| Decision | Summary |
|---|---|
| **DD-INFRA-001** | Namespace consolidation — all services in `kubernaut-system` with RBAC isolation |

## Security

| Decision | Summary |
|---|---|
| **DD-AUTH-011** | Namespace architecture — single namespace with RBAC isolation per service |
| **DD-AUTH-012** | OAuth2 patterns for service authentication |

---

!!! info "Internal Decisions"
    The complete set of 350+ ADRs and Design Decisions is maintained in the [main repository](https://github.com/jordigilh/kubernaut/tree/main/docs/architecture/decisions). This page curates the subset that is most relevant for understanding the current v1.0 architecture.
