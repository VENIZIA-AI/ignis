import { houseConfigs, PublishedPackageConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
// IGNIS writes its own imports through the `@/` path alias, not a `#src` import map.
export default [
  ...houseConfigs,
  // Every public export says when to use it (`@useWhen`); the baseline lists the ones not yet swept, and may only shrink.
  ...PublishedPackageConfigs.build({ baseline: '.configs/use-when-baseline.json' }),
  { rules: { 'venizia/no-parent-import': 'off' } },
  // TNullable is declared in this package: it is imported from its own source, so the autofix never writes an import into helpers.
  { rules: { 'venizia/prefer-tnullable': ['error', { source: '@/common/types' }] } },
];
