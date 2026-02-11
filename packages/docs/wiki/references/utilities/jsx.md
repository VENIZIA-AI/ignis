---
title: JSX/HTML Utilities Reference
description: Utilities for HTML and JSX responses in OpenAPI routes
difficulty: beginner
lastUpdated: 2026-01-03
---

# JSX/HTML Utility

The JSX utility provides helper functions for defining HTML/JSX response schemas in OpenAPI routes. These utilities are companions to `jsonContent` and `jsonResponse` but for HTML content type.

**File:** `packages/core/src/utilities/jsx.utility.ts`

## Quick Reference

| Function | Purpose | Returns |
|----------|---------|---------|
| `htmlContent()` | Create HTML content configuration | OpenAPI content object |
| `htmlResponse()` | Create HTML response with error handling | OpenAPI response object |

## When to Use

Use these utilities when creating routes that:
- Render HTML pages using Hono JSX
- Return server-side rendered content
- Serve HTML documentation or views
- Generate HTML emails or reports

## htmlContent()

Creates a standard OpenAPI content object for `text/html` responses.

### Signature

```typescript
function htmlContent(opts: {
  description: string;
  required?: boolean;
}): {
  description: string;
  content: {
    'text/html': {
      schema: ZodString;
    };
  };
  required: boolean;
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `description` | `string` | Yes | - | Description of the HTML content |
| `required` | `boolean` | No | `false` | Whether the content is required |

### Returns

Returns an OpenAPI content configuration object with:
- `description`: The provided description
- `content`: Content type configuration for `text/html`
- `required`: Whether the content is required

### Example

```typescript
import { htmlContent } from '@venizia/ignis';

const pageContent = htmlContent({
  description: 'HTML page content',
  required: true,
});

// Result:
// {
//   description: 'HTML page content',
//   content: {
//     'text/html': {
//       schema: z.string().openapi({
//         description: 'HTML content',
//         example: '<!DOCTYPE html><html>...</html>',
//       }),
//     },
//   },
//   required: true,
// }
```


## htmlResponse()

Creates a standard OpenAPI response object for HTML endpoints, including success (200 OK) HTML response and JSON error responses for 4xx/5xx status codes.

### Signature

```typescript
function htmlResponse(opts: {
  description: string;
  required?: boolean;
}): {
  200: typeof htmlContent;
  '4xx | 5xx': {
    description: 'Error Response';
    content: {
      'application/json': {
        schema: ErrorSchema;
      };
    };
  };
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `description` | `string` | Yes | - | Description of the successful HTML response |
| `required` | `boolean` | No | `false` | Whether the content is required |

### Returns

Returns an OpenAPI responses object with:
- `200`: Success response with HTML content
- `4xx | 5xx`: Error responses with JSON error schema

### Example

```typescript
import { htmlResponse } from '@venizia/ignis';

this.defineRoute({
  configs: {
    path: '/dashboard',
    method: 'get',
    responses: htmlResponse({
      description: 'Dashboard HTML page',
    }),
  },
  handler: async (context) => {
    return context.html(
      <html>
        <head>
          <title>Dashboard</title>
        </head>
        <body>
          <h1>Welcome to Dashboard</h1>
        </body>
      </html>
    );
  },
});
```


## Usage Examples

### Basic HTML Route

```typescript
import { BaseController, get, htmlResponse } from '@venizia/ignis';

export class PageController extends BaseController {
  @get({
    path: '/home',
    responses: htmlResponse({
      description: 'Home page HTML',
    }),
  })
  async getHomePage() {
    return this.context.html(
      <html>
        <head>
          <title>Home</title>
        </head>
        <body>
          <h1>Welcome Home</h1>
        </body>
      </html>
    );
  }
}
```

### HTML Email Preview

```typescript
import { BaseController, get, htmlResponse, TRouteContext, HTTP, z } from '@venizia/ignis';

const EmailRoutes = {
  PREVIEW: {
    method: HTTP.Methods.GET,
    path: '/preview/:templateId',
    request: {
      params: z.object({ templateId: z.string() }),
    },
    responses: htmlResponse({
      description: 'Email template preview',
    }),
  },
} as const;

export class EmailController extends BaseController {
  @get({ configs: EmailRoutes.PREVIEW })
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
      </html>
    );
  }
}
```

### Documentation Page

```typescript
import { BaseController, get, htmlResponse, TRouteContext, HTTP, z } from '@venizia/ignis';

const DocsRoutes = {
  GET_SECTION: {
    method: HTTP.Methods.GET,
    path: '/docs/:section',
    request: {
      params: z.object({ section: z.string() }),
    },
    responses: htmlResponse({
      description: 'API documentation page',
    }),
  },
} as const;

export class DocsController extends BaseController {
  @get({ configs: DocsRoutes.GET_SECTION })
  async getDocumentation(c: TRouteContext) {
    const { section } = c.req.valid<{ section: string }>('param');
    const content = await this.docsService.getSection(section);

    return c.html(
      <html>
        <head>
          <title>Docs - {content.title}</title>
          <link rel="stylesheet" href="/styles/docs.css" />
        </head>
        <body>
          <nav>
            <a href="/docs/getting-started">Getting Started</a>
            <a href="/docs/api">API Reference</a>
          </nav>
          <main>
            <h1>{content.title}</h1>
            <div dangerouslySetInnerHTML={{ __html: content.html }} />
          </main>
        </body>
      </html>
    );
  }
}
```

### Admin Dashboard

```typescript
import { BaseController, get, htmlResponse } from '@venizia/ignis';
import { authenticate } from '../middleware/auth';

export class AdminController extends BaseController {
  @get({
    path: '/admin',
    middleware: [authenticate({ role: 'admin' })],
    responses: htmlResponse({
      description: 'Admin dashboard',
    }),
  })
  async getDashboard() {
    const stats = await this.statsService.getAdminStats();

    return this.context.html(
      <html>
        <head>
          <title>Admin Dashboard</title>
          <script src="/js/dashboard.js" defer />
        </head>
        <body>
          <div class="dashboard">
            <h1>Admin Dashboard</h1>
            <div class="stats">
              <div class="stat-card">
                <h3>Total Users</h3>
                <p>{stats.totalUsers}</p>
              </div>
              <div class="stat-card">
                <h3>Active Sessions</h3>
                <p>{stats.activeSessions}</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    );
  }
}
```


## Comparison with JSON Utilities

### htmlContent vs jsonContent

| Aspect | `htmlContent()` | `jsonContent()` |
|--------|----------------|-----------------|
| **Content-Type** | `text/html` | `application/json` |
| **Schema** | `z.string()` | Custom Zod schema |
| **Use Case** | HTML pages, JSX rendering | API responses, data |
| **Example** | HTML document string | JSON object |

### htmlResponse vs jsonResponse

| Aspect | `htmlResponse()` | `jsonResponse()` |
|--------|------------------|------------------|
| **Success Type** | `text/html` (200) | `application/json` (200) |
| **Error Type** | `application/json` (4xx/5xx) | `application/json` (4xx/5xx) |
| **Use Case** | Web pages | REST APIs |


## Best Practices

### 1. Use for Server-Side Rendering

```typescript
// ✅ Good: Use htmlResponse for SSR routes
const ProfileConfig = {
  method: HTTP.Methods.GET,
  path: '/profile/:userId',
  request: { params: z.object({ userId: z.string() }) },
  responses: htmlResponse({ description: 'User profile page' }),
} as const;

@get({ configs: ProfileConfig })
async getUserProfile(c: TRouteContext) {
  const { userId } = c.req.valid<{ userId: string }>('param');
  const user = await this.userService.getUser(userId);
  return c.html(<UserProfile user={user} />);
}

// ❌ Bad: Don't use htmlResponse for API endpoints
const BadConfig = {
  method: HTTP.Methods.GET,
  path: '/api/users/:userId',
  request: { params: z.object({ userId: z.string() }) },
  responses: htmlResponse({ description: 'User data' }), // Wrong!
} as const;

@get({ configs: BadConfig })
async getUser(c: TRouteContext) {
  const { userId } = c.req.valid<{ userId: string }>('param');
  return { id: userId, name: 'John' }; // Should use jsonResponse
}
```

### 2. Combine with Authentication

```typescript
// ✅ Good: Protect HTML routes with auth
const SettingsConfig = {
  method: HTTP.Methods.GET,
  path: '/admin/settings',
  authStrategies: [Authentication.STRATEGY_JWT],
  responses: htmlResponse({ description: 'Settings page' }),
} as const;

@get({ configs: SettingsConfig })
async getSettings(c: TRouteContext) {
  return c.html(<SettingsPage />);
}
```

### 3. Error Handling

HTML routes automatically return JSON errors for 4xx/5xx:

```typescript
const ArticleConfig = {
  method: HTTP.Methods.GET,
  path: '/article/:id',
  request: { params: z.object({ id: z.string() }) },
  responses: htmlResponse({ description: 'Article page' }),
} as const;

@get({ configs: ArticleConfig })
async getArticle(c: TRouteContext) {
  const { id } = c.req.valid<{ id: string }>('param');
  const article = await this.articleService.findById(id);

  if (!article) {
    // Returns JSON error: { message: 'Not found', statusCode: 404 }
    throw new NotFoundError('Article not found');
  }

  return c.html(<ArticlePage article={article} />);
}
```

### 4. SEO-Friendly Metadata

```typescript
const BlogConfig = {
  method: HTTP.Methods.GET,
  path: '/blog/:slug',
  request: { params: z.object({ slug: z.string() }) },
  responses: htmlResponse({ description: 'Blog post page' }),
} as const;

@get({ configs: BlogConfig })
async getBlogPost(c: TRouteContext) {
  const { slug } = c.req.valid<{ slug: string }>('param');
  const post = await this.blogService.getBySlug(slug);

  return c.html(
    <html>
      <head>
        <title>{post.title} | My Blog</title>
        <meta name="description" content={post.excerpt} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:image" content={post.coverImage} />
      </head>
      <body>
        <article>
          <h1>{post.title}</h1>
          <div dangerouslySetInnerHTML={{ __html: post.content }} />
        </article>
      </body>
    </html>
  );
}
```


## Integration with Hono JSX

IGNIS uses Hono's built-in JSX support. Make sure to configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  }
}
```

### JSX Components

```typescript
// components/Layout.tsx
export const Layout = (props: { title: string; children: any }) => {
  return (
    <html>
      <head>
        <title>{props.title}</title>
        <link rel="stylesheet" href="/styles/main.css" />
      </head>
      <body>
        <header>
          <nav>
            <a href="/">Home</a>
            <a href="/about">About</a>
          </nav>
        </header>
        <main>{props.children}</main>
        <footer>
          <p>&copy; 2026 My App</p>
        </footer>
      </body>
    </html>
  );
};

// controller.ts
import { Layout } from './components/Layout';

@get({
  path: '/',
  responses: htmlResponse({ description: 'Home page' }),
})
async getHome() {
  return this.context.html(
    <Layout title="Home">
      <h1>Welcome to My App</h1>
      <p>This is the home page.</p>
    </Layout>
  );
}
```


## Common Pitfalls

### Pitfall 1: Missing HTML Wrapper

```typescript
// ❌ Bad: Incomplete HTML
@get({
  path: '/page',
  responses: htmlResponse({ description: 'Page' }),
})
async getPage() {
  return this.context.html(<div>Hello</div>); // Missing <html>, <head>, <body>
}

// ✅ Good: Complete HTML document
@get({
  path: '/page',
  responses: htmlResponse({ description: 'Page' }),
})
async getPage() {
  return this.context.html(
    <html>
      <head><title>Page</title></head>
      <body><div>Hello</div></body>
    </html>
  );
}
```

### Pitfall 2: Using htmlResponse for APIs

```typescript
// ❌ Bad: HTML response for API
@get({
  path: '/api/users',
  responses: htmlResponse({ description: 'Users' }),
})
async getUsers() {
  return { users: [...] }; // Should return HTML or use jsonResponse
}

// ✅ Good: Use jsonResponse for APIs
@get({
  path: '/api/users',
  responses: jsonResponse({
    description: 'Users list',
    schema: z.object({ users: z.array(UserSchema) }),
  }),
})
async getUsers() {
  return { users: await this.userService.findAll() };
}
```


## See Also

- **Related References:**
  - [Schema Utility](./schema.md) - JSON content and response helpers
  - [Controllers](../base/controllers.md) - Defining routes and handlers
  - [OpenAPI Component](../components/swagger/) - API documentation

- **External Resources:**
  - [Hono JSX Documentation](https://hono.dev/guides/jsx)
  - [OpenAPI Specification](https://swagger.io/specification/)
  - [React JSX (for reference)](https://react.dev/learn/writing-markup-with-jsx)
