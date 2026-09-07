import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { GLOBAL_PATTERNS, probeEntry, stripBundlerPathComments } from '../probe';

const PROCESS_PATTERN = GLOBAL_PATTERNS.find(g => g.name === 'process')!;

const FIXTURES = join(__dirname, 'fixtures');
const REPOSITORY_ROOT = join(__dirname, '../../..');

describe('probeEntry', () => {
  test('passes an entry with no node builtin and no node global', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'pure.entry.ts'),
      cwd: REPOSITORY_ROOT,
    });

    expect(result.ok).toBe(true);
    expect(result.builtins).toEqual([]);
    expect(result.globals).toEqual([]);
    expect(result.sizeBytes).toBeGreaterThan(0);
  }, 60_000);

  // Asserts `builtins`, never `buildError` alone: a `buildError` of
  // `unresolved external import(s): node:fs` also contains the substring `'fs'`, so a
  // `toContain('fs')` on the message stays green while `isBuiltinSpecifier` has stopped stripping
  // the `node:` prefix and `builtins` has silently become `[]` - measured, that exact break leaves
  // this file at 11 pass / 0 fail. The builtin LIST is the detector's output, so that is what a
  // regression test on the detector has to read.
  test('fails an entry importing a node builtin, and names the builtin', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'impure-builtin.entry.ts'),
      cwd: REPOSITORY_ROOT,
    });

    expect(result.ok).toBe(false);
    expect(result.builtins).toContain('node:fs');
    expect(result.buildError).toContain('node builtin import(s)');
  }, 60_000);

  test('fails an entry reading a node global, even though it bundles', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'impure-global.entry.ts'),
      cwd: REPOSITORY_ROOT,
    });

    expect(result.ok).toBe(false);
    expect(result.buildError).toBeUndefined();
    expect(result.globals).toContain('process');
  }, 60_000);

  // Review finding: a builtin imported without the `node:` prefix bundles exactly like the
  // prefixed case (Bun stubs it to an empty object, exit 0) but the metafile records the bare
  // specifier verbatim - a matcher keyed on the `node:` prefix alone never sees it.
  test('fails an entry importing a node builtin by its bare specifier', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'impure-bare-builtin.entry.ts'),
      cwd: REPOSITORY_ROOT,
    });

    expect(result.ok).toBe(false);
    expect(result.builtins).toContain('fs');
  }, 60_000);

  // Review finding: a package's own `browser` field can remap a dependency to `false` - the
  // standard convention for disabling a Node-only dependency in browser builds. Bun honours the
  // remap and leaves the import external with exit 0; the remapped name is not a Node builtin, so
  // only the unresolved-external check (not `findBuiltinSpecifiers`) can see this one.
  test('fails an entry whose dependency is externalised by a browser-field remap', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'unresolved-external', 'entry.ts'),
      cwd: REPOSITORY_ROOT,
    });

    expect(result.ok).toBe(false);
    expect(result.builtins).toEqual([]);
    expect(result.buildError).toContain('native-only-dependency');
    expect(result.external).toEqual([]);
  }, 60_000);

  // Companion to the case above: a manifest entry that KNOWS a dependency only ships a working
  // browser build via its own `browser`-field remap (PGlite is the real-world example) can name it
  // in `external` to stop this probe from measuring that dependency's packaging instead of ours.
  test('passes the same externalised dependency once the manifest entry requests it', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'unresolved-external', 'entry.ts'),
      cwd: REPOSITORY_ROOT,
      external: ['native-only-dependency'],
    });

    expect(result.ok).toBe(true);
    expect(result.builtins).toEqual([]);
    expect(result.external).toEqual(['native-only-dependency']);
  }, 60_000);

  // `external` must narrow, never blanket-exempt: a genuinely unrelated unresolved import next to
  // a requested one must still fail, or `external` becomes a way to wave through an unrelated leak.
  test('still fails on an unresolved external NOT in the requested list', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'unresolved-external', 'entry.ts'),
      cwd: REPOSITORY_ROOT,
      external: ['some-other-package'],
    });

    expect(result.ok).toBe(false);
    expect(result.buildError).toContain('native-only-dependency');
  }, 60_000);

  // Review finding: the `process` pattern's lookbehind rejects a preceding dot, so it cannot see
  // the `globalThis`-qualified spelling at all - which throws in a browser just like the bare one.
  test('fails an entry reading process through globalThis', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'impure-globalthis-env.entry.ts'),
      cwd: REPOSITORY_ROOT,
    });

    expect(result.ok).toBe(false);
    expect(result.globals).toContain('globalThis.process');
  }, 60_000);

  // The counterpart: `globalThis.process?.env` short-circuits to `undefined` in a browser rather
  // than throwing, so it is reported and not fatal. Collapsing the two into one pattern would
  // either fail the safe form or wave the throwing one through.
  test('reports but does not fail the guarded globalThis.process form', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'guarded-globalthis-env.entry.ts'),
      cwd: REPOSITORY_ROOT,
    });

    expect(result.ok).toBe(true);
    expect(result.globals).toEqual([]);
    expect(result.guardedGlobals).toContain('globalThis.process?.');
  }, 60_000);

  // Review finding (core-worker, Wave 4 Task 2): Bun prefixes every bundled module with a full-line
  // `// <path>.js` header comment, and `packages/core-worker/dist/transport/in-process.js` produced
  // `// packages/core-worker/dist/transport/in-process.js` - `process.` there is a filename
  // fragment, not a global read. A fixture named to reproduce this by its OWN path is not reliable
  // (an entry-path comment ends in `.entry.ts`, not `.js`, and a `-comment` suffix lands on a hyphen,
  // not a dot - neither matches `BUNDLER_PATH_COMMENT`), so this asserts the strip against the exact
  // real string instead of hoping a filename reproduces the collision.
  describe('stripBundlerPathComments', () => {
    test('removes the real collision - a bundler path comment containing "-process."', () => {
      const bundled =
        '// packages/core-worker/dist/transport/in-process.js\nvar x = 1;\n// packages/core-server/dist/index.js\n';

      const stripped = stripBundlerPathComments(bundled);

      expect(PROCESS_PATTERN.pattern.test(stripped)).toBe(false);
    });

    // Negative case: the strip must not blind the gate to a real leak sitting right next to a path
    // comment - only the comment LINE is removed, never a line of actual code.
    test('leaves a real unguarded process read alone, and the pattern still catches it', () => {
      const bundled =
        '// packages/core-worker/dist/transport/in-process.js\nvar x = process.env.A;\n';

      const stripped = stripBundlerPathComments(bundled);

      expect(stripped).toContain('process.env.A');
      expect(PROCESS_PATTERN.pattern.test(stripped)).toBe(true);
    });
  });
});
