import { defineConfig } from 'oxlint';
import { ReactOxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

const preset = ReactOxlintConfigs.create();

export default defineConfig({
  ...preset,
  // openapi-typescript writes this file.
  ignorePatterns: [...(preset.ignorePatterns ?? []), 'src/api/schema.d.ts'],
});
