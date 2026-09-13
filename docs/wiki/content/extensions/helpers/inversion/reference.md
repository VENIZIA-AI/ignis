---
title: Inversion (DI) - Full Reference
description: Complete reference for Container, Binding, MetadataRegistry, decorators, and every error message
difficulty: intermediate
---

# Inversion (DI) - Full Reference

Exhaustive reference for `Container`, `Binding`, `MetadataRegistry`, the `@inject` decorator, and every type, constant, and error message in `@venizia/ignis-inversion`. For a readable introduction and the most common tasks, start with the [Inversion overview](/extensions/helpers/inversion/).

**Files:**

- [`packages/inversion/src/modules/container/container.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/container.ts) - `Container`
- [`packages/inversion/src/modules/container/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/base.ts) - `BaseContainer`
- [`packages/inversion/src/modules/container/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/abstract.ts) - `AbstractContainer`
- [`packages/inversion/src/modules/binding/binding.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/binding/binding.ts) - `Binding`
- [`packages/inversion/src/modules/binding/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/binding/common/constants.ts) - `BindingScopes`, `BindingValueTypes`, `BindingKeys`
- [`packages/inversion/src/modules/binding/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/binding/common/types.ts) - `IBinding`, `IProvider`, `isClassProvider`
- [`packages/inversion/src/modules/metadata/injectors.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/metadata/injectors.ts) - `@inject`
- [`packages/inversion/src/modules/metadata/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/metadata/common/constants.ts) - `MetadataKeys`
- [`packages/inversion/src/modules/registry/registry.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/registry/registry.ts) - `MetadataRegistry`, `metadataRegistry`
- [`packages/inversion/src/modules/registry/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/registry/common/types.ts) - `IInjectMetadata`, `IPropertyMetadata`, `IBindingKeyRecord`
- [`packages/inversion/src/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/types.ts) - `TNullable`, `ValueOrPromise`, `TClass`, `TConstValue`
- [`packages/inversion/src/common/utilities.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/utilities.ts) - `isClass`
- [`packages/inversion/src/modules/error/app-error.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/app-error.ts) - `ApplicationError`, `getError`, `isApplicationError`
- [`packages/inversion/src/modules/error/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/common/types.ts) - `TError`, `TErrorDefinition`, `TErrorNormalized`, `IErrorKeyRegistry`
- [`packages/inversion/src/common/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/logger.ts) - `Logger`

## Quick Reference

| Item | Value |
|------|-------|
| Package | `@venizia/ignis-inversion` |
| Classes | `Container`, `BaseContainer`, `AbstractContainer`, `Binding`, `MetadataRegistry` |
| Decorators | `@inject` |
| Runtimes | Both Bun and Node.js |
| Build | Dual CJS + ESM |

### Import paths

```typescript
import {
  Container,
  Binding,
  MetadataRegistry,
  metadataRegistry,
  inject,
  BindingKeys,
  BindingScopes,
  BindingValueTypes,
  MetadataKeys,
  BaseHelper,
  ApplicationError,
  getError,
  isApplicationError,
  MessageCode,
  ErrorScopes,
  Logger,
  isClass,
  isClassProvider,
} from '@venizia/ignis-inversion';

import type {
  TNullable,
  ValueOrPromise,
  ValueOf,
  AnyType,
  TClass,
  TConstructor,
  TAbstractConstructor,
  TConstValue,
  TBindingKey,
  TBindingScope,
  TBindingValueType,
  IProvider,
  IBinding,
  IContainer,
  IInjectMetadata,
  IPropertyMetadata,
  IBindingKeyRecord,
  IBindingTag,
  TInjectOptions,
} from '@venizia/ignis-inversion';
```

> [!NOTE]
> The framework package `@venizia/ignis` re-exports these DI symbols from `@venizia/ignis-inversion`, types included: `Binding`, `BindingKeys`, `BindingScopes`, `BindingValueTypes`, `IProvider`, `isClass`, `isClassProvider`, `TBindingScope`, `TBindingValueType`, `IBindingTag`. It also adds higher-level helpers of its own (`app.controller()`, `app.service()`, etc.).

## Class Hierarchy

`Source ->` [`container/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/abstract.ts), [`container/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/base.ts), [`container/container.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/container.ts)

```
AbstractContainer extends BaseHelper implements IContainer   # contract only - every member abstract
  └── BaseContainer                                          # storage: bind/lookup/tags/lifecycle, `instantiate` still abstract
        └── Container                                        # instantiate() = two-phase decorator injection
```

`AbstractContainer` exists so a container implementation that shares nothing with the shipped storage can start there. One that only wants to vary resolution extends `BaseContainer` instead. `binding/` and `container/` only talk to each other through `IContainer`/`IBinding` - there is no import cycle between the two folders.

## Creating a Container

```typescript
import { Container } from '@venizia/ignis-inversion';

const container = new Container({ scope: 'MyApp' });
```

`scope` is optional and defaults to `'Container'` (or `'BaseContainer'`/`'AbstractContainer'` for those classes). It is passed through to `BaseHelper` and used for logging/error context only - it has no effect on binding resolution.

## Container

`Source ->` [`container/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/base.ts), [`container/container.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/container.ts)

| Method | Signature | Description |
|--------|-----------|--------------|
| `bind` | `bind<T>(opts: { key: TBindingKey }): Binding<T>` | Create a new `Binding`, register it under `String(key)`, and return it |
| `get` | `get<T>(opts: { key: TBindingKey \| { namespace, key }, isOptional?: boolean }): T \| undefined` | Resolve a dependency by key. Throws if not found and `isOptional` is falsy |
| `gets` | `gets<T extends unknown[]>(opts: { bindings: { [K in keyof T]: { key, isOptional? } } }): { [K in keyof T]: T[K] \| undefined }` | Resolve several dependencies as a tuple. Every entry is internally re-issued with `isOptional: true`, so every returned slot is `\| undefined` |
| `getBinding` | `getBinding<T>(opts: { key: TBindingKey \| { namespace, key } }): Binding<T> \| undefined` | Retrieve the raw `Binding` without resolving it |
| `set` | `set<T>(opts: { binding: Binding<T> }): void` | Register an externally created `Binding` under its own `.key` |
| `isBound` | `isBound(opts: { key: TBindingKey }): boolean` | Check whether a key is registered |
| `unbind` | `unbind(opts: { key: TBindingKey }): boolean` | Remove a binding; returns `true` if one was removed |
| `resolve` | `resolve<T>(cls: TClass<T>): T` | Alias for `instantiate` |
| `instantiate` | `instantiate<T>(cls: TClass<T>): T` | Build an instance with full DI (constructor + property injection), see below |
| `findByTag` | `findByTag<T>(opts: { tag: string, exclude?: string[] \| Set<string> }): Binding<T>[]` | Find every binding with a matching tag, optionally excluding keys |
| `clear` | `clear(): void` | Clear every binding's singleton cache; bindings themselves remain registered |
| `reset` | `reset(): void` | Remove all bindings entirely |
| `getMetadataRegistry` | `getMetadataRegistry(): MetadataRegistry` | Return the shared `metadataRegistry` singleton |

All keys passed to `bind`, `isBound`, and `unbind` are normalized with `String(key)` before being used as the `Map` key. A `Symbol` key resolves to its `.toString()` form (`'Symbol(...)'`), so a `symbol` and the equivalent string are distinct entries.

### `instantiate()` - two-phase algorithm

```typescript
override instantiate<T>(cls: TClass<T>): T
```

Both phases run their metadata through `resolveBindingKey` first. `@inject` records either a key or a class, so that step reduces the two forms to one binding key.

**`resolveBindingKey(opts: { key?, target?, cls, at })`.** It returns `key` unchanged when a key was recorded. With only a class, it reads back the key that class was registered under, via `registry.getBindingKey({ target })`. Two errors originate here:

| Situation | Message |
|---|---|
| Neither a key nor a class was recorded | `[ClassName] Constructor parameter 0 has neither an @inject key nor a class` |
| A class that was never registered as an artifact | `[ClassName] Constructor parameter 0 names 'UserRepository', which is not registered as an artifact \| Decorate it (@service, @repository, ...) or register it on the application before it is injected` |

`at` supplies the phrase in those messages. Phase 1 passes `Constructor parameter N`, phase 2 passes `Property 'name'`.

**Phase 1 - constructor injection.** Reads `registry.getInjectMetadata({ target: cls })`, which returns the index-keyed `IInjectMetadata[]` array built by `@inject`. For every index in that array:

- If the slot is empty (an undecorated parameter left a hole), throws `[ClassName] Constructor parameter N has no @inject | Every parameter of a container-instantiated class must be decorated - the container cannot supply an undecorated one`.
- Otherwise resolves the key with `resolveBindingKey({ key: meta.key, target: meta.target, cls, at })`, calls `this.get({ key, isOptional: meta.isOptional ?? false })`, and places the result at `args[meta.index]`.

The array is already index-keyed (`setInjectMetadata` writes to `injects[index]`) - there is no sort step. Once all arguments are resolved, `new cls(...args)` builds the instance.

**Phase 2 - property injection.** Reads `registry.getPropertiesMetadata({ target: instance })`. If there is none, returns the instance as-is.

Otherwise, for each `[propertyKey, metadata]` entry, resolves the key with `resolveBindingKey({ key: metadata.bindingKey, target: metadata.target, cls, at })`, calls `this.get({ key, isOptional: metadata.isOptional ?? false })`, and assigns the result to `instance[propertyKey]`.

`@inject({ key, isOptional: true })` on a **property** behaves exactly like on a constructor parameter: an unbound key resolves to `undefined` instead of throwing. A required property (`isOptional` omitted or `false`) still throws when its key is unbound.

### Key formats

`get`, `getBinding`, and `gets` accept three key shapes:

```typescript
container.get<UserService>({ key: 'services.UserService' });
container.get<UserService>({ key: Symbol.for('services.UserService') });
container.get<UserService>({ key: { namespace: 'services', key: 'UserService' } });
```

`getBinding` throws `[getBinding] Invalid binding key type | ...` if `opts.key` is not a `string`, `symbol`, or `{ namespace, key }` object.

### `gets()` behavior

```typescript
const [svcA, svcB] = container.gets<[ServiceA, ServiceB]>({
  bindings: [
    { key: 'services.ServiceA' },
    { key: 'services.ServiceB', isOptional: true },
  ],
});
```

Internally maps each entry through `this.get({ ...opt, isOptional: true })`. Regardless of what `isOptional` was set on the entry, `gets()` always resolves with `isOptional: true` - anything unbound returns `undefined` instead of throwing.

The generic is a tuple, and the return type widens every slot. `svcA` above is `ServiceA | undefined`, not `ServiceA`. Narrow each slot before you use it.

## Binding

`Source ->` [`binding/binding.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/binding/binding.ts)

| Method | Signature | Description |
|--------|-----------|--------------|
| `toClass` | `toClass(value: TClass<T>): this` | Container instantiates `value` with full DI when resolved |
| `toValue` | `toValue(value: T): this` | Returns `value` directly, no instantiation |
| `toProvider` | `toProvider(value: ((container) => T) \| TClass<IProvider<T>>): this` | Factory function, or a class whose prototype has a `value()` method |
| `setScope` | `setScope(scope: TBindingScope): this` | `'singleton'` or `'transient'` (default) |
| `setTags` | `setTags(...tags: string[]): this` | Adds tags to the internal `Set<string>` |
| `hasTag` | `hasTag(tag: string): boolean` | Check for a specific tag |
| `getTags` | `getTags(): string[]` | All tags as an array |
| `getScope` | `getScope(): TBindingScope` | Current scope |
| `getValue` | `getValue(container?: IContainer): T` | Resolve the bound value, respecting scope caching |
| `getBindingMeta` | `getBindingMeta(opts: { type: TBindingValueType }): TBindingResolverValue<T>` | Raw resolver value; throws if `type` does not match the actual resolver |
| `clearCache` | `clearCache(): void` | Clears this binding's singleton cache (no-op if nothing cached) |
| `bind` (static) | `static bind<T>(opts: { key: string }): Binding<T>` | Create a `Binding` outside a container |

### Constructor and namespace auto-tagging

```typescript
constructor(opts: { key: string })
```

Splits `key` on `.`. If there is more than one segment, the first segment is auto-added as a tag via `setTags()`. `'services.UserService'` auto-tags `'services'`. A key with no `.` gets no automatic tag.

### `getValue()` resolution by type

| Resolver type | Behavior | Throws when |
|----------------|----------|--------------|
| `VALUE` | Returns the stored value directly | Never |
| `PROVIDER` (plain function) | Calls `provider(container)` | No `container` argument was passed - `[getValue] Invalid context/container to get provider value` |
| `PROVIDER` (class, matched via `isClassProvider`) | `container.instantiate()`s the class, then calls `.value(container)` on the instance | Same as above |
| `CLASS` | `container.instantiate(this.resolver.value)` | No `container` argument was passed - `[getValue] Invalid context/container to instantiate class` |

`isClassProvider` matches a class whose prototype has a `value()` method - see [Class-based provider](#class-based-provider) below.

If `bindScope` is `SINGLETON`, the resolved instance is cached on `this.cached`. Every subsequent call returns it directly without re-invoking the resolver - caching is per-`Binding` instance, not per-container.

### Class-based provider

```typescript
import type { IContainer, IProvider } from '@venizia/ignis-inversion';

class DatabaseConnectionProvider implements IProvider<DatabaseConnection> {
  value(container: IContainer): DatabaseConnection {
    const config = container.get<Config>({ key: 'config.database' });
    return new DatabaseConnection(config);
  }
}

container.bind<DatabaseConnection>({ key: 'db.connection' }).toProvider(DatabaseConnectionProvider);
```

`isClassProvider` detects this shape at runtime: `typeof target === 'function' && target.prototype && typeof target.prototype.value === 'function'`.

### Static factory

```typescript
import { Binding, BindingScopes } from '@venizia/ignis-inversion';

const binding = Binding.bind<IHealthCheckOptions>({ key: 'options.healthCheck' })
  .toValue({ restOptions: { path: '/health' } });

container.set({ binding }); // registers under binding.key
```

## MetadataRegistry

`Source ->` [`registry/registry.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/registry/registry.ts)

Singleton (`metadataRegistry`) backing `@inject`, built entirely on `reflect-metadata`'s `Reflect.defineMetadata`/`getMetadata`/`hasMetadata`/`deleteMetadata`. You typically interact with it only through `container.getMetadataRegistry()` or the decorators.

| Method | Signature | Description |
|--------|-----------|--------------|
| `define` | `define<Target, Value>(opts: { target, key: TBindingKey, value: Value }): void` | Store arbitrary metadata on a target |
| `get` | `get<Target, Value>(opts: { target, key: TBindingKey }): Value \| undefined` | Retrieve metadata by key |
| `has` | `has<Target>(opts: { target, key: TBindingKey }): boolean` | Check if metadata exists |
| `delete` | `delete<Target>(opts: { target, key: TBindingKey }): boolean` | Remove metadata by key |
| `getKeys` | `getKeys<Target>(opts: { target }): TBindingKey[]` | List all metadata keys (`string`/`symbol` only) on a target |
| `getMethodNames` | `getMethodNames<T>(opts: { target: TClass<T> }): string[]` | Non-constructor function-valued own property names on the prototype |
| `clearMetadata` | `clearMetadata<T>(opts: { target }): void` | Delete every metadata key on a target |
| `setInjectMetadata` | `setInjectMetadata<T>(opts: { target, index: number, metadata: IInjectMetadata }): void` | Write constructor `@inject` metadata at parameter `index` into the `MetadataKeys.INJECT` array |
| `getInjectMetadata` | `getInjectMetadata<T>(opts: { target }): IInjectMetadata[] \| undefined` | Read the constructor injection array |
| `setPropertyMetadata` | `setPropertyMetadata<T>(opts: { target, propertyName, metadata: IPropertyMetadata }): void` | Write property `@inject` metadata into a `Map` keyed by property name, stored on `target.constructor` |
| `getPropertiesMetadata` | `getPropertiesMetadata<T>(opts: { target }): Map<string \| symbol, IPropertyMetadata> \| undefined` | Read the full property metadata map |
| `getPropertyMetadata` | `getPropertyMetadata<T>(opts: { target, propertyName }): IPropertyMetadata \| undefined` | Read metadata for one property |
| `setBindingKey` | `setBindingKey<T>(opts: { target, key: TBindingKey, isProvisional?: boolean }): void` | Record the key a class is registered under, into `MetadataKeys.BINDING_KEY`. This is what `@inject({ target })` reads back |
| `getBindingKey` | `getBindingKey<T>(opts: { target }): TBindingKey \| undefined` | Read that key back. Own metadata only, so an unregistered subclass does not inherit its parent's key |

`isProvisional` marks a derived key, one guessed from the class rather than declared. A real registration replaces a provisional key silently. Two non-provisional registrations under different keys log a `[setBindingKey] Rebound under a different key` warning instead, because the second would otherwise decide for both.

```typescript
import { MetadataKeys, metadataRegistry } from '@venizia/ignis-inversion';

MetadataKeys.PROPERTIES;  // Symbol.for('ignis:properties')
MetadataKeys.INJECT;      // Symbol.for('ignis:inject')
MetadataKeys.BINDING_KEY; // Symbol.for('ignis:binding-key')

metadataRegistry.define({ target: myObj, key: 'custom:flag', value: true });
metadataRegistry.get({ target: myObj, key: 'custom:flag' });    // true
metadataRegistry.has({ target: myObj, key: 'custom:flag' });    // true
metadataRegistry.delete({ target: myObj, key: 'custom:flag' }); // true
```

### MetadataRegistry types

```typescript
interface IInjectMetadata {
  key?: TBindingKey;
  /** Named by class; the key is read off the class at resolve time. */
  target?: TClass<AnyType>;
  index: number;
  isOptional?: boolean;
}

interface IPropertyMetadata {
  bindingKey?: TBindingKey;
  /** Named by class; the key is read off the class at resolve time. */
  target?: TClass<AnyType>;
  isOptional?: boolean;
}

interface IBindingKeyRecord {
  key: TBindingKey;
  isProvisional: boolean;
}
```

The key field is optional on both, and both carry a `target` sibling. `@inject` writes exactly one of the pair: the key when you passed `key`, `target` when you passed a class. Type against the key alone and your code will not compile.

Neither interface carries an index signature. A misspelled read such as `metadata.optional` is a type error rather than an `any`.

## Decorators

`Source ->` [`metadata/injectors.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/metadata/injectors.ts)

### `@inject`

```typescript
type TInjectOptions = {
  isOptional?: boolean;
  registry?: MetadataRegistry;
} & ({ key: TBindingKey; target?: never } | { target: TClass<AnyType>; key?: never });

inject(opts: TInjectOptions): PropertyDecorator | ParameterDecorator
```

`TInjectOptions` is a discriminated union. You name the dependency **either** by binding key **or** by class, never both.

| Form | Example | How the key is found |
|---|---|---|
| By key | `@inject({ key: 'repositories.UserRepository' })` | Used as written |
| By class | `@inject({ target: UserRepository })` | Read off the class at resolve time, from the key its registration recorded |

The class form is the shorter one when the class is already a decorated artifact. It also survives a key rename, because you never wrote the key down.

`inject` throws `@inject was given no binding key and no class | target: undefined` when neither arm is satisfied. A circular import is the usual cause. The class reference evaluates to `undefined` at decoration time, so the check fires there rather than at resolve time.

Dispatches on how the decorator was invoked:

| Applied to | Detection | Stored via |
|------------|-----------|------------|
| Constructor parameter | `parameterIndex` is a `number` | `registry.setInjectMetadata({ target, index: parameterIndex, metadata: { ...(key === undefined ? { target } : { key }), index: parameterIndex, isOptional } })` |
| Class property | `propertyName !== undefined` | `registry.setPropertyMetadata({ target, propertyName, metadata: { ...(key === undefined ? { target } : { bindingKey: key }), isOptional } })` |
| Anything else | neither condition matches | Throws `@inject decorator can only be used on class properties or constructor parameters` |

Note which field each branch writes. A constructor parameter stores the key under `key`, a property stores it under `bindingKey`. The class form writes `target` in both.

`isOptional` defaults to `false` in both branches. Pass a custom `registry` to target a non-default `MetadataRegistry` instance (rare - almost always omitted, using the shared `metadataRegistry`).

```typescript
class UserService {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepository: UserRepository,
    @inject({ target: AuditRepository }) private auditRepository: AuditRepository,
    @inject({ key: 'services.Logger', isOptional: true }) private logger?: Logger,
  ) {}

  @inject({ key: 'config.retryCount' })
  private retryCount: number;
}
```

## Namespaces and Tags

```typescript
import { BindingKeys } from '@venizia/ignis-inversion';

BindingKeys.build({ namespace: 'services', key: 'UserService' });
// => 'services.UserService'

BindingKeys.build({ namespace: '', key: 'UserService' });
// => 'UserService' (empty namespace segment is dropped)

BindingKeys.build({ namespace: 'services', key: '' });
// throws: [BindingKeys][build] Invalid key to build | key:
```

`key` is required and must be non-empty. `namespace` is optional - it's silently omitted from the joined string when empty.

```typescript
container.bind({ key: 'workers.EmailWorker' }).toClass(EmailWorker).setTags('background', 'email');
// tags: ['workers', 'background', 'email']

const serviceBindings = container.findByTag({ tag: 'services' });
const filtered = container.findByTag({ tag: 'services', exclude: ['services.InternalService'] });
```

## Utilities

### ApplicationError and getError

`Source ->` [`modules/error/app-error.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/app-error.ts)

```typescript
class ApplicationError extends Error {
  statusCode: number;
  normalized: { text: string; code: string; args: Record<string, unknown> };
  extra?: Record<string, unknown>;
}

getError(opts: TError): ApplicationError; // factory function
```

`opts.message` accepts two shapes: the historical string (paired with sibling `messageCode?`/`messageArgs?`), or an object mirroring `normalized` - `{ text, code?, args? }`. Both resolve to the same `normalized`.

`messageCode`/`messageArgs` are lowest precedence - `message.code`/`message.args`, or a catalogued definition's own, win when both are present. There is no flat `error.messageCode`. `extra` never mirrors `messageArgs`. `normalized.args` is always populated (`{}` when empty).

The catalogued form (`{ error: TErrorDefinition }`) takes `message` as a **partial** override. `{ message: { args } }` amends just the args and keeps the definition's `text`/`code`. `error` is refused on the free-form branch (`error?: never`) - wrap a caught failure with `cause` instead.

`ApplicationError`'s constructor defaults `statusCode` to `400` when omitted, and moves any property it does not model into `this.extra`. The error RESPONSE schema (`ErrorSchema`, for OpenAPI) lives in `@venizia/ignis-helpers`, not here. It needs `@hono/zod-openapi`, which inversion must not depend on - inversion ships to browsers.

```typescript
throw getError({ message: 'Something failed', statusCode: 500, messageCode: 'ERR_INTERNAL' });
throw new ApplicationError({ message: 'Not found', statusCode: 404 });
throw new ApplicationError({ message: { text: 'Not found', code: 'core.user.not_found' }, statusCode: 404 });

// The code and args are read off `normalized`, never off the error directly.
error.normalized.code; // 'err_internal'
```

See the [Error reference](/extensions/helpers/error/) for the full input shape, precedence rules, and the catalogued (`TErrorDefinition`) pattern.

### Logger

`Source ->` [`common/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/logger.ts)

A minimal `console`-backed static logger, independent of `@venizia/ignis-helpers`' `Logger`/`LoggerFactory` - this one exists so the inversion package has zero dependency on the logging package.

```typescript
Logger.info('Server started on port %d', 3000);   // console.log('[INFO] ...')
Logger.warn('Deprecation warning');                 // console.warn('[WARN] ...')
Logger.error('Connection failed: %s', err.message); // console.error('[ERROR] ...')
Logger.debug('Resolved binding: %s', key);          // console.log('[DEBUG] ...') only if process.env.DEBUG is set
```

### Type guards and shared types

`Source ->` [`common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/types.ts) and [`common/utilities.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/utilities.ts) (`isClass`)

```typescript
type TNullable<T> = T | undefined | null;
type ValueOrPromise<T> = T | Promise<T>;
type ValueOf<T> = T[keyof T];
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
type TClass<T> = TConstructor<T> & { [property: string]: any };
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
type TBindingKey = string | symbol;
type AnyType = any;

interface IBindingTag {
  [name: string]: any;
}

function isClass<T>(target: any): target is TClass<T>;
```

`isClass` tests `typeof target === 'function' && target.prototype !== undefined` plus a regex match on the function's stringified source (`/^class[\s{]/`). It relies on the class being emitted as an ES2024 `class`, not transpiled down to an ES5 constructor function.

```typescript
interface IProvider<T> {
  value(container: IContainer): T;
}

function isClassProvider<T>(target: any): target is TClass<IProvider<T>>;
```

`value` takes `IContainer`, the interface, not the concrete `Container` class. `binding/` and `container/` talk only through that interface, which is what keeps the two folders free of an import cycle.

## Constants

| Constant | Values | Description |
|----------|--------|--------------|
| `BindingScopes.SINGLETON` | `'singleton'` | Cached after first resolution |
| `BindingScopes.TRANSIENT` | `'transient'` | New instance each resolution |
| `BindingValueTypes.CLASS` | `'class'` | Container instantiates with DI |
| `BindingValueTypes.VALUE` | `'value'` | Direct value return |
| `BindingValueTypes.PROVIDER` | `'provider'` | Factory function or `IProvider` class |
| `MetadataKeys.PROPERTIES` | `Symbol.for('ignis:properties')` | Property injection metadata key |
| `MetadataKeys.INJECT` | `Symbol.for('ignis:inject')` | Constructor injection metadata key |
| `MetadataKeys.BINDING_KEY` | `Symbol.for('ignis:binding-key')` | The key a class is registered under, holding an `IBindingKeyRecord`. Read back by `@inject({ target })` |

## Troubleshooting

### "Binding key: X is not bounded in context!"

**Cause:** The dependency was never registered with the container, or the key does not match exactly.

**Fix:**
1. Verify the binding exists: `container.isBound({ key: 'services.UserService' })`.
2. Check for typos between `@inject({ key: '...' })` and the key used in `container.bind({ key: '...' })`.
3. If the dependency is genuinely optional, add `isOptional: true` to the `@inject` call - constructor parameter or property, both work - or use `container.get({ key: '...', isOptional: true })`.

### "[getValue] Invalid context/container to instantiate class"

**Cause:** A `Binding` configured with `toClass()` was resolved by calling `binding.getValue()` directly, without a `Container` argument.

**Fix:** Resolve class bindings through the container - `container.get({ key })` - rather than calling `binding.getValue()` with no arguments.

### "[getValue] Invalid context/container to get provider value"

**Cause:** A `Binding` configured with `toProvider()` was resolved without a `Container` argument.

**Fix:** Same as above - always resolve through `container.get({ key })`.

### "[getBindingMeta] Invalid resolver type"

**Cause:** `getBindingMeta({ type })` was called with a type that does not match the binding's actual resolver (e.g. `'class'` on a value binding).

**Fix:** Match `type` to how the binding was created: `toClass()` -> `'class'`, `toValue()` -> `'value'`, `toProvider()` -> `'provider'`.

### "[getBinding] Invalid binding key type"

**Cause:** The key passed to `getBinding()` is not a `string`, `symbol`, or `{ namespace, key }` object.

**Fix:** Use one of the three supported key formats.

### "[BindingKeys][build] Invalid key to build"

**Cause:** `BindingKeys.build()` was called with an empty `key`.

**Fix:** Provide a non-empty `key`: `BindingKeys.build({ namespace: 'services', key: 'UserService' })`.

### "[ClassName] Constructor parameter N has no @inject"

**Cause:** A container-instantiated class has a constructor mixing decorated and undecorated parameters. `@inject` stores metadata at the parameter's index, so an undecorated parameter leaves a hole in that array. There is no channel through which the container could supply it anyway.

**Fix:** Decorate every constructor parameter with `@inject`. There is no partial-injection escape hatch. If a value doesn't come from the container (e.g. a plain `scope: string`), choose one:

- Pass it through a factory/provider instead of a bare constructor parameter.
- Have the subclass forward it via its own `@inject`-decorated parameter.

### "@inject decorator can only be used on class properties or constructor parameters"

**Cause:** `@inject` was applied to something other than a class property or constructor parameter.

**Fix:** Only use `@inject` on constructor parameters or class properties.

### "@inject was given no binding key and no class"

**Cause:** The decorator ran with neither `key` nor a usable `target`. The message prints what `target` actually held. `undefined` there means a circular import: the module holding the class had not finished evaluating when the decorator was applied.

**Fix:**
1. Break the cycle, usually by moving the shared type into its own module.
2. Or switch that one site to the key form, `@inject({ key: '...' })`, which needs no class reference at decoration time.

### "[ClassName] Constructor parameter N has neither an @inject key nor a class"

**Cause:** The stored metadata for that slot carries no `key` and no `target`. The same message appears with `Property 'name'` in place of `Constructor parameter N` when property injection hits it.

**Fix:** Give the `@inject` call one of the two arms - a `key`, or a `target` class.

### "[ClassName] ... names 'X', which is not registered as an artifact"

**Cause:** `@inject({ target: X })` resolved, but `X` was never registered, so no binding key was recorded against it. Only the class form can produce this; the key form never consults the registry.

**Fix:**
1. Decorate `X` as an artifact (`@service`, `@repository`, and so on).
2. Or register it on the application before anything injects it.
3. Or inject it by key instead.

### Property injection never runs

**Cause:** The class was instantiated with `new MyClass()` directly instead of through the container. Only `container.resolve()`/`instantiate()` reads `@inject` metadata and populates properties. A plain `new` leaves them at whatever their field initializer set - `undefined` if none.

**Fix:** Always use `container.resolve(MyClass)` or `container.instantiate(MyClass)` to create instances that use property injection.

### "getInjectMetadata returns undefined"

**Cause:** `reflect-metadata` was not imported before decorators were evaluated, or `experimentalDecorators`/`emitDecoratorMetadata` are not enabled in `tsconfig.json`.

**Fix:**
1. Ensure `import 'reflect-metadata'` runs before any decorated class is evaluated - `@venizia/ignis-inversion`'s entry point already does this, so importing anything from the package is enough.
2. Verify `tsconfig.json` includes:
   ```json
   {
     "compilerOptions": {
       "experimentalDecorators": true,
       "emitDecoratorMetadata": true
     }
   }
   ```

### Singleton returns a stale instance after rebinding

**Cause:** Singleton caching is per-`Binding` object. Holding a direct reference to an old `Binding` (e.g. from `getBinding()`) keeps its cache independent of any new binding registered under the same key.

**Fix:**
1. Always resolve via `container.get()` rather than caching `Binding` references.
2. Call `container.clear()` to clear every binding's singleton cache without removing registrations.
3. Call `container.reset()` to remove all bindings entirely.

## See also

- [Inversion overview](/extensions/helpers/inversion/) - introduction and the most common tasks
- [Dependency Injection Guide](/guides/core-concepts/dependency-injection) - DI fundamentals in the framework layer
- [Application](/guides/core-concepts/application/) - `Application` extends `Container`
- [Dependency Injection API](/references/base/dependency-injection) - the framework-layer DI reference
- [Architectural Patterns](/best-practices/architectural-patterns) - DI patterns
