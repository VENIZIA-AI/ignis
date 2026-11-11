import type { TRouteContext } from '@/base/controllers';
import { z } from '@hono/zod-openapi';
import {
  BaseStorageHelper,
  RequestUtility,
  type IUploadFile,
  type IUploadResult,
  type TUploadNaming,
} from '@venizia/ignis-helpers';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { readFileSync, rmSync } from 'node:fs';
import {
  StaticAssetErrors,
  StaticAssetMetaLinkCodes,
  type TStaticAssetUploadQuery,
} from '../../common';
import { StaticAssetKeyScopeUtility } from '../../utilities/key-scope.utility';
import { StaticAssetMetaLinkUtility } from '../../utilities/meta-link.utility';
import { StaticAssetRouteOptionsUtility } from '../../utilities/route-options.utility';
import {
  type IStaticAssetRoute,
  type IStaticAssetRouteEnv,
  StaticAssetFeatures,
  resolveTarget,
} from './context';
import { StaticAssetDefinition, StaticAssetPaths } from './definition';
import { readUploadLabels, refuseLabelsInQuery, uploadLabelsShape } from './labels';
import { MetaLinkRowSchema } from './objects';

const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: 'array',
    items: { type: 'string', format: 'binary' },
  }),
  ...uploadLabelsShape(),
  folderPath: z.string().optional().openapi({
    description: 'Target folder path for uploaded files (e.g., "photos/2024")',
    example: 'photos/2024',
  }),
});

export const MetaLinkOutcomeSchema = z
  .union([z.object({ data: MetaLinkRowSchema }), z.object({ error: z.string() })])
  .optional();

/** Clears the multipart spool files written by `parseMultipartBody({ storage: 'disk' })`. */
const removeSpoolFiles = (opts: { env: IStaticAssetRouteEnv; paths: string[] }): void => {
  for (const filePath of opts.paths) {
    try {
      rmSync(filePath, { force: true });
    } catch (error) {
      opts.env.logger
        .for('UPLOAD')
        .error('Failed to remove spool file | path: %s | Error: %s', filePath, error);
    }
  }
};

const validateFolderPath = (opts: { env: IStaticAssetRouteEnv; folderPath: string }) => {
  const { env, folderPath } = opts;
  const normalizedFolder = folderPath.replace(/^\/+|\/+$/g, '');

  if (!normalizedFolder) {
    throw getError({ error: StaticAssetErrors.FOLDER_PATH_INVALID });
  }

  // maxFolderDepth excludes the filename, so it is compared directly against segment count.
  const folderSegments = normalizedFolder.split('/');

  if (folderSegments.length > env.maxFolderDepth) {
    throw getError({
      error: StaticAssetErrors.FOLDER_DEPTH_EXCEEDED,
      message: `Folder path exceeds max depth of ${env.maxFolderDepth}`,
    });
  }

  const invalidSegmentIndex = folderSegments.findIndex(
    (segment) => !env.helper.isValidSegment({ segment }),
  );

  if (invalidSegmentIndex !== -1) {
    throw getError({
      error: StaticAssetErrors.FOLDER_SEGMENT_INVALID,
      message: `Invalid folder path segment: ${folderSegments[invalidSegmentIndex]}`,
    });
  }
};

/**
 * Built per request: the hook is offered the bucket, which only the route knows. A hook's key is
 * checked against the scope, never rewritten: the application may record that key elsewhere.
 */
const buildNaming = (opts: { env: IStaticAssetRouteEnv; bucketName: string }) => {
  const { env, bucketName } = opts;
  const { helper, keyPrefix, resolveObjectName, options } = env;

  if (!resolveObjectName && keyPrefix === undefined) {
    return options?.normalizeNameFn;
  }

  // The component's own name under a scope: the original name must stay one segment, as without one.
  const isScopedDefaultNaming =
    keyPrefix !== undefined && !resolveObjectName && !options?.normalizeNameFn;

  return (naming: { file: TUploadNaming }) => {
    if (isScopedDefaultNaming && !helper.isValidSegment({ segment: naming.file.originalName })) {
      throw getError({ message: '[upload] Invalid original file name' });
    }

    const defaultKey = options?.normalizeNameFn
      ? options.normalizeNameFn(naming)
      : `${keyPrefix ?? ''}${BaseStorageHelper.normalizeObjectName(naming)}`;

    const key = resolveObjectName
      ? resolveObjectName({ bucket: { name: bucketName }, file: naming.file, defaultKey })
      : defaultKey;

    if (!StaticAssetKeyScopeUtility.isInScope({ key, keyPrefix })) {
      throw getError({
        error: StaticAssetErrors.OBJECT_KEY_OUT_OF_SCOPE,
        message: `Object key is outside the key prefix of this controller | key: ${key} | keyPrefix: ${keyPrefix}`,
      });
    }

    return key;
  };
};

const recordMetaLinks = async (opts: {
  env: IStaticAssetRouteEnv;
  uploaded: IUploadResult[];
  labels: TStaticAssetUploadQuery;
}): Promise<IUploadResult[]> => {
  const { env, uploaded, labels } = opts;
  const { helper, metaLink } = env;

  if (!metaLink) {
    return uploaded;
  }

  const results: IUploadResult[] = [];

  for (const uploadResult of uploaded) {
    try {
      const fileStat = await helper.getStat({
        bucket: uploadResult.bucket,
        object: uploadResult.object,
      });
      const data = await StaticAssetMetaLinkUtility.createRow({
        metaLink,
        helper,
        storage: env.storage,
        uploadResult,
        fileStat,
        query: labels,
      });

      results.push({ ...uploadResult, metaLink: { data } });
    } catch (error) {
      env.logger
        .for('UPLOAD')
        .error(
          'Failed to create MetaLink | objectName: %s | Error: %s',
          uploadResult.object.key,
          error,
        );
      // A CODE, never the driver text: this 200 bypasses the error middleware that strips
      // `detail`/`table`/`constraint`. The real error is logged in full above.
      results.push({
        ...uploadResult,
        metaLink: { error: StaticAssetMetaLinkCodes.CREATE_FAILED },
      });
    }
  }

  return results;
};

const upload = async (opts: { ctx: TRouteContext; env: IStaticAssetRouteEnv }) => {
  const { ctx, env } = opts;
  const { bucket } = await resolveTarget({ ctx, env });

  refuseLabelsInQuery({ query: ctx.req.query() });

  const { files, fields } = await RequestUtility.parseMultipartBody({
    context: ctx,
    storage: env.options?.parseMultipartBody?.storage,
    uploadDir: env.options?.parseMultipartBody?.uploadDir,
    maxFiles: env.maxFiles,
  });

  const spoolPaths = files
    .map((file) => file.path)
    .filter((filePath): filePath is string => Boolean(filePath));

  let labels: TStaticAssetUploadQuery;
  let uploaded: IUploadResult[];

  // From here every exit removes the spool files, the validation failures included.
  try {
    // Labels travel with the payload, not the URL, so the folder check waits for the parse.
    labels = readUploadLabels({ fields });

    if (labels.folderPath) {
      validateFolderPath({ env, folderPath: labels.folderPath });
    }

    // `storage: 'disk'` spools the payload to `uploadDir` and returns `path` instead of `buffer`; the storage helpers only ever write `buffer`, so it must be read back.
    const uploadFiles: IUploadFile[] = files.map((file) => {
      const buffer = file.buffer ?? (file.path ? readFileSync(file.path) : undefined);

      if (!buffer?.length) {
        throw getError({
          error: StaticAssetErrors.FILE_EMPTY,
          message: `Empty file content | name: ${file.originalname}`,
        });
      }

      // Authoritative: `buffer.length`, not the client-declared `size`.
      if (env.maxBytes !== undefined && buffer.length > env.maxBytes) {
        throw getError({
          error: StaticAssetErrors.UPLOAD_TOO_LARGE,
          message: `File ${file.originalname} of ${buffer.length} bytes exceeds the maximum of ${env.maxBytes}`,
        });
      }

      return {
        originalName: file.originalname,
        mimetype: file.mimetype,
        buffer,
        size: file.size,
        encoding: file.encoding,
        folderPath: labels.folderPath ?? undefined,
      };
    });

    const stored = await env.helper.upload({
      bucket,
      files: uploadFiles,
      normalizeNameFn: buildNaming({ env, bucketName: bucket.name }),
      normalizeLinkFn: env.normalizeLinkFn,
      // Without this the helper re-validates against its own hard default of 2, so an app configured for a deeper tree spools the body and only then fails inside the helper.
      maxFolderDepth: env.objectKeyMaxDepth,
    });
    uploaded = stored;
  } finally {
    removeSpoolFiles({ env, paths: spoolPaths });
  }

  const results = await recordMetaLinks({ env, uploaded, labels });

  return ctx.json(results, HTTP.ResultCodes.RS_2.Ok);
};

export const uploadRoute: IStaticAssetRoute = {
  key: 'upload',
  feature: StaticAssetFeatures.SERVER_UPLOAD,
  build: (env) => ({
    config: StaticAssetDefinition.multipart({
      method: HTTP.Methods.POST,
      path: `${StaticAssetPaths.bucket({ env })}/objects`,
      params: StaticAssetPaths.bucketParams({ env }),
      body: MultipartBodySchema,
      response: z.array(
        z.object({
          bucket: z.object({ name: z.string() }),
          object: z.object({ key: z.string(), size: z.number(), contentType: z.string() }),
          link: z.string(),
          metaLink: MetaLinkOutcomeSchema,
        }),
      ),
    }),
    handler: (ctx) => upload({ ctx, env }),
  }),
  // The route's body validator reads the whole multipart body, so the length check has to run before it.
  middleware: ({ env, own }) =>
    env.maxBytes === undefined
      ? own
      : StaticAssetRouteOptionsUtility.appendLengthGuard({
          middleware: own,
          maxBytes: env.maxBytes,
          maxFiles: env.maxFiles,
        }),
};
