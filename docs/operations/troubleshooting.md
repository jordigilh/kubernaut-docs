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

**Common causes**: Orchestrator pod not running, RBAC permissions missing (see [Security & RBAC](../architecture/security-rbac.md)), RR in wrong namespace.

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
kubectl get rar -n kubernaut-system

# Approve (--subresource=status is required because the spec is immutable)
kubectl patch rar <name> -n kubernaut-system \
  --subresource=status --type=merge \
  -p '{"status":{"decision":"Approved","decidedBy":"operator","decisionMessage":"Reviewed and approved"}}'
```

**Common causes**: Operator hasn't reviewed the RAR yet, approval notification not delivered, RAR about to expire. See [Human Approval](../user-guide/approval.md) for the full walkthrough.

### Stuck in `Blocked`

The Orchestrator's routing engine has determined that proceeding is unsafe. The RR will be automatically retried after the cooldown expires -- no manual intervention is needed in most cases.

**Check**:

```bash
# Inspect the block reason and cooldown
kubectl get rr <name> -n kubernaut-system -o yaml | grep -A 5 'block\|Blocked'

# Check all RRs and their phases
kubectl get rr -n kubernaut-system
```

**Key status fields**:

| Field | Meaning |
|---|---|
| `status.blockReason` | Why the RR was blocked (see table below) |
| `status.blockMessage` | Human-readable explanation with details |
| `status.blockedUntil` | When the cooldown expires (for time-based blocks) |
| `status.overallPhase` | `Blocked` while the condition is active |

**Block reasons and resolution**:

| Block Reason | What It Means | What to Do |
|---|---|---|
| `ConsecutiveFailures` | 3+ consecutive failures on the same signal fingerprint. Cooldown: 1 hour. | Investigate why the previous remediations failed. Check the failed RRs: `kubectl get rr -n kubernaut-system`. The block clears automatically after the cooldown. |
| `DuplicateInProgress` | Another active RR is already handling the same signal. Rechecked every 30s. | Wait for the original RR to complete. The duplicate inherits the outcome. |
| `ResourceBusy` | A WorkflowExecution is already running on the same target. Rechecked every 30s. | Wait for the active workflow to finish. |
| `RecentlyRemediated` | The same workflow+target was executed recently. Cooldown: 5 minutes. | Normal behavior -- prevents remediation storms. Clears automatically. |
| `ExponentialBackoff` | Progressive retry delay after a workflow failure (1 min up to 10 min). | Clears automatically. Check `status.blockedUntil` for the exact time. |
| `UnmanagedResource` | Target namespace or resource lacks the `kubernaut.ai/managed=true` label. | Add the label: `kubectl label namespace <ns> kubernaut.ai/managed=true`. |
| `IneffectiveChain` | Consecutive remediations completed but were ineffective (resource reverted). | Escalated to manual review. Investigate the root cause -- the automated workflow isn't producing a durable fix. |

**Example**: A blocked RR due to consecutive failures:

```bash
$ kubectl get rr -n kubernaut-system
NAME                       PHASE     OUTCOME   AGE
rr-b157a3a9e42f-1c2b5576   Failed              18m
rr-b157a3a9e42f-1fad7b25   Failed              20m
rr-b157a3a9e42f-e40b4d97   Blocked             14m
rr-b157a3a9e42f-efe8bb6b   Failed              16m
```

Inspecting the blocked RR:

```yaml
status:
  blockMessage: '3 consecutive failures. Cooldown expires: 2026-03-10T03:04:03Z'
  blockReason: ConsecutiveFailures
  blockedUntil: "2026-03-10T03:04:03Z"
  overallPhase: Blocked
  deduplication:
    firstSeenAt: "2026-03-10T02:04:02Z"
    lastSeenAt: "2026-03-10T02:18:08Z"
    occurrenceCount: 14
```

The signal (`KubeNodeNotReady`) fired 14 times during the cooldown window. After 3 consecutive failures, the routing engine blocked further attempts for 1 hour to prevent remediation storms. The RR will be automatically retried after `blockedUntil`.

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

**Common causes**: Slack webhook secret not configured, no Slack receiver in the notification routing config, credential volume mount missing. See [Notification Channels](../user-guide/notifications.md) for Slack setup.

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

## Webhook TLS Certificate Issues

Admission webhook calls fail with TLS errors such as `x509: certificate signed by unknown authority` or `connection refused` on the webhook endpoint.

### Verify the Certificate and Secret

```bash
# Check the TLS secret exists and has data
kubectl get secret authwebhook-tls -n kubernaut-system

# Inspect certificate expiry (hook mode)
kubectl get secret authwebhook-tls -n kubernaut-system \
  -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates

# In cert-manager mode, check the Certificate resource
kubectl get certificate -n kubernaut-system
kubectl describe certificate authwebhook-cert -n kubernaut-system
```

### Verify the caBundle on Webhook Configurations

```bash
# Check that caBundle is populated
kubectl get validatingwebhookconfigurations kubernaut-authwebhook \
  -o jsonpath='{.webhooks[0].clientConfig.caBundle}' | wc -c

# A value of 0 or empty means the CA bundle was not injected
```

### Hook Mode (`tls.mode: hook`)

| Symptom | Cause | Fix |
|---|---|---|
| Empty `caBundle` | Post-install hook failed or was interrupted | Run `helm upgrade` to re-trigger the hook |
| Expired certificate | Installed >365 days ago without upgrade | Run `helm upgrade` -- certificates expiring within 30 days are auto-renewed |
| Missing `authwebhook-ca` ConfigMap | Manually deleted | Delete the `authwebhook-tls` Secret and run `helm upgrade` to regenerate both |

### cert-manager Mode (`tls.mode: cert-manager`)

| Symptom | Cause | Fix |
|---|---|---|
| Certificate `Not Ready` | cert-manager cannot reach the Issuer | `kubectl describe certificate authwebhook-cert -n kubernaut-system` -- check the `Status.Conditions` and `Events` |
| Empty `caBundle` | `cainjector` not running or annotation missing | Verify cert-manager's `cainjector` pod is running: `kubectl get pods -n cert-manager` |
| `inject-ca-from` annotation missing | Upgraded from hook mode without setting `tls.mode=cert-manager` | Verify `tls.mode` in your values and run `helm upgrade` |

### After Migration from Hook to cert-manager

If webhook calls fail immediately after switching from `tls.mode=hook` to `tls.mode=cert-manager`:

1. Verify the old hook-generated Secret was replaced by cert-manager:

    ```bash
    kubectl get secret authwebhook-tls -n kubernaut-system -o yaml | grep "cert-manager"
    ```

2. Confirm the `Certificate` resource is ready:

    ```bash
    kubectl get certificate authwebhook-cert -n kubernaut-system
    ```

3. Restart the authwebhook pod to pick up the new certificate:

    ```bash
    kubectl rollout restart deployment authwebhook -n kubernaut-system
    ```

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
