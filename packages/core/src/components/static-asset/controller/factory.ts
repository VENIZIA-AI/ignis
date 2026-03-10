import {
  BaseHelper,
  createContentDispositionHeader,
  getError,
  HTTP,
  IStorageHelper,
  IUploadFile,
  IUploadResult,
  parseMultipartBody,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import {
  TStaticAssetExtraOptions,
  TStaticAssetStorageType,
  TMetaLinkConfig,
  WHITELIST_HEADERS,
  TStaticAssetsComponentOptions,
  TBucketParams,
  TObjectParams,
  TUploadQuery,
  TListQuery,
} from '../common';
import { StaticAssetDefinitions } from './base.definition';
import { BaseController } from '@/base/controllers';
import { controller as controllerDecorator } from '@/base/metadata';

export interface IAssetControllerOptions {
  controller: TStaticAssetsComponentOptions[string]['controller'];
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  useMetaLink?: boolean;
  metaLink?: TMetaLinkConfig;
  options?: TStaticAssetExtraOptions;
}

export class AssetControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: AssetControllerFactory.name });
  }

  static defineAssetController(opts: IAssetControllerOptions) {
    const { controller, helper, options, useMetaLink, metaLink, storage } = opts;
    const { name, basePath, routes, isStrict = true } = controller;

    @controllerDecorator({ path: basePath })
    class _controller extends BaseController {
      constructor() {
        super({
          scope: name,
          path: basePath,
          isStrict,
        });
      }

      override binding(): ValueOrPromise<void> {
        this.bindRoute({
          configs: { ...StaticAssetDefinitions.GET_BUCKETS, ...routes?.getBuckets },
        }).to({
          handler: async ctx => {
            const bucket = await helper.getBuckets();
            return ctx.json(bucket, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        this.bindRoute({
          configs: { ...StaticAssetDefinitions.GET_BUCKET_BY_NAME, ...routes?.getBucketByName },
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid<TBucketParams>('param');

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

        this.bindRoute({
          configs: { ...StaticAssetDefinitions.GET_OBJECT_BY_NAME, ...routes?.getObjectByName },
        }).to({
          handler: async ctx => {
            const { bucketName, objectName } = ctx.req.valid<TObjectParams>('param');

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

            const fileStat = await helper.getStat({ bucket: bucketName, name: objectName });
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

            const stream = await helper.getFile({ bucket: bucketName, name: objectName });
            return new Response(stream, {
              headers: ctx.res.headers,
              status: HTTP.ResultCodes.RS_2.Ok,
            });
          },
        });

        this.bindRoute({
          configs: {
            ...StaticAssetDefinitions.DOWNLOAD_OBJECT_BY_NAME,
            ...routes?.downloadObjectByName,
          },
        }).to({
          handler: async ctx => {
            const { bucketName, objectName } = ctx.req.valid<TObjectParams>('param');
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

            const fileStat = await helper.getStat({ bucket: bucketName, name: objectName });
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

            const stream = await helper.getFile({ bucket: bucketName, name: objectName });
            return new Response(stream, {
              headers: ctx.res.headers,
              status: HTTP.ResultCodes.RS_2.Ok,
            });
          },
        });

        this.bindRoute({
          configs: { ...StaticAssetDefinitions.CREATE_BUCKET, ...routes?.createBucket },
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid<TBucketParams>('param');

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

        this.bindRoute({
          configs: { ...StaticAssetDefinitions.UPLOAD, ...routes?.upload },
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid<TBucketParams>('param');
            const query = ctx.req.valid<TUploadQuery>('query');

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const filesArray = await parseMultipartBody({
              context: ctx,
              storage: options?.parseMultipartBody?.storage,
              uploadDir: options?.parseMultipartBody?.uploadDir,
            });

            const modifiedFiles: IUploadFile[] = filesArray.map(file => {
              return {
                originalName: file.originalname,
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

            if (!useMetaLink || !metaLink) {
              return ctx.json(uploaded, HTTP.ResultCodes.RS_2.Ok);
            }

            const results: IUploadResult[] = [];
            for (const uploadResult of uploaded) {
              try {
                const fileStat = await helper.getStat({
                  bucket: uploadResult.bucketName,
                  name: uploadResult.objectName,
                });

                const { data: createdMetaLink } = metaLink.createMetaLink
                  ? await metaLink.createMetaLink({
                      uploadResult,
                      fileStat,
                      query,
                    })
                  : await metaLink.repository.create({
                      data: {
                        bucketName: uploadResult.bucketName,
                        objectName: uploadResult.objectName,
                        link: uploadResult.link,
                        mimetype: fileStat.metadata?.['mimetype'],
                        size: fileStat.size,
                        etag: fileStat.etag,
                        metadata: fileStat.metadata,
                        storageType: storage,
                        isSynced: true,
                        principalId: query.principalId ? String(query.principalId) : undefined,
                        principalType: query.principalType
                          ? String(query.principalType)
                          : undefined,
                        variant: query.variant ? String(query.variant) : undefined,
                      },
                    });

                results.push({ ...uploadResult, metaLink: createdMetaLink });
              } catch (error) {
                this.logger
                  .for('UPLOAD')
                  .error('Failed to create MetaLink for %s: %j', uploadResult.objectName, error);
                results.push({
                  ...uploadResult,
                  metaLink: null,
                  metaLinkError: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            }
            return ctx.json(results, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        this.bindRoute({
          configs: { ...StaticAssetDefinitions.DELETE_BUCKET, ...routes?.deleteBucket },
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid<TBucketParams>('param');

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

        this.bindRoute({
          configs: { ...StaticAssetDefinitions.DELETE_OBJECT, ...routes?.deleteObject },
        }).to({
          handler: async ctx => {
            const { bucketName, objectName } = ctx.req.valid<TObjectParams>('param');

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

            // Delete from storage
            await helper.removeObject({ bucket: bucketName, name: objectName });

            if (!useMetaLink || !metaLink) {
              return ctx.json({ success: true }, HTTP.ResultCodes.RS_2.Ok);
            }

            metaLink.repository
              .deleteAll({
                where: {
                  bucketName,
                  objectName,
                },
              })
              .then(() => {
                this.logger
                  .for('DELETE_OBJECT')
                  .info('Successfully to delete MetaLink for %s/%s', bucketName, objectName);
              })
              .catch(error => {
                this.logger
                  .for('DELETE_OBJECT')
                  .error('Failed to delete MetaLink for %s/%s: %o', bucketName, objectName, error);
              });

            return ctx.json({ success: true }, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        this.bindRoute({
          configs: { ...StaticAssetDefinitions.LIST_OBJECTS, ...routes?.listObjects },
        }).to({
          handler: async ctx => {
            const { bucketName } = ctx.req.valid<TBucketParams>('param');
            const { prefix, recursive, maxKeys } = ctx.req.valid<TListQuery>('query');

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const objects = await helper.listObjects({
              bucket: bucketName,
              prefix,
              useRecursive: recursive === 'true',
              maxKeys: maxKeys ? parseInt(maxKeys, 10) : undefined,
            });

            return ctx.json(objects, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        if (useMetaLink && metaLink) {
          this.bindRoute({
            configs: { ...StaticAssetDefinitions.RECREATE_METALINK, ...routes?.recreateMetaLink },
          }).to({
            handler: async ctx => {
              const { bucketName, objectName } = ctx.req.valid<TObjectParams>('param');

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

              // Get file stat from storage
              const fileStat = await helper.getStat({
                bucket: bucketName,
                name: objectName,
              });

              // Generate link
              const link = options?.normalizeLinkFn
                ? options.normalizeLinkFn({ bucketName, normalizeName: objectName })
                : `/${basePath}/buckets/${bucketName}/objects/${encodeURIComponent(objectName)}`;

              // Check if MetaLink already exists
              const existing = await metaLink.repository.findOne({
                filter: {
                  where: {
                    bucketName,
                    objectName,
                  },
                },
              });

              if (existing) {
                // Update existing MetaLink
                await metaLink.repository.updateById({
                  id: existing.id,
                  data: {
                    link,
                    mimetype: fileStat.metadata?.['mimetype'],
                    size: fileStat.size,
                    etag: fileStat.etag,
                    metadata: fileStat.metadata,
                    storageType: storage,
                    isSynced: true,
                  },
                });
                const updatedMetaLink = await metaLink.repository.findById({ id: existing.id });
                return ctx.json(
                  { success: true, metaLink: updatedMetaLink },
                  HTTP.ResultCodes.RS_2.Ok,
                );
              } else {
                // Create new MetaLink
                const createdMetaLink = await metaLink.repository.create({
                  data: {
                    bucketName,
                    objectName,
                    link,
                    mimetype: fileStat.metadata?.['mimetype'],
                    size: fileStat.size,
                    etag: fileStat.etag,
                    metadata: fileStat.metadata,
                    storageType: storage,
                    isSynced: true,
                  },
                });
                return ctx.json(
                  { success: true, metaLink: createdMetaLink.data },
                  HTTP.ResultCodes.RS_2.Ok,
                );
              }
            },
          });
        }
      }
    }

    // Set the class name dynamically
    Object.defineProperty(_controller, 'name', { value: name, configurable: true });
    return _controller;
  }
}
