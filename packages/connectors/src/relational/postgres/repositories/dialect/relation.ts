// Deep re-export, never the neutral `../dialect` barrel: `RelationsFactory` is reached from the
// inversion mixins, and pulling the barrel in reintroduces the init cycle documented at the source.
export {
  createRelations,
  RelationsFactory,
} from '@/relational/core/repositories/dialect/relations/create';
