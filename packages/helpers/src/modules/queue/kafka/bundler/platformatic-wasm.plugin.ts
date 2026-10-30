import type { BunPlugin } from 'bun';
import { PlatformaticKafkaPlugins } from './plugins';

/** @deprecated Use PlatformaticKafkaPlugins.buildWasmPlugin(). Removed in 0.5. */
export const platformaticWasmPlugin = (): BunPlugin => PlatformaticKafkaPlugins.buildWasmPlugin();
