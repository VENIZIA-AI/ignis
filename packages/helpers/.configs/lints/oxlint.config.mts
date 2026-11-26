import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters/oxlint';

export default defineConfig({
  ...oxlintConfigs,
  overrides: [
    ...(oxlintConfigs.overrides ?? []),
    {
      // The files whose job is writing to the console: the logger itself.
      files: [
        '**/src/modules/logger/base/console.ts',
        '**/src/modules/logger/common/constants.ts',
        '**/src/modules/logger/pino/backing.ts',
        '**/src/modules/logger/pino/destination.ts',
        '**/src/modules/logger/winston/transports/dgram.transport.ts',
        '**/src/modules/logger/hf/flusher.ts',
      ],
      rules: { 'no-console': 'off' },
    },
  ],
});
