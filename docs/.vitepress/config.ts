import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AgentForge',
  description: 'Production-ready TypeScript framework for building AI agents with tools, streaming, and multi-provider support',
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#6366f1' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'AgentForge - TypeScript AI Agent Framework' }],
    ['meta', { property: 'og:description', content: 'Build production-ready AI agents with type-safe tools, streaming responses, and multi-provider support' }],
    ['meta', { property: 'og:image', content: 'https://agentforge.dev/og-image.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/agent' },
      { text: 'Examples', link: '/examples/customer-support' },
      { text: 'Playground', link: '/playground' },
      {
        text: 'v0.1.0',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Contributing', link: 'https://github.com/mpalmer79/agentforge/blob/main/CONTRIBUTING.md' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Core Concepts', link: '/guide/core-concepts' },
          ]
        },
        {
          text: 'Essentials',
          items: [
            { text: 'Tools', link: '/guide/tools' },
            { text: 'Providers', link: '/guide/providers' },
            { text: 'Middleware', link: '/guide/middleware' },
            { text: 'Memory Management', link: '/guide/memory' },
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Streaming', link: '/guide/streaming' },
            { text: 'Error Handling', link: '/guide/error-handling' },
            { text: 'React Integration', link: '/guide/react-integration' },
            { text: 'Plugins & Events', link: '/guide/plugins-events' },
          ]
        }
      ],
      '/api/': [
        {
          text: 'Core',
          items: [
            { text: 'Agent', link: '/api/agent' },
            { text: 'Tools', link: '/api/tools' },
            { text: 'Providers', link: '/api/providers' },
          ]
        },
        {
          text: 'Extensions',
          items: [
            { text: 'Middleware', link: '/api/middleware' },
            { text: 'Events & Plugins', link: '/api/events-plugins' },
            { text: 'React Hooks', link: '/api/react-hooks' },
          ]
        },
        {
          text: 'Utilities',
          items: [
            { text: 'Types', link: '/api/types' },
            { text: 'Errors', link: '/api/errors' },
            { text: 'Helpers', link: '/api/helpers' },
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Customer Support', link: '/examples/customer-support' },
            { text: 'Data Analyst', link: '/examples/data-analyst' },
            { text: 'Code Assistant', link: '/examples/code-assistant' },
            { text: 'Multi-Agent System', link: '/examples/multi-agent' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/mpalmer79/agentforge' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/agentforge' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 Michael Palmer'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/mpalmer79/agentforge/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    lastUpdated: {
      text: 'Updated at',
      formatOptions: {
        dateStyle: 'medium'
      }
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    lineNumbers: true
  },

  sitemap: {
    hostname: 'https://mpalmer79.github.io/agentforge/'
  }
})
