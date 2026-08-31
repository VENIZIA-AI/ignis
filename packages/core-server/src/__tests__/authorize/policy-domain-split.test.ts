/**
 * Release A of the `domain` -> `domain_type` + `domain_id` split: both forms are written, `domain`
 * is still the read source. The CHECK is exercised against a real Postgres (PGlite) rather than
 * asserted as a string - a predicate that merely LOOKS right rejects nothing.
 */

import { PGlite } from '@electric-sql/pglite';
import { AuthorizationDomainScopes, AuthorizationPolicyBuilder } from '@venizia/ignis-kernel';
import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { policyDefinitionDomainShapeCheck } from '@/components/auth/models/entities/policy-definition.model';

const SUBJECT = { type: 'User', id: 'u1' };
const PERMISSION = { type: 'Permission', id: 'p1' };
const ROLE = { type: 'Role', id: 'r1' };

describe('AuthorizationPolicyBuilder domain dual-write', () => {
  test('a typed domain fills both columns and still writes the token', () => {
    const row = AuthorizationPolicyBuilder.grant({
      subject: SUBJECT,
      permission: PERMISSION,
      action: 'read',
      domain: { type: 'Merchant', id: 'm1' },
      effect: 'allow',
    });

    expect(row.domain).toBe('Merchant_m1');
    expect(row.domainType).toBe('Merchant');
    expect(row.domainId).toBe('m1');
  });

  test('a scope literal carries no id', () => {
    const row = AuthorizationPolicyBuilder.grant({
      subject: SUBJECT,
      permission: PERMISSION,
      action: 'read',
      domain: AuthorizationDomainScopes.SYSTEM_WIDE,
      effect: 'allow',
    });

    expect(row.domain).toBe(AuthorizationDomainScopes.SYSTEM_WIDE);
    expect(row.domainType).toBe(AuthorizationDomainScopes.SYSTEM_WIDE);
    expect(row.domainId).toBeNull();
  });

  test('an omitted domain is null on both sides - null IS ANY_MEMBER', () => {
    const row = AuthorizationPolicyBuilder.assignRole({ user: SUBJECT, role: ROLE });

    expect(row.domain).toBeNull();
    expect(row.domainType).toBeNull();
    expect(row.domainId).toBeNull();
  });

  /** The one place the two forms deliberately disagree, so a backfill diff does not read it as drift. */
  test('an explicit ANY_MEMBER normalises to null in the new columns only', () => {
    const row = AuthorizationPolicyBuilder.grant({
      subject: SUBJECT,
      permission: PERMISSION,
      action: 'read',
      domain: AuthorizationDomainScopes.ANY_MEMBER,
      effect: 'allow',
    });

    expect(row.domain).toBe(AuthorizationDomainScopes.ANY_MEMBER);
    expect(row.domainType).toBeNull();
    expect(row.domainId).toBeNull();
  });

  test('a subset grant splits its domain the same way', () => {
    const row = AuthorizationPolicyBuilder.customGrant({
      subject: SUBJECT,
      permission: PERMISSION,
      ops: ['find'],
      domain: { type: 'Organizer', id: 'o9' },
      effect: 'allow',
    });

    expect(row.domainType).toBe('Organizer');
    expect(row.domainId).toBe('o9');
  });
});

describe('policyDefinitionDomainShapeCheck against a real Postgres', () => {
  let db: PGlite;

  const insert = async (opts: { domainType: string | null; domainId: string | null }) => {
    await db.query('INSERT INTO policy_definitions (domain_type, domain_id) VALUES ($1, $2)', [
      opts.domainType,
      opts.domainId,
    ]);
  };

  /** Returns the rejection rather than swallowing it, so each case asserts on a real error. */
  const insertRejection = async (opts: {
    domainType: string | null;
    domainId: string | null;
  }): Promise<unknown> => {
    try {
      await insert(opts);
      return undefined;
    } catch (error) {
      return error;
    }
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.query(`
      CREATE TABLE policy_definitions (
        id serial PRIMARY KEY,
        domain_type text,
        domain_id text,
        CONSTRAINT policy_definition_domain_shape CHECK (
          ${policyDefinitionDomainShapeCheck()}
        )
      )
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  test('accepts the three legal shapes', async () => {
    await insert({ domainType: null, domainId: null });
    await insert({ domainType: AuthorizationDomainScopes.SYSTEM_WIDE, domainId: null });
    await insert({ domainType: 'Merchant', domainId: 'm1' });

    const rows = await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM policy_definitions',
    );
    expect(rows.rows[0].count).toBe('3');
  });

  test('rejects a typed domain with no id - the direction a one-way CHECK would miss', async () => {
    expect(await insertRejection({ domainType: 'Merchant', domainId: null })).toBeDefined();
  });

  test('rejects an id with no type', async () => {
    expect(await insertRejection({ domainType: null, domainId: 'm1' })).toBeDefined();
  });

  test('rejects a scope literal carrying an id', async () => {
    expect(
      await insertRejection({ domainType: AuthorizationDomainScopes.SYSTEM_WIDE, domainId: 'm1' }),
    ).toBeDefined();
  });

  test('rejects ANY_MEMBER outright - null is the only spelling', async () => {
    expect(
      await insertRejection({ domainType: AuthorizationDomainScopes.ANY_MEMBER, domainId: null }),
    ).toBeDefined();
  });
});
