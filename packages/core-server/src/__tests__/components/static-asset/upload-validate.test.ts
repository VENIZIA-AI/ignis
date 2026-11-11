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
  calls: Array<{ bucket: string; key: string; owner?: string; hasHelper: boolean }>;
}

/** A file whose name contains `bad` has one broken cell; every other file is clean. */
const buildValidation = (spy: IValidationSpy) =>
  StaticAssetValidation.define({
    issueSchema: CellIssueSchema,
    handler: ({ bucket, object, owner, helper }) => {
      spy.calls.push({
        bucket: bucket.name,
        key: object.key,
        owner,
        hasHelper: helper !== undefined,
      });

      if (!object.key.includes('bad')) {
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
    expect(answer).toEqual({ isValid: true, issues: [] });
  });

  test('hands the app the pending object, the helper and the owner, and returns its issues in its own shape', async () => {
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
    expect(spy.calls).toEqual([
      { bucket: 'uploads', key: policy.objectName, owner: 'user-a', hasHelper: true },
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

describe('commit re-runs the validation', () => {
  test('an invalid file is refused with UPLOAD_INVALID, and nothing is copied or removed', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'bad.xlsx' });
    helper.calls.length = 0;

    const response = await postJson(router, '/assets/upload-commit', {
      commitToken: policy.commitToken,
    });
    const answer = await response.json();

    expect(response.status).toBe(422);
    expect(JSON.stringify(answer)).toContain('core.static_asset.upload_invalid');
    expect(helper.calls.find((call) => call.method === 'copyObject')).toBeUndefined();
    expect(helper.calls.find((call) => call.method === 'removeObject')).toBeUndefined();
  });

  test('a valid file is committed, and the validation ran once more on the way', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
    });
    const policy = await upload({ router, helper, fileName: 'orders.xlsx' });

    await postJson(router, '/assets/upload-validate', { commitToken: policy.commitToken });
    const response = await postJson(router, '/assets/upload-commit', {
      commitToken: policy.commitToken,
    });

    expect(response.status).toBe(200);
    expect(spy.calls).toHaveLength(2);
    expect(helper.calls.find((call) => call.method === 'copyObject')).toBeDefined();
  });

  test('with the validate route disabled, commit still refuses an invalid file', async () => {
    const helper = new FakeStorageHelper();
    const spy: IValidationSpy = { calls: [] };
    const router = await mount({
      helper,
      directUpload: { ...ALLOW, validation: buildValidation(spy) },
      routes: { uploadValidate: { use: false } },
    });
    const policy = await upload({ router, helper, fileName: 'bad.xlsx' });

    const response = await postJson(router, '/assets/upload-commit', {
      commitToken: policy.commitToken,
    });

    expect(response.status).toBe(422);
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
