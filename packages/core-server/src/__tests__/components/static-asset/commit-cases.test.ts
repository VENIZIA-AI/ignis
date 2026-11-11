import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { StaticAssetValidation, type TStaticAssetEntry } from '@/components/static-asset/common';
import { StaticAssetControllerFactory } from '@/components/static-asset/controller';
import type { StaticAssetUploadCommitService } from '@/components/static-asset/services';
import { StaticAssetEntryUtility } from '@/components/static-asset/utilities/entry.utility';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports, MetadataRegistry } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from './fake-storage.helper';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class CasesApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'commit-cases-app', version: '0.0.0', description: '' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

class RecordingRepository {
  readonly rows: Array<Record<string, unknown>> = [];

  async create(opts: { data: Record<string, unknown> }) {
    const row = { id: String(this.rows.length + 1), ...opts.data };
    this.rows.push(row);

    return { count: 1, data: row };
  }
}

const validation = StaticAssetValidation.define({
  issueSchema: z.object({ row: z.number().int(), message: z.string() }),
  handler: () => ({ isValid: true, issues: [] }),
});

/** One entry per combination of the two switches; `commitRoute: false` leaves the commit to the application's own code. */
const mount = async (opts: { isValidated: boolean; hasCommitRoute: boolean }) => {
  MetadataRegistry.getInstance().clearAll();
  const application = new CasesApplication({ scope: 'CasesApp', config: TEST_CONFIGS });
  application.init();

  const helper = new FakeStorageHelper();
  const repository = new RecordingRepository();
  const entry: TStaticAssetEntry = {
    basePath: '/assets',
    bucket: 'uploads',
    keyPrefix: 'files/',
    serverUpload: { use: false },
    directUpload: {
      use: true,
      secretKey: 'a-secret-nobody-else-has',
      maxBytes: 1024 * 1024,
      authorize: () => true,
      validation: opts.isValidated ? validation : { use: false },
    },
    metaLink: { use: true, repository: repository as never },
    routes: opts.hasCommitRoute ? undefined : { uploadCommit: { use: false } },
    helper: helper as never,
  };
  const services = StaticAssetEntryUtility.buildDirectUploadServices({
    resolved: StaticAssetEntryUtility.resolve({ key: 'cases', entry }),
  });

  if (!services) {
    throw new Error('the entry turns direct upload on, so it has its services');
  }

  application.controller(StaticAssetControllerFactory.build({ key: 'cases', entry, ...services }));
  await application['registerControllers']();

  const router = application.getServer() as OpenAPIHono;
  router.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  router.route(TEST_CONFIGS.path.base, application.getRootRouter());

  return { router, helper, repository, commitService: services.commitService };
};

const post = async (opts: { router: OpenAPIHono; path: string; body: unknown }) => {
  const response = await opts.router.request(opts.path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts.body),
  });
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;

  if (isJson) {
    const body: unknown = await response.json();

    return { status: response.status, body };
  }

  const text = await response.text();

  return { status: response.status, body: text };
};

/** Asks for one policy, then seeds the object a browser would have posted to the storage. */
const issue = async (opts: { router: OpenAPIHono; helper: FakeStorageHelper }) => {
  const { status, body } = await post({
    router: opts.router,
    path: '/assets/upload-policy',
    body: { files: [{ fileName: 'orders.xlsx', size: 48213 }] },
  });
  expect(status).toBe(200);
  const [policy] = z
    .array(z.object({ objectName: z.string(), commitToken: z.string() }).loose())
    .parse(body);
  opts.helper.seedObject({ bucket: 'uploads', key: policy.objectName });

  return policy;
};

const CodeSchema = z.object({ normalized: z.object({ code: z.string() }).loose() }).loose();

const readCode = (body: unknown) => CodeSchema.parse(body).normalized.code;

const finalKeyOf = (policy: { objectName: string }) => policy.objectName.slice('pending/'.length);

describe('case (a): validation off, commit route on', () => {
  test('policy, post, then upload-commit with the policy token', async () => {
    const { router, helper, repository } = await mount({
      isValidated: false,
      hasCommitRoute: true,
    });
    const policy = await issue({ router, helper });

    const validate = await post({
      router,
      path: '/assets/upload-validate',
      body: { commitToken: policy.commitToken },
    });
    const commit = await post({
      router,
      path: '/assets/upload-commit',
      body: { commitToken: policy.commitToken },
    });

    expect(validate.status).toBe(404);
    expect(commit.status).toBe(200);
    expect(commit.body).toMatchObject({
      bucket: { name: 'uploads' },
      object: { key: finalKeyOf(policy) },
      metaLink: { data: { bucketName: 'uploads', objectName: finalKeyOf(policy) } },
    });
    const copy = helper.calls.find((call) => call.method === 'copyObject');
    expect(copy?.args.ifMatch).toBeUndefined();
    expect(copy?.args.sourceVersionId).toBeUndefined();
    expect(repository.rows).toHaveLength(1);
  });
});

describe('case (b): validation on, commit route on', () => {
  test('policy, post, upload-validate, then upload-commit with the token validate returned', async () => {
    const { router, helper } = await mount({ isValidated: true, hasCommitRoute: true });
    const policy = await issue({ router, helper });

    const validate = await post({
      router,
      path: '/assets/upload-validate',
      body: { commitToken: policy.commitToken },
    });
    const validated = z
      .object({ isValid: z.literal(true), issues: z.array(z.unknown()), commitToken: z.string() })
      .parse(validate.body);
    const commit = await post({
      router,
      path: '/assets/upload-commit',
      body: { commitToken: validated.commitToken },
    });

    expect(validate.status).toBe(200);
    expect(validated.issues).toEqual([]);
    expect(validated.commitToken).not.toBe(policy.commitToken);
    expect(commit.status).toBe(200);
    const copy = helper.calls.find((call) => call.method === 'copyObject');
    expect(copy?.args.ifMatch).toStartWith('"fake-etag-');
  });

  test('upload-commit with the policy token is upload_not_validated', async () => {
    const { router, helper } = await mount({ isValidated: true, hasCommitRoute: true });
    const policy = await issue({ router, helper });

    const commit = await post({
      router,
      path: '/assets/upload-commit',
      body: { commitToken: policy.commitToken },
    });

    expect(commit.status).toBe(422);
    expect(readCode(commit.body)).toBe('core.static_asset.upload_not_validated');
    expect(helper.calls.find((call) => call.method === 'copyObject')).toBeUndefined();
  });
});

describe('case (c): validation on, commit route off', () => {
  test('upload-validate answers the token, and the application commits through the service', async () => {
    const { router, helper, commitService, repository } = await mount({
      isValidated: true,
      hasCommitRoute: false,
    });
    const policy = await issue({ router, helper });

    const validate = await post({
      router,
      path: '/assets/upload-validate',
      body: { commitToken: policy.commitToken },
    });
    const { commitToken } = z.object({ commitToken: z.string() }).parse(validate.body);
    const route = await post({
      router,
      path: '/assets/upload-commit',
      body: { commitToken },
    });
    const committed = await commitService.commit({
      token: commitToken,
      owner: undefined,
      labels: { principalType: 'Import', principalId: '42' },
    });

    expect(route.status).toBe(404);
    expect(committed.object.key).toBe(finalKeyOf(policy));
    expect(repository.rows[0]).toMatchObject({ principalType: 'Import', principalId: '42' });
  });

  test('the service refuses the policy token', async () => {
    const { router, helper, commitService } = await mount({
      isValidated: true,
      hasCommitRoute: false,
    });
    const policy = await issue({ router, helper });

    let failure = '';

    try {
      await commitService.commit({ token: policy.commitToken });
    } catch (error) {
      failure = String(error);
    }

    expect(failure).toContain('The upload has not been validated');
  });
});

describe('case (d): validation off, commit route off', () => {
  test('the application commits with the policy token while it saves its record', async () => {
    const { router, helper, commitService, repository } = await mount({
      isValidated: false,
      hasCommitRoute: false,
    });
    const policy = await issue({ router, helper });

    const validate = await post({
      router,
      path: '/assets/upload-validate',
      body: { commitToken: policy.commitToken },
    });
    const route = await post({
      router,
      path: '/assets/upload-commit',
      body: { commitToken: policy.commitToken },
    });
    const committed: Awaited<ReturnType<StaticAssetUploadCommitService['commit']>> =
      await commitService.commit({ token: policy.commitToken });

    expect(validate.status).toBe(404);
    expect(route.status).toBe(404);
    expect(committed.object.key).toBe(finalKeyOf(policy));
    expect(repository.rows).toHaveLength(1);
  });
});

describe('nobody commits', () => {
  test('the object stays under the pending prefix, with no row and nothing at the final key', async () => {
    const { router, helper, repository } = await mount({ isValidated: true, hasCommitRoute: true });
    const policy = await issue({ router, helper });
    await post({
      router,
      path: '/assets/upload-validate',
      body: { commitToken: policy.commitToken },
    });

    expect(
      helper.hasObject({ bucket: { name: 'uploads' }, object: { key: policy.objectName } }),
    ).toBe(true);
    expect(
      helper.hasObject({ bucket: { name: 'uploads' }, object: { key: finalKeyOf(policy) } }),
    ).toBe(false);
    expect(repository.rows).toEqual([]);
    expect(helper.calls.find((call) => call.method === 'copyObject')).toBeUndefined();
  });
});
