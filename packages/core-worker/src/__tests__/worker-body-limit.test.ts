import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { HTTP } from '@venizia/ignis-helpers/common';
import { WorkerApplication } from '@/applications/worker';
import { BffEnvelope } from '@/envelope/encode';
import type { IBffResponseEnvelope } from '@/envelope/common';

/** The real boot sequence, not an overridden `initialize()`: the check lives in its steps. */
class BodyLimitWorkerApplication extends WorkerApplication {
  lateMiddlewares?: IApplicationConfigs['middlewares'];

  getAppInfo(): IApplicationInfo {
    return { name: 'core-worker-body-limit-test', version: '0.0.0', description: '' };
  }

  staticConfigure() {
    if (this.lateMiddlewares) {
      this.configs.middlewares = this.lateMiddlewares;
    }
  }

  preConfigure() {}
  postConfigure() {}

  setupMiddlewares() {
    this.getServer().post('/echo', async context =>
      context.json({ length: (await context.req.text()).length }),
    );
  }
}

const BASE_CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

const BODY_LIMIT: IApplicationConfigs['middlewares'] = {
  bodyLimit: { enable: true, maxSize: 10 },
};

describe('WorkerApplication - configs.middlewares.bodyLimit', () => {
  test('passed through the constructor config, an oversized body is a 413', async () => {
    const application = new BodyLimitWorkerApplication({
      scope: BodyLimitWorkerApplication.name,
      config: { ...BASE_CONFIGS, middlewares: BODY_LIMIT },
    });
    const { port1, port2 } = new MessageChannel();
    await application.listen({ scope: port1 });

    const received = new Promise<IBffResponseEnvelope>(resolve => {
      port2.addEventListener('message', event => {
        resolve(event.data);
      });
      port2.start();
    });
    port2.postMessage(
      await BffEnvelope.encodeRequest({
        id: 'body-limit-1',
        request: new Request('http://ignis.internal/echo', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'x'.repeat(100),
        }),
      }),
    );

    expect((await received).status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
    await application.stop();
  });

  test('set in staticConfigure(), listen() is refused, naming the constructor config', async () => {
    const application = new BodyLimitWorkerApplication({
      scope: BodyLimitWorkerApplication.name,
      config: BASE_CONFIGS,
    });
    application.lateMiddlewares = BODY_LIMIT;
    const { port1 } = new MessageChannel();

    const refusal = await application.listen({ scope: port1 }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(String(refusal)).toContain('configs.middlewares.bodyLimit');
    expect(String(refusal)).toContain('constructor config');
    await application.stop();
  });
});
