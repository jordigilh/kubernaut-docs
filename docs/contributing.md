# Contributing

Kubernaut is an open-source project. Contributions are welcome.

## Getting Started

The main development repository is at [github.com/jordigilh/kubernaut](https://github.com/jordigilh/kubernaut).

### Prerequisites

- **Go 1.25+**
- **Kubernetes cluster** (Kind recommended)
- **kubectl** with cluster-admin access
- **Make** for build automation

### Clone and Build

```bash
git clone https://github.com/jordigilh/kubernaut.git
cd kubernaut
make build-all
```

### Run Tests

```bash
# Unit tests
make test-tier-unit

# Integration tests (requires Kind cluster)
make test-integration-gateway

# E2E tests (creates a full Kind cluster)
make test-e2e-gateway
```

## Development Standards

### Testing

- **Framework**: Ginkgo/Gomega BDD
- **Methodology**: TDD (RED → GREEN → REFACTOR)
- **Coverage target**: >=80% per tier (unit, integration, E2E)

### Code Quality

- All errors must be handled and logged
- Structured error types from `internal/errors/`
- No `interface{}` / `any` — use specific types
- CamelCase for YAML config fields (per CRD_FIELD_NAMING_CONVENTION)

### Pull Request Process

1. Create a feature branch from `main`
2. Implement with comprehensive tests (TDD)
3. Update relevant documentation
4. Submit PR for code review

## Documentation Contributions

This documentation site is maintained at [github.com/jordigilh/kubernaut-docs](https://github.com/jordigilh/kubernaut-docs).

### Local Preview

```bash
pip install -r requirements.txt
mkdocs serve
```

Then open [http://localhost:8000](http://localhost:8000).

### Structure

- `docs/getting-started/` — Installation and onboarding
- `docs/user-guide/` — Operator-facing guides
- `docs/architecture/` — Technical deep-dives
- `docs/api-reference/` — CRD and API specifications
- `docs/operations/` — Monitoring and troubleshooting

## Links

- [GitHub Issues](https://github.com/jordigilh/kubernaut/issues) — Bug reports and feature requests
- [GitHub Discussions](https://github.com/jordigilh/kubernaut/discussions) — Questions and ideas
- [Developer Guide](https://github.com/jordigilh/kubernaut/blob/main/docs/DEVELOPER_GUIDE.md) — Detailed development setup
