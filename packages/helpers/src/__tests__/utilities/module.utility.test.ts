import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@/modules/error';
import type { ILogger } from '@/modules/logger';
import { LoggerFactory } from '@/modules/logger';
import { ModuleUtility } from '@/utilities/module.utility';

describe('ModuleUtility.load', () => {
  test('resolves a really-installed module through the function boundary', async () => {
    const dayjs = await ModuleUtility.load<{ default: (input?: string) => unknown }>({
      module: 'dayjs',
    });
    expect(typeof dayjs.default).toBe('function');
  });

  test('throws a clear, actionable ApplicationError for a missing module', async () => {
    try {
      await ModuleUtility.load({ module: '@definitely/not-installed' });
      expect.unreachable();
    } catch (error) {
      expect(isApplicationError(error)).toBe(true);

      const message = (error as Error).message;
      expect(message).toContain('@definitely/not-installed');
      expect(message).toContain("Please install '@definitely/not-installed'");
    }
  });
});

describe('ModuleUtility.loadSync', () => {
  test('returns the module without awaiting - the constructor path', () => {
    const lodash = ModuleUtility.loadSync<{ isEmpty: (value: unknown) => boolean }>({
      module: 'lodash',
    });

    expect(typeof lodash.isEmpty).toBe('function');
  });

  test('throws the same actionable ApplicationError for a missing module', () => {
    try {
      ModuleUtility.loadSync({ module: '@definitely/not-installed' });
      expect.unreachable();
    } catch (error) {
      expect(isApplicationError(error)).toBe(true);
      expect((error as Error).message).toContain("Please install '@definitely/not-installed'");
    }
  });
});

describe('ModuleUtility.assertInstalled', () => {
  test('passes when every module is installed', () => {
    ModuleUtility.assertInstalled({ modules: ['lodash', 'dayjs'] });
    expect(true).toBe(true);
  });

  test('passes for an empty module list', () => {
    ModuleUtility.assertInstalled({ modules: [] });
    expect(true).toBe(true);
  });

  test('throws a clear, actionable ApplicationError for a missing optional module', () => {
    try {
      ModuleUtility.assertInstalled({
        scope: 'SocketIOHelper',
        modules: ['@definitely/not-installed'],
      });
      expect.unreachable();
    } catch (error) {
      expect(isApplicationError(error)).toBe(true);

      const message = (error as Error).message;
      expect(message).toContain('@definitely/not-installed');
      expect(message).toContain('SocketIOHelper');
      expect(message).toContain("Please install '@definitely/not-installed'");
      expect(message).not.toContain('MODULE_NOT_FOUND');
    }
  });

  test('omits the scope clause when no scope is given', () => {
    try {
      ModuleUtility.assertInstalled({ modules: ['@definitely/not-installed'] });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('is required.');
    }
  });

  test('fails on the first missing module even when later ones exist', () => {
    try {
      ModuleUtility.assertInstalled({ modules: ['@definitely/not-installed', 'lodash'] });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('@definitely/not-installed');
    }
  });

  test('checks presence WITHOUT executing the module', () => {
    // `resolve` only locates the file; a side-effecting module must not run.
    ModuleUtility.assertInstalled({ modules: ['dayjs'] });
    expect(true).toBe(true);
  });
});

describe('ModuleUtility.register', () => {
  // A specifier that exists in no node_modules: only the registry can satisfy it, which is the
  // compiled-binary case where there is no node_modules to fall back to.
  const module = '@registered/fake-peer';
  const fake = { createTransport: () => 'transport' };

  test('serves a registered module to loadSync without touching the filesystem', () => {
    ModuleUtility.register({ modules: { [module]: fake } });

    expect(ModuleUtility.loadSync<typeof fake>({ module })).toBe(fake);
  });

  test('serves a registered module to load', async () => {
    ModuleUtility.register({ modules: { [module]: fake } });

    expect(await ModuleUtility.load<typeof fake>({ module })).toBe(fake);
  });

  // A registration satisfies assertInstalled only where ModuleUtility itself does the loading.
  // Callers that resolve the specifier on their own - a pino worker thread, the gRPC adapter's own
  // createRequire - cannot see the registry, so counting it would report a peer as present that
  // those callers still cannot reach.
  test('does NOT count a registered module as installed by default', () => {
    ModuleUtility.register({ modules: { [module]: fake } });

    try {
      ModuleUtility.assertInstalled({ modules: [module], scope: 'PinoLogger' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain(module);
    }
  });

  test('counts a registered module as installed when allowRegistered is set', () => {
    ModuleUtility.register({ modules: { [module]: fake } });

    ModuleUtility.assertInstalled({
      modules: [module],
      scope: 'HashiCorpVaultHelper',
      allowRegistered: true,
    });
    expect(true).toBe(true);
  });

  test('registers every entry of the map in one call', () => {
    ModuleUtility.register({ modules: { '@registered/one': 1, '@registered/two': 2 } });

    expect(ModuleUtility.loadSync<number>({ module: '@registered/one' })).toBe(1);
    expect(ModuleUtility.loadSync<number>({ module: '@registered/two' })).toBe(2);
  });

  test('leaves an unregistered module on the normal resolution path', () => {
    ModuleUtility.register({ modules: { [module]: fake } });

    const lodash = ModuleUtility.loadSync<{ isEmpty: (value: unknown) => boolean }>({
      module: 'lodash',
    });

    expect(typeof lodash.isEmpty).toBe('function');
  });

  // register() runs at the entrypoint of a compiled binary, which is exactly where no logger
  // provider exists yet and LoggerFactory throws. A log call inside the loop would abort it and
  // drop every module after the first, silently.
  test('registers every entry even when logging is unavailable', () => {
    const original = LoggerFactory.currentProvider();
    const unusable: ILogger = new Proxy({} as ILogger, {
      get: () => () => {
        throw new Error('logger unavailable');
      },
    });

    try {
      LoggerFactory.use({ provider: { get: () => unusable } });

      ModuleUtility.register({
        modules: { '@registered/first': 1, '@registered/second': 2, '@registered/third': 3 },
      });
    } finally {
      LoggerFactory.use({ provider: original });
    }

    expect(ModuleUtility.loadSync<number>({ module: '@registered/first' })).toBe(1);
    expect(ModuleUtility.loadSync<number>({ module: '@registered/second' })).toBe(2);
    expect(ModuleUtility.loadSync<number>({ module: '@registered/third' })).toBe(3);
  });
});
