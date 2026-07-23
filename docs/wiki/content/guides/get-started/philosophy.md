# Philosophy

Building a REST API on Node or Bun means picking a side. Minimal frameworks give you speed and a
blank page. Enterprise frameworks give you structure, and ask you to pay for it in startup time
and ceremony. IGNIS is the third option: LoopBack 4's architecture, running on Hono's engine.

## The three-way landscape

| Category | Frameworks | What you trade |
|---|---|---|
| Minimal | Express, Hono, Fastify, Koa | Speed and freedom for do-it-yourself architecture |
| Balanced | IGNIS, Ts.ED | A lighter footprint for slightly less ecosystem maturity |
| Enterprise | NestJS, LoopBack 4, AdonisJS | Proven structure for a heavier footprint and a steeper learning curve |

IGNIS sits in the balanced row on purpose.

## Why IGNIS exists

Three frameworks shaped the decision, and each fell short in a specific way.

**LoopBack 4** had the right architectural ideas: decorators, the `@repository` pattern, a
DataSource abstraction, a Component system, a Booter system. But it runs at roughly 15-20k
req/s, and IBM has stopped developing it.

**NestJS** is popular and full-featured. But it wraps Express or Fastify behind an adapter layer.
That layer is where its overhead comes from: it tops out around 25k req/s, and the framework asks
for a lot of ceremony along the way.

**Hono** itself is fast, around 140k req/s. But it is deliberately unopinionated: a router and
middleware, and nothing else. No dependency injection, no repository pattern, no convention for
where code lives. Fine for one microservice. Painful once an API grows past a handful of
endpoints.

IGNIS keeps LoopBack 4's architecture and swaps its engine for Hono's. The aim: hold the ~140k
req/s ballpark while giving a growing API the structure LoopBack 4 offered. Concretely, that
means:

- A standalone dependency injection container (`inversion`, about 350 lines), with `@inject`,
  singleton and transient scopes, and constructor injection.
- The same layered shape LoopBack 4 popularized: Controller -> Service (optional) -> Repository ->
  DataSource -> PostgreSQL.
- Request validation and OpenAPI docs generated from the same Zod schema, so they can't drift
  apart.
- A convention-based boot system that auto-discovers controllers, services, repositories, and
  data sources by file suffix.

## How it performs

The numbers below are approximate and vary by workload, but the shape holds: IGNIS sits close to
Hono, both several times faster than the enterprise frameworks it borrows its architecture from.

| Framework | Startup | Memory | Throughput | Runtimes |
|---|---|---|---|---|
| Hono | ~10ms | ~20MB | ~150k req/s | Bun, Node, Deno, Cloudflare Workers |
| IGNIS | ~30ms | ~30MB | ~140k req/s | Bun, Node |
| Fastify | ~50ms | ~40MB | ~80k req/s | Node only |
| Express | ~100ms | ~50MB | ~15k req/s | Node only |
| NestJS | ~500ms | ~100MB | ~25k req/s | Node (Bun experimental) |
| LoopBack 4 | ~800ms | ~120MB | ~20k req/s | Node only |

## What you get, compared

| Aspect | Minimal (Hono, Express) | Enterprise (NestJS, LoopBack 4) | IGNIS |
|---|---|---|---|
| Setup time | 5 minutes | 30+ minutes | 10 minutes |
| Learning curve | Low | High | Medium |
| Boilerplate | Minimal | Heavy | Moderate |
| Type safety | Manual | Excellent | Excellent |
| IDE support | Basic | Excellent | Good |
| Dependency injection | Manual | Built-in, full-featured | Built-in, ~350-line container |
| Layered architecture | DIY | Enforced | Guided |
| Repository pattern | DIY | Built-in | Built-in |
| Validation | Third-party | Built-in (class-validator) | Built-in (Zod) |
| OpenAPI / Swagger | Third-party | Built-in | Built-in |
| Authentication | DIY | Passport + guards | Component |

Minimal frameworks give you total freedom. Enterprise frameworks are opinionated. IGNIS aims for a
third mode - guided flexibility: sensible conventions, with an override for every one of them.

## Ecosystem, today

| Aspect | Hono | NestJS | IGNIS |
|---|---|---|---|
| GitHub stars | ~20k | ~70k | New |
| Weekly downloads | ~500k | ~3M | Starting |
| First release | 2021 | 2017 | 2025 |
| Production ready | Yes | Yes | Early stage |
| Corporate backing | Cloudflare | Trilon | Independent |
| Official plugins | 20+ | 50+ | Core only |
| Community packages | Growing | Extensive | Few |
| LTS / support | Active | Enterprise LTS | Planning |

IGNIS is honest about where it stands: the architecture is proven, because it is LoopBack 4's. The
framework carrying it is new.

## When to use IGNIS, and when not to

| Situation | Verdict | Why |
|---|---|---|
| Medium API, 10-100 endpoints | Yes | Structure prevents spaghetti code |
| Any team size, solo to large | Yes | The same patterns scale either way |
| Want DI without NestJS/LoopBack 4's weight | Yes | Lighter container, ESM native |
| Coming from NestJS or LoopBack 4 | Yes | Familiar patterns, better performance |
| Need a database, auth, and OpenAPI docs | Yes | All built in, ready to use |
| Performance matters | Yes | Hono's speed with structure on top |
| Bun-first development | Yes | Native Bun support |
| Growing out of a plain Hono project | Yes | Same foundation, incremental migration |
| 3-5 endpoints, solo developer | Maybe | Start with Hono; migrate later if it grows |
| Quick prototype or MVP | No | Plain Hono gets you to a first endpoint faster |
| Simple proxy or webhook handler | No | The structure is overhead you don't need |

Two situations push you toward an alternative even outside this table:

- Reach for **NestJS or LoopBack 4** if you need a large team (10+ developers) held to strict
  enterprise standards, complex microservice patterns like CQRS, or a hiring pool that already
  knows the framework.
- Reach for **plain Hono, Fastify, or Express** if you're learning web development from scratch or
  deploying to the edge, where every millisecond of cold start counts.

## What's still forming

Choosing IGNIS today trades a mature ecosystem for early access to a leaner enterprise framework.
You get the dependency injection container, the repository pattern, Zod validation, and OpenAPI
docs generated from the same schemas, running near Hono's throughput. IGNIS apps also compile to a
single executable with Bun.

What you don't get yet: a large plugin ecosystem, extensive community packages, or a formal LTS
release. The framework shipped in 2025 and is still building all three.

## Next steps

1. [Check prerequisites](./setup) - install the required tools.
2. [Complete the installation](../tutorials/complete-installation) - build your first endpoint.
3. [Build a CRUD API](../tutorials/building-a-crud-api) - build a complete API.
