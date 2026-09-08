import { BaseRestController, TRouteContext } from '@/base/controllers';
import { controller as controllerDecorator } from '@/base/metadata';
import {
  BaseStorageHelper,
  createContentDispositionHeader,
  IObjectLocation,
  IObjectMetadata,
  IObjectRef,
  isNotFoundError,
  IStorageHelper,
  IUploadFile,
  IUploadResult,
  parseMultipartBody,
  TUploadNaming,
} from '@venizia/ignis-helpers';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { Env } from 'hono';
import { readFileSync, rmSync } from 'node:fs';
import {
  RENDERABLE_CONTENT_TYPES,
  StaticAssetErrors,
  TBucketParams,
  TDefineExtraRoutes,
  TListQuery,
  TMetaLinkConfig,
  TObjectParams,
  TResolveObjectName,
  TStaticAssetExtraOptions,
  TStaticAssetsComponentOptions,
  TStaticAssetStorageType,
  TUploadQuery,
  WHITELIST_HEADERS,
} from '../common';
import { buildAssetDefinitions } from './base.definition';

export interface IAssetControllerOptions {
  controller: TStaticAssetsComponentOptions[string]['controller'];
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  useMetaLink?: boolean;
  metaLink?: TMetaLinkConfig;
  options?: TStaticAssetExtraOptions;

  /** Decides the stored object name of each uploaded file. Absent leaves the storage helper's own naming untouched. */
  resolveObjectName?: TResolveObjectName;

  /** Registers the application's own routes on the generated controller, after every built-in one. */
  /** Registers the application's own routes BEFORE every built-in one, so a literal path wins over the catch-all `rawObjectPath` produces. */
  defineRoutesBefore?: TDefineExtraRoutes;
  defineExtraRoutes?: TDefineExtraRoutes;
}

/** Hono ALREADY percent-decodes path params - a second decodeURIComponent throws on `report_100%.pdf` and turns `a%2Fb.png` into a DIFFERENT object; `isValidName`/`isValidPath` still run on this value, so traversal is still rejected. */
const readObjectName: (rawObjectName: string) => string = rawObjectName => rawObjectName;

/** Encodes an object path into a SINGLE url segment: `{objectName}` matches one segment only, so `/` must be percent-encoded too (Hono decodes it back before the handler reads the param). */
const encodeObjectPath: (objectPath: string) => string = objectPath => {
  return encodeURIComponent(objectPath);
};

/** The bucket one request works on: a configured value wins - called on every request, so an application may read an environment variable lazily - else the path param, which is only registered when there is no configured bucket. */
const resolveBucket = (opts: { configured?: string | (() => string); param?: string }): string => {
  const { configured, param } = opts;

  if (typeof configured === 'function') {
    return configured();
  }

  return configured ?? param ?? '';
};

/** The URL of one object, in the shape its controller serves: no `/buckets/<name>` with a configured bucket, and a raw path with `rawObjectPath`. */
export const buildObjectLink = (
  opts: IObjectLocation & {
    basePath: string;
    hasConfiguredBucket?: boolean;
    rawObjectPath?: boolean;
  },
): string => {
  const { basePath, bucket, object } = opts;
  const { hasConfiguredBucket = false, rawObjectPath = false } = opts;

  const bucketSegment = hasConfiguredBucket ? '' : `/buckets/${bucket.name}`;
  const objectSegment = rawObjectPath ? object.key : encodeObjectPath(object.key);

  return `${basePath}${bucketSegment}/objects/${objectSegment}`;
};

/** Mirrors `BaseStorageHelper.normalizeObjectName`, which is protected: `resolveObjectName` is offered the very name the helper would otherwise have written. */
const defaultObjectName: (opts: { file: TUploadNaming }) => string = ({ file }) => {
  const { originalName, folderPath } = file;
  const normalizedFileName = originalName.toLowerCase().replace(/ /g, '_');

  if (!folderPath) {
    return normalizedFileName;
  }

  return `${folderPath.toLowerCase().replace(/ /g, '_')}/${normalizedFileName}`;
};

/**
 * The served type comes from the object NAME, never the backend or the uploader: a renderable type on
 * the API origin is stored XSS. Exported so a hand-written route makes the same decision - the
 * backend's own content-type is dropped by `WHITELIST_HEADERS`.
 */
export const resolveServedContentType = (opts: {
  helper: IStorageHelper;
  object: IObjectRef;
}): { contentType: string; isRenderable: boolean } => {
  const { helper, object } = opts;
  const candidate = helper.getMimeType({ filename: object.key }).toLowerCase().split(';')[0].trim();

  if (!RENDERABLE_CONTENT_TYPES.has(candidate)) {
    return { contentType: HTTP.HeaderValues.APPLICATION_OCTET_STREAM, isRenderable: false };
  }

  return { contentType: candidate, isRenderable: true };
};

/**
 * Reads one `Range` header. Only a single byte range is honoured - multipart ranges need a multipart
 * body no browser asks for here. An unsatisfiable or malformed range returns `null`, and the caller
 * serves the whole object, which is what RFC 9110 allows.
 */
const readByteRange = (opts: {
  header: string | undefined;
  size: number;
}): { start: number; end: number } | null => {
  const { header, size } = opts;

  if (!header || size <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;

  // `bytes=-500` means the LAST 500 bytes, not "from 0 to 500".
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
};

/** Sets whitelisted metadata headers on the response context. `content-type` is not among them. */
const applyMetadataHeaders: (opts: {
  ctx: TRouteContext<Env>;
  metadata: IObjectMetadata;
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
    const { resolveObjectName, defineRoutesBefore, defineExtraRoutes } = opts;
    const { name, basePath, routes, isStrict = true, bucket, rawObjectPath = false } = controller;
    const maxFolderDepth = options?.maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;

    const hasConfiguredBucket = bucket !== undefined;
    const definitions = buildAssetDefinitions({ hasConfiguredBucket, rawObjectPath });

    // The mount path may be declared with or without a leading slash; a link must carry exactly one.
    const normalizedBasePath = basePath.startsWith('/') ? basePath : `/${basePath}`;

    /** Only when the URL shape deviates: with neither option the storage helper's own link is left untouched. */
    const shapedLinkFn =
      hasConfiguredBucket || rawObjectPath
        ? (linkOptions: IObjectLocation) =>
            buildObjectLink({
              basePath: normalizedBasePath,
              bucket: linkOptions.bucket,
              object: linkOptions.object,
              hasConfiguredBucket,
              rawObjectPath,
            })
        : undefined;
    const normalizeLinkFn = options?.normalizeLinkFn ?? shapedLinkFn;

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
        // First, so a literal path can win over the built-in catch-all `rawObjectPath` registers.
        defineRoutesBefore?.({ controller: this, helper, basePath: normalizedBasePath });

        // A single-bucket application has no reason to expose bucket creation or deletion, so the
        // four bucket-management routes are not registered once `bucket` is configured.
        if (!hasConfiguredBucket) {
          this.bindRoute({
            configs: { ...definitions.GET_BUCKETS, ...routes?.getBuckets },
          }).to({
            handler: async ctx => {
              const buckets = await helper.getBuckets();
              return ctx.json(buckets, HTTP.ResultCodes.RS_2.Ok);
            },
          });

          this.bindRoute({
            configs: { ...definitions.GET_BUCKET_BY_NAME, ...routes?.getBucketByName },
          }).to({
            handler: async ctx => {
              const params = ctx.req.valid<TBucketParams>('param');
              const bucketName = resolveBucket({ configured: bucket, param: params.bucketName });

              if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
              }

              const found = await helper.getBucket({ bucket: { name: bucketName } });
              return ctx.json(found, HTTP.ResultCodes.RS_2.Ok);
            },
          });

          this.bindRoute({
            configs: { ...definitions.CREATE_BUCKET, ...routes?.createBucket },
          }).to({
            handler: async ctx => {
              const params = ctx.req.valid<TBucketParams>('param');
              const bucketName = resolveBucket({ configured: bucket, param: params.bucketName });

              if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
              }

              const createdBucket = await helper.createBucket({ bucket: { name: bucketName } });
              return ctx.json(createdBucket, HTTP.ResultCodes.RS_2.Ok);
            },
          });

          this.bindRoute({
            configs: { ...definitions.DELETE_BUCKET, ...routes?.deleteBucket },
          }).to({
            handler: async ctx => {
              const params = ctx.req.valid<TBucketParams>('param');
              const bucketName = resolveBucket({ configured: bucket, param: params.bucketName });

              if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
              }

              const isRemovedBucket = await helper.removeBucket({
                bucket: { name: bucketName },
              });
              return ctx.json({ isDeleted: isRemovedBucket }, HTTP.ResultCodes.RS_2.Ok);
            },
          });
        }

        this.bindRoute({
          configs: { ...definitions.GET_OBJECT_BY_NAME, ...routes?.getObjectByName },
        }).to({
          handler: async ctx => {
            const params = ctx.req.valid<TObjectParams>('param');
            const bucketName = resolveBucket({ configured: bucket, param: params.bucketName });
            const objectName = readObjectName(params.objectName);

            if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
              throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
            }

            if (
              !helper.isValidObjectKey({ object: { key: objectName }, maxDepth: maxFolderDepth })
            ) {
              throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
            }

            const fileStat = await helper.getStat({
              bucket: { name: bucketName },
              object: { key: objectName },
            });
            const { size, metadata } = fileStat;
            applyMetadataHeaders({ ctx, metadata });

            const served = resolveServedContentType({ helper, object: { key: objectName } });
            ctx.header(HTTP.Headers.CONTENT_TYPE, served.contentType);
            ctx.header('x-content-type-options', 'nosniff');
            // Sandboxed even when renderable, so an unforeseen renderable type cannot reach this origin.
            ctx.header(HTTP.Headers.CONTENT_SECURITY_POLICY, 'sandbox');
            // Advertised unconditionally: a player only offers seeking once it sees this.
            ctx.header('accept-ranges', 'bytes');

            // A type outside the allow-list downloads instead of rendering; that is the XSS boundary.
            if (!served.isRenderable) {
              const inlineName = objectName.split('/').pop() ?? objectName;
              ctx.header(
                HTTP.Headers.CONTENT_DISPOSITION,
                createContentDispositionHeader({ filename: inlineName, type: 'attachment' }),
              );
            }

            const range = readByteRange({ header: ctx.req.header('range'), size });

            if (range) {
              ctx.header(HTTP.Headers.CONTENT_LENGTH, String(range.end - range.start + 1));
              ctx.header(HTTP.Headers.CONTENT_RANGE, `bytes ${range.start}-${range.end}/${size}`);
            } else {
              ctx.header(HTTP.Headers.CONTENT_LENGTH, size.toString());
            }

            // The web stream is what a Response body wants, so no Node Readable sits in between.
            const stream = await helper.getObjectStream({
              bucket: { name: bucketName },
              object: { key: objectName },
              ...(range ? { range } : {}),
            });

            return new Response(stream, {
              headers: ctx.res.headers,
              status: range ? HTTP.ResultCodes.RS_2.PartialContent : HTTP.ResultCodes.RS_2.Ok,
            });
          },
        });

        this.bindRoute({
          configs: {
            ...definitions.DOWNLOAD_OBJECT_BY_NAME,
            ...routes?.downloadObjectByName,
          },
        }).to({
          handler: async ctx => {
            const params = ctx.req.valid<TObjectParams>('param');
            const bucketName = resolveBucket({ configured: bucket, param: params.bucketName });
            const objectName = readObjectName(params.objectName);

            if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
              throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
            }

            if (
              !helper.isValidObjectKey({ object: { key: objectName }, maxDepth: maxFolderDepth })
            ) {
              throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
            }

            const fileStat = await helper.getStat({
              bucket: { name: bucketName },
              object: { key: objectName },
            });
            const { size, metadata } = fileStat;
            applyMetadataHeaders({ ctx, metadata });

            // Download always attaches, so the served type only has to be honest, never renderable.
            const served = resolveServedContentType({ helper, object: { key: objectName } });
            ctx.header(HTTP.Headers.CONTENT_TYPE, served.contentType);
            ctx.header(HTTP.Headers.CONTENT_LENGTH, size.toString());

            const fileName = objectName.split('/').pop() ?? objectName;
            ctx.header(
              HTTP.Headers.CONTENT_DISPOSITION,
              createContentDispositionHeader({ filename: fileName, type: 'attachment' }),
            );
            ctx.header('x-content-type-options', 'nosniff');
            ctx.header(HTTP.Headers.CONTENT_SECURITY_POLICY, 'sandbox');

            const stream = await helper.getObjectStream({
              bucket: { name: bucketName },
              object: { key: objectName },
            });
            return new Response(stream, {
              headers: ctx.res.headers,
              status: HTTP.ResultCodes.RS_2.Ok,
            });
          },
        });

        this.bindRoute({
          configs: { ...definitions.UPLOAD, ...routes?.upload },
        }).to({
          handler: async ctx => {
            // A configured bucket drops `params` from this route entirely, so it is read only when it exists.
            const bucketParam = hasConfiguredBucket
              ? undefined
              : ctx.req.valid<TBucketParams>('param').bucketName;
            const bucketName = resolveBucket({ configured: bucket, param: bucketParam });
            const query = ctx.req.valid<TUploadQuery>('query');

            if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
              throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
            }

            const folderPath = query.folderPath;
            if (folderPath) {
              const normalizedFolder = folderPath.replace(/^\/+|\/+$/g, '');
              if (!normalizedFolder) {
                throw getError({ error: StaticAssetErrors.FOLDER_PATH_INVALID });
              }
              // maxFolderDepth excludes the filename, so it is compared directly against segment count.
              const folderSegments = normalizedFolder.split('/');
              if (folderSegments.length > maxFolderDepth) {
                throw getError({
                  error: StaticAssetErrors.FOLDER_DEPTH_EXCEEDED,
                  message: `Folder path exceeds max depth of ${maxFolderDepth}`,
                });
              }
              const invalidSegmentIndex = folderSegments.findIndex(
                segment => !helper.isValidSegment({ segment }),
              );
              if (invalidSegmentIndex !== -1) {
                throw getError({
                  error: StaticAssetErrors.FOLDER_SEGMENT_INVALID,
                  message: `Invalid folder path segment: ${folderSegments[invalidSegmentIndex]}`,
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
                    error: StaticAssetErrors.FILE_EMPTY,
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

              // Built per request: the hook is offered the bucket, which only the route knows. No
              // hook leaves `normalizeNameFn` exactly as configured, so the stored name is unchanged.
              const normalizeNameFn = resolveObjectName
                ? (naming: { file: TUploadNaming }) => {
                    const defaultKey = options?.normalizeNameFn
                      ? options.normalizeNameFn(naming)
                      : defaultObjectName(naming);

                    return resolveObjectName({
                      bucket: { name: bucketName },
                      file: naming.file,
                      defaultKey,
                    });
                  }
                : options?.normalizeNameFn;

              uploaded = await helper.upload({
                bucket: { name: bucketName },
                files: modifiedFiles,
                normalizeNameFn,
                normalizeLinkFn,
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
                  bucket: uploadResult.bucket,
                  object: uploadResult.object,
                });

                const { data: createdMetaLink } = metaLink.createMetaLink
                  ? await metaLink.createMetaLink({
                      uploadResult,
                      fileStat,
                      query,
                    })
                  : await metaLink.repository.create({
                      data: {
                        bucketName: uploadResult.bucket.name,
                        objectName: uploadResult.object.key,
                        link: uploadResult.link,
                        // The column is NOT NULL and a backend may report nothing.
                        mimetype:
                          fileStat.metadata?.mimetype ??
                          helper.getMimeType({ filename: uploadResult.object.key }),
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

                results.push({ ...uploadResult, metaLink: { data: createdMetaLink } });
              } catch (error) {
                this.logger
                  .for('UPLOAD')
                  .error(
                    'Failed to create MetaLink | objectName: %s | Error: %s',
                    uploadResult.object.key,
                    error,
                  );
                results.push({
                  ...uploadResult,
                  // A CODE, never the driver text. This handler returns 200, so it bypasses the
                  // error middleware and `database.handler` - the two places that strip
                  // `detail`/`table`/`constraint` - and shipped raw constraint names to the client.
                  // The real error is already logged in full immediately above.
                  metaLink: { error: 'META_LINK_CREATE_FAILED' },
                });
              }
            }
            return ctx.json(results, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        this.bindRoute({
          configs: { ...definitions.DELETE_OBJECT, ...routes?.deleteObject },
        }).to({
          handler: async ctx => {
            const params = ctx.req.valid<TObjectParams>('param');
            const bucketName = resolveBucket({ configured: bucket, param: params.bucketName });
            const objectName = readObjectName(params.objectName);

            if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
              throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
            }

            if (
              !helper.isValidObjectKey({ object: { key: objectName }, maxDepth: maxFolderDepth })
            ) {
              throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
            }

            // Deliberately idempotent: S3 answers 200 for a key that was never there, and consumers
            // already depend on it. `disk` throws instead, so the two are reconciled here, not below.
            try {
              await helper.removeObject({
                bucket: { name: bucketName },
                object: { key: objectName },
              });
            } catch (error) {
              if (!isNotFoundError({ error })) {
                throw error;
              }
            }

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
          configs: { ...definitions.LIST_OBJECTS, ...routes?.listObjects },
        }).to({
          handler: async ctx => {
            // A configured bucket drops `params` from this route entirely, so it is read only when it exists.
            const bucketParam = hasConfiguredBucket
              ? undefined
              : ctx.req.valid<TBucketParams>('param').bucketName;
            const bucketName = resolveBucket({ configured: bucket, param: bucketParam });
            const { prefix, recursive, maxKeys } = ctx.req.valid<TListQuery>('query');

            if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
              throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
            }

            // A NaN or 0 maxKeys is silently treated as "unlimited" by the storage backends, so an unparsable value must be rejected instead of forwarded.
            let resolvedMaxKeys: number | undefined;
            if (maxKeys !== undefined) {
              resolvedMaxKeys = Number(maxKeys);

              if (!Number.isInteger(resolvedMaxKeys) || resolvedMaxKeys < 1) {
                throw getError({
                  error: StaticAssetErrors.MAX_KEYS_INVALID,
                  message: `Invalid maxKeys | Expected a positive integer | value: ${maxKeys}`,
                });
              }
            }

            const objects = await helper.listObjects({
              bucket: { name: bucketName },
              prefix,
              useRecursive: recursive === 'true',
              maxKeys: resolvedMaxKeys,
            });

            return ctx.json(objects, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        if (useMetaLink && metaLink) {
          this.bindRoute({
            configs: { ...definitions.RECREATE_METALINK, ...routes?.recreateMetaLink },
          }).to({
            handler: async ctx => {
              const params = ctx.req.valid<TObjectParams>('param');
              const bucketName = resolveBucket({ configured: bucket, param: params.bucketName });
              const objectName = readObjectName(params.objectName);

              if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
              }

              if (
                !helper.isValidObjectKey({ object: { key: objectName }, maxDepth: maxFolderDepth })
              ) {
                throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
              }

              const fileStat = await helper.getStat({
                bucket: { name: bucketName },
                object: { key: objectName },
              });

              const link = options?.normalizeLinkFn
                ? options.normalizeLinkFn({
                    bucket: { name: bucketName },
                    object: { key: objectName },
                  })
                : buildObjectLink({
                    basePath: normalizedBasePath,
                    bucket: { name: bucketName },
                    object: { key: objectName },
                    hasConfiguredBucket,
                    rawObjectPath,
                  });

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
                  mimetype:
                    fileStat.metadata?.mimetype ?? helper.getMimeType({ filename: objectName }),
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

        // Last, so a built-in route always wins a path collision with an application's own.
        defineExtraRoutes?.({ controller: this, helper, basePath: normalizedBasePath });
      }
    }

    Object.defineProperty(GeneratedStaticAssetController, 'name', {
      value: name,
      configurable: true,
    });
    return GeneratedStaticAssetController;
  }
}
