import type { TRouteContext } from '@/base/controllers';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  StaticAssetDefaults,
  StaticAssetErrors,
  StaticAssetRouteKeys,
  type TStaticAssetUploadPolicyRequest,
} from '../../common';
import {
  type IStaticAssetRoute,
  type IStaticAssetRouteEnv,
  StaticAssetFeatures,
  StaticAssetRouteUtility,
} from './context';
import { StaticAssetDefinition } from './definition';
import { StaticAssetLabelsUtility, UploadLabelsSchema } from './labels';
import { MetaLinkOutcomeSchema } from './upload';

class StaticAssetDirectUploadGuard {
  static require(opts: { env: IStaticAssetRouteEnv }) {
    return StaticAssetRouteUtility.requireFeature({
      value: opts.env.directUpload,
      feature: StaticAssetFeatures.DIRECT_UPLOAD,
    });
  }

  /** First on every direct upload route: nothing below runs for a caller who may not use direct upload. Returns the owner the token is signed for or checked against. */
  static async guard(opts: {
    ctx: TRouteContext;
    direct: ReturnType<typeof StaticAssetDirectUploadGuard.require>;
  }): Promise<string | undefined> {
    const { ctx, direct } = opts;
    const isAuthorized = await direct.authorize({ context: ctx });

    if (!isAuthorized) {
      throw getError({ error: StaticAssetErrors.UPLOAD_NOT_AUTHORIZED });
    }

    return direct.resolveOwner?.({ context: ctx });
  }
}

const CommitTokenSchema = z.object({ commitToken: z.string().min(1) });

const uploadPolicy: IStaticAssetRoute = {
  key: StaticAssetRouteKeys.UPLOAD_POLICY,
  feature: StaticAssetFeatures.DIRECT_UPLOAD,
  build: (env) => {
    const direct = StaticAssetDirectUploadGuard.require({ env });

    return {
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.POST,
        path: '/upload-policy',
        body: z.object({
          files: z
            .array(
              z.object({
                fileName: z.string().min(1),
                contentType: z.string().optional(),
                size: z.number().int().nonnegative().optional(),
              }),
            )
            .max(direct.maxFiles ?? StaticAssetDefaults.MAX_UPLOAD_FILES),
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
        const owner = await StaticAssetDirectUploadGuard.guard({ ctx, direct });
        const { files } = ctx.req.valid<TStaticAssetUploadPolicyRequest>('json');

        const policies = await direct.policyService.issuePolicies({ files, owner });

        return ctx.json(policies, HTTP.ResultCodes.RS_2.Ok);
      },
    };
  },
};

const uploadCommit: IStaticAssetRoute = {
  key: StaticAssetRouteKeys.UPLOAD_COMMIT,
  feature: StaticAssetFeatures.DIRECT_UPLOAD,
  build: (env) => {
    const direct = StaticAssetDirectUploadGuard.require({ env });

    return {
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.POST,
        path: '/upload-commit',
        // The labels sit beside the token, not inside it: the token is an HMAC over
        // { bucket, key, expiresAt } and deliberately carries no business fields.
        body: CommitTokenSchema.extend(UploadLabelsSchema.shape),
        response: z.object({
          bucket: z.object({ name: z.string() }),
          object: z.object({ key: z.string() }),
          link: z.string(),
          metaLink: MetaLinkOutcomeSchema,
        }),
        description: 'The object at its final key, copied out of the pending prefix',
      }),
      handler: async (ctx) => {
        const owner = await StaticAssetDirectUploadGuard.guard({ ctx, direct });
        const { commitToken, ...fields } = ctx.req.valid<{ commitToken: string }>('json');
        const labels = StaticAssetLabelsUtility.parse({ fields });
        const result = await direct.commitService.commit({
          token: commitToken,
          owner,
          labels,
        });

        return ctx.json(result, HTTP.ResultCodes.RS_2.Ok);
      },
    };
  },
};

/** Only with a `validation`: the application adds logic, never a route of its own. */
const uploadValidate: IStaticAssetRoute = {
  key: StaticAssetRouteKeys.UPLOAD_VALIDATE,
  feature: StaticAssetFeatures.VALIDATION,
  build: (env) => {
    const direct = StaticAssetDirectUploadGuard.require({ env });
    const validation = StaticAssetRouteUtility.requireFeature({
      value: direct.validation,
      feature: StaticAssetFeatures.VALIDATION,
    });

    return {
      config: StaticAssetDefinition.json({
        method: HTTP.Methods.POST,
        path: '/upload-validate',
        body: CommitTokenSchema,
        response: z.object({ isValid: z.boolean(), issues: z.array(validation.issueSchema) }),
        description: 'Whether the pending file may be committed, and the issues found',
      }),
      handler: async (ctx) => {
        const owner = await StaticAssetDirectUploadGuard.guard({ ctx, direct });
        const { commitToken } = ctx.req.valid<{ commitToken: string }>('json');

        const result = await direct.commitService.validate({ token: commitToken, owner });

        return ctx.json(result, HTTP.ResultCodes.RS_2.Ok);
      },
    };
  },
};

export const directUploadRoutes: IStaticAssetRoute[] = [uploadPolicy, uploadCommit, uploadValidate];
