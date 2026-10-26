type TJoseModule = typeof import('jose');

/**
 * Loads `jose` for the auth services, once per process.
 *
 * `jose` is ESM-only and this package is CommonJS. A top-level `require('jose')` runs while the
 * application is still loading, and under Bun it fails with `require() async module ... is
 * unsupported` whenever the application imports `jose` itself. `import()` waits for that load
 * instead of racing it. A string literal, so a bundler still packs `jose` into a compiled binary.
 */
export class JoseLoader {
  private static importer: () => Promise<TJoseModule> = () => import('jose');
  private static module: Promise<TJoseModule> | null = null;

  static load(): Promise<TJoseModule> {
    // A failed load is dropped, so the next call imports again instead of failing for good.
    JoseLoader.module ??= JoseLoader.importer().catch((error: unknown) => {
      JoseLoader.module = null;
      throw error;
    });
    return JoseLoader.module;
  }
}
