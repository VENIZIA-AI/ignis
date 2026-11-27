import { afterEach, describe, expect, test } from 'bun:test';
import { getError } from '@venizia/ignis-helpers/core';
import { model } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';

describe('@model - the table name', () => {
  afterEach(() => {
    MetadataRegistry.getInstance().getAllModels().delete('OddlyNamedTable');
  });

  test('is the class name when the static TABLE_NAME is no string', () => {
    @model()
    class OddlyNamedTable extends AbstractEntity {
      static readonly TABLE_NAME = 7;

      getSchema<T>(): T {
        throw getError({ message: 'no schema is read here' });
      }
    }

    const registry = MetadataRegistry.getInstance();

    expect(registry.getAllModels().get('OddlyNamedTable')?.target).toBe(OddlyNamedTable);
    expect(registry.resolveModelKey({ modelClass: OddlyNamedTable })).toBe('OddlyNamedTable');
  });
});
