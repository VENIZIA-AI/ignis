import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { GRPC, HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import {
  AuthenticationModes,
  AuthenticationStrategyRegistry,
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  Container,
} from '@venizia/ignis-kernel';
import type {
  IAuthenticationStrategy,
  IAuthorizeOptions,
  IRpcMetadata,
} from '@venizia/ignis-kernel';
import type { TContext } from '@venizia/ignis-kernel';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import { createFreshRegistry, TestAuthorizationEnforcer } from '../authorize/helpers';

/** `greeter.v1.GreeterService` with one unary method, `SayHello`: the descriptor `protoc-gen-es` writes. */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIh8KD1NheUhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJIiMKEFNheUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTJXCg5HcmVldGVyU2VydmljZRJFCghTYXlIZWxsbxIbLmdyZWV0ZXIudjEuU2F5SGVsbG9SZXF1ZXN0GhwuZ3JlZXRlci52MS5TYXlIZWxsb1Jlc3BvbnNlYgZwcm90bzM',
  ),
  0,
);

/** A strategy that accepts one header value, as a real one accepts a token. */
const headerStrategy = (header: string) => {
  return class implements IAuthenticationStrategy {
    name = header;

    async authenticate(context: TContext) {
      if (context.req.header(header) !== 'ok') {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
          message: `Bad ${header}`,
        });
      }

      return { userId: 'u1', principalType: 'user' };
    }
  };
};

const KEY = 'x-grpc-key';
const TENANT = 'x-grpc-tenant';

AuthenticationStrategyRegistry.getInstance().register({
  container: new Container({ scope: 'grpc-auth-strategies' }),
  strategies: [
    { name: KEY, strategy: headerStrategy(KEY) },
    { name: TENANT, strategy: headerStrategy(TENANT) },
  ],
});

/** The real `authorize` middleware over an enforcer that allows `read` and denies `delete`. */
const useEnforcer = () => {
  const registry = createFreshRegistry();
  const container = new Container({ scope: 'grpc-auth-enforcer' });
  container
    .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
    .toValue({ defaultDecision: 'deny' });
  registry.register({
    container,
    enforcers: [
      {
        enforcer: TestAuthorizationEnforcer,
        name: 'test',
        type: AuthorizationEnforcerTypes.CUSTOM,
      },
    ],
  });
  TestAuthorizationEnforcer.rules = [
    { action: 'read', resource: 'Greeting', effect: 'allow' },
    { action: 'delete', resource: 'Greeting', effect: 'deny' },
  ];
};

const call = async (opts: {
  configs: Pick<IRpcMetadata, 'authenticate' | 'authorize'>;
  headers?: Record<string, string>;
}) => {
  let ran = 0;

  class GreeterController extends BaseGrpcController {
    override binding() {
      this.defineRoute({
        configs: { name: 'sayHello', method: GRPC.Methods.UNARY, ...opts.configs },
        handler: () => {
          ran += 1;

          return { message: 'hello' };
        },
      });
    }
  }

  const controller = new GreeterController({ scope: 'GreeterController', path: '/grpc' });
  controller.service = GreeterService;
  await controller.configure();

  const response = await controller.getRouter().request(
    '/greeter.v1.GreeterService/SayHello',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: '{}',
    },
    { NODE_ENV: 'production' },
  );
  const body = await response.json();

  return { status: response.status, body, ran };
};

const one = { authenticate: { strategies: [KEY] } };

describe('gRPC adapter - the real authenticate and authorize middleware', () => {
  test('a good credential reaches the handler', async () => {
    const result = await call({ configs: one, headers: { [KEY]: 'ok' } });

    expect(result).toEqual({ status: 200, body: { message: 'hello' }, ran: 1 });
  });

  const refused: Array<Record<string, string>> = [{}, { [KEY]: 'wrong' }];

  for (const headers of refused) {
    test(`${JSON.stringify(headers)} is unauthenticated; the handler does not run`, async () => {
      const result = await call({ configs: one, headers });

      expect(result.status).toBe(401);
      expect(result.body).toHaveProperty('code', 'unauthenticated');
      expect(result.ran).toBe(0);
    });
  }

  test('ANY mode passes with one of the two credentials', async () => {
    const result = await call({
      configs: { authenticate: { strategies: [KEY, TENANT], mode: AuthenticationModes.ANY } },
      headers: { [TENANT]: 'ok' },
    });

    expect(result.ran).toBe(1);
  });

  test('ALL mode needs both credentials', async () => {
    const configs: Pick<IRpcMetadata, 'authenticate'> = {
      authenticate: { strategies: [KEY, TENANT], mode: AuthenticationModes.ALL },
    };
    const missing = await call({ configs, headers: { [KEY]: 'ok' } });
    const both = await call({ configs, headers: { [KEY]: 'ok', [TENANT]: 'ok' } });

    expect(missing.body).toHaveProperty('code', 'unauthenticated');
    expect(missing.ran).toBe(0);
    expect(both.ran).toBe(1);
  });

  test('an allowed action reaches the handler', async () => {
    useEnforcer();
    const result = await call({
      configs: { ...one, authorize: { action: 'read', resource: 'Greeting' } },
      headers: { [KEY]: 'ok' },
    });

    expect(result).toEqual({ status: 200, body: { message: 'hello' }, ran: 1 });
  });

  test('a denied action is permission_denied', async () => {
    useEnforcer();
    const result = await call({
      configs: { ...one, authorize: { action: 'delete', resource: 'Greeting' } },
      headers: { [KEY]: 'ok' },
    });

    expect(result.status).toBe(403);
    expect(result.body).toHaveProperty('code', 'permission_denied');
    expect(result.ran).toBe(0);
  });

  test('every spec must allow: one that allows then one that denies refuses', async () => {
    useEnforcer();
    const result = await call({
      configs: {
        ...one,
        authorize: [
          { action: 'read', resource: 'Greeting' },
          { action: 'delete', resource: 'Greeting' },
        ],
      },
      headers: { [KEY]: 'ok' },
    });

    expect(result.body).toHaveProperty('code', 'permission_denied');
    expect(result.ran).toBe(0);
  });
});
