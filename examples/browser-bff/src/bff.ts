import { WorkerBffTransport } from '@venizia/ignis-core-worker';

/**
 * `new URL('./worker.ts', import.meta.url)` is the form Vite statically analyses - it is what makes
 * the worker a separate bundle rather than a missing file at runtime. The specifier must be a
 * literal; a variable defeats the analysis silently.
 */
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

export const bff = new WorkerBffTransport({ worker });

/** The BFF is addressed by path only - `WorkerBffTransport` rewrites the origin to the synthetic one the Worker routes against. */
export const BFF_BASE_PATH = '/api/notes';
