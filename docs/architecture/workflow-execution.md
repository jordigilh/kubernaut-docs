# Workflow Execution

The Workflow Execution controller runs remediation workflows via **Kubernetes Jobs** or **Tekton Pipelines**, managing RBAC, parameter injection, and dependency validation.

## Execution Engines

### Kubernetes Jobs

For single-step remediations:

```mermaid
sequenceDiagram
    participant WE as WE Controller
    participant DS as DataStorage
    participant K8s as Kubernetes API

    WE->>DS: Query workflow schema
    WE->>WE: Validate dependencies
    WE->>K8s: Create Job in execution namespace
    K8s-->>WE: Job status (Running → Succeeded/Failed)
    WE->>WE: Update WorkflowExecution status
```

### Tekton Pipelines

For multi-step remediations with step ordering, retries, and artifact passing:

```mermaid
sequenceDiagram
    participant WE as WE Controller
    participant DS as DataStorage
    participant Tekton as Tekton API

    WE->>DS: Query workflow schema
    WE->>WE: Validate dependencies
    WE->>Tekton: Create PipelineRun
    Tekton-->>WE: PipelineRun status
    WE->>WE: Update WorkflowExecution status
```

## Dependency Validation

Before creating a Job or PipelineRun, the controller validates that required dependencies declared in the workflow schema exist in the execution namespace:

- **Secrets** — Credentials required by the workflow (e.g., registry credentials, API keys)
- **ConfigMaps** — Configuration files required by the workflow

If any declared dependency is missing, the WorkflowExecution fails with a descriptive error before the Job/PipelineRun is created. This prevents runtime failures from missing mounts.

## Execution Namespace and RBAC

All Jobs and PipelineRuns execute in the dedicated `kubernaut-workflows` namespace. In v1.0, they share a common ServiceAccount (`kubernaut-workflow-runner`) managed by the Workflow Execution controller. Per-workflow scoped RBAC (individual ServiceAccounts per workflow) is planned for v1.1.

## Parameter Injection

The executor injects one system variable and passes through all parameters from the workflow selection:

| Variable | Source |
|---|---|
| `TARGET_RESOURCE` | Target resource identifier from `wfe.Spec.TargetResource` (system-injected) |
| Custom parameters | All entries from `wfe.Spec.Parameters` — these come from the LLM's workflow selection (e.g., `TARGET_NAMESPACE`, `TARGET_DEPLOYMENT`, `POD_NAME`) and are defined in the workflow schema |

Custom parameters use `UPPER_SNAKE_CASE` names and are injected as environment variables into the container (for Jobs) or as Tekton params (for PipelineRuns).

## Phases

| Phase | Description |
|---|---|
| `Pending` | CRD created, awaiting execution |
| `Running` | Job or PipelineRun is active |
| `Completed` | Execution succeeded |
| `Failed` | Execution failed (dependency validation failure, Job/PipelineRun failure, or timeout) |

## Next Steps

- [Effectiveness Assessment](effectiveness.md) — Post-execution health evaluation
- [Remediation Workflows](../user-guide/workflows.md) — Writing workflow schemas
- [Remediation Routing](remediation-routing.md) — How the Orchestrator manages the lifecycle
