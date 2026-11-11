import type { TRouteContext } from '@/base/controllers';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  StaticAssetErrors,
  type TStaticAssetUploadPolicyRequest,
  type TStaticAssetUploadQuery,
} from '../../common';
import {
  type IStaticAssetDirectEnv,
  type IStaticAssetRoute,
  type IStaticAssetRouteEnv,
  StaticAssetFeatures,
  requireFeature,
} from './context';
import { StaticAssetDefinition, StaticAssetPaths } from './definition';
import {
  COMMIT_LABEL_NAMES,
  readUploadLabels,
  refuseLabelsInQuery,
  uploadLabelsShape,
} from './labels';
import { MetaLinkOutcomeSchema } from './upload';

/** First on every direct upload route: nothing below runs for a caller who may not use direct upload. Returns the owner the token is signed for or checked against. */
const guardDirect = async (opts: {
  ctx: TRouteContext;
  direct: IStaticAssetDirectEnv;
}): Promise<string | undefined> => {
  const { ctx, direct } = opts;
  const isAuthorized = await direct.options.authorize({ context: ctx });

  if (!isAuthorized) {
    throw getError({ error: StaticAssetErrors.UPLOAD_NOT_AUTHORIZED });
  }

  return direct.options.resolveOwner?.({ context: ctx });
};

const requireDirect = (env: IStaticAssetRouteEnv) =>
  requireFeature({ value: env.direct, feature: StaticAssetFeatures.DIRECT_UPLOAD });

const CommitTokenSchema = z.object({ commitToken: z.string().min(1) });

const uploadPolicy: IStaticAssetRoute = {
  key: 'uploadPolicy',
  feature: StaticAssetFeatures.DIRECT_UPLOAD,
  build: (env) => {
    const direct = requireDirect(env);

    return {
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.POST,
        path: `${StaticAssetPaths.bucket({ env })}/upload-policy`,
        body: z.object({
          files: z
            .array(
              z.object({
                fileName: z.string().min(1),
                contentType: z.string().optional(),
                size: z.number().int().nonnegative().optional(),
              }),
            )
            .max(env.maxFiles),
        }),
        response: z.array(
          z.object({
            postURL: z.string(),
            formData: z.record(z.string(), z.string()),
            objectName: z.string(),
            commitToken: z.string(),
            expiresAt: z.string(),
          }),
        ),
        description: 'One signed POST policy per file, plus the token its commit is claimed with',
      }),
      handler: async (ctx) => {
        const owner = await guardDirect({ ctx, direct });
        const { files } = ctx.req.valid<TStaticAssetUploadPolicyRequest>('json');

        const policies = await direct.policyService.issuePolicies({ files, owner });

        return ctx.json(policies, HTTP.ResultCodes.RS_2.Ok);
      },
    };
  },
};

const uploadCommit: IStaticAssetRoute = {
  key: 'uploadCommit',
  feature: StaticAssetFeatures.DIRECT_UPLOAD,
  build: (env) => {
    const direct = requireDirect(env);

    return {
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.POST,
        path: `${StaticAssetPaths.bucket({ env })}/upload-commit`,
        // The labels sit beside the token, not inside it: the token is an HMAC over
        // { bucket, key, expiresAt } and deliberately carries no business fields.
        body: CommitTokenSchema.extend(uploadLabelsShape()),
        response: z.object({
          bucket: z.object({ name: z.string() }),
          object: z.object({ key: z.string() }),
          link: z.string(),
          metaLink: MetaLinkOutcomeSchema,
        }),
        description: 'The object at its final key, copied out of the pending prefix',
      }),
      handler: async (ctx) => {
        const owner = await guardDirect({ ctx, direct });
        const query = ctx.req.query();

        refuseLabelsInQuery({ query, names: COMMIT_LABEL_NAMES });
        refuseLabelsInQuery({
          query,
          names: ['folderPath'],
          reason:
            'folderPath was decided when the upload policy was issued; the commit route cannot move the object',
        });

        const { commitToken, ...labels } = ctx.req.valid<
          { commitToken: string } & TStaticAssetUploadQuery
        >('json');
        const result = await direct.commitService.commit({
          token: commitToken,
          owner,
          labels: readUploadLabels({ fields: labels }),
        });

        return ctx.json(result, HTTP.ResultCodes.RS_2.Ok);
      },
    };
  },
};

/** Only with a `validation`: the application adds logic, never a route of its own. */
const uploadValidate: IStaticAssetRoute = {
  key: 'uploadValidate',
  feature: StaticAssetFeatures.VALIDATION,
  build: (env) => {
    const direct = requireDirect(env);
    const validation = requireFeature({
      value: direct.options.validation,
      feature: StaticAssetFeatures.VALIDATION,
    });

    return {
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.POST,
        path: `${StaticAssetPaths.bucket({ env })}/upload-validate`,
        body: CommitTokenSchema,
        response: z.object({ isValid: z.boolean(), issues: z.array(validation.issueSchema) }),
        description: 'Whether the pending file may be committed, and the issues found',
      }),
      handler: async (ctx) => {
        const owner = await guardDirect({ ctx, direct });
        const { commitToken } = ctx.req.valid<{ commitToken: string }>('json');

        const result = await direct.commitService.validate({ token: commitToken, owner });

        return ctx.json(result, HTTP.ResultCodes.RS_2.Ok);
      },
    };
  },
};

export const directUploadRoutes: IStaticAssetRoute[] = [uploadPolicy, uploadCommit, uploadValidate];
