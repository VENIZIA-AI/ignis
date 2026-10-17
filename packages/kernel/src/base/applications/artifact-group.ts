import { SingletonRealm } from '@/helpers/singleton-realm';
import { getError } from '@venizia/ignis-helpers/core';
import type { IArtifactGroup, IArtifactIndex } from './common';

type TGroupResolver = (opts: { group: IArtifactGroup }) => Promise<IArtifactIndex>;

/** A typed slice of a shared package's artifacts - every decorated class under a directory named `folder` in the package that defined it. A package declares one per domain, once; an application borrows it in `configs.artifacts`. The content is filled by `@venizia/ignis-boot`: inlined when the application is built, or resolved from source when artifacts are registered. */
export class ArtifactGroup implements IArtifactGroup {
  /** A string brand, so the group protocol is structural: `@venizia/ignis-boot/auto` builds one without depending on the kernel. */
  static readonly BRAND_KEY = 'isArtifactGroup';
  /** The realm slot `@venizia/ignis-boot` fills with the resolver for groups defined without content. */
  static readonly SINGLETON_REALM_KEY = 'artifact-group-resolver';

  readonly isArtifactGroup = true as const;

  private constructor(
    readonly folder: string,
    readonly site: string | undefined,
    readonly content: IArtifactIndex | undefined,
  ) {}

  /** `content` is written by the build plugin; a hand-written group passes only `folder`. */
  static define(opts: { folder: string; content?: IArtifactIndex }): ArtifactGroup {
    return new ArtifactGroup(opts.folder, ArtifactGroup.callSite(), opts.content);
  }

  static isGroup(value: unknown): value is IArtifactGroup {
    return (
      typeof value === 'object' &&
      value !== null &&
      ArtifactGroup.BRAND_KEY in value &&
      value[ArtifactGroup.BRAND_KEY] === true
    );
  }

  static setResolver(opts: { resolve: TGroupResolver | undefined }): void {
    ArtifactGroup.holder().resolve = opts.resolve;
  }

  static getResolver(): TGroupResolver | undefined {
    return ArtifactGroup.holder().resolve;
  }

  /** The error a walker over `configs.artifacts` gets for reading a kind off a group - loud, never an empty list. */
  static unreadKindError(opts: { folder: string | undefined }): Error {
    return getError({
      message: `[ArtifactGroup] '${opts.folder ?? '<application>'}' is resolved when artifacts are registered | A function that walks configs.artifacts must pass a group through untouched (ArtifactGroup.isGroup) instead of reading its kinds`,
    });
  }

  get configurations(): never {
    throw ArtifactGroup.unreadKindError({ folder: this.folder });
  }

  get dataSources(): never {
    throw ArtifactGroup.unreadKindError({ folder: this.folder });
  }

  get components(): never {
    throw ArtifactGroup.unreadKindError({ folder: this.folder });
  }

  get repositories(): never {
    throw ArtifactGroup.unreadKindError({ folder: this.folder });
  }

  get services(): never {
    throw ArtifactGroup.unreadKindError({ folder: this.folder });
  }

  get controllers(): never {
    throw ArtifactGroup.unreadKindError({ folder: this.folder });
  }

  private static holder(): { resolve: TGroupResolver | undefined } {
    return SingletonRealm.resolve({
      key: ArtifactGroup.SINGLETON_REALM_KEY,
      create: () => ({ resolve: undefined }),
    });
  }

  /** The first stack frame outside this file: the module that declared the group. */
  private static callSite(): string | undefined {
    // A stack trace, not a failure: reading the call site needs an Error object, and nothing is thrown.
    // eslint-disable-next-line venizia/no-new-error
    const frames = (new Error().stack ?? '').split('\n').slice(1);
    for (const frame of frames) {
      const file = frame
        .match(/\(?((?:file:\/\/)?\/[^():]+):\d+:\d+\)?$/)?.[1]
        ?.replace(/^file:\/\//, '');
      if (file && !/artifact-group\.(?:ts|js)$/.test(file)) {
        return file;
      }
    }
    return undefined;
  }
}
