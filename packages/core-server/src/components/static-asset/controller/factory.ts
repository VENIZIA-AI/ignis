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
  IPostPolicy,
  IUploadResult,
  parseMultipartBody,
  TUploadNaming,
} from '@venizia/ignis-helpers';
import { HTTP, resolveValueAsync, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { AnyType, TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError, UuidHelper } from '@venizia/ignis-helpers/core';
import { Env } from 'hono';
import { readFileSync, rmSync } from 'node:fs';
import {
  RENDERABLE_CONTENT_TYPES,
  StaticAssetErrors,
  TBucketParams,
  TDefineExtraRoutes,
  TListQuery,
  TMetaLinkConfig,
  DEFAULT_PENDING_PREFIX,
  META_LINK_CREATE_FAILED,
  TObjectParams,
  TUploadPolicyRequest,
  TObjectNameResolver,
  TStaticAssetExtraOptions,
  TStaticAssetsComponentOptions,
  TStaticAssetStorageType,
  TUploadQuery,
  WHITELIST_HEADERS,
} from '../common';
import { buildCommitToken, MetaLinkRecreateActions, readCommitToken } from '../common';
import { buildAssetDefinitions } from './base.definition';
import {
  assertKeyInScope,
  isKeyInScope,
  normalizeKeyPrefix,
  resolveScopedListPrefix,
} from './key-scope';
import { buildStoredUploadResult, createMetaLinkRow, refreshMetaLinkRows } from './meta-link';
import { appendDeclaredLengthGuard, readRouteOverride } from './route-options';

export interface IAssetControllerOptions {
  controller: TStaticAssetsComponentOptions[string]['controller'];
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  useMetaLink?: boolean;
  /** The table is erased at this seam on purpose. The public option types carry the real `Schema` and check it; inside the controller every read and write is on MetaLink COLUMNS, and threading a table type nobody here constrains through 700 lines of handler buys nothing. */
  metaLink?: TMetaLinkConfig<AnyType>;
  options?: TStaticAssetExtraOptions;

  /** Decides the stored object name of each uploaded file. Absent leaves the storage helper's own naming untouched. */
  resolveObjectName?: TObjectNameResolver;

  /** Registers the application's own routes on the generated controller, after every built-in one. */
  /** Registers the application's own routes BEFORE every built-in one, so a literal path wins over the catch-all `rawObjectPath` produces. */
  defineRoutesBefore?: TDefineExtraRoutes;
  defineExtraRoutes?: TDefineExtraRoutes;
}

/** Hono ALREADY percent-decodes path params - a second decodeURIComponent throws on `report_100%.pdf` and turns `a%2Fb.png` into a DIFFERENT object; `isValidName`/`isValidPath` still run on this value, so traversal is still rejected. */
/** The upload labels, read off the multipart form. Every value arrives as text, so `sequence` is the one that needs converting. */
/** One list: the reader below and the stale-caller warning must agree. */
const UPLOAD_LABEL_NAMES = [
  'principalType',
  'principalId',
  'variant',
  'sequence',
  'folderPath',
] as const;

/** Names any label a caller put in the query - where the upload routes refuse it. */
export const findLabelsInQuery = (opts: {
  query: Record<string, string>;
  names?: ReadonlyArray<(typeof UPLOAD_LABEL_NAMES)[number]>;
}): string[] => (opts.names ?? UPLOAD_LABEL_NAMES).filter(name => opts.query[name] !== undefined);

/** Refused before the body is read: a route that ignored them would store an unlabelled row. */
const refuseLabelsInQuery = (opts: {
  query: Record<string, string>;
  names?: ReadonlyArray<(typeof UPLOAD_LABEL_NAMES)[number]>;
  reason?: string;
}): void => {
  const names = findLabelsInQuery(opts);
  if (names.length > 0) {
    throw getError({
      error: StaticAssetErrors.LABELS_IN_QUERY,
      message: `${opts.reason ?? 'Upload labels belong in the request body, not the query'} | names: ${names.join(', ')}`,
    });
  }
};

/** The commit body carries four of the five: the object key - and so `folderPath` - was fixed when the policy was issued. */
const COMMIT_LABEL_NAMES = UPLOAD_LABEL_NAMES.filter(name => name !== 'folderPath');

// A multipart form hands strings; a JSON commit body may hand `sequence` as a number.
const readUploadLabels = (opts: {
  fields: Partial<Record<(typeof UPLOAD_LABEL_NAMES)[number], string | number>>;
}): TUploadQuery => {
  const { fields } = opts;
  const read = (name: (typeof UPLOAD_LABEL_NAMES)[number]) => {
    const value = fields[name];
    return value === undefined || value === '' ? undefined : String(value);
  };

  const sequence = read('sequence');

  return {
    principalType: read('principalType'),
    principalId: read('principalId'),
    variant: read('variant'),
    sequence: sequence === undefined ? undefined : Number(sequence),
    folderPath: read('folderPath'),
  };
};

const readObjectName: (rawObjectName: string) => string = rawObjectName => rawObjectName;

/** Encodes an object path into a SINGLE url segment: `{objectName}` matches one segment only, so `/` must be percent-encoded too (Hono decodes it back before the handler reads the param). */
const encodeObjectPath: (objectPath: string) => string = objectPath => {
  return encodeURIComponent(objectPath);
};

/** The bucket one request works on: a configured value wins - called on every request, so an application may read an environment variable lazily - else the path param, which is only registered when there is no configured bucket. */
const resolveBucket = async (opts: {
  configured?: TValueOrAsyncResolver<string>;
  param?: string;
}): Promise<string> => {
  const { configured, param } = opts;

  if (configured === undefined) {
    return param ?? '';
  }

  return resolveValueAsync({ value: configured });
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
    const { directUpload } = controller;
    const { name, basePath, routes, isStrict = true, bucket, rawObjectPath = false } = controller;
    const maxFolderDepth = options?.maxFolderDepth ?? BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH;
    const maxBytes = options?.maxBytes;

    const hasConfiguredBucket = bucket !== undefined;

    // With the bucket in the URL, the bucket routes stay unscoped and the scope spans every bucket.
    if (controller.keyPrefix !== undefined && !hasConfiguredBucket) {
      throw getError({
        message: `[${name}] keyPrefix needs controller.bucket | a bucket in the URL is a bucket the caller chooses, and the bucket routes cannot be scoped`,
      });
    }

    const scope =
      controller.keyPrefix === undefined
        ? undefined
        : normalizeKeyPrefix({ keyPrefix: controller.keyPrefix, helper, scope: name });
    const keyPrefix = scope?.keyPrefix;
    // `maxFolderDepth` counts the caller's folders; the scope's own are configuration, not input.
    const objectKeyMaxDepth = maxFolderDepth + (scope?.depth ?? 0);
    // The component's own name under a scope: the original name must stay one segment, as without one.
    const isScopedDefaultNaming =
      keyPrefix !== undefined && !resolveObjectName && !options?.normalizeNameFn;
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
          const getBucketsRoute = readRouteOverride({ route: routes?.getBuckets });
          if (getBucketsRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.GET_BUCKETS, ...getBucketsRoute.override },
            }).to({
              handler: async ctx => {
                const buckets = await helper.getBuckets();
                return ctx.json(buckets, HTTP.ResultCodes.RS_2.Ok);
              },
            });
          }

          const getBucketByNameRoute = readRouteOverride({ route: routes?.getBucketByName });
          if (getBucketByNameRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.GET_BUCKET_BY_NAME, ...getBucketByNameRoute.override },
            }).to({
              handler: async ctx => {
                const params = ctx.req.valid<TBucketParams>('param');
                const bucketName = await resolveBucket({
                  configured: bucket,
                  param: params.bucketName,
                });

                if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                  throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
                }

                const found = await helper.getBucket({ bucket: { name: bucketName } });
                return ctx.json(found, HTTP.ResultCodes.RS_2.Ok);
              },
            });
          }

          const createBucketRoute = readRouteOverride({ route: routes?.createBucket });
          if (createBucketRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.CREATE_BUCKET, ...createBucketRoute.override },
            }).to({
              handler: async ctx => {
                const params = ctx.req.valid<TBucketParams>('param');
                const bucketName = await resolveBucket({
                  configured: bucket,
                  param: params.bucketName,
                });

                if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                  throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
                }

                const createdBucket = await helper.createBucket({ bucket: { name: bucketName } });
                return ctx.json(createdBucket, HTTP.ResultCodes.RS_2.Ok);
              },
            });
          }

          const deleteBucketRoute = readRouteOverride({ route: routes?.deleteBucket });
          if (deleteBucketRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.DELETE_BUCKET, ...deleteBucketRoute.override },
            }).to({
              handler: async ctx => {
                const params = ctx.req.valid<TBucketParams>('param');
                const bucketName = await resolveBucket({
                  configured: bucket,
                  param: params.bucketName,
                });

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
        }

        const getObjectByNameRoute = readRouteOverride({ route: routes?.getObjectByName });
        if (getObjectByNameRoute.isEnabled) {
          this.bindRoute({
            configs: { ...definitions.GET_OBJECT_BY_NAME, ...getObjectByNameRoute.override },
          }).to({
            handler: async ctx => {
              const params = ctx.req.valid<TObjectParams>('param');
              const bucketName = await resolveBucket({
                configured: bucket,
                param: params.bucketName,
              });
              const objectName = readObjectName(params.objectName);

              if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
              }

              if (
                !helper.isValidObjectKey({
                  object: { key: objectName },
                  maxDepth: objectKeyMaxDepth,
                })
              ) {
                throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
              }

              // Before any storage call: a key outside the scope must not even be probed.
              assertKeyInScope({ key: objectName, keyPrefix });

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
        }

        const downloadObjectByNameRoute = readRouteOverride({
          route: routes?.downloadObjectByName,
        });
        if (downloadObjectByNameRoute.isEnabled) {
          this.bindRoute({
            configs: {
              ...definitions.DOWNLOAD_OBJECT_BY_NAME,
              ...downloadObjectByNameRoute.override,
            },
          }).to({
            handler: async ctx => {
              const params = ctx.req.valid<TObjectParams>('param');
              const bucketName = await resolveBucket({
                configured: bucket,
                param: params.bucketName,
              });
              const objectName = readObjectName(params.objectName);

              if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
              }

              if (
                !helper.isValidObjectKey({
                  object: { key: objectName },
                  maxDepth: objectKeyMaxDepth,
                })
              ) {
                throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
              }

              // Before any storage call: a key outside the scope must not even be probed.
              assertKeyInScope({ key: objectName, keyPrefix });

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
        }

        const uploadRoute = readRouteOverride({ route: routes?.upload });
        if (uploadRoute.isEnabled) {
          const uploadMiddleware =
            maxBytes === undefined
              ? uploadRoute.override.middleware
              : appendDeclaredLengthGuard({
                  middleware: uploadRoute.override.middleware,
                  maxBytes,
                });

          this.bindRoute({
            configs: {
              ...definitions.UPLOAD,
              ...uploadRoute.override,
              middleware: uploadMiddleware,
            },
          }).to({
            handler: async ctx => {
              // A configured bucket drops `params` from this route entirely, so it is read only when it exists.
              const bucketParam = hasConfiguredBucket
                ? undefined
                : ctx.req.valid<TBucketParams>('param').bucketName;
              const bucketName = await resolveBucket({ configured: bucket, param: bucketParam });

              if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
              }

              const validateFolderPath = (folderPath: string) => {
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
              };

              refuseLabelsInQuery({ query: ctx.req.query() });

              const { files: filesArray, fields } = await parseMultipartBody({
                context: ctx,
                storage: options?.parseMultipartBody?.storage,
                uploadDir: options?.parseMultipartBody?.uploadDir,
              });

              // Labels travel with the payload, not the URL, so the folder check waits for the parse.
              const query = readUploadLabels({ fields });

              const folderPath = query.folderPath;
              if (folderPath) {
                validateFolderPath(folderPath);
              }

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

                  // Authoritative: `buffer.length`, not the client-declared `size`.
                  if (maxBytes !== undefined && buffer.length > maxBytes) {
                    throw getError({
                      error: StaticAssetErrors.UPLOAD_TOO_LARGE,
                      message: `File ${file.originalname} of ${buffer.length} bytes exceeds the maximum of ${maxBytes}`,
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

                // Built per request: the hook is offered the bucket, which only the route knows. With
                // neither hook nor scope, `normalizeNameFn` stays exactly as configured. Under a scope,
                // the component's own default is placed inside it; an application hook's key is
                // checked, never rewritten, because the application may record that key elsewhere.
                const normalizeNameFn =
                  resolveObjectName || keyPrefix !== undefined
                    ? (naming: { file: TUploadNaming }) => {
                        if (
                          isScopedDefaultNaming &&
                          !helper.isValidSegment({ segment: naming.file.originalName })
                        ) {
                          throw getError({ message: '[upload] Invalid original file name' });
                        }

                        const defaultKey = options?.normalizeNameFn
                          ? options.normalizeNameFn(naming)
                          : `${keyPrefix ?? ''}${defaultObjectName(naming)}`;

                        const key = resolveObjectName
                          ? resolveObjectName({
                              bucket: { name: bucketName },
                              file: naming.file,
                              defaultKey,
                            })
                          : defaultKey;

                        if (!isKeyInScope({ key, keyPrefix })) {
                          throw getError({
                            error: StaticAssetErrors.OBJECT_KEY_OUT_OF_SCOPE,
                            message: `Object key is outside the key prefix of this controller | key: ${key} | keyPrefix: ${keyPrefix}`,
                          });
                        }

                        return key;
                      }
                    : options?.normalizeNameFn;

                uploaded = await helper.upload({
                  bucket: { name: bucketName },
                  files: modifiedFiles,
                  normalizeNameFn,
                  normalizeLinkFn,
                  // Without this the helper re-validates against its own hard default of 2, so an app configured for a deeper tree spools the body and only then fails inside the helper.
                  maxFolderDepth: objectKeyMaxDepth,
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

                  const createdMetaLink = await createMetaLinkRow({
                    metaLink,
                    helper,
                    storage,
                    uploadResult,
                    fileStat,
                    query,
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
                    metaLink: { error: META_LINK_CREATE_FAILED },
                  });
                }
              }
              return ctx.json(results, HTTP.ResultCodes.RS_2.Ok);
            },
          });
        }

        const deleteObjectRoute = readRouteOverride({ route: routes?.deleteObject });
        if (deleteObjectRoute.isEnabled) {
          this.bindRoute({
            configs: { ...definitions.DELETE_OBJECT, ...deleteObjectRoute.override },
          }).to({
            handler: async ctx => {
              const params = ctx.req.valid<TObjectParams>('param');
              const bucketName = await resolveBucket({
                configured: bucket,
                param: params.bucketName,
              });
              const objectName = readObjectName(params.objectName);

              if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
              }

              if (
                !helper.isValidObjectKey({
                  object: { key: objectName },
                  maxDepth: objectKeyMaxDepth,
                })
              ) {
                throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
              }

              // Before any storage call: a key outside the scope must not even be probed.
              assertKeyInScope({ key: objectName, keyPrefix });

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

              const deleteRepository = await resolveValueAsync({ value: metaLink.repository });
              deleteRepository
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
        }

        const listObjectsRoute = readRouteOverride({ route: routes?.listObjects });
        if (listObjectsRoute.isEnabled) {
          this.bindRoute({
            configs: { ...definitions.LIST_OBJECTS, ...listObjectsRoute.override },
          }).to({
            handler: async ctx => {
              // A configured bucket drops `params` from this route entirely, so it is read only when it exists.
              const bucketParam = hasConfiguredBucket
                ? undefined
                : ctx.req.valid<TBucketParams>('param').bucketName;
              const bucketName = await resolveBucket({ configured: bucket, param: bucketParam });
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

              const scoped = resolveScopedListPrefix({ prefix, keyPrefix });
              if (scoped.isOutOfScope) {
                return ctx.json([], HTTP.ResultCodes.RS_2.Ok);
              }

              const objects = await helper.listObjects({
                bucket: { name: bucketName },
                prefix: scoped.prefix,
                useRecursive: recursive === 'true',
                maxKeys: resolvedMaxKeys,
              });

              return ctx.json(objects, HTTP.ResultCodes.RS_2.Ok);
            },
          });
        }

        if (directUpload) {
          if (!hasConfiguredBucket) {
            throw getError({
              message: `[${name}] directUpload needs controller.bucket | a policy names one bucket, and a bucket in the URL is a bucket the caller chooses`,
            });
          }

          const pendingPrefix = directUpload.pendingPrefix ?? DEFAULT_PENDING_PREFIX;
          // The scope rides inside the pending key, so the commit, which strips `pendingPrefix`, lands inside it.
          const policyKeyPrefix = `${pendingPrefix}${keyPrefix ?? ''}`;

          const uploadPolicyRoute = readRouteOverride({ route: routes?.uploadPolicy });
          if (uploadPolicyRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.UPLOAD_POLICY, ...uploadPolicyRoute.override },
            }).to({
              handler: async ctx => {
                if (!(await directUpload.authorize({ context: ctx }))) {
                  throw getError({ error: StaticAssetErrors.UPLOAD_NOT_AUTHORIZED });
                }

                const { files } = ctx.req.valid<TUploadPolicyRequest>('json');
                const bucketName = await resolveBucket({ configured: bucket });

                const policies: Array<IPostPolicy & { objectName: string; commitToken: string }> =
                  [];
                for (const file of files) {
                  if (file.size !== undefined && file.size > directUpload.maxBytes) {
                    throw getError({
                      error: StaticAssetErrors.UPLOAD_TOO_LARGE,
                      message: `File '${file.fileName}' is ${file.size} bytes, over the ${directUpload.maxBytes} the policy allows`,
                    });
                  }

                  // Generated, never taken from the caller: a key the caller picks is a key the caller
                  // can collide with, and the pending object is the one thing a policy authorizes.
                  const objectName = `${policyKeyPrefix}${UuidHelper.getInstance().v4()}/${file.fileName}`;
                  const policy = await helper.presignPost({
                    bucket: { name: bucketName },
                    keyPrefix: policyKeyPrefix,
                    maxBytes: directUpload.maxBytes,
                    contentType: file.contentType,
                    expiresIn: directUpload.expiresIn,
                  });

                  policies.push({
                    ...policy,
                    objectName,
                    commitToken: buildCommitToken({
                      payload: {
                        bucket: bucketName,
                        key: objectName,
                        expiresAt: new Date(policy.expiresAt).getTime(),
                      },
                      secretKey: directUpload.secretKey,
                    }),
                  });
                }

                return ctx.json(policies, HTTP.ResultCodes.RS_2.Ok);
              },
            });
          }

          const uploadCommitRoute = readRouteOverride({ route: routes?.uploadCommit });
          if (uploadCommitRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.UPLOAD_COMMIT, ...uploadCommitRoute.override },
            }).to({
              handler: async ctx => {
                const commitQuery = ctx.req.query();
                refuseLabelsInQuery({ query: commitQuery, names: COMMIT_LABEL_NAMES });
                refuseLabelsInQuery({
                  query: commitQuery,
                  names: ['folderPath'],
                  reason:
                    'folderPath was decided when the upload policy was issued; the commit route cannot move the object',
                });

                const { commitToken, ...labels } = ctx.req.valid<
                  { commitToken: string } & TUploadQuery
                >('json');

                // Verified BEFORE any storage call. That is what keeps this route from being a name
                // prober: a forged token fails without a round trip, so timing says nothing.
                const payload = readCommitToken({
                  token: commitToken,
                  secretKey: directUpload.secretKey,
                });

                // Labels, not authorization - the token deliberately carries no business fields, so
                // they travel beside it rather than inside it.
                const query = readUploadLabels({ fields: labels });

                const bucketRef = { name: payload.bucket };
                const pendingObject = { key: payload.key };
                const object = { key: payload.key.slice(pendingPrefix.length) };

                // A token another controller signed with the same secret must not land outside this scope.
                assertKeyInScope({ key: object.key, keyPrefix });

                // Before the copy, so a hook that throws leaves the object under the pending prefix
                // for a lifecycle rule, rather than stranding it at the final key.
                await directUpload.onCommit?.({ bucket: bucketRef, pendingObject, object });

                await helper.copyObject({
                  bucket: bucketRef,
                  source: pendingObject,
                  destination: object,
                });
                // The copy IS the commit; removing the temporary object is cleanup. A failure here
                // leaves one object for the lifecycle rule, and failing the request would tell the
                // caller their upload did not work when it did.
                await helper
                  .removeObject({ bucket: bucketRef, object: pendingObject })
                  .catch(error => {
                    this.logger
                      .for('UPLOAD_COMMIT')
                      .warn(
                        'Committed, but the pending object remains | key: %s | error: %s',
                        pendingObject.key,
                        error,
                      );
                  });

                const link = buildObjectLink({
                  basePath: normalizedBasePath,
                  bucket: bucketRef,
                  object,
                  hasConfiguredBucket,
                  rawObjectPath,
                });

                // The two paths have to agree: without this a client reading `metaLink` off the
                // response renders an empty state with no error - the failure nobody reports.
                let metaLinkResult: IUploadResult['metaLink'];
                if (useMetaLink && metaLink) {
                  try {
                    const fileStat = await helper.getStat({ bucket: bucketRef, object });
                    const data = await createMetaLinkRow({
                      metaLink,
                      helper,
                      storage,
                      uploadResult: buildStoredUploadResult({
                        helper,
                        bucket: bucketRef,
                        object,
                        link,
                        fileStat,
                      }),
                      fileStat,
                      query,
                    });

                    metaLinkResult = { data };
                  } catch (error) {
                    // The object IS committed by now. A 500 would send the caller back with a token
                    // whose source no longer exists, so this rides the body as a code, like UPLOAD.
                    this.logger
                      .for('UPLOAD_COMMIT')
                      .error(
                        'Failed to create MetaLink | objectName: %s | Error: %s',
                        object.key,
                        error,
                      );
                    metaLinkResult = { error: META_LINK_CREATE_FAILED };
                  }
                }

                return ctx.json(
                  {
                    bucket: bucketRef,
                    object,
                    link,
                    ...(metaLinkResult === undefined ? {} : { metaLink: metaLinkResult }),
                  },
                  HTTP.ResultCodes.RS_2.Ok,
                );
              },
            });
          }
        }

        if (useMetaLink && metaLink) {
          const recreateMetaLinkRoute = readRouteOverride({ route: routes?.recreateMetaLink });
          if (recreateMetaLinkRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.RECREATE_METALINK, ...recreateMetaLinkRoute.override },
            }).to({
              handler: async ctx => {
                // This route takes no labels anywhere: one in the query would land an unlabelled row.
                refuseLabelsInQuery({
                  query: ctx.req.query(),
                  reason:
                    'This route recreates a MetaLink for an existing object and takes no labels',
                });

                const params = ctx.req.valid<TObjectParams>('param');
                const bucketName = await resolveBucket({
                  configured: bucket,
                  param: params.bucketName,
                });
                const objectName = readObjectName(params.objectName);

                if (!helper.isValidBucketName({ bucket: { name: bucketName } })) {
                  throw getError({ error: StaticAssetErrors.BUCKET_NAME_INVALID });
                }

                if (
                  !helper.isValidObjectKey({
                    object: { key: objectName },
                    maxDepth: objectKeyMaxDepth,
                  })
                ) {
                  throw getError({ error: StaticAssetErrors.OBJECT_NAME_INVALID });
                }

                // Before any storage call: a key outside the scope must not even be probed.
                assertKeyInScope({ key: objectName, keyPrefix });

                const bucketRef = { name: bucketName };
                const object = { key: objectName };
                const fileStat = await helper.getStat({ bucket: bucketRef, object });

                const link = options?.normalizeLinkFn
                  ? options.normalizeLinkFn({ bucket: bucketRef, object })
                  : buildObjectLink({
                      basePath: normalizedBasePath,
                      bucket: bucketRef,
                      object,
                      hasConfiguredBucket,
                      rawObjectPath,
                    });

                const refreshed = await refreshMetaLinkRows({
                  metaLink,
                  helper,
                  bucket: bucketRef,
                  object,
                  link,
                  fileStat,
                });

                if (refreshed.count > 0) {
                  return ctx.json(
                    {
                      success: true,
                      action: MetaLinkRecreateActions.REFRESHED,
                      count: refreshed.count,
                      metaLink: refreshed.data[0],
                      metaLinks: refreshed.data,
                    },
                    HTTP.ResultCodes.RS_2.Ok,
                  );
                }

                // Not atomic with the refresh above: two concurrent calls may both create, which the
                // table allows - rows per pair are deliberately not unique.
                const created = await createMetaLinkRow({
                  metaLink,
                  helper,
                  storage,
                  uploadResult: buildStoredUploadResult({
                    helper,
                    bucket: bucketRef,
                    object,
                    link,
                    fileStat,
                  }),
                  fileStat,
                  query: {},
                });

                return ctx.json(
                  {
                    success: true,
                    action: MetaLinkRecreateActions.CREATED,
                    count: 1,
                    metaLink: created,
                    metaLinks: [created],
                  },
                  HTTP.ResultCodes.RS_2.Ok,
                );
              },
            });
          }
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
