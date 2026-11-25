import type { VulcanConfig } from '@venizia/vulcan';

export const knowledge = {
  bundle: '.agents/knowledge',
  wiki: 'docs/wiki/content',
  changelogs: 'docs/wiki/content/changelogs',
  // Version folders (changelogs/<X.Y.Z>/log.md and migration.yaml) are the changelog from 0.4.5 on; the dated files up to `datedUntil` are history.
  migrationFrom: '0.4.5',
  datedUntil: '2026-11-15',
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
} satisfies VulcanConfig.Knowledge;
