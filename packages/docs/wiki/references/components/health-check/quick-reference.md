# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `HealthCheckComponent` |
| **Controller** | `HealthCheckController` |
| **Runtimes** | Both |

::: details Import Paths
```typescript
import { HealthCheckComponent, HealthCheckBindingKeys } from '@venizia/ignis';
import type { IHealthCheckOptions } from '@venizia/ignis';
```
:::

## Default Endpoints

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| `GET` | `/health` | Basic health check | `{ "status": "ok" }` |
| `POST` | `/health/ping` | Echo test | `{ "type": "PONG", "date": "...", "message": "..." }` |
