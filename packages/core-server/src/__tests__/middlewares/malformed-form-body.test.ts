import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { TRouteContext } from '@/base/controllers';
import { BaseRestController } from '@/base/controllers';
import { controller } from '@/base/metadata';
import { AssetControllerFactory } from '@/components/static-asset/controller';
import { StaticAssetStorageTypes } from '@/components/static-asset/common';
import { RequestTrackerComponent } from '@/components/request-tracker';
import { z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { parseMultipartBody } from '@venizia/ignis-helpers';
import { HTTP, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports, jsonResponse, MetadataRegistry } from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from '../components/static-asset/fake-storage.helper';

/**
 * A malformed form body is the caller's fault in every environment. The request spy used to parse
 * every form first and answer 400; it parses forms only in development now, so the framework's own
 * form readers must give the same answer wherever the parse happens.
 */
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const BODY_MALFORMED_CODE = 'core.request.body_malformed';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

@controller({ path: '/hand' })
class HandParsedController extends BaseRestController {
  constructor() {
    super({ scope: HandParsedController.name, path: '/hand', isStrict: false });
  }

  override binding(): ValueOrPromise<void> {
    // Declares no body, so no validator runs: the handler is the first to read the form.
    this.bindRoute({
      configs: {
        method: HTTP.Methods.POST,
        path: '/',
        responses: jsonResponse({ schema: z.object({ count: z.number() }), description: 'Files' }),
      },
    }).to({
      handler: async (context: TRouteContext) => {
        const { files } = await parseMultipartBody({ context });
        return context.json({ count: files.length }, 200);
      },
    });
  }
}

class MalformedBodyApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'malformed-body-app', version: '0.0.0', description: '' };
  }
  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

/** The real default stack - request id, error envelope, request spy - plus the two routes under test. */
const boot = async (opts: { environment: string; helper: FakeStorageHelper }) => {
  process.env.NODE_ENV = opts.environment;
  MetadataRegistry.getInstance().clearAll();

  const application = new MalformedBodyApplication({
    scope: 'MalformedBodyApp',
    config: TEST_CONFIGS,
  });
  application.init();
  await application['registerDefaultMiddlewares']();
  await new RequestTrackerComponent(application).configure();

  application.controller(HandParsedController);
  application.controller(
    AssetControllerFactory.defineAssetController({
      controller: { name: 'MalformedAssetController', basePath: '/assets', bucket: 'images' },
      storage: StaticAssetStorageTypes.DISK,
      helper: opts.helper,
    }),
  );
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());
  return server;
};

const postMalformed = (opts: { server: OpenAPIHono; path: string }) =>
  opts.server.request(opts.path, {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=missing',
      'x-forwarded-for': '10.0.0.1',
    },
    body: 'not a multipart body',
  });

describe('a malformed multipart body is a 400 in every environment', () => {
  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
      return;
    }
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  for (const environment of ['production', 'development']) {
    test(`a route that parses the body by hand answers 400 in '${environment}'`, async () => {
      const server = await boot({ environment, helper: new FakeStorageHelper() });

      const response = await postMalformed({ server, path: '/hand' });

      expect(response.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
      expect(JSON.stringify(await response.json())).toContain(BODY_MALFORMED_CODE);
    });

    test(`the static-asset upload route answers 400 in '${environment}'`, async () => {
      const helper = new FakeStorageHelper();
      const server = await boot({ environment, helper });

      const response = await postMalformed({ server, path: '/assets/objects' });

      expect(response.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
      expect(JSON.stringify(await response.json())).toContain(BODY_MALFORMED_CODE);
      expect(helper.calls).toEqual([]);
    });
  }
});
