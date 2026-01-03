---
layout: home

hero:
  name: IGNIS
  text: Enterprise APIs at Hono Speed
  tagline: "Architecture that scales, performance that flies. Enterprise patterns, raw performance speed, DI Powered."
  image:
    src: /logo.svg
    alt: IGNIS
  actions:
    - theme: brand
      text: Get Started
      link: /guides/get-started/5-minute-quickstart
    - theme: alt
      text: Why Ignis?
      link: /guides/get-started/philosophy
    - theme: alt
      text: GitHub
      link: https://github.com/VENIZIA-AI/ignis

features:
  - icon: ⚡
    title: 140k+ req/s
    details: Built on Hono, one of the fastest web frameworks. Near-native performance on Bun, Node, and edge runtimes.
    link: /guides/get-started/philosophy
    linkText: See benchmarks

  - icon: 🏗️
    title: Enterprise Architecture
    details: Layered design with Controllers, Services, and Repositories. Clean separation of concerns out of the box.
    link: /guides/core-concepts/application/
    linkText: Learn more

  - icon: 💉
    title: Dependency Injection
    details: Lightweight DI container with decorators. Testable, loosely coupled code without the boilerplate.
    link: /guides/core-concepts/dependency-injection
    linkText: See how

  - icon: 📝
    title: Auto-Generated Docs
    details: OpenAPI/Swagger from Zod schemas. Interactive API explorer included with zero config.
    link: /references/components/swagger
    linkText: View example

  - icon: 🗃️
    title: Type-Safe Database
    details: Drizzle ORM integration with advanced filtering, relations, JSON queries, and transactions.
    link: /references/base/repositories/
    linkText: Explore

  - icon: 🧩
    title: Batteries Included
    details: Auth, WebSockets, Queues, Cron, Redis, S3, Email — ready-to-use components and helpers.
    link: /references/
    linkText: Browse all
---



## Quick Start

```bash
# Install dependencies
bun add hono @hono/zod-openapi @scalar/hono-api-reference @venizia/ignis
bun add -d typescript @types/bun

# Create src/index.ts with your first API
```

```typescript
import { BaseApplication, BaseController, controller, get, HTTP, jsonContent, SwaggerComponent } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

// 1. Define your controller
@controller({ path: '/hello' })
class HelloController extends BaseController {
  constructor() {
    super({ scope: 'HelloController', path: '/hello' });
  }

  override binding() {} // Required: register additional routes or dependencies here

  @get({
    configs: {
      path: '/',
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          schema: z.object({ message: z.string() }),
        }),
      },
    },
  })
  sayHello(c) {
    return c.json({ message: 'Hello from Ignis! 🔥' });
  }
}

// 2. Create and configure your application
class App extends BaseApplication {
  getAppInfo() {
    return { name: 'my-app', version: '1.0.0', description: 'My Ignis App' };
  }
  staticConfigure() {}
  preConfigure() {
    this.component(SwaggerComponent);  // API docs at /doc/explorer
    this.controller(HelloController);
  }
  postConfigure() {}
  setupMiddlewares() {}
}

// 3. Start the server
const app = new App({
  scope: 'App',
  config: { host: '0.0.0.0', port: 3000, path: { base: '/api' } },
});
app.start();
```

```bash
# Run it
bun run src/index.ts

# Visit http://localhost:3000/api/hello
# API docs at http://localhost:3000/doc/explorer
```

<div class="tip custom-block" style="padding-top: 8px">

Ready for a step-by-step guide? Follow the [5-minute quickstart →](/guides/get-started/5-minute-quickstart)

</div>

## When to Use Ignis

<div class="use-ignis-grid">

<div class="use-ignis-card">
<h3>✅ Perfect For</h3>
<ul>
<li><strong>SaaS backends</strong> — Multi-tenant, complex business logic</li>
<li><strong>E-commerce APIs</strong> — Products, orders, payments</li>
<li><strong>Enterprise apps</strong> — Teams need clear patterns</li>
<li><strong>Growing projects</strong> — 10+ endpoints that need structure</li>
<li><strong>REST APIs</strong> — Full CRUD with validation & docs</li>
<li><strong>Real-time apps</strong> — WebSocket support built-in</li>
</ul>
</div>

<div class="use-ignis-card">
<h3>❌ Consider Alternatives</h3>
<ul>
<li><strong>Simple webhooks</strong> — Use plain Hono</li>
<li><strong>3-5 endpoint APIs</strong> — Ignis adds overhead</li>
<li><strong>Quick prototypes</strong> — Start with Hono first</li>
<li><strong>Serverless functions</strong> — Hono alone is lighter</li>
<li><strong>Static sites</strong> — Use Astro or Next.js</li>
<li><strong>No TypeScript</strong> — Ignis requires TS</li>
</ul>
</div>

</div>

<div style="padding: 3rem 2rem; margin: 2rem 0; border-radius: 16px; background: var(--vp-c-bg-soft); text-align: center;">

<p style="font-size: 0.9rem; color: var(--vp-c-text-2); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 2px;">Powered by</p>

<div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 2rem; margin-bottom: 1.5rem;">
<a href="https://hono.dev" target="_blank" style="font-size: 1.2rem; font-weight: 500;">Hono</a>
<a href="https://orm.drizzle.team" target="_blank" style="font-size: 1.2rem; font-weight: 500;">Drizzle ORM</a>
<a href="https://zod.dev" target="_blank" style="font-size: 1.2rem; font-weight: 500;">Zod</a>
<a href="https://www.typescriptlang.org" target="_blank" style="font-size: 1.2rem; font-weight: 500;">TypeScript</a>
<a href="https://bun.sh" target="_blank" style="font-size: 1.2rem; font-weight: 500;">Bun</a>
</div>

<hr style="border: none; border-top: 1px solid var(--vp-c-divider); margin: 1.5rem 0;" />

<p style="font-size: 0.9rem; color: var(--vp-c-text-2); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 2px;">Inspired by</p>

<div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 2rem;">
<a href="https://spring.io/projects/spring-boot" target="_blank" style="font-size: 1.2rem; font-weight: 500;">Spring Boot</a>
<a href="https://loopback.io/doc/en/lb4/" target="_blank" style="font-size: 1.2rem; font-weight: 500;">LoopBack 4</a>
</div>

</div>
