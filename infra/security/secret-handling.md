# Secret Handling Defaults

The platform follows these defaults for security-hardening work:

- Do not commit real secrets, API keys, or production credentials.
- Keep local-only defaults obviously synthetic, short-lived, and easy to override via environment variables.
- Prefer Kubernetes Secrets, external secret managers, or CI secret stores for production values.
- Treat any exported config file under `infra/` as non-secret unless explicitly documented otherwise.
- Keep public bucket exposure opt-in. `MINIO_PUBLIC_ASSETS=true` is required before the MinIO bootstrap script will publish read access.
- Review any new secret-like default in `infra/` together with the matching workflow guardrails.

The MinIO bootstrap script now defaults to private buckets and avoids echoing the secret key back to the console.
