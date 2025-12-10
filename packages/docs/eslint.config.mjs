import baseConfigs from '@vez/dev-configs/eslint';

const configs = [
  ...baseConfigs,
  {
    ignores: ['site/.vitepress/cache/**', 'site/.vitepress/config.mts', 'site/.vitepress/theme/**'],
  },
];

export default configs;
