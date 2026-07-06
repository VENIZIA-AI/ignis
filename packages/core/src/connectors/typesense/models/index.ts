// Search-collection DSL is engine-neutral by design but homed here (sole consumer) per the LIFT
// RULE: moves to src/base/models when a second search connector lands.
export * from './base-search-entity';
export * from './define-search-collection';
export * from './types';
export * from './zod-derivation';
