import { BaseRestController, type TRouteContext } from '@/base/controllers';
import { controller as controllerDecorator } from '@/base/metadata';
import {
  BaseStorageHelper,
  RequestUtility,
  StorageUtility,
  type IObjectLocation,
  type IObjectMetadata,
  type IObjectRef,
  type IStorageHelper,
  type IUploadFile,
  type IUploadResult,
  type TUploadNaming,
} from '@venizia/ignis-helpers';
import { HTTP, ResolverUtility, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { AnyType, TValueOrAsyncResolver } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { type Env } from 'hono';
import { readFileSync, rmSync } from 'node:fs';
import {
  StaticAssetContentTypes,
  StaticAssetErrors,
  type TStaticAssetBucketParams,
  type TStaticAssetDefineExtraRoutes,
  type TStaticAssetListQuery,
  type TMetaLinkConfig,
  StaticAssetMetaLinkCodes,
  type TStaticAssetObjectParams,
  type TStaticAssetUploadPolicyRequest,
  type TStaticAssetObjectNameResolver,
  type TStaticAssetAuth,
  type TStaticAssetExtraOptions,
  type TStaticAssetRouteKey,
  type TStaticAssetComponentOptions,
  type TStaticAssetStorageType,
  type TStaticAssetUploadQuery,
  StaticAssetHeaders,
} from '../common';
import { StaticAssetDefaults, MetaLinkRecreateActions } from '../common';
import { StaticAssetDefinitionBuilder } from './base.definition';
import type { StaticAssetUploadCommitService, StaticAssetUploadPolicyService } from '../services';
import { StaticAssetKeyScopeUtility } from '../utilities/key-scope.utility';
import { StaticAssetMetaLinkUtility } from '../utilities/meta-link.utility';
import { StaticAssetObjectLinkUtility } from '../utilities/object-link.utility';
import { StaticAssetRouteOptionsUtility } from '../utilities/route-options.utility';

/** Input of `StaticAssetControllerFactory.build`: one entry of `TStaticAssetComponentOptions` with its storage type and helper. */
export interface IStaticAssetControllerOptions {
  controller: TStaticAssetComponentOptions[string]['controller'];
  storage: TStaticAssetStorageType;
  helper: IStorageHelper;
  useMetaLink?: boolean;
  /** The table is erased at this seam on purpose. The public option types carry the real `Schema` and check it; inside the controller every read and write is on MetaLink COLUMNS, and threading a table type nobody here constrains through 700 lines of handler buys nothing. */
  metaLink?: TMetaLinkConfig<AnyType>;
  options?: TStaticAssetExtraOptions;

  /** Authentication and authorization of every built-in route; see `TStaticAssetAuth`. */
  auth?: TStaticAssetAuth;

  /** What the two direct upload routes run: the instances the component bound, so an application service resolving them from the container and the routes share them. Required when `controller.directUpload` is set. */
  policyService?: Pick<StaticAssetUploadPolicyService, 'issuePolicies'>;
  commitService?: Pick<StaticAssetUploadCommitService, 'commit' | 'validate'>;

  /** Decides the stored object name of each uploaded file. Absent leaves the storage helper's own naming untouched. */
  resolveObjectName?: TStaticAssetObjectNameResolver;

  /** Registers the application's own routes on the generated controller, after every built-in one. */
  /** Registers the application's own routes BEFORE every built-in one, so a literal path wins over the catch-all `rawObjectPath` produces. */
  defineRoutesBefore?: TStaticAssetDefineExtraRoutes;
  defineExtraRoutes?: TStaticAssetDefineExtraRoutes;
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

/** The body of `StaticAssetControllerFactory.findLabelsInQuery`, callable from the helpers above the class. */
const listLabelsInQuery = (opts: {
  query: Record<string, string>;
  names?: ReadonlyArray<(typeof UPLOAD_LABEL_NAMES)[number]>;
}): string[] => (opts.names ?? UPLOAD_LABEL_NAMES).filter((name) => opts.query[name] !== undefined);

/** Refused before the body is read: a route that ignored them would store an unlabelled row. */
const refuseLabelsInQuery = (opts: {
  query: Record<string, string>;
  names?: ReadonlyArray<(typeof UPLOAD_LABEL_NAMES)[number]>;
  reason?: string;
}): void => {
  const names = listLabelsInQuery(opts);

  if (names.length > 0) {
    throw getError({
      error: StaticAssetErrors.LABELS_IN_QUERY,
      message: `${opts.reason ?? 'Upload labels belong in the request body, not the query'} | names: ${names.join(', ')}`,
    });
  }
};

/** The commit body carries four of the five: the object key - and so `folderPath` - was fixed when the policy was issued. */
const COMMIT_LABEL_NAMES = UPLOAD_LABEL_NAMES.filter((name) => name !== 'folderPath');

// A multipart form hands strings; a JSON commit body may hand `sequence` as a number.
const readUploadLabels = (opts: {
  fields: Partial<Record<(typeof UPLOAD_LABEL_NAMES)[number], string | number>>;
}): TStaticAssetUploadQuery => {
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

const readObjectName: (rawObjectName: string) => string = (rawObjectName) => rawObjectName;

/** The bucket one request works on: a configured value wins - called on every request, so an application may read an environment variable lazily - else the path param, which is only registered when there is no configured bucket. */
const resolveBucket = async (opts: {
  configured?: TValueOrAsyncResolver<string>;
  param?: string;
}): Promise<string> => {
  const { configured, param } = opts;

  if (configured === undefined) {
    return param ?? '';
  }

  return ResolverUtility.resolveValueAsync({ value: configured });
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
    if (
      !StaticAssetHeaders.ALLOWED.includes(
        key.toLowerCase() as (typeof StaticAssetHeaders.ALLOWED)[number],
      )
    ) {
      return;
    }

    ctx.header(key.toLowerCase(), String(value).replace(/[\r\n]/g, ''));
  });
};

/** Builds the REST controller class for a static asset entry. Static helpers also expose label checking, object link building and served content type resolution. */
export class StaticAssetControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: StaticAssetControllerFactory.name });
  }

  /** Names any label a caller put in the query - where the upload routes refuse it. */
  static findLabelsInQuery(opts: {
    query: Record<string, string>;
    names?: ReadonlyArray<(typeof UPLOAD_LABEL_NAMES)[number]>;
  }): string[] {
    return listLabelsInQuery(opts);
  }

  /** The URL of one object, in the shape its controller serves: no `/buckets/<name>` with a configured bucket, and a raw path with `rawObjectPath`. */
  static buildObjectLink(
    opts: IObjectLocation & {
      basePath: string;
      hasConfiguredBucket?: boolean;
      rawObjectPath?: boolean;
    },
  ): string {
    return StaticAssetObjectLinkUtility.build(opts);
  }

  /**
   * The served type comes from the object NAME, never the backend or the uploader: a renderable type on
   * the API origin is stored XSS. Public so a hand-written route makes the same decision - the
   * backend's own content-type is dropped by `StaticAssetHeaders.ALLOWED`.
   */
  static resolveServedContentType(opts: { helper: IStorageHelper; object: IObjectRef }): {
    contentType: string;
    isRenderable: boolean;
  } {
    const { helper, object } = opts;
    const candidate = helper
      .getMimeType({ filename: object.key })
      .toLowerCase()
      .split(';')[0]
      .trim();

    if (!StaticAssetContentTypes.RENDERABLE.has(candidate)) {
      return { contentType: HTTP.HeaderValues.APPLICATION_OCTET_STREAM, isRenderable: false };
    }

    return { contentType: candidate, isRenderable: true };
  }

  static build(opts: IStaticAssetControllerOptions) {
    const { controller, helper, options, useMetaLink, metaLink, storage } = opts;
    const { resolveObjectName, defineRoutesBefore, defineExtraRoutes, auth } = opts;
    const { directUpload } = controller;
    const { name, basePath, routes, isStrict = true, bucket, rawObjectPath = false } = controller;
    const readRoute = (routeOptions: { key: TStaticAssetRouteKey; isOffByDefault?: boolean }) =>
      StaticAssetRouteOptionsUtility.readRoute({
        key: routeOptions.key,
        route: routes?.[routeOptions.key],
        auth,
        isOffByDefault: routeOptions.isOffByDefault,
      });
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
        : StaticAssetKeyScopeUtility.normalizePrefix({
            keyPrefix: controller.keyPrefix,
            helper,
            scope: name,
          });
    const keyPrefix = scope?.keyPrefix;
    // `maxFolderDepth` counts the caller's folders; the scope's own are configuration, not input.
    const objectKeyMaxDepth = maxFolderDepth + (scope?.depth ?? 0);
    // The component's own name under a scope: the original name must stay one segment, as without one.
    const isScopedDefaultNaming =
      keyPrefix !== undefined && !resolveObjectName && !options?.normalizeNameFn;
    const definitions = StaticAssetDefinitionBuilder.build({
      hasConfiguredBucket,
      rawObjectPath,
      maxPolicyFiles: options?.parseMultipartBody?.maxFiles ?? StaticAssetDefaults.MAX_UPLOAD_FILES,
      issueSchema: directUpload?.validation?.issueSchema,
    });

    // The mount path may be declared with or without a leading slash; a link must carry exactly one.
    const normalizedBasePath = StaticAssetObjectLinkUtility.normalizeBasePath({ basePath });

    /** Only when the URL shape deviates: with neither option the storage helper's own link is left untouched. */
    const shapedLinkFn =
      hasConfiguredBucket || rawObjectPath
        ? (linkOptions: IObjectLocation) =>
            StaticAssetControllerFactory.buildObjectLink({
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
          const getBucketsRoute = readRoute({ key: 'getBuckets', isOffByDefault: true });

          if (getBucketsRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.GET_BUCKETS, ...getBucketsRoute.override },
            }).to({
              handler: async (ctx) => {
                const buckets = await helper.getBuckets();

                return ctx.json(buckets, HTTP.ResultCodes.RS_2.Ok);
              },
            });
          }

          const getBucketByNameRoute = readRoute({ key: 'getBucketByName', isOffByDefault: true });

          if (getBucketByNameRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.GET_BUCKET_BY_NAME, ...getBucketByNameRoute.override },
            }).to({
              handler: async (ctx) => {
                const params = ctx.req.valid<TStaticAssetBucketParams>('param');
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

          const createBucketRoute = readRoute({ key: 'createBucket', isOffByDefault: true });

          if (createBucketRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.CREATE_BUCKET, ...createBucketRoute.override },
            }).to({
              handler: async (ctx) => {
                const params = ctx.req.valid<TStaticAssetBucketParams>('param');
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

          const deleteBucketRoute = readRoute({ key: 'deleteBucket', isOffByDefault: true });

          if (deleteBucketRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.DELETE_BUCKET, ...deleteBucketRoute.override },
            }).to({
              handler: async (ctx) => {
                const params = ctx.req.valid<TStaticAssetBucketParams>('param');
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

        const getObjectByNameRoute = readRoute({ key: 'getObjectByName' });

        if (getObjectByNameRoute.isEnabled) {
          this.bindRoute({
            configs: { ...definitions.GET_OBJECT_BY_NAME, ...getObjectByNameRoute.override },
          }).to({
            handler: async (ctx) => {
              const params = ctx.req.valid<TStaticAssetObjectParams>('param');
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
              StaticAssetKeyScopeUtility.assertInScope({ key: objectName, keyPrefix });

              const fileStat = await helper.getStat({
                bucket: { name: bucketName },
                object: { key: objectName },
              });
              const { size, metadata } = fileStat;
              applyMetadataHeaders({ ctx, metadata });

              const served = StaticAssetControllerFactory.resolveServedContentType({
                helper,
                object: { key: objectName },
              });
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
                  RequestUtility.buildContentDispositionHeader({
                    filename: inlineName,
                    type: 'attachment',
                  }),
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

        const downloadObjectByNameRoute = readRoute({ key: 'downloadObjectByName' });

        if (downloadObjectByNameRoute.isEnabled) {
          this.bindRoute({
            configs: {
              ...definitions.DOWNLOAD_OBJECT_BY_NAME,
              ...downloadObjectByNameRoute.override,
            },
          }).to({
            handler: async (ctx) => {
              const params = ctx.req.valid<TStaticAssetObjectParams>('param');
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
              StaticAssetKeyScopeUtility.assertInScope({ key: objectName, keyPrefix });

              const fileStat = await helper.getStat({
                bucket: { name: bucketName },
                object: { key: objectName },
              });
              const { size, metadata } = fileStat;
              applyMetadataHeaders({ ctx, metadata });

              // Download always attaches, so the served type only has to be honest, never renderable.
              const served = StaticAssetControllerFactory.resolveServedContentType({
                helper,
                object: { key: objectName },
              });
              ctx.header(HTTP.Headers.CONTENT_TYPE, served.contentType);
              ctx.header(HTTP.Headers.CONTENT_LENGTH, size.toString());

              const fileName = objectName.split('/').pop() ?? objectName;
              ctx.header(
                HTTP.Headers.CONTENT_DISPOSITION,
                RequestUtility.buildContentDispositionHeader({
                  filename: fileName,
                  type: 'attachment',
                }),
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

        const uploadRoute = readRoute({ key: 'upload' });

        if (uploadRoute.isEnabled) {
          const uploadMiddleware =
            maxBytes === undefined
              ? uploadRoute.override.middleware
              : StaticAssetRouteOptionsUtility.appendLengthGuard({
                  middleware: uploadRoute.override.middleware,
                  maxBytes,
                  maxFiles:
                    options?.parseMultipartBody?.maxFiles ?? StaticAssetDefaults.MAX_UPLOAD_FILES,
                });

          this.bindRoute({
            configs: {
              ...definitions.UPLOAD,
              ...uploadRoute.override,
              middleware: uploadMiddleware,
            },
          }).to({
            handler: async (ctx) => {
              // A configured bucket drops `params` from this route entirely, so it is read only when it exists.
              const bucketParam = hasConfiguredBucket
                ? undefined
                : ctx.req.valid<TStaticAssetBucketParams>('param').bucketName;
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
                  (segment) => !helper.isValidSegment({ segment }),
                );

                if (invalidSegmentIndex !== -1) {
                  throw getError({
                    error: StaticAssetErrors.FOLDER_SEGMENT_INVALID,
                    message: `Invalid folder path segment: ${folderSegments[invalidSegmentIndex]}`,
                  });
                }
              };

              refuseLabelsInQuery({ query: ctx.req.query() });

              const { files: filesArray, fields } = await RequestUtility.parseMultipartBody({
                context: ctx,
                storage: options?.parseMultipartBody?.storage,
                uploadDir: options?.parseMultipartBody?.uploadDir,
                maxFiles:
                  options?.parseMultipartBody?.maxFiles ?? StaticAssetDefaults.MAX_UPLOAD_FILES,
              });

              const spoolPaths = filesArray
                .map((file) => file.path)
                .filter((filePath): filePath is string => Boolean(filePath));

              let query: ReturnType<typeof readUploadLabels>;
              let uploaded: IUploadResult[];

              // From here every exit removes the spool files, the validation failures included.
              try {
                // Labels travel with the payload, not the URL, so the folder check waits for the parse.
                query = readUploadLabels({ fields });

                const folderPath = query.folderPath;

                if (folderPath) {
                  validateFolderPath(folderPath);
                }

                // `storage: 'disk'` spools the payload to `uploadDir` and returns `path` instead of `buffer`; the storage helpers only ever write `buffer`, so it must be read back.
                const modifiedFiles: IUploadFile[] = filesArray.map((file) => {
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

                        if (!StaticAssetKeyScopeUtility.isInScope({ key, keyPrefix })) {
                          throw getError({
                            error: StaticAssetErrors.OBJECT_KEY_OUT_OF_SCOPE,
                            message: `Object key is outside the key prefix of this controller | key: ${key} | keyPrefix: ${keyPrefix}`,
                          });
                        }

                        return key;
                      }
                    : options?.normalizeNameFn;

                const result = await helper.upload({
                  bucket: { name: bucketName },
                  files: modifiedFiles,
                  normalizeNameFn,
                  normalizeLinkFn,
                  // Without this the helper re-validates against its own hard default of 2, so an app configured for a deeper tree spools the body and only then fails inside the helper.
                  maxFolderDepth: objectKeyMaxDepth,
                });
                uploaded = result;
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

                  const createdMetaLink = await StaticAssetMetaLinkUtility.createRow({
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
                    metaLink: { error: StaticAssetMetaLinkCodes.CREATE_FAILED },
                  });
                }
              }

              return ctx.json(results, HTTP.ResultCodes.RS_2.Ok);
            },
          });
        }

        const deleteObjectRoute = readRoute({ key: 'deleteObject' });

        if (deleteObjectRoute.isEnabled) {
          this.bindRoute({
            configs: { ...definitions.DELETE_OBJECT, ...deleteObjectRoute.override },
          }).to({
            handler: async (ctx) => {
              const params = ctx.req.valid<TStaticAssetObjectParams>('param');
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
              StaticAssetKeyScopeUtility.assertInScope({ key: objectName, keyPrefix });

              // Deliberately idempotent: S3 answers 200 for a key that was never there, and consumers
              // already depend on it. `disk` throws instead, so the two are reconciled here, not below.
              try {
                await helper.removeObject({
                  bucket: { name: bucketName },
                  object: { key: objectName },
                });
              } catch (error) {
                if (!StorageUtility.isNotFoundError({ error })) {
                  throw error;
                }
              }

              if (!useMetaLink || !metaLink) {
                return ctx.json({ success: true }, HTTP.ResultCodes.RS_2.Ok);
              }

              const deleteRepository = await ResolverUtility.resolveValueAsync({
                value: metaLink.repository,
              });
              deleteRepository
                .deleteBy({
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
                .catch((error) => {
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

        const listObjectsRoute = readRoute({ key: 'listObjects' });

        if (listObjectsRoute.isEnabled) {
          this.bindRoute({
            configs: { ...definitions.LIST_OBJECTS, ...listObjectsRoute.override },
          }).to({
            handler: async (ctx) => {
              // A configured bucket drops `params` from this route entirely, so it is read only when it exists.
              const bucketParam = hasConfiguredBucket
                ? undefined
                : ctx.req.valid<TStaticAssetBucketParams>('param').bucketName;
              const bucketName = await resolveBucket({ configured: bucket, param: bucketParam });
              const { prefix, recursive, maxKeys } = ctx.req.valid<TStaticAssetListQuery>('query');

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

              const scoped = StaticAssetKeyScopeUtility.resolveListPrefix({ prefix, keyPrefix });

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

          const { policyService, commitService } = opts;

          if (!policyService || !commitService) {
            throw getError({
              message: `[${name}] directUpload needs policyService and commitService | the component builds and binds them; a caller of StaticAssetControllerFactory.build passes its own`,
            });
          }

          const uploadPolicyRoute = readRoute({ key: 'uploadPolicy' });

          if (uploadPolicyRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.UPLOAD_POLICY, ...uploadPolicyRoute.override },
            }).to({
              handler: async (ctx) => {
                const isAuthorized = await directUpload.authorize({ context: ctx });

                if (!isAuthorized) {
                  throw getError({ error: StaticAssetErrors.UPLOAD_NOT_AUTHORIZED });
                }

                const owner = await directUpload.resolveOwner?.({ context: ctx });
                const { files } = ctx.req.valid<TStaticAssetUploadPolicyRequest>('json');
                const policies = await policyService.issuePolicies({ files, owner });

                return ctx.json(policies, HTTP.ResultCodes.RS_2.Ok);
              },
            });
          }

          const uploadCommitRoute = readRoute({ key: 'uploadCommit' });

          if (uploadCommitRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.UPLOAD_COMMIT, ...uploadCommitRoute.override },
            }).to({
              handler: async (ctx) => {
                // First, as on the policy route: nothing below runs for a caller who may not use direct upload.
                const isAuthorized = await directUpload.authorize({ context: ctx });

                if (!isAuthorized) {
                  throw getError({ error: StaticAssetErrors.UPLOAD_NOT_AUTHORIZED });
                }

                const commitQuery = ctx.req.query();
                refuseLabelsInQuery({ query: commitQuery, names: COMMIT_LABEL_NAMES });
                refuseLabelsInQuery({
                  query: commitQuery,
                  names: ['folderPath'],
                  reason:
                    'folderPath was decided when the upload policy was issued; the commit route cannot move the object',
                });

                const { commitToken, ...labels } = ctx.req.valid<
                  { commitToken: string } & TStaticAssetUploadQuery
                >('json');

                const owner = await directUpload.resolveOwner?.({ context: ctx });
                const result = await commitService.commit({
                  token: commitToken,
                  owner,
                  labels: readUploadLabels({ fields: labels }),
                });

                return ctx.json(result, HTTP.ResultCodes.RS_2.Ok);
              },
            });
          }

          const validateDefinition = definitions.UPLOAD_VALIDATE;
          const uploadValidateRoute = readRoute({ key: 'uploadValidate' });

          // Only with a `validation`: the application adds logic, never a route of its own.
          if (validateDefinition && uploadValidateRoute.isEnabled) {
            this.bindRoute({
              configs: { ...validateDefinition, ...uploadValidateRoute.override },
            }).to({
              handler: async (ctx) => {
                const isAuthorized = await directUpload.authorize({ context: ctx });

                if (!isAuthorized) {
                  throw getError({ error: StaticAssetErrors.UPLOAD_NOT_AUTHORIZED });
                }

                const owner = await directUpload.resolveOwner?.({ context: ctx });
                const { commitToken } = ctx.req.valid<{ commitToken: string }>('json');
                const result = await commitService.validate({ token: commitToken, owner });

                return ctx.json(result, HTTP.ResultCodes.RS_2.Ok);
              },
            });
          }
        }

        if (useMetaLink && metaLink) {
          const recreateMetaLinkRoute = readRoute({ key: 'recreateMetaLink' });

          if (recreateMetaLinkRoute.isEnabled) {
            this.bindRoute({
              configs: { ...definitions.RECREATE_METALINK, ...recreateMetaLinkRoute.override },
            }).to({
              handler: async (ctx) => {
                // This route takes no labels anywhere: one in the query would land an unlabelled row.
                refuseLabelsInQuery({
                  query: ctx.req.query(),
                  reason:
                    'This route recreates a MetaLink for an existing object and takes no labels',
                });

                const params = ctx.req.valid<TStaticAssetObjectParams>('param');
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
                StaticAssetKeyScopeUtility.assertInScope({ key: objectName, keyPrefix });

                const bucketRef = { name: bucketName };
                const object = { key: objectName };
                const fileStat = await helper.getStat({ bucket: bucketRef, object });

                const link = options?.normalizeLinkFn
                  ? options.normalizeLinkFn({ bucket: bucketRef, object })
                  : StaticAssetControllerFactory.buildObjectLink({
                      basePath: normalizedBasePath,
                      bucket: bucketRef,
                      object,
                      hasConfiguredBucket,
                      rawObjectPath,
                    });

                const refreshed = await StaticAssetMetaLinkUtility.refreshRows({
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
                const created = await StaticAssetMetaLinkUtility.createRow({
                  metaLink,
                  helper,
                  storage,
                  uploadResult: StaticAssetMetaLinkUtility.buildStoredUploadResult({
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
