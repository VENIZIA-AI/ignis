import { MinioHelper } from '@venizia/ignis-helpers';

export type TStaticAssetsOptions = {
  staticAsset?: { enable: false } | { enable: true; resourceBasePath: string };
  minioAsset?: { enable: false } | { enable: true; minioHelper: MinioHelper };
};
