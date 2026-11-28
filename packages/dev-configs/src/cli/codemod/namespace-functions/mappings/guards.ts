import type { INamespaceMapping } from '../mapping';
import { CONNECTORS_GUARD_MAPPINGS } from './connectors';
import { HELPERS_GUARD_MAPPINGS } from './helpers';
import { INVERSION_GUARD_MAPPINGS } from './inversion';
import { KERNEL_GUARD_MAPPINGS } from './kernel';

/** The type guards that became static methods: the rows `devz codemod public-names` applies on its own. */
export const GUARD_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  ...INVERSION_GUARD_MAPPINGS,
  ...HELPERS_GUARD_MAPPINGS,
  ...KERNEL_GUARD_MAPPINGS,
  ...CONNECTORS_GUARD_MAPPINGS,
];
