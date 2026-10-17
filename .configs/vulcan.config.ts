import type { VulcanConfig } from '@venizia/vulcan';

// IGNIS consumes VULCAN's knowledge, atlas and agent tooling. `atlas.packages` drives the surface and
// symbols tables; `okf gen` uses VULCAN's built-in renderers. Move `atlas.packages` to the top-level
// `packages` key when VULCAN 0.2.0 ships.
export default {
  agents: ['claude'],
  rules: { 'V-W-01': 'on-user-word' },
  // After VULCAN's base digest, which already prints every rule row: the most-dropped IDs and the minimap shape.
  hooks: [{ event: 'SessionStart', command: 'bun "${CLAUDE_PROJECT_DIR}"/.agents/hooks/session-digest.ts' }],
  knowledge: {
    bundle: '.agents/knowledge',
    wiki: 'docs/wiki/content',
    changelogs: 'docs/wiki/content/changelogs',
  },
  atlas: {
    packages: {
      'dev-configs': '@venizia/dev-configs',
      inversion: '@venizia/ignis-inversion',
      filter: '@venizia/ignis-filter',
      helpers: '@venizia/ignis-helpers',
      boot: '@venizia/ignis-boot',
      kernel: '@venizia/ignis-kernel',
      connectors: '@venizia/ignis-connectors',
      'core-worker': '@venizia/ignis-worker',
      'core-server': '@venizia/ignis',
    },
    tagPattern: '<package>-v<version>',
    releaseCommit: '[#<issue>] chore(<package>): release v<version>',
  },
} satisfies VulcanConfig;
