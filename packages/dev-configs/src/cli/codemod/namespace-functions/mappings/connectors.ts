import type { INamespaceMapping } from '../mapping';

const CONNECTORS = '@venizia/ignis-connectors';
const CORE_SERVER = '@venizia/ignis';

/**
 * `@venizia/ignis` (the root) re-exports `@venizia/ignis-connectors/postgres` only, and every other
 * core-server subpath mirrors the connectors subpath of the same name.
 */
const POSTGRES_MODULES = [`${CONNECTORS}/postgres`, CORE_SERVER, `${CORE_SERVER}/postgres`];
const SQLITE_MODULES = [`${CONNECTORS}/sqlite`, `${CORE_SERVER}/sqlite`];
const RELATIONAL_MODULES = [CONNECTORS, `${CONNECTORS}/relational`, `${CORE_SERVER}/relational`];
const RELATIONAL_AND_DIALECT_MODULES = [
  ...RELATIONAL_MODULES,
  `${CONNECTORS}/postgres`,
  `${CONNECTORS}/sqlite`,
  CORE_SERVER,
  `${CORE_SERVER}/postgres`,
  `${CORE_SERVER}/sqlite`,
];
const SEARCH_MODULES = [
  CONNECTORS,
  `${CONNECTORS}/search`,
  `${CONNECTORS}/typesense`,
  `${CORE_SERVER}/search`,
  `${CORE_SERVER}/typesense`,
];
const SEARCH_CONTROLLER_MODULES = [
  `${CONNECTORS}/search/controllers`,
  `${CONNECTORS}/typesense/controllers`,
  `${CORE_SERVER}/search/controllers`,
  `${CORE_SERVER}/typesense/controllers`,
];

/** The old function took one options object, so the class method takes it unchanged. */
const passthrough = (
  mapping: Omit<INamespaceMapping, 'params' | 'keepsOptions'>,
): INamespaceMapping => ({ ...mapping, params: [], keepsOptions: true });

/** The enricher functions of one dialect: `generate*ColumnDefs(opts)` and `enrich*(baseSchema, opts)`. */
const enricher = (opts: {
  modules: string[];
  className: string;
  generateName: string;
  enrichName: string;
  baseKey: 'baseColumns' | 'baseSchema';
  isOptionsRequired?: boolean;
}): INamespaceMapping[] => [
  passthrough({
    modules: opts.modules,
    oldName: opts.generateName,
    className: opts.className,
    method: 'generateColumnDefs',
  }),
  {
    modules: opts.modules,
    oldName: opts.enrichName,
    className: opts.className,
    method: 'enrich',
    params: [{ key: opts.baseKey }, { key: 'opts', optional: !opts.isOptionsRequired }],
  },
];

/** The functions of `@venizia/ignis-connectors` that moved into a class. */
export const CONNECTORS_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  ...enricher({
    modules: POSTGRES_MODULES,
    className: 'PostgresDataTypeEnricher',
    generateName: 'generateDataTypeColumnDefs',
    enrichName: 'enrichDataTypes',
    baseKey: 'baseSchema',
  }),
  ...enricher({
    modules: POSTGRES_MODULES,
    className: 'PostgresIdEnricher',
    generateName: 'generateIdColumnDefs',
    enrichName: 'enrichId',
    baseKey: 'baseColumns',
  }),
  ...enricher({
    modules: POSTGRES_MODULES,
    className: 'PostgresPrincipalEnricher',
    generateName: 'generatePrincipalColumnDefs',
    enrichName: 'enrichPrincipal',
    baseKey: 'baseSchema',
    isOptionsRequired: true,
  }),
  ...enricher({
    modules: POSTGRES_MODULES,
    className: 'PostgresTzEnricher',
    generateName: 'generateTzColumnDefs',
    enrichName: 'enrichTz',
    baseKey: 'baseSchema',
  }),
  ...enricher({
    modules: POSTGRES_MODULES,
    className: 'PostgresUserAuditEnricher',
    generateName: 'generateUserAuditColumnDefs',
    enrichName: 'enrichUserAudit',
    baseKey: 'baseSchema',
  }),
  ...enricher({
    modules: SQLITE_MODULES,
    className: 'SqliteDataTypeEnricher',
    generateName: 'generateDataTypeColumnDefs',
    enrichName: 'enrichDataTypes',
    baseKey: 'baseSchema',
  }),
  ...enricher({
    modules: SQLITE_MODULES,
    className: 'SqliteIdEnricher',
    generateName: 'generateIdColumnDefs',
    enrichName: 'enrichId',
    baseKey: 'baseColumns',
  }),
  ...enricher({
    modules: SQLITE_MODULES,
    className: 'SqlitePrincipalEnricher',
    generateName: 'generatePrincipalColumnDefs',
    enrichName: 'enrichPrincipal',
    baseKey: 'baseSchema',
    isOptionsRequired: true,
  }),
  ...enricher({
    modules: SQLITE_MODULES,
    className: 'SqliteTzEnricher',
    generateName: 'generateTzColumnDefs',
    enrichName: 'enrichTz',
    baseKey: 'baseSchema',
  }),
  ...enricher({
    modules: SQLITE_MODULES,
    className: 'SqliteUserAuditEnricher',
    generateName: 'generateUserAuditColumnDefs',
    enrichName: 'enrichUserAudit',
    baseKey: 'baseSchema',
  }),

  passthrough({
    modules: [CONNECTORS],
    oldName: 'assertScopeFilterSupported',
    className: 'ScopeFilterUtility',
    method: 'assertScopeFilterSupported',
  }),
  passthrough({
    modules: RELATIONAL_AND_DIALECT_MODULES,
    oldName: 'getIdType',
    className: 'RelationalEntityUtility',
    method: 'getIdType',
  }),
  passthrough({
    modules: RELATIONAL_MODULES,
    oldName: 'resolveAuditUserId',
    className: 'AuditUserResolver',
    method: 'resolveAuditUserId',
  }),
  passthrough({
    modules: RELATIONAL_AND_DIALECT_MODULES,
    oldName: 'toRelationConfigs',
    className: 'RelationDeclarations',
    method: 'toRelationConfigs',
  }),
  passthrough({
    modules: [...RELATIONAL_MODULES, ...POSTGRES_MODULES],
    oldName: 'getCachedColumns',
    className: 'TableColumnCache',
    method: 'get',
  }),
  ...['isJsonPath', 'parseJsonPath', 'validateJsonPathComponents', 'validateJsonColumnType'].map(
    (oldName) =>
      passthrough({
        modules: RELATIONAL_MODULES,
        oldName,
        className: 'JsonPathUtility',
        method: oldName,
      }),
  ),
  passthrough({
    modules: [...RELATIONAL_MODULES, ...POSTGRES_MODULES],
    oldName: 'createRelations',
    className: 'RelationsFactory',
    method: 'create',
  }),
  passthrough({
    modules: [`${CONNECTORS}/postgres/supabase`, `${CORE_SERVER}/postgres/supabase`],
    oldName: 'buildPostgresJsOptions',
    className: 'SupabasePooler',
    method: 'buildPostgresJsOptions',
  }),
  passthrough({
    modules: [`${CONNECTORS}/postgres/supabase`, `${CORE_SERVER}/postgres/supabase`],
    oldName: 'withAuthContext',
    className: 'SupabaseRls',
    method: 'withAuthContext',
  }),
  passthrough({
    modules: SEARCH_CONTROLLER_MODULES,
    oldName: 'defineSearchRouteConfigs',
    className: 'SearchControllerFactory',
    method: 'defineRouteConfigs',
  }),
  passthrough({
    modules: SEARCH_MODULES,
    oldName: 'defineSearchCollection',
    className: 'SearchCollectionFactory',
    method: 'define',
  }),
  passthrough({
    modules: SEARCH_MODULES,
    oldName: 'deriveSearchDocumentSchema',
    className: 'SearchCollectionFactory',
    method: 'deriveDocumentSchema',
  }),
  {
    modules: SEARCH_MODULES,
    oldName: 'toSearchQueryParams',
    className: 'SearchQueryParamsUtility',
    method: 'toSearchQueryParams',
    params: [{ key: 'input' }],
  },
  passthrough({
    modules: [`${CONNECTORS}/meilisearch`, `${CORE_SERVER}/meilisearch`],
    oldName: 'compileMeilisearchCollection',
    className: 'MeilisearchCollectionCompiler',
    method: 'compile',
  }),
  passthrough({
    modules: [`${CONNECTORS}/typesense`, `${CORE_SERVER}/typesense`],
    oldName: 'compileTypesenseCollection',
    className: 'TypesenseCollectionCompiler',
    method: 'compile',
  }),
];
