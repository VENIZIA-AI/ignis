import type { INamespaceMapping } from '../mapping';

/**
 * The functions of `@venizia/ignis-worker` that moved into a class. `installBffFetch` already took one
 * options object, so the entry only moves the callee (`keepsOptions`).
 */
export const CORE_WORKER_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  {
    modules: ['@venizia/ignis-worker'],
    oldName: 'installBffFetch',
    className: 'BffFetchBridge',
    method: 'install',
    params: [],
    keepsOptions: true,
  },
];
