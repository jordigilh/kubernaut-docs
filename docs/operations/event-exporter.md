# Event Exporter (Removed)

!!! warning "Removed in v1.1"
    The Event Exporter was removed from the Kubernaut Helm chart in v1.1. Like Prometheus, Kubernetes event forwarding is a user-provided concern that should be managed independently of the Kubernaut installation.

## Migration

If you were using the chart-provided Event Exporter, deploy the [Resmo Kubernetes Event Exporter](https://github.com/resmoio/kubernetes-event-exporter) separately and configure it to forward events to the Gateway:

1. Deploy the Event Exporter in your cluster (e.g., via its own Helm chart or manifest)
2. Configure it to POST `Warning` events to the Gateway endpoint: `http://gateway-service.<namespace>.svc.cluster.local:8080/api/v1/signals/kubernetes-event`
3. Register the Event Exporter's ServiceAccount as an authorized signal source in your Kubernaut values:

```yaml
gateway:
  auth:
    signalSources:
      - name: event-exporter
        serviceAccount: <event-exporter-sa>
        namespace: <event-exporter-namespace>
```

See [Signal Source Authentication](../getting-started/installation.md#signal-source-authentication) for RBAC details.
