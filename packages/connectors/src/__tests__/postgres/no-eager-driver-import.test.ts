import { describe, expect, test } from 'bun:test';
import { getError } from '@venizia/ignis-helpers/core';
import { join } from 'node:path';

// `__dirname`, not `import.meta`: this package emits CommonJS.
const CONNECTORS_ROOT = join(__dirname, '../../..');

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const stripAnsi = (value: string): string => {
  return value.replace(ANSI_PATTERN, '');
};

/**
 * Counts driver packages loaded into a FRESH process after importing `entry`. The subprocess is
 * mandatory: `bun test` shares one module registry, so a sibling test importing a driver would
 * make this pass for the wrong reason.
 */
const countDriverModules = async (opts: {
  entry: string;
  /** Substring matched against every loaded module path, e.g. `/node_modules/pg/`. */
  pattern: string;
}): Promise<number> => {
  const { entry, pattern } = opts;
  const absolute = join(CONNECTORS_ROOT, entry);

  // `String(...)`, not the bare number: Bun inspects a numeric argument and wraps it in ANSI colour
  // whenever `FORCE_COLOR` is set, which makes the parse below `NaN` on a developer terminal while
  // passing in CI.
  const script = [
    `await import(${JSON.stringify(absolute)});`,
    `const loaded = Object.keys(require.cache ?? {})`,
    `  .filter(key => key.includes(${JSON.stringify(pattern)}));`,
    `console.log(String(loaded.length));`,
  ].join('\n');

  const proc = Bun.spawn(['bun', '-e', script], {
    cwd: CONNECTORS_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw getError({ message: `[countDriverModules] Importing ${entry} failed | ${stderr}` });
  }

  // Stripped defensively as well: anything the imported graph prints on its own is outside this
  // script's control, and a silent `NaN` would read as a passing count of zero.
  const count = Number.parseInt(stripAnsi(stdout).trim(), 10);

  if (Number.isNaN(count)) {
    throw getError({
      message: `[countDriverModules] ${entry} produced no module count | stdout: ${JSON.stringify(stdout)}`,
    });
  }

  return count;
};

describe('optional and sub-path-only modules are never eagerly loaded', () => {
  const ENTRIES = [
    { name: 'root barrel', entry: 'src/index.ts' },
    { name: '@venizia/ignis-connectors/postgres', entry: 'src/relational/postgres/index.ts' },
    { name: 'drivers barrel', entry: 'src/relational/postgres/drivers/index.ts' },
    { name: '@venizia/ignis-connectors/sqlite', entry: 'src/relational/sqlite/index.ts' },
  ];

  const FORBIDDEN = [
    { label: '`pg`', pattern: '/node_modules/pg/' },
    { label: '`postgres`', pattern: '/node_modules/postgres/' },
    // PGlite ships a multi-megabyte WASM Postgres; riding along
    // on the root barrel would be felt by every consumer.
    { label: '`@electric-sql/pglite`', pattern: '@electric-sql/pglite' },
    // Not an optional package but sub-path-only: `drizzle-orm/supabase` must stay behind
    // `@venizia/ignis-connectors/postgres/supabase` rather than riding along on every entry point.
    { label: '`drizzle-orm/supabase`', pattern: 'drizzle-orm/supabase' },
    // Optional peer of the grpc component (`@venizia/ignis/grpc`), same doctrine as the drivers.
    { label: '`@connectrpc/connect`', pattern: '@connectrpc' },
    // The SQLite driver peer: `@venizia/ignis-connectors/sqlite` must stay
    // type-only about it, the way `./postgres` is about `pg`.
    { label: '`@libsql/client`', pattern: '@libsql/client' },
  ];

  for (const { name, entry } of ENTRIES) {
    for (const { label, pattern } of FORBIDDEN) {
      test(`${name} loads zero ${label} modules`, async () => {
        expect(await countDriverModules({ entry, pattern })).toBe(0);
      }, 30_000);
    }
  }

  test('the guard can actually detect an eager load', async () => {
    // Mutation insurance: if this ever reports 0, `countDriverModules`
    // is broken and every assertion above is vacuous.
    const loaded = await countDriverModules({
      entry: 'src/relational/postgres/drivers/node-postgres.ts',
      pattern: '/node_modules/pg/',
    });

    expect(loaded).toBeGreaterThan(0);
  }, 30_000);

  test('the pglite sub-path really does load @electric-sql/pglite', async () => {
    // Same insurance for the pglite pattern.
    const loaded = await countDriverModules({
      entry: 'src/relational/postgres/drivers/pglite.ts',
      pattern: '@electric-sql/pglite',
    });

    expect(loaded).toBeGreaterThan(0);
  }, 30_000);

  test('the libsql sub-path really does load @libsql/client', async () => {
    // Same insurance for the libsql pattern.
    const loaded = await countDriverModules({
      entry: 'src/relational/sqlite/drivers/libsql.ts',
      pattern: '@libsql/client',
    });

    expect(loaded).toBeGreaterThan(0);
  }, 30_000);

  test('the supabase sub-path really does load drizzle-orm/supabase', async () => {
    // Same insurance for the supabase pattern: the assertions above
    // must not pass merely because the pattern never matches anything.
    const loaded = await countDriverModules({
      entry: 'src/relational/postgres/supabase/index.ts',
      pattern: 'drizzle-orm/supabase',
    });

    expect(loaded).toBeGreaterThan(0);
  }, 30_000);
});
