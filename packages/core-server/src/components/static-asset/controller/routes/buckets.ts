import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { type IStaticAssetRoute, StaticAssetFeatures, resolveTarget } from './context';
import { StaticAssetDefinition, StaticAssetPaths } from './definition';

const BucketSchema = z.object({ name: z.string(), creationDate: z.iso.datetime() });

/** The four bucket-management routes: off unless the application turns each on, and never registered once the entry configured its bucket. */
export const bucketRoutes: IStaticAssetRoute[] = [
  {
    key: 'getBuckets',
    feature: StaticAssetFeatures.BUCKET,
    build: (env) => ({
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.GET,
        path: '/buckets',
        response: z.array(BucketSchema),
      }),
      handler: async (ctx) => {
        const buckets = await env.helper.getBuckets();

        return ctx.json(buckets, HTTP.ResultCodes.RS_2.Ok);
      },
    }),
  },
  {
    key: 'getBucketByName',
    feature: StaticAssetFeatures.BUCKET,
    build: (env) => ({
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.GET,
        path: StaticAssetPaths.bucket({ env }),
        params: StaticAssetPaths.requiredBucketParams(),
        response: BucketSchema.nullable(),
      }),
      handler: async (ctx) => {
        const { bucket } = await resolveTarget({ ctx, env });

        const found = await env.helper.getBucket({ bucket });

        return ctx.json(found, HTTP.ResultCodes.RS_2.Ok);
      },
    }),
  },
  {
    key: 'createBucket',
    feature: StaticAssetFeatures.BUCKET,
    build: (env) => ({
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.POST,
        path: StaticAssetPaths.bucket({ env }),
        params: StaticAssetPaths.requiredBucketParams(),
        response: BucketSchema.nullable(),
      }),
      handler: async (ctx) => {
        const { bucket } = await resolveTarget({ ctx, env });

        const created = await env.helper.createBucket({ bucket });

        return ctx.json(created, HTTP.ResultCodes.RS_2.Ok);
      },
    }),
  },
  {
    key: 'deleteBucket',
    feature: StaticAssetFeatures.BUCKET,
    build: (env) => ({
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.DELETE,
        path: StaticAssetPaths.bucket({ env }),
        params: StaticAssetPaths.requiredBucketParams(),
        response: z.object({ isDeleted: z.boolean() }),
      }),
      handler: async (ctx) => {
        const { bucket } = await resolveTarget({ ctx, env });
        const isDeleted = await env.helper.removeBucket({ bucket });

        return ctx.json({ isDeleted }, HTTP.ResultCodes.RS_2.Ok);
      },
    }),
  },
];
