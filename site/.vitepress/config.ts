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
      { text: 'Home', link: '/' },
      { text: 'Quick Start', link: '/getting-started/' },
      { text: 'Guide', link: '/developer-experience/' },
      { text: 'Architecture', link: '/internal-architecture/' },
      { text: 'Reference', link: '/reference/cli' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Quick Start', link: '/getting-started/' },
          { text: 'Relay vs Local SMTP', link: '/getting-started/relay-vs-transport' },
          { text: 'Relay Operations', link: '/getting-started/relay-operations' },
        ],
      },
      {
        text: 'Building Your Agent',
        items: [
          { text: 'Overview', link: '/developer-experience/' },
          {
            text: 'Extensions',
            link: '/developer-experience/extensions/',
            collapsed: false,
            items: [
              {
                text: 'Tools',
                link: '/developer-experience/extensions/tools',
                collapsed: true,
                items: [
                  { text: 'Custom Tools', link: '/developer-experience/extensions/tools-custom' },
                ],
              },
              {
                text: 'Providers',
                link: '/developer-experience/extensions/providers',
                collapsed: true,
                items: [
                  { text: 'Custom Providers', link: '/developer-experience/extensions/providers-custom' },
                ],
              },
              {
                text: 'Hooks',
                link: '/developer-experience/extensions/hooks',
                collapsed: true,
                items: [
                  { text: 'Custom Hooks', link: '/developer-experience/extensions/hooks-custom' },
                ],
              },
              {
                text: 'Resolvers',
                link: '/developer-experience/extensions/resolvers',
                collapsed: true,
                items: [
                  { text: 'Custom Resolvers', link: '/developer-experience/extensions/resolvers-custom' },
                ],
              },
            ],
          },
          { text: 'Personas and Memory', link: '/developer-experience/personas-memory' },
        ],
      },
      {
        text: 'Configuration',
        items: [
          { text: 'Config Files', link: '/developer-experience/configuration' },
          { text: 'Environment and Secrets', link: '/developer-experience/environment' },
          { text: 'Security', link: '/developer-experience/security' },
        ],
      },
      {
        text: 'Architecture',
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
          { text: 'Daemon (systemd)', link: '/reference/daemon' },
          { text: 'Chat TUI', link: '/reference/chat' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' },
          { text: 'Release Runbook', link: '/reference/release' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com' },
    ],
  },
}));
