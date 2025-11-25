import mtLinterConfs from '@minimaltech/eslint-node';

const configs = [
  ...mtLinterConfs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default configs;
