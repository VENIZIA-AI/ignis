---
title: JSX/HTML Utility - Full Reference
description: Complete reference for the JSX/HTML response helpers, defineJSXRoute, and Hono JSX component patterns
difficulty: beginner
---

# JSX/HTML Utility - Full Reference

Exhaustive reference for `htmlContent()`, `htmlResponse()`, and `BaseRestController.defineJSXRoute()`. For a readable introduction and the common tasks, start with the [JSX/HTML overview](/references/utilities/jsx).

**Files:**

- [`packages/core-server/src/utilities/jsx.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/utilities/jsx.utility.ts) - `htmlContent`, `htmlResponse`
- [`packages/core-server/src/base/controllers/rest/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/controllers/rest/base.ts) - `BaseRestController.defineJSXRoute`
- [`packages/core-server/src/base/controllers/rest/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/controllers/rest/abstract.ts) - `AbstractRestController.getJSXRouteConfigs`
- [`packages/helpers/src/common/jsx.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/jsx.ts) - `FC`, `PropsWithChildren`, `Child` (re-exported from `hono/jsx`)

## `htmlContent()`

Creates a standard OpenAPI content object for `text/html` responses.

`Source ->` [`packages/core-server/src/utilities/jsx.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/utilities/jsx.utility.ts)

```typescript
const htmlContent = (opts: { description: string; required?: boolean }) => ({
  description: opts.description,
  content: {
    'text/html': {
      schema: z.string().openapi({
        description: 'HTML content',
        example: '<!DOCTYPE html><html><head><title>Page</title></head><body>...</body></html>',
      }),
    },
  },
  required: opts.required ?? false,
});
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `description` | `string` | Yes | - | Description of the HTML content, shown in the generated OpenAPI document |
| `required` | `boolean` | No | `false` | Whether the content is required |

### Returns

An OpenAPI content configuration object: `description`, `content['text/html'].schema` (a `z.string()`), and `required`.

## `htmlResponse()`

Creates a standard OpenAPI response object for HTML endpoints. It pairs a success (`200`) HTML response with a JSON error response for `4xx | 5xx` status codes using `ErrorSchema`.

`Source ->` [`packages/core-server/src/utilities/jsx.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/utilities/jsx.utility.ts)

```typescript
const htmlResponse = (opts: { description: string; required?: boolean }) => ({
  [HTTP.ResultCodes.RS_2.Ok]: htmlContent({ description: opts.description, required: opts.required }),
  ['4xx | 5xx']: {
    description: 'Error Response',
    content: { 'application/json': { schema: ErrorSchema } },
  },
});
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `description` | `string` | Yes | - | Description of the successful HTML response |
| `required` | `boolean` | No | `false` | Whether the content is required |

### Returns

A responses object: `200` (via `htmlContent()`) plus `4xx | 5xx` (JSON `ErrorSchema`).

```typescript
import { htmlResponse } from '@venizia/ignis';

this.defineRoute({
  configs: {
    path: '/dashboard',
    method: 'get',
    responses: htmlResponse({ description: 'Dashboard HTML page' }),
  },
  handler: c => c.html(<h1>Dashboard</h1>),
});
```

## `BaseRestController.defineJSXRoute()`

Defines and registers a JSX/HTML route in a single call - the JSX counterpart of `defineRoute()`.

`Source ->` [`packages/core-server/src/base/controllers/rest/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/controllers/rest/base.ts)

```typescript
defineJSXRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
  configs: RouteConfig;
  handler: TRouteHandler<ResponseType, RouteEnv>;
  hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
}): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `configs` | `RouteConfig` (extends `IAuthRouteConfig`) | Yes | `path`, `method`, `responses`, plus the same `authenticate`/`authorize`/`request`/`middleware` fields `defineRoute` accepts |
| `handler` | `TRouteHandler<ResponseType, RouteEnv>` | Yes | Receives the route context (`TRouteContext`); return `c.html(<Component />)` |
| `hook` | `Hook<...>` | No | Same validation hook `defineRoute` accepts |

### Behavior

`defineJSXRoute` is `defineRoute` with one difference: it builds the route configuration through `getJSXRouteConfigs` instead of `getRouteConfigs`.

`Source ->` [`packages/core-server/src/base/controllers/rest/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/controllers/rest/abstract.ts)

```typescript
getJSXRouteConfigs<RouteConfig extends IAuthRouteConfig>(opts: { configs: RouteConfig }) {
  const { restConfig, security, mws } = this.buildRouteMiddlewares(opts);
  const { responses, tags = [] } = restConfig;

  return createRoute<string, RouteConfig>(
    Object.assign({}, restConfig, {
      middleware: mws,
      responses: Object.assign({}, htmlResponse({ description: 'HTML page' }), responses),
      tags: [...tags, this.scope],
      security,
    }) as any,
  );
}
```

- **Default response merged in first.** `htmlResponse({ description: 'HTML page' })` is the base object. Your own `responses` is merged over it with `Object.assign`, so any status code you declare (typically `200`) overrides the default entry with the same key.
- **Everything else matches `defineRoute`.** Auth middleware, tags (`this.scope` is always appended), and OpenAPI security are built the same way as JSON routes via `buildRouteMiddlewares`.
- **Handler contract is unchanged.** The handler still returns whatever `c.html(...)` produces (a `Response`). `defineJSXRoute` only changes how the route's OpenAPI shape is computed, not how the handler runs.

## JSX setup

### `tsconfig.json`

`.tsx` files compile against Hono's JSX runtime, not React's:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  }
}
```

Verified in [`packages/core-server/tsconfig.json`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/tsconfig.json) and the JSX example app's [`examples/rpc-api-server/tsconfig.json`](https://github.com/VENIZIA-AI/ignis/blob/main/examples/rpc-api-server/tsconfig.json).

### Component types

`FC`, `PropsWithChildren`, and `Child` are re-exported from `@venizia/ignis-helpers` (sourced from `hono/jsx`) - import them from there rather than reaching into `hono/jsx` directly. They live in `common/jsx.ts`, kept out of the `./common` barrel on purpose: `hono/jsx` types reach DOM-dependent JSX intrinsics and `hono` is an optional peer, so a Worker or hono-less consumer of `@venizia/ignis-helpers/common` must not carry that file in its type graph. The root barrel (`src/index.ts`) re-exports the file directly, which is why the three names still resolve from the package root.

`Source ->` [`packages/helpers/src/common/jsx.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/jsx.ts)

```typescript
export type { Child, FC, PropsWithChildren } from 'hono/jsx';
```

### No separate renderer

IGNIS registers no `jsxRenderer` middleware and no template engine. A handler builds a JSX tree and calls Hono's own `c.html()` on it - that call is what triggers rendering to an HTML string.

## Component patterns

### Layout composition

A layout component takes `children` (typed via `PropsWithChildren`) and wraps them in the surrounding document shell. Page components render into a layout the same way any JSX component nests another.

```tsx
import type { FC, PropsWithChildren } from '@venizia/ignis-helpers';

interface MainLayoutProps {
  title: string;
  description?: string;
}

export const MainLayout: FC<PropsWithChildren<MainLayoutProps>> = ({ title, description, children }) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
    </head>
    <body>
      <main>{children}</main>
    </body>
  </html>
);

interface HomePageProps {
  timestamp?: string;
}

export const HomePage: FC<HomePageProps> = ({ timestamp }) => (
  <MainLayout title="Home" description="Welcome to IGNIS">
    <h1>Welcome to IGNIS!</h1>
    {timestamp && <p>Page rendered at: {timestamp}</p>}
  </MainLayout>
);
```

### Wiring pages into a controller

```tsx
import { BaseRestController, controller, htmlContent, type IControllerOptions, type ValueOrPromise } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { HomePage } from '@/views/pages/home.page';

@controller({ path: '/' })
export class ViewController extends BaseRestController {
  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: ViewController.name, path: '/' });
  }

  override binding(): ValueOrPromise<void> {
    this.defineJSXRoute({
      configs: {
        path: '/',
        method: 'get',
        description: 'Home page rendered with JSX',
        tags: ['Views'],
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: htmlContent({ description: 'Home page HTML' }),
        },
      },
      handler: c => {
        const timestamp = new Date().toISOString();
        return c.html(<HomePage timestamp={timestamp} />);
      },
    });
  }
}
```

### Raw HTML with `dangerouslySetInnerHTML`

Hono JSX's intrinsic elements accept a `dangerouslySetInnerHTML` prop - an object with an `__html` string - matching React's escape hatch. Use it only for HTML you already trust (a stored template, sanitized markdown output) - never for unsanitized user input.

```tsx
async previewTemplate(c: TRouteContext) {
  const { templateId } = c.req.valid<{ templateId: string }>('param');
  const template = await this.emailService.getTemplate(templateId);

  return c.html(
    <html>
      <head>
        <title>Email Preview: {template.subject}</title>
      </head>
      <body>
        <div dangerouslySetInnerHTML={{ __html: template.html }} />
      </body>
    </html>,
  );
}
```

## Comparison with JSON utilities

### `htmlContent` vs `jsonContent`

| Aspect | `htmlContent()` | `jsonContent()` |
|--------|------------------|-------------------|
| Content type | `text/html` | `application/json` |
| Schema | `z.string()` | Caller-supplied Zod schema |
| Use case | HTML pages, JSX rendering | API responses, structured data |

### `htmlResponse` vs `jsonResponse`

| Aspect | `htmlResponse()` | `jsonResponse()` |
|--------|---------------------|----------------------|
| Success type | `text/html` (`200`) | `application/json` (`200`) |
| Error type | `application/json` (`4xx \| 5xx`) | `application/json` (`4xx \| 5xx`) |
| Use case | Server-rendered web pages | REST APIs |

See [Schema Utility](./schema.md) for `jsonContent`/`jsonResponse`.

## Route definition choices

`defineJSXRoute` is the recommended way to register a JSX route because it fills in a default HTML `200` response automatically. Two equivalent alternatives exist when you need more control:

| Approach | When to use |
|----------|-------------|
| `this.defineJSXRoute({ configs, handler })` | Default choice - HTML response shape is inferred, override `responses[200]` only if you need a custom description |
| `this.defineRoute({ configs: { responses: htmlResponse({ description }) }, handler })` | You want the full `responses` object built explicitly via `htmlResponse()`, without relying on the JSX default merge |
| `this.bindRoute({ configs }).to({ handler })` | Fluent two-step registration, same `configs` shape as either of the above |

Authentication and authorization on a JSX route use the same `configs.authenticate` / `configs.authorize` fields as JSON routes - see [Controllers](../base/controllers.md).

## See also

- [JSX/HTML overview](/references/utilities/jsx) - introduction and common tasks
- [Schema Utility](./schema.md) - `jsonContent`, `jsonResponse`, and the wider response-helper family
- [Controllers](../base/controllers.md) - `defineRoute`, `bindRoute`, route configuration, authentication
- **External:** [Hono JSX Documentation](https://hono.dev/docs/guides/jsx)
