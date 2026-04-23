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

Helm does **not** upgrade CRDs on `helm upgrade`. Starting with **v1.1**, the chart includes a `pre-upgrade` hook that automatically applies all CRD manifests via `kubectl apply --server-side --force-conflicts` before the upgrade proceeds. This ensures CRD schema changes (field additions, removals, default changes) take effect without manual intervention.

!!! note "Upgrading from chart versions before v1.1"
    If you are upgrading from a chart version that does not include the pre-upgrade hook, you must manually apply the new CRDs first:

    ```bash
    helm pull oci://quay.io/kubernaut-ai/charts/kubernaut \
      --version <new-version> --untar
    kubectl apply --server-side --force-conflicts -f kubernaut/crds/

    helm upgrade kubernaut oci://quay.io/kubernaut-ai/charts/kubernaut \
      --version <new-version> -n kubernaut-system --reuse-values
    ```

### Key Upgrade Behaviors

- **CRD schemas** are applied automatically via the pre-upgrade hook using server-side apply with force-conflicts.
- **TLS certificates** (`tls.mode: hook`): Renewed automatically if expiring within 30 days. In `cert-manager` mode, cert-manager handles renewal.
- **Database migrations** run automatically via the post-upgrade hook.
- **PVCs** are not modified (immutable for bound claims).
- **ConfigMaps and Secrets** are updated to reflect new values.

### Secret Changes

Starting with chart version **v1.1.0-rc14**, the chart no longer auto-generates PostgreSQL or Valkey credentials. All database and cache secrets must be pre-created before running `helm install` or `helm upgrade`.

Key changes:

- **`datastorage-db-secret` consolidated into `postgresql-secret`** — The `db-secrets.yaml` key that was previously in a separate `datastorage-db-secret` is now expected inside `postgresql-secret`. This eliminates password mismatch risks between the two secrets.
- **`datastorage.dbExistingSecret` deprecated** — Leave empty to use the consolidated `postgresql-secret`. Only set if you need DataStorage to read from a separate secret.
- **Mandatory pre-creation** — If a required secret is missing, `helm install`/`helm upgrade` fails at template time with a descriptive error including the exact `kubectl create secret` command needed.

See the [installation guide](../../getting-started/installation.md#2-provision-secrets) for the full pre-creation commands.

## Version-Specific Notes

- [**v1.2 to v1.3**](1.2-to-1.3.md) — holmesgpt-api → kubernaut-agent rename, LiteLLM removed (LangChainGo), inter-service TLS by default, three-port model, two-invocation investigation pipeline, label arrays, PascalCase AssessmentReason, content integrity enforcement.
- [**v1.1 to v1.2**](1.1-to-1.2.md) — CRD schema hardening (typed enums, `metav1.Duration`), storm detection removal, PascalCase enum migration, per-workflow ServiceAccount, database migrations 002-004.

v1.0 and v1.2 are end-of-life and no longer documented.
