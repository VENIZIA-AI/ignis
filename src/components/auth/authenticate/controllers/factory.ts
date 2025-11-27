import { BaseController } from '@/base/controllers';
import { controller, inject } from '@/base/metadata';
import { HTTP } from '@/common/constants';
import { ValueOrPromise } from '@/common/types';
import { getError } from '@/helpers/error';
import { jsonContent } from '@/utilities';
import { z } from '@hono/zod-openapi';
import {
  // ChangePasswordRequestSchema,
  SignInRequestSchema,
  SignUpRequestSchema,
} from '../../models';
import { Authentication, IAuthService } from '../common';

export const defineAuthController = (opts: {
  restPath?: string;
  serviceKey?: string;
  requireAuthenticatedSignUp?: boolean;
  payload?: {
    signIn?: {
      request: { schema: z.ZodObject };
      response: { schema: z.ZodObject };
    };
    signUp?: {
      request: { schema: z.ZodObject };
      response: { schema: z.ZodObject };
    };
    changePassword?: {
      request: { schema?: z.ZodObject };
      response: { schema: z.ZodObject };
    };
  };
}) => {
  const {
    restPath = '/auth',
    serviceKey = 'services.AuthenticationService',
    requireAuthenticatedSignUp = false,
    payload = {},
  } = opts;

  @controller({ path: restPath })
  class AuthController extends BaseController {
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
          path: '/sign-in',
          method: 'post',
          request: {
            body: jsonContent({
              description: 'Sign-in request body',
              required: true,
              schema: payload?.signIn?.request?.schema ?? SignInRequestSchema,
            }),
          },
        },
        handler: async context => {
          const body = await context.req.json();
          return this.service.signIn(context, body);
        },
      });

      this.defineAuthRoute({
        configs: {
          path: '/sign-up',
          method: 'post',
          authStrategies: !requireAuthenticatedSignUp ? [] : [Authentication.STRATEGY_JWT],
          request: {
            body: jsonContent({
              description: 'Sign-up request body',
              required: true,
              schema: payload?.signUp?.request?.schema ?? SignUpRequestSchema,
            }),
          },
        },
        handler: async context => {
          const body = await context.req.json();
          return this.service.signUp(context, body);
        },
      });

      this.defineAuthRoute({
        configs: {
          path: '/change-password',
          method: 'post',
          /* request: {
            body: {
              content: { 'application/json': { schema: ChangePasswordRequestSchema } },
              description: 'Change password request body',
              required: true,
            },
          }, */
          authStrategies: [Authentication.STRATEGY_JWT],
        },
        handler: async context => {
          const body = await context.req.json();
          return this.service.changePassword(context, body);
        },
      });

      this.defineAuthRoute({
        configs: {
          path: '/who-am-i',
          method: 'post',
          responses: {
            [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
              schema: z.object().catchall(z.any()),
              description: 'Check who am i',
            }),
          },
          authStrategies: [Authentication.STRATEGY_JWT],
        },
        handler: context => {
          return context.json({ message: 'check-who-am-i' }, HTTP.ResultCodes.RS_2.Ok);
        },
      });
    }
  }

  inject({ key: serviceKey })(AuthController, undefined, 0);

  return AuthController;
};
