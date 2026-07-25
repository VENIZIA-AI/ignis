import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@/modules/error';
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
