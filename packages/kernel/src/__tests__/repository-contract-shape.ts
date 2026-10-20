/**
 * Never run. `tsc` checks the body during the build, which is the point: this is the shape a
 * consumer on a NON-SQL transport has to write, and it compiles or the build fails.
 *
 * It exists because every line below was a compile error first - each one is friction a consumer
 * would hit and have to guess its way out of:
 *
 * - `AbstractRepository` demands TWELVE abstract members, so a read-only resource would have to stub
 *   `create`/`updateById`/`deleteById`. Implementing `IReadableRepository` is the lighter path.
 * - `find` is an OVERLOAD with a range variant. One signature does not satisfy it.
 * - `IRepository` names `dataSource`, `entity` and `getEntity`, so `AbstractEntity` has to be
 *   reachable - it is exported from `@venizia/ignis-kernel/repository` for exactly this.
 * - `AbstractDataSource` declares `name`/`settings`/`schema` as fields with no constructor to set
 *   them; a subclass assigns them itself.
 */
import { AbstractDataSource, AbstractEntity } from '@/repository';
import type {
  IReadableRepository,
  TCount,
  TDataWithRange,
  TFilter,
  TSchemaType,
  TWhere,
} from '@/repository';

/** The transport. `configure()` is the only required METHOD; `name`/`settings`/`schema` are declared fields a subclass assigns. */
class HttpDataSource extends AbstractDataSource<{ baseUrl: string }> {
  override name = 'http';
  override settings: { baseUrl: string };
  override schema = {} as never;

  constructor(opts: { baseUrl: string }) {
    super({ scope: HttpDataSource.name });
    this.settings = { baseUrl: opts.baseUrl };
  }

  async configure(): Promise<void> {}
}

/** The entity. Engine-neutral: a name and a schema accessor. */
class TicketEntity extends AbstractEntity {
  constructor() {
    super({ name: 'Ticket' });
  }

  getSchema<T = unknown>(_opts: { type: TSchemaType }): T {
    return {} as T;
  }
}

type TTicket = { id: string; title: string };

/** The repository, on the READ contract rather than the 12-member abstract class. */
class TicketApi implements IReadableRepository<TTicket, {}> {
  dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com' });
  entity = new TicketEntity();

  getEntity(): AbstractEntity {
    return this.entity;
  }

  async count(_opts: { where: TWhere<TTicket>; options?: {} }): Promise<TCount> {
    return { count: 0 };
  }

  async existsWith(_opts: { where: TWhere<TTicket>; options?: {} }): Promise<boolean> {
    return false;
  }

  // Two signatures, because the contract declares `find` as an overload with a range variant.
  async find<R = TTicket>(opts: {
    filter: TFilter<TTicket>;
    options: { shouldQueryRange: true };
  }): Promise<TDataWithRange<R>>;
  async find<R = TTicket>(opts: { filter?: TFilter<TTicket>; options?: {} }): Promise<Array<R>>;
  async find<R = TTicket>(_opts: {
    filter?: TFilter<TTicket>;
    options?: object;
  }): Promise<Array<R> | TDataWithRange<R>> {
    return [];
  }

  async findOne<R = TTicket>(_opts: {
    filter?: TFilter<TTicket>;
    options?: {};
  }): Promise<R | null> {
    return null;
  }

  async findById<R = TTicket>(_opts: {
    id: string;
    filter?: TFilter<TTicket>;
    options?: {};
  }): Promise<R | null> {
    return null;
  }
}

export { HttpDataSource, TicketApi, TicketEntity };
