# Best Practices

Production-ready patterns, security guidelines, and optimization strategies for building robust Ignis applications. These best practices are distilled from real-world experience building enterprise applications.

<div class="guide-cards">

<a href="./architectural-patterns" class="guide-card highlight">
<span class="guide-icon">🏗️</span>
<h3>Architecture</h3>
<p>Layered architecture, DI, components, lifecycle hooks</p>
</a>

<a href="./code-style-standards" class="guide-card">
<span class="guide-icon">📝</span>
<h3>Code Standards</h3>
<p>Naming, types, patterns, ESLint, Prettier</p>
</a>

<a href="./security-guidelines" class="guide-card highlight">
<span class="guide-icon">🔒</span>
<h3>Security</h3>
<p>Auth, validation, secrets, CORS, rate limiting</p>
</a>

<a href="./data-modeling" class="guide-card">
<span class="guide-icon">🗄️</span>
<h3>Data Modeling</h3>
<p>Schemas, enrichers, relations, migrations</p>
</a>

<a href="./testing-strategies" class="guide-card">
<span class="guide-icon">🧪</span>
<h3>Testing</h3>
<p>Unit tests, integration tests, mocking</p>
</a>

<a href="./performance-optimization" class="guide-card">
<span class="guide-icon">⚡</span>
<h3>Performance</h3>
<p>Query optimization, caching, pooling</p>
</a>

<a href="./error-handling" class="guide-card">
<span class="guide-icon">🚨</span>
<h3>Error Handling</h3>
<p>Error patterns, logging, user-friendly messages</p>
</a>

<a href="./deployment-strategies" class="guide-card">
<span class="guide-icon">🚀</span>
<h3>Deployment</h3>
<p>Docker, Kubernetes, cloud platforms, CI/CD</p>
</a>

</div>

## Learning Path

<div class="roadmap">

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">1</span>
<h4>Foundation</h4>
</div>
<p><a href="./architectural-patterns">Architecture</a> → <a href="./architecture-decisions">Decisions Guide</a> → <a href="./code-style-standards">Code Standards</a></p>
<span class="stage-desc">Understand patterns and establish coding conventions</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">2</span>
<h4>Data Layer</h4>
</div>
<p><a href="./data-modeling">Data Modeling</a> → <a href="./api-usage-examples">API Patterns</a> → <a href="./error-handling">Error Handling</a></p>
<span class="stage-desc">Design your data layer and handle edge cases</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">3</span>
<h4>Quality Assurance</h4>
</div>
<p><a href="./testing-strategies">Testing</a> → <a href="./common-pitfalls">Avoid Pitfalls</a> → <a href="./troubleshooting-tips">Troubleshooting</a></p>
<span class="stage-desc">Write tests and prevent common mistakes</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">4</span>
<h4>Production Ready</h4>
</div>
<p><a href="./security-guidelines">Security</a> → <a href="./performance-optimization">Performance</a> → <a href="./deployment-strategies">Deployment</a></p>
<span class="stage-desc">Secure, optimize, and deploy your application</span>
</div>

</div>

## Quick Reference

### Essential Patterns

```typescript
// ✅ Layered Architecture
Controller → Service → Repository → DataSource

// ✅ Dependency Injection
@inject({ key: BindingKeys.build({ namespace: BindingNamespaces.SERVICE, key: UserService.name }) })

// ✅ Error Handling
throw getError({ statusCode: 404, message: 'User not found' });

// ✅ Input Validation
request: { body: jsonContent({ schema: z.object({ email: z.string().email() }) }) }
```

### Anti-Patterns to Avoid

```typescript
// ❌ Business logic in controllers
@get({ configs: RouteConfigs.GET_USER })
async getUser(c: Context) {
  const user = await this.userRepo.findById(id);
  if (user.lastLogin < cutoff) await this.sendReminder(user); // Move to service!
  return c.json(user);
}

// ❌ Catching all errors silently
try { await riskyOperation(); } catch (e) { /* swallowed */ }

// ❌ Using `any` type
const data: any = await fetchData(); // Use proper types!
```

### Security Checklist

| Check | Action |
|-------|--------|
| Secrets | Store in environment variables, never in code |
| Input | Validate with Zod schemas at API boundaries |
| Auth | Protect routes with `authStrategies: [Authentication.STRATEGY_JWT]` |
| Sensitive data | Use `hiddenProperties` in model settings |
| File uploads | Use `sanitizeFilename()` for all user-provided filenames |
| CORS | Configure allowed origins explicitly |

### Performance Checklist

| Check | Action |
|-------|--------|
| Queries | Use `fields` to select only needed columns |
| Pagination | Always set `limit` on find operations |
| Relations | Limit `include` depth to 2 levels max |
| Connection pool | Configure pool size based on load |
| Background jobs | Offload CPU-intensive tasks to workers |
| Caching | Cache expensive queries with Redis |

## All Best Practices

### Architecture & Design

| Guide | Description |
|-------|-------------|
| [Architectural Patterns](./architectural-patterns) | Layered architecture, DI, components, mixins |
| [Architecture Decisions](./architecture-decisions) | When to use services, repositories, components |

### Development

| Guide | Description |
|-------|-------------|
| [Code Style Standards](./code-style-standards) | Naming conventions, types, ESLint, Prettier |
| [Data Modeling](./data-modeling) | Schema design, enrichers, relations, migrations |
| [API Usage Examples](./api-usage-examples) | Routing, repositories, middleware, services |

### Quality

| Guide | Description |
|-------|-------------|
| [Testing Strategies](./testing-strategies) | Unit tests, integration tests, mocking, E2E |
| [Error Handling](./error-handling) | Error patterns, structured errors, logging |
| [Common Pitfalls](./common-pitfalls) | Mistakes to avoid and how to fix them |
| [Troubleshooting Tips](./troubleshooting-tips) | Debug common issues quickly |

### Production

| Guide | Description |
|-------|-------------|
| [Security Guidelines](./security-guidelines) | Authentication, validation, secrets, CORS |
| [Performance Optimization](./performance-optimization) | Query optimization, caching, connection pooling |
| [Deployment Strategies](./deployment-strategies) | Docker, Kubernetes, cloud platforms, CI/CD |

### Contributing

| Guide | Description |
|-------|-------------|
| [Contribution Workflow](./contribution-workflow) | Git workflow, PR guidelines, code review |

::: tip New to Ignis?
Start with the [Getting Started Guide](/guides/) for tutorials, then return here for production-ready patterns.
:::

::: warning Production Deployment?
Before deploying, review the [Security Guidelines](./security-guidelines) and [Deployment Strategies](./deployment-strategies) thoroughly.
:::

## See Also

- [Getting Started](/guides/) - New to Ignis? Start here
- [API Reference](/references/) - Detailed API documentation
- [Core Concepts](/guides/core-concepts/application/) - Deep dive into architecture
- [Changelogs](/changelogs/) - Version history and updates
