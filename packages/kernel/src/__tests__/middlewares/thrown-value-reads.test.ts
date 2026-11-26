import { describe, expect, test } from 'bun:test';
import { MessageCode } from '@venizia/ignis-helpers/core';
import { Hono } from 'hono';
import { AuthenticationFieldCodecs } from '@/base/auth/authenticate/common/codecs';
import { DroppedRouteDecorators } from '@/base/metadata/routes/common';
import { BaseAppErrorMiddleware } from '@/base/middlewares';
import { ZodErrorHandler } from '@/base/middlewares/app-error/zod.handler';
import { MetadataRegistry } from '@/helpers/inversion';
import { model } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';

class OpenMiddleware extends BaseAppErrorMiddleware {
  render(error: unknown): string {
    return this.formatError({ error, includeStack: false });
  }
}

const format = (message: string) =>
  ZodErrorHandler.formatZodError({
    isProduction: false,
    requestId: 'r',
    url: 'http://app.example/x',
    path: '/x',
    error: new Error(message),
  });

describe('values the framework reads off untyped input', () => {
  test('a thrown function keeps its name in the log', () => {
    const thrown = function brokenCall() {};

    expect(new OpenMiddleware().render(thrown)).toContain('name: brokenCall');
    expect(new OpenMiddleware().render(undefined)).toContain('message:');
  });

  test('a messageCode that is no string and an extra that is no object are left out', async () => {
    const logged: string[] = [];
    const logger = {
      for: () => logger,
      error: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      log: (_: string, ...args: unknown[]) => logged.push(args.join(' ')),
    };
    const application = new Hono();
    application.get('/', () => {
      throw Object.assign(new Error('boom'), { messageCode: 7, extra: 'free text' });
    });
    application.onError(new BaseAppErrorMiddleware({ logger: logger as never }).value());

    const result = await application.request('/');
    const text = await result.text();

    expect(text).toContain(MessageCode.DEFAULT);
    expect(logged.join()).not.toContain('free text');
  });

  test('a Zod error message with entries that are no issues keeps the issues only', () => {
    const { response } = format('[null, 7, {"path":["a"],"message":"bad","code":"c"}]');

    expect(response.message).toBe('bad');
    expect(response.details.cause).toHaveLength(1);
  });

  test('a roles field that is not a list of strings is refused', () => {
    for (const raw of ['{}', '[1]', '"a|b|1"']) {
      expect(() => AuthenticationFieldCodecs.ROLES_CODEC.deserialize({ raw })).toThrow(
        'not a list of strings',
      );
    }
  });

  test('a dropped decorator on a symbol-named method is recorded, not thrown on', () => {
    DroppedRouteDecorators.isLegacyCall({
      decorator: 'get',
      propertyKey: { name: Symbol('list') },
    });

    expect(DroppedRouteDecorators.list()).toContain('@get Symbol(list)');
  });

  test('a TABLE_NAME that is no string leaves the class name as the table name', () => {
    @model()
    class OddlyNamedTable extends AbstractEntity {
      static readonly TABLE_NAME = 7;

      getSchema<T>(): T {
        return {} as T;
      }
    }

    expect(MetadataRegistry.getInstance().getModelEntry({ name: 'OddlyNamedTable' })?.target).toBe(
      OddlyNamedTable,
    );
  });
});
