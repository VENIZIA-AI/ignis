import { describe, expect, test } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { AnyType } from '@venizia/ignis-helpers';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';

/** A `@model` `defaultFilter` is a SCOPE (soft-delete, tenant, ownership): a caller filter may only
 * NARROW it - dropping a default condition is a data-leak primitive. Pins the two escape routes. */
const mergeWhere = (defaultWhere: AnyType, userWhere: AnyType): AnyType => {
  const builder = new FilterBuilder() as AnyType;
  return builder.mergeWhere({ defaultWhere, userWhere });
};

/** Flattens the merge result into the set of conditions that must ALL hold. */
const conjuncts = (merged: AnyType): AnyType[] => {
  const { and: andGroup, ...rest } = merged;
  return [...Object.entries(rest).map(([key, value]) => ({ [key]: value })), ...(andGroup ?? [])];
};

describe('mergeWhere - a default AND-group survives a caller AND-group', () => {
  test("the caller's `and` is added to the default's, never substituted for it", () => {
    const merged = mergeWhere(
      { and: [{ isDeleted: false }, { tenantId: 7 }] },
      { and: [{ status: 'active' }] },
    );

    const flat = JSON.stringify(merged);

    // The scope must still be in there.
    expect(flat).toContain('isDeleted');
    expect(flat).toContain('tenantId');
    // And the caller's own condition too.
    expect(flat).toContain('status');
  });

  test('every default conjunct is preserved when the caller sends a colliding and', () => {
    const merged = mergeWhere({ and: [{ isDeleted: false }] }, { and: [{ status: 'active' }] });

    expect(conjuncts(merged)).toEqual(
      expect.arrayContaining([{ isDeleted: false }, { status: 'active' }]),
    );
  });
});

describe('mergeWhere - a default OR-group survives a caller OR-group', () => {
  test("a visibility scope `or` is AND-composed with the caller's `or`, not replaced", () => {
    // The default says: you may only see rows you own OR public rows.
    // The caller says: show me drafts OR archived.
    const merged = mergeWhere(
      { or: [{ ownerId: 7 }, { isPublic: true }] },
      { or: [{ status: 'draft' }, { status: 'archived' }] },
    );

    const flat = JSON.stringify(merged);

    expect(flat).toContain('ownerId');
    expect(flat).toContain('isPublic');
    expect(flat).toContain('status');

    // Both groups must end up as separate conjuncts - either one alone would widen the query.
    const composed = conjuncts(merged).filter(entry => 'or' in entry);
    expect(composed).toHaveLength(2);
  });
});

describe('an EMPTY logical group', () => {
  const table = pgTable('articles', {
    id: serial('id').primaryKey(),
    orgId: text('org_id'),
    isPublished: text('is_published'),
  });

  const dialect = new PgDialect();

  const compile = (where: AnyType): string => {
    const builder = new FilterBuilder() as AnyType;
    const condition = builder.toWhere({ tableName: 'articles', schema: table, where });

    return condition ? dialect.sqlToQuery(condition).sql : 'NO CONDITION';
  };

  test('`or: []` compiles to FALSE - an empty permission list must match NOTHING', () => {
    // The shape that produces it: `or: permittedOrgIds.map(id => ({ orgId: id }))` where the user
    // belongs to zero orgs. Dropping the clause returns every row of every org instead of none.
    const compiled = compile({ isPublished: 'true', or: [] });

    expect(compiled).toContain('false');
  });

  test('`and: []` is still vacuously TRUE - dropping it is correct', () => {
    const compiled = compile({ isPublished: 'true', and: [] });

    expect(compiled).not.toContain('false');
    expect(compiled).not.toBe('NO CONDITION');
  });
});

describe('mergeWhere - the established rules still hold', () => {
  test('a scalar-over-scalar collision is still a caller override (opting out of soft delete)', () => {
    const merged = mergeWhere({ isDeleted: false }, { isDeleted: true });

    expect(merged.isDeleted).toBe(true);
    expect(merged.and).toBeUndefined();
  });

  test('an operator-object collision is still AND-composed', () => {
    const merged = mergeWhere({ status: 'active' }, { status: { neq: 'archived' } });
    const flat = JSON.stringify(merged);

    expect(flat).toContain('active');
    expect(flat).toContain('archived');
  });

  test('a key only the caller sends passes straight through', () => {
    expect(mergeWhere({ isDeleted: false }, { name: 'x' })).toEqual({
      isDeleted: false,
      name: 'x',
    });
  });
});
