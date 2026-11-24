import { AbstractEntity, MetadataRegistry, model } from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { ScopeFilterUtility } from '@/common';
import { BaseRelationalEntity } from '@/relational/core/models';
import { ScopeThroughLink } from '@/relational/core/repositories/common/scope-through';

/**
 * Two `@model` classes on one table: the registry keeps one entry per table name, and a lookup by schema answers for
 * neither. A relation to the table then finds the wrong model, or none, and reads every row. The boot refuses it.
 */
const sharedTable = pgTable('shared_table_items', {
  id: serial('id').primaryKey(),
  name: text('name'),
});
const registry = MetadataRegistry.getInstance();

const scoped = { access: { resolve: () => ({ name: 'x' }) } };

afterEach(() => {
  registry.clearAll();
});

describe('two model classes on one table', () => {
  test('are marked, and the lookup by schema answers for neither', () => {
    @model({ type: 'entity', settings: scoped })
    class First extends BaseRelationalEntity<typeof sharedTable> {
      static override schema = sharedTable;
      static override TABLE_NAME = 'shared_table_items';
    }

    @model({ type: 'entity' })
    class Second extends BaseRelationalEntity<typeof sharedTable> {
      static override schema = sharedTable;
      static override TABLE_NAME = 'shared_table_items';
    }

    const entry = registry.getModelEntry({ name: 'shared_table_items' });

    expect(entry?.target).toBe(Second);
    expect(entry?.isShared).toBe(true);
    expect(entry?.sharesAccess).toBe(true);
    expect(registry.getModelEntryBySchema({ schema: sharedTable })).toBeUndefined();
    expect(First.name).toBe('First');
  });

  test('a third class cannot take the claim back', () => {
    for (const label of ['A', 'B', 'C']) {
      @model({ type: 'entity' })
      class Entry extends BaseRelationalEntity<typeof sharedTable> {
        static override schema = sharedTable;
        static override TABLE_NAME = 'shared_table_items';
      }

      expect(Entry.name).toBe('Entry');
      expect(label.length).toBe(1);
    }

    expect(registry.getModelEntryBySchema({ schema: sharedTable })).toBeUndefined();
  });

  test('the boot check refuses the table when one of its classes has an access', () => {
    @model({ type: 'entity', settings: scoped })
    class Owner extends BaseRelationalEntity<typeof sharedTable> {
      static override schema = sharedTable;
      static override TABLE_NAME = 'shared_table_items';
    }

    @model({ type: 'entity' })
    class Twin extends BaseRelationalEntity<typeof sharedTable> {
      static override schema = sharedTable;
      static override TABLE_NAME = 'shared_table_items';
    }

    expect(Owner.name).toBe('Owner');
    expect(Twin.name).toBe('Twin');
    expect(() =>
      ScopeFilterUtility.assertScopeFilterSupported({ asyncContextEnabled: true }),
    ).toThrow(/two model classes share a table.*shared_table_items/s);
  });

  test('two classes with no access between them are fine, and so is one class', () => {
    @model({ type: 'entity' })
    class Plain1 extends BaseRelationalEntity<typeof sharedTable> {
      static override schema = sharedTable;
      static override TABLE_NAME = 'shared_table_items';
    }

    @model({ type: 'entity' })
    class Plain2 extends BaseRelationalEntity<typeof sharedTable> {
      static override schema = sharedTable;
      static override TABLE_NAME = 'shared_table_items';
    }

    expect(Plain1.name).toBe('Plain1');
    expect(Plain2.name).toBe('Plain2');
    expect(() =>
      ScopeFilterUtility.assertScopeFilterSupported({ asyncContextEnabled: true }),
    ).not.toThrow();

    registry.clearAll();

    @model({ type: 'entity', settings: scoped })
    class Alone extends BaseRelationalEntity<typeof sharedTable> {
      static override schema = sharedTable;
      static override TABLE_NAME = 'shared_table_items';
    }

    expect(ScopeThroughLink.entryOf({ schema: sharedTable })?.target).toBe(Alone);
    expect(() =>
      ScopeFilterUtility.assertScopeFilterSupported({ asyncContextEnabled: true }),
    ).not.toThrow();
  });

  test('an abstract entity registered by hand is unaffected', () => {
    registry.getAllModels().set('Manual', {
      target: AbstractEntity as never,
      metadata: {} as never,
      schema: {},
    });

    expect(() =>
      ScopeFilterUtility.assertScopeFilterSupported({ asyncContextEnabled: true }),
    ).not.toThrow();
  });
});
