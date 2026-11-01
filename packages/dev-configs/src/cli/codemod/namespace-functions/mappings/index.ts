import type { INamespaceMapping } from '../mapping';
import { BOOT_MAPPINGS } from './boot';
import { CONNECTORS_MAPPINGS } from './connectors';
import { CORE_SERVER_MAPPINGS } from './core-server';
import { CORE_WORKER_MAPPINGS } from './core-worker';
import { DEV_CONFIGS_MAPPINGS } from './dev-configs';
import { FILTER_MAPPINGS } from './filter';
import { HELPERS_MAPPINGS } from './helpers';
import { INVERSION_MAPPINGS } from './inversion';
import { KERNEL_MAPPINGS } from './kernel';

/** The table `devz codemod namespace-functions` reads: one file per package, filled by the pull request that moves its functions. */
export const ALL_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  ...DEV_CONFIGS_MAPPINGS,
  ...INVERSION_MAPPINGS,
  ...FILTER_MAPPINGS,
  ...HELPERS_MAPPINGS,
  ...BOOT_MAPPINGS,
  ...KERNEL_MAPPINGS,
  ...CONNECTORS_MAPPINGS,
  ...CORE_WORKER_MAPPINGS,
  ...CORE_SERVER_MAPPINGS,
];
