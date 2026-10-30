import type { BunPlugin } from 'bun';
import { PlatformaticKafkaPlugins } from './plugins';

/** @deprecated Use PlatformaticKafkaPlugins.buildRequirePlugin(). Removed in 0.5. */
export const platformaticRequirePlugin = (): BunPlugin =>
  PlatformaticKafkaPlugins.buildRequirePlugin();
