# API Reference

Complete reference documentation for the Ignis framework. Find detailed API docs, type definitions, and usage examples for every class, component, and utility in the framework.

<div class="guide-cards">

<a href="./base/" class="guide-card highlight">
<span class="guide-icon">🏗️</span>
<h3>Base Abstractions</h3>
<p>Application, Controller, Service, Repository, Model</p>
</a>

<a href="./components/" class="guide-card">
<span class="guide-icon">🧩</span>
<h3>Components</h3>
<p>Auth, Mail, Socket.IO, Swagger, Health Check</p>
</a>

<a href="./helpers/" class="guide-card">
<span class="guide-icon">🛠️</span>
<h3>Helpers</h3>
<p>Logger, Redis, Queue, Storage, Cron, Crypto</p>
</a>

<a href="./utilities/" class="guide-card">
<span class="guide-icon">⚙️</span>
<h3>Utilities</h3>
<p>Date, Parse, Promise, Schema, Performance</p>
</a>

<a href="./configuration/" class="guide-card">
<span class="guide-icon">📝</span>
<h3>Configuration</h3>
<p>Environment variables and settings</p>
</a>

<a href="./src-details/" class="guide-card">
<span class="guide-icon">📦</span>
<h3>Framework Internals</h3>
<p>Package structure and architecture</p>
</a>

</div>

## Find What You Need

<div class="roadmap">

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">1</span>
<h4>Building an API</h4>
</div>
<p><a href="./base/application">Application</a> → <a href="./base/controllers">Controllers</a> → <a href="./base/services">Services</a> → <a href="./base/repositories/">Repositories</a></p>
<span class="stage-desc">Request handling, business logic, and data access</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">2</span>
<h4>Data Layer</h4>
</div>
<p><a href="./base/models">Models</a> → <a href="./base/datasources">DataSources</a> → <a href="./base/repositories/filtering">Filtering</a> → <a href="./base/repositories/relations">Relations</a></p>
<span class="stage-desc">Entities, database connections, and query building</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">3</span>
<h4>Adding Features</h4>
</div>
<p><a href="./components/authentication">Auth</a> → <a href="./components/socket-io">Real-time</a> → <a href="./components/mail">Email</a> → <a href="./components/swagger">API Docs</a></p>
<span class="stage-desc">Pre-built components for common features</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">4</span>
<h4>Infrastructure</h4>
</div>
<p><a href="./helpers/logger">Logging</a> → <a href="./helpers/redis">Caching</a> → <a href="./helpers/queue">Queues</a> → <a href="./helpers/cron">Scheduling</a></p>
<span class="stage-desc">Background jobs, caching, and observability</span>
</div>

</div>

::: tip Looking for tutorials?
Check out the [Getting Started Guide](/guides/) for step-by-step tutorials and the [Core Concepts](/guides/core-concepts/application/) for architectural explanations.
:::

## Quick Examples

**Define a Controller:**
```typescript
@controller({ path: '/users' })
class UserController extends BaseController {
  @get({ configs: { path: '/:id' } })
  getUser(c: Context) {
    return c.json({ id: c.req.param('id') });
  }
}
```

**Query with Repository:**
```typescript
const users = await userRepo.find({
  where: { isActive: true },
  orderBy: { createdAt: 'desc' },
  limit: 10,
});
```

**Schedule a Job:**
```typescript
CronHelper.schedule('0 * * * *', async () => {
  await cleanupExpiredSessions();
});
```

## Common Imports

```typescript
// Core framework
import {
  BaseApplication,
  BaseController,
  BaseService,
  BaseRepository,
  controller,
  get, post, put, del,
  inject,
} from '@venizia/ignis';

// Helpers
import {
  LoggerFactory,
  RedisHelper,
  QueueHelper,
} from '@venizia/ignis-helpers';

// DI Container
import { Container } from '@venizia/ignis-inversion';
```

## See Also

- [Getting Started](/guides/) - New to Ignis? Start here
- [Core Concepts](/guides/core-concepts/application/) - Deep dive into architecture
- [Best Practices](/best-practices/) - Production patterns
- [Changelogs](/changelogs/) - Version history

<style>
.guide-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 2rem 0;
}

@media (min-width: 640px) {
  .guide-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 960px) {
  .guide-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}

.guide-card {
  display: block;
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  text-decoration: none !important;
  transition: transform 0.2s, box-shadow 0.2s;
}

.guide-card h3,
.guide-card p {
  text-decoration: none !important;
}

.guide-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  text-decoration: none !important;
}

.guide-card.highlight {
  border: 2px solid var(--vp-c-brand-1);
}

.guide-icon {
  font-size: 1.5rem;
  display: block;
  margin-bottom: 0.5rem;
}

.guide-card h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  color: var(--vp-c-text-1);
}

.guide-card p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.roadmap {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1.5rem 0;
}

.roadmap-stage {
  padding: 1rem 1.25rem;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  border-left: 3px solid var(--vp-c-brand-1);
}

.stage-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.stage-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
}

.stage-header h4 {
  margin: 0;
  font-size: 1rem;
}

.roadmap-stage > p {
  margin: 0 0 0.25rem 0;
  font-size: 0.9rem;
}

.stage-desc {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}
</style>
