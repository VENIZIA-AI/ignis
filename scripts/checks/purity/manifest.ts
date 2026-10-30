import { PurityManifest } from '@venizia/dev-configs/checks';
import type { IPurityClaim, IPurityOptions } from '@venizia/dev-configs/checks';
import { join } from 'node:path';

export type { IPurityEntry } from '@venizia/dev-configs/checks';

/**
 * The browser-purity claims of this repository: the only thing here that is IGNIS's. The engine
 * (probe, derivation, guards, report) lives in `@venizia/dev-configs/checks` and runs as
 * `devz check purity --claims scripts/checks/purity/manifest.ts` (`make purity`).
 *
 * The ROW SET IS NEVER AUTHORED. It is read from each package's own `exports` map.
 */

/** Every claimed sub-path must publish its runtime entries in `dist/esm`: a browser bundler needs an ES module. */
export const PURITY_OPTIONS: IPurityOptions = { esmEntryPrefix: './dist/esm/' };

export const PURITY_CLAIMS: IPurityClaim[] = [
  { package: 'inversion' },
  { package: 'filter' },
  {
    package: 'helpers',
    subpaths: ['./core', './common', './uuid', './temporal', './socket-io/client'],
  },
  { package: 'kernel' },
  { package: 'core-worker' },
  {
    package: 'connectors',
    // One reason, pinned exactly so a NEW impure entry still fails: the engine clients -
    // node-postgres, postgres-js, libsql, typesense - each speak a wire protocol to a server
    // process, so they reach for sockets, TLS or child processes and can never run in a browser
    // tab. They stay published because a Node consumer needs them.
    //
    // `./postgres/supabase` is measured, and needs Bun >= 1.4.1: under 1.4.0 the
    // `--target=browser` bundle listed the `drizzle-orm/supabase` re-exports (`anonRole`, ...) in
    // its export block without binding them, and this row fails with `drizzle-orm/supabase` as an
    // unresolved external import.
    impure: {
      './postgres/node-postgres': ['default'],
      './postgres/postgres-js': ['default'],
      './typesense': ['default'],
    },
    external: {
      // PGlite ships ONE universal Emscripten build and relies on its package.json `browser` field
      // remapping fs/path/util/... to false. Vite honours that; `bun build` does not, so bundling it
      // here measures PGlite's packaging, not ours. Externalising it makes the gate answer the
      // question it exists to answer: is IGNIS's own driver code browser-pure?
      './postgres/pglite': ['@electric-sql/pglite'],
    },
  },
];

/** The derived rows, for the gates that read them (the clean-install gate). */
export const PURITY_MANIFEST = PurityManifest.build({
  claims: PURITY_CLAIMS,
  root: join(__dirname, '../../..'),
  options: PURITY_OPTIONS,
});
