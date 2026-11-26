import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { oxlintConfigs } from '../linters/oxlint';

const OXLINT = join(__dirname, '../../node_modules/.bin/oxlint');
const RULES = ['func-style', 'no-console', 'default-case'];
const CODE = `export function pick(value: string) {\n  switch (value) {\n    case 'a': {\n      console.log(value);\n      break;\n    }\n  }\n}\n`;
const roots: Array<string> = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** The base rules oxlint reports for `CODE` written at `file`, under the preset's own entries for them. */
const reported = (opts: { file: string }) => {
  const root = mkdtempSync(join(tmpdir(), 'oxlint-base-'));
  roots.push(root);
  const pick = (rules: Record<string, unknown> = {}) =>
    Object.fromEntries(Object.entries(rules).filter(([name]) => RULES.includes(name)));
  const overrides = (oxlintConfigs.overrides ?? [])
    .map((override) => ({ files: override.files, rules: pick(override.rules) }))
    .filter((override) => Object.keys(override.rules).length > 0);

  mkdirSync(dirname(join(root, opts.file)), { recursive: true });
  writeFileSync(join(root, opts.file), CODE);
  writeFileSync(
    join(root, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      rules: pick(oxlintConfigs.rules),
      overrides,
    }),
  );
  const run = Bun.spawnSync([OXLINT, '-c', '.oxlintrc.json', '--no-ignore', opts.file], {
    cwd: root,
  });
  const out = run.stdout.toString();

  return RULES.filter((rule) => out.includes(`(${rule})`));
};

describe('the base code rules of the oxlint preset', () => {
  test('func-style, no-console and default-case report in source', () => {
    expect(reported({ file: 'src/subject.ts' })).toEqual(RULES);
  });

  test.each(['src/__tests__/subject.ts', 'src/subject.test.ts', 'src/subject.spec.ts'])(
    'a test file is exempt: %s',
    (file) => {
      expect(reported({ file })).toEqual([]);
    },
  );
});
