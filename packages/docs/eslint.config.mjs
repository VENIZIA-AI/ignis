import { eslintConfigs } from "@vez/dev-configs";

const configs = [
  ...eslintConfigs,
  {
    ignores: ["site/.vitepress/cache/**", "site/.vitepress/config.mts", "site/.vitepress/theme/**"],
  },
];

export default configs;
