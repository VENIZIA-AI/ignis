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
import {
  AssetUploadCommitService,
  AssetUploadPolicyService,
} from '@/components/static-asset/services';
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
  pendingPrefix?: string;
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
    directUpload: { ...ALLOW, pendingPrefix: opts.pendingPrefix },
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

  const policyService = application.get<AssetUploadPolicyService>({
    key: StaticAssetComponentBindingKeys.policyService({ name: 'photos' }),
  });
  const commitService = application.get<AssetUploadCommitService>({
    key: StaticAssetComponentBindingKeys.commitService({ name: 'photos' }),
  });

  return { application, server, policyService, commitService };
};

/** The message a call rejects with, or an empty string when it resolves. */
const messageOf = async (call: () => Promise<unknown>): Promise<string> => {
  try {
    await call();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return '';
};

describe('the policy and commit service bindings', () => {
  test('the keys are `@app/static-asset-component/{policy,commit}-service/<entry key>`', () => {
    expect(StaticAssetComponentBindingKeys.policyService({ name: 'photos' })).toBe(
      '@app/static-asset-component/policy-service/photos',
    );
    expect(StaticAssetComponentBindingKeys.commitService({ name: 'photos' })).toBe(
      '@app/static-asset-component/commit-service/photos',
    );
  });

  test('an entry that sets directUpload resolves to both services, and one that does not binds nothing', async () => {
    const { application, policyService, commitService } = await boot({
      helper: new FakeStorageHelper(),
    });

    expect(policyService).toBeInstanceOf(AssetUploadPolicyService);
    expect(commitService).toBeInstanceOf(AssetUploadCommitService);

    for (const key of [
      StaticAssetComponentBindingKeys.policyService({ name: 'plain' }),
      StaticAssetComponentBindingKeys.commitService({ name: 'plain' }),
    ]) {
      expect(application.get({ key, isOptional: true })).toBeUndefined();
    }
  });
});

describe('issuePolicies', () => {
  test('answers with the shape the upload-policy route answers with', async () => {
    const helper = new FakeStorageHelper();
    const { server, policyService } = await boot({ helper });

    const direct = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    const response = await server.request('/photos/upload-policy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ fileName: 'a.png' }] }),
    });
    const viaRoute = await response.json();
    const directShape = Object.fromEntries(
      Object.keys(direct[0]).map((key) => [key, expect.anything()]),
    );

    expect(response.status).toBe(200);
    expect(viaRoute).toEqual([expect.objectContaining(directShape)]);
    expect(direct[0].objectName).toStartWith('pending/');
    expect(direct[0].commitToken).toContain('.');
  });

  test('a file over the ceiling is refused before a policy is signed', async () => {
    const helper = new FakeStorageHelper();
    const { policyService } = await boot({ helper });

    const message = await messageOf(() =>
      policyService.issuePolicies({ files: [{ fileName: 'big.bin', size: 1025 }] }),
    );

    expect(message).toMatch(/over the 1024/);
    expect(helper.calls).toHaveLength(0);
  });

  test('the scope rides inside the pending key', async () => {
    const { policyService } = await boot({
      helper: new FakeStorageHelper(),
      keyPrefix: 'tenant-a',
    });

    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });

    expect(policy.objectName).toStartWith('pending/tenant-a/');
  });
});

describe('commit', () => {
  test('copies to the final key, removes the pending object and writes the MetaLink row', async () => {
    const helper = new FakeStorageHelper();
    const created: Array<Record<string, unknown>> = [];
    const { policyService, commitService } = await boot({
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

    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });
    helper.calls.length = 0;

    const result = await commitService.commit({
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
    const { commitService } = await boot({ helper });

    const message = await messageOf(() => commitService.commit({ commitToken: 'forged.token' }));

    expect(message).toMatch(/Invalid commit token/);
    expect(helper.calls).toHaveLength(0);
  });

  test('an expired token is refused before any storage call', async () => {
    const helper = new FakeStorageHelper();
    const { commitService } = await boot({ helper });
    const commitToken = AssetCommitToken.build({
      payload: { bucket: 'uploads', key: 'pending/x/a.png', expiresAt: Date.now() - 1000 },
      secretKey: SECRET,
    });

    const message = await messageOf(() => commitService.commit({ commitToken }));

    expect(message).toMatch(/expired/i);
    expect(helper.calls).toHaveLength(0);
  });

  /** A token another controller signed with the same secret must not land outside this scope. */
  test('a key outside keyPrefix is refused, and nothing is copied', async () => {
    const helper = new FakeStorageHelper();
    const { commitService } = await boot({ helper, keyPrefix: 'tenant-a' });
    const commitToken = AssetCommitToken.build({
      payload: {
        bucket: 'uploads',
        key: 'pending/tenant-b/x/a.png',
        expiresAt: Date.now() + 60_000,
      },
      secretKey: SECRET,
    });

    const message = await messageOf(() => commitService.commit({ commitToken }));

    expect(message).toMatch(/not found/i);
    expect(helper.calls.find((call) => call.method === 'copyObject')).toBeUndefined();
  });

  /** The commit strips what the policy prefixed; both read it from one place, so they cannot drift. */
  test('a custom pendingPrefix and a scope round-trip from policy to commit', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({
      helper,
      keyPrefix: 'tenant-a',
      pendingPrefix: 'tmp/',
    });

    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });
    const result = await commitService.commit({ commitToken: policy.commitToken });

    expect(policy.objectName).toStartWith('tmp/tenant-a/');
    expect(result.object.key).toStartWith('tenant-a/');
    expect(result.object.key).toBe(policy.objectName.slice('tmp/'.length));
  });
});
