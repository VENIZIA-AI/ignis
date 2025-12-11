import { BaseApplication } from "@/base/applications";
import { BaseController } from "@/base/controllers";
import { controller, inject } from "@/base/metadata";
import { CoreBindings } from "@/common";
import {
  createContentDispositionHeader,
  HTTP,
  IUploadFile,
  MinioHelper,
  parseMultipartBody,
  ValueOrPromise,
} from "@venizia/ignis-helpers";
import { StaticAssetBindingKeys, TMinioAssetOptions } from "./common";
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
        const whiteListHeaders = [
          "content-type",
          "content-encoding",
          "cache-control",
          "etag",
          "last-modified",
        ];
        Object.entries(metaData).forEach(([key, value]) => {
          if (!whiteListHeaders.includes(key.toLowerCase())) {
            return;
          }
          ctx.header(key.toLowerCase(), String(value).replace(/[\r\n]/g, ""));
        });
        ctx.header("content-length", size.toString());
        ctx.header("content-type", "application/octet-stream");
        ctx.header("x-content-type-options", "nosniff");

        const minioStream = await minioInstance.getFile({
          bucket: bucketName,
          name: objectName,
        });
        return new Response(minioStream, {
          headers: ctx.res.headers,
          status: HTTP.ResultCodes.RS_2.Ok,
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

        const whiteListHeaders = [
          "content-type",
          "content-encoding",
          "cache-control",
          "etag",
          "last-modified",
        ];
        Object.entries(metaData).forEach(([key, value]) => {
          if (!whiteListHeaders.includes(key.toLowerCase())) {
            return;
          }
          ctx.header(key.toLowerCase(), String(value).replace(/[\r\n]/g, ""));
        });
        ctx.header("content-length", size.toString());
        ctx.header("content-disposition", createContentDispositionHeader(objectName));
        ctx.header("x-content-type-options", "nosniff");

        const minioStream = await minioInstance.getFile({
          bucket: bucketName,
          name: objectName,
        });
        return new Response(minioStream, {
          headers: ctx.res.headers,
          status: HTTP.ResultCodes.RS_2.Ok,
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
        const minioAssetOptions = this.application.get<TMinioAssetOptions>({
          key: StaticAssetBindingKeys.MINIO_ASSET_OPTIONS,
        });

        const filesArray = await parseMultipartBody({
          context: ctx,
          storage: minioAssetOptions?.parseMultipartBody?.storage,
          uploadDir: minioAssetOptions?.parseMultipartBody?.uploadDir,
        });

        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetBindingKeys.MINIO_HELPER_INSTANCE,
        });

        const modifiedFiles: IUploadFile[] = filesArray.map(file => {
          return {
            originalname: folderPath ? `${folderPath}/${file.originalname}` : file.originalname,
            mimetype: file.mimetype,
            buffer: file.buffer ?? Buffer.alloc(0),
            size: file.size,
            encoding: file.encoding,
          };
        });
        const uploaded = await minioInstance.upload({
          bucket: bucketName,
          files: modifiedFiles,
          normalizeLinkFn: opts => {
            return `/static-assets/buckets/${opts.bucketName}/objects/${encodeURIComponent(opts.normalizeName)}`;
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
