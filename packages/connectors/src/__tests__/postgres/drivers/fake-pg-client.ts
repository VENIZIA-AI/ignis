import type { Pool } from 'pg';
import { DuckTypingUtility } from '@/common/internal';

export interface IReleaseCall {
  destroyed: boolean;
}

/** Fake `pg.PoolClient`. Records statements and release() calls; can be told which statement throws. */
export class FakePoolClient {
  readonly statements: string[] = [];
  readonly releases: IReleaseCall[] = [];

  private readonly failOn?: string;

  constructor(opts?: { failOn?: string }) {
    this.failOn = opts?.failOn;
  }

  async query(statement: string): Promise<unknown> {
    this.statements.push(statement);

    if (this.failOn && statement.startsWith(this.failOn)) {
      throw new Error(`${this.failOn} exploded`);
    }

    return { rows: [], rowCount: 0 };
  }

  /** `pg` destroys the connection when the argument is truthy, instead of returning it to the pool. */
  release(error?: Error | boolean): void {
    this.releases.push({ destroyed: Boolean(error) });
  }
}

/** Fake `pg.Pool`. */
export class FakePool {
  readonly clients: FakePoolClient[] = [];
  ended = false;

  /** What NodePostgresDriver checks to tell a Pool from a bare `pg.Client`. */
  totalCount = 0;

  private readonly failOn?: string;

  constructor(opts?: { failOn?: string }) {
    this.failOn = opts?.failOn;
  }

  async connect(): Promise<FakePoolClient> {
    const client = new FakePoolClient({ failOn: this.failOn });
    this.clients.push(client);

    return client;
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

/** The same pool accounting `NodePostgresDriver` checks, stated as a guard so a fake can be handed over as a `Pool`. */
export const isPool = (value: unknown): value is Pool =>
  DuckTypingUtility.hasMembers({
    value,
    members: { connect: 'function', totalCount: 'number' },
  });

/** A fake pool the driver accepts as a real `Pool`. */
export const createFakePool = (opts?: { failOn?: string }): FakePool & Pool => {
  const pool = new FakePool(opts);

  if (!isPool(pool)) {
    throw new Error('[FakePool] Lacks the pool accounting a Pool has');
  }

  return pool;
};
