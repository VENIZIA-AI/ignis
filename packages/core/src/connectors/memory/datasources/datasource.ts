import { TClass } from '@venizia/ignis-helpers';
import { AbstractDataSource } from '@/base/datasources';

/** Discoverable-model shape: a static `COLLECTION_NAME` is this connector's equivalent of
 * postgres's static `schema` or typesense's static `definition` - whatever engine-specific DSL a
 * model would otherwise carry. */
export interface IMemoryCollectionDefinition {
  name: string;
}

export interface IMemoryDataSourceOptions {
  name: string;
  config?: {};
}

type TMemoryDiscoverableModelClass = TClass<unknown> & { COLLECTION_NAME?: string };

/**
 * Zero-dependency, Map-backed datasource for prototyping and tests (the LoopBack memory-connector
 * role). `configure()` provisions one in-memory collection per bound entity using only
 * `AbstractDataSource`'s protected discovery helpers - no engine-specific hook was needed on the
 * base class to make this work. `getCapabilities()` is left as the inherited default
 * (`{ transactions: false }`); no `beginTransaction()` override either, so it inherits the
 * NotSupported rejection.
 */
export class MemoryDataSource extends AbstractDataSource<
  {},
  Record<string, IMemoryCollectionDefinition>
> {
  private readonly store = new Map<string, Map<string, Record<string, unknown>>>();

  constructor(opts: IMemoryDataSourceOptions) {
    super({ scope: opts.name });
    this.name = opts.name;
    this.settings = opts.config ?? {};
  }

  configure(): void {
    const definitions = this.discoverDefinitions<IMemoryCollectionDefinition>({
      kind: 'collection',
      read: modelClass => {
        const target = modelClass as TMemoryDiscoverableModelClass;
        return target.COLLECTION_NAME ? { name: target.COLLECTION_NAME } : undefined;
      },
    });

    this.schema = definitions;

    for (const name of Object.keys(definitions)) {
      this.getStore({ name });
    }
  }

  /** Lazily provisions and returns the named collection - used by `MemoryRepository` and by tests
   * seeding data directly. */
  getStore(opts: { name: string }): Map<string, Record<string, unknown>> {
    const { name } = opts;
    let collection = this.store.get(name);

    if (!collection) {
      collection = new Map();
      this.store.set(name, collection);
    }

    return collection;
  }

  /** Existence check with no provisioning side effect - `getStore()` always provisions on access,
   * which would make "is this collection provisioned yet" untestable. */
  hasCollection(opts: { name: string }): boolean {
    return this.store.has(opts.name);
  }
}
