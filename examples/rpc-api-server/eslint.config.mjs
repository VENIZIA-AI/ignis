import minimaltechLinter from '@minimaltech/eslint-node';

const configs = [
  ...minimaltechLinter,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default configs;
