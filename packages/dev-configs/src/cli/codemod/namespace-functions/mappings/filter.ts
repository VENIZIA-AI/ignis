import type { INamespaceMapping } from '../mapping';

/**
 * The functions of `@venizia/ignis-filter` that moved into a class. Both already took one options
 * object, so each entry only moves the callee (`keepsOptions`).
 */
export const FILTER_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  {
    // The kernel re-exports the whole of `@venizia/ignis-filter` (`export *` in
    // `base/repositories/common/index.ts`), and `@venizia/ignis` re-exports the kernel, so `Sorts`
    // is importable from each of the three where `parseOrderEntry` is.
    modules: ['@venizia/ignis-filter', '@venizia/ignis-kernel', '@venizia/ignis'],
    oldName: 'parseOrderEntry',
    className: 'Sorts',
    method: 'parseEntry',
    params: [],
    keepsOptions: true,
  },
  {
    // Only the `./schemas` entry: the kernel re-exports the built constants, not the factory.
    modules: ['@venizia/ignis-filter/schemas'],
    oldName: 'buildQuerySchemas',
    className: 'QuerySchemaFactory',
    method: 'build',
    params: [],
    keepsOptions: true,
  },
];
