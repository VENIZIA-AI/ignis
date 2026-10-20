import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { ControllerTransports } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

/** Where an application assigns its body limit: the constructor config, or (wrongly) a boot hook. */
class BodyLimitBootApplication extends BaseApplication {
  lateMiddlewares?: IApplicationConfigs['middlewares'];

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'body-limit-boot-app', version: '0.0.0', description: '' };
  }

  staticConfigure(): void {
    if (this.lateMiddlewares) {
      this.configs.middlewares = this.lateMiddlewares;
    }
  }

  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}

const BASE_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

const BODY_LIMIT: IApplicationConfigs['middlewares'] = {
  bodyLimit: { enable: true, maxSize: 10 },
};

describe('configs.middlewares.bodyLimit across the whole boot', () => {
  test('passed through the constructor config, an oversized body is a 413', async () => {
    const application = new BodyLimitBootApplication({
      scope: BodyLimitBootApplication.name,
      config: { ...BASE_CONFIGS, middlewares: BODY_LIMIT },
    });
    application.init();
    await application.initialize();

    const server = application.getServer();
    server.post('/echo', async context =>
      context.json({ length: (await context.req.text()).length }),
    );
    const response = await server.request('/echo', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'content-length': '100' },
      body: 'x'.repeat(100),
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('set in staticConfigure(), the boot is refused, naming the constructor config', async () => {
    const application = new BodyLimitBootApplication({
      scope: BodyLimitBootApplication.name,
      config: BASE_CONFIGS,
    });
    application.lateMiddlewares = BODY_LIMIT;
    application.init();

    const refusal = await application.initialize().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(String(refusal)).toContain('configs.middlewares.bodyLimit');
    expect(String(refusal)).toContain('constructor config');
  });
});
