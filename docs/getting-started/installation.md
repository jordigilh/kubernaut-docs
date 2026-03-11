# Installation

This guide walks you through installing Kubernaut on a Kubernetes cluster using Helm.

!!! tip "Source of truth"
    Installation instructions and Helm values are sourced from the [chart README](https://github.com/jordigilh/kubernaut/blob/main/charts/kubernaut/README.md). This page embeds the relevant sections so you have everything in one place.

## Prerequisites

--8<-- "chart-readme.md:prerequisites"

## Infrastructure Setup

Complete these steps before installing the Kubernaut chart.

--8<-- "chart-readme.md:infrastructure-setup"

### Signal Source Authentication

The Gateway authenticates **every** signal ingestion request using Kubernetes TokenReview + SubjectAccessReview (SAR). Both AlertManager and the Event Exporter must present a valid ServiceAccount bearer token, and that ServiceAccount must have RBAC permission to submit signals.

The chart provides a `gateway-signal-source` ClusterRole that grants `create` on the `gateway-service` resource. Each entry in `gateway.auth.signalSources` creates a ClusterRoleBinding binding this role to the specified ServiceAccount. The Event Exporter is bound automatically by the chart.

#### Configuring AlertManager

AlertManager must include `http_config.bearer_token_file` in its webhook receiver so the Gateway can authenticate the request. The Gateway service is `gateway-service` on port `8080`, and the AlertManager adapter path is `/api/v1/signals/prometheus`.

```yaml
# alertmanager.yml (standalone)
receivers:
  - name: kubernaut
    webhook_configs:
      - url: "http://gateway-service.kubernaut-system.svc.cluster.local:8080/api/v1/signals/prometheus"
        send_resolved: true
        http_config:
          bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token

route:
  routes:
    - receiver: kubernaut
      matchers:
        - alertname!=""
      continue: true
```

For **kube-prometheus-stack**, configure via Helm values:

```yaml
# kube-prometheus-stack values.yaml
alertmanager:
  config:
    receivers:
      - name: kubernaut
        webhook_configs:
          - url: "http://gateway-service.kubernaut-system.svc.cluster.local:8080/api/v1/signals/prometheus"
            send_resolved: true
            http_config:
              bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    route:
      routes:
        - receiver: kubernaut
          matchers:
            - alertname!=""
          continue: true
```

Then register AlertManager's ServiceAccount as an authorized signal source in your **Kubernaut** values:

```yaml
# kubernaut values.yaml
gateway:
  auth:
    signalSources:
      - name: alertmanager
        serviceAccount: alertmanager-kube-prometheus-stack-alertmanager
        namespace: monitoring
```

!!! warning
    Without `bearer_token_file`, AlertManager sends unauthenticated requests and the Gateway rejects them with `401 Unauthorized`. Without the `signalSources` entry, the token is valid but SAR denies access with `403 Forbidden`.

#### Kubernetes Event Exporter

The Event Exporter is deployed **automatically** by the Kubernaut Helm chart. It watches for `Warning`-type Kubernetes events (e.g., `BackOff`, `OOMKilled`, `FailedScheduling`) and forwards them to the Gateway at `/api/v1/signals/kubernetes-event`. No manual configuration is needed.

The chart creates:

- A `event-exporter` ServiceAccount
- A `event-exporter` ClusterRole with read access to events, pods, configmaps, namespaces, deployments, and replicasets
- A ClusterRoleBinding granting the `gateway-signal-source` role to the Event Exporter's ServiceAccount

The Event Exporter's ConfigMap filters out `Normal` events and Kubernaut's own CRD events to prevent feedback loops. See [Event Exporter](../operations/event-exporter.md) for customization options (e.g., watching multiple namespaces).

See [Signal Source Authentication](../user-guide/configuration.md#signal-source-authentication) for the full TokenReview + SAR flow.

## Pre-Installation

--8<-- "chart-readme.md:pre-installation"

## Install

--8<-- "chart-readme.md:installation"

## Post-Installation

--8<-- "chart-readme.md:post-installation"

## Resource Scope

After installation, Kubernaut only manages namespaces and resources that opt in via labels:

```bash
kubectl label namespace my-app kubernaut.ai/managed=true
```

See [Signals & Alert Routing](../user-guide/signals.md) for details on scope management.

## Upgrading

--8<-- "chart-readme.md:upgrading"

## Uninstalling

--8<-- "chart-readme.md:uninstalling"

## Known Limitations

--8<-- "chart-readme.md:known-limitations"

## Next Steps

- [Quickstart](quickstart.md) -- Trigger your first automated remediation
- [Architecture Overview](architecture-overview.md) -- Understand how the services work together
- [Configuration Reference](../user-guide/configuration.md) -- Tune Kubernaut for your environment
- [Rego Policies](../user-guide/policies.md) -- Customize classification and approval policies
- [Workflows](../user-guide/workflows.md) -- Author and register remediation workflows
