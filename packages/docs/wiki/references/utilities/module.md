# Module Utility

The Module utility provides a function to validate the existence of Node.js modules at runtime. It uses `createRequire` from `node:module` rooted at the application's `process.cwd()/node_modules`, so peer dependencies in the consuming application are properly resolved even though this utility lives inside `packages/helpers`.

## `validateModule`

The `validateModule` function checks if a list of modules can be resolved. If a module is not found, it logs the error and throws a descriptive error, prompting the developer to install it. This is particularly useful for features that have optional peer dependencies.

### `validateModule(opts)`

-   `opts` (object):
    -   `scope` (string, optional): A string to identify the feature or component that requires the module, making the error message more informative. Defaults to empty string.
    -   `modules` (Array&lt;string&gt;): An array of module names to validate. Defaults to empty array.

This is an `async` function, though it performs synchronous resolution internally.

### Example

The `SwaggerComponent` uses `validateModule` to ensure that `@hono/swagger-ui` is installed before attempting to use it.

```typescript
import { validateModule } from '@venizia/ignis-helpers';

export class SwaggerComponent extends BaseComponent {
  // ...

  override async binding() {
    // This will throw an error if '@hono/swagger-ui' is not installed
    await validateModule({ scope: SwaggerComponent.name, modules: ['@hono/swagger-ui'] });

    const { swaggerUI } = await import('@hono/swagger-ui');

    // ... rest of the setup
  }
}
```

If the module is missing, the application will fail with an error message like:

```
[validateModule] @hono/swagger-ui is required for SwaggerComponent. Please install '@hono/swagger-ui'
```
