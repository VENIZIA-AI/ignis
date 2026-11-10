import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import { AssetCommitToken, AssetTokenCodecs } from '@/components/static-asset/common';
import {
  AssetPresignService,
  AssetServiceBindingKeys,
  AssetServicesComponent,
  AssetSettleService,
  type TAssetServicesComponentOptions,
} from '@/components/static-asset/service';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { RecordUtility } from '@venizia/ignis-helpers';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from '../fake-storage.helper';

// -----------------------------------------------------------------------------
// The services bind into the container by name, with no route, so a service that only verifies a token or settles an
// upload can inject them.
// -----------------------------------------------------------------------------
const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class ServicesApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'services-app', version: '0.0.0', description: '' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

interface IPayload {
  key: string;
  expiresAt: number;
}

const isPayload = (value: unknown): value is IPayload =>
  RecordUtility.isPlainRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.expiresAt === 'number';

const token = new AssetCommitToken<IPayload>({
  secretKey: 'test-secret-not-real',
  codec: AssetTokenCodecs.signedJson<IPayload>({ isPayload }),
  expiresAtOf: ({ payload }) => payload.expiresAt,
});
const settle = AssetSettleService.build({
  helper: new FakeStorageHelper(),
  bucket: 'bkt',
  tags: { temp: 'false' },
});
const presign = AssetPresignService.build<IPayload, object>({
  helper: new FakeStorageHelper(),
  bucket: 'bkt',
  token,
  allowedExtensions: ['.png'],
  maxBytes: 1024,
  buildPayload: ({ key, issuedAt }) => ({ key, expiresAt: issuedAt + 1000 }),
});

const boot = async (options: TAssetServicesComponentOptions) => {
  MetadataRegistry.getInstance().clearAll();
  const application = new ServicesApplication({ scope: 'ServicesApp', config: TEST_CONFIGS });
  application.init();

  const component = new AssetServicesComponent(application);
  await component.configure(options);

  return application;
};

describe('AssetServicesComponent', () => {
  test('each service is bound under its own key, by name, and is the very instance that was given', async () => {
    const application = await boot({ attachments: { token, presign, settle } });

    expect(application.get({ key: AssetServiceBindingKeys.token({ name: 'attachments' }) })).toBe(
      token,
    );
    expect(application.get({ key: AssetServiceBindingKeys.presign({ name: 'attachments' }) })).toBe(
      presign,
    );
    expect(application.get({ key: AssetServiceBindingKeys.settle({ name: 'attachments' }) })).toBe(
      settle,
    );
  });

  test('only what an entry gives is bound, and two names do not share anything', async () => {
    const other = new AssetCommitToken<IPayload>({
      secretKey: 'another-secret',
      codec: AssetTokenCodecs.signedJson<IPayload>({ isPayload }),
      expiresAtOf: ({ payload }) => payload.expiresAt,
    });
    const application = await boot({ first: { token }, second: { token: other, settle } });

    expect(application.get({ key: AssetServiceBindingKeys.token({ name: 'first' }) })).toBe(token);
    expect(application.get({ key: AssetServiceBindingKeys.token({ name: 'second' }) })).toBe(other);
    expect(application.isBound({ key: AssetServiceBindingKeys.settle({ name: 'first' }) })).toBe(
      false,
    );
    expect(application.isBound({ key: AssetServiceBindingKeys.presign({ name: 'second' }) })).toBe(
      false,
    );
  });

  test('it registers no route and no controller', async () => {
    const application = await boot({ attachments: { token, presign, settle } });
    await application['registerControllers']();

    expect(application.getRootRouter().routes).toEqual([]);
  });

  test('an entry that binds nothing is refused, because it is surely a mistake', async () => {
    await RejectionHelper.expectRejection({
      task: boot({ empty: {} }),
      message: 'entry binds nothing',
    });
  });

  test("the keys carry the name, so a name cannot reach another name's service", () => {
    expect(AssetServiceBindingKeys.token({ name: 'a' })).not.toBe(
      AssetServiceBindingKeys.token({ name: 'b' }),
    );
    expect(AssetServiceBindingKeys.token({ name: 'a' })).not.toBe(
      AssetServiceBindingKeys.settle({ name: 'a' }),
    );
    expect(AssetServiceBindingKeys.token({ name: 'a' })).not.toBe(
      AssetServiceBindingKeys.presign({ name: 'a' }),
    );
  });
});
