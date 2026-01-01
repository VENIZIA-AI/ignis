import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

// https://vitepress.dev/reference/site-config
const config = defineConfig({
  base: '/ignis/',
  srcDir: '../wiki',
  title: 'IGNIS',
  description: 'A TypeScript Server Infrastructure with Hono Framework',
  head: [['link', { rel: 'icon', href: '/ignis/logo.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Guide(s)', link: '/guides/' },
      { text: 'API(s)', link: '/references/' },
      { text: 'Best Practice(s)', link: '/best-practices/' },
      { text: 'Changelog(s)', link: '/changelogs/' },
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
          text: 'Planning',
          collapsed: true,
          items: [
            {
              text: 'Schema Migrator',
              link: '/changelogs/planned-schema-migrator',
            },
          ],
        },
        {
          text: '2025-12-31',
          collapsed: false,
          items: [
            {
              text: 'JSON Path Filtering & Array Operators',
              link: '/changelogs/2025-12-31-json-path-filtering-array-operators',
            },
            {
              text: 'String ID with Custom Generator',
              link: '/changelogs/2025-12-31-string-id-custom-generator',
            },
          ],
        },
        {
          text: '2025-12-30',
          collapsed: false,
          items: [
            {
              text: 'Repository Enhancements',
              link: '/changelogs/2025-12-30-repository-enhancements',
            },
          ],
        },
        {
          text: '2025-12-29',
          collapsed: false,
          items: [
            {
              text: 'Snowflake UID Helper',
              link: '/changelogs/2025-12-29-snowflake-uid-helper',
            },
            {
              text: 'Dynamic Binding Registration Fix',
              link: '/changelogs/2025-12-29-dynamic-binding-registration',
            },
          ],
        },
        {
          text: '2025-12-26',
          collapsed: false,
          items: [
            {
              text: 'Transaction Support',
              link: '/changelogs/2025-12-26-transaction-support',
            },
            {
              text: 'Nested Relations & Generic Types',
              link: '/changelogs/2025-12-26-nested-relations-and-generics',
            },
          ],
        },
        {
          text: '2025-12-18',
          collapsed: false,
          items: [
            {
              text: 'Performance Optimizations',
              link: '/changelogs/2025-12-18-performance-optimizations',
            },
            {
              text: 'Validation & Security',
              link: '/changelogs/2025-12-18-repository-validation-security',
            },
          ],
        },
        {
          text: '2025-12-17',
          collapsed: true,
          items: [
            {
              text: 'Inversion of Control Refactor',
              link: '/changelogs/2025-12-17-refactor',
            },
          ],
        },
        {
          text: '2025-12-16',
          collapsed: true,
          items: [
            {
              text: 'Model-Repository-DataSource Refactor',
              link: '/changelogs/2025-12-16-model-repo-datasource-refactor',
            },
            {
              text: 'Initial Architecture',
              link: '/changelogs/2025-12-16-initial-architecture',
            },
          ],
        },
      ],
      '/best-practices/': [
        {
          text: 'Best Practices',
          items: [
            { text: 'Overview', link: '/best-practices/' },
            { text: 'Architectural Patterns', link: '/best-practices/architectural-patterns' },
            { text: 'Architecture Decisions', link: '/best-practices/architecture-decisions' },
            { text: 'Data Modeling', link: '/best-practices/data-modeling' },
            { text: 'Performance Optimization', link: '/best-practices/performance-optimization' },
            { text: 'Security Guidelines', link: '/best-practices/security-guidelines' },
            { text: 'Code Style Standards', link: '/best-practices/code-style-standards' },
            { text: 'Deployment Strategies', link: '/best-practices/deployment-strategies' },
            { text: 'Common Pitfalls', link: '/best-practices/common-pitfalls' },
            { text: 'Troubleshooting Tips', link: '/best-practices/troubleshooting-tips' },
            { text: 'API Usage Examples', link: '/best-practices/api-usage-examples' },
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
                { text: 'Bootstrapping', link: '/guides/core-concepts/application/bootstrapping' },
              ],
            },
            { text: 'Controllers', link: '/guides/core-concepts/controllers' },
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
            {
              text: 'Persistent Layer',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/guides/core-concepts/persistent/' },
                { text: 'Models', link: '/guides/core-concepts/persistent/models' },
                { text: 'DataSources', link: '/guides/core-concepts/persistent/datasources' },
                { text: 'Repositories', link: '/guides/core-concepts/persistent/repositories' },
                { text: 'Transactions', link: '/guides/core-concepts/persistent/transactions' },
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
      ],
      '/references/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/references/' },
          ],
        },
        {
          text: 'Configuration',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/references/configuration/' },
            { text: 'Environment Variables', link: '/references/configuration/environment-variables' },
          ],
        },
        {
          text: 'Components',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/references/components/' },
            {
              text: 'Authentication',
              link: '/references/components/authentication',
            },
            {
              text: 'Health Check',
              link: '/references/components/health-check',
            },
            {
              text: 'Mail',
              link: '/references/components/mail',
            },
            {
              text: 'Request Tracker',
              link: '/references/components/request-tracker',
            },
            { text: 'Socket.IO', link: '/references/components/socket-io' },
            { text: 'Static Asset', link: '/references/components/static-asset' },
            { text: 'Swagger', link: '/references/components/swagger' },
          ],
        },
        {
          text: 'Base Abstractions',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/references/base/' },
            { text: 'Application', link: '/references/base/application' },
            { text: 'Bootstrapping', link: '/references/base/bootstrapping' },
            { text: 'Components', link: '/references/base/components' },
            { text: 'Controllers', link: '/references/base/controllers' },
            { text: 'Dependency Injection', link: '/references/base/dependency-injection' },
            { text: 'Models & Enrichers', link: '/references/base/models' },
            { text: 'DataSources', link: '/references/base/datasources' },
            {
              text: 'Repositories',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/base/repositories/' },
                { text: 'Filtering & Operators', link: '/references/base/repositories/filtering' },
                { text: 'Relations & Includes', link: '/references/base/repositories/relations' },
                { text: 'JSON Path Filtering', link: '/references/base/repositories/json-filtering' },
                { text: 'Array Operators', link: '/references/base/repositories/array-operators' },
                { text: 'Advanced Features', link: '/references/base/repositories/advanced' },
              ],
            },
            { text: 'Filter System', link: '/references/base/filter-system' },
            { text: 'Services', link: '/references/base/services' },
          ],
        },
        {
          text: 'Helpers',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/references/helpers/' },
            { text: 'Cron', link: '/references/helpers/cron' },
            { text: 'Crypto', link: '/references/helpers/crypto' },
            { text: 'Environment', link: '/references/helpers/env' },
            { text: 'Error', link: '/references/helpers/error' },
            { text: 'Inversion (DI)', link: '/references/helpers/inversion' },
            { text: 'Logger', link: '/references/helpers/logger' },
            { text: 'Network', link: '/references/helpers/network' },
            { text: 'Queue', link: '/references/helpers/queue' },
            { text: 'Redis', link: '/references/helpers/redis' },
            { text: 'Socket.IO', link: '/references/helpers/socket-io' },
            { text: 'Storage', link: '/references/helpers/storage' },
            { text: 'Testing', link: '/references/helpers/testing' },
            { text: 'Types', link: '/references/helpers/types' },
            { text: 'UID', link: '/references/helpers/uid' },
            {
              text: 'Worker Thread',
              link: '/references/helpers/worker-thread',
            },
          ],
        },
        {
          text: 'Utilities',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/references/utilities/' },
            { text: 'Crypto', link: '/references/utilities/crypto' },
            { text: 'Date', link: '/references/utilities/date' },
            { text: 'Module', link: '/references/utilities/module' },
            { text: 'Parse', link: '/references/utilities/parse' },
            { text: 'Performance', link: '/references/utilities/performance' },
            { text: 'Promise', link: '/references/utilities/promise' },
            { text: 'Request', link: '/references/utilities/request' },
            { text: 'Schema', link: '/references/utilities/schema' },
          ],
        },
        {
          text: 'Framework Internals',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/references/src-details/' },
            { text: 'Core (@vez/ignis)', link: '/references/src-details/core' },
            { text: 'Boot (@vez/ignis-boot)', link: '/references/src-details/boot' },
            { text: 'Helpers (@vez/ignis-helpers)', link: '/references/src-details/helpers' },
            { text: 'Inversion (@vez/ignis-inversion)', link: '/references/src-details/inversion' },
            { text: 'Dev Configs (@vez/dev-configs)', link: '/references/src-details/dev-configs' },
            { text: 'Documentation (@vez/ignis-docs)', link: '/references/src-details/docs' },
            { text: 'MCP Docs Server', link: '/references/src-details/mcp-server' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/VENIZIA-AI/ignis' }],
  },
});

export default withMermaid(config);
