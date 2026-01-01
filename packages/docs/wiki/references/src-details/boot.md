# @venizia/ignis-boot

> **Package**: `@venizia/ignis-boot`  
> **Purpose**: Application bootstrapping system with artifact auto-discovery  
> **Version**: 0.0.0

## Overview

The `@venizia/ignis-boot` package provides a powerful bootstrapping system that automatically discovers and loads application artifacts (controllers, services, repositories, datasources) during application startup. It eliminates the need for manual registration of each artifact, making application setup cleaner and more maintainable.

## Key Concepts

### Boot Phases

The boot process consists of three phases executed in order:

1. **Configure** - Booters configure their discovery patterns
2. **Discover** - Booters scan filesystem for matching artifacts
3. **Load** - Booters load classes and bind them to the application container

### Artifacts

An artifact is any application component that can be auto-discovered:
- **Controllers** - REST/API endpoint handlers
- **Services** - Business logic layer
- **Repositories** - Data access layer
- **Datasources** - Database connections

### Booters

Booters are specialized classes that handle discovery and loading of specific artifact types. Each booter:
- Defines default discovery patterns (directories, file extensions)
- Scans filesystem for matching files
- Loads classes from discovered files
- Binds loaded classes to application container

## Core Components

### Bootstrapper

Orchestrates the entire boot process.

| Feature | Description |
|---------|-------------|
| **Phase Execution** | Runs configure → discover → load phases |
| **Booter Discovery** | Automatically finds all registered booters |
| **Error Handling** | Catches and reports errors during boot |
| **Performance Tracking** | Measures time taken for each phase |

**Usage:**

```typescript
import { Bootstrapper, IBootExecutionOptions } from '@venizia/ignis-boot';

const bootstrapper = app.get<Bootstrapper>({ key: 'bootstrapper' });
await bootstrapper.boot({
  phases: ['configure', 'discover', 'load'], // optional, default: all phases
  booters: ['ControllerBooter', 'ServiceBooter'], // optional, default: all booters
});
```

### BaseArtifactBooter

Abstract base class for creating custom booters.

| Method | Phase | Description |
|--------|-------|-------------|
| `configure()` | Configure | Sets up discovery patterns |
| `discover()` | Discover | Scans filesystem for artifacts |
| `load()` | Load | Loads classes and binds to container |
| `getPattern()` | - | Generates glob pattern for file discovery |
| `bind()` | - | Abstract method - implement to bind loaded classes |

**Custom Booter Example:**

```typescript
import { BaseArtifactBooter, IBooterOptions } from '@venizia/ignis-boot';
import { inject } from '@venizia/ignis-inversion';

export class CustomBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private _app: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ 
      scope: CustomBooter.name, 
      root, 
      artifactOptions: bootOptions.custom ?? {} 
    });
  }

  protected getDefaultDirs(): string[] {
    return ['custom'];
  }

  protected getDefaultExtensions(): string[] {
    return ['.custom.js'];
  }

  protected async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      this.app.bind({ key: `custom.${cls.name}` }).toClass(cls);
    }
  }
}
```

### Built-in Booters

#### ControllerBooter

Auto-discovers and registers controllers.

| Configuration | Default Value |
|---------------|---------------|
| **Directories** | `['controllers']` |
| **Extensions** | `['.controller.js']` |
| **Binding Pattern** | `controllers.{ClassName}` |

#### ServiceBooter

Auto-discovers and registers services.

| Configuration | Default Value |
|---------------|---------------|
| **Directories** | `['services']` |
| **Extensions** | `['.service.js']` |
| **Binding Pattern** | `services.{ClassName}` |

#### RepositoryBooter

Auto-discovers and registers repositories.

| Configuration | Default Value |
|---------------|---------------|
| **Directories** | `['repositories']` |
| **Extensions** | `['.repository.js']` |
| **Binding Pattern** | `repositories.{ClassName}` |

#### DatasourceBooter

Auto-discovers and registers datasources.

| Configuration | Default Value |
|---------------|---------------|
| **Directories** | `['datasources']` |
| **Extensions** | `['.datasource.js']` |
| **Binding Pattern** | `datasources.{ClassName}` |

### BootMixin

Mixin that adds bootable capability to any application.

**Features:**
- Automatically binds default booters
- Exposes `boot()` method
- Configurable via `bootOptions`

**Usage:**

```typescript
import { BootMixin } from '@venizia/ignis-boot';
import { Container } from '@venizia/ignis-inversion';

class MyApp extends BootMixin(Container) {
  bootOptions = {
    controllers: { 
      dirs: ['private-controllers', 'public-controllers'],
      extensions: ['.controller.js', '.controller.ts']
    },
    services: { 
      isNested: true // scan subdirectories
    }
  };
}

const app = new MyApp();
await app.boot();
```

## Boot Options

Configure artifact discovery per artifact type.

### IArtifactOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `dirs` | `string[]` | Varies | Directories to scan |
| `extensions` | `string[]` | Varies | File extensions to match |
| `isNested` | `boolean` | `true` | Scan subdirectories |
| `glob` | `string` | - | Custom glob pattern (overrides dirs/extensions) |

### IBootOptions

```typescript
interface IBootOptions {
  controllers?: IArtifactOptions;
  services?: IArtifactOptions;
  repositories?: IArtifactOptions;
  datasources?: IArtifactOptions;
  [artifactType: string]: IArtifactOptions | undefined;
}
```

**Example Configuration:**

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    dirs: ['controllers/private', 'controllers/public'],
    extensions: ['.controller.js'],
    isNested: true
  },
  repositories: {
    glob: 'data-access/**/*.repository.js' // custom pattern
  },
  services: {
    dirs: ['services'],
    extensions: ['.service.js', '.service.ts'],
    isNested: false // only scan root level
  }
};
```

## Integration with Core

### BaseApplication Integration

Boot system is integrated into `BaseApplication` via `IBootableApplication` interface:

```typescript
export abstract class BaseApplication 
  extends AbstractApplication 
  implements IRestApplication, IBootableApplication {
  
  bootOptions?: IBootOptions;
  
  boot(): Promise<IBootReport> {
    const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
    return bootstrapper.boot({});
  }
}
```

### Automatic Initialization

If `bootOptions` is defined in application config, boot runs automatically during `initialize()`:

```typescript
override async initialize() {
  if (this.configs.bootOptions) {
    // Bind boot infrastructure
    this.bind({ key: '@app/boot-options' }).toValue(this.bootOptions ?? {});
    this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper);
    
    // Register default booters
    this.booter(DatasourceBooter);
    this.booter(RepositoryBooter);
    this.booter(ServiceBooter);
    this.booter(ControllerBooter);
    
    // Execute boot
    await this.boot();
  }
  
  // ... rest of initialization
}
```

## Utilities

### discoverFiles

Discovers files matching a glob pattern.

```typescript
const files = await discoverFiles({ 
  pattern: 'controllers/**/*.controller.js',
  root: '/path/to/project'
});
// Returns: ['/path/to/project/controllers/user.controller.js', ...]
```

### loadClasses

Loads class constructors from files.

```typescript
const classes = await loadClasses({ 
  files: ['/path/to/file1.js', '/path/to/file2.js'],
  root: '/path/to/project'
});
// Returns: [UserController, ProductController, ...]
```

### isClass

Type guard to check if value is a class constructor.

```typescript
if (isClass(exported)) {
  // exported is TClass<any>
}
```

## Complete Example

```typescript
import { BaseApplication, IApplicationConfigs } from '@venizia/ignis';
import { IBootOptions } from '@venizia/ignis-boot';

export const appConfigs: IApplicationConfigs = {
  name: 'MyApp',
  bootOptions: {
    controllers: {
      dirs: ['controllers'],
      extensions: ['.controller.js'],
      isNested: true
    },
    services: {
      dirs: ['services'],
      extensions: ['.service.js'],
      isNested: true
    },
    repositories: {
      dirs: ['repositories'],
      extensions: ['.repository.js']
    },
    datasources: {
      dirs: ['datasources'],
      extensions: ['.datasource.js']
    }
  }
};

export class MyApp extends BaseApplication {
  constructor() {
    super(appConfigs);
  }
}

// Boot runs automatically during initialize()
const app = new MyApp();
await app.start(); // Calls initialize() which triggers boot
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **Auto-discovery** | No manual registration of controllers/services/repositories |
| **Convention-based** | Follow naming conventions, framework handles the rest |
| **Flexible** | Customize discovery patterns per artifact type |
| **Extensible** | Create custom booters for new artifact types |
| **Performance** | Track boot time per phase |
| **Developer Experience** | Focus on writing code, not wiring infrastructure |

## When to Use

✅ **Use Boot System When:**
- Building applications with many controllers/services/repositories
- Want convention-over-configuration approach
- Need consistent artifact registration across projects
- Building modular applications with clear folder structure

❌ **Manual Registration When:**
- Very small applications (< 5 artifacts)
- Need fine-grained control over registration order
- Dynamic artifact registration based on runtime conditions
- Artifacts don't follow file naming conventions

## Related Documentation

- [Bootstrapping Concepts](/guides/core-concepts/application/bootstrapping)
- [Application Guide](/guides/core-concepts/application/)
- [Dependency Injection](/references/base/dependency-injection.md)
- [Core Package](/references/src-details/core.md)
