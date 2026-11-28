// DEFAULT_SCHEMA (common/constants.ts) is internal - re-export only the types, never the whole
// './common' barrel, or it leaks into the public surface.
export type { TDomainHierarchyEdge, TGrantRow, TResolveDomainEdgesFn } from './common';
export * from './policy-edges';
export * from './adapter';
