import { BaseRestController, TRouteContext } from '@/base/controllers';
import { controller as controllerDecorator } from '@/base/metadata';
import {
  BaseHelper,
  BaseStorageHelper,
  createContentDispositionHeader,
  getError,
  HTTP,
  IStorageHelper,
  IUploadFile,
  IUploadResult,
  parseMultipartBody,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import { Env } from 'hono';
import {
  TBucketParams,
  TListQuery,
  TMetaLinkConfig,
  TObjectParams,
  TStaticAssetExtraOptions,
  TStaticAssetsComponentOptions,
  TStaticAssetStorageType,
  TUploadQuery,
  WHITELIST_HEADERS,
} from '../common';
import { StaticAssetDefinitions } from './base.definition';

export interface IAssetControllerOptions {
  controller: TStaticAssetsComponentOptions[string]['controller'];
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  useMetaLink?: boolean;
  metaLink?: TMetaLinkConfig;
  options?: TStaticAssetExtraOptions;
}

/**
 * Safely decodes an object path captured by Hono's regex catch-all param.
 * Decodes each segment individually to avoid double-encoding issues.
 */
const decodeObjectPath: (rawPath: string) => string = rawPath => {
  try {
    return rawPath
      .split('/')
      .map(segment => decodeURIComponent(segment))
      .join('/');
  } catch (_error) {
    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: 'Invalid object path encoding',
    });
  }
};

/**
 * Encodes each segment of an object path for use in URLs.
 * Preserves `/` as folder separator while encoding individual segments.
 */
const encodeObjectPath: (objectPath: string) => string = objectPath => {
  return objectPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
};

/** Sets whitelisted metadata headers on the response context. */
const applyMetadataHeaders: (opts: {
  ctx: TRouteContext<Env>;
  metadata: Record<string, any>;
}) => void = ({ ctx, metadata }) => {
  Object.entries(metadata).forEach(([key, value]) => {
    if (!WHITELIST_HEADERS.includes(key.toLowerCase() as (typeof WHITELIST_HEADERS)[number])) {
      return;
    }
    ctx.header(key.toLowerCase(), String(value).replace(/[\r\n]/g, ''));
  });
};

export class AssetControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: AssetControllerFactory.name });
  }

  static defineAssetController(opts: IAssetControllerOptions) {
    const { controller, helper, options, useMetaLink, metaLink, storage } = opts;
    const { name, basePath, routes, isStrict = true } = controller;
    const maxFolderDepth = options?.maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;

    @controllerDecorator({ path: basePath })
    class _controller extends BaseRestController {
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
            const { bucketName, objectName: rawObjectName } = ctx.req.valid<TObjectParams>('param');
            const objectName = decodeObjectPath(rawObjectName);

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            if (!helper.isValidPath(objectName, { maxDepth: maxFolderDepth })) {
              throw getError({
                message: 'Invalid object name or path',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const fileStat = await helper.getStat({ bucket: bucketName, name: objectName });
            const { size, metadata } = fileStat;
            applyMetadataHeaders({ ctx, metadata });

            if (!ctx.res.headers.has(HTTP.Headers.CONTENT_TYPE)) {
              ctx.header(HTTP.Headers.CONTENT_TYPE, HTTP.HeaderValues.APPLICATION_OCTET_STREAM);
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
            const { bucketName, objectName: rawObjectName } = ctx.req.valid<TObjectParams>('param');
            const objectName = decodeObjectPath(rawObjectName);

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            if (!helper.isValidPath(objectName, { maxDepth: maxFolderDepth })) {
              throw getError({
                message: 'Invalid object name or path',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            const fileStat = await helper.getStat({ bucket: bucketName, name: objectName });
            const { size, metadata } = fileStat;
            applyMetadataHeaders({ ctx, metadata });

            if (!ctx.res.headers.has(HTTP.Headers.CONTENT_TYPE)) {
              ctx.header(HTTP.Headers.CONTENT_TYPE, HTTP.HeaderValues.APPLICATION_OCTET_STREAM);
            }
            ctx.header(HTTP.Headers.CONTENT_LENGTH, size.toString());

            // Use only the filename (last segment) for the Content-Disposition header
            const fileName = objectName.split('/').pop() ?? objectName;
            ctx.header(
              HTTP.Headers.CONTENT_DISPOSITION,
              createContentDispositionHeader({ filename: fileName, type: 'attachment' }),
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

            // Validate folderPath if provided
            const folderPath = query.folderPath;
            if (folderPath) {
              const normalizedFolder = folderPath.replace(/^\/+|\/+$/g, '');
              if (!normalizedFolder) {
                throw getError({
                  message: 'Invalid folder path',
                  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                });
              }
              // Validate folder segments (depth excludes filename, so use maxDepth directly)
              const folderSegments = normalizedFolder.split('/');
              if (folderSegments.length > maxFolderDepth) {
                throw getError({
                  message: `Folder path exceeds max depth of ${maxFolderDepth}`,
                  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                });
              }
              for (const segment of folderSegments) {
                if (!helper.isValidName(segment)) {
                  throw getError({
                    message: `Invalid folder path segment: ${segment}`,
                    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                  });
                }
              }
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
                folderPath: folderPath ?? undefined,
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
            const { bucketName, objectName: rawObjectName } = ctx.req.valid<TObjectParams>('param');
            const objectName = decodeObjectPath(rawObjectName);

            if (!helper.isValidName(bucketName)) {
              throw getError({
                message: 'Invalid bucket name',
                statusCode: HTTP.ResultCodes.RS_4.BadRequest,
              });
            }

            if (!helper.isValidPath(objectName, { maxDepth: maxFolderDepth })) {
              throw getError({
                message: 'Invalid object name or path',
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
              const { bucketName, objectName: rawObjectName } =
                ctx.req.valid<TObjectParams>('param');
              const objectName = decodeObjectPath(rawObjectName);

              if (!helper.isValidName(bucketName)) {
                throw getError({
                  message: 'Invalid bucket name',
                  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                });
              }

              if (!helper.isValidPath(objectName, { maxDepth: maxFolderDepth })) {
                throw getError({
                  message: 'Invalid object name or path',
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
                : `/${basePath}/buckets/${bucketName}/objects/${encodeObjectPath(objectName)}`;

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
