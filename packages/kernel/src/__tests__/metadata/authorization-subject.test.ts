import { model } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';
import { afterEach, describe, expect, test } from 'bun:test';

afterEach(() => {
  MetadataRegistry.getInstance().getAllModels().clear();
});

let sequence = 0;

const tableName = () => {
  sequence += 1;

  return `subject_probe_${sequence}`;
};

describe('@model authorize.principal', () => {
  test('copies the principal onto the class as AUTHORIZATION_SUBJECT', () => {
    @model({ tableName: tableName(), settings: { authorize: { principal: 'Note' } } })
    class Note extends AbstractEntity {
      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    expect(Reflect.get(Note, 'AUTHORIZATION_SUBJECT')).toBe('Note');
  });

  test('leaves an AUTHORIZATION_SUBJECT the class declares itself', () => {
    @model({ tableName: tableName(), settings: { authorize: { principal: 'Note' } } })
    class Note extends AbstractEntity {
      static readonly AUTHORIZATION_SUBJECT = 'Own';

      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    expect(Note.AUTHORIZATION_SUBJECT).toBe('Own');
  });

  test('refuses a class whose inherited AUTHORIZATION_SUBJECT cannot be written, as the assignment did', () => {
    abstract class Base extends AbstractEntity {
      static get AUTHORIZATION_SUBJECT() {
        return 'Base';
      }
    }

    const declare = () => {
      @model({ tableName: tableName(), settings: { authorize: { principal: 'Child' } } })
      class Child extends Base {
        getSchema<T>(): T {
          throw getError({ message: 'the schema is not read in this test' });
        }
      }

      return Child;
    };

    expect(declare).toThrow(/Cannot set 'AUTHORIZATION_SUBJECT'/);
  });
});
