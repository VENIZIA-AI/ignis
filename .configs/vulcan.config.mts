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
  // The Venizia-stack rules (V-B-05, V-B-09, V-C-07, V-C-08, V-C-20) ship as a pack, not in the base rules.
  packs: ['venizia'],
  // The wiki's accent family; vulcan sync writes the resolved tokens into the manifest, which config.mts reads.
  theme: { accent: '#af5f5f', accentDark: '#c98a8a', accentText: '#a15757' },
  // Agents may not sign commits: vulcan sync prints the hook line that enforces it.
  commit: { message: { agent: { signature: 'deny' } } },
  // A write outside the project is refused with a reason instead of prompting.
  guard: { outside: 'deny' },
  events: { log: true },
  project: { key: 'IGNIS' },
  remove: { 'atlas.sources': ['ignis'] },
  // Values `vulcan doctor` reads as private that are not: placeholders and examples the docs and sources show on purpose.
  doctor: {
    privateValues: {
      acknowledged: [
        {
          path: 'docs/wiki/content/**',
          kinds: ['url-credentials'],
          reason:
            'Wiki examples: placeholder connection strings (user:password@host) in a datasource, queue or environment sample.',
        },
        {
          path: '{docs/wiki/content/best-practices/troubleshooting-tips.md,docs/wiki/content/changelogs/2026-01-06-basic-authentication.md,docs/wiki/content/extensions/components/authentication/errors.md,docs/wiki/content/references/configuration/environment-variables.md}',
          kinds: ['token'],
          reason:
            'Wiki examples: the word Bearer or Basic in an auth header sample, and the AWS documentation example key.',
        },
        {
          path: 'docs/wiki/content/**',
          kinds: ['ipv4'],
          reason:
            'Wiki examples whose subject is a private, link-local or multicast address: the JWKS host allow-list, the URL-safety guard (the cloud metadata address), a Docker link, a UDP multicast group. The dated changelog entries are history and keep the addresses they were published with.',
        },
        {
          path: 'packages/helpers/src/common/redact.ts',
          kinds: ['url-credentials'],
          reason: 'The redaction helper documents the user:password@host shape it removes.',
        },
        {
          path: '{packages/core-server/src/components/auth/authenticate/services/bearer/abstract.service.ts,packages/helpers/src/modules/storage/bun-s3/utility.ts}',
          kinds: ['token'],
          reason:
            'Code that names the Bearer scheme and builds an Authorization header from a variable; no literal credential.',
        },
        {
          path: '{packages/core-server/src/components/auth/authenticate/services/jwks-url-policy.ts,packages/helpers/src/modules/network/utilities/url-safety/common/types.ts,packages/helpers/src/modules/network/utilities/url-safety/policy.ts,packages/kernel/src/base/auth/authenticate/common/types/jwt.ts,packages/core-server/src/base/applications/server.ts}',
          kinds: ['ipv4'],
          reason:
            'The JWKS host policy and the URL-safety guard name the private and link-local addresses they refuse, and the server comment shows the Docker container-link form it ignores.',
        },
        {
          path: '{examples/supabase/.env.example,examples/supabase/src/common/environments.ts,examples/vert/src/datasources/postgres.datasource.ts}',
          kinds: ['url-credentials'],
          reason:
            'Example apps: the local Docker connection string (postgres:postgres@localhost) and the template that builds one from its parts.',
        },
        {
          path: '{presets/app/files/.configs/builders/Dockerfile,scripts/preset/preset-smoke.ts}',
          kinds: ['machine-path'],
          reason:
            'The home folder of the bun user inside the container image, not a developer machine.',
        },
      ],
    },
  },
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
    // Version folders (changelogs/<X.Y.Z>/log.md and migration.yaml) are the changelog from 0.4.5 on; the dated files up to `datedUntil` are history.
    migrationFrom: '0.4.5',
    datedUntil: '2026-11-15',
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
