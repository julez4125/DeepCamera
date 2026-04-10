# Required Dependencies for Database Layer

Add the following dependencies to `apps/api/package.json`:

## Production Dependencies

```json
{
  "dependencies": {
    "pg": "^8.11.0",
    "@types/pg": "^8.11.0"
  }
}
```

## Installation

```bash
cd platform/apps/api
npm install pg @types/pg
```

## Development/Testing Dependencies

The test file uses Vitest, which should already be configured in the project. Ensure the following are available:

```json
{
  "devDependencies": {
    "vitest": "^1.0.0"
  }
}
```

## Rationale

- **pg (node-postgres)**: Mature, well-maintained PostgreSQL client for Node.js
  - Native parameterized queries for SQL injection prevention
  - Connection pooling support
  - TypeScript support via @types/pg
  
- **@types/pg**: TypeScript type definitions for the pg library

These are low-level, stable dependencies without large dependency trees, keeping the project lightweight.
