import { eslintConfigs } from '@venizia/dev-configs';

export default [
  ...eslintConfigs,
  {
    // client.ts is a manual-run simulation script (`bun client.ts`) outside the build tsconfig
    // (rootDir is src) - the type-aware linter has no project for it, so it is skipped.
    ignores: ['client.ts'],
  },
];
