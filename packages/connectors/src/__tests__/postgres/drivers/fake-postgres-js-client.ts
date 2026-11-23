import type { Sql } from 'postgres';
import { DuckTypingUtility } from '@/common/internal';

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
  private readonly command?: string;

  constructor(opts?: { failOn?: string; command?: string }) {
    this.failOn = opts?.failOn;
    this.command = opts?.command;
  }

  async unsafe(statement: string): Promise<unknown> {
    this.statements.push(statement);

    if (this.failOn && statement.startsWith(this.failOn)) {
      throw new Error(`${this.failOn} exploded`);
    }

    // Faithful to postgres-js: a RowList is an ARRAY carrying a `count` property.
    return Object.assign([], { count: 0, command: this.command });
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
  private readonly command?: string;

  constructor(opts?: { failOn?: string; command?: string }) {
    this.failOn = opts?.failOn;
    this.command = opts?.command;
  }

  async reserve(): Promise<FakeReservedSql> {
    const connection = new FakeReservedSql({ failOn: this.failOn, command: this.command });
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

/** The verbs `PostgresJsDriver` checks, stated as a guard so a fake can be handed over as a `Sql`. */
const isSql = (value: unknown): value is Sql =>
  DuckTypingUtility.hasMembers({ value, members: { reserve: 'function', unsafe: 'function' } });

/** A fake client the driver accepts as a real `Sql`. */
export const createFakeSql = (opts?: { failOn?: string; command?: string }): FakeSql & Sql => {
  const sql = new FakeSql(opts);

  if (!isSql(sql)) {
    throw new Error('[FakeSql] Lacks reserve() or unsafe()');
  }

  return sql;
};
