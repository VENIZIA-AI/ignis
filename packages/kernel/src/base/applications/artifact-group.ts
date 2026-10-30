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
  readonly resolve: (() => Promise<IArtifactIndex>) | undefined;
  readonly kinds: ReadonlyArray<keyof IArtifactIndex> | undefined;

  private constructor(opts: {
    folder: string | undefined;
    site: string | undefined;
    content: IArtifactIndex | undefined;
    resolve?: () => Promise<IArtifactIndex>;
    kinds?: ReadonlyArray<keyof IArtifactIndex>;
    ignore?: ReadonlyArray<string>;
  }) {
    this.folder = opts.folder;
    this.site = opts.site;
    this.content = opts.content;
    this.resolve = opts.resolve;
    this.kinds = opts.kinds;
    this.ignore = opts.ignore;
  }

  readonly folder: string | undefined;
  readonly site: string | undefined;
  readonly content: IArtifactIndex | undefined;
  readonly ignore: ReadonlyArray<string> | undefined;

  /** `content` is written by the build plugin; a hand-written group passes only `folder`. */
  static define(opts: { folder: string; content?: IArtifactIndex }): ArtifactGroup {
    return new ArtifactGroup({
      folder: opts.folder,
      site: ArtifactGroup.callSite(),
      content: opts.content,
    });
  }

  /** Every decorated class of the calling package - an application's own artifacts, picked by its call site, so several applications in one process each get their own. `ignore` takes the globs `ignis-artifacts --ignore` takes, relative to the package `src`. `content` is written by the build plugin. */
  static application(
    opts: { ignore?: ReadonlyArray<string>; content?: IArtifactIndex } = {},
  ): ArtifactGroup {
    return new ArtifactGroup({
      folder: undefined,
      site: ArtifactGroup.callSite(),
      content: opts.content,
      ignore: opts.ignore,
    });
  }

  /** A group carrying only `kinds` - for a slicer that splits `configs.artifacts` by run mode. The source group is resolved when artifacts are registered, never here. */
  static pick(opts: {
    group: IArtifactGroup;
    kinds: ReadonlyArray<keyof IArtifactIndex>;
  }): ArtifactGroup {
    const { group, kinds } = opts;
    const slice = (index: IArtifactIndex): IArtifactIndex =>
      Object.fromEntries(
        kinds.filter((kind) => index[kind] !== undefined).map((kind) => [kind, index[kind]]),
      );

    return new ArtifactGroup({
      folder: group.folder,
      site: group.site,
      content: group.content ? slice(group.content) : undefined,
      resolve: async () => {
        const content = await ArtifactGroup.resolveContent({ group });
        return slice(content);
      },
      kinds,
      ignore: group.ignore,
    });
  }

  /** A group's classes: inlined by a build, else its own `resolve()`, else the resolver `@venizia/ignis-boot/auto` installs. */
  static async resolveContent(opts: { group: IArtifactGroup }): Promise<IArtifactIndex> {
    const { group } = opts;
    if (group.content) {
      return group.content;
    }
    if (group.resolve) {
      return group.resolve();
    }
    const resolve = ArtifactGroup.getResolver();
    if (!resolve) {
      throw getError({
        message: `[ArtifactGroup] '${group.folder ?? '<application>'}' has no content | Import @venizia/ignis-boot/auto in the application (it resolves groups from source), or add IgnisArtifactsPlugin to the build's plugins`,
      });
    }
    return resolve({ group });
  }

  /** Positional on purpose: a type predicate narrows its own parameter, and an options object would narrow the wrapper instead of `value`. */
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

  /** The module that declared the group, read from the call stack. */
  private static callSite(): string | undefined {
    // A stack trace, not a failure: reading the call site needs an Error object, and nothing is thrown.
    // eslint-disable-next-line venizia/no-new-error
    return ArtifactGroup.siteFromStack({ stack: new Error().stack ?? '' });
  }

  /** The first frame outside the kernel's own `artifact-group` file: POSIX and Windows paths, `file://` URLs (decoded, drive kept), parentheses inside a path. */
  static siteFromStack(opts: { stack: string }): string | undefined {
    for (const raw of opts.stack.split('\n').slice(1)) {
      const frame = raw.trim().replace(/^at\s+/, '');
      const opening = frame.indexOf(' (');
      const location = frame.endsWith(')') && opening >= 0 ? frame.slice(opening + 2, -1) : frame;
      let file = location.replace(/:\d+:\d+$/, '');
      if (file.startsWith('file://')) {
        file = decodeURIComponent(file.slice('file://'.length)).replace(/^\/([A-Za-z]:\/)/, '$1');
      }
      const isPath = file.startsWith('/') || /^[A-Za-z]:[\\/]/.test(file);
      if (isPath && !/(?:^|[\\/])artifact-group\.(?:ts|js)$/.test(file)) {
        return file;
      }
    }
    return undefined;
  }
}
