import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type DefaultTheme } from 'vitepress';

interface ApiNavNode {
  title: string;
  path?: string;
  children?: ApiNavNode[];
}

function toSidebarItem(node: ApiNavNode): DefaultTheme.SidebarItem {
  const item: DefaultTheme.SidebarItem = {
    text: node.title,
    collapsed: false,
    items: node.children?.map(toSidebarItem) ?? [],
  };
  if (node.path) item.link = `/api/${node.path.replace(/\.md$/, '')}`;
  return item;
}

function apiSidebar(): DefaultTheme.SidebarItem[] {
  const jsonPath = join(dirname(fileURLToPath(import.meta.url)), '../../sidebar.json');
  if (!existsSync(jsonPath)) return [];
  const nodes = JSON.parse(readFileSync(jsonPath, 'utf8')) as ApiNavNode[];
  return nodes.map(toSidebarItem);
}

export default defineConfig({
  title: 'TasuketeJS',
  description: 'Intent-driven, 100% client-side voice accessibility SDK for PWAs and mobile apps.',
  appearance: 'dark',
  lastUpdated: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'API', link: '/api/', activeMatch: '/api/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Actions', link: '/guide/actions' },
            { text: 'Context Snapshots', link: '/guide/context' },
            { text: 'Transcript Sources', link: '/guide/transcript-sources' },
            { text: 'Intent Engines & Confidence', link: '/guide/intent-engines' },
            { text: 'Events', link: '/guide/events' },
            { text: 'Privacy', link: '/guide/privacy' },
          ],
        },
      ],
      '/api/': [{ text: 'API Reference', items: apiSidebar() }],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/mr-rehab/tasuketejs' }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 TasuketeJS contributors',
    },
  },
});
