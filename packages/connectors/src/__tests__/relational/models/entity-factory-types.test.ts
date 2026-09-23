import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * What `defineEntity` promises is that a WRONG shape stops compiling, which a runtime test cannot
 * see. Each probe below is a file a real `tsc` compiles - with declarations emitted, as a consumer's
 * build does - and every probe must come out clean.
 *
 * Each refusal is written as `@ts-expect-error` inside a probe that must stay clean: if inference
 * ever collapses to `any`, the directive goes unused, TypeScript reports TS2578, and the probe
 * fails. A refusal cannot pass for an unrelated reason, because nothing else in a probe errors.
 */
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TSC = path.resolve(PACKAGE_ROOT, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc');
const POSTGRES = `${PACKAGE_ROOT}/src/relational/postgres`;

const PRELUDE = `
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { generateIdColumnDefs, many, ModelFactory, one } from '${POSTGRES}';
import type { TEntityObject } from '${POSTGRES}';

export const PolicyTable = pgTable('Policy', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: text('title').notNull(),
  sequence: integer('sequence').notNull(),
});

export const FeatureTable = pgTable('Feature', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  policyId: text('policy_id').notNull().references((): AnyPgColumn => PolicyTable.id),
  code: text('code').notNull(),
});

export class EntityFeature extends ModelFactory.defineEntity({
  table: FeatureTable,
  relations: () => ({ policy: one(PolicyTable) }),
}) {}

export class EntityPolicy extends ModelFactory.defineEntity({
  table: PolicyTable,
  relations: () => ({ features: many(FeatureTable, { relationName: 'policy' }), owner: one(FeatureTable) }),
}) {}

export type TPolicy = TEntityObject<typeof EntityPolicy>;
`;

const PROBES: Record<string, string> = {
  rows: `${PRELUDE}
export const row: TPolicy = {
  id: 'p', title: 't', sequence: 1,
  features: [{ id: 'f', policyId: 'p', code: 'c' }],
  owner: { id: 'f', policyId: 'p', code: 'c' },
};
export const title: string = row.title;

// @ts-expect-error a column keeps its type
export const wrongType: TPolicy = { id: 'p', title: 123, sequence: 1 };
// @ts-expect-error the id is the table's text id, not any id
export const wrongId: TPolicy = { id: 123, title: 't', sequence: 1 };
// @ts-expect-error a required column cannot be left out
export const missing: TPolicy = { id: 'p', sequence: 1 };
// @ts-expect-error a key that is neither a column nor a relation
export const unknown: TPolicy = { id: 'p', title: 't', sequence: 1, prices: [] };
// @ts-expect-error a many is an array
export const manyAsOne: TPolicy = { id: 'p', title: 't', sequence: 1, features: { id: 'f', policyId: 'p', code: 'c' } };
// @ts-expect-error a one is not an array
export const oneAsMany: TPolicy = { id: 'p', title: 't', sequence: 1, owner: [{ id: 'f', policyId: 'p', code: 'c' }] };
// @ts-expect-error a related row has the related table's columns
export const wrongRelated: TPolicy = { id: 'p', title: 't', sequence: 1, features: [{ id: 'f', nope: 1 }] };
`,

  'no-relations': `${PRELUDE}
export class EntityPlain extends ModelFactory.defineEntity({ table: PolicyTable }) {}
type TPlain = TEntityObject<typeof EntityPlain>;

export const plain: TPlain = { id: 'p', title: 't', sequence: 1 };
// @ts-expect-error a row without relations still refuses an unknown key
export const plainUnknown: TPlain = { id: 'p', title: 't', sequence: 1, bogus: 1 };
`,

  instance: `${PRELUDE}
type TData = NonNullable<EntityPolicy['$inferData']>;
export const data: TData = { id: 'p', title: 't', sequence: 1 };
// @ts-expect-error the instance side carries the table's row type, not an index signature
export const wrongData: TData = { id: 'p', title: 1, sequence: 1 };
`,

  statics: `${PRELUDE}
import { BaseRelationalEntity } from '${POSTGRES}';
export const subject: string | undefined = EntityPolicy.AUTHORIZATION_SUBJECT;
export const table: typeof PolicyTable = EntityPolicy.schema;
export const asBase: typeof BaseRelationalEntity<typeof PolicyTable> = EntityPolicy;
`,

  // The array form, typed from the public postgres entry: a one() may leave its columns out.
  'postgres-relation-config': `${PRELUDE}
import { RelationTypes } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '${POSTGRES}';

export const policy: TRelationConfig = { name: 'policy', type: RelationTypes.ONE, schema: PolicyTable };
export const written: TRelationConfig = {
  name: 'policy',
  type: RelationTypes.ONE,
  schema: PolicyTable,
  metadata: { fields: [FeatureTable.policyId], references: [PolicyTable.id] },
};
// @ts-expect-error fields are columns, not column names
export const byName: TRelationConfig = { name: 'policy', type: RelationTypes.ONE, schema: PolicyTable, metadata: { fields: ['policy_id'] } };
`,

  'relation-to-an-entity': `${PRELUDE}
export const Bad = ModelFactory.defineEntity({
  table: PolicyTable,
  // @ts-expect-error a relation points at a table, never at an entity class
  relations: () => ({ features: many(EntityFeature) }),
});
`,

  'pg-schema': `
import { pgSchema, text } from 'drizzle-orm/pg-core';
import { generateIdColumnDefs, ModelFactory } from '${POSTGRES}';
import type { TEntityObject } from '${POSTGRES}';

const commerce = pgSchema('commerce');
export const ItemTable = commerce.table('Item', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
});
export class EntityItem extends ModelFactory.defineEntity({ table: ItemTable }) {}

export const item: TEntityObject<typeof EntityItem> = { id: 'i', name: 'n' };
// @ts-expect-error a schema-qualified table keeps its row type
export const wrongItem: TEntityObject<typeof EntityItem> = { id: 'i', name: 1 };
`,

  sqlite: `
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { generateIdColumnDefs, ModelFactory } from '${PACKAGE_ROOT}/src/relational/sqlite';
import type { TEntityObject } from '${PACKAGE_ROOT}/src/relational/sqlite';

export const NoteTable = sqliteTable('Note', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  body: text('body').notNull(),
});
export class EntityNote extends ModelFactory.defineEntity({ table: NoteTable }) {}

export const note: TEntityObject<typeof EntityNote> = { id: 'n', body: 'b' };
// @ts-expect-error a SQLite table keeps its row type too
export const wrongNote: TEntityObject<typeof EntityNote> = { id: 'n', body: 1 };
`,

  // Two files that import each other - the shape that broke with the table inside the class.
  'cycle-policy': `
import { pgTable, text } from 'drizzle-orm/pg-core';
import { generateIdColumnDefs, many, ModelFactory } from '${POSTGRES}';
import type { TEntityObject } from '${POSTGRES}';
import { CycleFeatureTable } from './cycle-feature.probe';

export const CyclePolicyTable = pgTable('CyclePolicy', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: text('title').notNull(),
});
export class CyclePolicy extends ModelFactory.defineEntity({
  table: CyclePolicyTable,
  relations: () => ({ features: many(CycleFeatureTable, { relationName: 'policy' }) }),
}) {}
export type TCyclePolicy = TEntityObject<typeof CyclePolicy>;
`,

  'cycle-feature': `
import { pgTable, text } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { generateIdColumnDefs, many, ModelFactory, one } from '${POSTGRES}';
import type { TEntityObject } from '${POSTGRES}';
import { CyclePolicyTable } from './cycle-policy.probe';

export const CycleFeatureTable = pgTable('CycleFeature', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  policyId: text('policy_id').notNull().references((): AnyPgColumn => CyclePolicyTable.id),
  parentId: text('parent_id').references((): AnyPgColumn => CycleFeatureTable.id),
});
export class CycleFeature extends ModelFactory.defineEntity({
  table: CycleFeatureTable,
  relations: () => ({
    policy: one(CyclePolicyTable),
    parent: one(CycleFeatureTable),
    children: many(CycleFeatureTable, { relationName: 'parent' }),
  }),
}) {}
export type TCycleFeature = TEntityObject<typeof CycleFeature>;
`,

  'cycle-check': `
import type { TCyclePolicy } from './cycle-policy.probe';
import type { TCycleFeature } from './cycle-feature.probe';

export const policy: TCyclePolicy = { id: 'p', title: 't', features: [{ id: 'f', policyId: 'p', parentId: null }] };
export const feature: TCycleFeature = { id: 'f', policyId: 'p', parentId: null, policy: { id: 'p', title: 't' }, children: [] };
// @ts-expect-error neither side of the cycle collapses to any
export const wrongPolicy: TCyclePolicy = { id: 'p', title: 1 };
// @ts-expect-error a self relation keeps the table's row type
export const wrongChild: TCycleFeature = { id: 'f', policyId: 'p', parentId: null, children: [{ nope: true }] };
`,
};

/** Must fail: if it compiles clean, the compiler never looked, and every clean probe proves nothing. */
const CANARY = 'canary';
const CANARY_BODY = "export const canary: number = 'not a number';\n";

let probeDirectory: string;
/** Probe name -> the compiler's complaints about that probe's file. */
let errorsByProbe: Record<string, Array<string>>;
let compilerOutput = '';

describe('defineEntity keeps the compiler strict', () => {
  beforeAll(async () => {
    // Inside `__tests__`, so the production build - which excludes `**/__tests__` - never sees a
    // probe a crash left behind.
    probeDirectory = await mkdtemp(path.join(PACKAGE_ROOT, 'src/__tests__/.type-probe-'));

    const probeEntries = [...Object.entries(PROBES), [CANARY, CANARY_BODY]];
    await Promise.all(
      probeEntries.map(([name, body]) =>
        writeFile(path.join(probeDirectory, `${name}.probe.ts`), body),
      ),
    );

    // Declarations are emitted, as a consumer's build does: a factory-built class that cannot be
    // named in a .d.ts fails here (TS4094 / TS2883), not in the consumer's CI.
    const configPath = path.join(probeDirectory, 'tsconfig.json');
    await writeFile(
      configPath,
      JSON.stringify({
        extends: path.join(PACKAGE_ROOT, 'tsconfig.json'),
        compilerOptions: {
          noEmit: false,
          declaration: true,
          emitDeclarationOnly: true,
          outDir: path.join(probeDirectory, 'out'),
          strict: true,
          skipLibCheck: true,
          incremental: false,
        },
        include: [],
        files: probeEntries.map(([name]) => path.join(probeDirectory, `${name}.probe.ts`)),
      }),
    );

    const result = Bun.spawnSync({
      cmd: [process.execPath, TSC, '-p', configPath],
      cwd: PACKAGE_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    compilerOutput = `${result.stdout.toString()}${result.stderr.toString()}`;
    errorsByProbe = Object.fromEntries(probeEntries.map(([name]) => [name, []]));

    const lines = compilerOutput.split('\n');
    for (const line of lines) {
      const owner = probeEntries
        .map(([name]) => name)
        .find(name => line.includes(`/${name}.probe.ts`));
      if (owner && line.includes('error TS')) {
        errorsByProbe[owner].push(line);
      }
    }
  }, 120_000);

  afterAll(async () => {
    await rm(probeDirectory, { recursive: true, force: true });
  });

  test('the compiler looked: the canary probe fails exactly as written', () => {
    expect(errorsByProbe[CANARY]).toHaveLength(1);
    expect(errorsByProbe[CANARY][0]).toContain('TS2322');
    expect(compilerOutput).not.toContain('error TS5');
  });

  test.each(Object.keys(PROBES))('%s compiles clean, every refusal refused', name => {
    expect(errorsByProbe[name]).toEqual([]);
  });
});
