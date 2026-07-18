<div align="center">

<br />

# :fire: @venizia/ignis-inversion

**A small IoC container that works anywhere.**

[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai/references/base/dependency-injection)
[![npm](https://img.shields.io/npm/v/@venizia/ignis-inversion.svg?style=flat-square&color=cb3837&label=@venizia/ignis-inversion)](https://www.npmjs.com/package/@venizia/ignis-inversion)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Documentation](https://ignis.venizia.ai/references/base/dependency-injection) &#8226;
[Core API](https://ignis.venizia.ai/references/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

</div>

---

The dependency injection container behind [IGNIS](https://ignis.venizia.ai) - decorator-driven
constructor and property injection, a fluent binding API, singleton/transient scopes, and tag-based
discovery, in roughly 350 lines.

It has no framework dependency. Reach for it when you want LoopBack 4-style DI without adopting a
framework, and it is small enough to ship into a browser bundle. IGNIS itself uses nothing more than
what is documented here.

## Install

```bash
bun add @venizia/ignis-inversion reflect-metadata
```

> [!IMPORTANT]
> `experimentalDecorators` and `emitDecoratorMetadata` must be `true` in your `tsconfig.json`,
> declared **inline**. Bun does not resolve them through `extends`, and `@inject` is silently
> dropped without them.

## Usage

```typescript
import 'reflect-metadata';
import { BindingScopes, Container, inject } from '@venizia/ignis-inversion';

class GreetingService {
  constructor(
    @inject({ key: 'config.prefix' }) private readonly prefix: string,
    @inject({ key: 'config.locale', isOptional: true }) private readonly locale?: string,
  ) {}

  greet(name: string) {
    return `${this.prefix} ${name} (${this.locale ?? 'en'})`;
  }
}

const container = new Container({ scope: 'app' });

container.bind({ key: 'config.prefix' }).toValue('Hello');
container
  .bind({ key: 'services.GreetingService' })
  .toClass(GreetingService)
  .setScope(BindingScopes.SINGLETON);

const service = container.get<GreetingService>({ key: 'services.GreetingService' });
console.log(service.greet('IGNIS')); // Hello IGNIS (en)

// A key's first segment becomes a tag, so bindings are discoverable as a group.
container.findByTag({ tag: 'services' }); // [Binding('services.GreetingService')]
```

## API

Every method takes an options object - `container.get({ key })`, never `container.get(key)`.

### Container

| Member | What it does |
| :--- | :--- |
| `new Container({ scope })` | The default container. `AbstractContainer` (contract) and `BaseContainer` (storage) are exported for custom implementations |
| `bind<T>({ key })` | Creates and registers a `Binding`, returned for chaining |
| `get<T>({ key, isOptional })` | Resolves a value. Throws when unbound unless `isOptional` is true |
| `gets<T>({ bindings })` | Resolves several keys at once; every result is optional |
| `getBinding<T>({ key })` | The binding itself, not its value. Accepts `{ namespace, key }` too |
| `isBound({ key })` / `unbind({ key })` | Membership test / removal |
| `set({ binding })` | Registers an externally constructed `Binding` under its own key |
| `instantiate<T>(cls)` | Builds a class from its decorator metadata - `resolve(cls)` is an alias |
| `findByTag({ tag, exclude })` | All bindings carrying a tag. `exclude` takes an array or a `Set` of keys |
| `clear()` / `reset()` | Drops cached singleton instances / drops all bindings |

### Binding

| Member | What it does |
| :--- | :--- |
| `.toValue(value)` | Binds a ready value - returned as-is |
| `.toClass(Class)` | Binds a class, instantiated through the container on resolution |
| `.toProvider(fn \| ProviderClass)` | Binds a factory `(container) => T`, or a class implementing `IProvider<T>` with a `value(container)` method |
| `.setScope(scope)` / `.getScope()` | `BindingScopes.TRANSIENT` (default) or `BindingScopes.SINGLETON` |
| `.setTags(...tags)` / `.hasTag(tag)` / `.getTags()` | Tagging for `findByTag` |
| `.getValue(container)` | Resolves the binding; a container is required for class and provider resolvers |
| `.clearCache()` | Discards a cached singleton instance |

### Decorators

| Decorator | Where | Notes |
| :--- | :--- | :--- |
| `@inject({ key, isOptional? })` | Constructor parameter | Resolved by index and passed to the constructor |
| `@inject({ key, isOptional? })` | Property | Assigned after construction |

Both write into the shared `metadataRegistry` (a `MetadataRegistry` instance). Pass your own through
the `registry` option to isolate metadata - in tests, for example.

### Keys and scopes

| Symbol | Notes |
| :--- | :--- |
| `BindingKeys.build({ namespace, key })` | Joins the two with a dot. `key` is required; an empty namespace yields the bare key |
| Namespace auto-tagging | A dotted key tags its binding with the first segment - `services.UserService` is tagged `services` |
| `BindingScopes` | `SINGLETON`, `TRANSIENT` |
| `BindingValueTypes` | `CLASS`, `VALUE`, `PROVIDER` - the resolver kinds |

Conventional namespaces across IGNIS: `controllers`, `services`, `repositories`, `datasources`.

Full reference: [Dependency injection](https://ignis.venizia.ai/references/base/dependency-injection).

## Errors

This package also ships the error module the whole framework throws through, so a standalone
consumer gets it for free. Never throw a raw `new Error`.

```typescript
import { getError, isApplicationError } from '@venizia/ignis-inversion';

throw getError({
  message: { text: 'User not found', code: 'user.not_found', args: { id: 42 } },
  statusCode: 404,
});
```

`getError` returns an `ApplicationError` - a real `Error` subclass carrying `statusCode`, an
optional `extra` bag, and `normalized`, which is always the same three fields:

| Field | Meaning |
| :--- | :--- |
| `text` | The human-readable message |
| `code` | A dotted, lower snake_case message code. Falls back to `MessageCode.DEFAULT` (`core.system_error`) |
| `args` | Interpolation arguments, `{}` when there are none |

`message` also accepts a bare string, which becomes `text`. Unknown top-level keys are swept into
`extra`, so a throw site can attach context the framework does not model.

> [!IMPORTANT]
> Check errors with `isApplicationError(error)`, never `instanceof ApplicationError`. Several
> packages can carry their own copy of the class, so `instanceof` fails across package boundaries.

Also exported: `ApplicationError`, `MessageCode`, `ErrorScopes`, and the `TError*` types. Catalogued
errors are declared as `TErrorDefinition` objects and thrown with `getError({ error: Definition })`.

## Rules that will burn you

**Every constructor parameter of a container-instantiated class must carry `@inject`.** There is no
channel for the container to supply an undecorated one, so a mixed constructor is refused at
instantiation with `[Class] Constructor parameter N has no @inject`. Options a class needs go into
`super({ ... })` or onto a binding, never as a bare parameter.

**This package keeps a dual CJS + ESM build on purpose.** Frontend consumers import it into browser
bundles, so `dist/esm` is load-bearing. Do not "simplify" the build to ESM-only or CJS-only.

**`import 'reflect-metadata'` once, at your entrypoint.** The package imports it, but a consumer
that loads two copies gets two metadata stores and silently empty injection.

**Singleton caching keys on `undefined`.** A singleton binding that resolves to `undefined` is
re-resolved on every `get` rather than cached.

## Links

[Documentation](https://ignis.venizia.ai) &#8226;
[Dependency injection](https://ignis.venizia.ai/references/base/dependency-injection) &#8226;
[Core API](https://ignis.venizia.ai/references/) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

MIT licensed. Questions: [GitHub Issues](https://github.com/VENIZIA-AI/ignis/issues) &#8226; developer@venizia.ai
