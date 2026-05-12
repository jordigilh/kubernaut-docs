# Notification Channels

!!! info "Architecture reference"
    For the CRD specification, delivery orchestration, and retry internals, see [Architecture: Notification Pipeline](../architecture/notification.md).

Kubernaut sends notifications at key points in the remediation lifecycle: when human approval is required, when a remediation fails, when manual review is needed, and when a remediation completes. Notifications are routed through configurable channels using an AlertManager-style routing configuration.

**Cluster context:** Message bodies include the cluster display name and UUID near the top (`Cluster: <name> (<uuid>)`) on every channel, including timeout notifications.

## Channel Overview

| Channel | Status | Description |
|---|---|---|
| **Console** | Implemented | Writes to controller-runtime log output (stdout) |
| **File** | Implemented | Writes notification JSON/YAML to files (E2E/testing) |
| **Log** | Implemented | Structured JSON Lines to stdout for log aggregation |
| **Slack** | Implemented | Sends Block Kit messages via Incoming Webhooks |
| **PagerDuty** | Implemented (v1.4) | Events API v2 delivery with circuit breaker |
| **Microsoft Teams** | Implemented (v1.4) | Adaptive Card delivery with circuit breaker |
| Email | Schema-defined | Not yet implemented |
| SMS | Schema-defined | Not yet implemented |
| Webhook | Schema-defined | Not yet implemented |

!!! tip "Workflow name enrichment"
    Notification bodies automatically resolve workflow UUIDs to human-readable workflow names (e.g., "RollbackDeployment" instead of a UUID) when the workflow exists in the catalog. If resolution fails, the original UUID is preserved. See [Architecture: Notification Enrichment](../architecture/notification.md#notification-enrichment) for details.

## Routing Configuration

Notifications are routed using a ConfigMap with an AlertManager-style `route` + `receivers` structure.

**ConfigMap:** `notification-routing-config`

When neither `notification.routing.content` nor `notification.routing.existingConfigMap` is set, the chart generates a default routing config based on Helm values:

**Default when `notification.slack.secretName` is set** (Slack + console):

```yaml
route:
  receiver: slack-and-console
receivers:
  - name: slack-and-console
    consoleConfigs:
      - enabled: true
    slackConfigs:
      - channel: "#kubernaut-alerts"
        credentialRef: slack-webhook
```

**Default when `notification.slack.secretName` is empty** (console only):

```yaml
route:
  receiver: console
receivers:
  - name: console
    consoleConfigs:
      - enabled: true
```

The catch-all receiver routes **all** notification types to the configured channels. New types added in future releases are automatically covered. Avoid matching specific types unless you intentionally want to suppress certain notifications from a channel. See [Notification Routing ConfigMap](configmap-notification.md) for the complete reference.

### Match Fields

Routes match on notification attributes:

| Match Key | Source | Example Values |
|---|---|---|
| `type` | Notification type | `Escalation`, `Simple`, `StatusUpdate`, `Approval`, `ManualReview`, `Completion` |
| `severity` | Signal severity | `critical`, `high`, `medium`, `low` |
| `priority` | Notification priority | `Critical`, `High`, `Medium`, `Low` |
| `phase` | Remediation phase | `signal-processing`, `ai-analysis`, `executing` |
| `environment` | Namespace environment | `production`, `staging`, `development` |
| `review-source` | Why review was triggered | `WorkflowResolutionFailed`, `ExhaustedRetries` |

!!! note "Match key naming"
    Routing match keys use **kebab-case** (e.g., `review-source`) in the YAML routing configuration. The [architecture reference](../architecture/notification.md#routing-attributes) documents the same attributes using their Go struct field names (e.g., `reviewSource`). Both refer to the same underlying attribute.

### Routing Logic

- **First matching route wins** (depth-first evaluation)
- Child routes are evaluated before the parent
- The **default receiver** is used when no route matches
- Routing configuration supports **hot-reload** -- changes to the ConfigMap take effect without pod restart

## Per-Channel Setup

### Console

Console delivery writes notifications to the controller log via `controller-runtime`. Enabled by default for local development.

**Helm configuration:**

```yaml
# In notification-controller-config ConfigMap
delivery:
  console:
    enabled: true
```

**Routing receiver:**

```yaml
receivers:
  - name: default-console
    consoleConfigs:
      - enabled: true
```

### File

File delivery writes the full `NotificationRequest` content to files. Primarily useful for E2E testing and debugging.

**Helm configuration:**

```yaml
delivery:
  file:
    outputDir: "/tmp/notifications"
    format: "json"     # json or yaml
    timeout: "5s"
```

Files are written atomically (temp file then rename) with the naming pattern:

```
notification-{name}-{timestamp}.{format}
```

### Log

Log delivery sends structured notifications to stdout as JSON Lines, suitable for ingestion by Loki, Elasticsearch, or similar log aggregation systems.

**Helm configuration:**

```yaml
delivery:
  log:
    enabled: true
    format: "json"    # json or text
```

**JSON output format:**

```json
{
  "timestamp": "2026-03-04T12:34:56Z",
  "notification_name": "approval-required-rr-12345",
  "notification_namespace": "kubernaut-system",
  "type": "Approval",
  "priority": "Critical",
  "subject": "Human approval required for OOMKilled remediation",
  "body": "...",
  "metadata": {"environment": "production"},
  "phase": "ai-analysis"
}
```

**Text format:** `[timestamp] namespace/name subject: body`

### Slack

Slack delivery sends Block Kit messages via Incoming Webhooks.

**Message format:**

1. **Header block** -- Priority emoji + subject (e.g., `:rotating_light: Human approval required for OOMKilled remediation`)
2. **Section block** -- Notification body (Markdown converted to Slack mrkdwn)
3. **Context block** -- `*Priority:* Critical | *Type:* Approval`

Priority emojis: Critical = :rotating_light:, High = :warning:, Medium = :information_source:, Low = :speech_balloon:

**Routing receiver:**

```yaml
receivers:
  - name: slack-alerts
    slackConfigs:
      - channel: "#kubernaut-alerts"
        credentialRef: slack-webhook     # References a mounted credential
```

| Field | Description |
|---|---|
| `channel` | Slack channel to post to |
| `credentialRef` | Name of the credential file containing the webhook URL |
| `username` | Optional bot username override |
| `iconEmoji` | Optional icon emoji override |

## Credential Management

Notification credentials (webhook URLs, API tokens) are managed via Kubernetes Secrets mounted as projected volumes.

### How It Works

1. Create a Kubernetes Secret with the credential value
2. Configure the Helm chart to project the Secret into the notification pod
3. Reference the credential name in the routing configuration

### Step-by-Step: Slack Webhook

**1. Create the Secret:**

```bash
kubectl create secret generic slack-webhook \
  --namespace kubernaut-system \
  --from-literal=webhook-url="https://hooks.slack.com/services/T.../B.../xxx"
```

**2. Configure Helm values:**

```yaml
notification:
  routing:
    content: ""  # Or provide via --set-file notification.routing.content=routing.yaml
  credentials:
    - name: slack-webhook          # Credential name (used in routing credentialRef)
      secretName: slack-webhook    # Kubernetes Secret name
      secretKey: webhook-url       # Key within the Secret
```

**3. Reference in routing:**

```yaml
receivers:
  - name: slack-alerts
    slackConfigs:
      - channel: "#kubernaut-alerts"
        credentialRef: slack-webhook   # Matches credential name above
```

### Directory Structure

Credentials are mounted at `/etc/notification/credentials/`:

```
/etc/notification/credentials/
  slack-webhook       # Contains the webhook URL
```

Each credential is a single file where the filename is the credential name and the content is the secret value.

### Hot-Reload

Credentials support hot-reload via fsnotify. When a Secret is updated, the kubelet syncs the projected volume (~60s), and the file watcher detects the change and reloads the credential cache. No pod restart required.

## Retry Policy

The notification controller uses exponential backoff with retry and circuit breaker logic. See [Architecture: Notification Pipeline](../architecture/notification.md#retry-policy) for retry defaults and error classification.

### Per-Notification Override

The retry policy can be overridden per `NotificationRequest` via the `spec.retryPolicy` field:

```yaml
spec:
  retryPolicy:
    maxAttempts: 3
    initialBackoffSeconds: 10
    backoffMultiplier: 2
    maxBackoffSeconds: 120
```

## Routing New v1.3 Notification Types

v1.3 introduces notifications for block reasons and terminal failures that were previously silent. Operators with existing routing rules should add routes for these new NR types.

### Escalation NRs (block reasons and terminal failures)

Match `type: Escalation` to capture:

- **Block-reason escalations** (`nr-block-consecutivefailures-*`, `nr-block-unmanagedresource-*`) -- persistent blocks requiring operator investigation
- **Terminal failure escalations** (`nr-escalation-*`) -- failure paths that previously had no notification

These are **High** priority. Route to your primary ops investigation channel.

```yaml
routes:
  - match:
      type: Escalation
    receiver: ops-escalation-channel
```

### StatusUpdate NRs (transient blocks)

Match `type: StatusUpdate` with `priority: Low` to capture transient block notifications (`DuplicateInProgress`, `ResourceBusy`, `RecentlyRemediated`, `ExponentialBackoff`). These are informational -- route to a low-priority channel or suppress in high-traffic environments.

```yaml
routes:
  - match:
      type: StatusUpdate
      priority: Low
    receiver: low-priority-channel
```

### ManualReview NRs by source

ManualReview NRs can be further distinguished by `review-source` to route different failure types to different teams:

| `review-source` | Meaning | Suggested action |
|---|---|---|
| `WorkflowExecution` | Execution failure | Ops investigation |
| `AIAnalysis` | AI couldn't recommend a workflow | Catalog update / workflow authoring |
| `RoutingEngine` | Repeated ineffective remediations | Root cause investigation |

```yaml
routes:
  - match:
      type: ManualReview
      review-source: WorkflowExecution
    receiver: ops-failures-channel
  - match:
      type: ManualReview
      review-source: AIAnalysis
    receiver: workflow-authors-channel
  - match:
      type: ManualReview
      review-source: RoutingEngine
    receiver: ops-escalation-channel
```

See [Notification Pipeline: NR Naming Conventions](../architecture/notification.md#nr-naming-conventions) for the complete NR naming catalog.

## Enabling Slack: End-to-End Walkthrough

1. **Create a Slack Incoming Webhook** in your workspace (Apps > Incoming Webhooks > Add to Channel)

2. **Create the Kubernetes Secret:**

    ```bash
    kubectl create secret generic slack-webhook \
      --namespace kubernaut-system \
      --from-literal=webhook-url="https://hooks.slack.com/services/T.../B.../xxx"
    ```

3. **Provide a routing config** (via `--set-file` or in a values file):

    ```bash
    helm upgrade kubernaut charts/kubernaut \
      --namespace kubernaut-system \
      --set-file notification.routing.content=charts/kubernaut/examples/notification-routing.yaml \
      -f values.yaml
    ```

    Ensure your values file includes the credential mount:

    ```yaml
    notification:
      credentials:
        - name: slack-webhook
          secretName: slack-webhook
          secretKey: webhook-url
    ```

4. **Verify** the notification pod has the credential mounted:

    ```bash
    kubectl exec -n kubernaut-system deploy/notification-controller -- \
      ls /etc/notification/credentials/
    # Should show: slack-webhook
    ```

Slack notifications will now be sent for any route that uses a `slackConfigs` receiver.

## PagerDuty Setup (v1.4)

PagerDuty delivery uses the [Events API v2](https://developer.pagerduty.com/docs/events-api-v2/overview/) to create incidents from Kubernaut notifications. The adapter includes a circuit breaker for graceful degradation under PagerDuty outages.

### Configuration

1. **Create the routing key secret:**

    ```bash
    kubectl create secret generic pagerduty-routing-key \
      --namespace kubernaut-system \
      --from-literal=routing-key="<your-pagerduty-routing-key>"
    ```

2. **Add the credential mount in Helm values:**

    ```yaml
    notification:
      credentials:
        - name: pagerduty-routing-key
          secretName: pagerduty-routing-key
          secretKey: routing-key
    ```

3. **Add a PagerDuty receiver to the routing config:**

    ```yaml
    receivers:
      - name: pagerduty-critical
        pagerdutyConfigs:
          - routingKeyRef:
              name: pagerduty-routing-key
            severity: critical
    ```

4. **Route notifications to PagerDuty:**

    ```yaml
    route:
      receiver: default
      routes:
        - match:
            priority: critical
          receiver: pagerduty-critical
    ```

## Microsoft Teams Setup (v1.4)

Microsoft Teams delivery sends Adaptive Card messages via incoming webhooks. The adapter includes a circuit breaker matching the pattern used by Slack and PagerDuty.

### Configuration

1. **Create the webhook URL secret:**

    ```bash
    kubectl create secret generic teams-webhook \
      --namespace kubernaut-system \
      --from-literal=webhook-url="<your-teams-webhook-url>"
    ```

2. **Add the credential mount in Helm values:**

    ```yaml
    notification:
      credentials:
        - name: teams-webhook
          secretName: teams-webhook
          secretKey: webhook-url
    ```

3. **Add a Teams receiver to the routing config:**

    ```yaml
    receivers:
      - name: teams-ops
        teamsConfigs:
          - webhookRef:
              name: teams-webhook
    ```

4. **Route notifications to Teams:**

    ```yaml
    route:
      receiver: default
      routes:
        - match:
            type: ManualReview
          receiver: teams-ops
    ```

The `teams` channel is available as an audit channel enum value for audit event routing.

## Next Steps

- [Architecture: Notification Pipeline](../architecture/notification.md) -- CRD specification, delivery orchestration, and retry internals
- [Configuration Reference](configuration.md) -- Full operator configuration reference
- [Human Approval](approval.md) -- The approval notification flow
- [Rego Policies](policies.md) -- Policies that influence notification triggers
