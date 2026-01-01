# Bootstrapping

> **Core Concept**: Automatic artifact discovery and loading during application startup

## What is Bootstrapping?

Bootstrapping is the process of automatically discovering and loading application artifacts (controllers, services, repositories, datasources) during application initialization. Instead of manually registering each component, the boot system scans your project directory and automatically loads everything that matches configured patterns.

## Why Bootstrap?

### Without Boot System (Manual Registration)

```typescript
export class Application extends BaseApplication {
  constructor() {
    super(configs);
    
    // Manual registration - tedious and error-prone
    this.dataSource(PostgresDataSource);
    this.dataSource(MongoDataSource);
    
    this.repository(UserRepository);
    this.repository(ProductRepository);
    this.repository(OrderRepository);
    this.repository(CustomerRepository);
    // ... 50+ more repositories
    
    this.service(AuthService);
    this.service(UserService);
    this.service(ProductService);
    // ... 50+ more services
    
    this.controller(AuthController);
    this.controller(UserController);
    this.controller(ProductController);
    // ... 50+ more controllers
  }
}
```

**Problems:**
- **Repetitive** - Every new artifact requires manual registration
- **Error-prone** - Easy to forget registering new artifacts
- **Maintenance burden** - Constructor grows as application grows
- **Merge conflicts** - Multiple developers editing same file

### With Boot System (Auto-discovery)

```typescript
export const appConfigs: IApplicationConfigs = {
  name: 'MyApp',
  bootOptions: {
    datasources: { dirs: ['datasources'] },
    repositories: { dirs: ['repositories'] },
    services: { dirs: ['services'] },
    controllers: { dirs: ['controllers'] }
  }
};

export class Application extends BaseApplication {
  constructor() {
    super(appConfigs);
    // That's it! Everything auto-discovered and registered
  }
}
```

**Benefits:**
- ✅ **Convention-based** - Follow naming patterns, framework does the rest
- ✅ **Scalable** - Add 100 controllers without changing application code
- ✅ **Clean** - No constructor bloat
- ✅ **Team-friendly** - No merge conflicts on registration

## How It Works

### Three-Phase Boot Process

```
1. CONFIGURE → 2. DISCOVER → 3. LOAD
```

#### Phase 1: Configure

Each booter configures its discovery patterns:
- Which directories to scan
- Which file extensions to match
- Whether to scan subdirectories

```typescript
// ControllerBooter configures itself
protected override getDefaultDirs(): string[] {
  return ['controllers'];
}

protected override getDefaultExtensions(): string[] {
  return ['.controller.js'];
}
```

#### Phase 2: Discover

Booters scan the filesystem for matching files:

```
Project Root
├── controllers/
│   ├── auth.controller.js      ✓ discovered
│   ├── user.controller.js      ✓ discovered
│   └── helpers/
│       └── validator.js        ✗ doesn't match pattern
├── services/
│   └── user.service.js         ✓ discovered (by ServiceBooter)
└── repositories/
    └── user.repository.js      ✓ discovered (by RepositoryBooter)
```

#### Phase 3: Load

Booters load discovered classes and bind them to the container:

```typescript
// Pseudo-code of what happens
for (const file of discoveredFiles) {
  const module = await import(file);
  for (const exported of Object.values(module)) {
    if (isClass(exported)) {
      app.bind({ key: `controllers.${exported.name}` }).toClass(exported);
    }
  }
}
```

## Boot Options

Configure discovery patterns for each artifact type.

### Basic Configuration

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    dirs: ['controllers'],           // where to look
    extensions: ['.controller.js'],  // what to match
    isNested: true                   // scan subdirectories
  }
};
```

### Multiple Directories

Scan multiple directories for the same artifact type:

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    dirs: [
      'controllers/private',  // admin controllers
      'controllers/public'    // public API controllers
    ],
    extensions: ['.controller.js'],
    isNested: true
  }
};
```

### Multiple Extensions

Support both JavaScript and TypeScript:

```typescript
const bootOptions: IBootOptions = {
  services: {
    dirs: ['services'],
    extensions: ['.service.js', '.service.ts'],
    isNested: true
  }
};
```

### Custom Glob Pattern

Override default pattern with custom glob:

```typescript
const bootOptions: IBootOptions = {
  repositories: {
    // Custom pattern - matches any .repo.js file in data-access subdirectories
    glob: 'data-access/**/*.repo.js'
  }
};
```

### Disable Subdirectory Scanning

Only scan root level of directory:

```typescript
const bootOptions: IBootOptions = {
  controllers: {
    dirs: ['controllers'],
    extensions: ['.controller.js'],
    isNested: false  // only scan controllers/*.controller.js, not subdirs
  }
};
```

## Built-in Booters

The framework provides four built-in booters:

### DatasourceBooter

| Setting | Default |
|---------|---------|
| Directories | `['datasources']` |
| Extensions | `['.datasource.js']` |
| Binding Key | `datasources.{ClassName}` |

**Discovers:**
- `datasources/postgres.datasource.js` → `PostgresDataSource`
- `datasources/mongo.datasource.js` → `MongoDataSource`

### RepositoryBooter

| Setting | Default |
|---------|---------|
| Directories | `['repositories']` |
| Extensions | `['.repository.js']` |
| Binding Key | `repositories.{ClassName}` |

**Discovers:**
- `repositories/user.repository.js` → `UserRepository`
- `repositories/product/main.repository.js` → `MainRepository`

### ServiceBooter

| Setting | Default |
|---------|---------|
| Directories | `['services']` |
| Extensions | `['.service.js']` |
| Binding Key | `services.{ClassName}` |

**Discovers:**
- `services/auth.service.js` → `AuthService`
- `services/user/profile.service.js` → `ProfileService`

### ControllerBooter

| Setting | Default |
|---------|---------|
| Directories | `['controllers']` |
| Extensions | `['.controller.js']` |
| Binding Key | `controllers.{ClassName}` |

**Discovers:**
- `controllers/auth.controller.js` → `AuthController`
- `controllers/api/user.controller.js` → `UserController`

## Execution Order

Boot system respects dependency order:

```
1. DatasourceBooter   → Datasources must be available first
2. RepositoryBooter   → Repositories need datasources
3. ServiceBooter      → Services may use repositories
4. ControllerBooter   → Controllers use services
```

This ensures dependencies are available when artifacts are constructed.

## When Boot Runs

### Automatic Boot

Boot runs automatically during `initialize()` if `bootOptions` is configured:

```typescript
const app = new Application();
await app.start();  // initialize() → boot() → start()
```

### Manual Boot

Explicitly control boot execution:

```typescript
const app = new Application();
await app.boot({
  phases: ['configure', 'discover', 'load'],
  booters: ['ControllerBooter', 'ServiceBooter']  // only these booters
});
```

### Partial Boot

Run only specific phases:

```typescript
await app.boot({
  phases: ['discover']  // only discover, don't load
});
```

## File Naming Conventions

Follow these conventions for auto-discovery:

### Controllers

```
✓ user.controller.js
✓ auth.controller.js
✓ api/product.controller.js
✗ user-ctrl.js           // doesn't match pattern
✗ controller.js          // no prefix
```

### Services

```
✓ user.service.js
✓ auth.service.js
✓ business/order.service.js
✗ user-svc.js            // doesn't match pattern
✗ service.js             // no prefix
```

### Repositories

```
✓ user.repository.js
✓ product.repository.js
✓ data/customer.repository.js
✗ user-repo.js           // doesn't match pattern
✗ repository.js          // no prefix
```

### Datasources

```
✓ postgres.datasource.js
✓ mongo.datasource.js
✓ connections/redis.datasource.js
✗ postgres-ds.js         // doesn't match pattern
✗ datasource.js          // no prefix
```

## Project Structure Examples

### Simple Structure

```
src/
├── datasources/
│   └── postgres.datasource.js
├── repositories/
│   ├── user.repository.js
│   └── product.repository.js
├── services/
│   ├── auth.service.js
│   └── user.service.js
└── controllers/
    ├── auth.controller.js
    └── user.controller.js
```

**Boot Config:**
```typescript
bootOptions: {
  datasources: { dirs: ['datasources'] },
  repositories: { dirs: ['repositories'] },
  services: { dirs: ['services'] },
  controllers: { dirs: ['controllers'] }
}
```

### Feature-based Structure

```
src/
├── features/
│   ├── auth/
│   │   ├── auth.controller.js
│   │   ├── auth.service.js
│   │   └── auth.repository.js
│   └── user/
│       ├── user.controller.js
│       ├── user.service.js
│       └── user.repository.js
└── datasources/
    └── postgres.datasource.js
```

**Boot Config:**
```typescript
bootOptions: {
  datasources: { dirs: ['datasources'] },
  repositories: { glob: 'features/**/*.repository.js' },
  services: { glob: 'features/**/*.service.js' },
  controllers: { glob: 'features/**/*.controller.js' }
}
```

### Layered Structure

```
src/
├── data/
│   ├── datasources/
│   │   └── postgres.datasource.js
│   └── repositories/
│       └── user.repository.js
├── business/
│   └── services/
│       └── user.service.js
└── api/
    └── controllers/
        └── user.controller.js
```

**Boot Config:**
```typescript
bootOptions: {
  datasources: { dirs: ['data/datasources'] },
  repositories: { dirs: ['data/repositories'] },
  services: { dirs: ['business/services'] },
  controllers: { dirs: ['api/controllers'] }
}
```

## Custom Booters

Create custom booters for new artifact types:

```typescript
import { BaseArtifactBooter, IBooterOptions } from '@venizia/ignis-boot';
import { inject } from '@venizia/ignis-inversion';

export class MiddlewareBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private app: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ 
      scope: MiddlewareBooter.name, 
      root, 
      artifactOptions: bootOptions.middlewares ?? {} 
    });
  }

  protected getDefaultDirs(): string[] {
    return ['middlewares'];
  }

  protected getDefaultExtensions(): string[] {
    return ['.middleware.js'];
  }

  protected async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      this.app.bind({ key: `middlewares.${cls.name}` }).toClass(cls);
    }
  }
}
```

**Register Custom Booter:**

```typescript
export class Application extends BaseApplication {
  override async initialize() {
    // Register custom booter
    this.booter(MiddlewareBooter);
    
    await super.initialize();
  }
}
```

## Performance Considerations

### Boot Time

Boot adds minimal overhead:
- **Configure phase**: < 1ms per booter
- **Discover phase**: 10-50ms (depends on filesystem)
- **Load phase**: 50-200ms (depends on artifact count)

**Total**: Typically 100-300ms for medium-sized applications.

### Development vs Production

Boot is most valuable in **production** where artifact count is high. In **development**, the overhead is negligible.

### Optimization Tips

1. **Limit nested scanning** - Set `isNested: false` when possible
2. **Specific patterns** - Use precise glob patterns
3. **Skip unused booters** - Only enable needed booters
4. **Pre-compiled bundles** - For serverless, consider bundling

## Troubleshooting

### Artifacts Not Discovered

**Problem:** Created `user.controller.js` but not loaded.

**Solutions:**
1. Check file naming: Must match pattern (e.g., `*.controller.js`)
2. Check directory: File must be in configured dirs
3. Check extension: Must match configured extensions
4. Enable debug logging: See what's discovered

```typescript
// Enable debug logs
process.env.LOG_LEVEL = 'debug';
```

### Wrong Binding Order

**Problem:** Repository tries to use datasource before it's available.

**Solution:** Boot system handles this automatically. Datasources are always loaded before repositories. If you have custom booters, register them in correct order:

```typescript
this.booter(CustomDatasourceBooter);
this.booter(CustomRepositoryBooter);  // after datasource
```

### Custom Pattern Not Working

**Problem:** Custom glob pattern doesn't match files.

**Solution:** Test pattern with glob tool:

```bash
# From project root
npx glob "your-pattern/**/*.controller.js"
```

## Best Practices

### ✅ DO

- Follow naming conventions consistently
- Use boot system for applications with > 5 artifacts per type
- Organize files by feature or layer
- Keep boot options in config file
- Use debug logging during development

### ❌ DON'T

- Mix manual and auto registration (choose one approach)
- Use boot for tiny applications (< 5 total artifacts)
- Override default patterns without good reason
- Skip subdirectories if you have nested structure
- Ignore boot errors (they indicate misconfiguration)

## Related Documentation

- [Boot Package Reference](../../../references/src-details/boot.md)
- [Application Overview](./)
- [Dependency Injection](../../../references/base/dependency-injection.md)
- [Building a CRUD API](../../tutorials/building-a-crud-api.md)
