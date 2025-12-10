import mtLinterConfs from '@minimaltech/eslint-node';
import type { Linter } from 'eslint';

const configs: Linter.Config[] = [
  ...mtLinterConfs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default configs;
