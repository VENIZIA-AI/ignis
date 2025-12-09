import mtLinterConfs from '@minimaltech/eslint-node';

const configs = [
  ...mtLinterConfs,
  {
    ignores: ['site/.vitepress/cache/**', 'site/.vitepress/config.mts', 'site/.vitepress/theme/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default configs;
