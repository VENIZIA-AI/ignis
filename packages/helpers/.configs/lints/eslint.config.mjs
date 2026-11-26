import { houseConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
export default [
  ...houseConfigs,
  // TNullable lives in this package, so it is imported from its own source.
  { rules: { 'venizia/prefer-tnullable': ['error', { source: '@/common/types' }] } },
];
