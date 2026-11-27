import { houseConfigs } from '@venizia/dev-configs/linters';

// oxlint runs every other rule; ESLint runs what oxlint cannot: the naming convention and the house rules.
export default [
  ...houseConfigs,
  // The server reads its host, port and log folder from the process itself: `applicationEnvironment` keeps only the
  // names under the configured prefix.
  {
    files: ['src/base/applications/server.ts'],
    rules: {
      '@venizia/prefer-framework-api': ['error', { hooks: false, ignore: ['process-env'] }],
    },
  },
];
