# Kubernaut Documentation

Source for the [Kubernaut](https://github.com/jordigilh/kubernaut) documentation site, published at **<https://jordigilh.github.io/kubernaut-docs/>**.

## Prerequisites

- Python 3.12+
- pip

## Local development

```bash
# Install dependencies
pip install -r requirements.txt

# Serve locally with live-reload
mkdocs serve
```

Open <http://localhost:8000> to preview the site.

## Build

```bash
mkdocs build --strict
```

The `--strict` flag turns warnings (broken links, missing pages) into errors.

## Versioning

This site uses [mike](https://github.com/jimporter/mike) for multi-version documentation. Versions are deployed via the GitHub Actions workflow on push to `main`.

```bash
# Deploy a specific version locally
mike deploy v1.4 latest --update-aliases

# List deployed versions
mike list
```

## Project layout

```
docs/
├── index.md                 # Home page
├── getting-started/         # Installation and onboarding
├── user-guide/              # Operator-facing guides
├── architecture/            # Technical deep-dives
├── api-reference/           # CRD and API specifications
├── operations/              # Monitoring and troubleshooting
├── use-cases/               # Real-world scenarios
├── whats-new/               # Release notes
├── whats-next/              # Roadmap
└── assets/
    ├── extra.css            # Custom styles
    └── images/              # Diagrams and logos
mkdocs.yml                   # Site configuration
requirements.txt             # Python dependencies
```

## Contributing

See [Contributing](https://jordigilh.github.io/kubernaut-docs/latest/contributing/) for guidelines on code, tests, and documentation contributions.

## License

[Apache License 2.0](LICENSE)
