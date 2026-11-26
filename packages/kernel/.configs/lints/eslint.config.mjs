import { houseConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
export default [
  ...houseConfigs,
  // `TInjectOptions` here is inversion's options without `registry` (the kernel supplies it): a wrapper, not a copy.
  {
    ignores: ['**/__tests__/**'],
    rules: { 'venizia/no-shadow-framework-type': ['error', { allow: ['TInjectOptions'] }] },
  },
];
