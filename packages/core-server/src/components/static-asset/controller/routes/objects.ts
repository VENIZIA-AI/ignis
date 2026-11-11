import type { TRouteContext } from '@/base/controllers';
import { z } from '@hono/zod-openapi';
import { StorageUtility } from '@venizia/ignis-helpers';
import { HTTP, ResolverUtility } from '@venizia/ignis-helpers/common';
import { MetaLinkRecreateActions } from '../../common';
import { StaticAssetKeyScopeUtility } from '../../utilities/key-scope.utility';
import { StaticAssetMetaLinkUtility } from '../../utilities/meta-link.utility';
import {
  type IStaticAssetRoute,
  type IStaticAssetRouteEnv,
  StaticAssetFeatures,
  StaticAssetRouteUtility,
} from './context';
import { StaticAssetDefinition, StaticAssetPaths } from './definition';

/** A MetaLink row as a client sees it. The table is the application's, so the columns are not listed here. */
export const MetaLinkRowSchema = z.record(z.string(), z.unknown());

const listQuery = () =>
  z.object({
    prefix: z
      .string()
      .optional()
      .openapi({
        param: { name: 'prefix', in: 'query', description: 'Filter objects by prefix' },
        example: 'folder/',
      }),
    recursive: z
      .string()
      .optional()
      .openapi({
        param: { name: 'recursive', in: 'query', description: 'Recursive listing' },
        example: 'true',
      }),
    // A NaN or 0 maxKeys is silently treated as "unlimited" by the storage backends, so the schema refuses it.
    maxKeys: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .openapi({
        param: {
          name: 'maxKeys',
          in: 'query',
          description: 'Maximum number of objects to return',
        },
        example: 100,
      }),
  });

const deleteObject: IStaticAssetRoute = {
  key: 'deleteObject',
  feature: StaticAssetFeatures.OBJECT,
  build: (env) => ({
    config: StaticAssetDefinition.json({
      method: HTTP.Methods.DELETE,
      path: `/objects/${StaticAssetPaths.object({ env })}`,
      params: StaticAssetPaths.objectParams(),
      response: z.object({ success: z.boolean() }),
    }),
    handler: async (ctx) => {
      const { bucket, object } = await StaticAssetRouteUtility.resolveTarget({
        ctx,
        env,
        isObject: true,
      });

      // Deliberately idempotent: S3 answers 200 for a key that was never there, and consumers
      // already depend on it. `disk` throws instead, so the two are reconciled here, not below.
      try {
        await env.helper.removeObject({ bucket, object });
      } catch (error) {
        if (!StorageUtility.isNotFoundError({ error })) {
          throw error;
        }
      }

      if (!env.metaLink) {
        return ctx.json({ success: true }, HTTP.ResultCodes.RS_2.Ok);
      }

      const repository = await ResolverUtility.resolveValueAsync({
        value: env.metaLink.repository,
      });
      // Awaited: the object is gone and its removal is idempotent, so a retry removes the row.
      await repository.deleteBy({ where: { bucketName: bucket.name, objectName: object.key } });
      env.logger.for('DELETE_OBJECT').info('Deleted MetaLink for %s/%s', bucket.name, object.key);

      return ctx.json({ success: true }, HTTP.ResultCodes.RS_2.Ok);
    },
  }),
};

const listObjects: IStaticAssetRoute = {
  key: 'listObjects',
  feature: StaticAssetFeatures.OBJECT,
  build: (env) => ({
    config: StaticAssetDefinition.json({
      method: HTTP.Methods.GET,
      path: '/objects',
      query: listQuery(),
      response: z.array(
        z.object({
          name: z.string().optional(),
          size: z.number().optional(),
          lastModified: z.iso.datetime().optional(),
          etag: z.string().optional(),
          prefix: z.string().optional(),
        }),
      ),
    }),
    handler: async (ctx) => {
      const { bucket } = await StaticAssetRouteUtility.resolveTarget({ ctx, env });
      const { prefix, recursive, maxKeys } = ctx.req.valid<{
        prefix?: string;
        recursive?: string;
        maxKeys?: number;
      }>('query');

      const scoped = StaticAssetKeyScopeUtility.resolveListPrefix({
        prefix,
        keyPrefix: env.keyPrefix,
      });

      if (scoped.isOutOfScope) {
        return ctx.json([], HTTP.ResultCodes.RS_2.Ok);
      }

      const objects = await env.helper.listObjects({
        bucket,
        prefix: scoped.prefix,
        useRecursive: recursive === 'true',
        maxKeys,
      });

      return ctx.json(objects, HTTP.ResultCodes.RS_2.Ok);
    },
  }),
};

const recreate = async (opts: { ctx: TRouteContext; env: IStaticAssetRouteEnv }) => {
  const { ctx, env } = opts;
  const metaLink = StaticAssetRouteUtility.requireFeature({
    value: env.metaLink,
    feature: StaticAssetFeatures.META_LINK,
  });

  const { bucket, object } = await StaticAssetRouteUtility.resolveTarget({
    ctx,
    env,
    isObject: true,
  });
  const { helper } = env;
  const fileStat = await helper.getStat({ bucket, object });
  const link = env.link({ bucket, object });

  const refreshed = await StaticAssetMetaLinkUtility.refreshRows({
    metaLink,
    helper,
    bucket,
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
    storage: env.storage,
    uploadResult: StaticAssetMetaLinkUtility.buildStoredUploadResult({
      helper,
      bucket,
      object,
      link,
      fileStat,
    }),
    fileStat,
    labels: {},
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
};

const recreateMetaLink: IStaticAssetRoute = {
  key: 'recreateMetaLink',
  feature: StaticAssetFeatures.META_LINK,
  build: (env) => ({
    config: StaticAssetDefinition.json({
      method: HTTP.Methods.PUT,
      path: `/meta-links/${StaticAssetPaths.object({ env })}`,
      params: StaticAssetPaths.objectParams(),
      response: z.object({
        success: z.boolean(),
        action: z
          .enum([MetaLinkRecreateActions.REFRESHED, MetaLinkRecreateActions.CREATED])
          .openapi({
            description: '`refreshed` when rows for the object existed, `created` when none did',
            example: 'refreshed',
          }),
        count: z.number().openapi({ description: 'Rows refreshed or created' }),
        metaLink: MetaLinkRowSchema.optional().openapi({
          description: 'The first of `metaLinks`',
        }),
        metaLinks: z.array(MetaLinkRowSchema),
      }),
    }),
    handler: (ctx) => recreate({ ctx, env }),
  }),
};

export const objectRoutes: IStaticAssetRoute[] = [deleteObject, listObjects];

export const metaLinkRoutes: IStaticAssetRoute[] = [recreateMetaLink];
