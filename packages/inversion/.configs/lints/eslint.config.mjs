import { houseConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
export default [
  ...houseConfigs,
  // TNullable is declared in this package: it is imported from its own source, so the autofix never writes an import into helpers.
  { rules: { '@venizia/prefer-tnullable': ['error', { source: '@/common/types' }] } },
];
