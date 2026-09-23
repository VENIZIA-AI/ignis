# @venizia/ignis-inversion

The dependency injection container under IGNIS, and the error type every IGNIS package throws. It
depends on no other IGNIS package, so you can install it alone to get LoopBack 4-style bindings
without the framework.

## Install

```bash
bun add @venizia/ignis-inversion
```

`reflect-metadata` comes as a dependency, and the package entry imports it. Your `tsconfig.json`
must declare `experimentalDecorators: true` itself (see [Decorators](#decorators)).

## Use it

Bind values and classes under string keys, then ask the container for a key.

```typescript
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

const container = new Container();

container.bind({ key: 'config.prefix' }).toValue('Hello');
container
  .bind({ key: 'services.GreetingService' })
  .toClass(GreetingService)
  .setScope(BindingScopes.SINGLETON);

const service = container.get<GreetingService>({ key: 'services.GreetingService' });
console.log(service.greet('IGNIS')); // Hello IGNIS (en)

// The first segment of a dotted key becomes a tag.
container.findByTag({ tag: 'services' }); // [the 'services.GreetingService' binding]
```

Notice that `config.locale` is never bound. `isOptional: true` makes it resolve to `undefined`
instead of throwing.

## API

Every method takes an options object: `container.get({ key })`, never `container.get(key)`.

| Container member | What it does |
| :--- | :--- |
| `bind<T>({ key })` | Creates and registers a `Binding`, returned for chaining |
| `get<T>({ key, isOptional })` | Resolves a key. Throws when the key is unbound, unless `isOptional` is `true`. `key` may also be `{ namespace, key }` |
| `gets({ bindings })` | Resolves several keys; every entry is optional |
| `getBinding({ key })`, `isBound({ key })`, `unbind({ key })`, `set({ binding })` | Read, test, remove, or register a `Binding` |
| `instantiate(cls)` / `resolve(cls)` | Builds a class from its `@inject` metadata without binding it |
| `findByTag({ tag, exclude })` | Every binding with a tag; `exclude` takes an array or a `Set` of keys |
| `clear()` / `reset()` | Drops cached singletons / drops every binding |
| `startResolutionCounting()`, `getResolutionCounts()`, `stopResolutionCounting()` | Counts how often each key is resolved, off by default |

| Binding member | What it does |
| :--- | :--- |
| `toValue(value)` | Returns the value as-is |
| `toClass(Class)` | Instantiates the class through the container |
| `toProvider(factory)` | Calls `(container) => T`, or instantiates a class with a `value(container)` method |
| `setScope(scope)` | `BindingScopes.TRANSIENT` (default) or `BindingScopes.SINGLETON` |
| `setTags(...tags)`, `hasTag(tag)`, `getTags()` | Tags for `findByTag` |
| `clearCache()` | Discards the cached singleton |

`AbstractContainer` (the contract) and `BaseContainer` (the storage) are exported for custom
containers. `BindingKeys.build({ namespace, key })` joins a namespace and a key with a dot.

## Decorators

`@inject` marks a constructor parameter or a property. Pass a `key`, or a `target` class to
resolve through the key that class was registered under.

| Option | Type | Meaning |
| :--- | :--- | :--- |
| `key` | `string \| symbol` | The binding key to resolve |
| `target` | class, or a function returning one | Resolve the class's recorded key. The function form survives an import cycle |
| `isOptional` | `boolean` | Resolve an unbound key to `undefined` instead of throwing |

Constructor parameters resolve before construction. Properties are assigned after it.

> [!IMPORTANT]
> Declare `experimentalDecorators: true` in your own `tsconfig.json`, not only through `extends`.
> Bun can miss an inherited flag when it runs source, and then drops parameter decorators with no
> error. `emitDecoratorMetadata` is not needed: `@inject` records the parameter index itself.

Decorate every constructor parameter of a class the container builds. An undecorated parameter
before a decorated one is refused with `Constructor parameter N has no @inject`. An undecorated
trailing parameter receives `undefined`.

## Errors

The package also holds the error type the whole framework throws.

```typescript
import { getError, isApplicationError } from '@venizia/ignis-inversion';

try {
  throw getError({
    message: { text: 'User not found', code: 'user.not_found', args: { id: 42 } },
    statusCode: 404,
  });
} catch (error) {
  if (isApplicationError(error)) {
    console.log(error.statusCode, error.normalized); // 404 { text, code, args }
  }
}
```

`getError` returns an `ApplicationError`, an `Error` subclass. It carries `statusCode` (default
`400`), `normalized` (`{ text, code, args }`) and an optional `extra` bag. A bare string `message`
becomes `text`. A missing code becomes `MessageCode.DEFAULT` (`core.system_error`). Unknown
top-level keys go into `extra`.

Test with `isApplicationError(error)`, not `instanceof ApplicationError`. A CommonJS copy and an
ES module copy of the package can both be loaded, and `instanceof` fails across them.

## Entry points

| Entry point | What it gives | Extra peers |
| :--- | :--- | :--- |
| `@venizia/ignis-inversion` | Everything: container, bindings, `@inject`, `MetadataRegistry`, errors | none |

The package ships both CommonJS (`dist/cjs`) and ES modules (`dist/esm`). `import` resolves the ES
build, `require` the CommonJS one. The ES build is what a browser bundle takes.

## Where it sits

Depends on nothing in IGNIS. Used by filter, helpers and kernel: dev-configs -> **inversion** ->
{filter, helpers} -> {boot, kernel} -> connectors -> {core-worker, core-server} -> atlas.

## Links

- [Inversion (DI) guide](https://ignis.venizia.ai/extensions/helpers/inversion/)
- [Dependency injection reference](https://ignis.venizia.ai/references/base/dependency-injection)
- [Error handling](https://ignis.venizia.ai/extensions/helpers/error/)
- [Changelog](https://ignis.venizia.ai/changelogs/)
- [Source](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion)

MIT licensed - see [LICENSE.md](./LICENSE.md).
