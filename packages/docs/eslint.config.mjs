import { eslintConfigs } from '@venizia/dev-configs';

const configs = [
  ...eslintConfigs,
  {
    ignores: ['site/.vitepress/cache/**', 'site/.vitepress/dist/**'],
  },
];

export default configs;

