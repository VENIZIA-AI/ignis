import type { BunPlugin } from 'bun';
import { platformaticRequirePlugin } from './platformatic-require.plugin';
import { platformaticWasmPlugin } from './platformatic-wasm.plugin';

/** Every `@platformatic/kafka` fix needed by `bun build --compile`, as one list - a service compile script registers this instead of tracking the individual plugins. */
export const platformaticKafkaPlugins = (): BunPlugin[] => [
  platformaticWasmPlugin(),
  platformaticRequirePlugin(),
];
