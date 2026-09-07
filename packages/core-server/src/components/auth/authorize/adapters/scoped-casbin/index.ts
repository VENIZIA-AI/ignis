// DEFAULT_SCHEMA (common/constants.ts) was module-private in the pre-split file - re-export only
// the types, never the whole './common' barrel, or it leaks into the public surface.
export type {
  IScopedCasbinPolicyFilter,
  TDomainHierarchyEdge,
  TGrantRow,
  TResolveDomainEdgesFn,
} from './common';
export * from './policy-edges';
export * from './adapter';
