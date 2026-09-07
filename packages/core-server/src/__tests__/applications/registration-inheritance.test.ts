import { describe, expect, test } from 'bun:test';
import { RestApplication } from '@venizia/ignis-kernel';
import { BaseApplication } from '@/base/applications';

describe('DI registration helpers live on the kernel layer', () => {
  test('RestApplication owns the framework-neutral registration methods', () => {
    const restSurface = Object.getOwnPropertyNames(RestApplication.prototype);
    const baseSurface = Object.getOwnPropertyNames(BaseApplication.prototype);

    for (const method of ['component', 'controller', 'service', 'repository', 'dataSource']) {
      expect(restSurface).toContain(method);
      // Guards against a future regression that copies these back onto BaseApplication - that
      // would defeat the lift (WorkerApplication would then diverge from what BaseApplication runs)
      // while still passing a check that only confirms the method is reachable, not where it lives.
      expect(baseSurface).not.toContain(method);
    }
  });

  test('BaseApplication still exposes every registration method it did before', () => {
    const app = BaseApplication.prototype as unknown as Record<string, unknown>;

    for (const method of ['component', 'controller', 'service', 'repository', 'dataSource']) {
      expect(typeof app[method]).toBe('function');
    }
  });
});
