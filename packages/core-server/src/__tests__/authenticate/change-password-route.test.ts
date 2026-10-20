import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { defineAuthController } from '@/components/auth/authenticate/controllers';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { AnyObject, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  AuthenticationStrategyRegistry,
  BindingKeys,
  BindingNamespaces,
  ChangePasswordRequestSchema,
  ControllerTransports,
  type IApplicationConfigs,
  type IApplicationInfo,
  type IAuthService,
  type IAuthUser,
  type IAuthenticationStrategy,
  type TChangePasswordRequest,
  type TContext,
} from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: true },
  transports: [ControllerTransports.REST],
};

const SERVICE_KEY = BindingKeys.build({
  namespace: BindingNamespaces.SERVICE,
  key: 'RecordingAuthService',
});

const VALID_BODY: TChangePasswordRequest = {
  scheme: 'basic',
  oldCredential: 'old_password',
  newCredential: 'new_password',
  userId: 'user-1',
};

class ChangePasswordApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'change-password-app', version: '0.0.0', description: 'Change-password probe' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}

/** Stands in for the JWT strategy the route names, so a request reaches the handler signed in. */
class SignedInStrategy implements IAuthenticationStrategy {
  name = 'jwt';

  async authenticate(_context: TContext): Promise<IAuthUser> {
    return { userId: 'user-1' };
  }
}

class RecordingAuthService implements IAuthService {
  readonly received: Array<AnyObject> = [];

  async signIn(): Promise<AnyObject> {
    return {};
  }

  async signUp(): Promise<AnyObject> {
    return {};
  }

  async changePassword(_context: TContext, opts: TChangePasswordRequest): Promise<AnyObject> {
    this.received.push(opts);
    return { isChanged: true };
  }
}

const mountAuthController = async (opts: {
  service: RecordingAuthService;
}): Promise<OpenAPIHono> => {
  const { service } = opts;

  const application = new ChangePasswordApplication({
    scope: 'ChangePasswordApplication',
    config: CONFIGS,
  });
  application.init();
  application.bind({ key: SERVICE_KEY }).toValue(service);

  AuthenticationStrategyRegistry.getInstance().register({
    container: application,
    strategies: [{ name: 'jwt', strategy: SignedInStrategy }],
  });

  const AuthController = defineAuthController({ serviceKey: SERVICE_KEY });
  application.controller(AuthController);
  await application.registerControllers();

  const server = application.getServer();
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(CONFIGS.path.base, application.getRootRouter());
  return server;
};

const postChangePassword = async (opts: {
  server: OpenAPIHono;
  body: AnyObject;
}): Promise<Response> => {
  return opts.server.request('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts.body),
  });
};

describe('POST /auth/change-password', () => {
  afterEach(() => {
    AuthenticationStrategyRegistry.getInstance().reset();
  });

  test('a body missing a field the document marks required is refused before the service runs', async () => {
    const service = new RecordingAuthService();
    const server = await mountAuthController({ service });

    const withoutUserId = Object.fromEntries(
      Object.entries(VALID_BODY).filter(([key]) => key !== 'userId'),
    );
    const response = await postChangePassword({ server, body: withoutUserId });

    expect(response.status).toBe(422);
    expect(service.received).toEqual([]);
  });
});

describe('ChangePasswordRequestSchema documents what it validates', () => {
  const documentBody = (): AnyObject => {
    const application = new OpenAPIHono();

    application.openapi(
      createRoute({
        method: 'post',
        path: '/probe',
        request: {
          body: { content: { 'application/json': { schema: ChangePasswordRequestSchema } } },
        },
        responses: { 200: { description: 'ok' } },
      }),
      context => context.json({}),
    );

    const document = application.getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 'change-password-probe', version: '1' },
    });

    return document.paths?.['/probe']?.post?.requestBody ?? {};
  };

  test('the required list is exactly the fields validation rejects when missing', () => {
    const schema = documentBody().content['application/json'].schema;

    const requiredByValidation = Object.keys(VALID_BODY).filter(field => {
      const withoutField = Object.fromEntries(
        Object.entries(VALID_BODY).filter(([key]) => key !== field),
      );
      return !ChangePasswordRequestSchema.safeParse(withoutField).success;
    });

    expect([...schema.required].sort()).toEqual(requiredByValidation.sort());
    expect(requiredByValidation.sort()).toEqual(
      ['newCredential', 'oldCredential', 'scheme', 'userId'].sort(),
    );
  });

  test('every documented example passes validation', () => {
    const schema = documentBody().content['application/json'].schema;

    expect(schema.examples.length).toBeGreaterThan(0);
    for (const example of schema.examples) {
      expect(ChangePasswordRequestSchema.safeParse(example).success).toBe(true);
    }
  });
});
