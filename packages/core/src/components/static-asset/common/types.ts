import type { IAuthRouteConfig } from '@/base';
import type { BaseRelationalEntity } from '@/connectors/postgres/models';
import type { DefaultCRUDRepository } from '@/connectors/postgres/repositories';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { DiskHelper, IFileStat, IUploadResult } from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { MinioHelper } from '@venizia/ignis-helpers/minio';
import type { TMetaLinkSchema } from '../models';
import type { StaticAssetStorageTypes } from './constants';

export type TStaticAssetExtraOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };

  /** `folderPath` carries the upload query's target folder - dropping it flattens nested uploads. */
  normalizeNameFn?: (opts: { originalName: string; folderPath?: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;

  /** Maximum folder nesting depth allowed in object paths. Default: 2 */
  maxFolderDepth?: number;
  [key: string]: AnyType;
};

// Declared by hand rather than inferred: RouteHandler inference here is heavy.
export type TBucketParams = { bucketName: string };
export type TObjectParams = { bucketName: string; objectName: string };
export type TUploadQuery = {
  principalType?: string;
  principalId?: string;
  variant?: string;
  folderPath?: string;
};
export type TListQuery = { prefix?: string; recursive?: string; maxKeys?: string };

export type TMetaLinkConfig<Schema extends TMetaLinkSchema = TMetaLinkSchema> = {
  model: typeof BaseRelationalEntity<Schema>;
  repository: DefaultCRUDRepository<Schema>;
  createMetaLink?: (opts: {
    uploadResult: IUploadResult;
    fileStat: IFileStat;
    query: TUploadQuery;
  }) => ValueOrPromise<{ count: number; data: Schema }>;
};

export type TStaticAssetsComponentOptions = {
  [key: string]: {
    controller: {
      name: string;
      basePath: string;
      isStrict?: boolean;
      routes?: {
        getBuckets?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        getBucketByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        createBucket?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        deleteBucket?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;

        upload?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        listObjects?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        deleteObject?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        getObjectByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
        downloadObjectByName?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;

        recreateMetaLink?: Partial<Omit<IAuthRouteConfig, 'method' | 'request' | 'responses'>>;
      };
    };
    extra?: TStaticAssetExtraOptions;
  } & (
    | { storage: typeof StaticAssetStorageTypes.BUN_S3; helper: BunS3Helper }
    | { storage: typeof StaticAssetStorageTypes.DISK; helper: DiskHelper }
    | { storage: typeof StaticAssetStorageTypes.MINIO; helper: MinioHelper }
  ) &
    ({ useMetaLink?: false | undefined } | { useMetaLink: true; metaLink: TMetaLinkConfig });
};
