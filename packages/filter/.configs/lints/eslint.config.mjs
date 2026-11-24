import { houseConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
// IGNIS writes its own imports through the `@/` path alias, not a `#src` import map.
export default [
  ...houseConfigs,
  { rules: { 'venizia/no-parent-import': 'off' } },
  // This package has no TNullable and does not depend on helpers: the rule reports and does not fix.
  { rules: { 'venizia/prefer-tnullable': ['error', { source: null }] } },
];
