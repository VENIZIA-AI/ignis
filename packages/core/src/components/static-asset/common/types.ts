import { AnyType, MinioHelper } from "@venizia/ignis-helpers";

export type TStaticAssetsOptions = {
  staticAsset?: { enable: false } | { enable: true; resourceBasePath: string };
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
    storage?: "memory" | "disk";
    uploadDir?: string;
  };
  [key: string]: AnyType;
};
