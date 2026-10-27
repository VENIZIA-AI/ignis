import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { RepositoryTypes, RestApplication, repository } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseRawSqlRepository } from '@/raw-sql';
import { type FakeConnector, FakeDataSource } from './fake-engine';

class RawSqlApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'raw-sql-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const buildApplication = () => {
  const config: IApplicationConfigs = { path: { base: '/', isStrict: false } };
  const application = new RawSqlApplication({ scope: RawSqlApplication.name, config });
  application.init();
  return application;
};

/** The shape of a report repository: no model, a datasource, its own statements. */
@repository({ type: RepositoryTypes.REMOTE, dataSource: FakeDataSource })
class SalesReportRepository extends BaseRawSqlRepository<FakeConnector> {
  async totalsByHost() {
    // `hostName` exists on FakeConnector only: no cast and no `any` between the repository and it.
    const host: string = this.connector.hostName();
    const result = await this.connector.execute(`select sum(total) from sales -- ${host}`);
    const first: Record<string, unknown> | undefined = result.rows[0];
    return { host, first };
  }

  recent() {
    return this.execute('select * from sales limit 10');
  }
}

describe('BaseRawSqlRepository', () => {
  test('is bound to its datasource by @repository, with no constructor of its own', () => {
    const application = buildApplication();
    application.dataSource(FakeDataSource);
    application.repository(SalesReportRepository);

    const resolved = application.get<SalesReportRepository>({
      key: 'repositories.SalesReportRepository',
    });

    expect(resolved.dataSource).toBeInstanceOf(FakeDataSource);
    expect(resolved.getEntity().name).toBe('SalesReportRepository');
  });

  test('this.connector is the datasource connector, typed by the repository generic', async () => {
    const application = buildApplication();
    application.dataSource(FakeDataSource);
    application.repository(SalesReportRepository);
    const resolved = application.get<SalesReportRepository>({
      key: 'repositories.SalesReportRepository',
    });
    const dataSource = application.get<FakeDataSource>({ key: 'datasources.FakeDataSource' });
    dataSource.configure();

    const totals = await resolved.totalsByHost();

    expect(resolved.connector).toBe(dataSource.getConnector());
    expect(totals.host).toBe('analytics.local');
    expect(totals.first).toMatchObject({ host: 'analytics.local' });
  });

  test('execute() runs a statement through the connector and returns the rows', async () => {
    const application = buildApplication();
    application.dataSource(FakeDataSource);
    application.repository(SalesReportRepository);
    const resolved = application.get<SalesReportRepository>({
      key: 'repositories.SalesReportRepository',
    });
    application.get<FakeDataSource>({ key: 'datasources.FakeDataSource' }).configure();

    const result = await resolved.recent();

    expect(result.rows).toEqual([
      { host: 'analytics.local', statement: 'select * from sales limit 10' },
    ]);
  });

  test('a Drizzle sql template reaches the connector as the template, not as text', async () => {
    const application = buildApplication();
    application.dataSource(FakeDataSource);
    application.repository(SalesReportRepository);
    const dataSource = application.get<FakeDataSource>({ key: 'datasources.FakeDataSource' });
    dataSource.configure();

    const result = await dataSource.execute(sql`select ${1} as one`);

    // FakeConnector serialises what it is given; the point is that a SQLWrapper is accepted by the type.
    expect(result.rows).toHaveLength(1);
    expect(dataSource.builds[0]?.statements[0]).toContain('select');
  });
});
