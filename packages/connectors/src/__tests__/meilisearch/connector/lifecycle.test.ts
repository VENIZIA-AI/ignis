import { describe, expect, test } from 'bun:test';
import { MeilisearchConnector } from '@/search/meilisearch/connector';
import { FakeMeilisearchClient } from './fake-client';

const buildConnector = (opts?: {
  client?: FakeMeilisearchClient;
}): { client: FakeMeilisearchClient; connector: MeilisearchConnector } => {
  const client = opts?.client ?? new FakeMeilisearchClient();
  const connector = new MeilisearchConnector({
    name: 'meili-lifecycle',
    host: 'http://localhost:7700',
    taskIntervalMs: 1,
    client,
  });

  return { client, connector };
};

describe('MeilisearchConnector - getHealth', () => {
  test('resolves { ok: true } when the engine reports available', async () => {
    const { connector } = buildConnector();
    expect(await connector.getHealth()).toEqual({ ok: true });
  });

  test('resolves { ok: false } when status is not available', async () => {
    const client = new FakeMeilisearchClient({ healthStatus: 'maintenance' });
    const { connector } = buildConnector({ client });
    expect(await connector.getHealth()).toEqual({ ok: false });
  });
});
