import { BaseService } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';

class PlainService extends BaseService {
  constructor() {
    super({ scope: PlainService.name });
  }
}

class IdentifiedService extends BaseService {
  constructor(opts: { identifier: string }) {
    super({ scope: IdentifiedService.name, identifier: opts.identifier });
  }
}

describe('BaseService', () => {
  test('scope reaches the BaseHelper logger wiring', () => {
    const service = new PlainService();

    expect(service.scope).toBe('PlainService');
    expect(service.getLogger()).toBeDefined();
    expect(typeof service.getLogger().info).toBe('function');
  });

  test('identifier is forwarded to BaseHelper, not dropped', () => {
    const service = new IdentifiedService({ identifier: 'tenant-a' });

    expect(service.scope).toBe('IdentifiedService');
    expect(service.getIdentifier()).toBe('tenant-a');
  });
});
