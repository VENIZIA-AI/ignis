import { BaseApplication } from '@/base/applications/base';
import {
  AbstractSecretsHelper,
  SecretProviders,
  SystemEnvsHelper,
  formatLogMessage,
  type AnyType,
  type ISecretsRegistration,
} from '@venizia/ignis-helpers';
import { Logger } from '@venizia/ignis-helpers/winston';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';

// Mirrors the leaky shape of real Vault transport errors (token/secret_id in enumerable props the logger deep-inspects at depth 5) without any optional peer.
class FakeSensitiveTransportError extends Error {
  config = { headers: { 'X-Vault-Token': 'super-secret-vault-token-must-never-be-logged' } };
  response = { data: { ['secret_id']: 'super-secret-approle-secret-must-never-be-logged' } };
  constructor() {
    super('connect ECONNREFUSED 127.0.0.1:1');
  }
}

class SystemEnvsBackedApp extends BaseApplication {
  override getProjectRoot() {
    return process.cwd();
  }
  override getAppInfo() {
    return { name: 'probe', version: '0', description: '' } as AnyType;
  }
  override staticConfigure() {}
  override preConfigure() {}
  override postConfigure() {}
  override setupMiddlewares() {}
  override registerSecrets(): ISecretsRegistration {
    return { provider: SecretProviders.SYSTEM_ENVS };
  }
}

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

/** Formats each captured log call the way the framework logger would and asserts the secret VALUES never survive the deep-inspect path, while the diagnostic message still does. */
const assertRedactedThroughLogger = (calls: unknown[][]) => {
  expect(calls.length).toBeGreaterThan(0);
  for (const [message, ...args] of calls) {
    const rendered = formatLogMessage({ message: String(message), args });
    expect(rendered).not.toContain('super-secret');
    expect(rendered).toContain('connect ECONNREFUSED');
    expect(rendered).toContain('[REDACTED]');
  }
};

describe('hydrateSecrets does not leak raw error objects to the logger', () => {
  test('dev-fallback catch logs only the error message, never the raw error object', async () => {
    process.env.NODE_ENV = 'development';
    const warnSpy = spyOn(Logger.prototype, 'warn');
    const configureSpy = spyOn(AbstractSecretsHelper.prototype, 'configure').mockImplementation(
      async () => {
        throw new FakeSensitiveTransportError();
      },
    );
    try {
      const app = new SystemEnvsBackedApp({ scope: 'probe', config: {} as AnyType });
      await app.hydrateSecrets();

      assertRedactedThroughLogger(warnSpy.mock.calls as unknown[][]);
    } finally {
      configureSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  test('partial-provider-shutdown catch logs only the error message, never the raw error object', async () => {
    process.env.NODE_ENV = 'development';
    const errorSpy = spyOn(Logger.prototype, 'error');
    const configureSpy = spyOn(AbstractSecretsHelper.prototype, 'configure').mockImplementation(
      async () => {
        throw new FakeSensitiveTransportError();
      },
    );
    const shutdownSpy = spyOn(SystemEnvsHelper.prototype, 'shutdown').mockImplementation(
      async () => {
        throw new FakeSensitiveTransportError();
      },
    );
    try {
      const app = new SystemEnvsBackedApp({ scope: 'probe', config: {} as AnyType });
      await app.hydrateSecrets();

      assertRedactedThroughLogger(errorSpy.mock.calls as unknown[][]);
    } finally {
      shutdownSpy.mockRestore();
      configureSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
