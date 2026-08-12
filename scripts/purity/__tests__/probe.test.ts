import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { probeEntry } from '../probe';

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

  test('fails an entry importing a node builtin, and names the builtin', async () => {
    const result = await probeEntry({
      entry: join(FIXTURES, 'impure-builtin.entry.ts'),
      cwd: REPOSITORY_ROOT,
    });

    expect(result.ok).toBe(false);
    expect(result.buildError).toContain('fs');
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
  }, 60_000);
});
