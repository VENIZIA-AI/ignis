import { defineConfig, type DefaultTheme } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { writeChangelogFeed } from './theme/shared/changelog-loader.ts';
import { venziaCodeTheme } from './theme/shared/code-theme.ts';
import { VENIZIA_LOGO_SVG } from './theme/shared/venizia-logo.ts';

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
          {
            text: 'Comparison Operators',
            link: '/references/base/filter-system/comparison-operators',
          },
          { text: 'Null Operators', link: '/references/base/filter-system/null-operators' },
          { text: 'List Operators', link: '/references/base/filter-system/list-operators' },
          { text: 'Range Operators', link: '/references/base/filter-system/range-operators' },
          { text: 'Pattern Matching', link: '/references/base/filter-system/pattern-matching' },
          { text: 'Logical Operators', link: '/references/base/filter-system/logical-operators' },
          { text: 'JSON Filtering', link: '/references/base/filter-system/json-filtering' },
          { text: 'Array Operators', link: '/references/base/filter-system/array-operators' },
          {
            text: 'Fields, Order & Pagination',
            link: '/references/base/filter-system/fields-order-pagination',
          },
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
// Shown for: /extensions/components/*, /extensions/helpers/*, /extensions/atlas/*
const extensionsSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Extensions',
    items: [{ text: 'Overview', link: '/extensions/' }],
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
          { text: 'Direct Upload', link: '/extensions/components/static-asset/direct-upload' },
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
          {
            text: 'Compiling to a Single Binary',
            link: '/extensions/helpers/kafka/compile-binary',
          },
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
      { text: 'Temporal', link: '/extensions/helpers/temporal/' },
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
    text: 'Atlas',
    collapsed: false,
    items: [{ text: 'Overview', link: '/extensions/atlas/' }],
  },
];

// https://vitepress.dev/reference/site-config
const config = defineConfig({
  base: '/',
  appearance: 'dark',
  markdown: {
    // The code windows are dark in both themes (theme/shared/tokens.css), so one dark theme serves both: the
    // shared theme built from IGNIS's accent on dark (the same value as --accent-on-dark in theme/product.css).
    theme: venziaCodeTheme({ accent: '#c98a8a' }),
  },
  srcDir: '../content',
  outDir: './.vitepress/dist',
  srcExclude: ['**/template/**'],
  title: 'IGNIS',
  // The changelog feed (RSS 2.0) is written next to the pages; the changelog has no sidebar, its index is the way in.
  buildEnd: async (siteConfig) => {
    await writeChangelogFeed({
      outDir: siteConfig.outDir,
      site: {
        title: 'IGNIS changelog',
        description: 'What changed in IGNIS, who is affected and what to do about it.',
        siteUrl: 'https://ignis.venizia.ai',
      },
    });
  },
  description: 'A TypeScript Server Infrastructure with Hono Framework',
  head: [
    // The home page and its terminal hide their reveal states only under this class, set before first paint.
    ['script', {}, "document.documentElement.classList.add('js');"],
    // Favicon + PWA
    [
      'link',
      {
        rel: 'alternate',
        type: 'application/rss+xml',
        title: 'IGNIS changelog',
        href: '/changelog.xml',
      },
    ],
    ['link', { rel: 'icon', href: '/logo.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
    // Open Graph
    ['meta', { property: 'og:type', content: 'website' }],
    [
      'meta',
      {
        property: 'og:title',
        content: 'IGNIS - Focus on business value. IGNIS holds the discipline.',
      },
    ],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Controllers, services and repositories, connected by dependency injection. Validation and API docs come from the same code.',
      },
    ],
    ['meta', { property: 'og:image', content: '/og-image.png' }],
    ['meta', { property: 'og:url', content: 'https://ignis.venizia.ai/' }],
    // Twitter / X card
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    [
      'meta',
      {
        name: 'twitter:title',
        content: 'IGNIS - Focus on business value. IGNIS holds the discipline.',
      },
    ],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          'Controllers, services and repositories, connected by dependency injection. Validation and API docs come from the same code.',
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
      '/best-practices/': [
        {
          text: 'Best Practices',
          items: [{ text: 'Overview', link: '/best-practices/' }],
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
                {
                  text: 'Naming Conventions',
                  link: '/best-practices/code-style-standards/naming-conventions',
                },
                { text: 'Type Safety', link: '/best-practices/code-style-standards/type-safety' },
                {
                  text: 'Function Patterns',
                  link: '/best-practices/code-style-standards/function-patterns',
                },
                {
                  text: 'Route Definitions',
                  link: '/best-practices/code-style-standards/route-definitions',
                },
                {
                  text: 'Constants & Config',
                  link: '/best-practices/code-style-standards/constants-configuration',
                },
                { text: 'Control Flow', link: '/best-practices/code-style-standards/control-flow' },
                { text: 'Async Style', link: '/best-practices/code-style-standards/async-style' },
                {
                  text: 'Advanced Patterns',
                  link: '/best-practices/code-style-standards/advanced-patterns',
                },
                {
                  text: 'Documentation (JSDoc)',
                  link: '/best-practices/code-style-standards/documentation',
                },
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
          items: [{ text: 'Contribution Workflow', link: '/best-practices/contribution-workflow' }],
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
                {
                  text: 'Registering Artifacts',
                  link: '/guides/core-concepts/application/bootstrapping',
                },
                { text: 'Stamping A Build', link: '/guides/core-concepts/application/build-info' },
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
              text: 'Browser and Web Worker',
              link: '/guides/core-concepts/browser-and-web-worker',
            },
            {
              text: 'Persistent Layer',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/guides/core-concepts/persistent/' },
                { text: 'Models', link: '/guides/core-concepts/persistent/models' },
                {
                  text: 'Model Settings',
                  link: '/guides/core-concepts/persistent/model-settings',
                },
                { text: 'DataSources', link: '/guides/core-concepts/persistent/datasources' },
                { text: 'Repositories', link: '/guides/core-concepts/persistent/repositories' },
                { text: 'Transactions', link: '/guides/core-concepts/persistent/transactions' },
                {
                  text: 'Postgres Drivers & Supabase',
                  link: '/guides/core-concepts/persistent/postgres-drivers',
                },
                { text: 'PGlite', link: '/guides/core-concepts/persistent/pglite' },
                { text: 'SQLite', link: '/guides/core-concepts/persistent/sqlite' },
                { text: 'Raw SQL Engines', link: '/guides/core-concepts/persistent/raw-sql' },
                {
                  text: 'Search & Typesense',
                  link: '/guides/core-concepts/persistent/search-typesense',
                },
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
          items: [{ text: 'Glossary', link: '/guides/reference/glossary' }],
        },
        {
          text: 'Migrations',
          collapsed: true,
          items: [
            {
              text: 'Unified Connectors (BANA)',
              link: '/guides/migrations/unified-connectors-migration',
            },
            {
              text: 'Scoped RBAC (from DrizzleCasbinAdapter)',
              link: '/guides/migrations/scoped-rbac-migration',
            },
            {
              text: 'Redis Helper API (rename + camelCase)',
              link: '/guides/migrations/redis-helpers-migration',
            },
            {
              text: 'Boot API removal (BANA upgrade)',
              link: '/guides/migrations/boot-api-removal-migration',
            },
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
      '/extensions/atlas/': extensionsSidebar,
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/VENIZIA-AI/ignis' },
      { icon: { svg: VENIZIA_LOGO_SVG }, link: 'https://venizia.ai', ariaLabel: 'Venizia' },
    ],
  },
});

export default withMermaid(config);
