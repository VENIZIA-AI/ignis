import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

// https://vitepress.dev/reference/site-config
const config = defineConfig({
  base: '/ignis/',
  srcDir: '../wiki',
  srcExclude: ['**/template/**'],
  title: 'IGNIS',
  description: 'A TypeScript Server Infrastructure with Hono Framework',
  head: [['link', { rel: 'icon', href: '/ignis/logo.svg' }]],
  vite: {
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
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
          text: 'History',
          collapsed: false,
          items: [
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
          text: 'Components',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/references/components/' },
            {
              text: 'Authentication',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/components/authentication/' },
                { text: 'Quick Reference', link: '/references/components/authentication/quick-reference' },
                { text: 'Binding Keys', link: '/references/components/authentication/binding-keys' },
                { text: 'Setup Guide', link: '/references/components/authentication/setup-guide' },
                { text: 'Configuration', link: '/references/components/authentication/configuration' },
                { text: 'Architecture', link: '/references/components/authentication/architecture' },
                { text: 'API Endpoints', link: '/references/components/authentication/api-endpoints' },
                { text: 'Troubleshooting', link: '/references/components/authentication/troubleshooting' },
                { text: 'See Also', link: '/references/components/authentication/see-also' },
              ],
            },
            {
              text: 'Health Check',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/components/health-check/' },
                { text: 'Quick Reference', link: '/references/components/health-check/quick-reference' },
                { text: 'Binding Keys', link: '/references/components/health-check/binding-keys' },
                { text: 'Setup Guide', link: '/references/components/health-check/setup-guide' },
                { text: 'Configuration', link: '/references/components/health-check/configuration' },
                { text: 'API Endpoints', link: '/references/components/health-check/api-endpoints' },
                { text: 'Troubleshooting', link: '/references/components/health-check/troubleshooting' },
                { text: 'See Also', link: '/references/components/health-check/see-also' },
              ],
            },
            {
              text: 'Mail',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/components/mail/' },
                { text: 'Quick Reference', link: '/references/components/mail/quick-reference' },
                { text: 'Binding Keys', link: '/references/components/mail/binding-keys' },
                { text: 'Setup Guide', link: '/references/components/mail/setup-guide' },
                { text: 'Configuration', link: '/references/components/mail/configuration' },
                { text: 'Architecture', link: '/references/components/mail/architecture' },
                { text: 'Internals', link: '/references/components/mail/internals' },
                { text: 'Troubleshooting', link: '/references/components/mail/troubleshooting' },
                { text: 'See Also', link: '/references/components/mail/see-also' },
              ],
            },
            {
              text: 'Request Tracker',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/components/request-tracker/' },
                { text: 'Quick Reference', link: '/references/components/request-tracker/quick-reference' },
                { text: 'Binding Keys', link: '/references/components/request-tracker/binding-keys' },
                { text: 'Setup Guide', link: '/references/components/request-tracker/setup-guide' },
                { text: 'Configuration', link: '/references/components/request-tracker/configuration' },
                { text: 'Troubleshooting', link: '/references/components/request-tracker/troubleshooting' },
                { text: 'See Also', link: '/references/components/request-tracker/see-also' },
              ],
            },
            {
              text: 'Socket.IO',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/components/socket-io/' },
                { text: 'Quick Reference', link: '/references/components/socket-io/quick-reference' },
                { text: 'Binding Keys', link: '/references/components/socket-io/binding-keys' },
                { text: 'Setup Guide', link: '/references/components/socket-io/setup-guide' },
                { text: 'Configuration', link: '/references/components/socket-io/configuration' },
                { text: 'Architecture', link: '/references/components/socket-io/architecture' },
                { text: 'Internals', link: '/references/components/socket-io/internals' },
                { text: 'Troubleshooting', link: '/references/components/socket-io/troubleshooting' },
                { text: 'See Also', link: '/references/components/socket-io/see-also' },
              ],
            },
            {
              text: 'WebSocket',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/components/websocket/' },
                { text: 'Quick Reference', link: '/references/components/websocket/quick-reference' },
                { text: 'Binding Keys', link: '/references/components/websocket/binding-keys' },
                { text: 'Setup Guide', link: '/references/components/websocket/setup-guide' },
                { text: 'Configuration', link: '/references/components/websocket/configuration' },
                { text: 'Architecture', link: '/references/components/websocket/architecture' },
                { text: 'Internals', link: '/references/components/websocket/internals' },
                { text: 'Troubleshooting', link: '/references/components/websocket/troubleshooting' },
                { text: 'See Also', link: '/references/components/websocket/see-also' },
              ],
            },
            {
              text: 'Static Asset',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/components/static-asset/' },
                { text: 'Quick Reference', link: '/references/components/static-asset/quick-reference' },
                { text: 'Binding Keys', link: '/references/components/static-asset/binding-keys' },
                { text: 'Setup Guide', link: '/references/components/static-asset/setup-guide' },
                { text: 'Configuration', link: '/references/components/static-asset/configuration' },
                { text: 'API Endpoints', link: '/references/components/static-asset/api-endpoints' },
                { text: 'Internals', link: '/references/components/static-asset/internals' },
                { text: 'Troubleshooting', link: '/references/components/static-asset/troubleshooting' },
                { text: 'See Also', link: '/references/components/static-asset/see-also' },
              ],
            },
            {
              text: 'Swagger',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/components/swagger/' },
                { text: 'Quick Reference', link: '/references/components/swagger/quick-reference' },
                { text: 'Binding Keys', link: '/references/components/swagger/binding-keys' },
                { text: 'Setup Guide', link: '/references/components/swagger/setup-guide' },
                { text: 'Configuration', link: '/references/components/swagger/configuration' },
                { text: 'API Endpoints', link: '/references/components/swagger/api-endpoints' },
                { text: 'Troubleshooting', link: '/references/components/swagger/troubleshooting' },
                { text: 'See Also', link: '/references/components/swagger/see-also' },
              ],
            },
          ],
        },
        {
          text: 'Base Abstractions',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/references/base/' },
            { text: 'Application', link: '/references/base/application' },
            { text: 'Bootstrapping', link: '/references/base/bootstrapping' },
            { text: 'Components', link: '/references/base/components' },
            { text: 'Controllers', link: '/references/base/controllers' },
            { text: 'Dependency Injection', link: '/references/base/dependency-injection' },
            { text: 'Middlewares', link: '/references/base/middlewares' },
            { text: 'Models & Enrichers', link: '/references/base/models' },
            { text: 'Providers', link: '/references/base/providers' },
            { text: 'DataSources', link: '/references/base/datasources' },
            {
              text: 'Repositories',
              collapsed: false,
              items: [
                { text: 'Overview', link: '/references/base/repositories/' },
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
          text: 'Helpers',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/references/helpers/' },
            {
              text: 'Cron',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/cron/' },
                { text: 'Quick Reference', link: '/references/helpers/cron/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/cron/creating-instance' },
                { text: 'Usage', link: '/references/helpers/cron/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/cron/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/cron/see-also' },
              ],
            },
            {
              text: 'Crypto',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/crypto/' },
                { text: 'Quick Reference', link: '/references/helpers/crypto/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/crypto/creating-instance' },
                { text: 'Usage', link: '/references/helpers/crypto/usage' },
                { text: 'API Summary', link: '/references/helpers/crypto/api-summary' },
                { text: 'Troubleshooting', link: '/references/helpers/crypto/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/crypto/see-also' },
              ],
            },
            {
              text: 'Environment',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/env/' },
                { text: 'Quick Reference', link: '/references/helpers/env/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/env/creating-instance' },
                { text: 'Usage', link: '/references/helpers/env/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/env/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/env/see-also' },
              ],
            },
            {
              text: 'Error',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/error/' },
                { text: 'Quick Reference', link: '/references/helpers/error/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/error/creating-instance' },
                { text: 'Usage', link: '/references/helpers/error/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/error/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/error/see-also' },
              ],
            },
            {
              text: 'Inversion (DI)',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/inversion/' },
                { text: 'Quick Reference', link: '/references/helpers/inversion/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/inversion/creating-instance' },
                { text: 'Usage', link: '/references/helpers/inversion/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/inversion/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/inversion/see-also' },
              ],
            },
            {
              text: 'Logger',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/logger/' },
                { text: 'Quick Reference', link: '/references/helpers/logger/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/logger/creating-instance' },
                { text: 'Usage', link: '/references/helpers/logger/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/logger/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/logger/see-also' },
              ],
            },
            {
              text: 'Network',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/network/' },
                { text: 'Quick Reference', link: '/references/helpers/network/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/network/creating-instance' },
                { text: 'Usage', link: '/references/helpers/network/usage' },
                { text: 'API Summary', link: '/references/helpers/network/api-summary' },
                { text: 'Troubleshooting', link: '/references/helpers/network/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/network/see-also' },
              ],
            },
            {
              text: 'Queue',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/queue/' },
                { text: 'Quick Reference', link: '/references/helpers/queue/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/queue/creating-instance' },
                { text: 'Usage', link: '/references/helpers/queue/usage' },
                { text: 'API Summary', link: '/references/helpers/queue/api-summary' },
                { text: 'Troubleshooting', link: '/references/helpers/queue/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/queue/see-also' },
              ],
            },
            {
              text: 'Redis',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/redis/' },
                { text: 'Quick Reference', link: '/references/helpers/redis/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/redis/creating-instance' },
                { text: 'Usage', link: '/references/helpers/redis/usage' },
                { text: 'API Summary', link: '/references/helpers/redis/api-summary' },
                { text: 'Troubleshooting', link: '/references/helpers/redis/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/redis/see-also' },
              ],
            },
            {
              text: 'Socket.IO',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/socket-io/' },
                { text: 'Quick Reference', link: '/references/helpers/socket-io/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/socket-io/creating-instance' },
                { text: 'Usage', link: '/references/helpers/socket-io/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/socket-io/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/socket-io/see-also' },
              ],
            },
            {
              text: 'WebSocket',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/websocket/' },
                { text: 'Quick Reference', link: '/references/helpers/websocket/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/websocket/creating-instance' },
                { text: 'Usage', link: '/references/helpers/websocket/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/websocket/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/websocket/see-also' },
              ],
            },
            {
              text: 'Storage',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/storage/' },
                { text: 'Quick Reference', link: '/references/helpers/storage/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/storage/creating-instance' },
                { text: 'Usage', link: '/references/helpers/storage/usage' },
                { text: 'API Summary', link: '/references/helpers/storage/api-summary' },
                { text: 'Troubleshooting', link: '/references/helpers/storage/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/storage/see-also' },
              ],
            },
            {
              text: 'Testing',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/testing/' },
                { text: 'Quick Reference', link: '/references/helpers/testing/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/testing/creating-instance' },
                { text: 'Usage', link: '/references/helpers/testing/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/testing/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/testing/see-also' },
              ],
            },
            {
              text: 'Types',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/types/' },
                { text: 'Quick Reference', link: '/references/helpers/types/quick-reference' },
                { text: 'Usage', link: '/references/helpers/types/usage' },
                { text: 'See Also', link: '/references/helpers/types/see-also' },
              ],
            },
            {
              text: 'UID',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/uid/' },
                { text: 'Quick Reference', link: '/references/helpers/uid/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/uid/creating-instance' },
                { text: 'Usage', link: '/references/helpers/uid/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/uid/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/uid/see-also' },
              ],
            },
            {
              text: 'Worker Thread',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/references/helpers/worker-thread/' },
                { text: 'Quick Reference', link: '/references/helpers/worker-thread/quick-reference' },
                { text: 'Creating an Instance', link: '/references/helpers/worker-thread/creating-instance' },
                { text: 'Usage', link: '/references/helpers/worker-thread/usage' },
                { text: 'Troubleshooting', link: '/references/helpers/worker-thread/troubleshooting' },
                { text: 'See Also', link: '/references/helpers/worker-thread/see-also' },
              ],
            },
          ],
        },
        {
          text: 'Utilities',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/references/utilities/' },
            { text: 'Crypto', link: '/references/utilities/crypto' },
            { text: 'Date', link: '/references/utilities/date' },
            { text: 'JSX', link: '/references/utilities/jsx' },
            { text: 'Module', link: '/references/utilities/module' },
            { text: 'Parse', link: '/references/utilities/parse' },
            { text: 'Performance', link: '/references/utilities/performance' },
            { text: 'Promise', link: '/references/utilities/promise' },
            { text: 'Request', link: '/references/utilities/request' },
            { text: 'Schema', link: '/references/utilities/schema' },
            { text: 'Statuses', link: '/references/utilities/statuses' },
          ],
        },
        {
          text: 'Framework Internals',
          collapsed: false,
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
