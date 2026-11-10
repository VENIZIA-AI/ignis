import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { StaticAssetComponent } from '@/components/static-asset';
import {
  AssetCommitToken,
  StaticAssetComponentBindingKeys,
  type TDirectUploadOptions,
  type TMetaLinkConfig,
  type TStaticAssetsComponentOptions,
} from '@/components/static-asset/common';
import { AssetDirectUpload } from '@/components/static-asset/controller';
import { BaseMetaLinkModel } from '@/components/static-asset/models';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports, MetadataRegistry } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from './fake-storage.helper';

const SECRET = 'a-secret-nobody-else-has';
const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class ServiceApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'direct-upload-service-app', version: '0.0.0', description: '' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

const ALLOW: TDirectUploadOptions = { authorize: () => true, secretKey: SECRET, maxBytes: 1024 };

/** One entry with direct upload and one without, so the key is shown to exist only where it should. */
const boot = async (opts: {
  helper: FakeStorageHelper;
  keyPrefix?: string;
  metaLink?: TMetaLinkConfig;
}) => {
  MetadataRegistry.getInstance().clearAll();
  const application = new ServiceApplication({
    scope: 'DirectUploadServiceApp',
    config: TEST_CONFIGS,
  });
  application.init();

  const photoController = {
    name: 'PhotoController',
    basePath: '/photos',
    isStrict: false,
    bucket: 'uploads',
    keyPrefix: opts.keyPrefix,
    directUpload: ALLOW,
  };
  const photos: TStaticAssetsComponentOptions[string] = opts.metaLink
    ? {
        storage: 'disk',
        helper: opts.helper as never,
        useMetaLink: true,
        metaLink: opts.metaLink,
        controller: photoController,
      }
    : { storage: 'disk', helper: opts.helper as never, controller: photoController };

  const options: TStaticAssetsComponentOptions = {
    photos,
    plain: {
      storage: 'disk',
      helper: new FakeStorageHelper() as never,
      controller: { name: 'PlainController', basePath: '/plain', isStrict: false },
    },
  };

  const component = new StaticAssetComponent(application);
  await component.configure(options);
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  const service = application.get<AssetDirectUpload>({
    key: StaticAssetComponentBindingKeys.directUpload({ name: 'photos' }),
  });

  return { application, server, service };
};

describe('the AssetDirectUpload binding', () => {
  test('the key is `@app/static-asset-component/direct-upload/<entry key>`', () => {
    expect(StaticAssetComponentBindingKeys.directUpload({ name: 'photos' })).toBe(
      '@app/static-asset-component/direct-upload/photos',
    );
  });

  test('an entry that sets directUpload resolves to an instance, and one that does not binds nothing', async () => {
    const { application, service } = await boot({ helper: new FakeStorageHelper() });

    expect(service).toBeInstanceOf(AssetDirectUpload);
    expect(
      application.get({
        key: StaticAssetComponentBindingKeys.directUpload({ name: 'plain' }),
        isOptional: true,
      }),
    ).toBeUndefined();
  });
});

describe('issuePolicies', () => {
  test('answers with the shape the upload-policy route answers with', async () => {
    const helper = new FakeStorageHelper();
    const { server, service } = await boot({ helper });

    const direct = await service.issuePolicies({ files: [{ fileName: 'a.png' }] });
    const response = await server.request('/photos/upload-policy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ fileName: 'a.png' }] }),
    });
    const viaRoute = (await response.json()) as typeof direct;

    expect(response.status).toBe(200);
    expect(Object.keys(direct[0]).sort()).toEqual(Object.keys(viaRoute[0]).sort());
    expect(direct[0].objectName).toStartWith('pending/');
    expect(direct[0].commitToken).toContain('.');
  });

  test('a file over the ceiling is refused before a policy is signed', async () => {
    const helper = new FakeStorageHelper();
    const { service } = await boot({ helper });

    await expect(
      service.issuePolicies({ files: [{ fileName: 'big.bin', size: 1025 }] }),
    ).rejects.toThrow(/over the 1024/);
    expect(helper.calls).toHaveLength(0);
  });

  test('the scope rides inside the pending key', async () => {
    const { service } = await boot({ helper: new FakeStorageHelper(), keyPrefix: 'tenant-a' });

    const [policy] = await service.issuePolicies({ files: [{ fileName: 'a.png' }] });

    expect(policy.objectName).toStartWith('pending/tenant-a/');
  });
});

describe('commit', () => {
  test('copies to the final key, removes the pending object and writes the MetaLink row', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const { service } = await boot({
      helper,
      metaLink: {
        model: BaseMetaLinkModel,
        repository: {
          create: async (opts: { data: Record<string, unknown> }) => {
            created.push(opts.data);

            return { count: 1, data: { id: 'meta-1', ...opts.data } };
          },
        } as never,
      },
    });

    const [policy] = await service.issuePolicies({ files: [{ fileName: 'a.png' }] });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });
    helper.calls.length = 0;

    const result = await service.commit({
      commitToken: policy.commitToken,
      labels: { principalType: 'user', principalId: '7' },
    });

    const finalKey = policy.objectName.slice('pending/'.length);

    expect(result.object).toEqual({ key: finalKey });
    expect(result.bucket).toEqual({ name: 'uploads' });
    expect(result.link).toStartWith('/photos/objects/');
    expect(helper.calls.find((call) => call.method === 'copyObject')?.args).toMatchObject({
      source: policy.objectName,
      destination: finalKey,
    });
    expect(helper.calls.find((call) => call.method === 'removeObject')?.args).toMatchObject({
      name: policy.objectName,
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      bucketName: 'uploads',
      objectName: finalKey,
      principalType: 'user',
      principalId: '7',
    });
    expect(result.metaLink).toHaveProperty('data');
  });

  test('a forged token is refused before any storage call', async () => {
    const helper = new FakeStorageHelper();
    const { service } = await boot({ helper });

    await expect(service.commit({ commitToken: 'forged.token' })).rejects.toThrow();
    expect(helper.calls).toHaveLength(0);
  });

  test('an expired token is refused before any storage call', async () => {
    const helper = new FakeStorageHelper();
    const { service } = await boot({ helper });
    const commitToken = AssetCommitToken.build({
      payload: { bucket: 'uploads', key: 'pending/x/a.png', expiresAt: Date.now() - 1000 },
      secretKey: SECRET,
    });

    await expect(service.commit({ commitToken })).rejects.toThrow(/expired/i);
    expect(helper.calls).toHaveLength(0);
  });

  /** A token another controller signed with the same secret must not land outside this scope. */
  test('a key outside keyPrefix is refused, and nothing is copied', async () => {
    const helper = new FakeStorageHelper();
    const { service } = await boot({ helper, keyPrefix: 'tenant-a' });
    const commitToken = AssetCommitToken.build({
      payload: {
        bucket: 'uploads',
        key: 'pending/tenant-b/x/a.png',
        expiresAt: Date.now() + 60_000,
      },
      secretKey: SECRET,
    });

    await expect(service.commit({ commitToken })).rejects.toThrow(/not found/i);
    expect(helper.calls.find((call) => call.method === 'copyObject')).toBeUndefined();
  });
});
