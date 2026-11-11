import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AppErrorMiddleware } from '@/base/middlewares';
import { StaticAssetComponent } from '@/components/static-asset';
import {
  StaticAssetBindingKeys,
  StaticAssetTokenStages,
  StaticAssetValidation,
  type TMetaLinkConfig,
  type TStaticAssetComponentOptions,
} from '@/components/static-asset/common';
import { StaticAssetCommitTokenUtility } from '@/components/static-asset/utilities';
import {
  StaticAssetUploadCommitService,
  StaticAssetUploadPolicyService,
} from '@/components/static-asset/services';
import { z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { ApplicationError } from '@venizia/ignis-helpers/core';
import { DurationUnits } from '@venizia/ignis-helpers/common';
import type { IDuration, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports, MetadataRegistry } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';
import type { TDirectUploadOptions } from './direct-upload-services';
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

const ALLOW: TDirectUploadOptions = {
  authorize: () => true,
  secretKey: SECRET,
  maxBytes: 1024,
};

/** One entry with direct upload and one without, so the key is shown to exist only where it should. */
const boot = async (opts: {
  helper: FakeStorageHelper;
  keyPrefix?: string;
  pendingPrefix?: string;
  directUpload?: Partial<TDirectUploadOptions>;
  metaLink?: TMetaLinkConfig;
}) => {
  // Direct upload needs a scope of its own: the pending prefix stays outside it.
  const keyPrefix = opts.keyPrefix ?? 'files/';

  MetadataRegistry.getInstance().clearAll();
  const application = new ServiceApplication({
    scope: 'DirectUploadServiceApp',
    config: TEST_CONFIGS,
  });
  application.init();

  const options: TStaticAssetComponentOptions = {
    photos: {
      basePath: '/photos',
      bucket: 'uploads',
      keyPrefix,
      serverUpload: { use: true },
      directUpload: {
        use: true,
        validation: { use: false },
        ...ALLOW,
        pendingPrefix: opts.pendingPrefix,
        ...opts.directUpload,
      },
      metaLink: opts.metaLink ? { use: true, ...opts.metaLink } : { use: false },
      helper: opts.helper as never,
    },
    plain: {
      basePath: '/plain',
      bucket: 'plain',
      serverUpload: { use: true },
      directUpload: { use: false },
      metaLink: { use: false },
      helper: new FakeStorageHelper() as never,
    },
  };

  const component = new StaticAssetComponent(application);
  await component.configure(options);
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  const policyService = application.get<StaticAssetUploadPolicyService>({
    key: StaticAssetBindingKeys.policyService({ name: 'photos' }),
  });
  const commitService = application.get<StaticAssetUploadCommitService>({
    key: StaticAssetBindingKeys.commitService({ name: 'photos' }),
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

/** What a call rejects with: the message, the HTTP status and the machine code a client branches on. */
const failureOf = async (
  call: () => Promise<unknown>,
): Promise<{ message: string; statusCode?: number; code?: string }> => {
  try {
    await call();
  } catch (error) {
    if (error instanceof ApplicationError) {
      return {
        message: error.message,
        statusCode: error.statusCode,
        code: error.normalized.code,
      };
    }

    return { message: String(error) };
  }

  return { message: '' };
};

describe('the policy and commit service bindings', () => {
  test('the keys are `@app/static-asset/{policy,commit}-service/<entry key>`', () => {
    expect(StaticAssetBindingKeys.policyService({ name: 'photos' })).toBe(
      '@app/static-asset/policy-service/photos',
    );
    expect(StaticAssetBindingKeys.commitService({ name: 'photos' })).toBe(
      '@app/static-asset/commit-service/photos',
    );
  });

  test('an entry that sets directUpload resolves to both services, and one that does not binds nothing', async () => {
    const { application, policyService, commitService } = await boot({
      helper: new FakeStorageHelper(),
    });

    expect(policyService).toBeInstanceOf(StaticAssetUploadPolicyService);
    expect(commitService).toBeInstanceOf(StaticAssetUploadCommitService);

    for (const key of [
      StaticAssetBindingKeys.policyService({ name: 'plain' }),
      StaticAssetBindingKeys.commitService({ name: 'plain' }),
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
    expect(direct[0].objectName).toStartWith('pending/files/');
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
      token: policy.commitToken,
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

    const message = await messageOf(() => commitService.commit({ token: 'forged.token' }));

    expect(message).toMatch(/Invalid commit token/);
    expect(helper.calls).toHaveLength(0);
  });

  test('an expired token is refused before any storage call', async () => {
    const helper = new FakeStorageHelper();
    const { commitService } = await boot({ helper });
    const commitToken = StaticAssetCommitTokenUtility.build({
      payload: {
        bucket: { name: 'uploads' },
        object: { key: 'pending/files/x/a.png' },
        expiresAt: Date.now() - 1000,
        stage: StaticAssetTokenStages.ISSUED,
      },
      secretKey: SECRET,
    });

    const message = await messageOf(() => commitService.commit({ token: commitToken }));

    expect(message).toMatch(/expired/i);
    expect(helper.calls).toHaveLength(0);
  });

  /** A token another controller signed with the same secret must not land outside this scope. */
  test('a key outside keyPrefix is refused, and nothing is copied', async () => {
    const helper = new FakeStorageHelper();
    const { commitService } = await boot({ helper, keyPrefix: 'tenant-a' });
    const commitToken = StaticAssetCommitTokenUtility.build({
      payload: {
        bucket: { name: 'uploads' },
        object: { key: 'pending/tenant-b/x/a.png' },
        expiresAt: Date.now() + 60_000,
        stage: StaticAssetTokenStages.ISSUED,
      },
      secretKey: SECRET,
    });

    const message = await messageOf(() => commitService.commit({ token: commitToken }));

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
    const result = await commitService.commit({ token: policy.commitToken });

    expect(policy.objectName).toStartWith('tmp/tenant-a/');
    expect(result.object.key).toStartWith('tenant-a/');
    expect(result.object.key).toBe(policy.objectName.slice('tmp/'.length));
  });
});

describe('a token issued to an owner', () => {
  test('commits for that owner', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });

    const [policy] = await policyService.issuePolicies({
      files: [{ fileName: 'a.png' }],
      owner: 'user-a',
    });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });

    const result = await commitService.commit({ token: policy.commitToken, owner: 'user-a' });

    expect(result.object.key).toBe(policy.objectName.slice('pending/'.length));
  });

  /** One error for every refusal, so a caller cannot tell a wrong owner from a forged token. */
  test.each([
    ['another owner', 'user-b'],
    ['no owner', undefined],
  ])('is refused for %s as an invalid token, before any storage call', async (_label, owner) => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({
      files: [{ fileName: 'a.png' }],
      owner: 'user-a',
    });
    helper.calls.length = 0;

    const message = await messageOf(() =>
      commitService.commit({ token: policy.commitToken, owner }),
    );

    expect(message).toBe('Invalid commit token');
    expect(helper.calls).toHaveLength(0);
  });

  test('a token issued with no owner commits for anyone, as before', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });

    const result = await commitService.commit({ token: policy.commitToken, owner: 'user-b' });

    expect(result.object.key).toBe(policy.objectName.slice('pending/'.length));
  });
});

describe('verify', () => {
  test('returns the pending object and touches no storage', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({
      files: [{ fileName: 'a.png' }],
      owner: 'user-a',
    });
    helper.calls.length = 0;

    const pending = commitService.verify({ token: policy.commitToken, owner: 'user-a' });

    expect(pending).toEqual({ bucket: { name: 'uploads' }, object: { key: policy.objectName } });
    expect(helper.calls).toHaveLength(0);
  });

  test('refuses a forged token', async () => {
    const helper = new FakeStorageHelper();
    const { commitService } = await boot({ helper });

    expect(() => commitService.verify({ token: 'forged.token' })).toThrow('Invalid commit token');
    expect(helper.calls).toHaveLength(0);
  });

  test('refuses an expired token', async () => {
    const helper = new FakeStorageHelper();
    const { commitService } = await boot({ helper });
    const token = StaticAssetCommitTokenUtility.build({
      payload: {
        bucket: { name: 'uploads' },
        object: { key: 'pending/files/x/a.png' },
        expiresAt: Date.now() - 1000,
        stage: StaticAssetTokenStages.ISSUED,
      },
      secretKey: SECRET,
    });

    expect(() => commitService.verify({ token })).toThrow(/expired/i);
    expect(helper.calls).toHaveLength(0);
  });

  test.each([
    ['another owner', 'user-b'],
    ['no owner', undefined],
  ])('refuses %s', async (_label, owner) => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({
      files: [{ fileName: 'a.png' }],
      owner: 'user-a',
    });

    expect(() => commitService.verify({ token: policy.commitToken, owner })).toThrow(
      'Invalid commit token',
    );
  });

  test('refuses a key outside keyPrefix', async () => {
    const helper = new FakeStorageHelper();
    const { commitService } = await boot({ helper, keyPrefix: 'tenant-a' });
    const token = StaticAssetCommitTokenUtility.build({
      payload: {
        bucket: { name: 'uploads' },
        object: { key: 'pending/tenant-b/x/a.png' },
        expiresAt: Date.now() + 60_000,
        stage: StaticAssetTokenStages.ISSUED,
      },
      secretKey: SECRET,
    });

    expect(() => commitService.verify({ token })).toThrow(/not found/i);
    expect(helper.calls).toHaveLength(0);
  });
});

describe('validate', () => {
  test('with no validation configured every file is valid, and the token is still verified', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });

    const answer = await commitService.validate({ token: policy.commitToken });
    helper.calls.length = 0;
    const forged = await messageOf(() => commitService.validate({ token: 'forged.token' }));

    expect(answer).toEqual({ isValid: true, issues: [], commitToken: expect.any(String) });
    expect(forged).toBe('Invalid commit token');
    expect(helper.calls).toHaveLength(0);
  });

  test('with no validation configured the validated token still pins, and commit copies conditionally', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });

    const answer = await commitService.validate({ token: policy.commitToken });
    const payload = StaticAssetCommitTokenUtility.read({
      token: answer.commitToken ?? '',
      secretKey: SECRET,
    });
    await commitService.commit({ token: answer.commitToken ?? '' });

    expect(payload.stage).toBe(StaticAssetTokenStages.VALIDATED);
    expect(helper.calls.find((call) => call.method === 'copyObject')?.args).toMatchObject({
      ifMatch: payload.pin?.etag,
    });
  });

  test('a token another owner holds is refused before any storage call', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({
      files: [{ fileName: 'a.png' }],
      owner: 'user-a',
    });
    helper.calls.length = 0;

    const message = await messageOf(() =>
      commitService.validate({ token: policy.commitToken, owner: 'user-b' }),
    );

    expect(message).toBe('Invalid commit token');
    expect(helper.calls).toHaveLength(0);
  });
});

const PendingIssueSchema = z.object({ code: z.string() });

interface IHandlerCall {
  key: string;
  size: number;
  etag: string;
  contentType: string;
  owner?: string;
}

/** A validation that records what it was handed and then reads the file, which is what a real one does. `beforeRead` runs between the two: the moment an overwrite would land. */
const buildPinnedValidation = (opts: { calls: IHandlerCall[]; beforeRead?: () => void }) =>
  StaticAssetValidation.define({
    issueSchema: PendingIssueSchema,
    handler: async ({ file, owner }) => {
      opts.calls.push({
        key: file.key,
        size: file.size,
        etag: file.etag,
        contentType: file.contentType,
        owner,
      });
      opts.beforeRead?.();

      const stream = await file.stream();
      const response = new Response(stream);
      const text = await response.text();

      if (text.includes('invalid')) {
        return { isValid: false, issues: [{ code: 'INVALID_CONTENT' }] };
      }

      return { isValid: true, issues: [] };
    },
  });

/** Asks for one policy, seeds what a browser would have posted, and boots with the validation on. */
const bootValidated = async (opts: {
  helper: FakeStorageHelper;
  calls: IHandlerCall[];
  owner?: string;
  beforeRead?: () => void;
}) => {
  const { helper, calls, owner, beforeRead } = opts;
  const booted = await boot({
    helper,
    directUpload: { validation: buildPinnedValidation({ calls, beforeRead }) },
  });
  const [policy] = await booted.policyService.issuePolicies({
    files: [{ fileName: 'a.png' }],
    owner,
  });
  helper.seedObject({ bucket: 'uploads', key: policy.objectName });

  return { ...booted, policy, destination: { key: policy.objectName.slice('pending/'.length) } };
};

const readToken = (token: string | undefined) =>
  StaticAssetCommitTokenUtility.read({ token: token ?? '', secretKey: SECRET });

describe('a validation that pins the content', () => {
  test('hands the handler the file as it is now, and answers a validated token bound to it', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls, owner: 'user-a' });
    const incoming = readToken(policy.commitToken);
    const stat = await helper.getStat({
      bucket: { name: 'uploads' },
      object: { key: policy.objectName },
    });

    const answer = await commitService.validate({ token: policy.commitToken, owner: 'user-a' });
    const payload = readToken(answer.commitToken);

    expect(answer.isValid).toBe(true);
    expect(calls).toEqual([
      {
        key: policy.objectName,
        size: 'seeded'.length,
        etag: stat.etag ?? '',
        contentType: 'image/png',
        owner: 'user-a',
      },
    ]);
    expect(incoming.stage).toBe(StaticAssetTokenStages.ISSUED);
    expect(incoming.pin).toBeUndefined();
    expect(payload).toEqual({
      bucket: { name: 'uploads' },
      object: { key: policy.objectName },
      owner: 'user-a',
      expiresAt: incoming.expiresAt,
      stage: StaticAssetTokenStages.VALIDATED,
      pin: { etag: stat.etag ?? '', versionId: undefined },
    });
  });

  test('an invalid file gets its issues and no token', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls });
    helper.overwriteObject({
      bucket: 'uploads',
      key: policy.objectName,
      content: 'invalid cell',
    });

    const answer = await commitService.validate({ token: policy.commitToken });

    expect(answer).toEqual({ isValid: false, issues: [{ code: 'INVALID_CONTENT' }] });
    expect(answer.commitToken).toBeUndefined();
  });

  test('a stat that reports no ETag fails validate with a clear error, and the handler never runs', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls });
    helper.omitEtag = true;

    const failure = await failureOf(() => commitService.validate({ token: policy.commitToken }));

    expect(failure.message).toMatch(/no ETag/);
    expect(calls).toHaveLength(0);
  });

  test('validating twice pins again: the second token carries the new ETag', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls });

    const first = await commitService.validate({ token: policy.commitToken });
    helper.overwriteObject({ bucket: 'uploads', key: policy.objectName });
    const second = await commitService.validate({ token: first.commitToken ?? '' });

    expect(readToken(first.commitToken).pin?.etag).not.toBe(
      readToken(second.commitToken).pin?.etag,
    );
    expect(calls).toHaveLength(2);
    expect(calls[1].etag).toBe(readToken(second.commitToken).pin?.etag ?? '');
  });

  test('a validated token is refused for another owner before any storage call', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls, owner: 'user-a' });
    const answer = await commitService.validate({ token: policy.commitToken, owner: 'user-a' });
    helper.calls.length = 0;

    for (const owner of ['user-b', undefined]) {
      const message = await messageOf(() =>
        commitService.commit({ token: answer.commitToken ?? '', owner }),
      );

      expect(message).toBe('Invalid commit token');
    }

    expect(helper.calls).toHaveLength(0);
  });

  test('a validated token is refused once it expires, as an expired token', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls });
    const expired = StaticAssetCommitTokenUtility.build({
      payload: {
        bucket: { name: 'uploads' },
        object: { key: policy.objectName },
        expiresAt: Date.now() - 1000,
        stage: StaticAssetTokenStages.VALIDATED,
        pin: { etag: '"x"' },
      },
      secretKey: SECRET,
    });
    helper.calls.length = 0;

    const failure = await failureOf(() => commitService.commit({ token: expired }));

    expect(failure.code).toBe('core.static_asset.expired_commit_token');
    expect(helper.calls).toHaveLength(0);
  });

  test('an overwrite inside the handler, before it reads, makes file.stream() fail as changed', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({
      helper,
      calls,
      beforeRead: () => {
        helper.overwriteObject({ bucket: 'uploads', key: policy.objectName });
      },
    });

    const failure = await failureOf(() => commitService.validate({ token: policy.commitToken }));

    expect(failure.code).toBe('core.static_asset.upload_changed');
    expect(failure.statusCode).toBe(409);
  });

  test('a pending object removed inside the handler also reads as changed', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({
      helper,
      calls,
      beforeRead: () => {
        helper.discardObject({ bucket: 'uploads', key: policy.objectName });
      },
    });

    const failure = await failureOf(() => commitService.validate({ token: policy.commitToken }));

    expect(failure.code).toBe('core.static_asset.upload_changed');
  });

  test('a read that fails for any other reason is not reported as a change', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls });
    helper.failReadsWith = 'storage is down';

    const failure = await failureOf(() => commitService.validate({ token: policy.commitToken }));

    expect(failure.message).toBe('storage is down');
    expect(failure.code).not.toBe('core.static_asset.upload_changed');
  });
});

describe('commit with a validation on', () => {
  test('refuses the token the policy issued, and touches nothing', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy, destination } = await bootValidated({ helper, calls });
    helper.calls.length = 0;

    const failure = await failureOf(() => commitService.commit({ token: policy.commitToken }));

    expect(failure.code).toBe('core.static_asset.upload_not_validated');
    expect(failure.statusCode).toBe(422);
    expect(calls).toHaveLength(0);
    expect(helper.calls).toHaveLength(0);
    expect(helper.hasObject({ bucket: { name: 'uploads' }, object: destination })).toBe(false);
  });

  test('commits the validated token and never runs the handler again', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy, destination } = await bootValidated({ helper, calls });
    const answer = await commitService.validate({ token: policy.commitToken });
    helper.calls.length = 0;

    const result = await commitService.commit({ token: answer.commitToken ?? '' });

    expect(calls).toHaveLength(1);
    expect(result.object).toEqual(destination);
    expect(helper.hasObject({ bucket: { name: 'uploads' }, object: destination })).toBe(true);
    expect(helper.calls.map((call) => call.method)).not.toContain('getObjectStream');
  });

  test('an overwrite between validate and commit is refused as changed, and nothing is copied or removed', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy, destination } = await bootValidated({ helper, calls });
    const answer = await commitService.validate({ token: policy.commitToken });
    helper.overwriteObject({ bucket: 'uploads', key: policy.objectName });
    helper.calls.length = 0;

    const failure = await failureOf(() =>
      commitService.commit({ token: answer.commitToken ?? '' }),
    );

    expect(failure.code).toBe('core.static_asset.upload_changed');
    expect(failure.statusCode).toBe(409);
    expect(helper.calls.find((call) => call.method === 'removeObject')).toBeUndefined();
    expect(helper.hasObject({ bucket: { name: 'uploads' }, object: destination })).toBe(false);
    expect(
      helper.hasObject({ bucket: { name: 'uploads' }, object: { key: policy.objectName } }),
    ).toBe(true);
  });

  /** With a pin, a pending object that is gone is a change, like other content. */
  test('a pending object removed after validate fails the commit as UPLOAD_CHANGED, and nothing is committed', async () => {
    const helper = new FakeStorageHelper();
    const calls: IHandlerCall[] = [];
    const { commitService, policy, destination } = await bootValidated({ helper, calls });
    const answer = await commitService.validate({ token: policy.commitToken });
    helper.discardObject({ bucket: 'uploads', key: policy.objectName });

    const failure = await failureOf(() =>
      commitService.commit({ token: answer.commitToken ?? '' }),
    );

    expect(failure.statusCode).toBe(409);
    expect(failure.code).toBe('core.static_asset.upload_changed');
    expect(helper.hasObject({ bucket: { name: 'uploads' }, object: destination })).toBe(false);
  });

  test('a versioned bucket pins the version: reads and the copy ask for it, and carry no ETag', async () => {
    const helper = new FakeStorageHelper();
    helper.isVersioned = true;
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls });

    const answer = await commitService.validate({ token: policy.commitToken });
    const payload = readToken(answer.commitToken);
    await commitService.commit({ token: answer.commitToken ?? '' });
    const read = helper.calls.find((call) => call.method === 'getObjectStream');
    const copy = helper.calls.find((call) => call.method === 'copyObject');

    expect(payload.pin?.versionId).toStartWith('fake-version-');
    expect(read?.args.versionId).toBe(payload.pin?.versionId);
    expect(read?.args.ifMatch).toBeUndefined();
    expect(copy?.args.sourceVersionId).toBe(payload.pin?.versionId);
    expect(copy?.args.ifMatch).toBeUndefined();
  });

  test('an overwrite on a versioned bucket is refused as changed too', async () => {
    const helper = new FakeStorageHelper();
    helper.isVersioned = true;
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls });
    const answer = await commitService.validate({ token: policy.commitToken });
    helper.overwriteObject({ bucket: 'uploads', key: policy.objectName });

    const failure = await failureOf(() =>
      commitService.commit({ token: answer.commitToken ?? '' }),
    );

    expect(failure.code).toBe('core.static_asset.upload_changed');
  });

  /** A bucket where versioning is off or suspended answers no version id, an empty one or the literal `null`. None of them names a version, so the ETag is the pin. */
  test.each([
    ['no version id', undefined],
    ['an empty version id', ''],
    ['the literal null', 'null'],
  ])('%s: the ETag is the pin, and no version is asked for', async (_label, reported) => {
    const helper = new FakeStorageHelper();
    helper.reportedVersionId = reported;
    const calls: IHandlerCall[] = [];
    const { commitService, policy } = await bootValidated({ helper, calls });

    const answer = await commitService.validate({ token: policy.commitToken });
    const payload = readToken(answer.commitToken);
    await commitService.commit({ token: answer.commitToken ?? '' });
    const read = helper.calls.find((call) => call.method === 'getObjectStream');
    const copy = helper.calls.find((call) => call.method === 'copyObject');

    expect(payload.pin?.versionId).toBeUndefined();
    expect(payload.pin?.etag).toStartWith('"fake-etag-');
    expect(read?.args.ifMatch).toBe(payload.pin?.etag);
    expect(read?.args.versionId).toBeUndefined();
    expect(copy?.args.ifMatch).toBe(payload.pin?.etag);
    expect(copy?.args.sourceVersionId).toBeUndefined();
  });

  test('the literal null from a versioned-looking stat does not make the pin unmatchable', async () => {
    const helper = new FakeStorageHelper();
    helper.isVersioned = true;
    helper.reportedVersionId = 'null';
    const calls: IHandlerCall[] = [];
    const { commitService, policy, destination } = await bootValidated({ helper, calls });

    const answer = await commitService.validate({ token: policy.commitToken });
    const result = await commitService.commit({ token: answer.commitToken ?? '' });

    expect(result.object).toEqual(destination);
  });
});

describe('commit with no validation', () => {
  test('an issued token commits with an unconditional copy', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });

    await commitService.commit({ token: policy.commitToken });
    const copy = helper.calls.find((call) => call.method === 'copyObject');

    expect(copy?.args.ifMatch).toBeUndefined();
    expect(copy?.args.sourceVersionId).toBeUndefined();
  });

  test('a validated token still guards the copy: an overwrite after validate is refused', async () => {
    const helper = new FakeStorageHelper();
    const { policyService, commitService } = await boot({ helper });
    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    helper.seedObject({ bucket: 'uploads', key: policy.objectName });
    const answer = await commitService.validate({ token: policy.commitToken });
    helper.overwriteObject({ bucket: 'uploads', key: policy.objectName });

    const failure = await failureOf(() =>
      commitService.commit({ token: answer.commitToken ?? '' }),
    );

    expect(failure.code).toBe('core.static_asset.upload_changed');
  });
});

describe('expires.commit', () => {
  const POLICY_WINDOW: IDuration = { unit: DurationUnits.MINUTE, value: 1 };
  const COMMIT_WINDOW: IDuration = { unit: DurationUnits.HOUR, value: 2 };
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  test('sets the token lifetime on its own, and leaves the policy expiry alone', async () => {
    const { policyService } = await boot({
      helper: new FakeStorageHelper(),
      directUpload: { expires: { upload: POLICY_WINDOW, commit: COMMIT_WINDOW } },
    });

    const before = Date.now();
    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    const payload = StaticAssetCommitTokenUtility.read({
      token: policy.commitToken,
      secretKey: SECRET,
    });

    expect(payload.expiresAt).toBeGreaterThanOrEqual(before + TWO_HOURS_MS);
    expect(payload.expiresAt).toBeLessThan(before + TWO_HOURS_MS + 5000);
    expect(new Date(policy.expiresAt).getTime()).toBeLessThan(payload.expiresAt);
  });

  test('absent, it falls back to upload: the token dies with the policy', async () => {
    const { policyService } = await boot({ helper: new FakeStorageHelper() });

    const [policy] = await policyService.issuePolicies({ files: [{ fileName: 'a.png' }] });
    const payload = StaticAssetCommitTokenUtility.read({
      token: policy.commitToken,
      secretKey: SECRET,
    });

    expect(payload.expiresAt).toBe(new Date(policy.expiresAt).getTime());
  });

  test('an unusable duration is refused when the service is built', async () => {
    let message = '';

    try {
      await boot({
        helper: new FakeStorageHelper(),
        directUpload: { expires: { commit: { unit: DurationUnits.HOUR, value: 0 } } },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('expires.commit');
  });
});
