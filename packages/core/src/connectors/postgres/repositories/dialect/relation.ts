// Deep re-export, not the `../dialect` barrel of the neutral tier: `createRelations` is reached from the inversion mixins, and pulling a barrel in reintroduces the init cycle documented at the source file.
/** `createRelations` is engine-neutral and lives in `@/connectors/relational/repositories/dialect`; re-exported here so this historical import path keeps resolving. */
export { createRelations } from '@/connectors/relational/repositories/dialect/relation';
