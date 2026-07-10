// Back-compat shim: the search controller factory is engine-neutral and now lives with the search
// paradigm. `@venizia/ignis/typesense/controllers` keeps resolving for existing apps.
export * from '@/connectors/search/controllers';
