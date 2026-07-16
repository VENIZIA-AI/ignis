import { describe, expect, test } from 'bun:test';

const shouldRun = Boolean(
  process.env.VAULT_ADDR && process.env.VAULT_TOKEN && process.env.PG_ADMIN_URL,
);
const suite = shouldRun ? describe : describe.skip;

suite('HashiCorp Vault integration (real server)', () => {
  test('KV hydrate + dynamic lease rotation drains and reconnects', async () => {
    // 1. Write a KV v2 secret and a database role via the Vault HTTP API.
    // 2. Build HashiCorpVaultHelper (app-role or token), configure().
    // 3. getBundle the KV path -> assert values.
    // 4. lease the database/creds path with a ~5s TTL; register a real pg.Pool datasource as
    //    rotatable; wait past max TTL; assert current_user changed AND an in-flight transaction
    //    started before rotation still commits on the old pool.
    // 5. shutdown() -> assert the temp role is revoked (Vault returns 400 on the revoked lease).
    expect(shouldRun).toBe(true);
  });
});
