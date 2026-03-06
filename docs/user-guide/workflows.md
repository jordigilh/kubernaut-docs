# Remediation Workflows

Kubernaut remediates issues by running **workflows** — containerized actions that fix known problems. Workflows are packaged as **OCI images**, stored in a searchable catalog, and matched to incidents based on labels and AI confidence scoring.

## Workflow Schema

A workflow is defined by a `workflow-schema.yaml` file at the root of an OCI image. The schema uses **camelCase** field names and follows a structured format:

```yaml
schemaVersion: "1.0"

metadata:
  workflowId: crashloop-rollback-v1
  version: "1.0.1"
  description:
    what: "Rolls back a deployment to its previous revision to recover from CrashLoopBackOff"
    whenToUse: "When a deployment enters CrashLoopBackOff after a config or image change"
    whenNotToUse: "When the crash is caused by an external dependency failure"
    preconditions: "The deployment has at least one previous healthy revision"

actionType: RollbackDeployment

labels:
  signalName: KubePodCrashLooping
  severity: [critical, low]
  environment: [production, staging, "*"]
  component: "*"
  priority: "*"

execution:
  engine: job
  bundle: quay.io/kubernaut-cicd/test-workflows/crashloop-rollback-job@sha256:64338763a1f7...

parameters:
  - name: TARGET_NAMESPACE
    type: string
    required: true
    description: "Namespace of the affected deployment"
  - name: TARGET_DEPLOYMENT
    type: string
    required: true
    description: "Name of the deployment to roll back"
```

### Required Fields

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | string | Must be `"1.0"` |
| `metadata.workflowId` | string | Unique workflow identifier (e.g., `crashloop-rollback-v1`) |
| `metadata.version` | string | Semantic version |
| `metadata.description.what` | string | What the workflow does |
| `metadata.description.whenToUse` | string | When to apply this workflow |
| `actionType` | string | Action taxonomy type (e.g., `RestartPod`, `RollbackDeployment`, `IncreaseMemoryLimits`) |
| `labels` | object | Matching criteria (see below) |
| `execution.engine` | string | `job` (Kubernetes Job) or `tekton` (Tekton Pipeline) |
| `execution.bundle` | string | OCI image reference with `@sha256:` digest |
| `parameters` | array | At least one parameter definition |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `metadata.description.whenNotToUse` | string | When NOT to use this workflow |
| `metadata.description.preconditions` | string | Prerequisites for the workflow |
| `metadata.maintainers` | array | Maintainer contacts (`name`, `email`) |
| `detectedLabels` | object | Infrastructure requirements (HPA, PDB, StatefulSet, GitOps, etc.) |
| `customLabels` | map | Operator-defined labels |
| `dependencies` | object | Required Secrets and ConfigMaps |
| `rollbackParameters` | array | Parameters for rollback |

### Labels

Mandatory labels control when a workflow matches an incident during three-step discovery:

| Label | Type | Required | Description |
|---|---|---|---|
| `severity` | string[] | Yes | Severity levels: `critical`, `high`, `medium`, `low` |
| `environment` | string[] | Yes | Environments: `production`, `staging`, `development`, `test`, or `"*"` |
| `component` | string | Yes | Resource kind: `pod`, `deployment`, `node`, or `"*"` |
| `priority` | string | Yes | Priority: `P0`, `P1`, `P2`, `P3`, or `"*"` |
| `signalName` | string | No | Optional metadata for workflow authors. Not used for matching — the LLM selects by `actionType` (DD-WORKFLOW-016) |

Labels support:

- **Exact match** — `component: deployment`
- **Wildcard** — `component: "*"` (matches any component)
- **Multi-value** — `severity: [critical, high]` (matches either)

### Detected Labels

Optional infrastructure-awareness labels that help the AI select the right workflow for the environment:

```yaml
detectedLabels:
  hpaEnabled: "true"
  pdbProtected: "true"
  stateful: "true"
  helmManaged: "true"
  networkIsolated: "true"
  gitOpsManaged: "true"
  gitOpsTool: "flux"       # flux | argocd | "*"
  serviceMesh: "istio"     # istio | linkerd | "*"
```

### Dependencies

Workflows can declare required Secrets and ConfigMaps that must exist in the execution namespace:

```yaml
dependencies:
  secrets:
    - name: registry-credentials
  configMaps:
    - name: app-config
```

The Workflow Execution controller validates these before starting the Job/PipelineRun.

### Workflow Selection

During AI Analysis, the LLM queries the workflow catalog via DataStorage and selects a workflow based on:

1. **Label overlap** — How many labels match the enriched signal
2. **Confidence score** — The LLM's confidence that this workflow addresses the root cause
3. **Version preference** — Newer versions are preferred when multiple versions match

## Execution Engines

### Kubernetes Jobs

Single-step remediations run as Kubernetes Jobs:

```yaml
execution:
  engine: job
  bundle: quay.io/kubernaut-cicd/test-workflows/crashloop-rollback-job@sha256:64338763...
```

The Workflow Execution controller creates a Job in the execution namespace, injects parameters as environment variables, and monitors completion.

### Tekton Pipelines

Multi-step remediations use Tekton Pipelines for orchestration:

```yaml
execution:
  engine: tekton
  bundle: quay.io/kubernaut-cicd/tekton-bundles/oom-recovery:v1.0.0@sha256:abc123...
```

Tekton provides step ordering, retries, and artifact passing between steps.

## The Validate-Action-Verify Pattern

Workflows should follow the **Validate-Action-Verify** pattern:

1. **Validate** — Confirm the issue exists and the fix is applicable
2. **Action** — Apply the remediation (patch deployment, scale resources, etc.)
3. **Verify** — Check that the fix was applied correctly

This ensures workflows are idempotent and safe to retry.

## Registering Workflows

Workflows are registered by providing their **OCI schema image** to the DataStorage API:

```bash
curl -X POST http://data-storage-service.kubernaut-system.svc.cluster.local:8080/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{"schemaImage":"quay.io/kubernaut-cicd/test-workflows/crashloop-rollback-job-schema:v1.0.0"}'
```

DataStorage pulls the OCI image, extracts the `workflow-schema.yaml`, validates it, and adds it to the catalog.

Workflows can also be seeded automatically during Helm installation via the `seed-workflows` hook job, which registers all built-in workflows.

## Parameters

Parameters use `UPPER_SNAKE_CASE` names and are injected into the workflow container as environment variables:

| Parameter | Type | Description |
|---|---|---|
| `TARGET_NAMESPACE` | string | Target namespace from RemediationRequest |
| `TARGET_DEPLOYMENT` | string | Target resource name |
| `TARGET_RESOURCE` | string | Target resource identifier |
| Custom parameters | varies | Any additional parameters defined in the schema |

Each parameter supports:

- `type` — `string`, `integer`, `boolean`, or `array`
- `required` — Whether the parameter must be provided
- `default` — Default value when not provided
- `enum` — Allowed values
- `pattern` — Regex validation (string type)
- `minimum` / `maximum` — Range validation (integer type)

## Next Steps

- [Human Approval](approval.md) — When workflows require approval before execution
- [Effectiveness Monitoring](effectiveness.md) — How outcomes are evaluated
- [Architecture: Workflow Execution](../architecture/workflow-execution.md) — Deep-dive into the execution engine
