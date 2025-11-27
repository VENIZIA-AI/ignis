# Module Utility

The Module utility provides a simple function to validate the existence of a Node.js module at runtime.

## `validateModule`

The `validateModule` function checks if a list of modules can be resolved. If a module is not found, it throws a descriptive error, prompting the developer to install it. This is particularly useful for features that have optional peer dependencies.

### `validateModule(opts)`

-   `opts` (object):
    -   `scope` (string, optional): A string to identify the feature or component that requires the module, making the error message more informative.
    -   `modules` (Array&lt;string&gt;): An array of module names to validate.

### Example

The `SwaggerComponent` uses `validateModule` to ensure that `@hono/swagger-ui` is installed before attempting to use it.

```typescript
import { validateModule } from '@vez/ignis';

export class SwaggerComponent extends BaseComponent {
  // ...

  override async binding() {
    // This will throw an error if '@hono/swagger-ui' is not installed
    validateModule({ scope: SwaggerComponent.name, modules: ['@hono/swagger-ui'] });

    const { swaggerUI } = await import('@hono/swagger-ui');

    // ... rest of the setup
  }
}
```

If the module is missing, the application will fail to start with an error message like:

```
[validateModule] @hono/swagger-ui is required for SwaggerComponent. Please install '@hono/swagger-ui'
```
