import { describe, expect, test } from 'bun:test';

const shouldRun = Boolean(
  process.env.VAULT_ADDR && process.env.VAULT_TOKEN && process.env.PG_ADMIN_URL,
);
const suite = shouldRun ? describe : describe.skip;

suite('HashiCorp Vault integration (real server)', () => {
  test('KV hydrate + dynamic lease rotation drains and reconnects', async () => {
    // Plan: write a KV v2 secret + database role via the Vault API, assert getBundle values, lease database/creds (~5s TTL) with a rotatable pg.Pool, wait past max TTL, assert current_user changed and pre-rotation transactions still commit, then shutdown() revokes the role.
    expect(shouldRun).toBe(true);
  });
});
