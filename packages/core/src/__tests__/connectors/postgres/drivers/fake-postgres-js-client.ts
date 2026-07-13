export interface IReleaseCall {
  destroyed: boolean;
}

/** drizzle mutates `options.parsers` / `options.serializers` when it binds a postgres-js client. */
const buildClientOptions = () => ({
  parsers: {} as Record<string, unknown>,
  serializers: {} as Record<string, unknown>,
});

/**
 * Fake postgres-js `ReservedSql`. `release()` takes no argument - postgres-js has no destroy
 * semantics, so `destroyed` is always false. That asymmetry is the point, not an oversight.
 *
 * Deliberately carries NO `options` property: the real `ReservedSql` does not either (verified
 * live), and drizzle's constructor crashes on that - the driver must shim it from the parent Sql.
 * Giving the fake an `options` of its own would hide exactly that bug, as it once did.
 */
export class FakeReservedSql {
  readonly statements: string[] = [];
  readonly releases: IReleaseCall[] = [];

  private readonly failOn?: string;

  constructor(opts?: { failOn?: string }) {
    this.failOn = opts?.failOn;
  }

  async unsafe(statement: string): Promise<unknown> {
    this.statements.push(statement);

    if (this.failOn && statement.startsWith(this.failOn)) {
      throw new Error(`${this.failOn} exploded`);
    }

    // Faithful to postgres-js: a RowList is an ARRAY carrying a `count` property.
    return Object.assign([], { count: 0 });
  }

  release(): void {
    this.releases.push({ destroyed: false });
  }
}

/** Fake postgres-js `Sql` - the client is itself the pool. */
export class FakeSql {
  readonly reserved: FakeReservedSql[] = [];
  readonly options = buildClientOptions();
  ended = false;

  private readonly failOn?: string;

  constructor(opts?: { failOn?: string }) {
    this.failOn = opts?.failOn;
  }

  async reserve(): Promise<FakeReservedSql> {
    const connection = new FakeReservedSql({ failOn: this.failOn });
    this.reserved.push(connection);

    return connection;
  }

  async unsafe(statement: string): Promise<unknown> {
    return [statement];
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}
