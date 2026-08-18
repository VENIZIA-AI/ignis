import { WorkerBffTransport } from '@venizia/ignis-worker';

/**
 * `new URL('./worker.ts', import.meta.url)` is the form Vite statically analyses - it is what makes
 * the worker a separate bundle rather than a missing file at runtime. The specifier must be a
 * literal; a variable defeats the analysis silently.
 */
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

export const bff = new WorkerBffTransport({ worker });

/**
 * The Worker application mounts its controllers under `/api` (see `worker.ts`). Everything below
 * this prefix is answered by the Worker; `installBffFetch` uses it to decide what to intercept, and
 * the data provider uses it as its base URL.
 *
 * Path only, no origin - `WorkerBffTransport` rewrites the origin to the synthetic one the Worker
 * routes against.
 */
export const BFF_BASE_PATH = '/api';
