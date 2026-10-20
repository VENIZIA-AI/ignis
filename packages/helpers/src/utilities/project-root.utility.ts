/**
 * The `globalThis` slot an application's project root lives in, shared across every copy of this
 * package - a process (or a compiled bundle) can carry two, and a root set through one copy must be
 * found by the other. No Node import here on purpose: `ModuleUtility` delegates to this file, and so
 * does a browser Worker host through the `/core` sub-path - either would bundle a module-level Node
 * specifier straight into a host that cannot resolve it.
 */
export class ProjectRootRegistry {
  private static readonly SLOT = Symbol.for('ignis:project-root');

  /** Called by an application once it knows its root; every peer lookup that follows resolves against it. */
  static set(opts: { projectRoot: string }): void {
    Reflect.set(globalThis, this.SLOT, opts.projectRoot);
  }

  /** The shared root, or `undefined` until an application sets it - never a `process.cwd()` fallback here, so a host with no `process` never needs one. */
  static getShared(): string | undefined {
    return Reflect.get(globalThis, this.SLOT);
  }
}
