import type { VulcanConfig } from '@venizia/vulcan';

export const project = {
  key: 'IGNIS',
  // Release order. A rename keeps its old tag prefix and npm name as aliases.
  packages: [
    { dir: 'dev-configs', name: '@venizia/dev-configs' },
    { dir: 'inversion', name: '@venizia/ignis-inversion' },
    { dir: 'filter', name: '@venizia/ignis-filter' },
    { dir: 'helpers', name: '@venizia/ignis-helpers' },
    { dir: 'boot', name: '@venizia/ignis-boot' },
    { dir: 'kernel', name: '@venizia/ignis-kernel' },
    { dir: 'connectors', name: '@venizia/ignis-connectors' },
    {
      dir: 'core-worker',
      name: '@venizia/ignis-worker',
      aliases: ['worker', '@venizia/ignis-core-worker'],
    },
    { dir: 'core-server', name: '@venizia/ignis', aliases: ['core'] },
    { dir: 'docs-mcp', name: '@venizia/ignis-docs', aliases: ['docs'], retired: true },
    { dir: 'atlas', name: '@venizia/ignis-atlas', retired: true },
  ],
} satisfies VulcanConfig.Project;
