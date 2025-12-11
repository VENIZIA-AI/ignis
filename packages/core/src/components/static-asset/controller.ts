import { BaseApplication } from "@/base/applications";
import { BaseController } from "@/base/controllers";
import { controller, inject } from "@/base/metadata";
import { CoreBindings } from "@/common";
import {
  createContentDispositionHeader,
  dayjs,
  HTTP,
  IUploadFile,
  MinioHelper,
  parseMultipartBody,
  ValueOrPromise,
} from "@venizia/ignis-helpers";
import isEmpty from "lodash/isEmpty";
import fs from "node:fs";
import path from "node:path";
import { StaticAssetComponentBindingKeys, TMinioAssetOptions } from "./common";
import { MinIOAssetDefinitions, StaticResourceDefinitions } from "./definition";

// ================================================================================
@controller({ path: "/static-resources" })
export class StaticResourceController extends BaseController {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      path: "/static-resources",
      scope: StaticResourceController.name,
      isStrict: true,
    });
  }

  override binding(): ValueOrPromise<void> {
    // ----------------------------------------
    this.bindRoute({
      configs: StaticResourceDefinitions.UPLOAD,
    }).to({
      handler: async ctx => {
        const basePath = this.application.get<string>({
          key: StaticAssetComponentBindingKeys.RESOURCE_BASE_PATH,
        });
        const staticResourceOptions = this.application.get<TMinioAssetOptions>({
          key: StaticAssetComponentBindingKeys.STATIC_RESOURCE_OPTIONS,
        });
        const filesArray = await parseMultipartBody({
          context: ctx,
          storage: staticResourceOptions?.parseMultipartBody?.storage,
          uploadDir: staticResourceOptions?.parseMultipartBody?.uploadDir,
        });

        if (!fs.existsSync(basePath)) {
          fs.mkdirSync(basePath, { recursive: true });
        }

        const uploaded = await Promise.all(
          filesArray.map(file => {
            const { originalname: originalName, buffer, size } = file;

            if (!originalName || isEmpty(originalName)) {
              return;
            }

            if (!size) {
              return;
            }

            const normalizeName = originalName.toLowerCase().replace(/ /g, "_");
            return new Promise<{ objectName: string }>((resolve, reject) => {
              try {
                const savedName = `${dayjs().format("YYYYMMDDHHmmss")}_${normalizeName}`;
                const filePath = path.join(basePath, savedName);
                fs.writeFileSync(filePath, buffer ?? Buffer.alloc(0));
                resolve({ objectName: savedName });
              } catch (e) {
                reject(e);
              }
            });
          }),
        );

        return ctx.json(
          uploaded.filter(u => !!u),
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // // ----------------------------------------
    this.bindRoute({
      configs: StaticResourceDefinitions.DOWNLOAD,
    }).to({
      handler: async ctx => {
        const { objectName } = ctx.req.valid("param");
        const basePath = this.application.get<string>({
          key: StaticAssetComponentBindingKeys.RESOURCE_BASE_PATH,
        });
        const savedPath = path.join(basePath, objectName);

        const fileStat = fs.statSync(savedPath);
        const { size } = fileStat;
        ctx.header("content-type", "application/octet-stream");
        ctx.header("content-length", size.toString());
        ctx.header("content-disposition", createContentDispositionHeader(objectName));
        ctx.header("x-content-type-options", "nosniff");
        const fileStream = fs.createReadStream(savedPath);
        return new Response(fileStream, {
          headers: ctx.res.headers,
          status: HTTP.ResultCodes.RS_2.Ok,
        });
      },
    });
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
      configs: MinIOAssetDefinitions.GET_BUCKETS,
    }).to({
      handler: async ctx => {
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });
        const bucket = await minioInstance.getBuckets();
        return ctx.json(bucket, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MinIOAssetDefinitions.GET_BUCKET_BY_NAME,
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid("param");
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });
        const bucket = await minioInstance.getBucket({ name: bucketName });
        return ctx.json(bucket, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MinIOAssetDefinitions.GET_OBJECT_BY_NAME,
    }).to({
      handler: async ctx => {
        const { bucketName, objectName } = ctx.req.valid("param");

        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
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
          ctx.header("content-type", "application/octet-stream");
        ctx.header("content-length", size.toString());
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
      configs: MinIOAssetDefinitions.DOWNLOAD_OBJECT_BY_NAME,
    }).to({
      handler: async ctx => {
        const { bucketName, objectName } = ctx.req.valid("param");

        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
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
        ctx.header("content-type", "application/octet-stream");
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
      configs: MinIOAssetDefinitions.CREATE_BUCKET,
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid("param");
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });
        const createdBucket = await minioInstance.createBucket({ name: bucketName });
        return ctx.json(createdBucket, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MinIOAssetDefinitions.UPLOAD,
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid("param");
        const { folderPath } = ctx.req.valid("query");
        const minioAssetOptions = this.application.get<TMinioAssetOptions>({
          key: StaticAssetComponentBindingKeys.MINIO_ASSET_OPTIONS,
        });
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });

        const filesArray = await parseMultipartBody({
          context: ctx,
          storage: minioAssetOptions?.parseMultipartBody?.storage,
          uploadDir: minioAssetOptions?.parseMultipartBody?.uploadDir,
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
      configs: MinIOAssetDefinitions.DELETE_BUCKET,
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid("param");
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });
        const isRemovedBucket = await minioInstance.removeBucket({ name: bucketName });
        return ctx.json({ isDeleted: isRemovedBucket }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
