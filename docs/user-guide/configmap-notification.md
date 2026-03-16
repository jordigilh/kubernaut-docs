# Notification Routing Config

The Notification controller uses an AlertManager-style routing configuration to determine how notifications are delivered. This page documents the routing schema, provisioning, and channel setup.

## Overview

| Property | Value |
|---|---|
| ConfigMap name | `notification-routing-config` |
| Key | `routing.yaml` |
| Mount path | `/etc/notification/routing/` |
| Required | No -- chart generates a console-only default when neither `routing.content` nor `routing.existingConfigMap` is set |

## Provisioning

### Option A: Inline content via --set-file

```bash
helm install kubernaut charts/kubernaut/ \
  --set-file notification.routing.content=my-routing.yaml \
  ...
```

### Option B: Pre-existing ConfigMap

```bash
kubectl create configmap notification-routing-config \
  --from-file=routing.yaml=my-routing.yaml \
  -n kubernaut-system

helm install kubernaut charts/kubernaut/ \
  --set notification.routing.existingConfigMap=notification-routing-config \
  ...
```

### Default (no config provided)

When neither option is set, the chart generates a console-only routing config:

```yaml
route:
  receiver: default-console
receivers:
  - name: default-console
    consoleConfigs:
      - enabled: true
```

## Routing Schema

```yaml
route:
  receiver: <default-receiver>       # Fallback receiver when no route matches
  routes:
    - match:
        <key>: <value>               # Match on notification attributes
      receiver: <receiver-name>

receivers:
  - name: <receiver-name>
    consoleConfigs:                   # Console delivery (stdout logging)
      - enabled: true
    slackConfigs:                     # Slack Block Kit messages
      - channel: "#channel"
        credentialRef: <credential>  # Matches notification.credentials[].name
    logConfigs:                       # Structured JSON Lines to stdout
      - enabled: true
        format: json
    fileConfigs:                      # Write to files (E2E/testing)
      - outputDir: /tmp/notifications
        format: json
```

### Match Fields

| Key | Source | Example Values |
|---|---|---|
| `type` | Notification type | `escalation`, `approval_required`, `failed`, `manual-review`, `completion` |
| `severity` | Signal severity | `critical`, `high`, `medium`, `low` |
| `priority` | Signal priority | `critical`, `high`, `medium`, `low` |
| `phase` | Remediation phase | `signal-processing`, `ai-analysis`, `executing` |
| `environment` | Namespace environment | `production`, `staging`, `development` |

### Routing Logic

- First matching route wins (depth-first evaluation)
- Child routes are evaluated before the parent
- The default receiver is used when no route matches

## Slack Setup

To enable Slack delivery:

1. Create a Slack Incoming Webhook
2. Store it in a Kubernetes Secret:

```bash
kubectl create secret generic slack-webhook \
  --from-literal=webhook-url="https://hooks.slack.com/services/T.../B.../xxx" \
  -n kubernaut-system
```

3. Configure credential mounting in `values.yaml`:

```yaml
notification:
  credentials:
    - name: slack-webhook
      secretName: slack-webhook
      secretKey: webhook-url
```

4. Reference the credential in the routing config:

```yaml
receivers:
  - name: slack-alerts
    slackConfigs:
      - channel: "#kubernaut-alerts"
        credentialRef: slack-webhook
```

## Hot-Reload

Routing configuration supports hot-reload via fsnotify (~60s kubelet sync delay). No pod restart required.

## Reference File

A complete example with Slack routing is available in the chart: `charts/kubernaut/examples/notification-routing.yaml`

See also: [Notification Channels](notifications.md) for per-channel details, message formats, and retry policies.
