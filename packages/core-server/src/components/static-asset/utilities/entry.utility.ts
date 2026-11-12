import { BaseStorageHelper, StorageTypes } from '@venizia/ignis-helpers';
import type { IObjectLocation, IStorageHelper } from '@venizia/ignis-helpers';
import type { TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { StaticAssetDefaults, StaticAssetRouteKeys } from '../common';
import type {
  IStaticAssetValidation,
  TMetaLinkConfig,
  TStaticAssetAuth,
  TStaticAssetDefineExtraRoutes,
  TStaticAssetDirectUploadOptions,
  TStaticAssetEntry,
  TStaticAssetObjectKeyResolver,
  TStaticAssetRouteConfig,
  TStaticAssetRouteKey,
  TStaticAssetStorageType,
} from '../common';
import type { TMetaLinkCompatibleSchema } from '../models';
import { StaticAssetUploadCommitService, StaticAssetUploadPolicyService } from '../services';
import { StaticAssetKeyScopeUtility } from './key-scope.utility';
import { StaticAssetObjectLinkUtility } from './object-link.utility';
import { StaticAssetToggleUtility } from './toggle.utility';
import type { z } from '@hono/zod-openapi';

/** One route after its toggle is read: whether it is registered, and what the application overrides. */
export interface IStaticAssetResolvedRoute {
  isEnabled: boolean;
  override: TStaticAssetRouteConfig;
}

/** An entry with every toggle read, every default applied and every cross-check made, so the component, the controller and the services read one thing. */
export interface IStaticAssetResolvedEntry<Schema extends TMetaLinkCompatibleSchema> {
  name: string;
  /** The mount path with exactly one leading slash. */
  basePath: string;
  rawObjectPath: boolean;
  bucket: TValueOrAsyncResolver<string>;
  /** Normalized: no leading slash, one trailing slash. */
  keyPrefix?: string;
  /** Folders allowed in an object key: the caller's `maxFolderDepth` plus the scope's own. */
  objectKeyMaxDepth: number;
  maxFolderDepth: number;
  auth?: Pick<TStaticAssetAuth, 'authenticate' | 'authorize'> & { isPublicRead: boolean };
  routes: Partial<Record<TStaticAssetRouteKey, IStaticAssetResolvedRoute>>;
  helper: IStorageHelper;
  storage: TStaticAssetStorageType;
  link: (opts: IObjectLocation) => string;
  serverUpload?: { maxBytes?: number; maxFiles: number; objectKey?: TStaticAssetObjectKeyResolver };
  /** `authorize` is always present here: the entry's own, or the pass-through that `auth` makes safe. `validation` is present only when it is on. */
  directUpload?: Omit<TStaticAssetDirectUploadOptions, 'authorize' | 'validation'> & {
    authorize: NonNullable<TStaticAssetDirectUploadOptions['authorize']>;
    validation?: IStaticAssetValidation<z.ZodType>;
  };
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

  /** Reads every toggle, applies every default and refuses what the types cannot (an entry written in plain JavaScript, or cast). */
  static resolve<Schema extends TMetaLinkCompatibleSchema>(opts: {
    key: string;
    entry: TStaticAssetEntry<Schema>;
  }): IStaticAssetResolvedEntry<Schema> {
    const { key, entry } = opts;
    const { helper, bucket, auth } = entry;
    const name = entry.name ?? StaticAssetEntryUtility.deriveName({ key });
    const { storageType } = helper;

    if (storageType !== StorageTypes.BUN_S3 && storageType !== StorageTypes.DISK) {
      throw getError({
        message: `[${name}] helper must be a BunS3Helper or a DiskHelper | storageType: ${storageType}`,
      });
    }

    const directUpload = StaticAssetToggleUtility.isUsed(entry.directUpload)
      ? entry.directUpload
      : undefined;

    // A policy is a POST policy, which only S3 can sign.
    if (directUpload && storageType !== StorageTypes.BUN_S3) {
      throw getError({
        message: `[${name}] directUpload needs a BunS3Helper | a POST policy is an S3 feature, and this helper is ${storageType}`,
      });
    }

    // Its pending objects live in the same bucket: the scope is what keeps them out of the routes.
    if (directUpload && entry.keyPrefix === undefined) {
      throw getError({
        message: `[${name}] directUpload needs keyPrefix | the pending prefix stays out of what the routes serve only when the entry has a scope of its own`,
      });
    }

    if (directUpload && typeof directUpload.resolvers?.owner !== 'function') {
      throw getError({
        message: `[${name}] directUpload needs resolvers.owner | a token is signed for one owner, and the commit refuses any other`,
      });
    }

    if (directUpload && directUpload.authorize === undefined) {
      if (!StaticAssetEntryUtility.isGuarded({ auth })) {
        throw getError({
          message: `[${name}] directUpload needs authorize or auth | a route that hands out a write credential has no safe default for who may call it`,
        });
      }
    }

    const scope =
      entry.keyPrefix === undefined
        ? undefined
        : StaticAssetKeyScopeUtility.normalizePrefix({
            keyPrefix: entry.keyPrefix,
            helper,
            scope: name,
          });
    const serverUpload = StaticAssetToggleUtility.isUsed(entry.serverUpload)
      ? entry.serverUpload
      : undefined;
    const maxFolderDepth = entry.maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;
    const basePath = StaticAssetObjectLinkUtility.normalizeBasePath({ basePath: entry.basePath });
    const rawObjectPath = entry.rawObjectPath ?? false;

    const routes: IStaticAssetResolvedEntry<Schema>['routes'] = {};

    for (const routeKey of StaticAssetRouteKeys.ALL) {
      const toggle = entry.routes?.[routeKey];

      if (toggle) {
        routes[routeKey] = {
          isEnabled: StaticAssetToggleUtility.isUsed(toggle),
          override: StaticAssetToggleUtility.pick(toggle) ?? {},
        };
      }
    }

    const metaLink = StaticAssetToggleUtility.isUsed(entry.metaLink) ? entry.metaLink : undefined;
    const validation =
      directUpload && StaticAssetToggleUtility.isUsed(directUpload.validation)
        ? directUpload.validation
        : undefined;

    return {
      name,
      basePath,
      rawObjectPath,
      bucket,
      keyPrefix: scope?.keyPrefix,
      maxFolderDepth,
      // `maxFolderDepth` counts the caller's folders; the scope's own are configuration, not input.
      objectKeyMaxDepth: maxFolderDepth + (scope?.depth ?? 0),
      auth: auth && {
        authenticate: auth.authenticate,
        authorize: auth.authorize,
        isPublicRead: StaticAssetToggleUtility.isUsed(auth.publicRead),
      },
      routes,
      helper,
      storage: storageType,
      link:
        entry.link ??
        ((location) =>
          StaticAssetObjectLinkUtility.build({
            basePath,
            bucket: location.bucket,
            object: location.object,
            rawObjectPath,
          })),
      serverUpload: serverUpload && {
        maxBytes: serverUpload.maxBytes,
        maxFiles: serverUpload.maxFiles ?? StaticAssetDefaults.MAX_UPLOAD_FILES,
        objectKey: serverUpload.objectKey,
      },
      directUpload: directUpload && {
        ...directUpload,
        validation,
        authorize: directUpload.authorize ?? (() => true),
      },
      metaLink,
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
    const { keyPrefix, directUpload } = resolved;

    if (!directUpload || keyPrefix === undefined) {
      return undefined;
    }

    return {
      policyService: new StaticAssetUploadPolicyService({
        scope: resolved.name,
        helper: resolved.helper,
        bucket: resolved.bucket,
        keyPrefix,
        directUpload,
      }),
      commitService: new StaticAssetUploadCommitService<Schema>({
        scope: resolved.name,
        helper: resolved.helper,
        bucket: resolved.bucket,
        keyPrefix,
        objectKeyMaxDepth: resolved.objectKeyMaxDepth,
        directUpload,
        storage: resolved.storage,
        metaLink: resolved.metaLink,
        link: resolved.link,
      }),
    };
  }
}
