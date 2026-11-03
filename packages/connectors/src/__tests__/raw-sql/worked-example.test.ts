import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { captureRejection } from './fake-engine';
// ---- the example of docs/wiki/content/guides/core-concepts/persistent/raw-sql.md starts here ----
import type { IRawSqlConnector, IRawSqlResult, TRawSqlDriver, TRawSqlQuery } from '@/raw-sql';
import { BaseRawSqlDataSource, BaseRawSqlRepository } from '@/raw-sql';
import { datasource, repository, RepositoryTypes } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';

/** The engine's own client: it takes SQL text and answers with rows. */
class GizmoClient {
  constructor(readonly opts: { url: string }) {}

  async run(statement: string): Promise<Array<Record<string, unknown>>> {
    return [{ url: this.opts.url, statement }];
  }

  async close(): Promise<void> {}
}

/** The connector turns a statement into the client's call and returns `{ rows }`. */
class GizmoConnector implements IRawSqlConnector {
  constructor(private readonly client: GizmoClient) {}

  async execute(query: TRawSqlQuery): Promise<IRawSqlResult> {
    if (typeof query !== 'string') {
      throw getError({
        message: '[GizmoConnector] This engine takes SQL text, not a Drizzle template',
      });
    }

    const result = await this.client.run(query);
    return { rows: result };
  }
}

/** The driver builds the connector over the client, hands the client back, and ends it. */
class GizmoDriver implements TRawSqlDriver<GizmoConnector, GizmoClient> {
  constructor(private readonly opts: { client: GizmoClient }) {}

  createConnector(): GizmoConnector {
    return new GizmoConnector(this.opts.client);
  }

  getClient(): GizmoClient {
    return this.opts.client;
  }

  end(): Promise<void> {
    return this.opts.client.close();
  }
}

/** The datasource names the driver and builds the client in `configure()`. */
@datasource({ driver: GizmoDriver })
class GizmoDataSource extends BaseRawSqlDataSource<{ url: string }, GizmoClient, GizmoConnector> {
  constructor() {
    super({ name: 'gizmo', config: { url: 'gizmo://analytics' } });
  }

  configure(): void {
    this.client = new GizmoClient({ url: this.getSettings().url });
  }
}

/** A repository has no model: it names the datasource and writes its own statements. */
@repository({ type: RepositoryTypes.REMOTE, dataSource: GizmoDataSource })
class DailyRevenueRepository extends BaseRawSqlRepository<GizmoConnector> {
  async since(opts: { day: string }) {
    const { rows } = await this.connector.execute(
      `select day, sum(total) from revenue where day >= '${opts.day}'`,
    );
    return rows;
  }
}
// ---- the example ends here ----

describe('the raw SQL guide: a worked example on a fake engine', () => {
  test('the example runs: configure, connect lazily, query, close', async () => {
    const dataSource = new GizmoDataSource();
    dataSource.configure();
    const repositoryInstance = new DailyRevenueRepository(dataSource);

    const rows = await repositoryInstance.since({ day: '2026-10-01' });

    expect(rows).toEqual([
      {
        url: 'gizmo://analytics',
        statement: "select day, sum(total) from revenue where day >= '2026-10-01'",
      },
    ]);
    const result = await captureRejection(() => dataSource.close());
    expect(result).toBeUndefined();
  });

  test('a Drizzle template is refused by this connector, in its own words', async () => {
    const dataSource = new GizmoDataSource();
    dataSource.configure();

    const error = await captureRejection(() => dataSource.execute(sql`select 1`));

    expect(String(error)).toContain('takes SQL text');
  });
});
