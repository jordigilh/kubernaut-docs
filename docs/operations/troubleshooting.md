# Troubleshooting

Common issues and diagnostic procedures for Kubernaut.

## RemediationRequest Stuck in a Phase

### Stuck in `Pending`

The Orchestrator hasn't picked up the request.

**Check**:

```bash
# Is the Orchestrator running?
kubectl get pods -n kubernaut-system -l app=remediationorchestrator-controller

# Check Orchestrator logs
kubectl logs -n kubernaut-system -l app=remediationorchestrator-controller --tail=100

# Is the RR in the correct namespace?
kubectl get remediationrequests -A
```

**Common causes**: Orchestrator pod not running, RBAC permissions missing, RR in wrong namespace.

### Stuck in `Processing`

Signal Processing hasn't completed enrichment.

**Check**:

```bash
# Check the child SignalProcessing CRD
kubectl get signalprocessing -n kubernaut-system

# Check SP controller logs
kubectl logs -n kubernaut-system -l app=signalprocessing-controller --tail=100
```

**Common causes**: Target resource not found, namespace not labeled with `kubernaut.ai/managed=true`.

### Stuck in `Analyzing`

AI Analysis is waiting for HolmesGPT.

**Check**:

```bash
# Check the AIAnalysis CRD
kubectl get aianalysis -n kubernaut-system -o yaml

# Check session status
kubectl logs -n kubernaut-system -l app=aianalysis-controller --tail=100 | grep session

# Is HolmesGPT healthy?
kubectl get pods -n kubernaut-system -l app=holmesgpt-api
kubectl logs -n kubernaut-system -l app=holmesgpt-api --tail=100
```

**Common causes**: LLM provider unreachable, API key missing, HolmesGPT pod not running, session timeout.

### Stuck in `AwaitingApproval`

Waiting for human approval.

**Check**:

```bash
# List pending approvals
kubectl get remediationapprovalrequests -n kubernaut-system

# Approve
kubectl patch remediationapprovalrequest <name> -n kubernaut-system \
  --type merge -p '{"status":{"decision":"Approved","decisionMessage":"Reviewed and approved"}}'
```

## No Workflows Found

AI Analysis completes but no workflow is selected.

**Check**:

```bash
# List available workflows
curl http://data-storage-service.kubernaut-system.svc.cluster.local:8080/api/v1/workflows

# Check workflow labels match the signal
kubectl get aianalysis <name> -n kubernaut-system -o yaml | grep -A 20 analysisResult
```

**Common causes**: No workflow registered for this alert type, label mismatch, DataStorage not running.

## Notification Not Delivered

**Check**:

```bash
# Check NotificationRequest status
kubectl get notificationrequests -n kubernaut-system -o yaml

# Check Notification controller logs
kubectl logs -n kubernaut-system -l app=notification-controller --tail=100
```

**Common causes**: Slack webhook secret not configured, `notification.slack.enabled` is `false`, credential volume mount missing.

## DataStorage Connection Issues

**Check**:

```bash
# Is PostgreSQL running?
kubectl get pods -n kubernaut-system -l app=postgresql

# Is DataStorage healthy?
kubectl exec -n kubernaut-system deploy/datastorage -- curl -s http://localhost:8080/health/ready

# Check DataStorage logs
kubectl logs -n kubernaut-system -l app=datastorage --tail=100
```

**Common causes**: PostgreSQL pod not running, incorrect credentials, migration not run.

## Collecting Diagnostics

Use the must-gather tool to collect a comprehensive diagnostic bundle:

```bash
kubectl run must-gather \
  --image=quay.io/kubernaut-ai/must-gather:latest \
  --restart=Never \
  -n kubernaut-system \
  -- collect

# Copy the results
kubectl cp kubernaut-system/must-gather:/output/must-gather.tar.gz ./must-gather.tar.gz
```

## Next Steps

- [Monitoring](monitoring.md) — Metrics and health checks
- [Configuration Reference](../user-guide/configuration.md) — Service configuration
