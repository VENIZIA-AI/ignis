# Troubleshooting

### "Binding key: X is not bounded in context!"

**Cause:** The dependency was never registered with the container, or the key string does not match exactly.

**Fix:**
1. Verify the binding exists: `container.isBound({ key: 'services.UserService' })`.
2. Check for typos in the key passed to `@inject({ key: '...' })` vs the key used in `container.bind({ key: '...' })`.
3. If the dependency is optional, use `@inject({ key: '...', isOptional: true })` or `container.get({ key: '...', isOptional: true })`.

### "Property injection returns undefined"

**Cause:** The class was instantiated with `new MyClass()` directly instead of going through the container.

**Fix:** Always use `container.resolve(MyClass)` or `container.instantiate(MyClass)` to create instances. Only the container reads `@inject` metadata and populates injected properties.

### "getInjectMetadata returns undefined"

**Cause:** `reflect-metadata` was not imported before decorators were evaluated, or `experimentalDecorators` / `emitDecoratorMetadata` are not enabled in `tsconfig.json`.

**Fix:**
1. Ensure `import 'reflect-metadata'` is at the top of your entry point (or rely on `@venizia/ignis-inversion` which imports it automatically).
2. Verify your `tsconfig.json` includes:
   ```json
   {
     "compilerOptions": {
       "experimentalDecorators": true,
       "emitDecoratorMetadata": true
     }
   }
   ```

### "Singleton returns stale instance after rebinding"

**Cause:** Singleton caching is per-`Binding` object. If you hold a direct reference to an old `Binding` (e.g., from `getBinding()`), its cache is independent of the container.

**Fix:**
1. Always resolve via `container.get()` rather than caching `Binding` references.
2. Call `container.clear()` to clear all singleton caches without removing bindings.
3. Call `container.reset()` to remove all bindings entirely.
