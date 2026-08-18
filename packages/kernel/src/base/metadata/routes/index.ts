export * from './controller';
export * from './rest';
export * from './rpc';
// `DroppedRouteDecorators` is decorator-migration instrumentation with no consumer outside this
// directory - not re-exported. `getDroppedRouteDecorators` is a deliberate `@internal` test seam
// (see its own doc comment) and the one core test that exercises it can only reach it through this
// barrel, since a relative cross-package import trips `rootDir` when core actually compiles.
export { getDroppedRouteDecorators } from './common';
