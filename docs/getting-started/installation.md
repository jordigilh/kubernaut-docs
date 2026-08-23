# Installation

## Deployment Method

Kubernaut is deployed using the **Kubernaut Operator** via OLM on OpenShift 4.18+. The operator manages the full lifecycle including secret validation, database migrations, CRD installation, deployment of all 14 component workloads, RBAC, NetworkPolicies, OCP Routes, and status reporting.

For a local development/demo environment, see the [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios) repository which provides a Kind-based setup with monitoring, workflows, and sample scenarios.

## Kubernaut Operator (Production)

The Kubernaut Operator manages the full lifecycle of the Kubernaut platform on OpenShift: secret validation, database migrations, CRD installation, deployment of all 14 component workloads, RBAC, NetworkPolicies, OCP Routes, and status reporting. It is a singleton — one `Kubernaut` CR named `kubernaut` per cluster.

### Installation

The operator is available through OLM (Operator Lifecycle Manager) or direct manifest deployment:

1. **OperatorHub (recommended)** — Install from the OperatorHub catalog in the OpenShift Console
2. **Custom CatalogSource** — For disconnected or custom environments, create a `CatalogSource` pointing to the operator index image
3. **Direct manifest** — For environments without OLM or for quick evaluation:

```bash
curl -fsSL \
  https://github.com/jordigilh/kubernaut-operator/releases/latest/download/install.yaml \
  -o install.yaml

oc apply -f install.yaml
oc rollout status deployment/kubernaut-operator-controller-manager \
  -n kubernaut-operator-system --timeout=120s
```

This creates the `kubernaut-operator-system` namespace, 11 CRDs (all under `kubernaut.ai`), RBAC, and the operator Deployment. With [IDMS](../operations/disconnected-install.md) in place, image references are transparently redirected to the mirror — no `RELATED_IMAGE_*` patching is needed.

To pin to a specific operator release instead of the latest, replace `latest` in the URL with a tag, e.g. `.../releases/download/v1.5.10/install.yaml`. See the [operator releases page](https://github.com/jordigilh/kubernaut-operator/releases) for available tags — the operator has its own release cadence, independent of the core Kubernaut release version.

For complete installation instructions, see the [Kubernaut Operator Installation Guide](https://github.com/jordigilh/kubernaut-operator/tree/main/docs/installation).

### Prerequisites (Operator) {: #prerequisites }

| Requirement | Version | Notes |
|---|---|---|
| OpenShift | 4.18+ | OLM and operator-framework support required |
| PostgreSQL | 15+ | **BYO** — the operator does not deploy a database; provide connection details via `spec.postgresql`. TLS is required (`sslMode`: `require`, `verify-ca`, or `verify-full`). See [PostgreSQL TLS](../operations/disconnected-install.md#postgresql-tls). |
| Valkey / Redis | 7+ | **BYO** — provide connection details via `spec.valkey` |
| LLM provider | — | Any [supported provider](../operations/disconnected-install.md#llm-configuration-reference) with JSON structured output (9 providers for KA, 4 for AF) |
| LLM credentials Secret | — | Secret containing the LLM API key — see [Credential Secret Format](../operations/disconnected-install.md#llm-configuration-reference) for the expected keys per provider |
| SP classification policy | — | ConfigMap with key `policy.rego` — see [Rego Policies](../user-guide/policies.md) |
| AA approval policy | — | ConfigMap with key `approval.rego` — see [Approval Policy](../user-guide/configmap-approval.md) |
| OIDC provider | — | **AF/Console only** — required when `spec.apiFrontend.enabled: true` or `spec.console.enabled: true`. Any standards-compliant OIDC provider works (Keycloak, Dex, Okta, Auth0, etc.) — Console's `oauth2-proxy` sidecar just needs a reachable `issuerURL` to perform OIDC discovery, and AF needs `issuerURL`/`audience`/`jwksURL` for JWT validation. This is **independent of kagenti** — see the note below. |
| kagenti | 0.2.0+ | **A2A only, optional** — required only when enabling `spec.apiFrontend.spire.enabled: true` for A2A agent-to-agent integration (SPIRE/authbridge sidecar injection). Not required for Console or for AF's own OIDC-based user/API authentication. Must be installed before Kubernaut when used. |

!!! info "kagenti is not a Console/AF-auth dependency"
    kagenti and the OIDC provider requirement are frequently conflated because kagenti's own Kind/OCP installers bundle a Keycloak instance (`scripts/kind/setup-kagenti.sh` deploys Keycloak as a **core** component), and several reference deployment guides reuse that bundled Keycloak as the OIDC provider for convenience. That makes kagenti a *practical* way to get a working OIDC provider quickly, but there is no code-level dependency: Console's `oauth2-proxy` sidecar and AF's JWT validation talk directly to whatever `issuerURL` you configure — they never call kagenti's API, its operator, or SPIRE. You can point `spec.apiFrontend.auth.issuerURL` / `spec.console.auth` at any OIDC provider without installing kagenti at all, as long as `spec.apiFrontend.spire.enabled` stays `false` (the default).

!!! warning "CR validation"
    The operator **rejects the Kubernaut CR** if any of the following fields are missing or reference non-existent resources: `spec.kubernautAgent.llmProfileRef` (must name a key in `spec.llmProfiles`), each `spec.llmProfiles[<name>].provider`/`.model`/`.credentialsSecretName`, `spec.signalProcessing.policy.configMapName`, `spec.aiAnalysis.policy.configMapName`. Create these resources before applying the CR.

**Operator image:** `quay.io/kubernaut-ai/kubernaut-operator:{{ operator_image_tag }}` — no `v` prefix. This applies to component images (`{{ image_tag }}`) too; neither uses a `v` prefix on quay.io, despite the git tags themselves being `v`-prefixed (e.g. git tag `v1.5.6` publishes image tag `1.5.6`).

### Provision Prerequisites

#### 1. Create the Namespace

```bash
oc create namespace kubernaut-system
```

#### 2. Create Secrets

**PostgreSQL:**

```bash
oc create secret generic postgresql-secret \
  --from-literal=POSTGRES_USER=<pg-user> \
  --from-literal=POSTGRES_PASSWORD=<pg-password> \
  --from-literal=POSTGRES_DB=action_history \
  -n kubernaut-system
```

!!! note
    The operator validates keys `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. The RHEL PostgreSQL 16 container image expects different env var names (`POSTGRESQL_USER`, `POSTGRESQL_PASSWORD`, `POSTGRESQL_DATABASE`), so the PostgreSQL deployment maps these keys via `secretKeyRef`. The operator automatically derives a `datastorage-db-secret` from this secret — you do not need to create it manually.

**Valkey:**

```bash
oc create secret generic valkey-secret \
  --from-literal=valkey-secrets.yaml="$(printf 'password: %s' '<valkey-password>')" \
  -n kubernaut-system
```

!!! warning "Secret format"
    The secret must contain a key named `valkey-secrets.yaml` with YAML content (`password: <value>`). A common mistake is creating a plain key/value secret — the operator validates this and reports an error in the Kubernaut CR status. Verify with:

    ```bash
    oc get secret valkey-secret -n kubernaut-system \
      -o jsonpath='{.data.valkey-secrets\.yaml}' | base64 -d
    # Expected: password: <your-password>
    ```

**LLM credentials:**

```bash
# OpenAI / Azure / OpenAI-compatible
oc create secret generic llm-credentials \
  --from-literal=OPENAI_API_KEY=<your-key> \
  -n kubernaut-system
```

See the [LLM Configuration Reference](../operations/disconnected-install.md#llm-configuration-reference) for all 10 supported providers and credential formats (Anthropic, Vertex AI, Bedrock, etc.).

**Console OIDC (AF/Console path only):**

Required when `spec.console.enabled: true`. The console uses `oauth2-proxy` for authentication, which requires **any** reachable OIDC provider — Keycloak is used in the example below because it is what kagenti's reference deployments bundle, not because Console has a hard dependency on Keycloak or kagenti specifically. You must register an OIDC client for the console (with the mappers below, if your provider supports them) and configure it **before** creating the secret.

**Step 1 — Register the `kubernaut-console` client in Keycloak:**

```bash
KC_URL="https://<KEYCLOAK_HOST>"
KC_REALM="kagenti"
CLIENT_SECRET="$(openssl rand -hex 16)"

KC_TOKEN=$(curl -sk "$KC_URL/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=admin-cli&username=<admin-user>&password=<admin-password>" \
  | jq -r '.access_token')

curl -sk -X POST -H "Authorization: Bearer $KC_TOKEN" -H "Content-Type: application/json" \
  "$KC_URL/admin/realms/$KC_REALM/clients" \
  -d '{
    "clientId": "kubernaut-console",
    "name": "Kubernaut Console",
    "enabled": true,
    "protocol": "openid-connect",
    "publicClient": false,
    "secret": "'"$CLIENT_SECRET"'",
    "redirectUris": ["https://<CONSOLE_ROUTE>/*"],
    "webOrigins": ["https://<CONSOLE_ROUTE>"],
    "standardFlowEnabled": true,
    "directAccessGrantsEnabled": false
  }'

echo "Client secret: $CLIENT_SECRET"
```

**Step 2 — Add the audience mapper** (required for AF token validation):

```bash
CLIENT_UUID=$(curl -sk -H "Authorization: Bearer $KC_TOKEN" \
  "$KC_URL/admin/realms/$KC_REALM/clients?clientId=kubernaut-console" | jq -r '.[0].id')

curl -sk -X POST -H "Authorization: Bearer $KC_TOKEN" -H "Content-Type: application/json" \
  "$KC_URL/admin/realms/$KC_REALM/clients/$CLIENT_UUID/protocol-mappers/models" \
  -d '{
    "name": "kubernaut-af-audience",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-audience-mapper",
    "config": {
      "included.custom.audience": "https://<KEYCLOAK_HOST>/realms/'"$KC_REALM"'",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "introspection.token.claim": "true"
    }
  }'
```

The `included.custom.audience` must match `spec.apiFrontend.auth.audience` in the Kubernaut CR.

**Step 3 — Add the groups mapper** (required for tool authorization):

```bash
curl -sk -X POST -H "Authorization: Bearer $KC_TOKEN" -H "Content-Type: application/json" \
  "$KC_URL/admin/realms/$KC_REALM/clients/$CLIENT_UUID/protocol-mappers/models" \
  -d '{
    "name": "groups",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-group-membership-mapper",
    "config": {
      "full.path": "false",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "claim.name": "groups",
      "userinfo.token.claim": "true"
    }
  }'
```

**Step 4 — Create the Kubernetes secret:**

```bash
oc create secret generic kubernaut-console-oidc \
  --from-literal=client-id=kubernaut-console \
  --from-literal=client-secret=$CLIENT_SECRET \
  --from-literal=cookie-secret=$(openssl rand -hex 16) \
  -n kubernaut-system
```

**Slack webhook (optional):**

```bash
oc create secret generic slack-webhook \
  --from-literal=webhook-url=https://hooks.slack.com/services/T.../B.../... \
  -n kubernaut-system
```

#### 3. Rego Policy ConfigMaps

Create the signal processing and approval policy ConfigMaps before applying the CR. See [Rego Policies](../user-guide/policies.md) and [Approval Policy](../user-guide/configmap-approval.md) for full policy examples.

#### 4. PostgreSQL and Valkey

PostgreSQL and Valkey are BYO preconditions — the operator does not deploy them. Both **must** have PersistentVolumeClaims for production; without PVCs, data is lost on every pod restart.

To identify available StorageClasses:

```bash
oc get storageclass
```

Common StorageClasses by platform:

| Platform | StorageClass |
|---|---|
| AWS (EBS) | `gp3-csi`, `gp2-csi` |
| vSphere | `thin-csi` |
| Bare metal (LVMS) | `lvms-vg1` |
| ODF/OCS | `ocs-storagecluster-ceph-rbd` |
| Azure | `managed-premium`, `managed-csi` |

If you need to deploy PostgreSQL and Valkey in the `kubernaut-system` namespace, see the [deployment manifests](../operations/disconnected-install.md#step-35-deploy-postgresql-and-valkey) and [PostgreSQL TLS configuration](../operations/disconnected-install.md#postgresql-tls).

!!! note "Disconnected installs"
    For air-gapped environments, see the [Disconnected Installation Guide](../operations/disconnected-install.md) for mirroring images via `oc-mirror` and installing via OLM or direct manifest. IDMS transparently redirects image pulls — no `RELATED_IMAGE_*` patching is needed.

### Kubernaut CR {: #kubernaut-cr }

Kubernaut supports two ingress paths. Choose the one that matches your use case:

- **Gateway (alert-driven)** — Prometheus alerts trigger automated remediation. No OIDC provider or kagenti required.
- **API Frontend + Console (A2A/MCP)** — Interactive investigation and remediation via MCP clients, A2A agents, or the Kubernaut Console web UI. Requires an OIDC provider (e.g. Keycloak). kagenti is only required in addition if you also enable `spec.apiFrontend.spire.enabled: true` for A2A agent integration — see the note in [Prerequisites](#prerequisites).

Both paths can be enabled simultaneously.

=== "Gateway (alert-driven)"

    ```yaml
    apiVersion: kubernaut.ai/v1alpha2
    kind: Kubernaut
    metadata:
      name: kubernaut
      namespace: kubernaut-system
    spec:
      postgresql:
        host: postgresql.kubernaut-system.svc.cluster.local
        port: 5432
        secretName: postgresql-secret
        sslMode: require
      valkey:
        host: valkey.kubernaut-system.svc.cluster.local
        port: 6379
        secretName: valkey-secret
      # claude-sonnet-4-6 is the model validated against this operator's KA/AF
      # integration -- swap in openai/gemini/vertex_ai/openai_compatible once
      # your own provider is validated. anthropic needs no `endpoint` field
      # (only `openai`/`openai_compatible` do).
      llmProfiles:
        primary:
          provider: anthropic           # or: openai, gemini, vertex_ai, openai_compatible
          model: claude-sonnet-4-6
          credentialsSecretName: llm-credentials
      kubernautAgent: {}
      signalProcessing:
        policy:
          configMapName: signalprocessing-policy
      aiAnalysis:
        policy:
          configMapName: aianalysis-policy
      gateway:
        enabled: true
      apiFrontend:
        enabled: false
    ```

    After applying, configure [AlertManager](#ocp-alertmanager-integration) to route alerts to the Gateway.

=== "API Frontend + Console (A2A/MCP)"

    Requires an OIDC provider (e.g. Keycloak) for `apiFrontend.auth` and `console.auth`. The `spire` block below is optional and only needed for A2A agent integration via kagenti — see [kagenti Integration](#kagenti-integration) below. Omit `spire` (or set `enabled: false`) to run AF/Console with plain OIDC and no kagenti dependency at all.

    ```yaml
    apiVersion: kubernaut.ai/v1alpha2
    kind: Kubernaut
    metadata:
      name: kubernaut
      namespace: kubernaut-system
    spec:
      postgresql:
        host: postgresql.kubernaut-system.svc.cluster.local
        port: 5432
        secretName: postgresql-secret
        sslMode: require
      valkey:
        host: valkey.kubernaut-system.svc.cluster.local
        port: 6379
        secretName: valkey-secret
      # claude-sonnet-4-6 is the model validated against this operator's KA/AF
      # integration -- swap in openai/gemini/vertex_ai/openai_compatible once
      # your own provider is validated. anthropic needs no `endpoint` field
      # (only `openai`/`openai_compatible` do).
      llmProfiles:
        primary:
          provider: anthropic           # or: openai, gemini, vertex_ai, openai_compatible
          model: claude-sonnet-4-6
          credentialsSecretName: llm-credentials
      kubernautAgent:
        llmProfileRef: primary
        interactive:
          enabled: true
          inactivityTimeout: 10m
          maxConcurrentSessions: 10
          sessionTTL: 30m
      signalProcessing:
        policy:
          configMapName: signalprocessing-policy
      aiAnalysis:
        policy:
          configMapName: aianalysis-policy
      gateway:
        enabled: false
      apiFrontend:
        enabled: true
        auth:
          issuerURL: "https://<KEYCLOAK_HOST>/realms/kagenti"
          audience: "https://<KEYCLOAK_HOST>/realms/kagenti"
          jwksURL: "http://keycloak-service.keycloak:8080/realms/kagenti/protocol/openid-connect/certs"
        spire:
          enabled: true
          className: zero-trust-workload-identity-manager-spire
        rbac: # required -- see "Required: API Frontend & Console Authorization" below
          sarCacheTTL: "30s"
          roleBindings:
            - role: sre
              groups: ["platform-engineering"]
            - role: ai-orchestrator
              groups: ["platform-engineering"]
            - role: remediation-approver
              groups: ["platform-engineering"]
      console:
        enabled: true
        auth:
          secretName: kubernaut-console-oidc
        route:
          enabled: true
    ```

    !!! warning "Environment-specific values"
        The `auth.audience`, `auth.issuerURL`, and `auth.jwksURL` fields **must match your Keycloak realm**. Mismatched values cause silent 401 Unauthorized failures. Verify by decoding a JWT:

        ```bash
        echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{aud, azp, groups}'
        ```

Apply the CR:

```bash
oc apply -f kubernaut-cr.yaml
```

#### Required: API Frontend & Console Authorization (RBAC) {: #af-console-rbac-required }

!!! danger "Required for both Console and MCP/A2A tool access — configure this before going live, not kagenti-specific"
    `spec.apiFrontend.rbac` must be configured with at least one group whenever `spec.apiFrontend.enabled: true`, **regardless of whether kagenti/SPIRE is used at all**. Leaving it entirely unset does not mean "no restrictions" — it means **every** user is denied: both the Console's `GET /a2a/access` pre-flight check on page load, and every `/mcp`/`/a2a/invoke` tool call, with no default-open fallback.

    This is a behavior change from earlier Kubernaut releases (kubernaut#1919): authorization used to be enforced only per-tool, at call time. A coarse-grained `kubernaut.ai/console` gate now also runs on every Console load and every tool-invocation request, before the per-tool check ever runs. If you are copying a CR from an older Kubernaut deployment (or from documentation predating this change) that never set `apiFrontend.rbac`, you must add it now. See [Console "Access Denied" troubleshooting](#console-access-denied) if you hit this after an upgrade, and [Security & RBAC: Console-access authorization gate](../architecture/security-rbac.md#console-access-gate) for the full model.

The `roleBindings` in `spec.apiFrontend.rbac` map your OIDC groups to tool personas:

```yaml
apiFrontend:
  rbac:
    roleBindings:
      - role: sre
        groups: ["<YOUR-OIDC-GROUP-NAME>"]
```

**How to find `<YOUR-OIDC-GROUP-NAME>`**: it's the same value that ends up in the `groups` claim of your users' JWTs after configuring the groups mapper in [Console OIDC Step 3](#2-create-secrets) (or the kagenti client's group mapper below, for A2A callers) — i.e. whatever OIDC/AD/LDAP group your identity provider already places your intended users into. If you're not sure of the exact string, decode a real token from one of those users and read it directly:

```bash
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '.groups'
```

Each persona grants access to a specific set of MCP tools:

| Persona | Tools granted |
|---|---|
| `sre` | `kubernaut_investigate`, `kubernaut_approve`, `kubernaut_cancel_remediation`, `kubernaut_watch`, `kubernaut_await_session`, `kubernaut_discover_workflows`, `kubernaut_select_workflow`, `kubernaut_present_decision`, `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail`, `kubernaut_message`, `kubernaut_complete`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect`, `kubernaut_list_workflows`, `kubernaut_remediate`, `kubernaut_check_existing_remediation`, `kubectl_get`, `kubectl_list`, `kubectl_list_events`, `list_alerts`, `get_alert_details`, `kubernaut_investigate_alert` |
| `ai-orchestrator` | `kubernaut_investigate`, `kubernaut_watch`, `kubernaut_await_session`, `kubernaut_discover_workflows`, `kubernaut_select_workflow`, `kubernaut_present_decision`, `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_message`, `kubernaut_complete`, `kubernaut_cancel`, `kubernaut_status`, `kubernaut_reconnect`, `kubernaut_remediate`, `kubernaut_check_existing_remediation`, `kubectl_get`, `kubectl_list`, `kubectl_list_events`, `list_alerts`, `get_alert_details`, `kubernaut_investigate_alert` |
| `cicd` | `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_watch`, `kubernaut_await_session` |
| `observability` | `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_watch`, `kubernaut_await_session`, `kubernaut_get_effectiveness`, `kubernaut_list_workflows` |
| `l3-audit` | `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_list_workflows`, `kubernaut_get_remediation_history`, `kubernaut_get_effectiveness`, `kubernaut_get_audit_trail` |
| `remediation-approver` | `kubernaut_approve`, `kubernaut_list_approval_requests`, `kubernaut_get_approval_request`, `kubernaut_list_remediations`, `kubernaut_get_remediation`, `kubernaut_watch`, `kubernaut_await_session` |

**Custom ClusterRoles** — For fine-grained tool authorization beyond built-in personas, reference pre-created ClusterRoles using `clusterRoleName` instead of `role`:

```yaml
apiFrontend:
  rbac:
    roleBindings:
      - role: sre
        groups: ["senior-sres"]
      - clusterRoleName: kubernaut-restricted-investigator
        groups: ["junior-sres"]
      - clusterRoleName: kubernaut-approver
        groups: ["change-advisory-board"]
```

`role` and `clusterRoleName` are mutually exclusive within a single binding entry. Create the ClusterRoles before applying the Kubernaut CR. Each grants verb `use` on resource `tools` in apiGroup `kubernaut.ai` with specific `resourceNames`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubernaut-restricted-investigator
rules:
  - apiGroups: ["kubernaut.ai"]
    resources: ["tools"]
    verbs: ["use"]
    resourceNames:
      - kubernaut_investigate
      - kubernaut_watch
      - kubernaut_await_session
      - kubernaut_status
      - kubectl_get
      - kubectl_list
      - kubectl_list_events
```

**Console access specifically** is gated by a second, separate field, `spec.apiFrontend.rbac.consoleAccessGroups` — but you do **not** need to set it explicitly in the common case: when left unset, the operator automatically derives it as the deduplicated union of every group already listed in `roleBindings` above, so any persona group you configure here also gets Console access automatically. Only set `consoleAccessGroups` explicitly if you need it to differ from your tool-persona groups (e.g. a narrower or entirely separate set).

#### kagenti Integration (A2A) {: #kagenti-integration }

!!! info "A2A agent integration only — not required for Console or AF's own OIDC auth"
    The following steps apply **only** when enabling `spec.apiFrontend.spire.enabled: true` for A2A agent-to-agent communication. They do **not** apply to Console's browser-based OIDC login or to AF's own user/API JWT authentication (`spec.apiFrontend.auth.*`), which work against any OIDC provider without kagenti installed at all. If you are using the Gateway path only, or using AF/Console with `spire.enabled: false` and a standalone OIDC provider, skip this section entirely — but do **not** skip [Required: API Frontend & Console Authorization (RBAC)](#af-console-rbac-required) above, which applies either way.

The API Frontend integrates with [kagenti](https://github.com/kagenti/kagenti) for A2A agent communication via SPIRE/authbridge sidecar injection. kagenti must be installed and healthy **before** deploying Kubernaut, but only if you need this A2A capability.

The kagenti integration depends on your OCP and kagenti version:

=== "OCP 4.19+ / kagenti v0.6.0+"

    **Prerequisite** — Verify kagenti is running with SPIRE:

    ```bash
    oc get pods -n kagenti-system
    oc get spireclusterconfig
    ```

    The SPIRE class name must match `spec.apiFrontend.spire.className` in the Kubernaut CR. The default is `zero-trust-workload-identity-manager-spire`.

    **Auto-managed resources** — When `spec.apiFrontend.spire.enabled: true` (the default when omitted), the kubernaut-operator automatically:

    1. **Labels the namespace** — adds `kagenti-enabled=true` to `kubernaut-system`, triggering kagenti's mutating webhook to inject the authbridge sidecar into API Frontend pods
    2. **Sets PSA labels** — adds `pod-security.kubernetes.io/enforce: privileged` to the namespace, required for SPIRE sidecar injection
    3. **Creates an `AgentRuntime` CR** — provisions an `AgentRuntime` named `apifrontend` in `kubernaut-system`, telling kagenti to provision ConfigMaps, SCCs, and Keycloak client registrations

    Verify the `AgentRuntime` CR is created and active:

    ```bash
    oc get agentruntime -n kubernaut-system
    # Expected: NAME=apifrontend, PHASE=Active
    ```

    **SecurityContextConstraints** — The kagenti sidecar requires the `kagenti-authbridge` SCC:

    ```bash
    oc adm policy add-scc-to-user kagenti-authbridge -z apifrontend -n kubernaut-system
    ```

    **kagenti ConfigMaps** — These are automatically provisioned by the kagenti operator when it reconciles the `AgentRuntime` CR. Verify they exist:

    ```bash
    oc get configmap -n kagenti-system envoy-config spiffe-helper-config authbridge-config
    ```

    If any are missing, check the kagenti-operator logs for errors.

=== "OCP 4.18 / kagenti v0.5.1"

    Authbridge sidecar injection is **not functional** without SPIRE in kagenti v0.5.1. The authbridge webhook exists but requires SPIRE SVIDs to operate. Disable SPIRE in the CR:

    ```yaml
    spire:
      enabled: false
    ```

    The AF runs in standalone mode (1/1 pod) with direct OIDC authentication. No SCC grants, namespace labels, or AgentRuntime CRs are needed. Skip to the Keycloak configuration below.

    !!! warning
        You must set `spec.apiFrontend.spire.enabled: false` explicitly. Omitting the field results in `true` (CRD default), which causes the operator to label the namespace and attempt sidecar injection.

**Keycloak Group Mapper** — The API Frontend authorizes tool access via SAR based on OIDC group claims. Keycloak must include group membership in tokens:

1. In the Keycloak admin console (`kagenti` realm), go to **Client scopes** → **Create client scope**
2. Create a scope named `groups` (protocol: `openid-connect`)
3. Add a **Group Membership** mapper:

    | Setting | Value |
    |---|---|
    | Token claim name | `groups` |
    | Full group path | `off` |
    | Add to ID token | `on` |
    | Add to access token | `on` |

4. Assign the `groups` scope as a **Default** scope on the `kagenti` client
5. Create a group (e.g. `platform-engineering`) and assign users who need tool access

!!! tip
    Users must log out and log back in after being added to a group or after the `groups` scope is created. Stale tokens will have an empty groups array and SAR checks will fail.

**Keycloak Audience Mapper** — For kagenti to authenticate with the API Frontend (SPIRE-enabled environments only), the token's `aud` claim must include the AF's SPIFFE ID:

```
spiffe://<trust-domain>/ns/kubernaut-system/sa/apifrontend
```

Add a client scope `agent-kubernaut-system-apifrontend-aud` with an `oidc-audience-mapper`:

| Setting | Value |
|---|---|
| `included.custom.audience` | `spiffe://<trust-domain>/ns/kubernaut-system/sa/apifrontend` |
| `access.token.claim` | `true` |
| `id.token.claim` | `false` |

Assign as a default scope to the `kagenti` client.

!!! note
    When SPIRE is disabled (OCP 4.18), the AF authenticates directly using the Keycloak realm URL as the audience (set in `spec.apiFrontend.auth.audience`). This audience mapper is not needed.

!!! note "Tool personas / RBAC roleBindings"
    `apiFrontend.rbac.roleBindings` and Console access authorization apply to **all** AF/Console deployments, not just kagenti/SPIRE-enabled ones — see [Required: API Frontend & Console Authorization (RBAC)](#af-console-rbac-required) above, before this section.

**Port configuration** — The operator auto-detects the kagenti version and adjusts ports:

- **kagenti 0.2.x** (envoy sidecar): AF listens on `8443`; metrics shifts to `9092`, health to `8082`
- **kagenti 0.3.x+** (authbridge-proxy): AF shifts to `8444`; authbridge-proxy takes `8443`

No manual configuration is needed.

#### OCP AlertManager Integration {: #ocp-alertmanager-integration }

!!! info "Gateway path only"
    This step applies only when using the Gateway for alert-driven remediation (`spec.gateway.enabled: true`).

Configure AlertManager to route alerts to the Gateway webhook. The Gateway authenticates signal sources via Kubernetes TokenReview + SAR. See the [AlertManager configuration](../operations/disconnected-install.md#alertmanager-ocp) for the full setup.

### Verify the Installation {: #operator-verification }

```bash
# Operator pod
oc get pods -n kubernaut-operator-system

# Kubernaut CR status
oc get kubernaut -n kubernaut-system

# All pods should be Running (db-migrate shows Completed)
oc get pods -n kubernaut-system

# CR phase should be Running
oc get kubernaut kubernaut -n kubernaut-system -o jsonpath='{.status.phase}'
```

If using the **AF/Console path**, also verify:

=== "OCP 4.19+ / SPIRE enabled"

    AF has sidecar containers injected by kagenti (3/3 for kagenti 0.2.x):

    ```bash
    oc get pods -n kubernaut-system -l app=apifrontend
    # Expected: 3/3 Running

    oc get agentcard -n kubernaut-system
    # Expected: SYNCED=True for apifrontend-deployment-card
    ```

=== "OCP 4.18 / SPIRE disabled"

    AF runs as a single container without the authbridge sidecar:

    ```bash
    oc get pods -n kubernaut-system -l app=apifrontend
    # Expected: 1/1 Running
    ```

### What the Operator manages

- Validates BYO PostgreSQL and Valkey secrets before deployment
- Runs embedded database schema migrations
- Installs and upgrades the 11 Kubernaut CRDs
- Deploys all 14 component workloads with RBAC, ConfigMaps, PDBs, admission webhooks, and NetworkPolicies
- Applies preferred pod anti-affinity to all deployments (spread across nodes by `kubernetes.io/hostname`)
- Configures OCP Routes and service-serving CA TLS
- Reports per-service readiness status on the `Kubernaut` CR
- Cleans up cluster-scoped RBAC and workflow namespace on CR deletion (workload CRDs are retained by design)

---

## Post-Installation

### Seed Workflows

Kubernaut requires **ActionType** and **RemediationWorkflow** CRDs to define what remediations are available. These are user-provided — you bring workflows tailored to your environment.

To get started quickly, the [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios) repository provides a reference catalog with 34 ActionTypes and ~28 RemediationWorkflows covering common scenarios (CrashLoopBackOff, memory leaks, stuck rollouts, etc.):

```bash
git clone https://github.com/jordigilh/kubernaut-demo-scenarios.git
cd kubernaut-demo-scenarios

# Apply ActionType CRDs
oc apply -f deploy/action-types/ -n kubernaut-system

# Seed RemediationWorkflows (skips unavailable infrastructure automatically)
./scripts/seed-workflows.sh

# Verify
oc get remediationworkflows -n kubernaut-system
```

See [Seed Demo Workflows](../operations/disconnected-install.md#seed-demo-workflows) for detailed step-by-step instructions.

For authoring your own workflows, see [Authoring Workflows](../user-guide/workflow-authoring.md) and the [Action Type reference](../user-guide/workflows.md#action-type-taxonomy).

## Resource Scope

After installation, Kubernaut only manages namespaces and resources that opt in via labels:

```bash
kubectl label namespace my-app kubernaut.ai/managed=true
```

See [Signals & Alert Routing](../user-guide/signals.md) for details on scope management.

## Troubleshooting

### ImagePullBackOff

```bash
oc describe pod <pod-name> -n kubernaut-system | grep -A5 "Events:"
oc get pod <pod-name> -n kubernaut-system -o jsonpath='{.spec.containers[0].image}'
```

Common causes:

- Image not mirrored — re-run `oc mirror`
- Mirror credentials not in global pull secret
- IDMS not applied — run `oc apply -f oc-mirror-workspace/results-*/`
- Verify: `oc get imagedigestmirrorset`

### API Frontend CrashLoopBackOff

=== "OCP 4.19+ / kagenti v0.6.0+"

    If the AF pod shows `CrashLoopBackOff` after the first 1–2 restarts, this is normal — the AF starts before the authbridge proxy is ready, causing transient K8s API connection failures. It self-heals after 2–3 restarts.

    If it persists, check:

    - `oc logs <af-pod> -c authbridge-proxy` for proxy errors
    - `oc logs <af-pod> -c apifrontend` for application errors
    - SCC is correctly configured: `oc adm policy add-scc-to-user kagenti-authbridge -z apifrontend -n kubernaut-system`
    - SPIRE agent is issuing SVIDs: `oc get clusterspiffeids -l app.kubernetes.io/component=apifrontend`
    - kagenti ConfigMaps exist: `oc get configmap -n kagenti-system envoy-config spiffe-helper-config authbridge-config`

=== "OCP 4.18 / kagenti v0.5.1"

    AF runs without a sidecar. Check application logs only:

    ```bash
    oc logs <af-pod> -c apifrontend
    ```

    Common causes: incorrect `auth.issuerURL`/`auth.audience` values, Keycloak unreachable, or missing OIDC client scope configuration.

### 401 Unauthorized — "invalid token audience"

The AF validates the JWT `aud` claim against `spec.apiFrontend.auth.audience`. A 401 with `"invalid token audience"` means the token's `aud` array does not contain the expected audience string.

**Diagnosis:**

```bash
oc logs <af-pod> -c apifrontend | grep "auth failed"
# For SPIRE-enabled: also check envoy
oc logs <af-pod> -c envoy-proxy | grep -E "authorized|rejected"
```

**Common causes:**

1. **CR audience mismatch** — The `kagenti` Keycloak client used for user authentication issues tokens with `azp: kagenti`, but the `aud` claim only contains values explicitly added via audience mappers — it does **not** automatically include the client ID itself. The realm issuer URL (e.g. `https://keycloak.../realms/kagenti`) is always present in `aud`. Set the CR audience to the realm URL to match all tokens from this realm:

    ```bash
    oc patch kubernaut kubernaut -n kubernaut-system --type merge -p '{
      "spec": {"apiFrontend": {"auth": {"audience": "https://<keycloak-host>/realms/kagenti"}}}
    }'
    ```

2. **Missing audience mapper** — If using a specific audience string, add an `oidc-audience-mapper` to the Keycloak client.

3. **Missing `groups` client scope** — The `groups` scope must be a default scope so the `groups` claim appears in the token. Verify: `echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '.groups'`

4. **AF pod not restarted after CR patch** — The AF reads its config at startup. After patching the CR, restart the AF pod: `oc delete pod -n kubernaut-system -l app=apifrontend`

**Verify** by decoding a fresh token:

```bash
TOKEN=$(curl -sk -X POST "https://<keycloak-host>/realms/kagenti/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=kagenti&client_secret=<secret>&username=<user>&password=<pass>" \
  | jq -r '.access_token')
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{aud, azp, groups, preferred_username}'
```

### 401/403 — Missing Tool Persona RBAC Bindings

If the token validates but tool calls return 403, the user's OIDC groups are not bound to tool persona ClusterRoles. Verify CRBs exist:

```bash
oc get clusterrolebinding -l app.kubernetes.io/part-of=kubernaut | grep tool
```

If empty, add `roleBindings` to the CR — see [Required: API Frontend & Console Authorization (RBAC)](#af-console-rbac-required).

### Console shows "Access Denied" — missing `consoleAccessGroups` RBAC {: #console-access-denied }

**Symptom**: the Console loads and immediately shows "Access Denied — You don't have permission to use Kubernaut. Contact your administrator to request access", for some or all users.

**Root cause**: the Console performs a coarse-grained pre-flight check (`GET /a2a/access`) before rendering the chat UI — advisory/UX-only, but fail-closed. AF answers it with a `SubjectAccessReview` against a synthetic `kubernaut.ai/console` resource (`verb=use`), scoped to the caller's OIDC groups. A `403` from that SAR is exactly this screen (kubernaut#1919). See [Security & RBAC: Console-access authorization gate](../architecture/security-rbac.md#console-access-gate) for the full model.

For that SAR to succeed, the operator must have created a `ClusterRoleBinding` named `<namespace>-console-access-binding` — which it only does when the *effective* `consoleAccessGroups` (`spec.apiFrontend.rbac.consoleAccessGroups`, or the union of `roleBindings` groups if unset — see [Operator CR: APIFrontendRBACSpec](../api-reference/operator-cr.md#apifrontendrbacspec)) is non-empty.

!!! danger "Known gap: fresh CRs with `spec.apiFrontend.rbac` entirely unset (operator v1.5.8–v1.5.10)"
    If `spec.apiFrontend.rbac` was never configured at all (not even `roleBindings`), the effective group list is empty, so the `ClusterRoleBinding` is never created — and **everyone** gets "Access Denied", regardless of which OIDC group they're in. This affects `kubernaut-operator` v1.5.8 through v1.5.10 specifically (landed in v1.5.8-rc1; does not exist on v1.5.7 or earlier, since the console-access gate itself didn't exist yet). Tracked as kubernaut-operator#289.

    The operator also actively reconciles this CRB on every loop: if the effective group list is empty, it **deletes** any CRB with that exact name. Don't hand-create a `ClusterRoleBinding` named `<namespace>-console-access-binding` as a workaround — the operator will silently reap it on the next reconcile. Configure the CR instead (see Fix below).

**Diagnose:**

```bash
# What RBAC config does the CR currently have?
oc get kubernaut kubernaut -n kubernaut-system \
  -o jsonpath='{.spec.apiFrontend.rbac}{"\n"}'

# Confirm the console-access ClusterRole exists (operator always creates this
# when AF is enabled — should be present on operator v1.5.8+; NotFound means
# the operator predates v1.5.8 and doesn't support this gate at all)
oc get clusterrole kubernaut-system-console-access

# Confirm whether the console-access ClusterRoleBinding exists
oc get clusterrolebinding kubernaut-system-console-access-binding
```

If `roleBindings` already lists groups (e.g. persona-to-group mappings for `sre`, `ai-orchestrator`, etc.), the CRB should already exist and this is very likely a different problem — check the JWT `groups` claim instead (see [401 Unauthorized above](#401-unauthorized-invalid-token-audience) for how to decode a token and verify `groups`). AF also logs the exact denied groups at debug level: set `spec.apiFrontend.logging.level: debug` on the CR, retry in the browser, then `oc logs -n kubernaut-system deploy/apifrontend | grep "SAR denied access"`.

**Fix** (only if `roleBindings` has no groups at all):

```bash
oc patch kubernaut kubernaut -n kubernaut-system --type=merge -p \
  '{"spec":{"apiFrontend":{"rbac":{"consoleAccessGroups":["<YOUR-OIDC-GROUP-NAME>"]}}}}'
```

The operator reconciles within seconds and creates `clusterrolebinding.rbac.authorization.k8s.io/kubernaut-system-console-access-binding`. Verify with the `oc get clusterrolebinding` command above.

!!! warning "This alone may not be enough"
    If `spec.apiFrontend.rbac` was entirely unset — not just `consoleAccessGroups`, but `roleBindings` too — then every per-tool SAR gate (`kubernaut_approve`, `kubectl_get`, etc.) is also denied for everyone, not just this pre-flight check. Fixing only `consoleAccessGroups` gets users past "Access Denied," but they will immediately hit tool-call failures once inside the chat UI. Configure `spec.apiFrontend.rbac.roleBindings` at the same time — see [401/403 — Missing Tool Persona RBAC Bindings](#401403-missing-tool-persona-rbac-bindings) above. Once `roleBindings` includes a group, `consoleAccessGroups` doesn't need to be set separately for it — it's automatically included in the derived union.

### Console shows "Session expired, please sign in" or HTTP 400 after adding Keycloak mappers

If the `kubernaut-console` client's audience mapper and/or groups mapper (see [Console OIDC](#2-create-secrets)) were added or changed **after** a user had already logged into the Console at least once, that user may still see `Session expired, please sign in`, or an HTTP 400 from `oauth2-proxy`, even though the mapper configuration is now correct.

**Root cause:** The browser holds an `oauth2-proxy` session cookie tied to a Keycloak session/token minted **before** the mappers existed. `oauth2-proxy` transparently refreshes the *access token* via the refresh token on expiry, but the underlying Keycloak session — and the claims baked into tokens issued from it — do not automatically pick up newly added protocol mappers. The refreshed token can still be missing the `aud`/`groups` claims, or the stale session state can trigger an HTTP 400 from oauth2-proxy's callback/refresh handling.

**Fix:** Have the affected user fully clear cookies for the Console route's domain (or use a private/incognito window) and log in again, forcing a brand-new authorization-code flow against Keycloak that mints a token from scratch with the current mapper configuration.

Verify the new token has the expected claims before retrying in the browser:

```bash
TOKEN=$(curl -sk -X POST "$KC_URL/realms/$KC_REALM/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=kubernaut-console&client_secret=$CLIENT_SECRET&username=<user>&password=<pass>" \
  | jq -r '.access_token')
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{aud, groups}'
```

If `aud`/`groups` are correct here but the browser still fails, this confirms stale browser/session state rather than a Keycloak configuration problem.

**Alternative fix (forces re-auth for all Console users at once):** Instead of relying on each affected user to clear their own cookies, rotate the `cookie-secret` and restart the Console pod:

```bash
oc patch secret kubernaut-console-oidc -n kubernaut-system --type=json \
  -p='[{"op":"replace","path":"/data/cookie-secret","value":"'"$(openssl rand -hex 16 | base64)"'"}]'
oc delete pod -n kubernaut-system -l app=console
```

The operator wires `oauth2-proxy` with its default cookie session store (no `--session-store-type=redis`) — the entire session is encrypted client-side in the browser cookie using the `cookie-secret`. Rotating it makes every existing cookie undecryptable by the new pod, forcing every user through a fresh OIDC login. Trade-off: this logs out every Console user at once, versus the targeted per-user cookie-clear above.

### Console/chat returns an empty `{"kind": "Alert", "namespace": ""}` for "list active alerts"

If asking the assistant to "list active alerts" (or similar) returns a bare JSON object like `{"kind": "Alert", "namespace": ""}` instead of an actual alert list or a helpful message, `spec.monitoring.enabled` is `false` on the Kubernaut CR (or unset with a `false` default from an older CR).

**Root cause:** API Frontend only registers the dedicated `list_alerts`/`get_alert_details` tools (which query the OCP Thanos-querier) when `spec.monitoring.enabled: true`. When monitoring is disabled, those tools don't exist, so the LLM falls back to the generic `kubectl_list` tool and guesses `kind: "Alert"` — which is not a real Kubernetes/Kubernaut resource kind (alerts live in Prometheus, not as a CRD). The tool call fails to resolve a kind, and the raw tool-call arguments get surfaced back instead of a useful answer.

**Diagnosis:**

```bash
oc get kubernaut kubernaut -n kubernaut-system -o jsonpath='{.spec.monitoring.enabled}'
# "false" (or empty) confirms the cause
```

**Fix:**

```bash
oc patch kubernaut kubernaut -n kubernaut-system --type=merge -p '{"spec":{"monitoring":{"enabled":true}}}'
oc delete pod -n kubernaut-system -l app=apifrontend
```

`monitoring.enabled` defaults to `true` and auto-derives the in-cluster Thanos-querier/AlertManager URLs (`openshift-monitoring` namespace) — no extra Prometheus setup is required on OCP. This is independent of [OCP AlertManager Integration](#ocp-alertmanager-integration): that step routes firing alerts *into* Kubernaut (Gateway webhook) to auto-create RemediationRequests and requires `spec.gateway.enabled: true`, whereas `monitoring.enabled: true` is only needed for the assistant to *read* currently firing/pending alerts via `list_alerts`.

### Authbridge Client Identity (kagenti ≤ 0.2.0-rc.1)

!!! note "Automated in kubernaut-operator v1.5.2+"
    The operator now patches the authbridge `client_id` automatically via `ensureAuthbridgeClientID`. If you are using kubernaut-operator v1.5.2 or later, skip this section.

Affects kagenti-operator `0.2.0-rc.1` and earlier with kubernaut-operator < v1.5.2. The webhook does not mount `authbridge-runtime-config` into the envoy-proxy sidecar, leaving the authbridge with no `client_id` and rejecting all inbound JWT tokens.

**Symptom:** AF pod shows 3/3 Running but all authenticated requests return 401. Envoy logs: `JWT validation failed" error="audience is required (prevents confused deputy attacks)"`

**Workaround:**

```bash
TRUST_DOMAIN=$(oc get configmap authbridge-config -n kagenti-system \
  -o jsonpath='{.data.TRUST_DOMAIN}' 2>/dev/null || echo "localtest.me")

oc get configmap authbridge-runtime-config -n kubernaut-system -o json \
  | python3 -c "
import json, sys, yaml
cm = json.load(sys.stdin)
cfg = yaml.safe_load(cm['data']['config.yaml'])
cfg['identity']['client_id'] = 'spiffe://${TRUST_DOMAIN}/ns/kubernaut-system/sa/apifrontend'
cm['data']['config.yaml'] = yaml.dump(cfg, default_flow_style=False)
json.dump(cm, sys.stdout)
" | oc apply -f - 2>&1

oc delete pod -n kubernaut-system -l app=apifrontend
```

### kagenti-controller-manager Crash (OVN Routing)

If `kagenti-controller-manager` pods crash or the authbridge webhook has no endpoints, the OVN `routingViaHost` patch may be required:

```bash
oc patch network.operator.openshift.io cluster --type=merge \
  -p '{"spec":{"defaultNetwork":{"ovnKubernetesConfig":{"gatewayConfig":{"routingViaHost":true}}}}}'
```

Wait ~5 minutes for the network operator rollout, then verify kagenti pods recover.

### PostgreSQL Data Loss After Pod Restart

If DataStorage fails with `ERROR: relation "audit_events" does not exist`, the database was using ephemeral storage (`emptyDir`). Provision PVCs as described in [PostgreSQL and Valkey](#4-postgresql-and-valkey). After mounting the PVC, the operator runs the migration automatically on CR reconciliation.

### Migration Job Failure

```bash
oc logs job/kubernaut-db-migration -n kubernaut-system
```

Common causes:

- **`configmap "kubernaut-migrations" not found`** — The operator creates this ConfigMap during reconciliation. Ensure the Kubernaut CR has been reconciled first.
- **`secret "postgresql-secret" not found`** — Create the secret before applying the CR. Required keys: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- **SSL errors** — Check `spec.postgresql.sslMode` matches the PostgreSQL server configuration. Use `require` for self-signed certs, `verify-full` for service-CA provisioned certificates.

## Known Limitations

- **Single installation per cluster**: Cluster-scoped resources (ClusterRoles, ClusterRoleBindings, WebhookConfigurations) use static names. Installing multiple releases in different namespaces will cause conflicts.
- **Init container timeouts**: The `wait-for-postgres` init containers in DataStorage and the migration Job have no timeout. If PostgreSQL is unavailable, these containers will block indefinitely.

## Next Steps

- [Quickstart](quickstart.md) -- Trigger your first automated remediation
- [Architecture Overview](architecture-overview.md) -- Understand how the services work together
- [Configuration Reference](../user-guide/configuration.md) -- Tune Kubernaut for your environment
- [Rego Policies](../user-guide/policies.md) -- Customize classification and approval policies
- [Workflows](../user-guide/workflows.md) -- Author and register remediation workflows
