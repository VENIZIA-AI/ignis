import { SharedBffTransport } from '@venizia/ignis-worker';

/**
 * One Worker for the whole origin, not one per tab.
 *
 * PGlite in `opfs-ahp://` mode holds an exclusive OPFS access handle, and those are exclusive per
 * ORIGIN - so a second tab starting its own Worker cannot open the database at all. `SharedBffTransport`
 * elects one tab to own it and forwards every other tab's request to that one.
 *
 * `new URL('./worker.ts', import.meta.url)` stays inside the factory and stays a LITERAL: that is
 * the form Vite statically analyses, and it is what makes the worker a separate bundle rather than a
 * missing file at runtime. A variable defeats the analysis silently.
 */
export const bff = new SharedBffTransport({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  channelName: 'browser-bff',
});

/**
 * The Worker application mounts its controllers under `/api` (see `worker.ts`). Everything below
 * this prefix is answered by the BFF; `installBffFetch` uses it to decide what to intercept, and the
 * data provider uses it as its base URL.
 */
export const BFF_BASE_PATH = '/api';
