import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AgentForge',
  description:
    'Production-ready TypeScript framework for building AI agents with tools, streaming, and multi-provider support',

  base: '/agentforge/',

  head: [
    // Favicons / icons (use base-relative paths: VitePress will prefix with base automatically)
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icon-32.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],

    // Optional PWA-style icon (you already generated it)
    ['link', { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon-192.png' }],

    // Theme + social
    ['meta', { name: 'theme-color', content: '#6366f1' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'AgentForge - TypeScript AI Agent Framework' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Build production-ready AI agents with type-safe tools, streaming responses, and multi-provider support'
      }
    ],

    // Optional but recommended: add these once you create docs/public/og.png (1200x630)
    // ['meta', { property: 'og:image', content: '/og.png' }],
    // ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    // ['meta', { name: 'twitter:image', content: '/og.png' }],
  ],

  themeConfig: {
    // IMPORTANT: base-relative so it works in GitHub Pages subpath deploys
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
            { text: 'Core Concepts', link: '/guide/core-concepts' }
          ]
        },
        {
          text: 'Essentials',
          items: [
            { text: 'Tools', link: '/guide/tools' },
            { text: 'Providers', link: '/guide/providers' },
            { text: 'Middleware', link: '/guide/middleware' },
            { text: 'Memory Management', link: '/guide/memory' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Streaming', link: '/guide/streaming' },
            { text: 'Error Handling', link: '/guide/error-handling' },
            { text: 'React Integration', link: '/guide/react-integration' },
            { text: 'Plugins & Events', link: '/guide/plugins-events' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'Core',
          items: [
            { text: 'Agent', link: '/api/agent' },
            { text: 'Tools', link: '/api/tools' },
            { text: 'Providers', link: '/api/providers' }
          ]
        },
        {
          text: 'Extensions',
          items: [
            { text: 'Middleware', link: '/api/middleware' },
            { text: 'Events & Plugins', link: '/api/events-plugins' },
            { text: 'React Hooks', link: '/api/react-hooks' }
          ]
        },
        {
          text: 'Utilities',
          items: [
            { text: 'Types', link: '/api/types' },
            { text: 'Errors', link: '/api/errors' },
            { text: 'Helpers', link: '/api/helpers' }
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
            { text: 'Multi-Agent System', link: '/examples/multi-agent' }
          ]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/mpalmer79/agentforge' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Michael Palmer'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/mpalmer79/agentforge/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    }
  },

  markdown: {
    lineNumbers: true
  }
})
