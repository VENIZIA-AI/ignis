import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { model } from '@/base/metadata';
import { DEFAULT_MAX_LIMIT } from '@/base/repositories/common';
import { BaseSearchEntity, defineSearchCollection, field } from '@/connectors/search/models';
import { DefaultSearchRepository } from '@/connectors/search/repositories';
import { SearchModes } from '@/connectors/search/repositories/common';
import { expectRejection } from '@/__tests__/rejection.helper';
import { FakeSearchDataSource } from './fake-search-connector';

/**
 * TWO CEILINGS, TWO LAYERS, TWO REASONS.
 *
 *   repository   1000 (overridable)   POLICY  - a number the framework chose
 *   connector    12,500               PHYSICS - 50 windows x 250, imposed by the engine
 *
 * The policy ceiling exists because the transport change REMOVED an accidental guardrail: the
 * engine used to refuse a page over 250 hits, so `limit: 5000` failed fast and cheap. Now it can
 * be served, and shipping that without a replacement would leave the framework less safe than
 * before. The policy ceiling fires first, so callers normally never meet the physical one.
 *
 * Nothing that works today can break: no caller can currently succeed with a limit above 250,
 * because the engine refuses it. This only bounds the capability the branch adds.
 */

@model({ type: 'entity', tableName: 'ceiling_default' })
class DefaultCeilingDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'ceiling_default',
    fields: [field.string('title'), field.string('status')],
  });
}

/** A model that genuinely needs bigger pages says so, and is taken at its word. */
@model({ type: 'entity', tableName: 'ceiling_raised', settings: { maxLimit: 5000 } })
class RaisedCeilingDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'ceiling_raised',
    fields: [field.string('title'), field.string('status')],
  });
}

/** The override goes DOWN as readily as up - a model may be stricter than the framework default. */
@model({ type: 'entity', tableName: 'ceiling_lowered', settings: { maxLimit: 25 } })
class LoweredCeilingDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'ceiling_lowered',
    fields: [field.string('title'), field.string('status')],
  });
}

const buildRepository = (entityClass: AnyType) => {
  const dataSource = new FakeSearchDataSource({ name: 'ceiling-ds', config: {} });
  const repository = new DefaultSearchRepository(dataSource, { entityClass });

  return { repository: repository as AnyType, connector: dataSource.fakeConnector as AnyType };
};

describe('page-size ceiling - the framework default', () => {
  test(`a model declaring no maxLimit gets ${DEFAULT_MAX_LIMIT}`, async () => {
    const { repository, connector } = buildRepository(DefaultCeilingDocument);

    await expectRejection({
      task: repository.find({ filter: { limit: DEFAULT_MAX_LIMIT + 1 } }),
      message: /exceeds this model's limit/,
    });

    expect(connector.searchCalls, 'the engine must never be asked for a refused page').toHaveLength(
      0,
    );
  });

  test('exactly at the ceiling is allowed - the bound is inclusive', async () => {
    const { repository, connector } = buildRepository(DefaultCeilingDocument);

    await repository.find({ filter: { limit: DEFAULT_MAX_LIMIT } });

    expect(connector.searchCalls).toHaveLength(1);
  });

  test('an ordinary page is untouched', async () => {
    const { repository, connector } = buildRepository(DefaultCeilingDocument);

    await repository.find({ filter: { limit: 20 } });

    expect(connector.searchCalls).toHaveLength(1);
  });
});

describe('page-size ceiling - a model overrides it in both directions', () => {
  test('maxLimit raises the ceiling', async () => {
    const { repository, connector } = buildRepository(RaisedCeilingDocument);

    // Refused under the framework default; permitted because this model asked for it.
    await repository.find({ filter: { limit: 5000 } });

    expect(connector.searchCalls).toHaveLength(1);
  });

  test('a raised ceiling is still a ceiling', async () => {
    const { repository } = buildRepository(RaisedCeilingDocument);

    await expectRejection({
      task: repository.find({ filter: { limit: 5001 } }),
      message: /maximum: 5000/,
    });
  });

  test('maxLimit lowers the ceiling below the framework default', async () => {
    const { repository } = buildRepository(LoweredCeilingDocument);

    await expectRejection({
      task: repository.find({ filter: { limit: 100 } }),
      message: /maximum: 25/,
    });
  });
});

describe('page-size ceiling - it applies wherever a caller-supplied limit reaches the engine', () => {
  test('find() is bounded', async () => {
    const { repository } = buildRepository(DefaultCeilingDocument);

    await expectRejection({
      task: repository.find({ filter: { limit: 2000 } }),
      message: /exceeds this model's limit/,
    });
  });

  /** Bounding only find() would leave search() as a way around it, which is not a ceiling. */
  test('search() is bounded too - it is not a way around find()', async () => {
    const { repository } = buildRepository(DefaultCeilingDocument);

    await expectRejection({
      task: repository.search({
        mode: SearchModes.KEYWORD,
        query: 'shoe',
        filter: { limit: 2000 },
      }),
      message: /exceeds this model's limit/,
    });
  });

  test('count() carries no limit, so the ceiling has nothing to say about it', async () => {
    const { repository } = buildRepository(DefaultCeilingDocument);

    expect(await repository.count({ where: { status: 'active' } })).toEqual({ count: 0 });
  });
});

describe('page-size ceiling - raw is the documented escape hatch', () => {
  /**
   * `mode: 'raw'` bypasses buildQuery and therefore bypasses POLICY. That is correct: raw callers
   * own the consequences. They cannot escape PHYSICS - the connector's ceiling still applies -
   * which is the intended layering.
   */
  test('raw bypasses the policy ceiling', async () => {
    const { repository, connector } = buildRepository(DefaultCeilingDocument);

    await repository.search({ mode: SearchModes.RAW, params: { q: '*', ['per_page']: 2000 } });

    expect(connector.searchCalls).toHaveLength(1);
  });

  /**
   * Raw hands its params to the connector untouched, so whatever ceiling the connector imposes
   * still applies - policy is opt-out-able, physics is not.
   *
   * That the physical ceiling then FIRES is asserted against the real TypesenseConnector in
   * `typesense/connector/multi-search-transport.test.ts`; this datasource's connector is a fake
   * with no engine limits, so proving it here would only be testing the fake.
   */
  test('raw reaches the connector with its oversized page intact, for the connector to judge', async () => {
    const { repository, connector } = buildRepository(DefaultCeilingDocument);

    await repository.search({ mode: SearchModes.RAW, params: { q: '*', ['per_page']: 20_000 } });

    const [call] = connector.searchCalls;
    expect((call.params as Record<string, unknown>)['per_page']).toBe(20_000);
  });
});

describe('page-size ceiling - the rejection is actionable', () => {
  test('it is the catalogued page_too_large code', async () => {
    const { repository } = buildRepository(DefaultCeilingDocument);

    try {
      await repository.find({ filter: { limit: 2000 } });
      expect.unreachable('a page beyond the ceiling must be refused');
    } catch (error) {
      const failure = error as { statusCode?: number; normalized?: { code?: string } };
      expect(failure.statusCode).toBe(400);
      expect(failure.normalized?.code).toBe('core.search_engine.page_too_large');
    }
  });

  /**
   * One code covers three different ceilings (this one, 250 grouped, 12,500 windowed) because the
   * remedy is always the same. The MESSAGE therefore has to carry the specifics - a client
   * branching on the code alone could not tell what to retry with.
   */
  test('the message names both the requested value and the applicable ceiling', async () => {
    const { repository } = buildRepository(LoweredCeilingDocument);

    try {
      await repository.find({ filter: { limit: 900 } });
      expect.unreachable('a page beyond the ceiling must be refused');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('requested: 900');
      expect(message).toContain('maximum: 25');
    }
  });
});
