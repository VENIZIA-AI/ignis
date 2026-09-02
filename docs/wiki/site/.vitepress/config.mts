import { defineConfig, type DefaultTheme } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

// ── Sidebar: Core API ──
// Shown for: /references/, /references/base/*, /references/configuration/*, /references/utilities/*
const coreApiSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Core API',
    items: [
      { text: 'Overview', link: '/references/' },
      { text: '⚡ Quick Reference', link: '/references/quick-reference' },
    ],
  },
  {
    text: 'Configuration',
    collapsed: false,
    items: [
      { text: 'Overview', link: '/references/configuration/' },
      { text: 'Environment Variables', link: '/references/configuration/environment-variables' },
    ],
  },
  {
    text: 'Base Abstractions',
    collapsed: false,
    items: [
      { text: 'Overview', link: '/references/base/' },
      { text: 'Application', link: '/references/base/application' },
      { text: 'Artifact Registration', link: '/references/base/bootstrapping' },
      { text: 'Components', link: '/references/base/components' },
      {
        text: 'Controllers',
        collapsed: true,
        items: [
          { text: 'REST', link: '/references/base/controllers' },
          { text: 'gRPC', link: '/references/base/grpc-controllers' },
        ],
      },
      { text: 'Dependency Injection', link: '/references/base/dependency-injection' },
      { text: 'Middlewares', link: '/references/base/middlewares' },
      {
        text: 'Models & Enrichers',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/references/base/models' },
          { text: 'Full Reference', link: '/references/base/models-reference' },
        ],
      },
      { text: 'Providers', link: '/references/base/providers' },
      { text: 'Connectors', link: '/references/base/connectors' },
      {
        text: 'DataSources',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/references/base/datasources' },
          { text: 'Full Reference', link: '/references/base/datasources-reference' },
        ],
      },
      { text: 'Secrets & Vault', link: '/references/base/secrets' },
      {
        text: 'Repositories',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/references/base/repositories/' },
          { text: 'SoftDeletableRepository', link: '/references/base/repositories/soft-deletable' },
          { text: 'Mixins', link: '/references/base/repositories/mixins' },
          { text: 'Relations & Includes', link: '/references/base/repositories/relations' },
          { text: 'Advanced Features', link: '/references/base/repositories/advanced' },
        ],
      },
      {
        text: 'Filter System',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/references/base/filter-system/' },
          { text: '⚡ Quick Reference', link: '/references/base/filter-system/quick-reference' },
          { text: 'Comparison Operators', link: '/references/base/filter-system/comparison-operators' },
          { text: 'Null Operators', link: '/references/base/filter-system/null-operators' },
          { text: 'List Operators', link: '/references/base/filter-system/list-operators' },
          { text: 'Range Operators', link: '/references/base/filter-system/range-operators' },
          { text: 'Pattern Matching', link: '/references/base/filter-system/pattern-matching' },
          { text: 'Logical Operators', link: '/references/base/filter-system/logical-operators' },
          { text: 'JSON Filtering', link: '/references/base/filter-system/json-filtering' },
          { text: 'Array Operators', link: '/references/base/filter-system/array-operators' },
          { text: 'Fields, Order & Pagination', link: '/references/base/filter-system/fields-order-pagination' },
          { text: 'Default Filter', link: '/references/base/filter-system/default-filter' },
          { text: 'Application Usage', link: '/references/base/filter-system/application-usage' },
          { text: 'Use Cases', link: '/references/base/filter-system/use-cases' },
          { text: 'Tips & Edge Cases', link: '/references/base/filter-system/tips' },
        ],
      },
      { text: 'Services', link: '/references/base/services' },
    ],
  },
  {
    text: 'Utilities',
    collapsed: false,
    items: [
      { text: 'Overview', link: '/references/utilities/' },
      { text: 'Date', link: '/references/utilities/date' },
      { text: 'Duration', link: '/references/utilities/duration' },
      {
        text: 'JSX',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/references/utilities/jsx' },
          { text: 'Full Reference', link: '/references/utilities/jsx-reference' },
        ],
      },
      { text: 'Module', link: '/references/utilities/module' },
      { text: 'Parse', link: '/references/utilities/parse' },
      { text: 'Performance', link: '/references/utilities/performance' },
      { text: 'Promise', link: '/references/utilities/promise' },
      { text: 'Request', link: '/references/utilities/request' },
      { text: 'Retry', link: '/references/utilities/retry' },
      { text: 'Schema', link: '/references/utilities/schema' },
      {
        text: 'Statuses',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/references/utilities/statuses' },
          { text: 'Full Reference', link: '/references/utilities/statuses-reference' },
        ],
      },
    ],
  },
];

// ── Sidebar: Extensions ──
// Shown for: /extensions/components/*, /extensions/helpers/*, /extensions/src-details/*
const extensionsSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Extensions',
    items: [
      { text: 'Overview', link: '/extensions/' },
    ],
  },
  {
    text: 'Components',
    collapsed: false,
    items: [
      { text: 'Overview', link: '/extensions/components/' },
      {
        text: 'Authentication',
        collapsed: true,
        items: [
          { text: 'Setup & Configuration', link: '/extensions/components/authentication/' },
          { text: 'Usage & Examples', link: '/extensions/components/authentication/usage' },
          { text: 'API Reference', link: '/extensions/components/authentication/api' },
          { text: 'Error Reference', link: '/extensions/components/authentication/errors' },
        ],
      },
      {
        text: 'Authorization',
        collapsed: true,
        items: [
          { text: 'Getting Started', link: '/extensions/components/authorization/getting-started' },
          { text: 'Setup & Configuration', link: '/extensions/components/authorization/' },
          { text: 'Usage & Examples', link: '/extensions/components/authorization/usage' },
          { text: 'API Reference', link: '/extensions/components/authorization/api' },
          { text: 'Error Reference', link: '/extensions/components/authorization/errors' },
        ],
      },
      { text: 'Health Check', link: '/extensions/components/health-check' },
      {
        text: 'Mail',
        collapsed: true,
        items: [
          { text: 'Setup & Configuration', link: '/extensions/components/mail/' },
          { text: 'Usage & Examples', link: '/extensions/components/mail/usage' },
          { text: 'API Reference', link: '/extensions/components/mail/api' },
          { text: 'Error Reference', link: '/extensions/components/mail/errors' },
        ],
      },
      { text: 'Request Tracker', link: '/extensions/components/request-tracker' },
      {
        text: 'Socket.IO',
        collapsed: true,
        items: [
          { text: 'Setup & Configuration', link: '/extensions/components/socket-io/' },
          { text: 'Usage & Examples', link: '/extensions/components/socket-io/usage' },
          { text: 'API Reference', link: '/extensions/components/socket-io/api' },
          { text: 'Error Reference', link: '/extensions/components/socket-io/errors' },
        ],
      },
      {
        text: 'Static Asset',
        collapsed: true,
        items: [
          { text: 'Setup & Configuration', link: '/extensions/components/static-asset/' },
          { text: 'Usage & Examples', link: '/extensions/components/static-asset/usage' },
          { text: 'API Reference', link: '/extensions/components/static-asset/api' },
          { text: 'Error Reference', link: '/extensions/components/static-asset/errors' },
        ],
      },
      { text: 'API Reference', link: '/extensions/components/api-reference' },
      {
        text: 'WebSocket',
        collapsed: true,
        items: [
          { text: 'Setup & Configuration', link: '/extensions/components/websocket/' },
          { text: 'Usage & Examples', link: '/extensions/components/websocket/usage' },
          { text: 'API Reference', link: '/extensions/components/websocket/api' },
          { text: 'Error Reference', link: '/extensions/components/websocket/errors' },
        ],
      },
    ],
  },
  {
    text: 'Helpers',
    collapsed: false,
    items: [
      { text: 'Overview', link: '/extensions/helpers/' },
      { text: 'Cron', link: '/extensions/helpers/cron/' },
      {
        text: 'Crypto',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/crypto/' },
          { text: 'Full Reference', link: '/extensions/helpers/crypto/reference' },
        ],
      },
      { text: 'Environment', link: '/extensions/helpers/env/' },
      { text: 'Error', link: '/extensions/helpers/error/' },
      {
        text: 'Inversion (DI)',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/inversion/' },
          { text: 'Full Reference', link: '/extensions/helpers/inversion/reference' },
        ],
      },
      {
        text: 'Logger',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/logger/' },
          { text: 'Full Reference', link: '/extensions/helpers/logger/reference' },
          { text: 'HfLogger Guide', link: '/extensions/helpers/logger/hf-logger' },
          { text: 'Pino Provider', link: '/extensions/helpers/logger/pino' },
        ],
      },
      {
        text: 'Network',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/network/' },
          { text: 'Full Reference', link: '/extensions/helpers/network/api' },
        ],
      },
      {
        text: 'Kafka',
        collapsed: true,
        items: [
          { text: 'Overview & Fundamentals', link: '/extensions/helpers/kafka/' },
          { text: 'Producer', link: '/extensions/helpers/kafka/producer' },
          { text: 'Consumer', link: '/extensions/helpers/kafka/consumer' },
          { text: 'Admin', link: '/extensions/helpers/kafka/admin' },
          { text: 'Schema Registry', link: '/extensions/helpers/kafka/schema-registry' },
          { text: 'Compiling to a Single Binary', link: '/extensions/helpers/kafka/compile-binary' },
          { text: 'Examples & Troubleshooting', link: '/extensions/helpers/kafka/examples' },
        ],
      },
      {
        text: 'Queue',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/queue/' },
          { text: 'Full Reference', link: '/extensions/helpers/queue/reference' },
        ],
      },
      {
        text: 'Redis',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/redis/' },
          { text: 'Full Reference', link: '/extensions/helpers/redis/reference' },
        ],
      },
      { text: 'Secrets & Vault', link: '/extensions/helpers/secrets/' },
      {
        text: 'Socket.IO',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/socket-io/' },
          { text: 'Full Reference', link: '/extensions/helpers/socket-io/api' },
        ],
      },
      {
        text: 'Storage',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/storage/' },
          { text: 'Full Reference', link: '/extensions/helpers/storage/api' },
        ],
      },
      {
        text: 'Types',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/types/' },
          { text: 'Full Reference', link: '/extensions/helpers/types/reference' },
        ],
      },
      { text: 'UID', link: '/extensions/helpers/uid/' },
      {
        text: 'WebSocket',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/websocket/' },
          { text: 'Full Reference', link: '/extensions/helpers/websocket/api' },
        ],
      },
      {
        text: 'Worker Thread',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/extensions/helpers/worker-thread/' },
          { text: 'Full Reference', link: '/extensions/helpers/worker-thread/reference' },
        ],
      },
    ],
  },
  {
    text: 'Framework Internals',
    collapsed: true,
    items: [
      { text: 'MCP Docs Server', link: '/extensions/src-details/mcp-server' },
    ],
  },
];

// https://vitepress.dev/reference/site-config
const config = defineConfig({
  base: '/',
  appearance: 'dark',
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'one-dark-pro',
    },
  },
  srcDir: '../content',
  outDir: './.vitepress/dist',
  srcExclude: ['**/template/**'],
  title: 'IGNIS',
  description: 'A TypeScript Server Infrastructure with Hono Framework',
  head: [
    // Favicon + PWA
    ['link', { rel: 'icon', href: '/logo.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
    // Fonts - preconnect
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    // Fonts - stylesheet
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap',
      },
    ],
    // Open Graph
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'IGNIS - Enterprise APIs at Hono speed' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'LoopBack 4 architecture with Hono raw throughput. Dependency injection, repositories, auth and real-time - batteries included, none of the overhead.',
      },
    ],
    ['meta', { property: 'og:image', content: '/og-image.png' }],
    ['meta', { property: 'og:url', content: 'https://ignis.venizia.ai/' }],
    // Twitter / X card
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'IGNIS - Enterprise APIs at Hono speed' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          'LoopBack 4 architecture with Hono raw throughput. Dependency injection, repositories, auth and real-time - batteries included, none of the overhead.',
      },
    ],
    ['meta', { name: 'twitter:image', content: '/og-image.png' }],
  ],
  vite: {
    // mermaid pulls in dayjs/esm, whose extensionless imports break Node's native ESM resolver during
    // SSR. Bundle them through Vite (noExternal) so Vite's resolver handles the resolution.
    ssr: { noExternal: ['vitepress-plugin-mermaid', 'mermaid', 'dayjs'] },
    optimizeDeps: { include: ['mermaid', 'dayjs'] },
    build: {
      target: 'es2022',
      // mermaid is a legitimately large dependency (~3 MB); isolated into its own lazy chunk below.
      // Keep the warning limit above its size so the advisory only fires for unexpected app bloat.
      chunkSizeWarningLimit: 3500,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              // Isolate mermaid (+ its heavy deps) - large and only needed on pages with diagrams.
              if (
                id.includes('mermaid') ||
                id.includes('cytoscape') ||
                id.includes('dagre') ||
                id.includes('d3') ||
                id.includes('khroma')
              ) {
                return 'mermaid';
              }
              // Split search functionality
              if (id.includes('minisearch') || id.includes('mark.js')) {
                return 'search';
              }
              // Split Vue core
              if (id.includes('@vue/')) {
                return 'vue-vendor';
              }
            }
          },
        },
      },
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Guide', link: '/guides/' },
      { text: 'Core API', link: '/references/' },
      { text: 'Extensions', link: '/extensions/' },
      { text: 'Best Practices', link: '/best-practices/' },
      { text: 'Changelog', link: '/changelogs/' },
    ],

    sidebar: {
      '/changelogs/': [
        {
          text: 'Overview',
          items: [
            { text: 'Introduction', link: '/changelogs/' },
            { text: 'Template', link: '/changelogs/template' },
          ],
        },
        {
          text: 'History',
          collapsed: false,
          items: [
            {
              text: '2026-09-02',
              collapsed: true,
              items: [
                {
                  text: 'Bundled and Compiled Apps - Helpers Exports Stay Defined, NODE_ENV Stays a Runtime Read, One Logger Provider Across Copies',
                  link: '/changelogs/2026-09-02-bundle-safe-helpers',
                },
                {
                  text: 'Artifacts Register From a Generated Index, and the Runtime Boot System Is Retired',
                  link: '/changelogs/2026-09-02-decorator-artifact-registration',
                },
              ],
            },
            {
              text: '2026-08-31',
              collapsed: true,
              items: [
                {
                  text: 'EventBus Retry Gets Jitter, a Bounded Per-Registration Window, and a Tagged Handler Reference',
                  link: '/changelogs/2026-08-31-event-bus-retry',
                },
                {
                  text: 'TEntityId Makes a String Id Impossible to Confuse With a String',
                  link: '/changelogs/2026-08-31-entity-id-brand',
                },
                {
                  text: 'PolicyDefinition Gets domain_type and domain_id (Release A)',
                  link: '/changelogs/2026-08-31-policy-domain-split',
                },
                {
                  text: 'An Application Refuses to Start When scopeFilter Cannot Take Effect',
                  link: '/changelogs/2026-08-31-scope-filter-boot-checks',
                },
                {
                  text: 'PolicyDefinition Reads the Domain Pair and the domain Column Is Gone (Release B)',
                  link: '/changelogs/2026-08-31-policy-domain-split-release-b',
                },
              ],
            },
            {
              text: '2026-08-30',
              collapsed: true,
              items: [
                {
                  text: 'A Row Scope Every Query Carries, Denied by Default When It Cannot Be Resolved',
                  link: '/changelogs/2026-08-30-row-scope-filter',
                },
                {
                  text: 'Where Clauses Now Type-Check the Value, Not Just the Column',
                  link: '/changelogs/2026-08-30-typed-where-clauses',
                },
                {
                  text: 'Tree Utilities Join helpers, and RecursiveTreeSql Bounds Every Recursive Walk in kernel',
                  link: '/changelogs/2026-08-30-tree-and-recursive-sql',
                },
                {
                  text: 'A Real Hash Class Replaces the Removed hash() Utility',
                  link: '/changelogs/2026-08-30-crypto-hashing',
                },
                {
                  text: 'PolicyDefinition.variant Stays Closed by Default, but an App Can Now Declare Its Own Edge Kinds',
                  link: '/changelogs/2026-08-30-policy-definition-extra-variants',
                },
                {
                  text: 'authorize() Denies When No Enforcer Is Registered',
                  link: '/changelogs/2026-08-30-authorize-no-enforcer-fails-closed',
                },
                {
                  text: 'getHealth() Never Throws, Imports Keep Progress, and collectionExists() Never Lies About Absence',
                  link: '/changelogs/2026-08-30-search-connector-health-and-import-contract',
                },
              ],
            },
            {
              text: '2026-08-29',
              collapsed: true,
              items: [
                {
                  text: 'Casbin Domain Hierarchy - Parent Domains Reach Their Children',
                  link: '/changelogs/2026-08-29-casbin-domain-hierarchy',
                },
              ],
            },
            {
              text: '2026-08-24',
              collapsed: true,
              items: [
                {
                  text: 'Two Query Shapes You No Longer Have to Rebuild',
                  link: '/changelogs/2026-08-24-query-wrapper-schemas',
                },
              ],
            },
            {
              text: '2026-08-22',
              collapsed: true,
              items: [
                {
                  text: 'Log Lines Stop Carrying Color Outside Development',
                  link: '/changelogs/2026-08-22-logger-color-off-outside-development',
                },
              ],
            },
            {
              text: '2026-08-21',
              collapsed: true,
              items: [
                {
                  text: 'Services Prove Themselves to Each Other, Without a Shared Password',
                  link: '/changelogs/2026-08-21-service-authentication-strategy',
                },
              ],
            },
            {
              text: '2026-08-19',
              collapsed: true,
              items: [
                {
                  text: 'Your Own Authentication Strategies, and Tokens That Say Who They Are For',
                  link: '/changelogs/2026-08-19-service-authentication-phase-1',
                },
                {
                  text: 'A Browser BFF That Survives a Second Tab',
                  link: '/changelogs/2026-08-19-browser-bff-multi-tab',
                },
              ],
            },
            {
              text: '2026-08-18',
              collapsed: true,
              items: [
                {
                  text: 'A Second ID Generator, for IDs People Read',
                  link: '/changelogs/2026-08-18-opaque-uid-helper',
                },
                {
                  text: 'Every Browser-Safe Package Now Ships ESM',
                  link: '/changelogs/2026-08-18-esm-builds-and-one-default-stack',
                },
              ],
            },
            {
              text: '2026-08-13',
              collapsed: true,
              items: [
                {
                  text: 'A Browser-Pure Kernel Under @venizia/ignis',
                  link: '/changelogs/2026-08-13-browser-pure-kernel',
                },
              ],
            },
            {
              text: '2026-08-12',
              collapsed: true,
              items: [
                {
                  text: 'Log Arguments Under %j No Longer Collapse to [Circular]',
                  link: '/changelogs/2026-08-12-json-log-arguments',
                },
              ],
            },
            {
              text: '2026-08-07',
              collapsed: true,
              items: [
                {
                  text: 'Call Sites No Longer Have to Know Which Fields Are Text',
                  link: '/changelogs/2026-08-07-default-query-by',
                },
                {
                  text: 'Nested i18n Fields Become Filterable and Sortable',
                  link: '/changelogs/2026-08-07-nested-fields-and-order-validation',
                },
                {
                  text: 'One Transport for Every Typesense Search',
                  link: '/changelogs/2026-08-07-typesense-multi-search-transport',
                },
              ],
            },
            {
              text: '2026-08-06',
              collapsed: true,
              items: [
                {
                  text: 'AES Keys Derive with PBKDF2, and Ciphertext Carries a Key Id',
                  link: '/changelogs/2026-08-06-aes-pbkdf2-and-key-rotation',
                },
              ],
            },
            {
              text: '2026-08-05',
              collapsed: true,
              items: [
                {
                  text: 'Search Filters Now Mean What Relational Filters Mean',
                  link: '/changelogs/2026-08-05-search-dialect-relational-parity',
                },
              ],
            },
            {
              text: '2026-08-02',
              collapsed: true,
              items: [
                {
                  text: 'SQLite and PGlite - Two Embedded Relational Engines',
                  link: '/changelogs/2026-08-02-sqlite-and-pglite-connectors',
                },
              ],
            },
            {
              text: '2026-08-01',
              collapsed: true,
              items: [
                {
                  text: 'Relational Connector Lift - Engine-Neutral SQL Tier',
                  link: '/changelogs/2026-08-01-relational-connector-lift',
                },
              ],
            },
            {
              text: '2026-07-26',
              collapsed: true,
              items: [
                {
                  text: 'Search and Mail Errors Join the Framework Catalog',
                  link: '/changelogs/2026-07-26-search-and-mail-error-codes',
                },
              ],
            },
            {
              text: '2026-07-25',
              collapsed: true,
              items: [
                {
                  text: 'ignis-filter - the Filter Vocabulary as a Browser-Safe Package',
                  link: '/changelogs/2026-07-25-ignis-filter-package',
                },
                {
                  text: 'Readable Error Logs and a logLevel Option on getError',
                  link: '/changelogs/2026-07-25-error-logging',
                },
              ],
            },
            {
              text: '2026-07-21',
              collapsed: true,
              items: [
                {
                  text: 'BaseFilteredAdapter Connector Resolution Fix',
                  link: '/changelogs/2026-07-21-casbin-connector-resolution-fix',
                },
              ],
            },
            {
              text: '2026-07-20',
              collapsed: true,
              items: [
                {
                  text: 'fromError - Rehydrate a Server Error on the Client',
                  link: '/changelogs/2026-07-20-error-from-error-client',
                },
                {
                  text: 'Casbin Single-Wave Extraction - Recursive CTE Replaces the Second Query Wave',
                  link: '/changelogs/2026-07-20-casbin-single-wave-extraction',
                },
                {
                  text: 'Casbin Custom Grants - Operation-Subset Grants in One Row',
                  link: '/changelogs/2026-07-20-casbin-custom-grants',
                },
              ],
            },
            {
              text: '2026-07-18',
              collapsed: true,
              items: [
                {
                  text: 'Logger Overhaul - ILogger Tier, Pino Provider, Single-Provider Loading',
                  link: '/changelogs/2026-07-18-logger-overhaul',
                },
                {
                  text: 'Dependency Refresh & DI Cleanup',
                  link: '/changelogs/2026-07-18-dependency-refresh',
                },
                {
                  text: 'Repository Read Retry',
                  link: '/changelogs/2026-07-18-repository-read-retry',
                },
              ],
            },
            {
              text: '2026-07-17',
              collapsed: true,
              items: [
                {
                  text: 'Logger Correctness Pass',
                  link: '/changelogs/2026-07-17-logger-correctness-pass',
                },
                {
                  text: 'Error Module Redesign',
                  link: '/changelogs/2026-07-17-error-module-redesign',
                },
                {
                  text: 'Secrets Peers Invisible to Bundlers',
                  link: '/changelogs/2026-07-17-secrets-bundler-invisible-peers',
                },
              ],
            },
            {
              text: '2026-07-16',
              collapsed: true,
              items: [
                {
                  text: 'Error Handling - Normalized Messages & Error Catalog',
                  link: '/changelogs/2026-07-16-error-catalog-and-structured-message',
                },
                {
                  text: 'Secrets & Vault Integration',
                  link: '/changelogs/2026-07-16-secrets-vault-integration',
                },
              ],
            },
            {
              text: '2026-07-14',
              collapsed: true,
              items: [
                {
                  text: 'Optional Peers, Actually Optional - The Driver Is a Class Now',
                  link: '/changelogs/2026-07-14-driver-class-bundling',
                },
              ],
            },
            {
              text: '2026-07-13',
              collapsed: true,
              items: [
                {
                  text: 'The Hardening Round - SQL Injection, Scope Escapes and Silent Leaks',
                  link: '/changelogs/2026-07-13-hardening-round',
                },
              ],
            },
            {
              text: '2026-07-12',
              collapsed: true,
              items: [
                {
                  text: 'Core Consolidation & Deduplication - Mixin Functions Removed, Narrowing Default-Filter Merge, isApplicationError',
                  link: '/changelogs/2026-07-12-core-consolidation-dedup',
                },
              ],
            },
            {
              text: '2026-07-11',
              collapsed: true,
              items: [
                {
                  text: 'Postgres Driver Seam & Supabase - Transaction Correctness, postgres-js, RLS Auth Context',
                  link: '/changelogs/2026-07-11-postgres-driver-seam-supabase',
                },
                {
                  text: 'Connectors Consistency Hardening - Strict find(), engineParams, SQL-Semantics Parity',
                  link: '/changelogs/2026-07-11-connectors-consistency-hardening',
                },
              ],
            },
            {
              text: '2026-07-08',
              collapsed: true,
              items: [
                {
                  text: 'Typesense Advanced Search - Vector/Semantic, Multi-Search, Synonyms',
                  link: '/changelogs/2026-07-08-typesense-advanced-search',
                },
              ],
            },
            {
              text: '2026-07-05',
              collapsed: true,
              items: [
                {
                  text: 'Unified Repository & Connectors Architecture - PostgreSQL, Typesense & Memory Engines',
                  link: '/changelogs/2026-07-05-unified-repository-connectors',
                },
              ],
            },
            {
              text: '2026-06-25',
              collapsed: true,
              items: [
                {
                  text: 'Redis Helpers Refactor - Abstract Base, Interfaces, Sentinel & Factory',
                  link: '/changelogs/2026-06-25-redis-helpers-refactor',
                },
              ],
            },
            {
              text: '2026-06-18',
              collapsed: true,
              items: [
                {
                  text: 'Current User Information Endpoint - GET /me & who-am-i Flag',
                  link: '/changelogs/2026-06-18-auth-user-information-endpoint',
                },
              ],
            },
            {
              text: '2026-06-14',
              collapsed: true,
              items: [
                {
                  text: 'Validation Message Codes, SQLSTATE-Class DB Errors & Production Error Hardening',
                  link: '/changelogs/2026-06-14-validation-codes-and-error-hardening',
                },
              ],
            },
            {
              text: '2026-06-02',
              collapsed: true,
              items: [
                {
                  text: 'Scoped RBAC Authorization - Edge-Table Model, Pooled Enforcer, Redis-Only Cache',
                  link: '/changelogs/2026-06-02-authorize-scoped-rbac',
                },
              ],
            },
            {
              text: '2026-05-27',
              collapsed: true,
              items: [
                {
                  text: 'Casbin Domain Matching Function - Wildcard/Pattern Domains in g',
                  link: '/changelogs/2026-05-27-casbin-domain-matching-function',
                },
              ],
            },
            {
              text: '2026-05-25',
              collapsed: true,
              items: [
                {
                  text: 'Per-Model Default Limit via @model Settings',
                  link: '/changelogs/2026-05-25-per-model-default-limit',
                },
              ],
            },
            {
              text: '2026-05-22',
              collapsed: true,
              items: [
                {
                  text: 'Drizzle Casbin Adapter - Schema-Qualified Tables',
                  link: '/changelogs/2026-05-22-casbin-adapter-schema-qualification',
                },
              ],
            },
            {
              text: '2026-05-21',
              collapsed: true,
              items: [
                { text: 'Mass Update/Delete Guards', link: '/changelogs/2026-05-21-mass-mutation-guards' },
              ],
            },
            {
              text: '2026-05-20',
              collapsed: true,
              items: [
                { text: 'Consistent Default Limit for To-Many Relations', link: '/changelogs/2026-05-20-relation-scope-default-limit' },
              ],
            },
            {
              text: '2026-05-08',
              collapsed: true,
              items: [
                { text: 'CRUD Route Toggles & Typed JSON Responses', link: '/changelogs/2026-05-08-crud-route-toggles-and-typed-responses' },
              ],
            },
            {
              text: '2026-05-05',
              collapsed: true,
              items: [
                { text: 'Refresh Access Token Endpoint', link: '/changelogs/2026-05-05-refresh-token-endpoint' },
              ],
            },
            {
              text: '2026-04-23',
              collapsed: true,
              items: [
                { text: 'Error Responses - messageCode & Extra Fields', link: '/changelogs/2026-04-23-error-response-extra-fields' },
              ],
            },
            {
              text: '2026-03-31',
              collapsed: true,
              items: [
                { text: 'TypeScript 6 Upgrade & Toolchain Refresh', link: '/changelogs/2026-03-31-typescript-6-and-toolchain' },
              ],
            },
            {
              text: '2026-03-30',
              collapsed: true,
              items: [
                { text: 'Row-Level Locking (FOR UPDATE)', link: '/changelogs/2026-03-30-row-level-locking' },
              ],
            },
            {
              text: '2026-03-15',
              collapsed: true,
              items: [
                { text: 'gRPC Controller System', link: '/changelogs/2026-03-15-grpc-controller-system' },
              ],
            },
            {
              text: '2026-03-12',
              collapsed: true,
              items: [
                {
                  text: 'Kafka Helpers Enhancement',
                  link: '/changelogs/2026-03-12-kafka-helpers-enhancement',
                },
              ],
            },
            {
              text: '2026-03-10',
              collapsed: true,
              items: [
                { text: 'Kafka Helpers Refactor', link: '/changelogs/2026-03-10-kafka-helpers-refactor' },
              ],
            },
            {
              text: '2026-03-06',
              collapsed: true,
              items: [
                { text: 'Filter Offset/Skip Bug Fix', link: '/changelogs/2026-03-06-filter-offset-skip-fix' },
              ],
            },
            {
              text: '2026-03-04',
              collapsed: true,
              items: [
                { text: 'JWT Payload Field Codecs', link: '/changelogs/2026-03-04-jwt-payload-field-codecs' },
              ],
            },
            {
              text: '2026-03-02',
              collapsed: true,
              items: [
                { text: 'Model Authorize Settings', link: '/changelogs/2026-03-02-model-authorize-settings' },
              ],
            },
            {
              text: '2026-02-27',
              collapsed: true,
              items: [
                { text: 'JWKS Authentication & Service Hierarchy Refactor', link: '/changelogs/2026-02-27-jwks-authentication' },
              ],
            },
            {
              text: '2026-02-26',
              collapsed: true,
              items: [
                { text: 'Core/Helpers Decoupling', link: '/changelogs/2026-02-26-core-helpers-decoupling' },
              ],
            },
            {
              text: '2026-02-16',
              collapsed: true,
              items: [
                { text: 'Authorization System & Auth Refactor', link: '/changelogs/2026-02-16-authorization-system' },
              ],
            },
            {
              text: '2026-02-11',
              collapsed: true,
              items: [
                { text: 'WebSocket Generic Type Parameters', link: '/changelogs/2026-02-11-websocket-generic-types' },
                { text: 'WebSocket Encrypted Delivery', link: '/changelogs/2026-02-11-websocket-encrypted-delivery' },
                { text: 'Crypto Algorithm Refactor & ECDH', link: '/changelogs/2026-02-11-crypto-refactor-ecdh' },
              ],
            },
            {
              text: '2026-02-10',
              collapsed: true,
              items: [
                { text: 'WebSocket Heartbeat & Payload Limit', link: '/changelogs/2026-02-10-websocket-heartbeat-payload' },
              ],
            },
            {
              text: '2026-02-06',
              collapsed: true,
              items: [
                { text: 'Socket.IO Integration Fix', link: '/changelogs/2026-02-06-socket-io-integration-fix' },
              ],
            },
            {
              text: '2026-01-11',
              collapsed: true,
              items: [
                { text: 'Logger Optimization & HfLogger', link: '/changelogs/2026-01-11-logger-optimization-hf-logger' },
              ],
            },
            {
              text: '2026-01-07',
              collapsed: true,
              items: [
                { text: 'Controller Route Customization', link: '/changelogs/2026-01-07-controller-route-customization' },
              ],
            },
            {
              text: '2026-01-06',
              collapsed: true,
              items: [
                { text: 'Basic Authentication Strategy', link: '/changelogs/2026-01-06-basic-authentication' },
              ],
            },
            {
              text: '2026-01-05',
              collapsed: true,
              items: [
                { text: 'Range Queries & Content-Range Header', link: '/changelogs/2026-01-05-range-queries-content-range' },
              ],
            },
            {
              text: '2026-01-02',
              collapsed: true,
              items: [
                { text: 'Default Filter & Repository Mixins', link: '/changelogs/2026-01-02-default-filter-and-repository-mixins' },
              ],
            },
            {
              text: '2025-12-31',
              collapsed: true,
              items: [
                { text: 'JSON Path Filtering & Array Operators', link: '/changelogs/2025-12-31-json-path-filtering-array-operators' },
                { text: 'String ID with Custom Generator', link: '/changelogs/2025-12-31-string-id-custom-generator' },
              ],
            },
            {
              text: '2025-12-30',
              collapsed: true,
              items: [
                { text: 'Repository Enhancements', link: '/changelogs/2025-12-30-repository-enhancements' },
              ],
            },
            {
              text: '2025-12-29',
              collapsed: true,
              items: [
                { text: 'Snowflake UID Helper', link: '/changelogs/2025-12-29-snowflake-uid-helper' },
                { text: 'Dynamic Binding Registration Fix', link: '/changelogs/2025-12-29-dynamic-binding-registration' },
              ],
            },
            {
              text: '2025-12-26',
              collapsed: true,
              items: [
                { text: 'Transaction Support', link: '/changelogs/2025-12-26-transaction-support' },
                { text: 'Nested Relations & Generic Types', link: '/changelogs/2025-12-26-nested-relations-and-generics' },
              ],
            },
            {
              text: '2025-12-18',
              collapsed: true,
              items: [
                { text: 'Performance Optimizations', link: '/changelogs/2025-12-18-performance-optimizations' },
                { text: 'Validation & Security', link: '/changelogs/2025-12-18-repository-validation-security' },
              ],
            },
            {
              text: '2025-12-17',
              collapsed: true,
              items: [
                { text: 'Inversion of Control Refactor', link: '/changelogs/2025-12-17-refactor' },
              ],
            },
            {
              text: '2025-12-16',
              collapsed: true,
              items: [
                { text: 'Model-Repository-DataSource Refactor', link: '/changelogs/2025-12-16-model-repo-datasource-refactor' },
                { text: 'Initial Architecture', link: '/changelogs/2025-12-16-initial-architecture' },
              ],
            },
          ],
        },
        {
          text: 'Planning',
          collapsed: true,
          items: [
            { text: 'Schema Migrator', link: '/changelogs/planned-schema-migrator' },
          ],
        },
      ],
      '/best-practices/': [
        {
          text: 'Best Practices',
          items: [
            { text: 'Overview', link: '/best-practices/' },
          ],
        },
        {
          text: 'Foundation',
          collapsed: false,
          items: [
            { text: 'Architectural Patterns', link: '/best-practices/architectural-patterns' },
            { text: 'Architecture Decisions', link: '/best-practices/architecture-decisions' },
          ],
        },
        {
          text: 'Development',
          collapsed: false,
          items: [
            {
              text: 'Code Style Standards',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/best-practices/code-style-standards/' },
                { text: 'Tooling', link: '/best-practices/code-style-standards/tooling' },
                { text: 'Naming Conventions', link: '/best-practices/code-style-standards/naming-conventions' },
                { text: 'Type Safety', link: '/best-practices/code-style-standards/type-safety' },
                { text: 'Function Patterns', link: '/best-practices/code-style-standards/function-patterns' },
                { text: 'Route Definitions', link: '/best-practices/code-style-standards/route-definitions' },
                { text: 'Constants & Config', link: '/best-practices/code-style-standards/constants-configuration' },
                { text: 'Control Flow', link: '/best-practices/code-style-standards/control-flow' },
                { text: 'Advanced Patterns', link: '/best-practices/code-style-standards/advanced-patterns' },
                { text: 'Documentation (JSDoc)', link: '/best-practices/code-style-standards/documentation' },
              ],
            },
            { text: 'Data Modeling', link: '/best-practices/data-modeling' },
            { text: 'API Usage Examples', link: '/best-practices/api-usage-examples' },
          ],
        },
        {
          text: 'Quality',
          collapsed: false,
          items: [
            { text: 'Testing Strategies', link: '/best-practices/testing-strategies' },
            { text: 'Error Handling', link: '/best-practices/error-handling' },
            { text: 'Common Pitfalls', link: '/best-practices/common-pitfalls' },
            { text: 'Troubleshooting Tips', link: '/best-practices/troubleshooting-tips' },
          ],
        },
        {
          text: 'Production',
          collapsed: false,
          items: [
            { text: 'Security Guidelines', link: '/best-practices/security-guidelines' },
            { text: 'Performance Optimization', link: '/best-practices/performance-optimization' },
            { text: 'Deployment Strategies', link: '/best-practices/deployment-strategies' },
          ],
        },
        {
          text: 'Contributing',
          collapsed: true,
          items: [
            { text: 'Contribution Workflow', link: '/best-practices/contribution-workflow' },
          ],
        },
      ],
      '/guides/': [
        {
          text: 'Get Started',
          items: [
            { text: 'Overview', link: '/guides/' },
            { text: 'Philosophy', link: '/guides/get-started/philosophy' },
            { text: 'Setup', link: '/guides/get-started/setup' },
            { text: '5-Minute Quickstart', link: '/guides/get-started/5-minute-quickstart' },
          ],
        },
        {
          text: 'Tutorials',
          items: [
            { text: 'Complete Installation', link: '/guides/tutorials/complete-installation' },
            { text: 'Building a CRUD API', link: '/guides/tutorials/building-a-crud-api' },
            { text: 'E-commerce API', link: '/guides/tutorials/ecommerce-api' },
            { text: 'Real-Time Chat', link: '/guides/tutorials/realtime-chat' },
            { text: 'Testing', link: '/guides/tutorials/testing' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            {
              text: 'Application',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/guides/core-concepts/application/' },
                { text: 'Registering Artifacts', link: '/guides/core-concepts/application/bootstrapping' },
              ],
            },
            {
              text: 'Controllers',
              collapsed: true,
              items: [
                { text: 'REST', link: '/guides/core-concepts/rest-controllers' },
                { text: 'gRPC', link: '/guides/core-concepts/grpc-controllers' },
              ],
            },
            { text: 'Dependency Injection', link: '/guides/core-concepts/dependency-injection' },
            {
              text: 'Components',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/guides/core-concepts/components' },
                { text: 'Creating Components', link: '/guides/core-concepts/components-guide' },
              ],
            },
            { text: 'Services', link: '/guides/core-concepts/services' },
            { text: 'Secrets & Vault', link: '/guides/core-concepts/secrets-vault' },
            {
              text: 'Persistent Layer',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/guides/core-concepts/persistent/' },
                { text: 'Models', link: '/guides/core-concepts/persistent/models' },
                { text: 'DataSources', link: '/guides/core-concepts/persistent/datasources' },
                { text: 'Repositories', link: '/guides/core-concepts/persistent/repositories' },
                { text: 'Transactions', link: '/guides/core-concepts/persistent/transactions' },
                {
                  text: 'Postgres Drivers & Supabase',
                  link: '/guides/core-concepts/persistent/postgres-drivers',
                },
                { text: 'PGlite', link: '/guides/core-concepts/persistent/pglite' },
                { text: 'SQLite', link: '/guides/core-concepts/persistent/sqlite' },
                { text: 'Search & Typesense', link: '/guides/core-concepts/persistent/search-typesense' },
                {
                  text: 'Search & Meilisearch',
                  link: '/guides/core-concepts/persistent/search-meilisearch',
                },
              ],
            },
          ],
        },
        {
          text: 'Reference',
          collapsed: true,
          items: [
            { text: 'Glossary', link: '/guides/reference/glossary' },
            { text: 'MCP Docs Server', link: '/guides/reference/mcp-docs-server' },
          ],
        },
        {
          text: 'Migrations',
          collapsed: true,
          items: [
            { text: 'Unified Connectors (BANA)', link: '/guides/migrations/unified-connectors-migration' },
          { text: 'Scoped RBAC (from DrizzleCasbinAdapter)', link: '/guides/migrations/scoped-rbac-migration' },
            { text: 'Redis Helper API (rename + camelCase)', link: '/guides/migrations/redis-helpers-migration' },
          ],
        },
      ],

      // ── Core API: reuse the same sidebar for all sub-paths ──
      '/references/base/': coreApiSidebar,
      '/references/configuration/': coreApiSidebar,
      '/references/utilities/': coreApiSidebar,
      '/references/quick-reference': coreApiSidebar,
      '/references/': coreApiSidebar, // catch-all for /references/ index

      // ── Extensions: reuse the same sidebar for all sub-paths ──
      '/extensions/': extensionsSidebar,
      '/extensions/components/': extensionsSidebar,
      '/extensions/helpers/': extensionsSidebar,
      '/extensions/src-details/': extensionsSidebar,
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/VENIZIA-AI/ignis' }],
  },
});

export default withMermaid(config);
