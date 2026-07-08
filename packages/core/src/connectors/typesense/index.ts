export * from './types';

export * from './compiler';
// NOTE: './controllers' (SearchControllerFactory) is intentionally NOT re-exported here - it pulls
// BaseRestController, whose module graph has a pre-existing base/controllers <-> auth init cycle that
// only resolves once the root barrel is loaded. Keeping the DATA barrel (`@venizia/ignis/typesense`)
// controller-free lets it load standalone; the factory ships on the `@venizia/ignis/typesense/controllers` subpath.
export * from './datasources';
export * from './connector';
export * from './models';
export * from './repositories';
export * from './internal';
