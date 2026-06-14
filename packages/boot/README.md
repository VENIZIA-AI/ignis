<div align="center">

# :fire: IGNIS - @venizia/ignis-boot

**Convention-based auto-discovery and bootstrapping for the IGNIS Framework**

[![npm](https://img.shields.io/npm/v/@venizia/ignis-boot.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-boot)
[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Discovers artifact files (controllers, services, repositories, datasources) by glob patterns and registers them into the IoC container during application startup. Three-phase lifecycle (configure, discover, load) with the Template Method pattern. Inspired by [LoopBack 4's boot system](https://loopback.io/doc/en/lb4/Booting-an-Application.html).

[Installation](#installation) &#8226; [Quick Start](#quick-start) &#8226; [API Reference](#core-concepts) &#8226; [Documentation](https://venizia-ai.github.io/ignis)

</div>

## Highlights

| | Feature | |
| :---: | :--- | :--- |
| **1** | **Three-Phase Lifecycle** | Configure, discover, load -- structured and predictable |
| **2** | **Convention Over Configuration** | Default dirs and extensions just work out of the box |
| **3** | **4 Built-in Booters** | Controllers, services, repositories, and datasources |
| **4** | **Template Method Pattern** | Extend `BaseArtifactBooter` for custom artifact types |
| **5** | **Performance Timing** | Built-in `performance.now()` boot report |

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Three-Phase Lifecycle](#three-phase-lifecycle)
  - [BaseArtifactBooter](#baseartifactbooter)
  - [Built-in Booters](#built-in-booters)
  - [Bootstrapper](#bootstrapper)
  - [BootMixin](#bootmixin)
- [Configuration](#configuration)
  - [IBootOptions](#ibootoptions)
  - [IArtifactOptions](#iartifactoptions)
  - [Pattern Generation](#pattern-generation)
- [Complete Lifecycle Walkthrough](#complete-lifecycle-walkthrough)
- [BaseArtifactBooter Internals](#baseartifactbooter-internals)
  - [Protected Properties](#protected-properties)
  - [Constructor](#baseartifactbooter-constructor)
  - [configure() -- Phase 1 Internals](#configure----phase-1-internals)
  - [discover() -- Phase 2 Internals](#discover----phase-2-internals)
  - [load() -- Phase 3 Internals](#load----phase-3-internals)
  - [getPattern() -- Pattern Builder Logic](#getpattern----pattern-builder-logic)
- [Pattern Generation Deep Dive](#pattern-generation-deep-dive)
  - [Single Dir + Single Extension](#single-dir--single-extension)
  - [Multiple Dirs + Multiple Extensions](#multiple-dirs--multiple-extensions)
  - [Nested vs Non-Nested](#nested-vs-non-nested)
  - [Custom Glob Override](#custom-glob-override)
  - [Dot Stripping from Extensions](#dot-stripping-from-extensions)
  - [Pattern Summary Table](#pattern-summary-table)
- [Built-in Booters Deep Dive](#built-in-booters-deep-dive)
  - [ControllerBooter](#controllerbooter)
  - [ServiceBooter](#servicebooter)
  - [RepositoryBooter](#repositorybooter)
  - [DatasourceBooter](#datasourcebooter)
  - [Why Are Datasources Singletons?](#why-are-datasources-singletons)
- [BootMixin Deep Dive](#bootmixin-deep-dive)
  - [Constructor Internals](#constructor-internals)
  - [boot() Method](#boot-method)
- [Bootstrapper Internals](#bootstrapper-internals)
  - [discoverBooters()](#discoverbooters)
  - [runPhase()](#runphase)
  - [Error Wrapping](#error-wrapping)
  - [Performance Timing](#performance-timing)
  - [IBootReport Structure](#ibootreport-structure)
- [Advanced Usage](#advanced-usage)
  - [Creating Custom Booters](#creating-custom-booters)
  - [Multiple Custom Booter Examples](#multiple-custom-booter-examples)
  - [Custom Glob Patterns](#custom-glob-patterns)
  - [Boot Options Override Examples](#boot-options-override-examples)
  - [Selective Phase Execution](#selective-phase-execution)
  - [Boot Report and Performance Timing](#boot-report-and-performance-timing)
- [Integration with BaseApplication](#integration-with-baseapplication)
- [Error Scenarios](#error-scenarios)
- [Debugging Boot](#debugging-boot)
- [Performance Tuning](#performance-tuning)
- [File Naming Conventions](#file-naming-conventions)
- [Boot Utilities](#boot-utilities)
- [Complete Type Reference](#complete-type-reference)
- [Constants Reference](#constants-reference)
- [Testing Patterns](#testing-patterns)
- [License](#license)

---

## Installation

```bash
bun add @venizia/ignis-boot
```

**Peer dependencies:**

```bash
bun add @venizia/ignis-inversion @venizia/ignis-helpers
```

---

## Quick Start

The fastest way to use `@venizia/ignis-boot` is through `BootMixin`, which enhances any `Container` subclass with auto-discovery capabilities:

```typescript
import { BootMixin, IBootOptions } from '@venizia/ignis-boot';
import { Container } from '@venizia/ignis-inversion';

class MyApplication extends BootMixin(Container) {
  bootOptions: IBootOptions = {
    controllers: { dirs: ['controllers'], isNested: true },
    services: { dirs: ['services'], isNested: true },
    repositories: { dirs: ['repositories'] },
    datasources: { dirs: ['datasources'] },
  };
}

// Bootstrap and start
const app = new MyApplication();
const report = await app.boot();
// All controllers, services, repositories, and datasources
// are now discovered and registered in the IoC container.
```

When used with `@venizia/ignis` (the core framework), `BaseApplication` already applies the `BootMixin` internally, so you only need to pass `bootOptions` through your application configs:

```typescript
import { BaseApplication, IApplicationConfigs } from '@venizia/ignis';

const appConfigs: IApplicationConfigs = {
  name: 'MyApp',
  bootOptions: {
    controllers: { dirs: ['controllers'], isNested: true },
    services: { dirs: ['services'], isNested: true },
    repositories: { dirs: ['repositories'] },
    datasources: { dirs: ['datasources'] },
  },
};

class Application extends BaseApplication {
  constructor() {
    super(appConfigs);
  }
}
```

---

## Core Concepts

### Three-Phase Lifecycle

Every booter follows a strict three-phase execution order. Phases run sequentially, and all registered booters execute within each phase before the next phase begins.

```
Phase 1: CONFIGURE    Phase 2: DISCOVER    Phase 3: LOAD
+-----------------+   +-----------------+   +-----------------+
| Merge user opts |   | Build glob      |   | Dynamic import  |
| with defaults   |-->| pattern from    |-->| discovered      |
| (dirs, exts,    |   | configured opts |   | files, filter   |
|  isNested, glob)|   | and scan FS     |   | class exports,  |
+-----------------+   +-----------------+   | bind to DI      |
                                            +-----------------+
```

**Phase 1 -- Configure:** Merges user-provided options (`dirs`, `extensions`, `isNested`, `glob`) with the booter's defaults. If you provide `dirs: ['custom-controllers']`, it replaces the default `['controllers']`. If you provide nothing, defaults are used.

**Phase 2 -- Discover:** Builds a glob pattern from the configured options and scans the filesystem relative to the project root. The result is an array of absolute file paths stored in `discoveredFiles`.

**Phase 3 -- Load:** Dynamically imports each discovered file, filters all exports to keep only class constructors (using `isClass`), and then calls `bind()` to register each class in the IoC container with the appropriate namespace and scope.

### BaseArtifactBooter

The `BaseArtifactBooter` implements the [Template Method pattern](https://refactoring.guru/design-patterns/template-method). It defines the algorithm skeleton (configure, discover, load) while deferring booter-specific behavior to subclasses through abstract methods.

```
BaseArtifactBooter (extends BaseHelper, implements IBooter)
  |
  |-- configure()                     # Phase 1: merge options with defaults
  |-- discover()                      # Phase 2: glob filesystem for files
  |-- load()                          # Phase 3: import files + call bind()
  |
  |-- abstract getDefaultDirs()       # Subclass: default directories
  |-- abstract getDefaultExtensions() # Subclass: default file extensions
  |-- abstract bind()                 # Subclass: register classes in container
  |
  |-- getPattern()                    # Build glob pattern from options
  |
  |-- (protected) root               # Project root directory
  |-- (protected) artifactOptions     # Merged configuration
  |-- (protected) discoveredFiles     # Result of discover phase
  |-- (protected) loadedClasses       # Result of load phase
```

The base class handles all the common logic (option merging, glob execution, file importing, class filtering), so subclasses only need to declare their conventions and binding strategy.

### Built-in Booters

The package ships with four built-in booters covering the most common artifact types:

| Booter               | Default Directory | Default Extension   | Namespace      | Scope         | Binding Key Example              |
| -------------------- | ----------------- | ------------------- | -------------- | ------------- | -------------------------------- |
| `ControllerBooter`   | `controllers/`    | `.controller.js`    | `controllers`  | transient     | `controllers.UserController`     |
| `ServiceBooter`      | `services/`       | `.service.js`       | `services`     | transient     | `services.AuthService`           |
| `RepositoryBooter`   | `repositories/`   | `.repository.js`    | `repositories` | transient     | `repositories.UserRepository`    |
| `DatasourceBooter`   | `datasources/`    | `.datasource.js`    | `datasources`  | **singleton** | `datasources.PostgresDataSource` |

**Why are datasources singletons?** Datasources manage connection pools and shared resources (database connections, Redis clients, etc.). Creating new instances per injection would leak connections and defeat pool sharing. All other artifact types default to transient scope.

Each built-in booter receives its configuration via constructor injection:

```typescript
export class ControllerBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({
      scope: ControllerBooter.name,
      root,
      artifactOptions: bootOptions.controllers ?? {},
    });
  }

  protected override getDefaultDirs(): string[] {
    return ['controllers'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.controller.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'controllers', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('controllers');
    }
  }
}
```

### Bootstrapper

The `Bootstrapper` is the orchestrator that coordinates all booters through all phases. It is responsible for:

1. **Discovering booters** -- finds all bindings tagged with `'booter'` in the container
2. **Running phases** -- executes each phase sequentially on all discovered booters
3. **Error handling** -- wraps errors with context (phase name + booter class name)
4. **Performance timing** -- tracks `performance.now()` timestamps per phase

```typescript
export class Bootstrapper extends BaseHelper implements IBootstrapper {
  constructor(
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
  ) {
    super({ scope: Bootstrapper.name });
  }

  async boot(opts: IBootExecutionOptions): Promise<IBootReport> {
    const { phases = BOOT_PHASES, booters } = opts;

    await this.discoverBooters();
    for (const phase of phases) {
      await this.runPhase({ phase, booterNames: booters });
    }
    return this.generateReport();
  }
}
```

**Execution flow:**

```
boot()
  |-> discoverBooters()          # Find all 'booter'-tagged bindings
  |-> runPhase('configure')      # All booters: configure()
  |-> runPhase('discover')       # All booters: discover()
  |-> runPhase('load')           # All booters: load()
  |-> generateReport()           # Return performance data
```

Within each phase, booters are executed sequentially in registration order. This is important because the registration order in `BootMixin` is:

1. `DatasourceBooter` -- datasources first (others may depend on them)
2. `RepositoryBooter` -- repositories second (depend on datasources)
3. `ServiceBooter` -- services third (depend on repositories)
4. `ControllerBooter` -- controllers last (depend on services)

### BootMixin

`BootMixin` is a mixin function that enhances any `Container` subclass with boot capabilities. It handles all the wiring automatically:

```typescript
import { BootMixin } from '@venizia/ignis-boot';
import { Container } from '@venizia/ignis-inversion';

class MyApp extends BootMixin(Container) {
  bootOptions = { /* ... */ };
}
```

**What it registers in the constructor:**

| Binding Key                 | Value                   | Tags     | Scope     |
| --------------------------- | ----------------------- | -------- | --------- |
| `@app/boot-options`         | User's `bootOptions`    | --       | --        |
| `booter.DatasourceBooter`   | `DatasourceBooter` class | `booter` | transient |
| `booter.RepositoryBooter`   | `RepositoryBooter` class | `booter` | transient |
| `booter.ServiceBooter`      | `ServiceBooter` class   | `booter` | transient |
| `booter.ControllerBooter`   | `ControllerBooter` class | `booter` | transient |
| `bootstrapper`              | `Bootstrapper` class    | --       | singleton |

**What it adds to the class:**

- `bootOptions?: IBootOptions` -- property for user configuration
- `boot(): Promise<IBootReport>` -- method that resolves the `Bootstrapper` singleton and calls `boot({})`

---

## Configuration

### IBootOptions

The top-level configuration object maps artifact type names to their discovery options. It includes four built-in keys and supports arbitrary extension:

```typescript
interface IBootOptions {
  controllers?: IArtifactOptions;
  services?: IArtifactOptions;
  repositories?: IArtifactOptions;
  datasources?: IArtifactOptions;
  [artifactType: string]: IArtifactOptions | undefined; // Extensible for custom booters
}
```

**Example:**

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    dirs: ['controllers'],
    isNested: true,
  },
  services: {
    dirs: ['services'],
    extensions: ['.service.js'],
  },
  repositories: {
    dirs: ['repositories'],
  },
  datasources: {
    dirs: ['datasources'],
  },
  // Custom booter options
  handlers: {
    dirs: ['handlers'],
    extensions: ['.handler.js'],
  },
};
```

### IArtifactOptions

Configuration for a single artifact type's discovery behavior:

```typescript
interface IArtifactOptions {
  dirs?: string[];        // Directories to scan (relative to project root)
  extensions?: string[];  // File extensions to match (e.g., '.controller.js')
  isNested?: boolean;     // Scan subdirectories? Default: true
  glob?: string;          // Custom glob pattern (overrides dirs/extensions entirely)
}
```

| Option       | Type       | Default          | Description                                                           |
| ------------ | ---------- | ---------------- | --------------------------------------------------------------------- |
| `dirs`       | `string[]` | Booter-specific  | Directories to scan, relative to project root                         |
| `extensions` | `string[]` | Booter-specific  | File extension patterns to match                                      |
| `isNested`   | `boolean`  | `true`           | Whether to recurse into subdirectories                                |
| `glob`       | `string`   | `undefined`      | Custom glob pattern; if set, `dirs` and `extensions` are ignored      |

### Pattern Generation

When no custom `glob` is provided, `BaseArtifactBooter.getPattern()` builds a glob pattern from `dirs`, `extensions`, and `isNested`:

**Single directory, single extension:**

```
dirs: ['repositories']
extensions: ['.repository.js']
isNested: true

Result: repositories/{**/*,*}.repository.js
```

**Multiple directories or extensions:**

```
dirs: ['dir1', 'dir2']
extensions: ['.ext1.js', '.ext2.js']
isNested: true

Result: {dir1,dir2}/{**/*,*}.{ext1.js,ext2.js}
```

**Non-nested (single level only):**

```
dirs: ['controllers']
extensions: ['.controller.js']
isNested: false

Result: controllers/*.controller.js
```

**Custom glob (overrides everything):**

```
glob: 'custom/glob/pattern/**/*.js'

Result: custom/glob/pattern/**/*.js
```

The leading dot in extensions is automatically stripped during pattern generation. For example, `.controller.js` becomes `controller.js` in the glob pattern.

---

## Complete Lifecycle Walkthrough

This section walks through what happens step-by-step when you call `app.boot()` on an application with the following configuration:

```typescript
const bootOptions: IBootOptions = {
  controllers: { dirs: ['controllers'], isNested: true },
  services: { dirs: ['services'] },
  repositories: { dirs: ['repositories'] },
  datasources: { dirs: ['datasources'] },
};
```

Assume the project's `dist/` directory has this structure:

```
dist/
  controllers/
    user.controller.js        (exports UserController)
    admin/
      admin.controller.js     (exports AdminController)
  services/
    auth.service.js            (exports AuthService)
  repositories/
    user.repository.js         (exports UserRepository)
  datasources/
    postgres.datasource.js     (exports PostgresDataSource)
```

### Step 1: boot() is called

The `boot()` method (from `BootMixin` or `BaseApplication`) resolves the `Bootstrapper` singleton from the container:

```typescript
boot(): Promise<IBootReport> {
  const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
  return bootstrapper.boot({});
}
```

### Step 2: Bootstrapper.boot() begins

The `Bootstrapper` is instantiated (or retrieved from singleton cache) and runs:

```
[Bootstrapper][boot] Starting boot | Number of booters: 4
```

### Step 3: discoverBooters()

The `Bootstrapper` calls `this.application.findByTag({ tag: 'booter' })` to find all bindings tagged `'booter'`. It resolves each binding (instantiating the booter class via the IoC container), which triggers constructor injection of `@app/project_root`, `@app/instance`, and `@app/boot-options`.

```
[Bootstrapper][discoverBooters] Discovered booter: booter.DatasourceBooter
[Bootstrapper][discoverBooters] Discovered booter: booter.RepositoryBooter
[Bootstrapper][discoverBooters] Discovered booter: booter.ServiceBooter
[Bootstrapper][discoverBooters] Discovered booter: booter.ControllerBooter
```

The booters are stored in an array in registration order. This order matters -- datasources are discovered and loaded before repositories, which are discovered before services, etc.

### Step 4: Phase CONFIGURE

The `Bootstrapper` calls `configure()` on each booter sequentially.

Each booter merges user-provided options with its defaults. If the user specified `dirs: ['controllers']`, that is used. If the user did not specify `extensions`, the booter falls back to its `getDefaultExtensions()` return value.

```
[Bootstrapper][runPhase] Starting phase: CONFIGURE

[DatasourceBooter][configure] Configured: {"dirs":["datasources"],"extensions":[".datasource.js"],"isNested":true}
[RepositoryBooter][configure] Configured: {"dirs":["repositories"],"extensions":[".repository.js"],"isNested":true}
[ServiceBooter][configure] Configured: {"dirs":["services"],"extensions":[".service.js"],"isNested":true}
[ControllerBooter][configure] Configured: {"dirs":["controllers"],"extensions":[".controller.js"],"isNested":true}

[Bootstrapper][runPhase] Completed phase: CONFIGURE | Took: 0.42 ms
```

### Step 5: Phase DISCOVER

Each booter calls `getPattern()` to build a glob string, then uses the `glob` library to scan the filesystem from the project root.

```
[Bootstrapper][runPhase] Starting phase: DISCOVER

[DatasourceBooter][discover] Root: /app/dist | Using pattern: datasources/{**/*,*}.datasource.js | Discovered file: ["/app/dist/datasources/postgres.datasource.js"]
[RepositoryBooter][discover] Root: /app/dist | Using pattern: repositories/{**/*,*}.repository.js | Discovered file: ["/app/dist/repositories/user.repository.js"]
[ServiceBooter][discover] Root: /app/dist | Using pattern: services/{**/*,*}.service.js | Discovered file: ["/app/dist/services/auth.service.js"]
[ControllerBooter][discover] Root: /app/dist | Using pattern: controllers/{**/*,*}.controller.js | Discovered file: ["/app/dist/controllers/user.controller.js","/app/dist/controllers/admin/admin.controller.js"]

[Bootstrapper][runPhase] Completed phase: DISCOVER | Took: 12.8 ms
```

Note how `controllers/admin/admin.controller.js` was discovered because `isNested: true` generates the pattern `{**/*,*}` which matches both the root level and subdirectories.

### Step 6: Phase LOAD

Each booter dynamically imports its discovered files using `await import(file)`, iterates all named exports, filters for class constructors using `isClass()`, and then calls its `bind()` method to register classes in the IoC container.

```
[Bootstrapper][runPhase] Starting phase: LOAD

[DatasourceBooter][bind] Bound key: datasources.PostgresDataSource       (scope: singleton)
[RepositoryBooter][bind] Bound key: repositories.UserRepository          (scope: transient)
[ServiceBooter][bind] Bound key: services.AuthService                    (scope: transient)
[ControllerBooter][bind] Bound key: controllers.UserController           (scope: transient)
[ControllerBooter][bind] Bound key: controllers.AdminController          (scope: transient)

[Bootstrapper][runPhase] Completed phase: LOAD | Took: 45.3 ms
```

### Step 7: generateReport()

The `Bootstrapper` returns an `IBootReport` object. The current implementation returns an empty object (`{}`), but the infrastructure for phase timing is in place for future extension.

```
[Bootstrapper][generateReport] Boot report: {}
```

### Final State

After boot completes, the IoC container holds:

| Binding Key                        | Class                | Scope     | Tags          |
| ---------------------------------- | -------------------- | --------- | ------------- |
| `datasources.PostgresDataSource`   | `PostgresDataSource` | singleton | `datasources` |
| `repositories.UserRepository`      | `UserRepository`     | transient | `repositories`|
| `services.AuthService`             | `AuthService`        | transient | `services`    |
| `controllers.UserController`       | `UserController`     | transient | `controllers` |
| `controllers.AdminController`      | `AdminController`    | transient | `controllers` |

These can now be resolved anywhere via `@inject({ key: 'services.AuthService' })` or `app.get({ key: 'controllers.UserController' })`.

---

## BaseArtifactBooter Internals

This section documents every protected property, method, and internal behavior of `BaseArtifactBooter`.

### Protected Properties

```typescript
export abstract class BaseArtifactBooter extends BaseHelper implements IBooter {
  protected root: string = '';
  protected artifactOptions: IArtifactOptions = {};
  protected discoveredFiles: string[] = [];
  protected loadedClasses: TClass<any>[] = [];

  // Inherited from BaseHelper:
  // scope: string
  // identifier: string
  // logger: Logger
}
```

| Property          | Type              | Initial Value | Description                                                                                                                                       |
| ----------------- | ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root`            | `string`          | `''`          | Absolute path to the project root directory. Set from constructor `opts.root`. Glob patterns are resolved relative to this path.                   |
| `artifactOptions` | `IArtifactOptions` | `{}`          | The merged configuration after `configure()` runs. Before `configure()`, holds whatever the user passed (or `{}`). After `configure()`, has all fields populated with defaults. |
| `discoveredFiles` | `string[]`        | `[]`          | Array of absolute file paths populated by `discover()`. Reset to `[]` at the start of each `discover()` call.                                     |
| `loadedClasses`   | `TClass<any>[]`   | `[]`          | Array of class constructors extracted from discovered files by `load()`. Reset to `[]` at the start of each `load()` call.                        |

### BaseArtifactBooter Constructor

```typescript
constructor(opts: IBooterOptions) {
  super({ scope: opts.scope });

  this.artifactOptions = opts.artifactOptions;
  this.root = opts.root;
}
```

The constructor receives an `IBooterOptions` object with three fields:

| Field              | Type               | Description                                                                                    |
| ------------------ | ------------------ | ---------------------------------------------------------------------------------------------- |
| `scope`            | `string`           | Logger scope name, typically `BooterClassName.name` (e.g., `"ControllerBooter"`)               |
| `root`             | `string`           | Absolute path to project root (injected as `@app/project_root`)                                |
| `artifactOptions`  | `IArtifactOptions` | User-provided options from `bootOptions.controllers` (or whichever artifact key)               |

The `super({ scope })` call initializes the `BaseHelper` which sets up scoped logging via `LoggerFactory.getLogger([scope])`.

### configure() -- Phase 1 Internals

```typescript
async configure(): Promise<void> {
  this.artifactOptions = {
    dirs: this.artifactOptions?.dirs ?? this.getDefaultDirs(),
    extensions: this.artifactOptions?.extensions ?? this.getDefaultExtensions(),
    isNested: this.artifactOptions?.isNested ?? true,
    glob: this.artifactOptions?.glob,
    ...this.artifactOptions,
  };

  this.logger.for(this.configure.name).debug(`Configured: %j`, this.artifactOptions);
}
```

**Merge behavior in detail:**

1. A new object is created with defaults computed from `getDefaultDirs()` and `getDefaultExtensions()`
2. The spread `...this.artifactOptions` at the end means any user-provided values override the defaults
3. If the user provided `dirs: ['custom']`, the default is computed as `['controllers']` but then overwritten by the spread
4. If the user provided nothing for `dirs`, `this.artifactOptions?.dirs` is `undefined`, so `getDefaultDirs()` is used
5. `isNested` defaults to `true` if not provided
6. `glob` is passed through as-is (no default)

**Important:** Because of the spread at the end, user options always win. This means if you pass `{ dirs: ['custom-controllers'], extensions: ['.ctrl.js'] }`, both fields override defaults.

### discover() -- Phase 2 Internals

```typescript
async discover(): Promise<void> {
  const pattern = this.getPattern();

  try {
    this.discoveredFiles = []; // Reset discovered files
    this.discoveredFiles = await discoverFiles({ root: this.root, pattern });
    this.logger
      .for(this.discover.name)
      .debug(
        `Root: %s | Using pattern: %s | Discovered file: %j`,
        this.root,
        pattern,
        this.discoveredFiles,
      );
  } catch (error) {
    throw getError({
      message: `[discover] Failed to discover files using pattern: ${pattern} | Error: ${(error as Error)?.message}`,
    });
  }
}
```

**Key behaviors:**

1. `discoveredFiles` is reset to `[]` before each discovery run -- this means calling `discover()` multiple times replaces previous results
2. `getPattern()` is called to build the glob string (see next section)
3. `discoverFiles()` uses the `glob` npm package with `{ cwd: root, absolute: true }` options
4. Results are absolute file paths (e.g., `/app/dist/controllers/user.controller.js`)
5. If the glob pattern matches zero files, `discoveredFiles` is simply an empty array -- this is not an error
6. If the `glob` library itself throws (e.g., invalid pattern syntax), the error is caught and re-thrown with context

### load() -- Phase 3 Internals

```typescript
async load(): Promise<void> {
  if (!this.discoveredFiles.length) {
    this.logger.for(this.load.name).debug(`No files discovered to load.`);
    return;
  }

  try {
    this.loadedClasses = []; // Reset loaded classes
    this.loadedClasses = await loadClasses({ files: this.discoveredFiles, root: this.root });
    await this.bind();
  } catch (error) {
    throw getError({
      message: `[load] Failed to load classes from discovered files | Error: ${(error as Error)?.message}`,
    });
  }
}
```

**Key behaviors:**

1. If `discoveredFiles` is empty, `load()` returns immediately with a debug log -- no error thrown
2. `loadedClasses` is reset to `[]` before each load
3. `loadClasses()` iterates each file, calls `await import(file)`, and checks every named export with `isClass()`
4. `isClass()` checks: `typeof target === 'function' && target.prototype !== undefined`
5. Arrow functions fail the `isClass` check because they have no `prototype` property
6. After loading classes, the abstract `bind()` method is called -- this is where subclasses register classes in the container
7. If any file import fails or `bind()` throws, the error is caught and re-thrown with context

### getPattern() -- Pattern Builder Logic

```typescript
protected getPattern(): string {
  // Use custom glob if provided
  if (this.artifactOptions.glob) {
    return this.artifactOptions.glob;
  }

  if (!this.artifactOptions.dirs?.length) {
    throw getError({
      message: `[getPattern] No directories specified for artifact discovery`,
    });
  }

  if (!this.artifactOptions.extensions?.length) {
    throw getError({
      message: `[${this.scope}][getPattern] No file extensions specified for artifact discovery`,
    });
  }

  const dirs = this.artifactOptions.dirs.join(',');
  const exts = this.artifactOptions.extensions
    .map(e => (e.startsWith('.') ? e.slice(1) : e))
    .join(',');

  const nested = this.artifactOptions.isNested ? '{**/*,*}' : '*';

  if (this.artifactOptions.dirs.length > 1 || this.artifactOptions.extensions.length > 1) {
    return `{${dirs}}/${nested}.{${exts}}`;
  } else {
    return `${dirs}/${nested}.${exts}`;
  }
}
```

**Decision tree:**

1. If `glob` is set, return it immediately (no validation of dirs/extensions)
2. If no `dirs` provided, throw an error
3. If no `extensions` provided, throw an error
4. Strip leading dots from extensions: `.controller.js` becomes `controller.js`
5. If there is exactly one dir AND exactly one extension, use the simple format: `dir/nested.ext`
6. If there are multiple dirs OR multiple extensions, use brace expansion: `{dirs}/nested.{exts}`

**Why `{**/*,*}` for nested?** This glob alternation matches files in both subdirectories (`**/file`) and the root directory (`file`). Without the `,*` part, files directly in the target directory (not in a subdirectory) would not be matched.

---

## Pattern Generation Deep Dive

### Single Dir + Single Extension

**Input:**

```typescript
{ dirs: ['controllers'], extensions: ['.controller.js'], isNested: true }
```

**Processing:**

- `dirs.join(',')` => `"controllers"`
- Extensions: `.controller.js` => strip dot => `"controller.js"`
- `dirs.length === 1 && extensions.length === 1` => simple format
- `nested = '{**/*,*}'`

**Output:**

```
controllers/{**/*,*}.controller.js
```

**Matches:** `controllers/user.controller.js`, `controllers/admin/user.controller.js`, `controllers/a/b/c/deep.controller.js`

**Does NOT match:** `controllers/user.service.js`, `other-dir/user.controller.js`

### Multiple Dirs + Multiple Extensions

**Input:**

```typescript
{ dirs: ['private-controllers', 'public-controllers'], extensions: ['.controller.js', '.ctrl.js'], isNested: true }
```

**Processing:**

- `dirs.join(',')` => `"private-controllers,public-controllers"`
- Extensions: `.controller.js` => `controller.js`, `.ctrl.js` => `ctrl.js` => `"controller.js,ctrl.js"`
- `dirs.length === 2 || extensions.length === 2` => brace expansion format

**Output:**

```
{private-controllers,public-controllers}/{**/*,*}.{controller.js,ctrl.js}
```

**Matches:** `private-controllers/user.controller.js`, `public-controllers/admin/settings.ctrl.js`

### Multiple Dirs + Single Extension

**Input:**

```typescript
{ dirs: ['api', 'admin'], extensions: ['.controller.js'], isNested: true }
```

**Processing:**

- `dirs.length === 2` => brace expansion triggered

**Output:**

```
{api,admin}/{**/*,*}.controller.js
```

### Single Dir + Multiple Extensions

**Input:**

```typescript
{ dirs: ['services'], extensions: ['.service.js', '.svc.js'], isNested: true }
```

**Processing:**

- `extensions.length === 2` => brace expansion triggered

**Output:**

```
{services}/{**/*,*}.{service.js,svc.js}
```

### Nested vs Non-Nested

**Nested (default, `isNested: true`):**

```typescript
{ dirs: ['repositories'], extensions: ['.repository.js'], isNested: true }
```

**Output:**

```
repositories/{**/*,*}.repository.js
```

The `{**/*,*}` alternation ensures files are matched at any depth, including the root of the directory.

**Non-nested (`isNested: false`):**

```typescript
{ dirs: ['repositories'], extensions: ['.repository.js'], isNested: false }
```

**Output:**

```
repositories/*.repository.js
```

Only matches files directly inside `repositories/` -- no subdirectory scanning.

### Custom Glob Override

**Input:**

```typescript
{ dirs: ['ignored'], extensions: ['.ignored.js'], glob: 'modules/**/handlers/*.handler.js' }
```

**Output:**

```
modules/**/handlers/*.handler.js
```

When `glob` is set, `dirs`, `extensions`, and `isNested` are all completely ignored. The custom glob is returned as-is.

### Dot Stripping from Extensions

The `getPattern()` method strips the leading dot from each extension before building the pattern:

```typescript
const exts = this.artifactOptions.extensions
  .map(e => (e.startsWith('.') ? e.slice(1) : e))
  .join(',');
```

| Input Extension       | After Stripping       | In Pattern              |
| --------------------- | --------------------- | ----------------------- |
| `.controller.js`      | `controller.js`       | `*.controller.js`       |
| `.service.js`         | `service.js`          | `*.service.js`          |
| `handler.js`          | `handler.js` (no dot) | `*.handler.js`          |
| `.my.custom.ext.js`   | `my.custom.ext.js`    | `*.my.custom.ext.js`    |

This means files need a dot before the extension in their filename. For example, the pattern `*.controller.js` matches `user.controller.js` but does NOT match `usercontrollerjs` or `user-controller.js`.

### Pattern Summary Table

| dirs                  | extensions                         | isNested | glob                | Generated Pattern                                      |
| --------------------- | ---------------------------------- | -------- | ------------------- | ------------------------------------------------------ |
| `['controllers']`     | `['.controller.js']`               | `true`   | --                  | `controllers/{**/*,*}.controller.js`                   |
| `['controllers']`     | `['.controller.js']`               | `false`  | --                  | `controllers/*.controller.js`                          |
| `['api', 'admin']`    | `['.controller.js']`               | `true`   | --                  | `{api,admin}/{**/*,*}.controller.js`                   |
| `['services']`        | `['.service.js', '.svc.js']`       | `true`   | --                  | `{services}/{**/*,*}.{service.js,svc.js}`              |
| `['a', 'b']`          | `['.x.js', '.y.js']`              | `true`   | --                  | `{a,b}/{**/*,*}.{x.js,y.js}`                          |
| `['a', 'b']`          | `['.x.js', '.y.js']`              | `false`  | --                  | `{a,b}/*.{x.js,y.js}`                                 |
| any                   | any                                | any      | `'custom/**/*.js'`  | `custom/**/*.js`                                       |

---

## Built-in Booters Deep Dive

All four built-in booters share the same structure. They differ only in their default directories, default extensions, binding namespace, and binding scope. Each one receives three constructor-injected values:

| Injection Key        | Type           | Description                                              |
| -------------------- | -------------- | -------------------------------------------------------- |
| `@app/project_root`  | `string`       | Absolute path to the project's build output directory    |
| `@app/instance`      | `IApplication` | The application container instance (for binding classes) |
| `@app/boot-options`  | `IBootOptions` | The user's boot options object                           |

### ControllerBooter

**Source:** `src/booters/controller.booter.ts`

```typescript
export class ControllerBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: ControllerBooter.name, root, artifactOptions: bootOptions.controllers ?? {} });
  }

  protected override getDefaultDirs(): string[] {
    return ['controllers'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.controller.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'controllers', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('controllers');
      this.logger.for(this.bind.name).debug('Bound key: %s', key);
    }
  }
}
```

| Property             | Value                                                          |
| -------------------- | -------------------------------------------------------------- |
| Default dirs         | `['controllers']`                                              |
| Default extensions   | `['.controller.js']`                                           |
| Namespace            | `controllers`                                                  |
| Binding key format   | `controllers.{ClassName}` (e.g., `controllers.UserController`) |
| Scope                | transient (default)                                            |
| Tags                 | `controllers`                                                  |

### ServiceBooter

**Source:** `src/booters/service.booter.ts`

```typescript
export class ServiceBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) protected application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: ServiceBooter.name, root, artifactOptions: bootOptions.services ?? {} });
  }

  protected override getDefaultDirs(): string[] {
    return ['services'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.service.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'services', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('services');
      this.logger.for(this.bind.name).debug('Bound key: %s', key);
    }
  }
}
```

| Property             | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| Default dirs         | `['services']`                                             |
| Default extensions   | `['.service.js']`                                          |
| Namespace            | `services`                                                 |
| Binding key format   | `services.{ClassName}` (e.g., `services.AuthService`)      |
| Scope                | transient (default)                                        |
| Tags                 | `services`                                                 |

### RepositoryBooter

**Source:** `src/booters/repository.booter.ts`

```typescript
export class RepositoryBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) protected application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: RepositoryBooter.name, root, artifactOptions: bootOptions.repositories ?? {} });
  }

  protected override getDefaultDirs(): string[] {
    return ['repositories'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.repository.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'repositories', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('repositories');
      this.logger.for(this.bind.name).debug('Bound key: %s', key);
    }
  }
}
```

| Property             | Value                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| Default dirs         | `['repositories']`                                                     |
| Default extensions   | `['.repository.js']`                                                   |
| Namespace            | `repositories`                                                         |
| Binding key format   | `repositories.{ClassName}` (e.g., `repositories.UserRepository`)       |
| Scope                | transient (default)                                                    |
| Tags                 | `repositories`                                                         |

### DatasourceBooter

**Source:** `src/booters/datasource.booter.ts`

```typescript
export class DatasourceBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: DatasourceBooter.name, root, artifactOptions: bootOptions.datasources ?? {} });
  }

  protected override getDefaultDirs(): string[] {
    return ['datasources'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.datasource.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'datasources', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('datasources').setScope('singleton');
      this.logger.for(this.bind.name).debug('Bound key: %s', key);
    }
  }
}
```

| Property             | Value                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| Default dirs         | `['datasources']`                                                          |
| Default extensions   | `['.datasource.js']`                                                       |
| Namespace            | `datasources`                                                              |
| Binding key format   | `datasources.{ClassName}` (e.g., `datasources.PostgresDataSource`)         |
| Scope                | **singleton**                                                              |
| Tags                 | `datasources`                                                              |

### Why Are Datasources Singletons?

The `DatasourceBooter` is the only built-in booter that sets `.setScope('singleton')` on its bindings. This is a critical design decision:

1. **Connection pooling.** A datasource typically creates a connection pool to the database (e.g., a `pg.Pool` with 10-20 connections). Creating a new pool per injection would exhaust database connections under load.

2. **Resource sharing.** Multiple repositories share the same datasource instance. If `UserRepository` and `OrderRepository` both reference `PostgresDataSource`, they share one connection pool rather than each managing their own.

3. **Schema discovery.** Datasources use `discoverSchema()` to collect all table schemas from their associated repositories. This discovery runs once during startup and caches the result. Multiple instances would repeat this work needlessly.

4. **Transaction coordination.** When two repositories participate in the same transaction, they must share the same underlying connection. Singleton datasources make this possible.

All other booters use transient scope because controllers, services, and repositories are lightweight wrappers with no expensive resources to share. They are instantiated fresh for each container resolution.

---

## BootMixin Deep Dive

**Source:** `src/boot.mixin.ts`

The full source of `BootMixin`:

```typescript
import {
  Bootstrapper,
  ControllerBooter,
  DatasourceBooter,
  IBootableApplication,
  IBootOptions,
  IBootReport,
  RepositoryBooter,
  ServiceBooter,
} from '@venizia/ignis-boot';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { BindingScopes, Container } from '@venizia/ignis-inversion';

export const BootMixin = <T extends TMixinTarget<Container>>(baseClass: T) => {
  class Mixed extends baseClass implements IBootableApplication {
    constructor(...args: any[]) {
      super(...args);

      this.bind({ key: `@app/boot-options` }).toValue(this.bootOptions ?? {});

      this.bind({ key: 'booter.DatasourceBooter' }).toClass(DatasourceBooter).setTags('booter');
      this.bind({ key: 'booter.RepositoryBooter' }).toClass(RepositoryBooter).setTags('booter');
      this.bind({ key: 'booter.ServiceBooter' }).toClass(ServiceBooter).setTags('booter');
      this.bind({ key: 'booter.ControllerBooter' }).toClass(ControllerBooter).setTags('booter');

      this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper).setScope(BindingScopes.SINGLETON);
    }

    bootOptions?: IBootOptions | undefined;

    boot(): Promise<IBootReport> {
      const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
      return bootstrapper.boot({});
    }
  }

  return Mixed;
};
```

### Constructor Internals

When the `BootMixin` constructor runs, it performs exactly 6 binding registrations in this order:

**1. Boot options binding:**

```typescript
this.bind({ key: '@app/boot-options' }).toValue(this.bootOptions ?? {});
```

Binds the user's `bootOptions` object (or `{}` if undefined) as a plain value. This is injected into every booter's constructor.

**2-5. Booter class registrations (in dependency order):**

```typescript
this.bind({ key: 'booter.DatasourceBooter' }).toClass(DatasourceBooter).setTags('booter');
this.bind({ key: 'booter.RepositoryBooter' }).toClass(RepositoryBooter).setTags('booter');
this.bind({ key: 'booter.ServiceBooter' }).toClass(ServiceBooter).setTags('booter');
this.bind({ key: 'booter.ControllerBooter' }).toClass(ControllerBooter).setTags('booter');
```

Each booter is:

- Bound as a **class** (not an instance) -- the container instantiates it on resolution with constructor injection
- Tagged with `'booter'` -- this is how the `Bootstrapper` discovers them via `findByTag({ tag: 'booter' })`
- Registered in **dependency order** -- datasources before repositories before services before controllers

The registration order determines execution order within each phase. This ensures that during the LOAD phase, datasources are bound to the container before repositories try to resolve them.

**6. Bootstrapper singleton:**

```typescript
this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper).setScope(BindingScopes.SINGLETON);
```

The `Bootstrapper` is a singleton because it maintains internal state (the booter list, phase timings). Multiple `boot()` calls resolve the same `Bootstrapper` instance.

### boot() Method

```typescript
boot(): Promise<IBootReport> {
  const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
  return bootstrapper.boot({});
}
```

The `boot()` method:

1. Resolves the `Bootstrapper` singleton from the container (which triggers `@inject({ key: '@app/instance' })` constructor injection)
2. Calls `bootstrapper.boot({})` with an empty options object, which means all phases run on all booters
3. Returns the `IBootReport` promise

---

## Bootstrapper Internals

**Source:** `src/bootstrapper.ts`

### Full Source

```typescript
export class Bootstrapper extends BaseHelper implements IBootstrapper {
  private booters: IBooter[] = [];
  private phaseStartTimings: Map<string, number> = new Map();
  private phaseEndTimings: Map<string, number> = new Map();

  constructor(@inject({ key: '@app/instance' }) private readonly application: IApplication) {
    super({ scope: Bootstrapper.name });
  }

  async boot(opts: IBootExecutionOptions): Promise<IBootReport> {
    const { phases = BOOT_PHASES, booters } = opts;

    await this.discoverBooters();
    this.logger
      .for(this.boot.name)
      .debug(`Starting boot | Number of booters: %d`, this.booters.length);
    for (const phase of phases) {
      await this.runPhase({ phase, booterNames: booters });
    }
    return this.generateReport();
  }

  // ...
}
```

### discoverBooters()

```typescript
private async discoverBooters(): Promise<void> {
  const booterBindings = this.application.findByTag<IBooter>({ tag: 'booter' });

  for (const binding of booterBindings) {
    this.booters.push(binding.getValue(this.application));
    this.logger.for(this.discoverBooters.name).debug(`Discovered booter: %s`, binding.key);
  }
}
```

This method:

1. Calls `this.application.findByTag({ tag: 'booter' })` which returns all `Binding` objects that have the `'booter'` tag
2. For each binding, calls `binding.getValue(this.application)` which:
   - Instantiates the booter class (since booters are bound via `.toClass()`)
   - Performs constructor injection, resolving `@app/project_root`, `@app/instance`, and `@app/boot-options` from the container
3. Pushes each instantiated booter into the `this.booters` array
4. Logs the binding key for each discovered booter

The order of `booterBindings` matches the order they were registered in the container. Since `BootMixin` registers them in the order Datasource -> Repository -> Service -> Controller, that is the execution order.

### runPhase()

```typescript
private async runPhase(opts: { phase: TBootPhase; booterNames?: string[] }): Promise<void> {
  const { phase } = opts;
  this.phaseStartTimings.set(phase, performance.now());
  this.logger.for(this.runPhase.name).debug(`Starting phase: %s`, phase.toUpperCase());

  for (const booter of this.booters) {
    const phaseMethod = booter[phase];
    if (!phaseMethod) {
      this.logger
        .for(this.runPhase.name)
        .debug(
          `SKIP not implemented booter | Phase: %s | Booter: %s`,
          phase,
          booter.constructor.name,
        );
      continue;
    }
    if (typeof phaseMethod !== 'function') {
      this.logger
        .for(this.runPhase.name)
        .debug(
          `SKIP not a function booter | Phase: %s | Booter: %s`,
          phase,
          booter.constructor.name,
        );
      continue;
    }

    try {
      this.logger
        .for(this.runPhase.name)
        .debug(`Running | Phase: %s | Booter: %s`, phase, booter.constructor.name);
      await phaseMethod.call(booter);
    } catch (error) {
      const errorMessage = (error as Error)?.message || String(error);

      throw getError({
        message: `[Bootstrapper][runPhase] Error during phase '${phase}' on booter '${booter.constructor.name}': ${errorMessage}`,
      });
    }
  }

  this.phaseEndTimings.set(phase, performance.now());
  const start = this.phaseStartTimings.get(phase) ?? 0;
  const end = this.phaseEndTimings.get(phase) ?? 0;
  const duration = end - start;

  this.logger
    .for(this.runPhase.name)
    .debug(`Completed phase: %s | Took: %d ms`, phase.toUpperCase(), duration);
}
```

**Key behaviors:**

1. **Phase method lookup:** For each booter, accesses `booter[phase]` (e.g., `booter['configure']`). This is a dynamic property lookup using the phase string as a key.

2. **Guard checks:** Two guards skip booters that do not implement the phase:
   - If `phaseMethod` is falsy (undefined/null), the booter is skipped with a debug log
   - If `phaseMethod` is not a function, the booter is skipped with a debug log
   - This allows custom booters to omit phases they do not need

3. **Method invocation:** Uses `phaseMethod.call(booter)` to ensure the correct `this` context when calling the method.

4. **Sequential execution:** Booters within a phase are executed sequentially (not in parallel). This guarantees ordering -- datasource bindings are available before repository loading begins.

5. **booterNames filtering:** The `opts.booterNames` parameter is accepted but not yet implemented (marked with a TODO comment). Future versions will allow running specific booters by name.

### Error Wrapping

When a phase method throws an error, the `Bootstrapper` catches it and wraps it with context:

```typescript
throw getError({
  message: `[Bootstrapper][runPhase] Error during phase '${phase}' on booter '${booter.constructor.name}': ${errorMessage}`,
});
```

Example error message:

```
[Bootstrapper][runPhase] Error during phase 'discover' on booter 'ControllerBooter': [discover] Failed to discover files using pattern: controllers/{**/*,*}.controller.js | Error: ENOENT: no such file or directory
```

This multi-layer error wrapping makes it clear:

1. Which component threw (`Bootstrapper`)
2. Which phase was running (`discover`)
3. Which booter failed (`ControllerBooter`)
4. What the original error was

### Performance Timing

The `Bootstrapper` uses two `Map<string, number>` instances to track timing:

```typescript
private phaseStartTimings: Map<string, number> = new Map();
private phaseEndTimings: Map<string, number> = new Map();
```

At the start of each phase, `performance.now()` is recorded. At the end, another timestamp is captured and the duration is logged:

```
[Bootstrapper][runPhase] Completed phase: CONFIGURE | Took: 0.42 ms
[Bootstrapper][runPhase] Completed phase: DISCOVER  | Took: 12.8 ms
[Bootstrapper][runPhase] Completed phase: LOAD      | Took: 45.3 ms
```

These timings are currently logged but not included in the `IBootReport`. The data is available in the `Bootstrapper` instance for future use.

### IBootReport Structure

```typescript
export interface IBootReport {}
```

The current `IBootReport` interface is intentionally empty. The `generateReport()` method returns `{}`:

```typescript
private generateReport(): IBootReport {
  const report: IBootReport = {};
  this.logger.for(this.generateReport.name).debug(`Boot report: %j`, report);
  return report;
}
```

This is a deliberate extension point. Future versions can add fields like:

```typescript
// Potential future shape (not yet implemented)
interface IBootReport {
  phases?: {
    configure?: { startTime: number; endTime: number; duration: number };
    discover?: { startTime: number; endTime: number; duration: number };
    load?: { startTime: number; endTime: number; duration: number };
  };
  booters?: Array<{
    name: string;
    discoveredFiles: number;
    loadedClasses: number;
  }>;
  totalDuration?: number;
}
```

---

## Advanced Usage

### Creating Custom Booters

To support a new artifact type, extend `BaseArtifactBooter` and implement the three abstract methods:

```typescript
import { BaseArtifactBooter, IApplication, IBootOptions } from '@venizia/ignis-boot';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

export class HandlerBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({
      scope: HandlerBooter.name,
      root,
      artifactOptions: bootOptions['handlers'] ?? {},
    });
  }

  protected override getDefaultDirs(): string[] {
    return ['handlers'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.handler.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'handlers', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('handlers');
    }
  }
}
```

**Register the custom booter** in your application before calling `boot()`:

```typescript
class MyApp extends BootMixin(Container) {
  bootOptions: IBootOptions = {
    controllers: { dirs: ['controllers'] },
    handlers: { dirs: ['handlers'], isNested: true },
  };

  constructor() {
    super();

    // Register custom booter with the 'booter' tag so Bootstrapper discovers it
    this.bind({ key: 'booter.HandlerBooter' })
      .toClass(HandlerBooter)
      .setTags('booter');
  }
}
```

The `'booter'` tag is critical -- the `Bootstrapper` uses `findByTag({ tag: 'booter' })` to discover all booters at runtime.

### Multiple Custom Booter Examples

#### Example 1: MiddlewareBooter -- Auto-discover Middleware

Discover and register Hono middleware files automatically:

```typescript
import { BaseArtifactBooter, IApplication, IBootOptions } from '@venizia/ignis-boot';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

export class MiddlewareBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({
      scope: MiddlewareBooter.name,
      root,
      artifactOptions: bootOptions['middlewares'] ?? {},
    });
  }

  protected override getDefaultDirs(): string[] {
    return ['middlewares'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.middleware.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'middlewares', key: cls.name });
      // Middlewares are singletons -- they are stateless functions typically
      this.application.bind({ key }).toClass(cls).setTags('middlewares').setScope('singleton');
      this.logger.for(this.bind.name).debug('Bound middleware: %s', key);
    }
  }
}
```

**Registration:**

```typescript
class MyApp extends BootMixin(Container) {
  bootOptions: IBootOptions = {
    middlewares: { dirs: ['middlewares'], isNested: false },
    controllers: { dirs: ['controllers'] },
  };

  constructor() {
    super();
    this.bind({ key: 'booter.MiddlewareBooter' }).toClass(MiddlewareBooter).setTags('booter');
  }
}
```

#### Example 2: MigrationBooter -- Auto-discover Migration Files

Discover Drizzle migration files for programmatic migration execution:

```typescript
import { BaseArtifactBooter, IApplication, IBootOptions } from '@venizia/ignis-boot';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

export class MigrationBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({
      scope: MigrationBooter.name,
      root,
      artifactOptions: bootOptions['migrations'] ?? {},
    });
  }

  protected override getDefaultDirs(): string[] {
    return ['migrations'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.migration.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'migrations', key: cls.name });
      // Migrations are transient -- each resolution creates a fresh instance
      this.application.bind({ key }).toClass(cls).setTags('migrations');
      this.logger.for(this.bind.name).debug('Bound migration: %s', key);
    }
  }
}
```

**Registration with custom extensions:**

```typescript
class MyApp extends BootMixin(Container) {
  bootOptions: IBootOptions = {
    controllers: { dirs: ['controllers'] },
    migrations: {
      dirs: ['migrations'],
      extensions: ['.migration.js'],
      isNested: false, // Migrations are usually flat
    },
  };

  constructor() {
    super();
    this.bind({ key: 'booter.MigrationBooter' }).toClass(MigrationBooter).setTags('booter');
  }
}
```

#### Example 3: CronJobBooter -- Auto-discover Scheduled Tasks

```typescript
import { BaseArtifactBooter, IApplication, IBootOptions } from '@venizia/ignis-boot';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

export class CronJobBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({
      scope: CronJobBooter.name,
      root,
      artifactOptions: bootOptions['crons'] ?? {},
    });
  }

  protected override getDefaultDirs(): string[] {
    return ['crons'];
  }

  protected override getDefaultExtensions(): string[] {
    return ['.cron.js'];
  }

  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'crons', key: cls.name });
      // Cron jobs are singletons -- they maintain internal timer state
      this.application.bind({ key }).toClass(cls).setTags('crons').setScope('singleton');
      this.logger.for(this.bind.name).debug('Bound cron job: %s', key);
    }
  }
}
```

### Custom Glob Patterns

When the default pattern generation does not fit your project structure, use the `glob` option to take full control:

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    // Scan multiple top-level directories with specific depth
    glob: '{api,admin}/**/controllers/*.controller.js',
  },
  services: {
    // Only scan a specific subdirectory
    glob: 'modules/**/services/*.service.js',
  },
};
```

When `glob` is set, `dirs`, `extensions`, and `isNested` are all ignored.

### Boot Options Override Examples

Each artifact type's options can be customized independently. Here are common override patterns:

#### Override directories only

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    dirs: ['api-controllers', 'admin-controllers'],
    // extensions and isNested use defaults
  },
};
```

Generated pattern: `{api-controllers,admin-controllers}/{**/*,*}.controller.js`

#### Override extensions only

```typescript
const bootOptions: IBootOptions = {
  services: {
    extensions: ['.service.js', '.provider.js'],
    // dirs uses default ['services'], isNested uses default true
  },
};
```

Generated pattern: `{services}/{**/*,*}.{service.js,provider.js}`

#### Disable nested scanning

```typescript
const bootOptions: IBootOptions = {
  repositories: {
    isNested: false,
    // Only discover repositories at the root level, no subdirectories
  },
};
```

Generated pattern: `repositories/*.repository.js`

#### Full override with custom glob

```typescript
const bootOptions: IBootOptions = {
  datasources: {
    glob: 'config/datasources/*.datasource.js',
    // dirs, extensions, isNested are all ignored when glob is set
  },
};
```

Generated pattern: `config/datasources/*.datasource.js`

#### Mixed overrides across artifact types

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    dirs: ['controllers'],
    isNested: true, // Deep scan for nested module controllers
  },
  services: {
    dirs: ['services', 'providers'],
    extensions: ['.service.js', '.provider.js'],
  },
  repositories: {
    isNested: false, // Flat repository directory
  },
  datasources: {
    dirs: ['datasources'],
    // Defaults are fine -- singleton scope is set by the DatasourceBooter
  },
};
```

### Selective Phase Execution

The `Bootstrapper.boot()` method accepts an `IBootExecutionOptions` object that lets you run only specific phases:

```typescript
const bootstrapper = app.get<Bootstrapper>({ key: 'bootstrapper' });

// Run only configure and discover (skip loading/binding)
const report = await bootstrapper.boot({
  phases: ['configure', 'discover'],
});

// Run all phases (default)
const fullReport = await bootstrapper.boot({});
```

This is useful for testing scenarios where you want to verify discovery results before loading, or for dry-run analysis of what would be discovered.

### Boot Report and Performance Timing

The `Bootstrapper` tracks `performance.now()` timestamps for the start and end of each phase. Phase timing is logged at debug level:

```
[Bootstrapper][runPhase] Completed phase: CONFIGURE | Took: 0.42 ms
[Bootstrapper][runPhase] Completed phase: DISCOVER  | Took: 12.8 ms
[Bootstrapper][runPhase] Completed phase: LOAD      | Took: 45.3 ms
```

The `boot()` method returns an `IBootReport` object, which can be extended in future versions to include detailed timing and discovery statistics.

---

## Integration with BaseApplication

When using `@venizia/ignis` (the core framework), `BaseApplication` does not use `BootMixin` directly. Instead, it implements the same logic with additional framework-specific behavior:

```typescript
// In BaseApplication (packages/core/src/base/applications/base.ts)

booter<Base extends IBooter, Args extends AnyObject = any>(
  ctor: TClass<Base>,
  opts?: TMixinOpts<Args>,
): Binding<Base> {
  return this.bind<Base>({
    key: BindingKeys.build(
      opts?.binding ?? { namespace: BindingNamespaces.BOOTERS, key: ctor.name },
    ),
  })
    .toClass(ctor)
    .setTags('booter');
}

async registerBooters() {
  await executeWithPerformanceMeasure({
    logger: this.logger,
    scope: this.registerDataSources.name,
    description: 'Register application data sources',
    task: async () => {
      this.bind({ key: '@app/boot-options' }).toValue(this.configs.bootOptions ?? {});
      this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper).setScope(BindingScopes.SINGLETON);

      // Define default booters
      this.booter(DatasourceBooter);
      this.booter(RepositoryBooter);
      this.booter(ServiceBooter);
      this.booter(ControllerBooter);
    },
  });
}

async boot(): Promise<IBootReport> {
  await this.registerBooters();

  const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });

  return bootstrapper.boot({});
}
```

**Key differences from BootMixin:**

1. **Namespace-aware binding keys:** `BaseApplication` uses `BindingNamespaces.BOOTERS` (which resolves to `"booters"`) as the namespace, producing keys like `booters.DatasourceBooter` instead of `booter.DatasourceBooter`. This is consistent with the core framework's namespace convention.

2. **Helper method:** The `booter()` method provides a shorthand for registering booters with the correct namespace and tag.

3. **Performance measurement:** `registerBooters()` is wrapped in `executeWithPerformanceMeasure()` which logs execution time.

4. **Deferred registration:** In `BaseApplication`, booter registration happens during the `initialize()` lifecycle, not in the constructor. This allows the application to complete its own setup before boot runs.

5. **Custom booter registration:** You can call `this.booter(MyCustomBooter)` in `preConfigure()` to register additional booters before boot runs:

```typescript
class MyApplication extends BaseApplication {
  async preConfigure() {
    // Register custom booters alongside the defaults
    this.booter(HandlerBooter);
    this.booter(CronJobBooter);
  }
}
```

**Full application lifecycle with boot:**

```
1. constructor()            --> Bind app configs, project root, etc.
2. initialize()             --> Called by start()
   2a. registerDefaultMiddlewares()
   2b. staticConfigure()
   2c. preConfigure()       --> User registers controllers/services/components
   2d. registerBooters()    --> Registers booter bindings
   2e. boot()               --> Discovers and loads all artifacts
   2f. registerDataSources() --> Configures datasources with discovered schemas
   2g. registerComponents()  --> Initializes components
   2h. registerControllers() --> Mounts controller routes to Hono
   2i. postConfigure()       --> User post-setup hooks
   2j. setupMiddlewares()    --> User middleware registration
3. start()                  --> Start HTTP server (Bun.serve or @hono/node-server)
```

---

## Error Scenarios

### No files found (empty discoveredFiles)

If a booter's glob pattern matches no files, `discoveredFiles` will be an empty array. This is **not an error**. The `load()` method handles it gracefully:

```typescript
async load(): Promise<void> {
  if (!this.discoveredFiles.length) {
    this.logger.for(this.load.name).debug(`No files discovered to load.`);
    return;
  }
  // ...
}
```

**Debug output:**

```
[ServiceBooter][discover] Root: /app/dist | Using pattern: services/{**/*,*}.service.js | Discovered file: []
[ServiceBooter][load] No files discovered to load.
```

This is common during early development when you may not yet have files for every artifact type.

### File has no class exports

If a discovered file exports only non-class values (arrow functions, constants, objects, primitives), `loadClasses()` will filter them all out. The `loadedClasses` array will be empty, and `bind()` will execute but do nothing (it iterates an empty array).

**Example file** (`non.repository.ts`):

```typescript
// LET THIS FILE BE EMPTY
```

Or a file that exports only constants:

```typescript
export const CONFIG = { host: 'localhost' };
export const helper = () => 'helper';
```

Both result in zero loaded classes -- no error, no binding.

### Glob pattern matches wrong files

If your glob pattern is too broad (e.g., `**/*.js`), you may discover files that are not artifact classes. The `isClass()` check prevents non-class exports from being bound, but unexpected classes could still be registered.

**Prevention strategies:**

- Use specific file extensions: `.controller.js`, `.service.js`
- Use dedicated directories: `controllers/`, `services/`
- Avoid overly broad custom globs
- Test discovery results using selective phase execution (see [Selective Phase Execution](#selective-phase-execution))

### No directories specified

If `configure()` runs and neither the user options nor the defaults provide `dirs`, `getPattern()` will throw:

```
Error: [getPattern] No directories specified for artifact discovery
```

This only happens if a custom booter's `getDefaultDirs()` returns an empty array AND the user does not provide `dirs`.

### No extensions specified

If `configure()` runs and neither the user options nor the defaults provide `extensions`, `getPattern()` will throw:

```
Error: [ControllerBooter][getPattern] No file extensions specified for artifact discovery
```

This only happens if a custom booter's `getDefaultExtensions()` returns an empty array AND the user does not provide `extensions`.

### Phase execution fails

If any booter's phase method throws, the `Bootstrapper` catches the error, wraps it with context, and re-throws. This stops the entire boot process:

```
Error: [Bootstrapper][runPhase] Error during phase 'load' on booter 'RepositoryBooter': [load] Failed to load classes from discovered files | Error: Cannot find module '/app/dist/repositories/broken.repository.js'
```

The boot process does NOT continue to the next booter or the next phase after an error. If `RepositoryBooter` fails during LOAD, `ServiceBooter` and `ControllerBooter` will not execute their LOAD phases.

### File import fails

If a discovered file cannot be imported (syntax error, missing dependency, runtime error during module evaluation), `loadClasses()` throws:

```
Error: Failed to load file: /app/dist/controllers/broken.controller.js | Error: SyntaxError: Unexpected token
```

This error is then wrapped by `BaseArtifactBooter.load()` and then again by `Bootstrapper.runPhase()`.

---

## Debugging Boot

### Enable debug logging

The boot system uses `BaseHelper`'s logger (Winston-based) with `debug` level. To see all boot debug output, set the `DEBUG` environment variable or configure the logger level:

```bash
# Enable debug logging
DEBUG=* bun run server:dev

# Or set logger level in your app configuration
APP_ENV_LOGGER_FORMAT=text
```

### Debug output reference

With debug logging enabled, a typical boot produces this output:

```
[Bootstrapper][discoverBooters] Discovered booter: booter.DatasourceBooter
[Bootstrapper][discoverBooters] Discovered booter: booter.RepositoryBooter
[Bootstrapper][discoverBooters] Discovered booter: booter.ServiceBooter
[Bootstrapper][discoverBooters] Discovered booter: booter.ControllerBooter
[Bootstrapper][boot] Starting boot | Number of booters: 4
[Bootstrapper][runPhase] Starting phase: CONFIGURE
[Bootstrapper][runPhase] Running | Phase: configure | Booter: DatasourceBooter
[DatasourceBooter][configure] Configured: {"dirs":["datasources"],"extensions":[".datasource.js"],"isNested":true}
[Bootstrapper][runPhase] Running | Phase: configure | Booter: RepositoryBooter
[RepositoryBooter][configure] Configured: {"dirs":["repositories"],"extensions":[".repository.js"],"isNested":true}
[Bootstrapper][runPhase] Running | Phase: configure | Booter: ServiceBooter
[ServiceBooter][configure] Configured: {"dirs":["services"],"extensions":[".service.js"],"isNested":true}
[Bootstrapper][runPhase] Running | Phase: configure | Booter: ControllerBooter
[ControllerBooter][configure] Configured: {"dirs":["controllers"],"extensions":[".controller.js"],"isNested":true}
[Bootstrapper][runPhase] Completed phase: CONFIGURE | Took: 0.42 ms
[Bootstrapper][runPhase] Starting phase: DISCOVER
[Bootstrapper][runPhase] Running | Phase: discover | Booter: DatasourceBooter
[DatasourceBooter][discover] Root: /app/dist | Using pattern: datasources/{**/*,*}.datasource.js | Discovered file: [...]
[Bootstrapper][runPhase] Running | Phase: discover | Booter: RepositoryBooter
[RepositoryBooter][discover] Root: /app/dist | Using pattern: repositories/{**/*,*}.repository.js | Discovered file: [...]
...
[Bootstrapper][runPhase] Completed phase: DISCOVER | Took: 12.8 ms
[Bootstrapper][runPhase] Starting phase: LOAD
...
[DatasourceBooter][bind] Bound key: datasources.PostgresDataSource
[RepositoryBooter][bind] Bound key: repositories.UserRepository
...
[Bootstrapper][runPhase] Completed phase: LOAD | Took: 45.3 ms
[Bootstrapper][generateReport] Boot report: {}
```

### Inspect boot internals programmatically

You can access the `Bootstrapper` directly to inspect state:

```typescript
const bootstrapper = app.get<Bootstrapper>({ key: 'bootstrapper' });

// Run only configure + discover phases
await bootstrapper.boot({ phases: ['configure', 'discover'] });

// Now inspect what was discovered before loading
// (requires access to the booter instances via the container)
const controllerBooter = app.get<ControllerBooter>({ key: 'booter.ControllerBooter' });
console.log('Discovered controller files:', controllerBooter['discoveredFiles']);
```

### Check discovered files and loaded classes

Using bracket notation (since properties are `protected`), you can inspect the internal state of any booter:

```typescript
const repoBooter = app.get<RepositoryBooter>({ key: 'booter.RepositoryBooter' });

// After boot
console.log('Options:', repoBooter['artifactOptions']);
console.log('Discovered:', repoBooter['discoveredFiles']);
console.log('Loaded:', repoBooter['loadedClasses'].map(cls => cls.name));
```

### Verify container bindings after boot

```typescript
// Check all registered controllers
const controllerBindings = app.findByTag({ tag: 'controllers' });
for (const binding of controllerBindings) {
  console.log('Controller:', binding.key);
}

// Check all registered datasources
const datasourceBindings = app.findByTag({ tag: 'datasources' });
for (const binding of datasourceBindings) {
  console.log('Datasource:', binding.key, '| Scope:', binding.scope);
}
```

---

## Performance Tuning

### Limiting glob scope

For large codebases with many files, overly broad glob patterns can slow down the DISCOVER phase. Here are strategies to optimize:

**1. Disable nested scanning when not needed:**

```typescript
repositories: {
  isNested: false, // Only scan the top-level directory
}
```

This changes the pattern from `repositories/{**/*,*}.repository.js` to `repositories/*.repository.js`, which is significantly faster for directories with deep structures.

**2. Use specific directory lists instead of nested scanning:**

```typescript
controllers: {
  dirs: ['controllers/api', 'controllers/admin'],
  isNested: false,
  // Targets specific subdirectories without recursive scanning
}
```

**3. Use custom glob patterns for surgical targeting:**

```typescript
controllers: {
  glob: 'controllers/*.controller.js',
  // Most precise -- only top-level controller files
}
```

### Reducing import overhead

The LOAD phase's cost comes from `await import(file)` calls. Each file import triggers module evaluation, which may cascade to importing dependencies. To reduce this:

**1. Keep artifact files lean.** Controller/service/repository files should export a single class. Avoid heavy initialization in module scope.

**2. Use barrel files carefully.** If a repository file re-exports from a model file that re-exports from a schema file, the import chain is longer. Keep imports direct.

**3. Avoid side effects in module scope.** Database connections, API calls, or file I/O in module-level code will run during `import()` and slow boot.

### Monitoring boot performance

Use the debug log output to identify slow phases:

```
[Bootstrapper][runPhase] Completed phase: CONFIGURE | Took: 0.42 ms    -- Fast
[Bootstrapper][runPhase] Completed phase: DISCOVER  | Took: 12.8 ms    -- Normal
[Bootstrapper][runPhase] Completed phase: LOAD      | Took: 245.3 ms   -- Potentially slow
```

If DISCOVER is slow, your glob patterns may be too broad. If LOAD is slow, your imported files may have heavy module-level initialization.

---

## File Naming Conventions

### Why `.controller.js` instead of `.controller.ts`?

The boot system discovers files in the **built output directory** (e.g., `dist/cjs/` or `dist/esm/`), not in the source directory. TypeScript source files (`.ts`) are compiled to JavaScript (`.js`) by `tsc` before the application runs. Therefore:

- **Source files:** `src/controllers/user.controller.ts`
- **Built files:** `dist/cjs/controllers/user.controller.js`
- **Boot discovers:** `dist/cjs/controllers/user.controller.js`

The default extensions use `.js` because that is what exists at runtime. If you are running TypeScript directly (e.g., via `bun run` which supports direct `.ts` execution), you would need to override the extensions:

```typescript
controllers: {
  extensions: ['.controller.ts'],
}
```

However, the standard IGNIS workflow uses compiled output, so `.js` is the correct default.

### Naming convention for artifact files

The convention follows the pattern: `{name}.{artifact-type}.{extension}`

| Artifact Type | Convention               | Example                    |
| ------------- | ------------------------ | -------------------------- |
| Controller    | `{name}.controller.ts`   | `user.controller.ts`       |
| Service       | `{name}.service.ts`      | `auth.service.ts`          |
| Repository    | `{name}.repository.ts`   | `user.repository.ts`       |
| DataSource    | `{name}.datasource.ts`   | `postgres.datasource.ts`   |

These conventions are not enforced by the framework -- they are what the default extensions expect. You can use any naming scheme by overriding `extensions` or `glob` in your boot options.

### Directory conventions

The default directory names match the artifact types:

| Artifact Type | Default Directory |
| ------------- | ----------------- |
| Controllers   | `controllers/`    |
| Services      | `services/`       |
| Repositories  | `repositories/`   |
| DataSources   | `datasources/`    |

These are relative to the project root (the `@app/project_root` binding). In a typical IGNIS application built with `tsc`, the project root is the `dist/cjs/` directory.

---

## Boot Utilities

The `@venizia/ignis-boot` package exports three utility functions used internally by the boot system. These are also available for direct use:

### `discoverFiles`

Discover files matching a glob pattern relative to a root directory. Returns absolute file paths.

```typescript
import { discoverFiles } from '@venizia/ignis-boot';

const files = await discoverFiles({
  root: '/path/to/project/dist',
  pattern: 'controllers/{**/*,*}.controller.js',
});
// => ['/path/to/project/dist/controllers/user.controller.js', ...]
```

**Full signature:**

```typescript
const discoverFiles: (opts: {
  pattern: string;
  root: string;
}) => Promise<string[]>;
```

Internally uses the `glob` npm package with `{ cwd: root, absolute: true }` options. Throws a wrapped error if the glob operation fails.

### `loadClasses`

Dynamically import an array of files and extract all class constructor exports. Non-class exports (arrow functions, objects, primitives) are filtered out.

```typescript
import { loadClasses } from '@venizia/ignis-boot';

const classes = await loadClasses({
  files: ['/abs/path/to/user.controller.js', '/abs/path/to/auth.controller.js'],
  root: '/abs/path/to',
});
// => [class UserController, class AuthController]
```

**Full signature:**

```typescript
const loadClasses: (opts: {
  files: string[];
  root: string;
}) => Promise<AnyType[]>;
```

For each file, calls `await import(file)` and iterates all named exports. Uses `isClass()` to filter. If any file import fails, throws a wrapped error with the file path.

### `isClass`

Type guard that checks whether a value is a class constructor (a function with a `prototype` property). Used internally by `loadClasses` to filter exports.

```typescript
import { isClass } from '@venizia/ignis-boot';

class MyService {}
const arrowFn = () => {};
function RegularFunction() {}
abstract class AbstractClass {}

isClass(MyService);        // true
isClass(RegularFunction);  // true  (has prototype)
isClass(AbstractClass);    // true
isClass(arrowFn);          // false (arrow functions have no prototype)
isClass('string');         // false
isClass(42);               // false
isClass(null);             // false
isClass(undefined);        // false
isClass({});               // false
```

**Full signature:**

```typescript
const isClass: <T>(target: AnyType) => target is TClass<T>;
```

**Implementation:**

```typescript
export const isClass = <T>(target: AnyType): target is TClass<T> => {
  return typeof target === 'function' && target.prototype !== undefined;
};
```

Note: Regular function declarations and function expressions return `true` because they have a `prototype` property. Only arrow functions return `false`. This is intentional -- traditional function constructors are valid class-like constructs in JavaScript.

---

## Complete Type Reference

All types are exported from `@venizia/ignis-boot`:

```typescript
// =============================================================================
// Artifact Configuration
// =============================================================================

/**
 * Configuration for a single artifact type's discovery behavior.
 */
interface IArtifactOptions {
  /** Directories to scan, relative to project root */
  dirs?: string[];
  /** File extensions to match (e.g., '.controller.js') */
  extensions?: string[];
  /** Recurse into subdirectories. Default: true */
  isNested?: boolean;
  /** Custom glob pattern. If set, dirs and extensions are ignored */
  glob?: string;
}

/**
 * Top-level boot options mapping artifact type names to their discovery config.
 * Includes four built-in keys and supports arbitrary extension via index signature.
 */
interface IBootOptions {
  controllers?: IArtifactOptions;
  services?: IArtifactOptions;
  repositories?: IArtifactOptions;
  datasources?: IArtifactOptions;
  /** Extensible for custom booters */
  [artifactType: string]: IArtifactOptions | undefined;
}

// =============================================================================
// Boot Phases
// =============================================================================

/**
 * The three boot phases, derived as const string values from BootPhases class.
 */
type TBootPhase = 'configure' | 'discover' | 'load';

/**
 * Ordered array of all boot phases.
 * Used as the default value when no specific phases are requested.
 */
const BOOT_PHASES: TBootPhase[] = ['configure', 'discover', 'load'];

// =============================================================================
// Booter Interfaces
// =============================================================================

/**
 * Interface that all booters must implement.
 * Each method corresponds to one boot phase.
 */
interface IBooter {
  configure(): ValueOrPromise<void>;
  discover(): ValueOrPromise<void>;
  load(): ValueOrPromise<void>;
}

/**
 * Constructor options for BaseArtifactBooter.
 */
interface IBooterOptions {
  /** Logger scope name (typically the booter class name) */
  scope: string;
  /** Absolute path to project root directory */
  root: string;
  /** User-provided artifact discovery options */
  artifactOptions: IArtifactOptions;
}

// =============================================================================
// Bootstrapper
// =============================================================================

/**
 * Options for controlling which phases and booters to execute.
 */
interface IBootExecutionOptions {
  /** Phases to execute. Default: ['configure', 'discover', 'load'] */
  phases?: TBootPhase[];
  /** Specific booters to run by name. Default: all discovered booters */
  booters?: string[];
}

/**
 * Interface for the Bootstrapper orchestrator.
 */
interface IBootstrapper {
  boot(opts: IBootExecutionOptions): Promise<IBootReport>;
}

/**
 * Boot execution report. Currently empty; designed as an extension point
 * for future timing and statistics data.
 */
interface IBootReport {}

// =============================================================================
// Application
// =============================================================================

/**
 * Minimal application interface required by the boot system.
 * Extends Container with a method to get the project root path.
 */
interface IApplication extends Container {
  getProjectRoot(): string;
}

/**
 * Interface for applications that support the boot() method.
 * Implemented by BootMixin and BaseApplication.
 */
interface IBootableApplication {
  boot(): Promise<IBootReport>;
}
```

### Exported Classes

```typescript
/**
 * Abstract base class for all artifact booters.
 * Implements the Template Method pattern for three-phase boot lifecycle.
 *
 * Protected properties:
 *   root: string               -- Project root path
 *   artifactOptions: IArtifactOptions  -- Merged discovery config
 *   discoveredFiles: string[]  -- Files found during discover phase
 *   loadedClasses: TClass[]    -- Classes extracted during load phase
 *
 * Abstract methods (must be implemented by subclasses):
 *   getDefaultDirs(): string[]
 *   getDefaultExtensions(): string[]
 *   bind(): Promise<void>
 */
abstract class BaseArtifactBooter extends BaseHelper implements IBooter { }

/**
 * Orchestrates the boot process across all discovered booters.
 *
 * Private properties:
 *   booters: IBooter[]
 *   phaseStartTimings: Map<string, number>
 *   phaseEndTimings: Map<string, number>
 *
 * Constructor injection:
 *   @inject({ key: '@app/instance' }) application: IApplication
 */
class Bootstrapper extends BaseHelper implements IBootstrapper { }

/**
 * Built-in booter for controller artifacts.
 * Default dir: 'controllers', extension: '.controller.js', scope: transient
 */
class ControllerBooter extends BaseArtifactBooter { }

/**
 * Built-in booter for service artifacts.
 * Default dir: 'services', extension: '.service.js', scope: transient
 */
class ServiceBooter extends BaseArtifactBooter { }

/**
 * Built-in booter for repository artifacts.
 * Default dir: 'repositories', extension: '.repository.js', scope: transient
 */
class RepositoryBooter extends BaseArtifactBooter { }

/**
 * Built-in booter for datasource artifacts.
 * Default dir: 'datasources', extension: '.datasource.js', scope: SINGLETON
 */
class DatasourceBooter extends BaseArtifactBooter { }
```

### Exported Functions

```typescript
/**
 * Mixin that enhances a Container subclass with boot capabilities.
 * Registers all built-in booters and the Bootstrapper in the constructor.
 * Adds bootOptions property and boot() method to the class.
 */
const BootMixin: <T extends TMixinTarget<Container>>(baseClass: T) => T & IBootableApplication;

/**
 * Discover files matching a glob pattern relative to a root directory.
 * Returns absolute file paths. Uses the 'glob' npm package internally.
 */
const discoverFiles: (opts: { pattern: string; root: string }) => Promise<string[]>;

/**
 * Dynamically import files and extract class constructor exports.
 * Non-class exports are filtered out using isClass().
 */
const loadClasses: (opts: { files: string[]; root: string }) => Promise<AnyType[]>;

/**
 * Type guard: checks if a value is a class constructor
 * (a function with a prototype property).
 */
const isClass: <T>(target: AnyType) => target is TClass<T>;
```

---

## Constants Reference

```typescript
/**
 * Static class providing boot phase name constants.
 * Values match the TBootPhase union type.
 */
class BootPhases {
  static readonly CONFIGURE = 'configure';
  static readonly DISCOVER = 'discover';
  static readonly LOAD = 'load';
}

/**
 * Ordered array of all boot phases.
 * Used as the default when Bootstrapper.boot() is called without specific phases.
 */
const BOOT_PHASES: TBootPhase[] = ['configure', 'discover', 'load'];
```

### DI Binding Keys Used by the Boot System

| Key                         | Bound By                    | Type                    | Description                                      |
| --------------------------- | --------------------------- | ----------------------- | ------------------------------------------------ |
| `@app/project_root`        | Application                 | `string`                | Absolute path to project's build output root     |
| `@app/instance`            | Application                 | `IApplication`          | The application container itself                 |
| `@app/boot-options`        | BootMixin / BaseApplication | `IBootOptions`          | User's boot configuration                        |
| `booter.DatasourceBooter`  | BootMixin                   | `DatasourceBooter` class | Tagged `'booter'`                                |
| `booter.RepositoryBooter`  | BootMixin                   | `RepositoryBooter` class | Tagged `'booter'`                                |
| `booter.ServiceBooter`     | BootMixin                   | `ServiceBooter` class   | Tagged `'booter'`                                |
| `booter.ControllerBooter`  | BootMixin                   | `ControllerBooter` class | Tagged `'booter'`                                |
| `bootstrapper`             | BootMixin / BaseApplication | `Bootstrapper` class    | Singleton scope                                  |

Note: When used with `BaseApplication`, the booter keys follow the pattern `booters.{ClassName}` (using the `BindingNamespaces.BOOTERS` namespace) instead of `booter.{ClassName}`.

---

## Testing Patterns

The boot package tests run on **built** output (`dist/cjs/`) since the boot system discovers compiled `.js` files, not `.ts` source files.

### Test fixture structure

```
src/__tests__/fixtures/
  repositories/
    model1.repository.ts          (exports Model1Repository class)
    model2.repository.ts          (exports Model2Repository class)
    sub-repositories/
      model3.repository.ts        (exports Model3Repository class)
  non-repositories/
    non.repository.ts             (empty file -- no class exports)
```

The `non-repositories/` directory contains a file with no class exports, used to verify that `loadClasses()` correctly filters non-class modules and returns an empty array.

### Testing a custom booter

Create a concrete test booter by extending `BaseArtifactBooter`:

```typescript
import { BaseArtifactBooter } from '@venizia/ignis-boot';
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';

class TestBooter extends BaseArtifactBooter {
  protected override getDefaultDirs(): string[] {
    return ['repositories'];
  }
  protected override getDefaultExtensions(): string[] {
    return ['.repository.js'];
  }
  protected override bind(): Promise<void> {
    return Promise.resolve();
  }
}

describe('TestBooter', () => {
  let booter: TestBooter;
  const root = path.resolve(process.cwd(), 'dist/cjs/__tests__/fixtures');

  beforeAll(() => {
    booter = new TestBooter({ root, artifactOptions: {}, scope: TestBooter.name });
  });

  test('should use default options after configure', async () => {
    await booter.configure();
    expect(booter['artifactOptions'].dirs).toEqual(['repositories']);
    expect(booter['artifactOptions'].extensions).toEqual(['.repository.js']);
    expect(booter['artifactOptions'].isNested).toEqual(true);
  });

  test('should discover files after discover', async () => {
    await booter.configure();
    await booter.discover();
    expect(booter['discoveredFiles'].length).toBeGreaterThan(0);
  });

  test('should load classes after load', async () => {
    await booter.configure();
    await booter.discover();
    await booter.load();
    expect(booter['loadedClasses'].length).toBeGreaterThan(0);
  });
});
```

### Testing pattern generation

```typescript
test('should generate pattern with defaults', async () => {
  await booter.configure();
  const pattern = booter['getPattern']();
  expect(pattern).toBe('repositories/{**/*,*}.repository.js');
});

test('should generate pattern with multiple dirs and extensions', async () => {
  const multiBooter = new TestBooter({
    scope: TestBooter.name,
    root,
    artifactOptions: {
      dirs: ['dir1', 'dir2'],
      extensions: ['.ext1.js', '.ext2.js'],
    },
  });
  await multiBooter.configure();
  const pattern = multiBooter['getPattern']();
  expect(pattern).toBe('{dir1,dir2}/{**/*,*}.{ext1.js,ext2.js}');
});

test('should use custom glob if provided', async () => {
  const globBooter = new TestBooter({
    scope: TestBooter.name,
    root,
    artifactOptions: {
      glob: 'custom/glob/pattern/**/*.js',
    },
  });
  await globBooter.configure();
  const pattern = globBooter['getPattern']();
  expect(pattern).toBe('custom/glob/pattern/**/*.js');
});
```

### Testing utility functions

```typescript
import { discoverFiles, isClass, loadClasses } from '@venizia/ignis-boot';

describe('isClass', () => {
  test('should return true for class constructors', () => {
    class TestClass {}
    abstract class AbstractClass {}
    function FunctionClass() {}

    expect(isClass(TestClass)).toBe(true);
    expect(isClass(AbstractClass)).toBe(true);
    expect(isClass(FunctionClass)).toBe(true);
  });

  test('should return false for non-class types', () => {
    const ArrowFunction = () => {};
    expect(isClass(ArrowFunction)).toBe(false);
    expect(isClass({})).toBe(false);
    expect(isClass('string')).toBe(false);
    expect(isClass(null)).toBe(false);
    expect(isClass(undefined)).toBe(false);
  });
});

describe('discoverFiles', () => {
  test('should return files matching the glob pattern', async () => {
    const files = await discoverFiles({
      pattern: '**/*.repository.js',
      root: '/path/to/dist/__tests__/fixtures',
    });
    expect(files.length).toBeGreaterThan(0);
  });

  test('should return empty array for no matches', async () => {
    const files = await discoverFiles({
      pattern: '**/*.nonexistent',
      root: process.cwd(),
    });
    expect(files).toEqual([]);
  });
});

describe('loadClasses', () => {
  test('should load classes from files', async () => {
    const files = await discoverFiles({
      pattern: 'repositories/*.repository.js',
      root: '/path/to/dist/__tests__/fixtures',
    });
    const classes = await loadClasses({ files, root: '/path/to/dist/__tests__/fixtures' });
    expect(classes.length).toBeGreaterThan(0);
  });

  test('should return empty array when no classes exported', async () => {
    const files = await discoverFiles({
      pattern: 'non-repositories/*.repository.js',
      root: '/path/to/dist/__tests__/fixtures',
    });
    const classes = await loadClasses({ files, root: '/path/to/dist/__tests__/fixtures' });
    expect(classes).toEqual([]);
  });
});
```

**Key testing conventions:**

- Use bracket notation to access protected members: `booter['artifactOptions']`, `booter['discoveredFiles']`
- Test each phase independently and sequentially (configure before discover, discover before load)
- Use fixture directories with simple class exports for predictable discovery results
- Non-class fixtures (empty files, constant exports) verify that filtering works correctly
- Tests use `dist/cjs/__tests__/fixtures/` (built output) as the root, not the `src/` directory
- The `pretest` script (`bun run rebuild`) ensures fixtures are compiled before tests run

---

## License

MIT
