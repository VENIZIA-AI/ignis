import { defineConfig } from 'oxlint';
import { oxlintConfigs } from '@venizia/dev-configs/linters';

// `scripts/` is skipped by the `lint` script (`--ignore-pattern`): an `ignorePatterns` entry here
// resolves against .configs/, not against this project.
export default defineConfig(oxlintConfigs);
