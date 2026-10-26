type TJoseModule = typeof import('jose');

/**
 * Loads `jose` for the auth services, once per process.
 *
 * `import()` loads `jose` on first use, so an application that never signs or verifies a token does
 * not pay for it at startup. A string literal, so a bundler still packs `jose` into a compiled binary.
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
