import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * What `TEntityObject` promises is that a WRONG shape stops compiling, which a runtime test cannot
 * see. Every case below is type-checked by a real `tsc` run over this package's sources, and the
 * assertion reads the compiler's verdict.
 *
 * The refusal cases are the load-bearing half: if inference ever collapses to `any` - what a
 * relation pointing at another ENTITY does across a circular import, TS7022 - they stop erroring
 * and this file catches the silent failure.
 *
 * One `tsc` for every case: each probe is its own file, and the errors are bucketed by file name.
 */
const PACKAGE_ROOT = process.cwd();

const PRELUDE = `
import { integer, text } from 'drizzle-orm/pg-core';
import { many, ModelFactory, one } from '${PACKAGE_ROOT}/src/relational/postgres';
import type { TEntityObject } from '${PACKAGE_ROOT}/src/relational/postgres';

const Feature = ModelFactory.defineEntity({
  name: 'Feature',
  columns: { code: text('code').notNull() },
});

const Policy = ModelFactory.defineEntity({
  name: 'Policy',
  columns: { title: text('title').notNull(), sequence: integer('sequence').notNull() },
  relations: () => ({ features: many(Feature.schema), owner: one(Feature.schema) }),
});

type TPolicy = TEntityObject<typeof Policy>;
`;

const CASES: Record<string, string> = {
  valid: `
const row: TPolicy = {
  id: 'p', title: 't', sequence: 1,
  features: [{ id: 'f', code: 'c' }],
  owner: { id: 'f', code: 'c' },
};
export const read: string = row.title;
export const code: string | undefined = row.features?.[0].code;
`,
  'undeclared-relation': `export const row: TPolicy = { id: 'p', title: 't', sequence: 1, prices: [] };`,
  'wrong-column-in-relation': `export const row: TPolicy = { id: 'p', title: 't', sequence: 1, features: [{ id: 'f', nope: 1 }] };`,
  'to-many-given-one': `export const row: TPolicy = { id: 'p', title: 't', sequence: 1, features: { id: 'f', code: 'c' } };`,
  'to-one-given-many': `export const row: TPolicy = { id: 'p', title: 't', sequence: 1, owner: [{ id: 'f', code: 'c' }] };`,
  'wrong-column-type': `export const row: TPolicy = { id: 'p', title: 123, sequence: 1 };`,
  'missing-column': `export const row: TPolicy = { id: 'p', sequence: 1 };`,
  'relation-pointing-at-an-entity': `
export const Bad = ModelFactory.defineEntity({
  name: 'Bad',
  columns: { t: text('t').notNull() },
  relations: () => ({ fs: many(Feature) }),
});
`,
};

let probeDirectory: string;
/** Case name -> the compiler's complaints about that case's file. */
let errorsByCase: Record<string, Array<string>>;

describe('TEntityObject keeps the compiler strict', () => {
  beforeAll(async () => {
    // Under the package root, and inside `__tests__` so the production build - which excludes
    // `**/__tests__` - never sees a probe left behind by a crash.
    probeDirectory = await mkdtemp(path.join(PACKAGE_ROOT, 'src/__tests__/.type-probe-'));

    await Promise.all(
      Object.entries(CASES).map(([name, body]) =>
        writeFile(path.join(probeDirectory, `${name}.probe.ts`), PRELUDE + body),
      ),
    );

    // Its own config extending the package's: `tsc` with files on the command line drops the
    // project config, and the `@/` path aliases go with it.
    const configPath = path.join(probeDirectory, 'tsconfig.json');
    await writeFile(
      configPath,
      JSON.stringify({
        extends: path.join(PACKAGE_ROOT, 'tsconfig.json'),
        compilerOptions: { noEmit: true, strict: true, skipLibCheck: true, incremental: false },
        include: [],
        files: Object.keys(CASES).map(name => path.join(probeDirectory, `${name}.probe.ts`)),
      }),
    );

    const result = Bun.spawnSync({
      cmd: ['bunx', 'tsc', '-p', configPath],
      cwd: PACKAGE_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = `${result.stdout.toString()}${result.stderr.toString()}`;
    errorsByCase = Object.fromEntries(Object.keys(CASES).map(name => [name, []]));

    for (const line of output.split('\n')) {
      const owner = Object.keys(CASES).find(name => line.includes(`${name}.probe.ts`));
      if (owner && line.includes('error TS')) {
        errorsByCase[owner].push(line);
      }
    }
  }, 120_000);

  afterAll(async () => {
    await rm(probeDirectory, { recursive: true, force: true });
  });

  test('a correct row, with both relation arities, compiles clean', () => {
    expect(errorsByCase.valid).toEqual([]);
  });

  test.each([
    'undeclared-relation',
    'wrong-column-in-relation',
    'to-many-given-one',
    'to-one-given-many',
    'wrong-column-type',
    'missing-column',
    'relation-pointing-at-an-entity',
  ])('%s is refused', name => {
    expect(errorsByCase[name].length).toBeGreaterThan(0);
  });
});
