import { AnyType, DiskHelper, MinioHelper } from '@venizia/ignis-helpers';
import { StaticAssetStorageTypes } from './constants';

export type TStaticAssetExtraOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };
  normalizeNameFn?: (opts: { originalName: string }) => string;
  normalizeLinkFn?: (opts: { bucketName: string; normalizeName: string }) => string;
  [key: string]: AnyType;
};

export type TStaticAssetsComponentOptions = {
  [key: string]: {
    controller: {
      name: string;
      basePath: string;
      isStrict?: boolean;
    };
    extra?: TStaticAssetExtraOptions;
  } & (
    | { storage: typeof StaticAssetStorageTypes.DISK; helper: DiskHelper }
    | { storage: typeof StaticAssetStorageTypes.MINIO; helper: MinioHelper }
  );
};
