import { withMermaid } from 'vitepress-plugin-mermaid';
import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
const config = defineConfig({
  title: '🔥 IGNIS',
  description: 'A TypeScript Server Infrastructure with Hono Framework',
  head: [['link', { rel: 'icon', href: '/logo.svg' }]],
  themeConfig: {
    search: {
      provider: 'local'
    },

    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/get-started/philosophy' },
      { text: 'Reference(s)', link: '/references/components/' },
    ],

    sidebar: {
      '/get-started/': [
        {
          text: 'Get Started',
          items: [
            { text: 'Philosophy', link: '/get-started/philosophy' },
            { text: 'Quick Start', link: '/get-started/quickstart' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Application', link: '/get-started/core-concepts/application' },
            { text: 'Controllers', link: '/get-started//core-concepts/controllers' },
            {
              text: 'Dependency Injection',
              link: '/get-started//core-concepts/dependency-injection',
            },
            { text: 'Components', link: '/get-started//core-concepts/components' },
            {
              text: 'Services and Repositories',
              link: '/get-started//core-concepts/services-and-repositories',
            },
            {
              text: 'Datasources and Models',
              link: '/get-started//core-concepts/datasources-and-models',
            },
          ],
        },
      ],
      '/references': [
        {
          text: 'Components',
          items: [
            { text: 'Overview', link: '/references/components/' },
            { text: 'Authentication', link: '/references/components/authentication' },
            { text: 'Health Check', link: '/references/components/health-check' },
            { text: 'Request Tracker', link: '/references/components/request-tracker' },
            { text: 'Socket.IO', link: '/references/components/socket-io' },
            { text: 'Swagger', link: '/references/components/swagger' },
          ],
        },
        {
          text: 'Helpers',
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
            { text: 'Worker Thread', link: '/references/helpers/worker-thread' },
          ],
        },
        {
          text: 'Utilities',
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
          items: [{ text: 'Source Code Structure', link: '/references/src-details/' }],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/VENIZIA-AI/ignis' }],
  },
});

export default withMermaid(config);
