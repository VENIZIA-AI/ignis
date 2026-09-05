import { AtlasConstants, AtlasModes } from '@/common';
import { describe, expect, test } from 'bun:test';

describe('atlas skeleton', () => {
  test('names the server and the two modes', () => {
    expect(AtlasConstants.SERVER_NAME).toBe('ignis-atlas');
    expect(AtlasModes.isValid('repo')).toBe(true);
    expect(AtlasModes.isValid('snapshot')).toBe(true);
    expect(AtlasModes.isValid('cloud')).toBe(false);
  });
});
