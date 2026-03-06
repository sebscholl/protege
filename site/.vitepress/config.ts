import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubPagesBase = repositoryName ? `/${repositoryName}/` : '/';
const base = process.env.GITHUB_ACTIONS === 'true' ? githubPagesBase : '/';

export default withMermaid(defineConfig({
  title: 'Protege',
  description: 'Email-native AI agent framework',
  base,
  srcDir: '.',
  head: [
    ['meta', { property: 'og:image', content: '/og-image.png' }],
    ['meta', { name: 'twitter:image', content: '/og-image.png' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  ],
  mermaid: {},
  themeConfig: {
    logo: {
      light: '/logo-dark-128.png',
      dark: '/logo-light-128.png',
    },
    search: {
      provider: 'local',
    },
    nav: [
      { text: 'Introduction', link: '/' },
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'Developer Experience', link: '/developer-experience/' },
      { text: 'Internal Architecture', link: '/internal-architecture/' },
      { text: 'CLI Reference', link: '/reference/cli' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Protege Framework', link: '/' },
        ],
      },
      {
        text: 'Getting Started',
        items: [
          { text: 'Quick Start', link: '/getting-started/' },
          { text: 'Relay vs Transport', link: '/getting-started/relay-vs-transport' },
          { text: 'Relay Operations', link: '/getting-started/relay-operations' },
        ],
      },
      {
        text: 'Developer Experience',
        items: [
          { text: 'Overview', link: '/developer-experience/' },
          { text: 'Extensions Overview', link: '/developer-experience/extensions/' },
          { text: 'Tools', link: '/developer-experience/extensions/tools' },
          { text: 'Providers', link: '/developer-experience/extensions/providers' },
          { text: 'Hooks', link: '/developer-experience/extensions/hooks' },
          { text: 'Resolvers', link: '/developer-experience/extensions/resolvers' },
          { text: 'Personas and Memory', link: '/developer-experience/personas-memory' },
          { text: '.env and Secrets', link: '/developer-experience/environment' },
          { text: 'Config Files', link: '/developer-experience/configuration' },
          { text: 'Security and Risk Model', link: '/developer-experience/security' },
        ],
      },
      {
        text: 'Internal Architecture',
        items: [
          { text: 'Overview', link: '/internal-architecture/' },
          { text: 'LOGI Model', link: '/internal-architecture/logi' },
          { text: 'Gateway', link: '/internal-architecture/gateway' },
          { text: 'Inference Harness', link: '/internal-architecture/harness' },
          { text: 'Scheduler', link: '/internal-architecture/scheduler' },
          { text: 'Relay Service', link: '/internal-architecture/relay' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI Commands', link: '/reference/cli' },
          { text: 'Chat Guide', link: '/reference/chat' },
          { text: 'Release Runbook', link: '/reference/release' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com' },
    ],
  },
}));
