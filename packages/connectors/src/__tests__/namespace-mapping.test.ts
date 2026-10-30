import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from '@hono/zod-openapi';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { many } from '@/relational/core/models';
import { field } from '@/search/core/models';

/**
 * The public functions of this package that moved into a class (`devz codemod namespace-functions`).
 * Each mapping entry is loaded from the dev-configs table; for every module it lists, the old name
 * must still be exported as a function next to the class, and a sample call of the old form must
 * equal the new form built from the entry's `params`.
 */

interface IMapping {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  newModules?: string[];
  params: Array<{ key: string; optional?: boolean }>;
  restKey?: string;
  keepsOptions?: boolean;
}

const REPOSITORY_ROOT = join(import.meta.dir, '../../../..');

const mappingModule: { CONNECTORS_MAPPINGS: ReadonlyArray<IMapping> } = await import(
  join(
    REPOSITORY_ROOT,
    'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/connectors.ts',
  )
);
const { CONNECTORS_MAPPINGS } = mappingModule;

const PACKAGE_SPECIFIER = '@venizia/ignis-connectors';
const CORE_SERVER_SPECIFIER = '@venizia/ignis';

/** Each package entry of the exports map, as the source module the entry is built from. */
const SOURCE_ENTRIES: Record<string, () => Promise<Record<string, unknown>>> = {
  [PACKAGE_SPECIFIER]: () => import('@/index'),
  [`${PACKAGE_SPECIFIER}/relational`]: () => import('@/relational/core'),
  [`${PACKAGE_SPECIFIER}/postgres`]: () => import('@/relational/postgres'),
  [`${PACKAGE_SPECIFIER}/postgres/supabase`]: () => import('@/relational/postgres/supabase'),
  [`${PACKAGE_SPECIFIER}/sqlite`]: () => import('@/relational/sqlite'),
  [`${PACKAGE_SPECIFIER}/search`]: () => import('@/search/core'),
  [`${PACKAGE_SPECIFIER}/search/controllers`]: () => import('@/search/core/controllers'),
  [`${PACKAGE_SPECIFIER}/typesense`]: () => import('@/search/typesense'),
  [`${PACKAGE_SPECIFIER}/typesense/controllers`]: () => import('@/search/typesense/controllers'),
  [`${PACKAGE_SPECIFIER}/meilisearch`]: () => import('@/search/meilisearch'),
};

const readExportsMap = (packageFolder: string): string[] => {
  const parsed: { exports: Record<string, unknown> } = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, 'packages', packageFolder, 'package.json'), 'utf8'),
  );
  return Object.keys(parsed.exports);
};

const toSubpath = (opts: { specifier: string; base: string }) => {
  const { specifier, base } = opts;
  return specifier === base ? '.' : `.${specifier.slice(base.length)}`;
};

const callable = (opts: { value: unknown; label: string }) => {
  if (typeof opts.value !== 'function') {
    throw new Error(`${opts.label} is not a function`);
  }
  return opts.value;
};

/** Plain data for comparison: functions by name, cycles cut, so two equal builders compare equal. */
const normalize = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === 'function') {
    return '[function]';
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'table')
      .map(([key, item]) => [key, normalize(item, seen)]),
  );
};

const USERS = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });

const TYPESENSE_DEFINITION = {
  name: 'books',
  fields: [field.string('title', { searchable: true }), field.number('year', { sortable: true })],
  defaultSort: 'year',
};

const MEILISEARCH_DEFINITION = {
  name: 'books',
  fields: [field.string('title', { searchable: true }), field.number('year', { sortable: true })],
  defaultSort: 'year',
};

const COLUMN_BASE = { name: text('name') };

interface ISample {
  args: unknown[];
  /** What the call leaves behind besides its return value. */
  observe?: () => unknown;
}

const buildTransaction = () => {
  const executed: string[] = [];
  const transaction = {
    isActive: true,
    isolationLevel: 'READ COMMITTED',
    connector: {
      execute: async (statement: { queryChunks: unknown[] }) => {
        executed.push(JSON.stringify(normalize(statement.queryChunks)));
        return undefined;
      },
    },
    commit: async () => undefined,
    rollback: async () => undefined,
  };
  return { transaction, executed };
};

/** One sample call, as the old positional form, per `Class.method`. A fresh one is built per call. */
const SAMPLES: Record<string, () => ISample> = {
  ...Object.fromEntries(
    ['Postgres', 'Sqlite'].flatMap((dialect) => [
      [
        `${dialect}DataTypeEnricher.generateColumnDefs`,
        () => ({ args: [{ defaultValue: { dataType: 'text', nValue: 0, boValue: false } }] }),
      ],
      [
        `${dialect}DataTypeEnricher.enrich`,
        () => ({ args: [COLUMN_BASE, { defaultValue: { tValue: 'x' } }] }),
      ],
      [
        `${dialect}IdEnricher.generateColumnDefs`,
        () => ({ args: [{ id: { dataType: 'string' } }] }),
      ],
      [
        `${dialect}IdEnricher.enrich`,
        () => ({ args: [COLUMN_BASE, { id: { dataType: 'number' } }] }),
      ],
      [
        `${dialect}PrincipalEnricher.generateColumnDefs`,
        () => ({ args: [{ polymorphicIdType: 'string', discriminator: 'owner' }] }),
      ],
      [
        `${dialect}PrincipalEnricher.enrich`,
        () => ({ args: [COLUMN_BASE, { polymorphicIdType: 'number' }] }),
      ],
      [
        `${dialect}TzEnricher.generateColumnDefs`,
        () => ({ args: [{ modified: { enable: false }, deleted: { enable: true } }] }),
      ],
      [
        `${dialect}TzEnricher.enrich`,
        () => ({ args: [COLUMN_BASE, { deleted: { enable: true } }] }),
      ],
      [
        `${dialect}UserAuditEnricher.generateColumnDefs`,
        () => ({
          args: [{ created: { dataType: 'string', columnName: 'made_by', allowAnonymous: false } }],
        }),
      ],
      [`${dialect}UserAuditEnricher.enrich`, () => ({ args: [COLUMN_BASE, undefined] })],
    ]),
  ),
  'ScopeFilterUtility.assertScopeFilterSupported': () => ({
    args: [{ asyncContextEnabled: true }],
  }),
  'RelationalEntityUtility.getIdType': () => ({ args: [{ entity: USERS }] }),
  'AuditUserResolver.resolveAuditUserId': () => ({
    args: [{ allowAnonymous: true, columnField: 'createdBy' }],
  }),
  'RelationDeclarations.toRelationConfigs': () => ({
    args: [{ relations: { users: many(USERS) } }],
  }),
  'TableColumnCache.get': () => ({ args: [USERS] }),
  'JsonPathUtility.isJsonPath': () => ({ args: [{ key: 'data.a[0]' }] }),
  'JsonPathUtility.parseJsonPath': () => ({ args: [{ key: 'data.a[0].b' }] }),
  'JsonPathUtility.validateJsonPathComponents': () => ({
    args: [{ path: ['a', '0', 'b-c'], tableName: 'users', methodName: 'sample' }],
  }),
  'JsonPathUtility.validateJsonColumnType': () => ({
    args: [
      {
        column: { dataType: 'jsonb' },
        columnName: 'data',
        tableName: 'users',
        methodName: 'sample',
      },
    ],
  }),
  'RelationsFactory.create': () => ({ args: [{ source: USERS, relations: [] }] }),
  'SupabasePooler.buildPostgresJsOptions': () => ({ args: [{ mode: 'transaction', max: 5 }] }),
  'SupabaseRls.withAuthContext': () => {
    const { transaction, executed } = buildTransaction();
    return {
      args: [{ transaction, claims: { sub: 'user-1' }, role: 'authenticated' }],
      observe: () => executed,
    };
  },
  'SearchControllerFactory.defineRouteConfigs': () => ({
    args: [{ selectSchema: z.object({ id: z.string() }), authenticate: { mode: 'any' } }],
  }),
  'SearchCollectionFactory.define': () => ({ args: [TYPESENSE_DEFINITION] }),
  'SearchCollectionFactory.deriveDocumentSchema': () => ({
    args: [{ definition: TYPESENSE_DEFINITION, type: 'select' }],
  }),
  'SearchQueryParamsUtility.toSearchQueryParams': () => ({
    args: [{ queryBy: ['title', 'body'], collection: 'books', page: 2 }],
  }),
  'MeilisearchCollectionCompiler.compile': () => ({
    args: [{ definition: MEILISEARCH_DEFINITION }],
  }),
  'TypesenseCollectionCompiler.compile': () => ({ args: [{ definition: TYPESENSE_DEFINITION }] }),
};

/** The new form built from the old positional arguments, as the entry's `params` say. */
const toNewArguments = (opts: { mapping: IMapping; args: unknown[] }): unknown[] => {
  const { mapping, args } = opts;
  if (mapping.keepsOptions) {
    return args;
  }

  return [
    Object.fromEntries(
      mapping.params
        .map((parameter, index) => [parameter.key, args[index]] as const)
        .filter(([, value]) => value !== undefined),
    ),
  ];
};

const labelOf = (mapping: IMapping) => `${mapping.className}.${mapping.method}`;

describe('the mapping table of this package', () => {
  test('has entries, valid keys and no module this package does not export', () => {
    expect(CONNECTORS_MAPPINGS.length).toBeGreaterThan(0);

    const packageSubpaths = readExportsMap('connectors');
    const coreServerSubpaths = readExportsMap('core-server');

    for (const mapping of CONNECTORS_MAPPINGS) {
      expect(mapping.modules.length).toBeGreaterThan(0);

      for (const specifier of mapping.modules) {
        const isConnectors =
          specifier === PACKAGE_SPECIFIER || specifier.startsWith(`${PACKAGE_SPECIFIER}/`);
        const subpaths = isConnectors ? packageSubpaths : coreServerSubpaths;
        const base = isConnectors ? PACKAGE_SPECIFIER : CORE_SERVER_SPECIFIER;

        expect(subpaths).toContain(toSubpath({ specifier, base }));
      }
    }
  });

  test('every entry has a sample, and every sample belongs to an entry', () => {
    const labels = CONNECTORS_MAPPINGS.map(labelOf);

    expect(labels.filter((label) => !(label in SAMPLES))).toEqual([]);
    expect(Object.keys(SAMPLES).filter((label) => !labels.includes(label))).toEqual([]);
  });

  test('a core-server module of an entry mirrors a connectors module of the same entry', () => {
    for (const mapping of CONNECTORS_MAPPINGS) {
      for (const specifier of mapping.modules.filter(
        (item) => item === CORE_SERVER_SPECIFIER || item.startsWith(`${CORE_SERVER_SPECIFIER}/`),
      )) {
        // The root of `@venizia/ignis` re-exports `@venizia/ignis-connectors/postgres`.
        const mirrored =
          specifier === CORE_SERVER_SPECIFIER
            ? `${PACKAGE_SPECIFIER}/postgres`
            : `${PACKAGE_SPECIFIER}${specifier.slice(CORE_SERVER_SPECIFIER.length)}`;

        expect(mapping.modules).toContain(mirrored);
      }
    }
  });
});

describe('the old name and the class, per mapping entry', () => {
  for (const mapping of CONNECTORS_MAPPINGS) {
    const label = labelOf(mapping);

    test(`${mapping.oldName} -> ${label}: both exported from every connectors module listed`, async () => {
      const connectorsModules = mapping.modules.filter(
        (item) => item === PACKAGE_SPECIFIER || item.startsWith(`${PACKAGE_SPECIFIER}/`),
      );
      expect(connectorsModules.length).toBeGreaterThan(0);

      for (const specifier of connectorsModules) {
        const load = SOURCE_ENTRIES[specifier];
        if (!load) {
          throw new Error(`no source entry known for ${specifier}`);
        }

        const exported = await load();
        expect(typeof exported[mapping.oldName]).toBe('function');

        const namespace = callable({
          value: exported[mapping.className],
          label: mapping.className,
        });
        expect(typeof Reflect.get(namespace, mapping.method)).toBe('function');
      }
    });

    test(`${mapping.oldName} -> ${label}: the old form and the new form give the same result`, async () => {
      const sample = SAMPLES[label];
      if (!sample) {
        throw new Error(`${label} has no sample`);
      }

      const specifier = mapping.modules.find(
        (item) => item === PACKAGE_SPECIFIER || item.startsWith(`${PACKAGE_SPECIFIER}/`),
      );
      const load = specifier ? SOURCE_ENTRIES[specifier] : undefined;
      if (!load) {
        throw new Error(`${label} lists no connectors module`);
      }

      const exported = await load();
      const oldFunction = callable({ value: exported[mapping.oldName], label: mapping.oldName });
      const namespace = callable({ value: exported[mapping.className], label: mapping.className });
      const newFunction = callable({ value: Reflect.get(namespace, mapping.method), label });

      const oldSample = sample();
      const newSample = sample();

      const oldResult = await Reflect.apply(oldFunction, undefined, oldSample.args);
      const newResult = await Reflect.apply(
        newFunction,
        namespace,
        toNewArguments({ mapping, args: newSample.args }),
      );

      expect(normalize(newResult)).toEqual(normalize(oldResult));
      expect(normalize(newSample.observe?.())).toEqual(normalize(oldSample.observe?.()));
    });
  }
});
