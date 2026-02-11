# Creating an Instance

## Singleton (Recommended)

A pre-configured `applicationEnvironment` singleton is auto-initialized at startup. It reads `process.env` and filters keys matching the configured prefix (default: `APP_ENV`).

```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

// Ready to use immediately
const jwtSecret = applicationEnvironment.get<string>('APP_ENV_JWT_SECRET');
```

> [!TIP]
> For most applications, the singleton is all you need. It is created once at module load time and shares the same filtered environment across your entire app.

## Custom Instance

If you need a different prefix or a custom set of environment variables, construct your own instance.

```typescript
import { ApplicationEnvironment } from '@venizia/ignis-helpers';

const customEnv = new ApplicationEnvironment({
  prefix: 'MY_APP_ENV',
  envs: process.env,
});

const host = customEnv.get<string>('MY_APP_ENV_SERVER_HOST');
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `string` | `'APP_ENV'` | Only keys starting with this prefix are included |
| `envs` | `Record<string, string \| number \| undefined>` | -- | The environment object to filter (typically `process.env`) |
