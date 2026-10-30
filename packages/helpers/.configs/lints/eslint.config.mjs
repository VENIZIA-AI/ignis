import { asyncStyleConfigs, houseConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
// The two promise-chain rules are off in this repository until it is swept (the sweep PR removes this line).
export default [
  ...houseConfigs,
  ...asyncStyleConfigs,
  { rules: { 'venizia/no-await-promise-chain': 'off', 'venizia/no-silent-catch': 'off' } },
];
