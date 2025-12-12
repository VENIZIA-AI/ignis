import { BaseApplication } from '@/base/applications';
import { BaseController } from '@/base/controllers';
import { controller, inject } from '@/base/metadata';
import { CoreBindings } from '@/common';
import {
  createContentDispositionHeader,
  dayjs,
  HTTP,
  IUploadFile,
  MinioHelper,
  parseMultipartBody,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import fs from 'node:fs';
import path from 'node:path';
import {
  StaticAssetComponentBindingKeys,
  TMinioAssetOptions,
  TStaticResourceOptions,
} from './common';
import { MinIOAssetDefinitions, StaticResourceDefinitions } from './definition';
import { getError } from '@venizia/ignis-inversion';

// ================================================================================
const WHITELIST_HEADERS = [
  HTTP.Headers.CONTENT_TYPE,
  HTTP.Headers.CONTENT_ENCODING,
  HTTP.Headers.CACHE_CONTROL,
  HTTP.Headers.ETAG,
  HTTP.Headers.LAST_MODIFIED,
] as const;

// ================================================================================
@controller({ path: '/static-resources' })
export class StaticResourceController extends BaseController {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      path: '/static-resources',
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
        const staticResourceOptions = this.application.get<TStaticResourceOptions>({
          key: StaticAssetComponentBindingKeys.STATIC_RESOURCE_OPTIONS,
        });
        const filesArray = await parseMultipartBody({
          context: ctx,
          storage: staticResourceOptions?.parseMultipartBody?.storage,
          uploadDir: staticResourceOptions?.parseMultipartBody?.uploadDir,
        });

        // Validate all files before processing
        for (const file of filesArray) {
          const { originalname: originalName, size } = file;
          if (!originalName || isEmpty(originalName)) {
            throw getError({
              message: `Invalid filename`,
              statusCode: HTTP.ResultCodes.RS_4.BadRequest,
            });
          }
          if (!size) {
            throw getError({
              message: `File is empty`,
              statusCode: HTTP.ResultCodes.RS_4.BadRequest,
            });
          }
        }

        if (!fs.existsSync(basePath)) {
          fs.mkdirSync(basePath, { recursive: true });
        }

        const uploaded = await Promise.all(
          filesArray.map(file => {
            return new Promise<{ objectName: string }>((resolve, reject) => {
              const { originalname: originalName, buffer } = file;
              const normalizedName = path.basename(originalName).toLowerCase().replace(/ /g, '_');
              const savedName = `${dayjs().format('YYYYMMDDHHmmss')}_${normalizedName}`;
              const filePath = path.join(basePath, savedName);

              fs.writeFile(filePath, buffer ?? Buffer.alloc(0), err => {
                if (err) {
                  reject(err);
                  return;
                }
                resolve({ objectName: savedName });
              });
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
        const { objectName } = ctx.req.valid('param');
        const basePath = this.application.get<string>({
          key: StaticAssetComponentBindingKeys.RESOURCE_BASE_PATH,
        });
        const savedPath = path.join(basePath, objectName);

        const resolvedBasePath = path.resolve(basePath);
        const resolvedSavedPath = path.resolve(savedPath);
        if (
          resolvedSavedPath === resolvedBasePath ||
          !resolvedSavedPath.startsWith(resolvedBasePath + path.sep)
        ) {
          // Path traversal detected, reject the request
          return ctx.json(
            { error: 'Invalid objectName | Path traversal detected' },
            HTTP.ResultCodes.RS_4.BadRequest,
          );
        }

        try {
          const fileStat = fs.statSync(savedPath);
          const { size } = fileStat;
          ctx.header(HTTP.Headers.CONTENT_TYPE, HTTP.HeaderValues.APPPLICATION_OCTET_STREAM);
          ctx.header(HTTP.Headers.CONTENT_LENGTH, size.toString());
          ctx.header(
            HTTP.Headers.CONTENT_DISPOSITION,
            createContentDispositionHeader({ filename: objectName, type: 'attachment' }),
          );
          ctx.header('x-content-type-options', 'nosniff');
          const fileStream = fs.createReadStream(savedPath);
          return new Response(fileStream, {
            headers: ctx.res.headers,
            status: HTTP.ResultCodes.RS_2.Ok,
          });
        } catch (_e) {
          return ctx.json({ message: `File not found` }, HTTP.ResultCodes.RS_4.NotFound);
        }
      },
    });
  }
}

// ================================================================================
@controller({ path: '/static-assets' })
export class MinioAssetController extends BaseController {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      path: '/static-assets',
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
        const { bucketName } = ctx.req.valid('param');
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });

        if (!minioInstance.isValidName(bucketName)) {
          throw getError({
            message: 'Invalid bucket name',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }

        const bucket = await minioInstance.getBucket({ name: bucketName });
        return ctx.json(bucket, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MinIOAssetDefinitions.GET_OBJECT_BY_NAME,
    }).to({
      handler: async ctx => {
        const { bucketName, objectName } = ctx.req.valid('param');

        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });

        if (!minioInstance.isValidName(bucketName)) {
          throw getError({
            message: 'Invalid bucket name',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }
        if (!minioInstance.isValidName(objectName)) {
          throw getError({
            message: 'Invalid object name',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }

        const fileStat = await minioInstance.getStat({ bucket: bucketName, name: objectName });
        const { size, metadata } = fileStat;
        Object.entries(metadata).forEach(([key, value]) => {
          if (
            !WHITELIST_HEADERS.includes(key.toLowerCase() as (typeof WHITELIST_HEADERS)[number])
          ) {
            return;
          }
          ctx.header(key.toLowerCase(), String(value).replace(/[\r\n]/g, ''));
        });
        if (!ctx.res.headers.has(HTTP.Headers.CONTENT_TYPE)) {
          ctx.header(HTTP.Headers.CONTENT_TYPE, HTTP.HeaderValues.APPPLICATION_OCTET_STREAM);
        }
        ctx.header(HTTP.Headers.CONTENT_LENGTH, size.toString());
        ctx.header('x-content-type-options', 'nosniff');

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
        const { bucketName, objectName } = ctx.req.valid('param');

        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });

        if (!minioInstance.isValidName(bucketName)) {
          throw getError({
            message: 'Invalid bucket name',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }
        if (!minioInstance.isValidName(objectName)) {
          throw getError({
            message: 'Invalid object name',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }

        const fileStat = await minioInstance.getStat({ bucket: bucketName, name: objectName });
        const { size, metadata } = fileStat;

        Object.entries(metadata).forEach(([key, value]) => {
          if (
            !WHITELIST_HEADERS.includes(key.toLowerCase() as (typeof WHITELIST_HEADERS)[number])
          ) {
            return;
          }
          ctx.header(key.toLowerCase(), String(value).replace(/[\r\n]/g, ''));
        });
        if (!ctx.res.headers.has(HTTP.Headers.CONTENT_TYPE)) {
          ctx.header(HTTP.Headers.CONTENT_TYPE, HTTP.HeaderValues.APPPLICATION_OCTET_STREAM);
        }
        ctx.header(HTTP.Headers.CONTENT_LENGTH, size.toString());
        ctx.header(
          HTTP.Headers.CONTENT_DISPOSITION,
          createContentDispositionHeader({ filename: objectName, type: 'attachment' }),
        );
        ctx.header('x-content-type-options', 'nosniff');

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
        const { bucketName } = ctx.req.valid('param');
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });

        if (!minioInstance.isValidName(bucketName)) {
          throw getError({
            message: 'Invalid bucket name',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }

        const createdBucket = await minioInstance.createBucket({ name: bucketName });
        return ctx.json(createdBucket, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // ----------------------------------------
    this.bindRoute({
      configs: MinIOAssetDefinitions.UPLOAD,
    }).to({
      handler: async ctx => {
        const { bucketName } = ctx.req.valid('param');
        const { folderPath } = ctx.req.valid('query');
        const minioAssetOptions = this.application.get<TMinioAssetOptions>({
          key: StaticAssetComponentBindingKeys.MINIO_ASSET_OPTIONS,
        });
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });

        if (!minioInstance.isValidName(bucketName)) {
          throw getError({
            message: 'Invalid bucket name',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }

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
        const { bucketName } = ctx.req.valid('param');
        const minioInstance = this.application.get<MinioHelper>({
          key: StaticAssetComponentBindingKeys.MINIO_HELPER_INSTANCE,
        });

        if (!minioInstance.isValidName(bucketName)) {
          throw getError({
            message: 'Invalid bucket name',
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          });
        }

        const isRemovedBucket = await minioInstance.removeBucket({ name: bucketName });
        return ctx.json({ isDeleted: isRemovedBucket }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
