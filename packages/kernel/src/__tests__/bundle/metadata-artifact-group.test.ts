import { ArtifactGroup } from '@/metadata';
import { describe, expect, test } from 'bun:test';

describe('@venizia/ignis-kernel/metadata', () => {
  test('exports ArtifactGroup, so a browser kit defines groups without the root barrel', () => {
    expect(ArtifactGroup.define({ folder: 'services' }).folder).toBe('services');
  });
});
