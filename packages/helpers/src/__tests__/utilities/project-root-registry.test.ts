import { ModuleUtility } from '@/utilities/module.utility';
import { ProjectRootRegistry } from '@/utilities/project-root.utility';
import { afterEach, describe, expect, test } from 'bun:test';

describe('ProjectRootRegistry', () => {
  afterEach(() => {
    ProjectRootRegistry.set({ projectRoot: process.cwd() });
  });

  test('set() then getShared() round-trips the value', () => {
    ProjectRootRegistry.set({ projectRoot: '/srv/finance' });
    expect(ProjectRootRegistry.getShared()).toBe('/srv/finance');
  });

  test('shares one globalThis slot with ModuleUtility - a purity-restricted host and ModuleUtility must agree', () => {
    ProjectRootRegistry.set({ projectRoot: '/srv/finance' });
    expect(ModuleUtility.getProjectRoot()).toBe('/srv/finance');

    ModuleUtility.setProjectRoot({ projectRoot: '/srv/other' });
    expect(ProjectRootRegistry.getShared()).toBe('/srv/other');
  });
});
