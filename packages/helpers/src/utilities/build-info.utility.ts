/**
 * What a build stamps about itself. Every field optional: a host that never ran the generator still
 * answers, with the fields it does know.
 */
export interface IBuildInfo {
  service?: string;
  version?: string;
  commit?: string;
  branch?: string;
  builtAt?: string;
}

/** The stamp with every field resolved: what the generator writes and what the health reporter answers. */
export type TBuildInfoRecord = Required<IBuildInfo>;

/**
 * The `globalThis` slot a build stamp lives in, PUSHED from the application entrypoint rather than
 * read back from disk. Same reasoning as {@link ProjectRootRegistry}: no Node import here, so a
 * browser Worker reaches it through `/core`, and a `bun build --compile` binary - which ships no
 * `node_modules`, no `.git` and no readable `package.json` - carries the value inside its own code.
 */
export class BuildInfoRegistry {
  private static readonly SLOT = Symbol.for('ignis:build-info');

  /** What a field reads when it is unknowable: the generator writes it, the health reporter falls back to it. Visible on purpose - a pipeline that forgot a variable shows up as this word, never as an absent key. */
  static readonly UNSPECIFIED = 'unspecified';

  /** Called once at the entrypoint with the generated stamp; every later read sees it. */
  static set(opts: { buildInfo: IBuildInfo }): void {
    Reflect.set(globalThis, this.SLOT, opts.buildInfo);
  }

  /** The shared stamp, or `undefined` when no application registered one. */
  static get(): IBuildInfo | undefined {
    return Reflect.get(globalThis, this.SLOT);
  }

  /** Drops the stamp - tests only; a host never unregisters its own build. */
  static clear(): void {
    Reflect.deleteProperty(globalThis, this.SLOT);
  }
}
