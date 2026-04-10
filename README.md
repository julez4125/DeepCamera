# AI-NVR Platform

Monorepo for the AI-NVR control plane, operator UI, API, orchestration services, shared contracts, and specialist workers.

## Current State

Phase 1 through Wave D are implemented in this repo.

- Wave A: monorepo foundation, API, web shell, shared contracts, auth and RBAC baseline
- Wave B: timeline, recordings, clips, evidence flow, storage targets and replication foundations
- Wave C: incidents, alert routes, search, VLM enrichment, operator workflows
- Wave D: specialized intelligence and model lifecycle
  - LPR, face matching, and Re-ID review flows
  - annotation task generation
  - dataset, training job, model registry, and deployment lifecycle APIs
  - live dashboard integration for Wave D

The repo is set to Node `25.x` at the root.

## Workspace Layout

- `apps/web`
  Next.js 15 operator interface with the live dashboard, timeline, search, incidents, Wave C, and Wave D surfaces.
- `apps/api`
  Fastify 5 API with JWT auth, RBAC, camera/timeline/media routes, incidents, search, alerting, specialized intelligence, and ML lifecycle routes.
- `apps/orchestrator`
  Worker supervision, storage replication, and orchestration logic for media and downstream jobs.
- `packages/contracts`
  Shared Zod schemas and TypeScript contracts used across API, web, and services.
- `packages/ui`
  Shared UI building blocks.
- `packages/test-utils`
  Shared fixtures and testing helpers.
- `workers/lpr-reader`
  Deterministic plate detection/OCR/watchlist worker.
- `workers/face-matcher`
  Deterministic opt-in face matching worker with watchlist-aware events.
- `workers/reid-linker`
  Deterministic cross-camera Re-ID worker with movement-hint events.

## Verified Commands

From the repo root:

```bash
pnpm install
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

Worker validation:

```bash
python3 -m unittest discover -s workers/lpr-reader/tests -p 'test_*.py'
python3 -m unittest discover -s workers/face-matcher/tests -p 'test_*.py'
python3 -m unittest discover -s workers/reid-linker/tests -p 'test_*.py'
```

## Important Notes

- `.env.development` is intentionally local and ignored.
- The repo inside `platform/` is the active project repo.
- The outer `DeepCamera/` repository is separate legacy/upstream context and should not be used for platform commits.

## Next Step

Once this commit is pushed, the next planned implementation target is Wave E.
