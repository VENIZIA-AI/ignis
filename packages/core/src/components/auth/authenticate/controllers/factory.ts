import { BaseRestController } from '@/base/controllers/rest/base';
import { inject } from '@/base/metadata/injectors';
import { controller } from '@/base/metadata/routes';
import { jsonContent, jsonResponse } from '@/base/models/common/types';
import { throwNotSupported } from '@/utilities';
import { AnyObjectSchema } from '@/utilities/schema.utility';
import { z } from '@hono/zod-openapi';
import { getError, HTTP, ValueOrPromise } from '@venizia/ignis-helpers';
import {
  ChangePasswordRequestSchema,
  SignInRequestSchema,
  SignUpRequestSchema,
} from '../../models';
import { Authentication, IAuthService, TDefineAuthControllerOpts } from '../common';

export const JWTTokenPayloadSchema = z.object({
  userId: z.string().or(z.number()),
  roles: z.array(
    z.object({
      id: z.string().or(z.number()),
      identifier: z.string(),
      priority: z.number().int(),
    }),
  ),
  clientId: z.string().optional(),
  provider: z.string().optional(),
  email: z.email().optional(),
});

export const defineAuthController = (opts: TDefineAuthControllerOpts) => {
  const { restPath = '/auth', serviceKey, requireAuthenticatedSignUp = false, payload = {} } = opts;

  @controller({ path: restPath })
  class AuthController extends BaseRestController {
    service: IAuthService;

    constructor(authService: IAuthService) {
      super({
        scope: AuthController.name,
        path: restPath,
        isStrict: true,
      });

      if (!authService) {
        throw getError({
          message:
            '[AuthController] Failed to init auth controller | Invalid injectable authentication service!',
        });
      }

      this.service = authService;
    }

    override binding(): ValueOrPromise<void> {
      this.defineRoute({
        configs: {
          description: 'Sign In',
          path: '/sign-in',
          method: HTTP.Methods.POST,
          request: {
            body: jsonContent({
              description: 'Sign-in request body',
              required: true,
              schema: payload?.signIn?.request?.schema ?? SignInRequestSchema,
            }),
          },
          responses: jsonResponse({
            schema: payload?.signIn?.response?.schema ?? AnyObjectSchema,
            description: 'Success Response',
          }),
        },
        handler: async context => {
          const body = await context.req.json();
          const rs = await this.service.signIn(context, body);
          return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
        },
      });

      this.defineRoute({
        configs: {
          description: 'Sign Up',
          path: '/sign-up',
          method: HTTP.Methods.POST,
          authenticate: {
            strategies: !requireAuthenticatedSignUp ? [] : [Authentication.STRATEGY_JWT],
          },
          request: {
            body: jsonContent({
              description: 'Sign-up request body',
              required: true,
              schema: payload?.signUp?.request?.schema ?? SignUpRequestSchema,
            }),
          },
          responses: jsonResponse({
            schema: payload?.signUp?.response?.schema ?? AnyObjectSchema,
            description: 'Success Response',
          }),
        },
        handler: async context => {
          const body = await context.req.json();
          const rs = await this.service.signUp(context, body);
          return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
        },
      });

      this.defineRoute({
        configs: {
          description: 'Change password',
          path: '/change-password',
          method: HTTP.Methods.POST,
          request: {
            body: jsonContent({
              description: 'Change password request body',
              required: true,
              schema: payload?.changePassword?.request?.schema ?? ChangePasswordRequestSchema,
            }),
          },
          responses: jsonResponse({
            schema: payload?.changePassword?.response?.schema ?? AnyObjectSchema,
            description: 'Success Response',
          }),
          authenticate: { strategies: [Authentication.STRATEGY_JWT] },
        },
        handler: async context => {
          const body = await context.req.json();
          const rs = await this.service.changePassword(context, body);
          return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
        },
      });

      // Re-issues an access token using the caller's currently valid JWT — no separate refresh token. Implementers must enforce their own rotation/revocation policy if needed.
      this.defineRoute({
        configs: {
          description: 'Refresh access token',
          path: '/token/refresh',
          method: HTTP.Methods.POST,
          responses: jsonResponse({
            schema: payload?.refreshToken?.response?.schema ?? AnyObjectSchema,
            description: 'Success Response',
          }),
          authenticate: { strategies: [Authentication.STRATEGY_JWT] },
        },
        handler: async context => {
          if (!this.service.refreshToken) {
            return throwNotSupported({
              scope: AuthController.name,
              feature: 'refreshToken',
              logger: this.logger,
            });
          }

          const rs = await this.service.refreshToken(context);
          return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
        },
      });

      this.defineRoute({
        configs: {
          path: '/who-am-i',
          method: HTTP.Methods.GET,
          request: {
            query: z.object({
              withUserInformation: z
                .enum(['true', 'false', '1', '0'])
                .transform(value => value === 'true' || value === '1')
                .optional()
                .openapi({
                  description: 'Whether to attach user information to currentUser',
                }),
            }),
          },
          responses: {
            [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
              description: 'Success Response',
              schema: JWTTokenPayloadSchema.extend({
                userInformation: (payload?.getUserInformation?.response?.schema ?? AnyObjectSchema)
                  .optional()
                  .openapi({
                    description: 'Attached when withUserInformation is truthy',
                  }),
              }),
            }),
          },
          authenticate: { strategies: [Authentication.STRATEGY_JWT] },
        },
        handler: async context => {
          const { withUserInformation = false } = context.req.valid<{
            withUserInformation?: boolean;
          }>('query');

          const currentUser = context.get(Authentication.CURRENT_USER);
          let rs = currentUser;

          if (withUserInformation) {
            if (!this.service.getUserInformation) {
              return throwNotSupported({
                scope: AuthController.name,
                feature: 'getUserInformation',
                logger: this.logger,
              });
            }

            const userInformation = await this.service.getUserInformation(context, {});
            rs = Object.assign({}, currentUser, { userInformation });
          }

          return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
        },
      });

      this.defineRoute({
        configs: {
          description: 'Get current user information',
          path: '/me',
          method: HTTP.Methods.GET,
          responses: jsonResponse({
            schema: payload?.getUserInformation?.response?.schema ?? AnyObjectSchema,
            description: 'Success Response',
          }),
          authenticate: { strategies: [Authentication.STRATEGY_JWT] },
        },
        handler: async context => {
          if (!this.service.getUserInformation) {
            return throwNotSupported({
              scope: AuthController.name,
              feature: 'getUserInformation',
              logger: this.logger,
            });
          }

          const rs = await this.service.getUserInformation(context, {});
          return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
        },
      });
    }
  }

  inject({ key: serviceKey })(AuthController, undefined, 0);

  return AuthController;
};
