import {
  BaseHelper,
  createContentDispositionHeader,
  getError,
  HTTP,
  IStorageHelper,
  IUploadFile,
  parseMultipartBody,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import { TStaticAssetExtraOptions, TStaticAssetStorageType, WHITELIST_HEADERS } from '../common';
import { StaticAssetDefinitions } from './base.definition';
import { BaseController } from '@/base/controllers';
import { controller as controllerDecorator } from '@/base/metadata';
import { set } from 'lodash';

export interface IAssetControllerOptions {
  controller: {
    name: string;
    basePath: string;
    isStrict?: boolean;
  };
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  options?: TStaticAssetExtraOptions;
}

export class AssetControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: AssetControllerFactory.name });
  }

  static defineAssetController(opts: IAssetControllerOptions) {
    const { controller, helper, options } = opts;
    const { name, basePath, isStrict = true } = controller;

    @controllerDecorator({ path: basePath })
    class _Controller extends BaseController {
      constructor() {
        super({
          scope: name,
          path: basePath,
          isStrict,
        });
      }

      override binding(): ValueOrPromise<void> {
        // ----------------------------------------
        this.bindRoute({
          configs: StaticAssetDefinitions.GET_BUCKETS,
        }).to({
          handler: async ctx => {
            const bucket = await helper.getBuckets();
            return ctx.json(bucket, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // ----------------------------------------
        this.bindRoute({
          configs: StaticAssetDefinitions.GET_BUCKET_BY_NAME,
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid('param');

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const bucket = await helper.getBucket({ name: bucketName });
            return ctx.json(bucket, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // ----------------------------------------
        this.bindRoute({
          configs: StaticAssetDefinitions.GET_OBJECT_BY_NAME,
        }).to({
          handler: async ctx => {
            const { bucketName, objectName } = ctx.req.valid('param');

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }
            if (!helper.isValidName(objectName)) {
              throw getError({
                message: 'Invalid object name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const fileStat = await helper.getStat({
              bucket: bucketName,
              name: objectName,
            });
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

            const minioStream = await helper.getFile({
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
          configs: StaticAssetDefinitions.DOWNLOAD_OBJECT_BY_NAME,
        }).to({
          handler: async ctx => {
            const { bucketName, objectName } = ctx.req.valid('param');
            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }
            if (!helper.isValidName(objectName)) {
              throw getError({
                message: 'Invalid object name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const fileStat = await helper.getStat({
              bucket: bucketName,
              name: objectName,
            });
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

            const stream = await helper.getFile({
              bucket: bucketName,
              name: objectName,
            });
            return new Response(stream, {
              headers: ctx.res.headers,
              status: HTTP.ResultCodes.RS_2.Ok,
            });
          },
        });

        // ----------------------------------------
        this.bindRoute({
          configs: StaticAssetDefinitions.CREATE_BUCKET,
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid('param');

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const createdBucket = await helper.createBucket({ name: bucketName });
            return ctx.json(createdBucket, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // ----------------------------------------
        this.bindRoute({
          configs: StaticAssetDefinitions.UPLOAD,
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid('param');
            const { folderPath } = ctx.req.valid('query');

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            if (folderPath && !helper.isValidName(folderPath)) {
              throw getError({
                message: 'Invalid folder path',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const filesArray = await parseMultipartBody({
              context: ctx,
              storage: options?.parseMultipartBody?.storage,
              uploadDir: options?.parseMultipartBody?.uploadDir,
            });

            // Validate all files before processing
            for (const file of filesArray) {
              const { originalname: originalName, size } = file;
              if (!helper.isValidName(originalName)) {
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

            const modifiedFiles: IUploadFile[] = filesArray.map(file => {
              return {
                originalname: folderPath ? `${folderPath}/${file.originalname}` : file.originalname,
                mimetype: file.mimetype,
                buffer: file.buffer ?? Buffer.alloc(0),
                size: file.size,
                encoding: file.encoding,
              };
            });

            const uploaded = await helper.upload({
              bucket: bucketName,
              files: modifiedFiles,
              normalizeNameFn: options?.normalizeNameFn,
              normalizeLinkFn: options?.normalizeLinkFn,
            });

            return ctx.json(uploaded, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // ----------------------------------------
        this.bindRoute({
          configs: StaticAssetDefinitions.DELETE_BUCKET,
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid('param');

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const isRemovedBucket = await helper.removeBucket({
              name: bucketName,
            });
            return ctx.json({ isDeleted: isRemovedBucket }, HTTP.ResultCodes.RS_2.Ok);
          },
        });
      }
    }

    set(_Controller, 'name', name);
    console.log('name', _Controller.name);
    console.log('prototype', _Controller.prototype);
    return _Controller;
  }
}
