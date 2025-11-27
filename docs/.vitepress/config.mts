import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "🔥 IGNIS",
  description: "A TypeScript Server Infrastructure with Hono Framework",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guides/creating-a-new-project' },
      { text: 'Core Concepts', link: '/core-concepts/application' }
    ],

    sidebar: {
      '/guides/': [
        {
          text: 'Guides',
          items: [
            { text: 'Creating a New Project', link: '/guides/creating-a-new-project' },
            { text: 'Setting up Project', link: '/guides/setting-up-project' }
          ]
        }
      ],
      '/core-concepts/': [
        {
          text: 'Core Concepts',
          items: [
            { text: 'Application', link: '/core-concepts/application' },
            { text: 'Controllers', link: '/core-concepts/controllers' },
            { text: 'Dependency Injection', link: '/core-concepts/dependency-injection' },
            { text: 'Components', link: '/core-concepts/components' },
            { text: 'Services and Repositories', link: '/core-concepts/services-and-repositories' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Authentication', link: '/features/authentication' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/your-repo' }
    ]
  }
})