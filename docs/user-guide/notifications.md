# Notification Channels

!!! info "Architecture reference"
    For the CRD specification, delivery orchestration, and retry internals, see [Architecture: Notification Pipeline](../architecture/notification.md).

Kubernaut sends notifications at key points in the remediation lifecycle: when human approval is required, when a remediation fails, when manual review is needed, and when a remediation completes. Notifications are routed through configurable channels using an AlertManager-style routing configuration.

## Channel Overview

| Channel | Status | Description |
|---|---|---|
| **Console** | Implemented | Writes to controller-runtime log output (stdout) |
| **File** | Implemented | Writes notification JSON/YAML to files (E2E/testing) |
| **Log** | Implemented | Structured JSON Lines to stdout for log aggregation |
| **Slack** | Implemented | Sends Block Kit messages via Incoming Webhooks |
| Email | Schema-defined | Not yet implemented |
| Teams | Schema-defined | Not yet implemented |
| SMS | Schema-defined | Not yet implemented |
| Webhook | Schema-defined | Not yet implemented |

## Routing Configuration

Notifications are routed using a ConfigMap with an AlertManager-style `route` + `receivers` structure.

**ConfigMap:** `notification-routing-config`

```yaml
route:
  receiver: default-console
  routes:
    - match:
        type: escalation
      receiver: slack-alerts
    - match:
        type: approval_required
      receiver: slack-alerts
    - match:
        type: failed
      receiver: slack-alerts

receivers:
  - name: default-console
    consoleConfigs:
      - enabled: true
  - name: slack-alerts
    slackConfigs:
      - channel: "#kubernaut-alerts"
        credentialRef: slack-webhook
```

### Match Fields

Routes match on notification attributes:

| Match Key | Source | Example Values |
|---|---|---|
| `type` | Notification type | `escalation`, `approval_required`, `failed`, `manual-review`, `completion` |
| `severity` | Signal severity | `critical`, `high`, `medium`, `low` |
| `priority` | Signal priority | `critical`, `high`, `medium`, `low` |
| `phase` | Remediation phase | `signal-processing`, `ai-analysis`, `executing` |
| `environment` | Namespace environment | `production`, `staging`, `development` |
| `review-source` | Why review was triggered | `WorkflowResolutionFailed`, `ExhaustedRetries` |

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
  "type": "approval_required",
  "priority": "critical",
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
3. **Context block** -- `*Priority:* critical | *Type:* approval_required`

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
  slack:
    enabled: true
    channel: "#kubernaut-alerts"
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

## Enabling Slack: End-to-End Walkthrough

1. **Create a Slack Incoming Webhook** in your workspace (Apps > Incoming Webhooks > Add to Channel)

2. **Create the Kubernetes Secret:**

    ```bash
    kubectl create secret generic slack-webhook \
      --namespace kubernaut-system \
      --from-literal=webhook-url="https://hooks.slack.com/services/T.../B.../xxx"
    ```

3. **Update Helm values:**

    ```yaml
    notification:
      slack:
        enabled: true
        channel: "#kubernaut-alerts"
      credentials:
        - name: slack-webhook
          secretName: slack-webhook
          secretKey: webhook-url
    ```

4. **Upgrade the Helm release:**

    ```bash
    helm upgrade kubernaut charts/kubernaut \
      --namespace kubernaut-system \
      -f values.yaml
    ```

5. **Verify** the notification pod has the credential mounted:

    ```bash
    kubectl exec -n kubernaut-system deploy/notification-controller -- \
      ls /etc/notification/credentials/
    # Should show: slack-webhook
    ```

Slack notifications will now be sent for any route that uses a `slackConfigs` receiver.

## Next Steps

- [Architecture: Notification Pipeline](../architecture/notification.md) -- CRD specification, delivery orchestration, and retry internals
- [Configuration Reference](configuration.md) -- Full operator configuration reference
- [Human Approval](approval.md) -- The approval notification flow
- [Rego Policies](policies.md) -- Policies that influence notification triggers
