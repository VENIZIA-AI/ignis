import { BaseApplication } from '@/base/applications';
import { describe, expect, test } from 'bun:test';

describe('BaseApplication - removed boot members', () => {
  test('boot, booter and registerBooters are absent from the prototype', () => {
    const surface = Object.getOwnPropertyNames(BaseApplication.prototype);

    expect(surface).not.toContain('boot');
    expect(surface).not.toContain('booter');
    expect(surface).not.toContain('registerBooters');
  });
});
