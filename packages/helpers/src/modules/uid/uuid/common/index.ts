// Explicit, not `export *`: the hex table and the cache cap are implementation detail, and a symbol
// this package exports is a symbol it owes a deprecation cycle.
export { UuidNamespaces, UUID_PATTERN } from './constants';
export * from './types';
