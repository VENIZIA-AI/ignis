import { houseConfigs } from '@venizia/dev-configs/linters';

// oxlint (oxlint.config.mts) runs every other rule; ESLint runs the naming convention and the house rules.
export default [
  ...houseConfigs,
  // The default issuer is the local Supabase stack this example runs against.
  {
    files: ['src/common/jwt-claims.ts'],
    rules: {
      '@venizia/prefer-framework-api': ['error', { hooks: false, ignore: ['localhost-url'] }],
    },
  },
];
