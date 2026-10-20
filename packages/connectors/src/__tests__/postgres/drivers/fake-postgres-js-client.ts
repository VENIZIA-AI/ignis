export interface IReleaseCall {
  destroyed: boolean;
}

/** drizzle mutates `options.parsers` / `options.serializers` when it binds a postgres-js client. */
const buildClientOptions = () => ({
  parsers: {} as Record<string, unknown>,
  serializers: {} as Record<string, unknown>,
});

/** Fake postgres-js `ReservedSql`: `release()` takes no argument (the missing destroy semantics are the point) and deliberately carries NO `options` property, matching the real one - drizzle crashes on that and the driver must shim it, so an own `options` would hide the bug. */
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
