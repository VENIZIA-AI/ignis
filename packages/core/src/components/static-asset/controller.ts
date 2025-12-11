import { BaseApplication } from "@/base/applications";
import { BaseController } from "@/base/controllers";
import { controller, inject } from "@/base/metadata";
import { CoreBindings } from "@/common";
import { HTTP, IUploadFile, MinioHelper, ValueOrPromise } from "@venizia/ignis-helpers";
import { stream } from "hono/streaming";
import { Readable } from "stream";
import { StaticAssetBindingKeys } from "./common";
import { MINIO_ASSET_ROUTES } from "./definition";

// ================================================================================
export class StaticAssetController extends BaseController {
  override binding(): ValueOrPromise<void> {
    throw new Error("Method not implemented.");
  }
}

// ================================================================================
@controller({ path: "/static-assets" })
export class MinioAssetController extends BaseController {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      path: "/static-assets",
      scope: MinioAssetController.name,
      isStrict: true,
    });
  }

  override binding(): ValueOrPromise<void> {
    // ----------------------------------------
    this.bindRoute({
      configs: MINIO_ASSET_ROUTES["GET /buckets"],
    }).to({
      handler: async ctx => {
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        });
        const bucket = await minioInstance.getBuckets();
        return ctx.json(bucket, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MINIO_ASSET_ROUTES["GET /buckets/:bucketName"],
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid("param");
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        });
        const bucket = await minioInstance.getBucket({ name: bucketName });
        return ctx.json(bucket, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MINIO_ASSET_ROUTES["GET /buckets/:bucketName/objects/:objectName"],
    }).to({
      handler: async ctx => {
        const { bucketName, objectName } = ctx.req.valid("param");

        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        });

        const fileStat = await minioInstance.getStat({ bucket: bucketName, name: objectName });
        const { size, metaData } = fileStat;

        Object.entries(metaData).forEach(([key, value]) => {
          ctx.header(key, value);
        });
        ctx.header("Content-Length", size.toString());
        ctx.header("Content-Type", "application/octet-stream");

        const minioStream = await minioInstance.getFile({
          bucket: bucketName,
          name: objectName,
        });

        return stream(ctx, async streamHelper => {
          await streamHelper.pipe(Readable.toWeb(minioStream));
        });
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MINIO_ASSET_ROUTES["GET /buckets/:bucketName/objects/:objectName/download"],
    }).to({
      handler: async ctx => {
        const { bucketName, objectName } = ctx.req.valid("param");

        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        });

        const fileStat = await minioInstance.getStat({ bucket: bucketName, name: objectName });
        const { size, metaData } = fileStat;

        Object.entries(metaData).forEach(([key, value]) => {
          ctx.header(key, value);
        });
        ctx.header("Content-Length", size.toString());
        ctx.header("Content-Disposition", `attachment; filename="${objectName}"`);

        const minioStream = await minioInstance.getFile({
          bucket: bucketName,
          name: objectName,
        });

        return stream(ctx, async streamHelper => {
          await streamHelper.pipe(Readable.toWeb(minioStream));
        });
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MINIO_ASSET_ROUTES["POST /buckets/:bucketName"],
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid("param");
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        });
        const createdBucket = await minioInstance.createBucket({ name: bucketName });
        return ctx.json(createdBucket, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MINIO_ASSET_ROUTES["POST /buckets/:bucketName/upload"],
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid("param");
        const { folderPath } = ctx.req.valid("query");
        const { files } = ctx.req.valid("form");
        const filesArray = Array.isArray(files) ? files : [files];

        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        });

        const modifiedFiles: IUploadFile[] = await Promise.all(
          filesArray.map(file => {
            return new Promise<IUploadFile>(resolve => {
              file.arrayBuffer().then(buffer => {
                resolve({
                  originalname: folderPath ? `${folderPath}/${file.name}` : file.name,
                  mimetype: file.type,
                  buffer: Buffer.from(buffer),
                  size: file.size,
                });
              });
            });
          }),
        );
        const uploaded = await minioInstance.upload({
          bucket: bucketName,
          files: modifiedFiles,
          normalizeLinkFn: ({ bucketName, normalizeName }) => {
            return `/static-assets/buckets/${bucketName}/objects/${encodeURIComponent(normalizeName)}`;
          },
        });

        return ctx.json(
          uploaded.map(item => {
            return {
              objectName: item.fileName,
              bucketName: item.bucket,
              link: item.link,
            };
          }),
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MINIO_ASSET_ROUTES["DELETE /buckets/:bucketName"],
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid("param");
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        });
        const isRemovedBucket = await minioInstance.removeBucket({ name: bucketName });
        return ctx.json({ isDeleted: isRemovedBucket }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
