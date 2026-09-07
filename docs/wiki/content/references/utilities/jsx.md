---
title: JSX/HTML Utility
description: Render server-side HTML pages with Hono JSX and document them for OpenAPI
difficulty: beginner
---

# JSX/HTML Utility

IGNIS renders HTML pages server-side with Hono's built-in JSX support, and documents those routes for OpenAPI with `htmlContent()` / `htmlResponse()`.

## In one example

The smallest real JSX route: a controller that renders a component through `defineJSXRoute`.

```tsx
import { BaseRestController, controller, htmlContent, type IControllerOptions } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

@controller({ path: '/' })
export class ViewController extends BaseRestController {
  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: ViewController.name, path: '/' });
  }

  override binding() {
    this.defineJSXRoute({
      configs: {
        path: '/',
        method: 'get',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: htmlContent({ description: 'Home page HTML' }),
        },
      },
      handler: c => c.html(<h1>Welcome to IGNIS</h1>),
    });
  }
}
```

No separate JSX renderer is registered - the handler builds a JSX tree and hands it to Hono's own `c.html()`.

## How it works

- **Hono JSX renders to HTML.** A handler returns `c.html(<Component />)`; Hono's built-in JSX runtime turns the tree into an HTML string. IGNIS adds nothing on top of that renderer.
- **`defineJSXRoute` is `defineRoute` with an HTML default.** It builds route configs through `getJSXRouteConfigs` instead of `getRouteConfigs`, which merges a default `htmlResponse({ description: 'HTML page' })` under whatever `responses` you declare - your own `200` entry overrides the default description.
- **`htmlContent()` / `htmlResponse()` document `text/html`.** They mirror `jsonContent()` / `jsonResponse()` (see [Schema Utility](./schema.md)) but for HTML: `htmlContent()` builds one OpenAPI content object, `htmlResponse()` wraps it into a full `200` success response plus a JSON `4xx | 5xx` error response.
- **The tsconfig switch is required.** Compiling `.tsx` files with Hono's JSX needs `"jsx": "react-jsx"` and `"jsxImportSource": "hono/jsx"` in `tsconfig.json`.

## Common tasks

### Build a reusable layout

Compose pages from a shared layout using `FC` and `PropsWithChildren`, re-exported from `@venizia/ignis-helpers` (sourced from `hono/jsx`).

```tsx
import type { FC, PropsWithChildren } from '@venizia/ignis-helpers';

export const MainLayout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html>
    <head>
      <title>{title}</title>
    </head>
    <body>{children}</body>
  </html>
);
```

### Pass props into a page component

Page components take a typed props object like any other Hono JSX component.

```tsx
interface HomePageProps {
  timestamp?: string;
}

export const HomePage: FC<HomePageProps> = ({ timestamp }) => (
  <MainLayout title="Home">
    <h1>Welcome</h1>
    {timestamp && <p>Rendered at {timestamp}</p>}
  </MainLayout>
);
```

### Render trusted raw HTML

Use `dangerouslySetInnerHTML` for content that is already HTML, such as a stored email or blog template - never for unsanitized user input.

```tsx
<div dangerouslySetInnerHTML={{ __html: template.html }} />
```

### Give the response a custom description

Pass your own `200` entry in `responses` - it overrides the `defineJSXRoute` default description.

```tsx
responses: {
  [HTTP.ResultCodes.RS_2.Ok]: htmlContent({ description: 'Dashboard HTML page' }),
},
```

### Guard a page with authentication

JSX routes accept the same `authenticate` config as JSON routes.

```tsx
this.defineJSXRoute({
  configs: {
    path: '/admin',
    method: 'get',
    authenticate: { strategies: ['jwt'] },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: htmlContent({ description: 'Admin dashboard' }),
    },
  },
  handler: c => c.html(<AdminDashboard />),
});
```

## See also

- [Full reference](/references/utilities/jsx-reference) - every function, `defineJSXRoute` behavior, and component patterns
- [Schema Utility](./schema.md) - the JSON-side helpers (`jsonContent`, `jsonResponse`) this pairs with
- [Controllers](../base/controllers.md) - `defineRoute`/`bindRoute`, `authenticate`/`authorize` config
- **External:** [Hono JSX Documentation](https://hono.dev/docs/guides/jsx)

**Files:**

- [`packages/kernel/src/utilities/jsx.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/utilities/jsx.utility.ts) - `htmlContent`, `htmlResponse`
- [`packages/kernel/src/base/controllers/rest/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/rest/base.ts) - `defineJSXRoute`
