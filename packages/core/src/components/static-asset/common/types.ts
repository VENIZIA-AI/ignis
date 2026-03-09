import { BaseEntity } from '@/base/models';
import { DefaultCRUDRepository } from '@/base/repositories';
import { AnyType, DiskHelper } from '@venizia/ignis-helpers';
import type { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import type { MinioHelper } from '@venizia/ignis-helpers/minio';
import { TMetaLinkSchema } from '../models';
import { StaticAssetStorageTypes } from './constants';
import { IAuthRouteConfig } from '@/base';

export type TStaticAssetExtraOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };
  normalizeNameFn?: (opts: { originalName: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  [key: string]: AnyType;
};

export type TMetaLinkConfig<Schema extends TMetaLinkSchema = TMetaLinkSchema> = {
  model: typeof BaseEntity<Schema>;
  repository: DefaultCRUDRepository<Schema>;
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
