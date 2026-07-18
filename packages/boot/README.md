<div align="center">

<br />

# :fire: IGNIS - `@venizia/ignis-boot`

**Convention-based discovery and bootstrapping.**

[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai/references/base/bootstrapping)
[![npm](https://img.shields.io/npm/v/@venizia/ignis-boot.svg?style=flat-square&color=cb3837&label=@venizia/ignis-boot)](https://www.npmjs.com/package/@venizia/ignis-boot)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Bootstrapping reference](https://ignis.venizia.ai/references/base/bootstrapping) &#8226;
[Application](https://ignis.venizia.ai/references/base/application) &#8226;
[Dependency injection](https://ignis.venizia.ai/references/base/dependency-injection)

</div>

---

Finds your controllers, services, repositories, and datasources by filename, then binds each one into
the IoC container - so you never maintain a registration list that drifts from the files on disk.

**Most applications never import this package.** `BaseApplication` from `@venizia/ignis` already depends
on it, registers the four built-in booters, and exposes `boot()`. You reach for it directly only to
write a custom booter for an artifact type of your own.

## Install

```bash
bun add @venizia/ignis-boot
```

Already a transitive dependency of `@venizia/ignis`.

## Use it

Convention boot is opt-in: call `boot()` before `start()`.

```typescript
import { BaseApplication, IApplicationInfo } from '@venizia/ignis';

class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return { name: 'my-app', version: '1.0.0', description: 'My app' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

const application = new App({
  scope: 'App',
  config: {
    host: '0.0.0.0',
    port: 3000,
    path: { base: '/api', isStrict: false },
    bootOptions: {}, // the defaults cover the conventional layout
  },
});

await application.boot(); // discover and bind every artifact
await application.start();
```

Given the layout below, `boot()` binds `datasources.PostgresDataSource`, `repositories.UserRepository`,
`services.UserService`, and `controllers.UserController` - no further code.

```
<projectRoot>/
  datasources/postgres.datasource.js
  repositories/user.repository.js
  services/user.service.js
  controllers/user.controller.js
```

## Discovery conventions

Each booter has a default directory and a default file suffix, and binds into its own namespace.

| Booter | Default dir | Default suffix | Binding key | Tag | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DatasourceBooter` | `datasources` | `.datasource.js` | `datasources.<ClassName>` | `datasources` | singleton |
| `RepositoryBooter` | `repositories` | `.repository.js` | `repositories.<ClassName>` | `repositories` | transient |
| `ServiceBooter` | `services` | `.service.js` | `services.<ClassName>` | `services` | transient |
| `ControllerBooter` | `controllers` | `.controller.js` | `controllers.<ClassName>` | `controllers` | transient |

Datasources are singletons because a connection pool must be shared; everything else resolves per use.
Directories resolve relative to the application's `getProjectRoot()`, which defaults to `process.cwd()`.
Subdirectories are included - `isNested` defaults to `true`.

Booters are registered datasources -> repositories -> services -> controllers, so a repository can
always resolve the datasource it injects.

> [!IMPORTANT]
> **The default suffixes end in `.js`, not `.ts`.** Discovery globs files on disk and `import`s them, and
> it is designed to run against your **compiled output**. Build first, and have `getProjectRoot()` point
> at the built directory - returning `__dirname` from the compiled entrypoint does exactly that. If
> `boot()` reports zero artifacts, this is almost always why. To boot from TypeScript sources instead,
> set the extensions explicitly: `{ controllers: { extensions: ['.controller.ts'] } }`.

## Phases

`Bootstrapper.boot()` runs three phases across **all** booters - phase by phase, not booter by booter.

| Phase | What happens |
| :--- | :--- |
| `configure` | Fill in defaults for `dirs`, `extensions`, `isNested`, then build the glob pattern |
| `discover` | Run the glob under the project root, collecting absolute file paths |
| `load` | `import()` each file, keep the exported classes, bind them into the container |

`boot()` resolves to an `IBootReport`: the booter class names that ran, per-phase `durationMs`, and
`totalDurationMs`. A throw in any phase is rewrapped naming both the phase and the booter, with the
original error kept as `cause`.

## Configuring discovery

Pass `bootOptions` in the application config. Every artifact type takes the same `IArtifactOptions`.

| Option | Type | Meaning |
| :--- | :--- | :--- |
| `dirs` | `string[]` | Directories to scan, relative to the project root |
| `extensions` | `string[]` | File suffixes to match |
| `isNested` | `boolean` | Include subdirectories - default `true` |
| `glob` | `string` | Raw glob pattern; overrides the three above |

```typescript
bootOptions: {
  controllers: { dirs: ['controllers', 'api'], extensions: ['.controller.js'] },
  services: { glob: 'modules/**/*.service.js' },
}
```

A key that is present but `undefined` - the shape `dirs: process.env.APP_DIRS?.split(',')` produces - is
treated as not provided and falls back to the default. An empty `dirs` or `extensions` array is not: it
throws when the pattern is built.

## Custom booters

Extend `BaseArtifactBooter` and implement its three hooks. The base class handles configure, discover,
and load; you decide only where to look and what to bind.

```typescript
import { BaseArtifactBooter, IApplication, IBootOptions } from '@venizia/ignis-boot';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

export class ObserverBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: ObserverBooter.name, root, artifactOptions: bootOptions.observers ?? {} });
  }

  protected override getDefaultDirs(): string[] {
    return ['observers'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.observer.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'observers', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('observers');
    }
  }
}
```

`IBootOptions` carries an index signature, so `bootOptions.observers` type-checks with no change to the
framework. Booters are found by the `booter` tag, so registering is all that remains - and it must
happen before `boot()` runs, which is earlier than `preConfigure()`:

```typescript
override async boot() {
  this.booter(ObserverBooter);
  return super.boot();
}
```

Every constructor parameter must carry `@inject` - a container-instantiated class with one bare
parameter is refused at boot.

## What you must know

- **Every exported class in a matched file is bound**, not only the one whose name matches the file.
  Keep helper classes out of `*.controller.js` and friends, or move them to their own module.
- **Discovery is filename-driven, not decorator-driven.** A correctly decorated controller in the wrong
  directory is invisible to it - register that one manually with `this.controller(...)`.
- Calling `boot()` twice does not double-register: the bootstrapper resets its booter list on each run.
- `reflect-metadata` must be imported once at your entrypoint, and `experimentalDecorators` plus
  `emitDecoratorMetadata` must be `true` **inline** in your `tsconfig.json` - Bun does not resolve them
  through `extends`, and `@inject` is silently dropped without them.

## Surface

| Export | What it is |
| :--- | :--- |
| `BaseArtifactBooter` | Abstract base implementing the three phases; extend it for custom artifacts |
| `Bootstrapper` | Runs the phases across every `booter`-tagged binding and returns the report |
| `BootMixin` | Adds `boot()`, `bootOptions`, and the four built-in booters to a raw `Container` |
| `ControllerBooter` / `ServiceBooter` / `RepositoryBooter` / `DatasourceBooter` | The built-in booters |
| `discoverFiles` / `loadClasses` | The glob and dynamic-import primitives, usable standalone |
| `BootPhases` | `configure`, `discover`, `load` |
| `IBootOptions` / `IArtifactOptions` / `IBootReport` / `IBooter` | Public types |

`BootMixin` is for applications not built on `BaseApplication` - it wires the same four booters onto any
`Container`. `BaseApplication` does its own registration and does not use the mixin.

Full detail: [Bootstrapping reference](https://ignis.venizia.ai/references/base/bootstrapping).

## Links

[Documentation](https://ignis.venizia.ai) &#8226;
[Quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) &#8226;
[Core API](https://ignis.venizia.ai/references/) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

Inspired by [LoopBack 4's boot system](https://loopback.io/doc/en/lb4/Booting-an-Application.html).

MIT licensed - see [LICENSE.md](LICENSE.md).
Questions: [GitHub Issues](https://github.com/VENIZIA-AI/ignis/issues) &#8226; developer@venizia.ai
</content>
