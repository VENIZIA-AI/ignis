import { houseConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
export default [
  ...houseConfigs,
  // The search datasource reads one flag through `globalThis.process?.`: it also loads in a browser, and the name keeps
  // the `APP_ENV_` spelling whatever prefix an app configures.
  {
    files: ['src/search/core/datasources/base.ts'],
    rules: {
      '@venizia/prefer-framework-api': ['error', { hooks: false, ignore: ['process-env'] }],
    },
  },
];
