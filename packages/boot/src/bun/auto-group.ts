import { getError } from '@venizia/ignis-helpers';
import type { TGeneratedArtifactIndex } from '../generator';

/** The application's own artifacts as the kernel's group protocol (`isArtifactGroup`), built without depending on the kernel: inlined `content` in a binary, `resolve()` from source. Reading a kind throws, so a function that walks `configs.artifacts` cannot drop it as an empty index. */
export class AutoArtifactGroup {
  readonly isArtifactGroup = true as const;
  readonly folder = undefined;
  readonly site = undefined;
  readonly content: TGeneratedArtifactIndex | undefined;
  private readonly resolver: (() => Promise<TGeneratedArtifactIndex>) | undefined;

  constructor(opts: {
    content?: TGeneratedArtifactIndex;
    resolve?: () => Promise<TGeneratedArtifactIndex>;
  }) {
    this.content = opts.content;
    this.resolver = opts.resolve;
  }

  async resolve(): Promise<TGeneratedArtifactIndex> {
    if (this.content) {
      return this.content;
    }
    if (!this.resolver) {
      throw getError({
        message: '[@venizia/ignis-boot/auto] The auto group has neither content nor a resolver',
      });
    }
    return this.resolver();
  }

  private static unreadKind(): never {
    throw getError({
      message:
        '[@venizia/ignis-boot/auto] The application artifacts are resolved when artifacts are registered | A function that walks configs.artifacts must pass a group through untouched (check `isArtifactGroup`) instead of reading its kinds',
    });
  }

  get configurations(): never {
    return AutoArtifactGroup.unreadKind();
  }

  get dataSources(): never {
    return AutoArtifactGroup.unreadKind();
  }

  get components(): never {
    return AutoArtifactGroup.unreadKind();
  }

  get repositories(): never {
    return AutoArtifactGroup.unreadKind();
  }

  get services(): never {
    return AutoArtifactGroup.unreadKind();
  }

  get controllers(): never {
    return AutoArtifactGroup.unreadKind();
  }
}
