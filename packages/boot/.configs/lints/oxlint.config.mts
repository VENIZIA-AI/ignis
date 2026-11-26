import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig({
  ...oxlintConfigs,
  overrides: [
    ...(oxlintConfigs.overrides ?? []),
    {
      // The files whose job is writing to the console: the logger itself.
      files: ['**/src/common/quiet-logger.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
});
