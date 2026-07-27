import { describe, expect, test } from 'bun:test';
import { getError } from '@venizia/ignis-helpers';
import { join } from 'node:path';

// `__dirname`, not `import.meta`: this package emits CommonJS.
const CORE_ROOT = join(__dirname, '../../../..');

/** Counts driver packages loaded into a FRESH process after importing `entry`. A subprocess is mandatory: `bun test` shares one module registry, so a sibling test importing a driver would make this pass for the wrong reason. */
const countDriverModules = async (opts: {
  entry: string;
  /** Substring matched against every loaded module path, e.g. `/node_modules/pg/`. */
  pattern: string;
}): Promise<number> => {
  const { entry, pattern } = opts;
  const absolute = join(CORE_ROOT, entry);

  const script = [
    `await import(${JSON.stringify(absolute)});`,
    `const loaded = Object.keys(require.cache ?? {})`,
    `  .filter(key => key.includes(${JSON.stringify(pattern)}));`,
    `console.log(loaded.length);`,
  ].join('\n');

  const proc = Bun.spawn(['bun', '-e', script], {
    cwd: CORE_ROOT,
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

  return Number.parseInt(stdout.trim(), 10);
};

describe('optional and sub-path-only modules are never eagerly loaded', () => {
  const ENTRIES = [
    { name: 'root barrel', entry: 'src/index.ts' },
    { name: '@venizia/ignis/postgres', entry: 'src/connectors/postgres/index.ts' },
    { name: 'drivers barrel', entry: 'src/connectors/postgres/drivers/index.ts' },
  ];

  const FORBIDDEN = [
    { label: '`pg`', pattern: '/node_modules/pg/' },
    { label: '`postgres`', pattern: '/node_modules/postgres/' },
    // Not an optional package but sub-path-only: `drizzle-orm/supabase` must stay behind `@venizia/ignis/postgres/supabase` rather than riding along on every entry point.
    { label: '`drizzle-orm/supabase`', pattern: 'drizzle-orm/supabase' },
    // Optional peer of the grpc component (`@venizia/ignis/grpc`), same doctrine as the drivers.
    { label: '`@connectrpc/connect`', pattern: '@connectrpc' },
  ];

  for (const { name, entry } of ENTRIES) {
    for (const { label, pattern } of FORBIDDEN) {
      test(`${name} loads zero ${label} modules`, async () => {
        expect(await countDriverModules({ entry, pattern })).toBe(0);
      }, 30_000);
    }
  }

  test('the guard can actually detect an eager load', async () => {
    // Mutation insurance: if this ever reports 0, `countDriverModules` is broken and every assertion above is vacuous.
    const loaded = await countDriverModules({
      entry: 'src/connectors/postgres/drivers/node-postgres.ts',
      pattern: '/node_modules/pg/',
    });

    expect(loaded).toBeGreaterThan(0);
  }, 30_000);

  test('the supabase sub-path really does load drizzle-orm/supabase', async () => {
    // Same insurance for the supabase pattern: the assertions above must not pass merely because the pattern never matches anything.
    const loaded = await countDriverModules({
      entry: 'src/connectors/postgres/supabase/index.ts',
      pattern: 'drizzle-orm/supabase',
    });

    expect(loaded).toBeGreaterThan(0);
  }, 30_000);
});
