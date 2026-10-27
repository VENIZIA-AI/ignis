import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CheckCommand } from '../../../cli/check';
import {
  assertBrowserEsmEntry,
  assertNoWorkspaceExternal,
  buildManifest,
  checkPurity,
  deriveEntries,
  probeEntry,
  PurityVerdicts,
} from '../../../checks';
import type { IPurityClaim, IPurityEntry } from '../../../checks';

const REPOSITORY_ROOT = join(__dirname, '../../../../../..');
const SCRATCH = join(REPOSITORY_ROOT, '.agents/local/tmp');

/** A throwaway repository: packages/<name>/package.json with the given `exports`, and built files. */
const makeRepository = (opts: {
  packages: Record<string, { exports?: Record<string, unknown>; files?: Record<string, string> }>;
}): string => {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, 'purity-engine-'));

  for (const [name, definition] of Object.entries(opts.packages)) {
    const directory = join(root, 'packages', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ name: `@scope/${name}`, exports: definition.exports }),
    );

    for (const [file, content] of Object.entries(definition.files ?? {})) {
      mkdirSync(join(directory, file, '..'), { recursive: true });
      writeFileSync(join(directory, file), content);
    }
  }

  return root;
};

const roots: string[] = [];
const repository = (packages: Parameters<typeof makeRepository>[0]['packages']): string => {
  const root = makeRepository({ packages });
  roots.push(root);
  return root;
};

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const run = async (opts: {
  root: string;
  claims: IPurityClaim[];
  filter?: string;
}): Promise<{ report: Awaited<ReturnType<typeof checkPurity>>; out: string[]; err: string[] }> => {
  const out: string[] = [];
  const err: string[] = [];
  const report = await checkPurity({
    root: opts.root,
    claims: opts.claims,
    filter: opts.filter,
    claimsFile: 'claims.ts',
    print: (line) => out.push(line),
    printError: (line) => err.push(line),
  });

  return { report, out, err };
};

describe('assertNoWorkspaceExternal', () => {
  test('rejects an entry that externalises a workspace package, naming the entry and the package', () => {
    const poisoned: IPurityEntry[] = [
      {
        label: 'poisoned',
        package: 'connectors',
        entry: 'x.js',
        external: ['@venizia/ignis-helpers'],
      },
    ];

    expect(() => assertNoWorkspaceExternal(poisoned)).toThrow(/workspace package/);
    expect(() => assertNoWorkspaceExternal(poisoned)).toThrow(/poisoned/);
    expect(() => assertNoWorkspaceExternal(poisoned)).toThrow(/@venizia\/ignis-helpers/);
  });

  test('does not reject a third-party external', () => {
    const clean: IPurityEntry[] = [
      { label: 'clean', package: 'connectors', entry: 'x.js', external: ['@electric-sql/pglite'] },
    ];

    expect(() => assertNoWorkspaceExternal(clean)).not.toThrow();
  });

  test('rejects a workspace package buried behind an earlier third-party entry', () => {
    const mixed: IPurityEntry[] = [
      {
        label: 'mixed',
        package: 'connectors',
        entry: 'x.js',
        external: ['@electric-sql/pglite', '@venizia/ignis-kernel'],
      },
    ];

    expect(() => assertNoWorkspaceExternal(mixed)).toThrow(/@venizia\/ignis-kernel/);
  });

  test('the scope is a parameter: another repository names its own', () => {
    const entries: IPurityEntry[] = [
      { label: 'e', package: 'p', entry: 'x.js', external: ['@acme/core'] },
    ];

    expect(() => assertNoWorkspaceExternal(entries)).not.toThrow();
    expect(() => assertNoWorkspaceExternal(entries, '@acme/')).toThrow(/@acme\/core/);
  });
});

describe('deriveEntries', () => {
  const root = repository({
    lib: {
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/esm/index.js',
          require: './dist/cjs/index.js',
        },
        './sub': { types: './dist/sub.d.ts', default: './dist/esm/sub.js' },
        './package.json': './package.json',
      },
    },
    bare: {},
  });

  test('one row per runtime condition, labelled by condition only when there are several', () => {
    const labels = deriveEntries({ claim: { package: 'lib' }, root }).map((row) => row.label);

    expect(labels).toEqual(['lib [import]', 'lib [require]', 'lib/sub']);
  });

  test('a claimed sub-path that the exports map no longer publishes fails the derivation', () => {
    expect(() =>
      deriveEntries({ claim: { package: 'lib', subpaths: ['.', './renamed-away'] }, root }),
    ).toThrow(/no longer\s+publishes/);
  });

  test('an external declared for a sub-path that is gone fails the derivation', () => {
    expect(() =>
      deriveEntries({ claim: { package: 'lib', external: { './renamed-away': ['pg'] } }, root }),
    ).toThrow(/no longer\s+publishes/);
  });

  test('a waiver against a sub-path that is not claimed fails the derivation', () => {
    expect(() =>
      deriveEntries({
        claim: { package: 'lib', subpaths: ['.'], impure: { './sub': ['default'] } },
        root,
      }),
    ).toThrow(/waives '\.\/sub' as impure/);
  });

  test('a waiver under a condition the map does not publish fails the derivation', () => {
    expect(() =>
      deriveEntries({ claim: { package: 'lib', impure: { '.': ['browser'] } }, root }),
    ).toThrow(/under condition 'browser'/);
  });

  test('a waived condition marks its row, the others stay claimed', () => {
    const rows = deriveEntries({ claim: { package: 'lib', impure: { '.': ['require'] } }, root });

    expect(rows.find((row) => row.label === 'lib [require]')?.expectImpure).toBe(true);
    expect(rows.find((row) => row.label === 'lib [import]')?.expectImpure).toBeUndefined();
  });

  test('a package without an exports map is a broken claim', () => {
    expect(() => deriveEntries({ claim: { package: 'bare' }, root })).toThrow(
      /publishes no `exports` map/,
    );
  });
});

describe('assertBrowserEsmEntry', () => {
  const root = repository({
    esm: { exports: { '.': { types: './dist/esm/index.d.ts', default: './dist/esm/index.js' } } },
    dual: {
      exports: {
        '.': { types: './dist/esm/i.d.ts', import: './dist/esm/i.js', require: './dist/cjs/i.js' },
      },
    },
  });

  test('passes when every runtime entry is below the prefix', () => {
    expect(() =>
      assertBrowserEsmEntry({ claims: [{ package: 'esm' }], root, esmEntryPrefix: './dist/esm/' }),
    ).not.toThrow();
  });

  test('fails when one runtime condition points outside it', () => {
    expect(() =>
      assertBrowserEsmEntry({ claims: [{ package: 'dual' }], root, esmEntryPrefix: './dist/esm/' }),
    ).toThrow(/runtime entry is not in dist\/esm/);
  });

  test('buildManifest checks it only when the repository asks for it', () => {
    expect(buildManifest({ claims: [{ package: 'dual' }], root }).length).toBe(2);
    expect(() =>
      buildManifest({
        claims: [{ package: 'dual' }],
        root,
        options: { esmEntryPrefix: './dist/esm/' },
      }),
    ).toThrow(/dist\/esm/);
  });
});

describe('checkPurity', () => {
  const root = repository({
    pure: {
      exports: { '.': { types: './index.d.ts', default: './index.js' } },
      files: { 'index.js': 'export const answer = 42;\n' },
    },
    leaky: {
      exports: { '.': { types: './index.d.ts', default: './index.js' } },
      files: { 'index.js': "import fs from 'node:fs';\nexport const x = fs.readFileSync;\n" },
    },
    unbuilt: { exports: { '.': { types: './index.d.ts', default: './index.js' } } },
  });

  test('a pure entry passes and the report line carries its size', async () => {
    const { report, out } = await run({ root, claims: [{ package: 'pure' }] });

    expect(report?.failed).toBe(0);
    expect(out[0]).toMatch(/^ {2}✓ pure +\d+\.\d KB$/);
    expect(out.at(-1)).toBe('\n[purity] 1/1 entries are browser-pure.');
  });

  test('positive control: an entry importing a node builtin fails and names it', async () => {
    const { report, out } = await run({ root, claims: [{ package: 'leaky' }] });

    expect(report?.failed).toBe(1);
    expect(report?.rows[0].verdict).toBe(PurityVerdicts.FAIL);
    expect(report?.rows[0].builtins).toContain('node:fs');
    expect(out[0]).toContain('✗ leaky');
  });

  test('positive control: an entry the build never emitted is MISSING, not a bundler error', async () => {
    const { report, out } = await run({ root, claims: [{ package: 'unbuilt' }] });

    expect(report?.rows[0].verdict).toBe(PurityVerdicts.MISSING);
    expect(out[0]).toContain('MISSING packages/unbuilt/index.js');
    expect(out[1]).toContain('run `make unbuilt`');
  });

  test('a waiver on an impure entry is reported as waived and does not fail', async () => {
    const { report, out } = await run({
      root,
      claims: [{ package: 'leaky', impure: { '.': ['default'] } }],
    });

    expect(report?.failed).toBe(0);
    expect(report?.waived).toBe(1);
    expect(out[0]).toContain('~ leaky');
    expect(out.at(-1)).toBe('\n[purity] 0/0 entries are browser-pure (1 waived as known-impure).');
  });

  test('positive control: a waiver on a pure entry is a STALE WAIVER and names the claims file', async () => {
    const { report, out } = await run({
      root,
      claims: [{ package: 'pure', impure: { '.': ['default'] } }],
    });

    expect(report?.failed).toBe(1);
    expect(report?.rows[0].verdict).toBe(PurityVerdicts.STALE_WAIVER);
    expect(out[0]).toContain('STALE WAIVER');
    expect(out[1]).toContain('claims.ts');
  });

  test('positive control: a filter that matches nothing is a broken gate, not an empty one', async () => {
    const { report, err } = await run({ root, claims: [{ package: 'pure' }], filter: 'nope' });

    expect(report).toBeUndefined();
    expect(err[0]).toContain('No manifest entry matches "nope"');
    expect(err[0]).toContain('Known packages: pure');
  });

  test('the JSON verdict carries nothing of this machine: two runs on one tree are equal', async () => {
    const first = await run({ root, claims: [{ package: 'pure' }, { package: 'leaky' }] });
    const second = await run({ root, claims: [{ package: 'pure' }, { package: 'leaky' }] });

    expect(JSON.stringify(first.report)).toBe(JSON.stringify(second.report));
    expect(JSON.stringify(first.report)).not.toContain(root);
    expect(JSON.stringify(first.report)).not.toContain('purity-engine-');
    expect(first.report?.rows[1].buildError ?? '').not.toContain(root);
  });
});

describe('a browser entry never reaches dev-configs (C10)', () => {
  let fixtureRoot = '';

  beforeAll(() => {
    fixtureRoot = repository({
      app: {
        exports: { '.': { types: './index.d.ts', default: './index.js' } },
        files: {
          'index.js':
            "import { tooling } from '@venizia/dev-configs';\nexport const x = tooling;\n",
        },
      },
    });
    const installed = join(fixtureRoot, 'packages/app/node_modules/@venizia/dev-configs');
    mkdirSync(installed, { recursive: true });
    writeFileSync(
      join(installed, 'package.json'),
      JSON.stringify({
        name: '@venizia/dev-configs',
        main: 'index.js',
        exports: { '.': './index.js' },
      }),
    );
    writeFileSync(join(installed, 'index.js'), 'export const tooling = 1;\n');
  });

  test('positive control: an entry that bundles an installed @venizia/dev-configs fails and says so', async () => {
    const result = await probeEntry({
      entry: join(fixtureRoot, 'packages/app/index.js'),
      cwd: fixtureRoot,
    });

    expect(result.ok).toBe(false);
    expect(result.buildError).toContain('reaches @venizia/dev-configs');
  }, 60_000);
});

describe('devz check purity', () => {
  const claimsRoot = repository({
    pure: {
      exports: { '.': { types: './index.d.ts', default: './index.js' } },
      files: { 'index.js': 'export const answer = 42;\n' },
    },
  });

  beforeAll(() => {
    writeFileSync(
      join(claimsRoot, 'claims.ts'),
      "export const PURITY_CLAIMS = [{ package: 'pure' }];\n",
    );
  });

  test('exits 0 for a clean tree, 1 for a filter that matches nothing, 2 without --claims', async () => {
    expect(
      await CheckCommand.run({ root: claimsRoot, args: ['purity', '--claims', 'claims.ts'] }),
    ).toBe(0);
    expect(
      await CheckCommand.run({
        root: claimsRoot,
        args: ['purity', 'nope', '--claims', 'claims.ts'],
      }),
    ).toBe(1);
    expect(await CheckCommand.run({ root: claimsRoot, args: ['purity'] })).toBe(2);
    expect(await CheckCommand.run({ root: claimsRoot, args: ['nothing'] })).toBe(2);
  }, 60_000);

  test('a claims file without PURITY_CLAIMS is refused', async () => {
    writeFileSync(join(claimsRoot, 'empty.ts'), 'export const OTHER = 1;\n');

    expect(
      await CheckCommand.run({ root: claimsRoot, args: ['purity', '--claims', 'empty.ts'] }),
    ).toBe(2);
  });
});
