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
import { readFileSync, rmSync } from 'node:fs';
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

/** Hono ALREADY percent-decodes path params - a second decodeURIComponent throws on `report_100%.pdf` and turns `a%2Fb.png` into a DIFFERENT object; `isValidName`/`isValidPath` still run on this value, so traversal is still rejected. */
const readObjectName: (rawObjectName: string) => string = rawObjectName => rawObjectName;

/** Encodes an object path into a SINGLE url segment: `{objectName}` matches one segment only, so `/` must be percent-encoded too (Hono decodes it back before the handler reads the param). */
const encodeObjectPath: (objectPath: string) => string = objectPath => {
  return encodeURIComponent(objectPath);
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

    // The mount path may be declared with or without a leading slash; a link must carry exactly one.
    const normalizedBasePath = basePath.startsWith('/') ? basePath : `/${basePath}`;

    @controllerDecorator({ path: basePath })
    class GeneratedStaticAssetController extends BaseRestController {
      constructor() {
        super({
          scope: name,
          path: basePath,
          isStrict,
        });
      }

      /** Clears the multipart spool files written by `parseMultipartBody({ storage: 'disk' })`. */
      removeSpoolFiles(spoolOptions: { paths: string[] }): void {
        for (const filePath of spoolOptions.paths) {
          try {
            rmSync(filePath, { force: true });
          } catch (error) {
            this.logger
              .for('UPLOAD')
              .error('Failed to remove spool file | path: %s | Error: %s', filePath, error);
          }
        }
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
            const objectName = readObjectName(rawObjectName);

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
            const objectName = readObjectName(rawObjectName);

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

            const folderPath = query.folderPath;
            if (folderPath) {
              const normalizedFolder = folderPath.replace(/^\/+|\/+$/g, '');
              if (!normalizedFolder) {
                throw getError({
                  message: 'Invalid folder path',
                  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                });
              }
              // maxFolderDepth excludes the filename, so it is compared directly against segment count.
              const folderSegments = normalizedFolder.split('/');
              if (folderSegments.length > maxFolderDepth) {
                throw getError({
                  message: `Folder path exceeds max depth of ${maxFolderDepth}`,
                  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                });
              }
              const invalidSegmentIndex = folderSegments.findIndex(
                segment => !helper.isValidName(segment),
              );
              if (invalidSegmentIndex !== -1) {
                throw getError({
                  message: `Invalid folder path segment: ${folderSegments[invalidSegmentIndex]}`,
                  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                });
              }
            }

            const filesArray = await parseMultipartBody({
              context: ctx,
              storage: options?.parseMultipartBody?.storage,
              uploadDir: options?.parseMultipartBody?.uploadDir,
            });

            const spoolPaths = filesArray
              .map(file => file.path)
              .filter((filePath): filePath is string => Boolean(filePath));

            let uploaded: IUploadResult[];
            try {
              // `storage: 'disk'` spools the payload to `uploadDir` and returns `path` instead of `buffer`; the storage helpers only ever write `buffer`, so it must be read back.
              const modifiedFiles: IUploadFile[] = filesArray.map(file => {
                const buffer = file.buffer ?? (file.path ? readFileSync(file.path) : undefined);

                if (!buffer?.length) {
                  throw getError({
                    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                    message: `Empty file content | name: ${file.originalname}`,
                  });
                }

                return {
                  originalName: file.originalname,
                  mimetype: file.mimetype,
                  buffer,
                  size: file.size,
                  encoding: file.encoding,
                  folderPath: folderPath ?? undefined,
                };
              });

              uploaded = await helper.upload({
                bucket: bucketName,
                files: modifiedFiles,
                normalizeNameFn: options?.normalizeNameFn,
                normalizeLinkFn: options?.normalizeLinkFn,
                // Without this the helper re-validates against its own hard default of 2, so an app configured for a deeper tree spools the body and only then fails inside the helper.
                maxFolderDepth,
              });
            } finally {
              this.removeSpoolFiles({ paths: spoolPaths });
            }

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
                  .error(
                    'Failed to create MetaLink | objectName: %s | Error: %s',
                    uploadResult.objectName,
                    error,
                  );
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
            const objectName = readObjectName(rawObjectName);

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
                  .error(
                    'Failed to delete MetaLink | bucket: %s | objectName: %s | Error: %s',
                    bucketName,
                    objectName,
                    error,
                  );
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

            // A NaN or 0 maxKeys is silently treated as "unlimited" by the storage backends, so an unparsable value must be rejected instead of forwarded.
            let resolvedMaxKeys: number | undefined;
            if (maxKeys !== undefined) {
              resolvedMaxKeys = Number(maxKeys);

              if (!Number.isInteger(resolvedMaxKeys) || resolvedMaxKeys < 1) {
                throw getError({
                  message: `Invalid maxKeys | Expected a positive integer | value: ${maxKeys}`,
                  statusCode: HTTP.ResultCodes.RS_4.BadRequest,
                });
              }
            }

            const objects = await helper.listObjects({
              bucket: bucketName,
              prefix,
              useRecursive: recursive === 'true',
              maxKeys: resolvedMaxKeys,
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
              const objectName = readObjectName(rawObjectName);

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

              const fileStat = await helper.getStat({
                bucket: bucketName,
                name: objectName,
              });

              const link = options?.normalizeLinkFn
                ? options.normalizeLinkFn({ bucketName, normalizeName: objectName })
                : `${normalizedBasePath}/buckets/${bucketName}/objects/${encodeObjectPath(objectName)}`;

              const existing = await metaLink.repository.findOne({
                filter: {
                  where: {
                    bucketName,
                    objectName,
                  },
                },
              });

              if (existing) {
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
              }

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
            },
          });
        }
      }
    }

    Object.defineProperty(GeneratedStaticAssetController, 'name', {
      value: name,
      configurable: true,
    });
    return GeneratedStaticAssetController;
  }
}
