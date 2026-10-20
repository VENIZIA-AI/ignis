import { defineConfig } from 'oxfmt';
import { oxfmtConfigs } from '@venizia/dev-configs/formatters';

// `scripts/` is not a workspace member: `@venizia/dev-configs` and `oxfmt` resolve from the root
// package.json, which declares them for this folder alone.
export default defineConfig(oxfmtConfigs);
