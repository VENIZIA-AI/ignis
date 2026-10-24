import type { VulcanConfig } from '@venizia/vulcan';

export default {
  agents: ['claude'],
  rules: { 'V-W-01': 'on-user-word' },
  // The session digest names the rules sessions drop most, then prints the minimap shape from .agents/rules.md.
  digest: { oftenDropped: ['P-09', 'P-10', 'B-03', 'B-05', 'P-05', 'P-15', 'W-02'] },
  // Release order. A rename keeps its old tag prefix and npm name as aliases.
  packages: [
    { dir: 'dev-configs', name: '@venizia/dev-configs' },
    { dir: 'inversion', name: '@venizia/ignis-inversion' },
    { dir: 'filter', name: '@venizia/ignis-filter' },
    { dir: 'helpers', name: '@venizia/ignis-helpers' },
    { dir: 'boot', name: '@venizia/ignis-boot' },
    { dir: 'kernel', name: '@venizia/ignis-kernel' },
    { dir: 'connectors', name: '@venizia/ignis-connectors' },
    {
      dir: 'core-worker',
      name: '@venizia/ignis-worker',
      aliases: ['worker', '@venizia/ignis-core-worker'],
    },
    { dir: 'core-server', name: '@venizia/ignis', aliases: ['core'] },
    { dir: 'docs-mcp', name: '@venizia/ignis-docs', aliases: ['docs'], retired: true },
    { dir: 'atlas', name: '@venizia/ignis-atlas', retired: true },
  ],
  knowledge: {
    bundle: '.agents/knowledge',
    wiki: 'docs/wiki/content',
    changelogs: 'docs/wiki/content/changelogs',
    syncAreas: '.agents/knowledge/process/knowledge-sync-areas.md',
  },
  okf: {
    renderers: [
      'source-map',
      { id: 'components', module: '.agents/okf/components.ts' },
      { id: 'helpers', module: '.agents/okf/helpers.ts' },
      {
        id: 'binding-keys',
        options: {
          source: 'packages/kernel/src/common/bindings.ts',
          description: 'Every dependency-injection binding key declared in the kernel (generated).',
          seeAlso: 'Namespaces: [binding key namespaces](/conventions/binding-key-namespaces.md).',
        },
      },
      'makefile-targets',
    ],
    regions: [
      { id: 'packages-table', file: 'overview/monorepo-layout.md', renderer: 'packages-table' },
    ],
    sections: {
      order: [
        'overview',
        'architecture',
        'packages',
        'conventions',
        'process',
        'examples',
        'reference',
      ],
      labels: {
        overview: 'Overview',
        architecture: 'Architecture',
        packages: 'Packages',
        conventions: 'Conventions',
        process: 'Process',
        examples: 'Examples',
        reference: 'Reference',
      },
    },
    coverage: [
      { name: 'packages', path: 'packages/*' },
      { name: 'examples', path: 'examples/*' },
    ],
    viz: {
      brand: 'IGNIS',
      copy: {
        en: {
          heading: 'Understand IGNIS, one concept at a time.',
          tagline:
            'The IGNIS framework, end to end - packages, architecture, conventions, process and examples.',
          sectionDescriptions: {
            overview: 'Start here - what IGNIS is and how to work in it.',
            architecture:
              'How the pieces fit: DI, lifecycle, repositories, and cross-cutting design.',
            packages: 'The published framework packages.',
            conventions: 'How the code is written - patterns, style, and gotchas.',
            process: 'How the team works - build, test, release, git.',
            examples: 'Runnable apps that exercise the framework.',
            reference: 'Look-ups - generated catalogs, glossary, key files.',
          },
        },
        vi: {
          heading: 'Hiểu IGNIS, từng khái niệm một.',
          tagline: 'Toàn bộ framework IGNIS - package, kiến trúc, quy ước, quy trình và ví dụ.',
          sectionDescriptions: {
            overview: 'Bắt đầu ở đây - IGNIS là gì và cách làm việc.',
            architecture: 'Cách các phần ghép lại: DI, vòng đời, repository, thiết kế xuyên suốt.',
            packages: 'Các package của framework.',
            conventions: 'Cách viết code - pattern, style, và các bẫy.',
            process: 'Cách team làm việc - build, test, release, git.',
            examples: 'Các app chạy được minh hoạ framework.',
            reference: 'Tra cứu - catalog sinh tự động, glossary, file quan trọng.',
          },
        },
      },
    },
  },
  atlas: {
    tagPattern: '<dir>-v<version>',
  },
} satisfies VulcanConfig;
