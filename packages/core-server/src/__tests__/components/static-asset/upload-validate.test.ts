import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { StaticAssetControllerFactory } from '@/components/static-asset/controller';
import {
  StaticAssetValidation,
  type TStaticAssetEntry,
  type TStaticAssetRoutes,
} from '@/components/static-asset/common';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports, MetadataRegistry } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import { buildDirectUploadServices, type TDirectUploadOptions } from './direct-upload-services';
import { FakeStorageHelper } from './fake-storage.helper';

const SECRET = 'a-secret-nobody-else-has';
const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class ValidateApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'upload-validate-app', version: '0.0.0', description: '' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

/** An Excel import's issue: where in the workbook, and what is wrong. The component knows none of it. */
const CellIssueSchema = z.object({
  sheet: z.string(),
  row: z.number().int(),
  column: z.string(),
  code: z.string(),
  message: z.string(),
});

interface IValidationSpy {
  calls: Array<{
    key: string;
    size: number;
    content: string;
    owner?: string;
  }>;
}

/** A file whose name contains `bad` has one broken cell; every other file is clean. Only the file name counts: the key carries a random UUID, and `bad` is valid hex. */
const buildValidation = (spy: IValidationSpy) =>
  StaticAssetValidation.define({
    issueSchema: CellIssueSchema,
    handler: async ({ file, owner }) => {
      const stream = await file.stream();
      const response = new Response(stream);
      const content = await response.text();
      spy.calls.push({
        key: file.key,
        size: file.size,
        content,
        owner,
      });

      if (!file.key.split('/').pop()?.includes('bad')) {
        return { isValid: true, issues: [] };
      }

      return {
        isValid: false,
        issues: [
          {
            sheet: 'Orders',
            row: 12,
            column: 'D',
            code: 'NOT_A_NUMBER',
            message: 'Quantity must be a number',
          },
        ],
      };
    },
  });

const ALLOW: TDirectUploadOptions = {
  authorize: () => true,
  secretKey: SECRET,
  maxBytes: 1024,
};

const mount = async (opts: {
  helper: FakeStorageHelper;
  directUpload: TDirectUploadOptions;
  routes?: TStaticAssetRoutes;
}): Promise<OpenAPIHono> => {
  MetadataRegistry.getInstance().clearAll();
  const application = new ValidateApplication({ scope: 'ValidateApp', config: TEST_CONFIGS });
  application.init();

  const entry: TStaticAssetEntry = {
    basePath: '/assets',
    bucket: 'uploads',
    // Direct upload needs a scope of its own: the pending prefix stays outside it.
    keyPrefix: 'files/',
    serverUpload: { use: true },
    directUpload: { use: true, validation: { use: false }, ...opts.directUpload },
    metaLink: { use: false },
    routes: opts.routes,
    helper: opts.helper as never,
  };

  application.controller(
    StaticAssetControllerFactory.build({
      key: 'validate',
      entry,
      ...buildDirectUploadServices({ key: 'validate', entry }),
    }),
  );
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  return server;
};

const postJson = (router: OpenAPIHono, path: string, body: unknown, headers = {}) =>
  router.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

/** Asks for one policy and seeds the object a browser would have posted. */
const upload = async (opts: {
  router: OpenAPIHono;
  helper: FakeStorageHelper;
  fileName: string;
  headers?: Record<string, string>;
}) => {
  const response = await postJson(
    opts.router,
    '/assets/upload-policy',
    { files: [{ fileName: opts.fileName }] },
    opts.headers,
  );
  const result = await response.json();
  const [policy] = result as Array<{ objectName: string; commitToken: string }>;
  opts.helper.seedObject({ bucket: 'uploads', key: policy.objectName });

  return policy;
};

describe('the upload-validate route', () => {
  test('is absent without a validation: the app adds logic, the component adds the route', async () => {
    const helper = new FakeStorageHelper();
    const router = await mount({ helper, directUpload: ALLOW });

    const response = await postJson(router, '/assets/upload-validate', { commitToken: 'x.y' });

    expect(response.status).toBe(404);
  });

  test('answers valid for a clean file', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'orders.xlsx' });

    const response = await postJson(router, '/assets/upload-validate', {
      commitToken: policy.commitToken,
    });

    const answer = await response.json();

    expect(response.status).toBe(200);
    expect(answer).toEqual({ isValid: true, issues: [], commitToken: expect.any(String) });
  });

  test('hands the app a pinned file and the owner, and returns its issues in its own shape, with no token', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: {
        ...ALLOW,
        resolveOwner: ({ context }) => context.req.header('x-user') ?? '',
        validation: buildValidation(spy),
      },
    });
    const policy = await upload({
      router,
      helper,
      fileName: 'bad.xlsx',
      headers: { 'x-user': 'user-a' },
    });

    const response = await postJson(
      router,
      '/assets/upload-validate',
      { commitToken: policy.commitToken },
      { 'x-user': 'user-a' },
    );

    const answer = await response.json();

    expect(response.status).toBe(200);
    expect(answer).toEqual({
      isValid: false,
      issues: [
        {
          sheet: 'Orders',
          row: 12,
          column: 'D',
          code: 'NOT_A_NUMBER',
          message: 'Quantity must be a number',
        },
      ],
    });
    expect(answer).not.toHaveProperty('commitToken');
    expect(spy.calls).toEqual([
      {
        key: policy.objectName,
        size: 'seeded'.length,
        content: 'seeded',
        owner: 'user-a',
      },
    ]);
  });

  test('authorize returning false is a 403, and the app is never asked', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    let isOpen = true;
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, authorize: () => isOpen, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'orders.xlsx' });
    isOpen = false;

    const response = await postJson(router, '/assets/upload-validate', {
      commitToken: policy.commitToken,
    });

    expect(response.status).toBe(403);
    expect(spy.calls).toHaveLength(0);
  });

  test('a token issued to another owner is refused as invalid, and the app is never asked', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: {
        ...ALLOW,
        resolveOwner: ({ context }) => context.req.header('x-user') ?? '',
        validation: buildValidation(spy),
      },
    });
    const policy = await upload({
      router,
      helper,
      fileName: 'orders.xlsx',
      headers: { 'x-user': 'user-a' },
    });

    const response = await postJson(
      router,
      '/assets/upload-validate',
      { commitToken: policy.commitToken },
      { 'x-user': 'user-b' },
    );
    const answer = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(answer)).toContain('core.static_asset.invalid_commit_token');
    expect(spy.calls).toHaveLength(0);
  });

  test('routes.uploadValidate: false drops it', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
      routes: { uploadValidate: { use: false } },
    });

    const response = await postJson(router, '/assets/upload-validate', { commitToken: 'x.y' });

    expect(response.status).toBe(404);
  });
});

const commitWith = (router: OpenAPIHono, commitToken: string | undefined, headers = {}) =>
  postJson(router, '/assets/upload-commit', { commitToken }, headers);

const validateAs = async (opts: {
  router: OpenAPIHono;
  commitToken: string;
  headers?: Record<string, string>;
}) => {
  const response = await postJson(
    opts.router,
    '/assets/upload-validate',
    { commitToken: opts.commitToken },
    opts.headers,
  );
  const answer = await response.json();
  const { commitToken } = answer as { commitToken?: string };

  return { response, answer, commitToken };
};

describe('commit takes the validated token', () => {
  test('the token the policy issued is refused with UPLOAD_NOT_VALIDATED, and nothing is copied or removed', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'orders.xlsx' });
    helper.calls.length = 0;

    const response = await commitWith(router, policy.commitToken);
    const answer = await response.json();

    expect(response.status).toBe(422);
    expect(JSON.stringify(answer)).toContain('core.static_asset.upload_not_validated');
    expect(spy.calls).toHaveLength(0);
    expect(helper.calls.find((call) => call.method === 'copyObject')).toBeUndefined();
    expect(helper.calls.find((call) => call.method === 'removeObject')).toBeUndefined();
  });

  test('the token validate returned commits, and the handler is not run again', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'orders.xlsx' });

    const validated = await validateAs({ router, commitToken: policy.commitToken });
    const response = await commitWith(router, validated.commitToken);

    expect(validated.commitToken).toBeString();
    expect(validated.commitToken).not.toBe(policy.commitToken);
    expect(response.status).toBe(200);
    expect(spy.calls).toHaveLength(1);
    expect(helper.calls.find((call) => call.method === 'copyObject')?.args).toMatchObject({
      ifMatch: expect.stringContaining('fake-etag'),
    });
  });

  test('an overwrite between validate and commit is refused with UPLOAD_CHANGED, and nothing is copied or removed', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'orders.xlsx' });
    const validated = await validateAs({ router, commitToken: policy.commitToken });
    helper.overwriteObject({ bucket: 'uploads', key: policy.objectName });
    helper.calls.length = 0;

    const response = await commitWith(router, validated.commitToken);
    const answer = await response.json();

    expect(response.status).toBe(409);
    expect(JSON.stringify(answer)).toContain('core.static_asset.upload_changed');
    expect(helper.calls.find((call) => call.method === 'removeObject')).toBeUndefined();
    expect(
      helper.hasObject({
        bucket: { name: 'uploads' },
        object: { key: policy.objectName.slice('pending/'.length) },
      }),
    ).toBe(false);
  });

  test('an overwrite inside the handler is a 409 from validate itself', async () => {
    const helper = new FakeStorageHelper();
    const policyKey: { value?: string } = {};
    const router = await mount({
      helper,
      directUpload: {
        ...ALLOW,
        validation: StaticAssetValidation.define({
          issueSchema: CellIssueSchema,
          handler: async ({ file }) => {
            helper.overwriteObject({ bucket: 'uploads', key: policyKey.value ?? '' });
            const stream = await file.stream();
            const response2 = new Response(stream);
            await response2.text();

            return { isValid: true, issues: [] };
          },
        }),
      },
    });
    const policy = await upload({ router, helper, fileName: 'orders.xlsx' });
    policyKey.value = policy.objectName;

    const response = await postJson(router, '/assets/upload-validate', {
      commitToken: policy.commitToken,
    });
    const answer = await response.json();

    expect(response.status).toBe(409);
    expect(JSON.stringify(answer)).toContain('core.static_asset.upload_changed');
  });

  test('an invalid file gets no token, so there is nothing to commit with', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'bad.xlsx' });

    const validated = await validateAs({ router, commitToken: policy.commitToken });
    const response = await commitWith(router, policy.commitToken);

    expect(validated.answer).not.toHaveProperty('commitToken');
    expect(response.status).toBe(422);
    expect(helper.calls.find((call) => call.method === 'copyObject')).toBeUndefined();
  });

  test('validating again pins again: the second token commits the new content', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'orders.xlsx' });

    const first = await validateAs({ router, commitToken: policy.commitToken });
    helper.overwriteObject({ bucket: 'uploads', key: policy.objectName, content: 'second' });
    const second = await validateAs({ router, commitToken: first.commitToken ?? '' });
    const stale = await commitWith(router, first.commitToken);
    const fresh = await commitWith(router, second.commitToken);

    expect(second.commitToken).not.toBe(first.commitToken);
    expect(spy.calls.map((call) => call.content)).toEqual(['seeded', 'second']);
    expect(stale.status).toBe(409);
    expect(fresh.status).toBe(200);
  });

  test('a validated token held by another owner is refused as an invalid token', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: {
        ...ALLOW,
        resolveOwner: ({ context }) => context.req.header('x-user') ?? '',
        validation: buildValidation(spy),
      },
    });
    const policy = await upload({
      router,
      helper,
      fileName: 'orders.xlsx',
      headers: { 'x-user': 'user-a' },
    });
    const validated = await validateAs({
      router,
      commitToken: policy.commitToken,
      headers: { 'x-user': 'user-a' },
    });

    const refused = await commitWith(router, validated.commitToken, { 'x-user': 'user-b' });
    const answer = await refused.json();
    const accepted = await commitWith(router, validated.commitToken, { 'x-user': 'user-a' });

    expect(refused.status).toBe(400);
    expect(JSON.stringify(answer)).toContain('core.static_asset.invalid_commit_token');
    expect(accepted.status).toBe(200);
  });

  /** The route is how a client reaches `validate`; without it no token ever becomes validated, so a commit is refused. An app that disables it commits through the service. */
  test('with the validate route disabled, commit has no validated token to take and refuses the issued one', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
      routes: { uploadValidate: { use: false } },
    });
    const policy = await upload({ router, helper, fileName: 'bad.xlsx' });

    const response = await commitWith(router, policy.commitToken);
    const answer = await response.json();

    expect(response.status).toBe(422);
    expect(JSON.stringify(answer)).toContain('core.static_asset.upload_not_validated');
  });
});

describe('StaticAssetValidation.define', () => {
  test('a handler that answers another shape of issue fails type-checking', () => {
    StaticAssetValidation.define({
      issueSchema: CellIssueSchema,
      handler: () => ({
        isValid: false,
        issues: [
          {
            sheet: 'Orders',
            // @ts-expect-error `row` is a number in the schema, so a string is not an issue
            row: 'twelve',
            column: 'D',
            code: 'X',
            message: 'm',
          },
        ],
      }),
    });

    expect(true).toBe(true);
  });
});

describe('a per-route path override', () => {
  /** `api.md` documents `path` among the route overrides; this is the proof. */
  test('serves upload-policy and upload-validate at the overridden path and no longer at the default', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
      routes: {
        uploadPolicy: { use: true, path: '/ask-policy' },
        uploadValidate: { use: true, path: '/check-file' },
      },
    });

    const overriddenPolicy = await postJson(router, '/assets/ask-policy', {
      files: [{ fileName: 'orders.xlsx' }],
    });
    const defaultPolicy = await postJson(router, '/assets/upload-policy', {
      files: [{ fileName: 'orders.xlsx' }],
    });
    const result = await overriddenPolicy.json();
    const [policy] = result as Array<{ objectName: string; commitToken: string }>;
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });
    const overriddenValidate = await postJson(router, '/assets/check-file', {
      commitToken: policy.commitToken,
    });
    const defaultValidate = await postJson(router, '/assets/upload-validate', {
      commitToken: policy.commitToken,
    });

    expect(overriddenPolicy.status).toBe(200);
    expect(defaultPolicy.status).toBe(404);
    expect(overriddenValidate.status).toBe(200);
    expect(defaultValidate.status).toBe(404);
  });
});
