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
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/get-started/' },
      { text: 'Core Concepts', link: '/get-started/core-concepts/application' },
      { text: 'Best Practices', link: '/get-started/best-practices/architectural-patterns' },
      { text: 'Reference(s)', link: '/references/components/' },
      { text: 'Change Log(s)', link: '/changelogs/' },
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
      '/get-started/': [
        {
          text: 'Get Started',
          items: [
            { text: 'Overview', link: '/get-started/' },
            { text: 'Prerequisites', link: '/get-started/prerequisites' },
            { text: 'Philosophy', link: '/get-started/philosophy' },
            { text: '5-Minute Quickstart ⚡', link: '/get-started/5-minute-quickstart' },
            { text: 'Complete Setup Guide', link: '/get-started/quickstart' },
            { text: 'Building a CRUD API', link: '/get-started/building-a-crud-api' },
            { text: 'MCP Docs Server', link: '/get-started/mcp-docs-server' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            {
              text: 'Application',
              link: '/get-started/core-concepts/application',
            },
            {
              text: 'Controllers',
              link: '/get-started/core-concepts/controllers',
            },
            {
              text: 'Dependency Injection',
              link: '/get-started/core-concepts/dependency-injection',
            },
            {
              text: 'Components',
              link: '/get-started/core-concepts/components',
            },
            {
              text: 'Services',
              link: '/get-started/core-concepts/services',
            },
            {
              text: 'Persistent Layer',
              link: '/get-started/core-concepts/persistent',
            },
            {
              text: 'Bootstrapping',
              link: '/get-started/core-concepts/bootstrapping',
            },
          ],
        },
        {
          text: 'Best Practices',
          items: [
            {
              text: 'Architectural Patterns',
              link: '/get-started/best-practices/architectural-patterns',
            },
            {
              text: 'Data Modeling',
              link: '/get-started/best-practices/data-modeling',
            },
            {
              text: 'Performance Optimization',
              link: '/get-started/best-practices/performance-optimization',
            },
            {
              text: 'Security Guidelines',
              link: '/get-started/best-practices/security-guidelines',
            },
            {
              text: 'Code Style Standards',
              link: '/get-started/best-practices/code-style-standards',
            },
            {
              text: 'Deployment Strategies',
              link: '/get-started/best-practices/deployment-strategies',
            },
            {
              text: 'Common Pitfalls',
              link: '/get-started/best-practices/common-pitfalls',
            },
            {
              text: 'Troubleshooting Tips',
              link: '/get-started/best-practices/troubleshooting-tips',
            },
            {
              text: 'API Usage Examples',
              link: '/get-started/best-practices/api-usage-examples',
            },
            {
              text: 'Contribution Workflow',
              link: '/get-started/best-practices/contribution-workflow',
            },
          ],
        },
      ],
      '/references': [
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
            { text: 'Application', link: '/references/base/application' },
            { text: 'Bootstrapping', link: '/references/base/bootstrapping' },
            { text: 'Components', link: '/references/base/components' },
            { text: 'Controllers', link: '/references/base/controllers' },
            { text: 'Dependency Injection', link: '/references/base/dependency-injection' },
            { text: 'Models & Enrichers', link: '/references/base/models' },
            { text: 'DataSources', link: '/references/base/datasources' },
            { text: 'Repositories', link: '/references/base/repositories' },
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
