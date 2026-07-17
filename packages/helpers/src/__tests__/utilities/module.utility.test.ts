import { describe, expect, test } from 'bun:test';
import { isApplicationError } from '@/modules/error';
import { importOptionalModule, validateModule } from '@/utilities/module.utility';

describe('importOptionalModule', () => {
  test('resolves a really-installed module through the function boundary', async () => {
    const dayjs = await importOptionalModule<{ default: (input?: string) => unknown }>({
      module: 'dayjs',
    });
    expect(typeof dayjs.default).toBe('function');
  });

  test('throws a clear, actionable ApplicationError for a missing module', async () => {
    try {
      await importOptionalModule({ module: '@definitely/not-installed' });
      expect.unreachable();
    } catch (error) {
      expect(isApplicationError(error)).toBe(true);

      const message = (error as Error).message;
      expect(message).toContain('@definitely/not-installed');
      expect(message).toContain("Please install '@definitely/not-installed'");
    }
  });
});

describe('validateModule', () => {
  test('resolves when every module is installed', async () => {
    await validateModule({ modules: ['lodash', 'dayjs'] });
    expect(true).toBe(true);
  });

  test('resolves for an empty module list', async () => {
    await validateModule({ modules: [] });
    expect(true).toBe(true);
  });

  test('throws a clear, actionable ApplicationError for a missing optional module', async () => {
    try {
      await validateModule({ scope: 'SocketIOHelper', modules: ['@definitely/not-installed'] });
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

  test('omits the scope clause when no scope is given', async () => {
    try {
      await validateModule({ modules: ['@definitely/not-installed'] });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('is required.');
    }
  });

  test('fails on the first missing module even when later ones exist', async () => {
    try {
      await validateModule({ modules: ['@definitely/not-installed', 'lodash'] });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('@definitely/not-installed');
    }
  });
});
