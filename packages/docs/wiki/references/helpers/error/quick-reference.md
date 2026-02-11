# Quick Reference

| Class/Function | Purpose |
|----------------|---------|
| **ApplicationError** | Custom error class with `statusCode` and `messageCode` |
| **getError()** | Utility to create `ApplicationError` instances |
| **appErrorHandler** | Middleware catching and formatting errors |

::: details Import Paths
```typescript
import { getError, ApplicationError } from '@venizia/ignis-helpers';
import type { TError } from '@venizia/ignis-helpers';
```
:::

## Error Response Format

| Environment | Includes |
|-------------|----------|
| **Production** | `message`, `statusCode`, `requestId` |
| **Development** | Above + `stack`, `cause`, `url`, `path` |
