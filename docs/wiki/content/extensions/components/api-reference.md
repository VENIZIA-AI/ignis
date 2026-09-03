# API Reference

Automatic interactive API documentation generated from your OpenAPI spec. A pluggable UI provider renders it - Scalar by default, or classic Swagger UI.

> [!NOTE] Renamed from SwaggerComponent
> Swagger UI is one of the pluggable UI providers, not the only one, so the component carries a vendor-neutral name. The deprecated `Swagger*` aliases are **removed**: use `ApiReferenceComponent`, `IApiReferenceOptions` and `ApiReferenceBindingKeys.API_REFERENCE_OPTIONS`.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `ApiReferenceComponent` |
| **UI Factory** | `UIProviderFactory` |
| **Runtimes** | Both |

| Provider | Value | When to use |
|----------|-------|-------------|
| **Scalar** | `'scalar'` | Modern, clean UI (default) |
| **Swagger UI** | `'swagger'` | Classic Swagger interface |

#### Import Paths
```typescript
import { ApiReferenceComponent, ApiReferenceBindingKeys, UIProviderFactory } from '@venizia/ignis';
import type { IApiReferenceOptions, IUIProvider, IUIConfig, IGetProviderParams } from '@venizia/ignis';
```

## In one example

Register the component - no configuration required. The docs UI comes up at `<app base path>/doc/explorer`, the raw spec at `<app base path>/doc/openapi.json`. With the `/api` base path used throughout the getting-started guide, that's `/api/doc/explorer`.

```typescript
// src/application.ts
import { ApiReferenceComponent, BaseApplication, ValueOrPromise } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.component(ApiReferenceComponent);
  }
}
```

Define routes with Zod schemas so they show up in the generated spec:

```typescript
// src/controllers/hello.controller.ts
import { z } from '@hono/zod-openapi';
import { BaseRestController, controller, jsonContent, ValueOrPromise } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

@controller({ path: '/hello' })
export class HelloController extends BaseRestController {
  constructor() {
    super({ scope: HelloController.name, path: '/hello' });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: {
        path: '/',
        method: 'get',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            description: 'A simple hello message',
            schema: z.object({ message: z.string() }),
          }),
        },
      },
      handler: (c) => {
        return c.json({ message: 'Hello, `IGNIS`!' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

> [!TIP]
> Only routes registered through `defineRoute`, `bindRoute`, or `@api()` with `@hono/zod-openapi` schemas appear in the generated spec.

## How it works

- **Options merge group by group.** `binding()` reads the bound `IApiReferenceOptions`, then shallow-merges `base`, `doc`, and `ui` each against their own defaults. Overriding `ui.type` alone still keeps `ui.path` and every `base`/`doc` field.
- **`explorer.info` is always overwritten.** The component reads your `package.json` via `application.getAppInfo()`. It replaces `explorer.info` with `{ title, version, description, contact }` - any `explorer.info` you bind is discarded. Edit `package.json` instead.
- **`explorer.servers` fills in only when empty.** A supplied server entry is kept as-is. Otherwise, the component builds one from `application.getServerAddress()` plus the base path.
- **UI type resolution uses `??`, not `||`.** The source is `restOptions.ui.type ?? DocumentUITypes.SWAGGER`. Only `null`/`undefined` falls back, and it falls back to `'swagger'` - not the configured default `'scalar'`.
  - An explicit empty string is NOT repaired by this fallback: it fails `DocumentUITypes.isValid()` and the component throws `Invalid document UI Type` immediately.
- **UI libraries load lazily.** `SwaggerUIProvider`/`ScalarUIProvider` each `await import()` their rendering library inside `render()`. That happens on the first request to the docs UI, not at application startup. Only the configured provider's library is ever loaded.
- **`ScalarUIProvider` renames `title` to `pageTitle`.** Scalar's own render API takes `pageTitle`, not `title` - worth knowing if you inspect the rendered output or write a custom UI provider.
- **Security schemes are always registered.** JWT (`bearer`) and Basic security schemes are added to the OpenAPI registry unconditionally. Routes using `authenticate: { strategies: ['jwt'] }` or `['basic']` render the correct auth UI as a result.

## Common tasks

### Switch to Swagger UI
```typescript
this.bind<IApiReferenceOptions>({
  key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS,
}).toValue({ restOptions: { ui: { type: 'swagger' } } });
```

### Move the docs under a different base path
```typescript
this.bind<IApiReferenceOptions>({
  key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS,
}).toValue({ restOptions: { base: { path: '/api-docs' } } });
```
Result: UI at `<app base path>/api-docs/explorer`, spec at `<app base path>/api-docs/openapi.json`. The group merge keeps `doc.path`/`ui.path` defaults.

### Set the info block shown in the UI
`explorer.info` always comes from `package.json`. Update `name`, `version`, `description`, and `author` there - binding `explorer.info` directly has no effect.

### Register a custom UI provider
`UIProviderFactory.register()` only understands `'swagger'`/`'scalar'`. Register a custom provider directly on the factory before `ApiReferenceComponent.binding()` runs:

```typescript
UIProviderFactory.getInstance().set('my-ui', new MyCustomUIProvider());
```

## Reference

### Options
```typescript
export interface IApiReferenceOptions {
  restOptions?: {
    base?: { path?: string };
    doc?: { path?: string };
    ui?: { path?: string; type?: TDocumentUIType };
  };
  explorer?: {
    openapi?: string;
    info?: {
      title: string;
      version: string;
      description: string;
      contact?: { name: string; email: string };
    };
    servers?: Array<{ url: string; description?: string }>;
  };
  uiConfig?: Record<string, any>;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restOptions.base.path` | `string` | `'/doc'` | Base path for all documentation routes |
| `restOptions.doc.path` | `string` | `'/openapi.json'` | Path to the raw OpenAPI spec (relative to base) |
| `restOptions.ui.path` | `string` | `'/explorer'` | Path to the documentation UI (relative to base) |
| `restOptions.ui.type` | `'swagger' \| 'scalar'` | `'scalar'` | UI provider type |
| `explorer.openapi` | `string` | `'3.0.0'` | OpenAPI specification version |
| `explorer.info.title` / `.version` / `.description` / `.contact` | - | Always sourced from `package.json` | Overwritten at runtime - binding values are discarded |
| `explorer.servers` | `Array<{ url, description? }>` | Auto-detected when empty | Server URLs |
| `uiConfig` | `Record<string, any>` | `undefined` | Custom config passed through to the UI provider |

### Binding keys
| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/api-reference/options` | `ApiReferenceBindingKeys.API_REFERENCE_OPTIONS` | `IApiReferenceOptions` | No | See Options table |

`SwaggerBindingKeys.SWAGGER_OPTIONS` is removed. It was only ever an alias for the key above - there was never a separate binding under the literal `'@app/swagger/options'`, so nothing needs rebinding.

**Default value:**
```typescript
const DEFAULT_API_REFERENCE_OPTIONS: IApiReferenceOptions = {
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'scalar' },
  },
  explorer: {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
      description: 'API documentation for your service',
    },
  },
};
```

> [!NOTE]
> The `explorer.info` values above are never used at runtime - `binding()` unconditionally overwrites `explorer.info` from `package.json`. They exist only as structural defaults.

### API endpoints
| Method | Path (default, relative to app base) | Description |
|--------|-----------------|-------------|
| `GET` | `/doc/explorer` | Documentation UI (Scalar by default) |
| `GET` | `/doc/openapi.json` | Raw OpenAPI specification |

These paths are mounted under your application's own base path - `path.base` in `IApplicationConfigs`. With the `/api` base path from the getting-started guide, that's `GET /api/doc/explorer`. They also shift with `restOptions.base.path`, `restOptions.ui.path`, and `restOptions.doc.path`.

### UIProviderFactory
| Method | Signature | Description |
|--------|-----------|-------------|
| `getInstance()` | `static () => UIProviderFactory` | Returns the singleton instance |
| `register()` | `(opts: { type: string }) => void` | Instantiates and registers a built-in provider; idempotent - warns and returns if the type is already bound |
| `getProvider()` | `(opts: IGetProviderParams) => IUIProvider` | Returns the registered provider or throws `Unknown UI Provider` |
| `getRegisteredProviders()` | `() => string[]` | Lists all registered provider type keys |

Extends `MemoryStorageHelper<{ [key: string | symbol]: IUIProvider }>`, using `isBound()` / `get()` / `set()` / `keys()` for lightweight, type-safe storage without the full DI container.

### Type definitions
```typescript
type TDocumentUIType = TConstValue<typeof DocumentUITypes>;

class DocumentUITypes {
  static readonly SWAGGER = 'swagger';
  static readonly SCALAR = 'scalar';
  static readonly SCHEME_SET: Set<string>;
  static isValid(input: string): boolean;
}
```

`TDocumentUIType` is derived via `TConstValue`, which extracts the union of every `static readonly` string on `DocumentUITypes`. The type stays in sync with the constants automatically.

### Component lifecycle (`binding()`)
1. **Resolve options** - reads `ApiReferenceBindingKeys.API_REFERENCE_OPTIONS` with `isOptional: true`, then merges `base`/`doc`/`ui` each against `DEFAULT_API_REFERENCE_OPTIONS`
2. **Overwrite info** - reads `package.json` via `application.getAppInfo()` and replaces `explorer.info`
3. **Auto-detect servers** - builds one entry from `application.getServerAddress()` when `explorer.servers` is empty
4. **Normalize paths** - ensures every path segment (`base.path`, `doc.path`, `ui.path`) has a leading `/`
5. **Register the OpenAPI doc route** - `rootRouter.doc(docPath, explorer)`
6. **Resolve `uiType`** - `restOptions.ui.type ?? DocumentUITypes.SWAGGER`
7. **Validate and register the UI provider** - via `UIProviderFactory`, unless a provider with that type is already bound
8. **Register the UI route** - `GET` handler at `uiPath` calling `uiProvider.render()`
9. **Register JWT and Basic security schemes** on the OpenAPI registry

### Tech stack
| Library | Purpose |
|---------|---------|
| `@hono/zod-openapi` | OpenAPI generation from Zod schemas |
| `@hono/swagger-ui` | Swagger UI rendering |
| `@scalar/hono-api-reference` | Scalar UI rendering |
| `zod` | Schema validation and type generation |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Invalid document UI Type` | `restOptions.ui.type` is not `'swagger'` or `'scalar'` - an explicit empty string is NOT repaired by the `??` fallback | Use `'scalar'` or `'swagger'` explicitly |
| Documentation UI shows no routes | Controllers aren't defining routes with Zod schemas via `defineRoute`, `bindRoute`, or `@api()` | Add Zod response schemas to your route configs |
| `Unknown UI Provider` | `UIProviderFactory.getProvider()` was called with a type that was never registered - usually a failed `binding()` | Ensure `ApiReferenceComponent` is registered in `preConfigure()`; check logs for warnings during binding |
| OpenAPI spec missing authentication schemes | `AuthenticationComponent` isn't registered, so auth strategies aren't available when schemes are added | Register `AuthenticationComponent` before `ApiReferenceComponent` in `preConfigure()` |
| `explorer.info` doesn't match my binding | `explorer.info` is always overwritten from `package.json` during `binding()` | Update `package.json` fields (`name`, `version`, `description`, `author`) instead |

## See also

- **Guides:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Controllers](/guides/core-concepts/rest-controllers) - Defining OpenAPI routes

- **Components:**
  - [All Components](./index) - Built-in components list
  - [Authentication](./authentication/) - JWT/Basic auth for secured endpoints

- **Utilities:**
  - [Schema Utilities](/references/utilities/schema) - Response schema helpers
  - [JSX Utilities](/references/utilities/jsx) - HTML response schemas

- **External Resources:**
  - [OpenAPI Specification](https://swagger.io/specification/) - OpenAPI standard
  - [Scalar Documentation](https://github.com/scalar/scalar) - Scalar API documentation UI
  - [@hono/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) - Hono OpenAPI integration

**Files:**

- [`packages/core-server/src/components/api-reference/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/api-reference/component.ts) - `ApiReferenceComponent`
- [`packages/core-server/src/components/api-reference/ui-factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/api-reference/ui-factory.ts) - `UIProviderFactory`, `SwaggerUIProvider`, `ScalarUIProvider`
- [`packages/core-server/src/components/api-reference/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/api-reference/common/types.ts) - `IApiReferenceOptions`, `IUIProvider`, `IUIConfig`
- [`packages/core-server/src/components/api-reference/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/api-reference/common/keys.ts) - `ApiReferenceBindingKeys`
- [`packages/core-server/src/components/api-reference/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/api-reference/common/constants.ts) - `DocumentUITypes`
