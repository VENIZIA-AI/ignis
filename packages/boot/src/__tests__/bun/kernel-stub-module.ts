// Test-only stand-in for '@venizia/ignis-kernel' inside a compiled binary: pass-through decorators and a group that keeps its content.
const passThrough = () => (target: unknown) => target;

export const service = passThrough;
export const repository = passThrough;

export class ArtifactGroup {
  private constructor(
    readonly folder: string,
    readonly content: unknown,
  ) {}

  static define(opts: { folder: string; content?: unknown }): ArtifactGroup {
    return new ArtifactGroup(opts.folder, opts.content);
  }
}
