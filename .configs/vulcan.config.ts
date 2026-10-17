import type { VulcanConfig } from '@venizia/vulcan';

// IGNIS consumes VULCAN's knowledge, atlas and agent tooling. `okf.renderers` and `atlas` are
// validated by VULCAN 0.1.0 but not consumed yet: IGNIS keeps its own `okf gen` renderers until then.
export default {
  agents: ['claude'],
  rules: { 'V-W-01': 'on-user-word' },
  // IGNIS's own digest (its W rules, P-09 minimap, B-05, P-05, P-15), after VULCAN's base digest.
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
