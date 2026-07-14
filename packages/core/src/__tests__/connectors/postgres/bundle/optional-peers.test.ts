import { describe, expect, test } from 'bun:test';
import { getError } from '@venizia/ignis-helpers';
import { join } from 'node:path';

// `__dirname`, not `import.meta`: this package emits CommonJS.
const CORE_ROOT = join(__dirname, '../../../../..');

/**
 * The runtime guard (`no-eager-driver-import.test.ts`) proves a driver package is never LOADED by an
 * entry that does not use it. It says nothing about what a BUNDLER packages, and that is the gap the
 * old `await import('./postgres-js.js')` fell through: a dynamic import defers execution, never
 * packaging, so every bundler resolved the literal specifier and pulled `postgres` into the output.
 * `bun build --compile` then failed for consumers who had never installed it.
 *
 * This is the gate that pins the fix. A driver reaches the bundle only when the application names
 * its class - which is also the only way it can reach one.
 */
const bundle = async (opts: { entry: string }): Promise<string> => {
  const { entry } = opts;

  // The CLI, not `Bun.build()`: the in-process bundler resolves this workspace's symlinked
  // dependencies to directories and dies on them.
  const proc = Bun.spawn(['bun', 'build', join(__dirname, entry), '--target=bun', '--format=esm'], {
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
    throw getError({ message: `[bundle] Failed to bundle ${entry} | ${stderr}` });
  }

  return stdout;
};

/** Unique to each driver module: present in the bundle if and only if that module is. */
const NODE_POSTGRES_MARKER = 'Got a client without pool accounting';
const POSTGRES_JS_MARKER = 'Got a client without reserve()/unsafe()';

/**
 * Unique to each drizzle adapter, which is what value-imports the peer package itself. Asserted
 * alongside the driver markers because the bug was never about our module - it was about `postgres`
 * being demanded from an app that had never installed it.
 */
const NODE_POSTGRES_ADAPTER = 'NodePgSession';
const POSTGRES_JS_ADAPTER = 'PostgresJsSession';

describe('optional driver peers reach the bundle only when named', () => {
  test('naming NodePostgresDriver bundles pg, and leaves postgres-js out entirely', async () => {
    const output = await bundle({ entry: 'node-postgres.entry.ts' });

    expect(output).toContain(NODE_POSTGRES_MARKER);
    expect(output).toContain(NODE_POSTGRES_ADAPTER);

    expect(output).not.toContain(POSTGRES_JS_MARKER);
    expect(output).not.toContain(POSTGRES_JS_ADAPTER);
  }, 60_000);

  test('naming PostgresJsDriver bundles postgres, and leaves node-postgres out entirely', async () => {
    const output = await bundle({ entry: 'postgres-js.entry.ts' });

    expect(output).toContain(POSTGRES_JS_MARKER);
    expect(output).toContain(POSTGRES_JS_ADAPTER);

    expect(output).not.toContain(NODE_POSTGRES_MARKER);
    expect(output).not.toContain(NODE_POSTGRES_ADAPTER);
  }, 60_000);

  test('the root barrel alone pulls in neither driver, and neither peer package', async () => {
    const output = await bundle({ entry: 'root-only.entry.ts' });

    expect(output).not.toContain(NODE_POSTGRES_MARKER);
    expect(output).not.toContain(NODE_POSTGRES_ADAPTER);

    expect(output).not.toContain(POSTGRES_JS_MARKER);
    expect(output).not.toContain(POSTGRES_JS_ADAPTER);
  }, 60_000);

  test('a literal await import() bundles the peer anyway - the premise the old resolver got wrong', async () => {
    // The shape `drivers/resolve.ts` used, and the reason it never isolated anything: a dynamic
    // import defers EXECUTION, not PACKAGING. Without this, the three assertions above could pass
    // for the wrong reason - a marker that never matches anything is not a guard.
    const output = await bundle({ entry: 'dynamic-import.entry.ts' });

    expect(output).toContain(POSTGRES_JS_MARKER);
    expect(output).toContain(POSTGRES_JS_ADAPTER);
  }, 60_000);
});
