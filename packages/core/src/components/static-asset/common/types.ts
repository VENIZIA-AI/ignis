import { AnyType, MinioHelper } from '@venizia/ignis-helpers';

export type TStaticAssetsComponentOptions = {
  staticResource?:
    | { enable: false }
    | { enable: true; resourceBasePath: string; options: TStaticResourceOptions };
  minioAsset?:
    | { enable: false }
    | {
        enable: true;
        minioHelper: MinioHelper;
        options: TMinioAssetOptions;
      };
};

export type TMinioAssetOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };
  [key: string]: AnyType;
};

export type TStaticResourceOptions = {
  parseMultipartBody?: {
    storage?: 'memory' | 'disk';
    uploadDir?: string;
  };
  [key: string]: AnyType;
};
