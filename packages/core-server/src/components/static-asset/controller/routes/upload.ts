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
import {
  StaticAssetErrors,
  StaticAssetMetaLinkCodes,
  type TStaticAssetObjectKeyResolver,
  type TStaticAssetUploadLabels,
} from '../../common';
import { StaticAssetKeyScopeUtility } from '../../utilities/key-scope.utility';
import { StaticAssetMetaLinkUtility } from '../../utilities/meta-link.utility';
import { StaticAssetRouteOptionsUtility } from '../../utilities/route-options.utility';
import {
  type IStaticAssetRoute,
  type IStaticAssetRouteEnv,
  StaticAssetFeatures,
  StaticAssetRouteUtility,
} from './context';
import { StaticAssetDefinition } from './definition';
import { StaticAssetLabelsUtility, UploadLabelsSchema } from './labels';
import { MetaLinkRowSchema } from './objects';

const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: 'array',
    items: { type: 'string', format: 'binary' },
  }),
  ...UploadLabelsSchema.shape,
  folderPath: z.string().optional().openapi({
    description: 'Target folder path for uploaded files (e.g., "photos/2024")',
    example: 'photos/2024',
  }),
});

/** What an upload or a commit says about the MetaLink row: the row, or a code when only the row failed. */
export const MetaLinkOutcomeSchema = z
  .union([z.object({ data: MetaLinkRowSchema }), z.object({ error: z.string() })])
  .optional();

class StaticAssetUploadHandler {
  /**
   * Built per request: the hook is offered the bucket, which only the route knows. A hook's key is
   * checked against the scope, never rewritten: the application may record that key elsewhere.
   */
  static buildNaming(opts: {
    env: IStaticAssetRouteEnv;
    bucketName: string;
    objectKey?: TStaticAssetObjectKeyResolver;
  }) {
    const { env, bucketName, objectKey } = opts;
    const { helper, keyPrefix } = env;

    if (!objectKey && keyPrefix === undefined) {
      return undefined;
    }

    return (naming: { file: TUploadNaming }) => {
      // The component's own name under a scope: the original name must stay one segment, as without one.
      if (!objectKey && !helper.isValidSegment({ segment: naming.file.originalName })) {
        throw getError({ message: '[upload] Invalid original file name' });
      }

      const defaultKey = `${keyPrefix ?? ''}${BaseStorageHelper.normalizeObjectName(naming)}`;
      const key = objectKey
        ? objectKey({ bucket: { name: bucketName }, file: naming.file, defaultKey })
        : defaultKey;

      if (!StaticAssetKeyScopeUtility.isInScope({ key, keyPrefix })) {
        throw getError({
          error: StaticAssetErrors.OBJECT_KEY_OUT_OF_SCOPE,
          message: `Object key is outside the key prefix of this entry | key: ${key} | keyPrefix: ${keyPrefix}`,
        });
      }

      return key;
    };
  }

  static async recordMetaLinks(opts: {
    env: IStaticAssetRouteEnv;
    uploaded: IUploadResult[];
    labels: TStaticAssetUploadLabels;
  }): Promise<IUploadResult[]> {
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
          labels,
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
  }

  static async handle(opts: { ctx: TRouteContext; env: IStaticAssetRouteEnv }) {
    const { ctx, env } = opts;
    const serverUpload = StaticAssetRouteUtility.requireFeature({
      value: env.serverUpload,
      feature: StaticAssetFeatures.SERVER_UPLOAD,
    });
    const { bucket } = await StaticAssetRouteUtility.resolveTarget({ ctx, env });

    const { files, fields } = await RequestUtility.parseMultipartBody({
      context: ctx,
      maxFiles: serverUpload.maxFiles,
    });
    const labels = StaticAssetLabelsUtility.parse({ fields });
    const folderPath = fields.folderPath || undefined;

    const uploadFiles: IUploadFile[] = files.map((file) => {
      const { buffer } = file;

      if (!buffer?.length) {
        throw getError({
          error: StaticAssetErrors.FILE_EMPTY,
          message: `Empty file content | name: ${file.originalname}`,
        });
      }

      // Authoritative: `buffer.length`, not the client-declared `size`.
      if (serverUpload.maxBytes !== undefined && buffer.length > serverUpload.maxBytes) {
        throw getError({
          error: StaticAssetErrors.UPLOAD_TOO_LARGE,
          message: `File ${file.originalname} of ${buffer.length} bytes exceeds the maximum of ${serverUpload.maxBytes}`,
        });
      }

      return {
        originalName: file.originalname,
        mimetype: file.mimetype,
        buffer,
        size: file.size,
        encoding: file.encoding,
        folderPath,
      };
    });

    const uploaded = await env.helper.upload({
      bucket,
      files: uploadFiles,
      normalizeNameFn: StaticAssetUploadHandler.buildNaming({
        env,
        bucketName: bucket.name,
        objectKey: serverUpload.objectKey,
      }),
      normalizeLinkFn: env.link,
      // The storage checks the folder, against the depth this entry allows.
      maxFolderDepth: env.objectKeyMaxDepth,
    });
    const results = await StaticAssetUploadHandler.recordMetaLinks({ env, uploaded, labels });

    return ctx.json(results, HTTP.ResultCodes.RS_2.Ok);
  }
}

export const uploadRoute: IStaticAssetRoute = {
  key: 'upload',
  feature: StaticAssetFeatures.SERVER_UPLOAD,
  build: (env) => ({
    config: StaticAssetDefinition.multipart({
      method: HTTP.Methods.POST,
      path: '/objects',
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
    handler: (ctx) => StaticAssetUploadHandler.handle({ ctx, env }),
  }),
  // The route's body validator reads the whole multipart body, so the length check has to run before it.
  middleware: ({ env, own }) =>
    env.serverUpload?.maxBytes === undefined
      ? own
      : StaticAssetRouteOptionsUtility.appendLengthGuard({
          middleware: own,
          maxBytes: env.serverUpload.maxBytes,
          maxFiles: env.serverUpload.maxFiles,
        }),
};
