// Deep re-export, never the neutral `../dialect` barrel: `createRelations` is reached from the
// inversion mixins, and pulling the barrel in reintroduces the init cycle documented at the source.
export { createRelations } from '@/relational/core/repositories/dialect/relation';
