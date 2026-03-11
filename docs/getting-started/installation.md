# Installation

This guide walks you through installing Kubernaut on a Kubernetes cluster using Helm.

!!! tip "Source of truth"
    Installation instructions and Helm values are sourced from the [chart README](https://github.com/jordigilh/kubernaut/blob/main/charts/kubernaut/README.md). This page embeds the relevant sections so you have everything in one place.

## Prerequisites

--8<-- "chart-readme.md:prerequisites"

## Infrastructure Setup

Complete these steps before installing the Kubernaut chart.

--8<-- "chart-readme.md:infrastructure-setup"

!!! warning "AlertManager authentication required"
    The Gateway authenticates every signal ingestion request using **Kubernetes TokenReview + SubjectAccessReview (SAR)**. AlertManager must include a bearer token in its webhook requests, and the ServiceAccount behind that token must have RBAC permission to submit signals. Add `http_config.bearer_token_file` to your AlertManager receiver:

    ```yaml
    webhook_configs:
      - url: "http://gateway.kubernaut-system.svc:9090/api/v1/signals/alertmanager"
        send_resolved: true
        http_config:
          bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    ```

    Without this, AlertManager requests are rejected with `401 Unauthorized`. The `gateway.auth.signalSources` entry creates a `ClusterRoleBinding` granting the specified ServiceAccount permission to submit signals. See [Signal Source Authentication](../user-guide/configuration.md#signal-source-authentication) for the full details.

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
