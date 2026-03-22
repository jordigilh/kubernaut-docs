# Upgrading Kubernaut

Before upgrading, read the notes for every minor version between your current version and the target version.

## General Upgrade Procedure

Use `helm upgrade` to apply configuration changes or move to a new chart version:

```bash
helm upgrade kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  -n kubernaut-system --reuse-values \
  --set holmesgptApi.llm.model=gpt-4o-mini
```

To upgrade to a specific version, add `--version <new-version>`.

### CRD Schema Changes

Helm does **not** upgrade CRDs on `helm upgrade`. When upgrading to a chart version with CRD schema changes, extract and apply the new CRDs before upgrading:

```bash
helm pull oci://quay.io/kubernaut-ai/charts/kubernaut \
  --version <new-version> --untar
kubectl apply --server-side --force-conflicts -f kubernaut/crds/

helm upgrade kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
  --version <new-version> -n kubernaut-system --reuse-values
```

### Key Upgrade Behaviors

- **TLS certificates** (`tls.mode: hook`): Renewed automatically if expiring within 30 days. In `cert-manager` mode, cert-manager handles renewal.
- **Database migrations** run automatically via the post-upgrade hook.
- **PVCs** are not modified (immutable for bound claims).
- **ConfigMaps and Secrets** are updated to reflect new values.

## Version-Specific Notes

- [v1.0 to v1.1](1.0-to-1.1.md) -- Valkey migration, demo content, unified Rego, SDK config externalization
