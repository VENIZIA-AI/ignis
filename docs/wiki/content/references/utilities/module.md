# Module Utility

The Module utility provides a pre-flight check for optional peer dependencies. IGNIS helpers and components often depend on packages that are not bundled with the framework (for example, `@connectrpc/connect` for gRPC, `@hono/swagger-ui` for the Swagger component). Calling `validateModule` at the start of a lazy-loaded code path ensures a clear, actionable error is thrown before any import is attempted, rather than a cryptic "Cannot find module" crash.

Resolution is rooted at `process.cwd()/node_modules` via Node's `createRequire`, so peer dependencies installed in the consuming application are found correctly even though this utility lives inside `packages/helpers/dist/`.

## `validateModule`

Resolves each module name in sequence using `require.resolve`. If any module cannot be found it logs the failure and throws an `ApplicationError` with an install instruction. Returns a `Promise<void>` - it is async to support consistent `await` usage at call sites, though resolution itself is synchronous.

### Signature

```typescript
validateModule(opts: {
  scope?: string;
  modules: Array<string>;
}): Promise<void>
```

**Options**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `modules` | `Array<string>` | `[]` | Module names to check. Evaluated in order - the first missing module stops the loop and throws. |
| `scope` | `string` | `''` | Human-readable label for the calling feature (e.g. the component or helper class name). Included in the error message to tell the developer which feature needs the package. |

### Error message format

When a module is missing the thrown error reads:

```
[validateModule] <module> is required for <scope>. Please install '<module>'
```

If `scope` is omitted:

```
[validateModule] <module> is required. Please install '<module>'
```

### Example - gRPC controller (optional dep guard)

The `GrpcRequestAdapter` uses `validateModule` to gate the ConnectRPC import. The check runs once before the adapter is wired up, so the error surfaces at startup rather than on the first request.

```typescript
import { validateModule } from '@venizia/ignis-helpers';

const GRPC_MODULES = ['@connectrpc/connect'];

export class MyGrpcController extends BaseGrpcController {
  async configure() {
    // Fails fast with a clear install instruction if the peer dep is absent
    await validateModule({ scope: MyGrpcController.name, modules: GRPC_MODULES });

    const { ConnectRouter } = await import('@connectrpc/connect');
    // ... register routes
  }
}
```

### Example - custom helper with multiple optional deps

When a feature requires several packages, list them all. The first missing one stops the check.

```typescript
import { validateModule } from '@venizia/ignis-helpers';
import { BaseHelper } from '@venizia/ignis-helpers';

export class KafkaQueueHelper extends BaseHelper {
  async configure() {
    await validateModule({
      scope: KafkaQueueHelper.name,
      modules: ['kafkajs', 'kafkajs-snappy'],
    });

    const { Kafka } = await import('kafkajs');
    // ... initialise Kafka client
  }
}
```

## When to use

Use `validateModule` whenever your code does a dynamic `import()` of a package that is listed as an optional peer dependency in `package.json`. The recommended pattern is:

1. Declare the dep as `peerDependenciesMeta` with `optional: true` in `package.json`.
2. Call `validateModule` at the top of the method that needs the package - before any `import()`.
3. Pass the feature or class name as `scope` so the error message pinpoints which feature triggered the check.

Avoid calling `validateModule` on every request. Place it in an initialisation hook (`configure`, `binding`, `boot`) that runs once at startup.
