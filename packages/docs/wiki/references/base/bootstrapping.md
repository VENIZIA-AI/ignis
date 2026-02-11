---
title: Bootstrapping Reference
description: Technical reference for application bootstrapping and initialization
difficulty: advanced
---

# Bootstrapping API Reference

> **API Reference**: Classes, interfaces, and utilities for application bootstrapping

## Table of Contents

- [Interfaces](#interfaces)
- [Classes](#classes)
- [Types](#types)
- [Utilities](#utilities)

## Prerequisites

Before reading this document, you should understand:

- [IGNIS Application](./application.md) - Application lifecycle and initialization
- [Dependency Injection](./dependency-injection.md) - DI container and bindings
- [Controllers](./controllers.md), [Services](./services.md), and [Repositories](./repositories/) - Core abstractions
- Convention-based programming patterns

## Interfaces

### IBootableApplication

Interface that applications must implement to support bootstrapping.

```typescript
interface IBootableApplication {
  bootOptions?: IBootOptions;
  boot(): Promise<IBootReport>;
}
```

| Member | Type | Description |
|--------|------|-------------|
| `bootOptions` | `IBootOptions \| undefined` | Configuration for artifact discovery |
| `boot()` | `() => Promise<IBootReport>` | Execute boot process |

**Example:**

```typescript
export class Application extends BaseApplication implements IBootableApplication {
  bootOptions = {
    controllers: { dirs: ['controllers'] }
  };
  
  async boot() {
    const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
    return bootstrapper.boot({});
  }
}
```


### IBootOptions

Configuration for artifact discovery per artifact type.

```typescript
interface IBootOptions {
  controllers?: IArtifactOptions;
  services?: IArtifactOptions;
  repositories?: IArtifactOptions;
  datasources?: IArtifactOptions;
  [artifactType: string]: IArtifactOptions | undefined;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `controllers` | `IArtifactOptions \| undefined` | Controller discovery config |
| `services` | `IArtifactOptions \| undefined` | Service discovery config |
| `repositories` | `IArtifactOptions \| undefined` | Repository discovery config |
| `datasources` | `IArtifactOptions \| undefined` | Datasource discovery config |
| `[key]` | `IArtifactOptions \| undefined` | Custom artifact type config |

**Example:**

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    dirs: ['controllers/private', 'controllers/public'],
    extensions: ['.controller.js'],
    isNested: true
  },
  services: {
    glob: 'features/**/*.service.js'
  },
  // Custom artifact type
  middlewares: {
    dirs: ['middlewares'],
    extensions: ['.middleware.js']
  }
};
```


### IArtifactOptions

Configuration for discovering a specific artifact type.

```typescript
interface IArtifactOptions {
  dirs?: string[];
  extensions?: string[];
  isNested?: boolean;
  glob?: string;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `dirs` | `string[]` | `undefined` | Directories to scan (relative to project root) |
| `extensions` | `string[]` | `undefined` | File extensions to match (e.g., `['.controller.js']`) |
| `isNested` | `boolean` | `true` | Scan subdirectories recursively |
| `glob` | `string` | `undefined` | Custom glob pattern (overrides dirs/extensions) |

**Example:**

```typescript
const artifactOptions: IArtifactOptions = {
  dirs: ['controllers/v1', 'controllers/v2'],
  extensions: ['.controller.js', '.controller.ts'],
  isNested: true
};

// Or with custom glob
const customOptions: IArtifactOptions = {
  glob: 'src/**/api/*.controller.{js,ts}'
};
```


### IBooter

Interface that all booters must implement.

```typescript
interface IBooter {
  configure?(): Promise<void> | void;
  discover?(): Promise<void> | void;
  load?(): Promise<void> | void;
}
```

| Method | Phase | Description |
|--------|-------|-------------|
| `configure()` | Configure | Setup discovery patterns and options |
| `discover()` | Discover | Scan filesystem for matching artifacts |
| `load()` | Load | Load classes and bind to container |

**Example:**

```typescript
export class CustomBooter implements IBooter {
  async configure() {
    // Setup patterns
  }
  
  async discover() {
    // Scan filesystem
  }
  
  async load() {
    // Load and bind classes
  }
}
```


### IBooterOptions

Constructor options for booters.

```typescript
interface IBooterOptions {
  scope: string;
  root: string;
  artifactOptions: IArtifactOptions;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `scope` | `string` | Logger scope (usually class name) |
| `root` | `string` | Project root directory path |
| `artifactOptions` | `IArtifactOptions` | Artifact discovery configuration |

**Example:**

```typescript
const options: IBooterOptions = {
  scope: 'ControllerBooter',
  root: '/path/to/project',
  artifactOptions: {
    dirs: ['controllers'],
    extensions: ['.controller.js']
  }
};
```


### IBootExecutionOptions

Options for controlling boot execution.

```typescript
interface IBootExecutionOptions {
  phases?: TBootPhase[];
  booters?: string[];
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `phases` | `TBootPhase[]` | `['configure', 'discover', 'load']` | Boot phases to execute |
| `booters` | `string[]` | `undefined` | Specific booters to run (by name) |

**Example:**

```typescript
// Run only discover phase
await bootstrapper.boot({
  phases: ['discover']
});

// Run only specific booters
await bootstrapper.boot({
  booters: ['ControllerBooter', 'ServiceBooter']
});

// Combine both
await bootstrapper.boot({
  phases: ['configure', 'discover'],
  booters: ['ControllerBooter']
});
```


### IBootstrapper

Interface for the bootstrapper orchestrator.

```typescript
interface IBootstrapper {
  boot(opts: IBootExecutionOptions): Promise<IBootReport>;
}
```

| Method | Return | Description |
|--------|--------|-------------|
| `boot(opts)` | `Promise<IBootReport>` | Execute boot process with options |


### IBootReport

Report generated after boot completion.

```typescript
interface IBootReport {}
```

Currently an empty interface, reserved for future enhancements (timing, errors, artifact counts, etc.).


### IApplication

Extended Container interface with application-specific methods.

```typescript
interface IApplication extends Container {
  getProjectRoot(): string;
}
```

| Method | Return | Description |
|--------|--------|-------------|
| `getProjectRoot()` | `string` | Get absolute path to project root |


## Classes

### Bootstrapper

Orchestrates the boot process by discovering and executing booters.

```typescript
export class Bootstrapper extends BaseHelper implements IBootstrapper
```

#### Constructor

```typescript
constructor(
  @inject({ key: '@app/instance' }) application: IApplication
)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `application` | `IApplication` | Application instance (injected) |

#### Methods

##### boot()

Execute the boot process.

```typescript
async boot(opts: IBootExecutionOptions): Promise<IBootReport>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts` | `IBootExecutionOptions` | Boot execution options |

**Returns:** `Promise<IBootReport>` - Boot completion report

**Example:**

```typescript
const bootstrapper = app.get<Bootstrapper>({ key: 'bootstrapper' });

// Full boot
await bootstrapper.boot({});

// Partial boot
await bootstrapper.boot({
  phases: ['discover'],
  booters: ['ControllerBooter']
});
```

##### discoverBooters() [private]

Discovers all booters registered in the application container.

```typescript
private async discoverBooters(): Promise<void>
```

Finds all bindings tagged with `'booter'` and instantiates them.

##### runPhase() [private]

Executes a specific boot phase on all booters.

```typescript
private async runPhase(opts: { phase: TBootPhase; booterNames?: string[] }): Promise<void>
```

##### generateReport() [private]

Generates boot completion report.

```typescript
private generateReport(): IBootReport
```


### BaseArtifactBooter

Abstract base class for creating artifact booters.

```typescript
export abstract class BaseArtifactBooter extends BaseHelper implements IBooter
```

#### Constructor

```typescript
constructor(opts: IBooterOptions)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts` | `IBooterOptions` | Booter configuration |

#### Abstract Methods

##### getDefaultDirs()

Return default directories to scan.

```typescript
protected abstract getDefaultDirs(): string[]
```

**Example:**

```typescript
protected getDefaultDirs(): string[] {
  return ['controllers'];
}
```

##### getDefaultExtensions()

Return default file extensions to match.

```typescript
protected abstract getDefaultExtensions(): string[]
```

**Example:**

```typescript
protected getDefaultExtensions(): string[] {
  return ['.controller.js'];
}
```

##### bind()

Bind loaded classes to application container.

```typescript
protected abstract bind(): Promise<void>
```

**Example:**

```typescript
protected async bind(): Promise<void> {
  for (const cls of this.loadedClasses) {
    this.application.bind({ key: `controllers.${cls.name}` }).toClass(cls);
  }
}
```

#### Implemented Methods

##### configure()

Configure discovery patterns using defaults or provided options.

```typescript
async configure(): Promise<void>
```

##### discover()

Scan filesystem for artifacts matching the pattern.

```typescript
async discover(): Promise<void>
```

##### load()

Load discovered classes and bind them to container.

```typescript
async load(): Promise<void>
```

##### getPattern()

Generate glob pattern from artifact options.

```typescript
protected getPattern(): string
```

**Returns:** Glob pattern string (e.g., `{dir1,dir2}/**/*.{ext1,ext2}`)

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `root` | `string` | Project root directory |
| `artifactOptions` | `IArtifactOptions` | Artifact discovery config |
| `discoveredFiles` | `string[]` | Array of discovered file paths |
| `loadedClasses` | `TClass<any>[]` | Array of loaded class constructors |


### ControllerBooter

Built-in booter for discovering controllers.

```typescript
export class ControllerBooter extends BaseArtifactBooter
```

#### Constructor

```typescript
constructor(
  @inject({ key: '@app/project_root' }) root: string,
  @inject({ key: '@app/instance' }) application: IApplication,
  @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions
)
```

#### Defaults

| Setting | Value |
|---------|-------|
| Directories | `['controllers']` |
| Extensions | `['.controller.js']` |
| Binding Key | `controllers.{ClassName}` |


### ServiceBooter

Built-in booter for discovering services.

```typescript
export class ServiceBooter extends BaseArtifactBooter
```

#### Constructor

```typescript
constructor(
  @inject({ key: '@app/project_root' }) root: string,
  @inject({ key: '@app/instance' }) application: IApplication,
  @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions
)
```

#### Defaults

| Setting | Value |
|---------|-------|
| Directories | `['services']` |
| Extensions | `['.service.js']` |
| Binding Key | `services.{ClassName}` |


### RepositoryBooter

Built-in booter for discovering repositories.

```typescript
export class RepositoryBooter extends BaseArtifactBooter
```

#### Constructor

```typescript
constructor(
  @inject({ key: '@app/project_root' }) root: string,
  @inject({ key: '@app/instance' }) application: IApplication,
  @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions
)
```

#### Defaults

| Setting | Value |
|---------|-------|
| Directories | `['repositories']` |
| Extensions | `['.repository.js']` |
| Binding Key | `repositories.{ClassName}` |


### DatasourceBooter

Built-in booter for discovering datasources.

```typescript
export class DatasourceBooter extends BaseArtifactBooter
```

#### Constructor

```typescript
constructor(
  @inject({ key: '@app/project_root' }) root: string,
  @inject({ key: '@app/instance' }) application: IApplication,
  @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions
)
```

#### Defaults

| Setting | Value |
|---------|-------|
| Directories | `['datasources']` |
| Extensions | `['.datasource.js']` |
| Binding Key | `datasources.{ClassName}` |


## Types

### TBootPhase

Boot execution phases.

```typescript
type TBootPhase = 'configure' | 'discover' | 'load'
```

**Values:**
- `'configure'` - Setup phase
- `'discover'` - File discovery phase
- `'load'` - Class loading and binding phase

### TClass

Generic class constructor type.

```typescript
type TClass<T> = TConstructor<T> & { [property: string]: any }
```

### TConstructor

Constructor function type.

```typescript
type TConstructor<T> = new (...args: any[]) => T
```

### TAbstractConstructor

Abstract constructor type.

```typescript
type TAbstractConstructor<T> = abstract new (...args: any[]) => T
```


## Utilities

### discoverFiles()

Discover files matching a glob pattern.

```typescript
async function discoverFiles(opts: {
  pattern: string;
  root: string;
}): Promise<string[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string` | Glob pattern to match |
| `root` | `string` | Root directory for search |

**Returns:** `Promise<string[]>` - Array of absolute file paths

**Example:**

```typescript
const files = await discoverFiles({
  pattern: 'controllers/**/*.controller.js',
  root: '/path/to/project'
});
// ['/path/to/project/controllers/user.controller.js', ...]
```


### loadClasses()

Load class constructors from files.

```typescript
async function loadClasses(opts: {
  files: string[];
  root: string;
}): Promise<TClass<any>[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `files` | `string[]` | Array of file paths to load |
| `root` | `string` | Project root (for error messages) |

**Returns:** `Promise<TClass<any>[]>` - Array of loaded class constructors

**Example:**

```typescript
const classes = await loadClasses({
  files: [
    '/path/to/project/controllers/user.controller.js',
    '/path/to/project/controllers/product.controller.js'
  ],
  root: '/path/to/project'
});
// [UserController, ProductController]
```


### isClass()

Type guard to check if value is a class constructor.

```typescript
function isClass<T>(target: any): target is TClass<T>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` | `any` | Value to check |

**Returns:** `boolean` - True if target is a class constructor

**Example:**

```typescript
const module = await import('./user.controller.js');

for (const exported of Object.values(module)) {
  if (isClass(exported)) {
    // exported is TClass<any>
    console.log(exported.name); // "UserController"
  }
}
```


## Constants

### BOOT_PHASES

Array of all boot phases in execution order.

```typescript
const BOOT_PHASES: TBootPhase[] = ['configure', 'discover', 'load']
```

**Usage:**

```typescript
import { BOOT_PHASES } from '@venizia/ignis-boot';

await bootstrapper.boot({ phases: BOOT_PHASES });
```


## Mixin Functions

### BootMixin()

Mixin that adds bootable capability to applications.

```typescript
function BootMixin<T extends TMixinTarget<Container>>(
  baseClass: T
): typeof baseClass & IBootableApplication
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseClass` | `T extends TMixinTarget<Container>` | Base class to extend |

**Returns:** Mixed class implementing `IBootableApplication`

**Example:**

```typescript
import { BootMixin } from '@venizia/ignis-boot';
import { Container } from '@venizia/ignis-inversion';

class MyApp extends BootMixin(Container) {
  bootOptions = {
    controllers: { dirs: ['controllers'] }
  };
}

const app = new MyApp();
await app.boot();
```


## See Also

- **Related References:**
  - [Application](./application.md) - Application lifecycle and initialization
  - [Dependency Injection](./dependency-injection.md) - DI container and bindings
  - [Components](./components.md) - Pluggable modules and components
  - [Boot Package](/references/src-details/boot.md) - Boot package implementation details

- **Guides:**
  - [Bootstrapping Concepts](/guides/core-concepts/application/bootstrapping)
  - [Application Guide](/guides/core-concepts/application/)

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns)

- **Configuration:**
  - [Environment Variables](/references/configuration/environment-variables)
