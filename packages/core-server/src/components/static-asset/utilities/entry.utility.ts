import { BaseStorageHelper } from '@venizia/ignis-helpers';
import type { IObjectLocation, IStorageHelper } from '@venizia/ignis-helpers';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { StaticAssetDefaults, StaticAssetStorageTypes } from '../common';
import type {
  TMetaLinkConfig,
  TStaticAssetAuth,
  TStaticAssetDefineExtraRoutes,
  TStaticAssetDirectUploadOptions,
  TStaticAssetEntry,
  TStaticAssetObjectKeyResolver,
  TStaticAssetRoutes,
  TStaticAssetServerUpload,
  TStaticAssetStorageType,
} from '../common';
import type { TMetaLinkCompatibleSchema } from '../models';
import { StaticAssetUploadCommitService, StaticAssetUploadPolicyService } from '../services';
import { StaticAssetObjectLinkUtility } from './object-link.utility';

/** An entry with every default applied and every cross-check made, so the component, the controller and the services read one thing. */
export interface IStaticAssetResolvedEntry<Schema extends TMetaLinkCompatibleSchema> {
  name: string;
  /** The mount path with exactly one leading slash. */
  basePath: string;
  isStrict: boolean;
  rawObjectPath: boolean;
  bucket?: TValueOrAsyncResolver<string>;
  keyPrefix?: string;
  auth?: TStaticAssetAuth;
  routes?: TStaticAssetRoutes;
  helper: IStorageHelper;
  storage: TStaticAssetStorageType;
  link: (opts: IObjectLocation) => string;
  serverUpload: {
    isEnabled: boolean;
    maxBytes?: number;
    maxFiles: number;
    maxFolderDepth: number;
    spool?: TStaticAssetServerUpload['spool'];
    objectKey?: TStaticAssetObjectKeyResolver;
  };
  /** `authorize` is always present here: the entry's own, or the pass-through that `auth` makes safe. */
  directUpload?: Omit<TStaticAssetDirectUploadOptions, 'authorize'> &
    Required<Pick<TStaticAssetDirectUploadOptions, 'authorize'>>;
  metaLink?: TMetaLinkConfig<Schema>;
  extend?: { before?: TStaticAssetDefineExtraRoutes; after?: TStaticAssetDefineExtraRoutes };
}

export class StaticAssetEntryUtility {
  /** `staticAsset` and `static-asset` both become `StaticAssetController`; a name already ending in `Controller` keeps it. */
  private static deriveName(opts: { key: string }): string {
    const words = opts.key.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);
    const pascal = words.map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join('');

    return pascal.endsWith('Controller') ? pascal : `${pascal}Controller`;
  }

  /** True when the entry's `auth` already decides who may call a route, which is what makes a missing `directUpload.authorize` safe. */
  private static isGuarded(opts: { auth?: TStaticAssetAuth }): boolean {
    const { authenticate, authorize } = opts.auth ?? {};
    const isAuthenticated =
      authenticate != null &&
      authenticate.skip !== true &&
      (authenticate.strategies?.length ?? 0) > 0;
    const isAuthorized = authorize != null && !('skip' in authorize);

    return isAuthenticated || isAuthorized;
  }

  /** Applies every default and refuses what the types cannot (an entry written in plain JavaScript, or cast). */
  static resolve<Schema extends TMetaLinkCompatibleSchema>(opts: {
    key: string;
    entry: TStaticAssetEntry<Schema>;
  }): IStaticAssetResolvedEntry<Schema> {
    const { key, entry } = opts;
    const { helper, bucket, keyPrefix, directUpload, auth, url } = entry;
    const name = entry.name ?? StaticAssetEntryUtility.deriveName({ key });

    // With the bucket in the URL the scope would span every bucket, and a policy would name a bucket the caller chooses.
    if (bucket === undefined && keyPrefix !== undefined) {
      throw getError({
        message: `[${name}] keyPrefix needs bucket | a bucket in the URL is a bucket the caller chooses, and the bucket routes cannot be scoped`,
      });
    }

    if (bucket === undefined && directUpload !== undefined) {
      throw getError({
        message: `[${name}] directUpload needs bucket | a policy names one bucket, and a bucket in the URL is a bucket the caller chooses`,
      });
    }

    if (directUpload?.authorize === undefined && directUpload !== undefined) {
      if (!StaticAssetEntryUtility.isGuarded({ auth })) {
        throw getError({
          message: `[${name}] directUpload needs authorize or auth | a route that hands out a write credential has no safe default for who may call it`,
        });
      }
    }

    const basePath = StaticAssetObjectLinkUtility.normalizeBasePath({ basePath: entry.basePath });
    const rawObjectPath = url?.rawObjectPath ?? false;
    const serverUpload = entry.serverUpload === false ? undefined : entry.serverUpload;

    return {
      name,
      basePath,
      isStrict: url?.isStrict ?? true,
      rawObjectPath,
      bucket,
      keyPrefix,
      auth,
      routes: entry.routes,
      helper,
      // The row records where the bytes live: S3 for an S3 helper, the disk otherwise.
      storage:
        helper instanceof BunS3Helper
          ? StaticAssetStorageTypes.BUN_S3
          : StaticAssetStorageTypes.DISK,
      // The link points at this controller's own object route: that is where the object can be read.
      link:
        url?.link ??
        ((location) =>
          StaticAssetObjectLinkUtility.build({
            basePath,
            bucket: location.bucket,
            object: location.object,
            hasConfiguredBucket: bucket !== undefined,
            rawObjectPath,
          })),
      serverUpload: {
        isEnabled: entry.serverUpload !== false,
        maxBytes: serverUpload?.maxBytes,
        maxFiles: serverUpload?.maxFiles ?? StaticAssetDefaults.MAX_UPLOAD_FILES,
        maxFolderDepth: serverUpload?.maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH,
        spool: serverUpload?.spool,
        objectKey: serverUpload?.objectKey,
      },
      directUpload: directUpload && {
        ...directUpload,
        authorize: directUpload.authorize ?? (() => true),
      },
      metaLink: entry.metaLink,
      extend: entry.extend,
    };
  }

  /**
   * The pair of services an entry's direct-upload routes run, or `undefined` when the entry has no
   * direct upload. The one place they are constructed: the component binds what this returns and
   * hands the same instances to the controller.
   */
  static buildDirectUploadServices<Schema extends TMetaLinkCompatibleSchema>(opts: {
    resolved: IStaticAssetResolvedEntry<Schema>;
  }):
    | {
        policyService: StaticAssetUploadPolicyService;
        commitService: StaticAssetUploadCommitService<Schema>;
      }
    | undefined {
    const { resolved } = opts;
    const { bucket, directUpload } = resolved;

    if (!directUpload || bucket === undefined) {
      return undefined;
    }

    return {
      policyService: new StaticAssetUploadPolicyService({
        scope: resolved.name,
        helper: resolved.helper,
        bucket,
        keyPrefix: resolved.keyPrefix,
        directUpload,
      }),
      commitService: new StaticAssetUploadCommitService<Schema>({
        scope: resolved.name,
        helper: resolved.helper,
        keyPrefix: resolved.keyPrefix,
        directUpload,
        storage: resolved.storage,
        metaLink: resolved.metaLink,
        link: resolved.link,
      }),
    };
  }
}
