import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/types';
import { ControllerTransports } from '@/base/controllers/common/constants';
import { AppErrorMiddleware } from '@/base/middlewares';
import { StaticAssetComponent } from '@/components/static-asset';
import {
  StaticAssetComponentBindingKeys,
  type TStaticAssetsComponentOptions,
} from '@/components/static-asset/common';
import { MetadataRegistry } from '@/helpers/inversion/registry';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from './fake-storage.helper';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class TestApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'test-app', version: '0.0.0', description: 'Static asset component test app' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

/** Boots an application with the StaticAssetComponent configured against a fake storage helper. */
const bootStaticAssetApplication = async (opts: {
  helper: FakeStorageHelper;
  basePath?: string;
}): Promise<OpenAPIHono> => {
  const { helper, basePath = '/assets' } = opts;

  MetadataRegistry.getInstance().clearAll();
  const application = new TestApplication({
    scope: 'StaticAssetComponentApp',
    config: TEST_CONFIGS,
  });
  application.init();

  const componentOptions: TStaticAssetsComponentOptions = {
    default: {
      storage: 'disk',
      helper: helper as never,
      controller: { name: 'AssetController', basePath, isStrict: false },
    },
  };

  application
    .bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    })
    .toValue(componentOptions);

  const component = new StaticAssetComponent(application);
  await component.configure();
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());
  return server;
};

describe('StaticAssetComponent', () => {
  test('the link returned by an upload resolves back to the object route (flat object)', async () => {
    const helper = new FakeStorageHelper();
    const router = await bootStaticAssetApplication({ helper });

    const formData = new FormData();
    formData.append('files', new File(['flat'], 'photo.jpg', { type: 'image/jpeg' }));

    const uploadResponse = await router.request('/assets/buckets/images/upload', {
      method: 'POST',
      body: formData,
    });
    expect(uploadResponse.status).toBe(200);

    const uploaded = (await uploadResponse.json()) as Array<{ link: string }>;
    const getResponse = await router.request(uploaded[0].link);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('flat');
  });

  test('the link returned by a nested upload resolves back to the object route', async () => {
    const helper = new FakeStorageHelper();
    const router = await bootStaticAssetApplication({ helper });

    const formData = new FormData();
    formData.append('files', new File(['nested'], 'photo.jpg', { type: 'image/jpeg' }));

    const uploadResponse = await router.request(
      '/assets/buckets/images/upload?folderPath=photos/2024',
      { method: 'POST', body: formData },
    );
    expect(uploadResponse.status).toBe(200);

    const uploaded = (await uploadResponse.json()) as Array<{ link: string; objectName: string }>;
    expect(uploaded[0].objectName).toBe('photos/2024/photo.jpg');

    const getResponse = await router.request(uploaded[0].link);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('nested');
  });

  test('a bucket name that fails validation never reaches the storage backend', async () => {
    const helper = new FakeStorageHelper();
    const router = await bootStaticAssetApplication({ helper });

    const response = await router.request('/assets/buckets/%2e%2e%2fetc/objects/photo.jpg');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(helper.calls).toEqual([]);
  });
});
