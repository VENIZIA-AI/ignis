import { BaseController } from '@/base/controllers';
import { controller, inject } from '@/base/metadata';
import { jsonContent, jsonResponse } from '@/base/models';
import { AnyObjectSchema } from '@/utilities';
import { z } from '@hono/zod-openapi';
import { getError, HTTP, ValueOrPromise } from '@venizia/ignis-helpers';
import {
  ChangePasswordRequestSchema,
  SignInRequestSchema,
  SignUpRequestSchema,
} from '../../models';
import { Authentication, IAuthService, TDefineAuthControllerOpts } from '../common';

export const defineAuthController = (opts: TDefineAuthControllerOpts) => {
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
          responses: jsonResponse({
            schema: payload?.signIn?.request?.schema ?? AnyObjectSchema,
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
          path: '/change-password',
          method: 'post',
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
          authStrategies: [Authentication.STRATEGY_JWT],
        },
        handler: async context => {
          const body = await context.req.json();
          const rs = await this.service.changePassword(context, body);
          return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
        },
      });

      this.defineRoute({
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
