// The inversion package, not the helpers barrel: a browser bundle reaches this module, and the barrel loads node builtins.
import { getError } from '@venizia/ignis-inversion';
import type { TGeneratedArtifactIndex, TGeneratedArtifactIndexInput } from '../generator';

/** The application's own artifacts as the kernel's group protocol (`isArtifactGroup`), built without depending on the kernel: inlined `content` in a binary, `resolve()` from source. Reading a kind throws, so a function that walks `configs.artifacts` cannot drop it as an empty index. `TIndex` is the index type the content carries: it is inferred from what the application passes, and defaults to the bottom `TGeneratedArtifactIndex` when boot builds the group itself. */
export class AutoArtifactGroup<
  TIndex extends TGeneratedArtifactIndexInput = TGeneratedArtifactIndex,
> {
  readonly isArtifactGroup = true as const;
  readonly folder = undefined;
  readonly site = undefined;
  readonly content: TIndex | undefined;
  private readonly resolver: (() => Promise<TIndex>) | undefined;

  constructor(opts: { content?: TIndex; resolve?: () => Promise<TIndex> }) {
    this.content = opts.content;
    this.resolver = opts.resolve;
  }

  async resolve(): Promise<TIndex> {
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
