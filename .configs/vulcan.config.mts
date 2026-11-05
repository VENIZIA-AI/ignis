import type { VulcanConfig } from '@venizia/vulcan';

export default {
  agents: ['claude'],
  // Plugins the owner turned off for this repository; vulcan sync writes them into .claude/settings.json.
  claude: {
    settings: {
      enabledPlugins: {
        'figma@claude-plugins-official': false,
        'chrome-devtools-mcp@claude-plugins-official': false,
      },
    },
  },
  rules: { 'V-W-01': 'on-user-word' },
  // Agents may not sign commits: vulcan sync prints the hook line that enforces it.
  commit: { message: { agent: { signature: 'deny' } } },
  // A write outside the project is refused with a reason instead of prompting.
  guard: { outside: 'deny' },
  // The session digest names the rules sessions drop most, then prints the minimap shape from .agents/rules.md.
  digest: { oftenDropped: ['P-09', 'P-10', 'B-03', 'B-05', 'P-05', 'P-15', 'W-02'] },
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
  knowledge: {
    bundle: '.agents/knowledge',
    wiki: 'docs/wiki/content',
    changelogs: 'docs/wiki/content/changelogs',
    syncAreas: '.agents/knowledge/process/knowledge-sync-areas.md',
  },
  okf: {
    renderers: [
      'source-map',
      { id: 'components', module: '.agents/okf/components.ts' },
      { id: 'helpers', module: '.agents/okf/helpers.ts' },
      {
        id: 'binding-keys',
        options: {
          source: 'packages/kernel/src/common/bindings.ts',
          description: 'Every dependency-injection binding key declared in the kernel (generated).',
          seeAlso: 'Namespaces: [binding key namespaces](/conventions/binding-key-namespaces.md).',
        },
      },
      'makefile-targets',
    ],
    regions: [
      { id: 'packages-table', file: 'overview/monorepo-layout.md', renderer: 'packages-table' },
    ],
    coverage: [
      { name: 'packages', path: 'packages/*' },
      { name: 'examples', path: 'examples/*' },
    ],
    brand: 'IGNIS',
  },
  atlas: {
    tagPattern: '<dir>-v<version>',
    // The prebuilt index of this repository is signed with the private key in the Actions secret ATLAS_INDEX_KEY;
    // this is its public half, which a reader that declares IGNIS as a source trusts (a key list, so a key can rotate).
    index: { keys: ['sdcWZqtQ/X7Rb7IExhpLzX/YFQoPscMPQSEdGcGc77Q='] },
  },
} satisfies VulcanConfig;
