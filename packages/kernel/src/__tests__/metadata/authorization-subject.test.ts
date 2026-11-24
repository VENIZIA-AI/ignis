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

  test('a model with no principal gets its own name', () => {
    @model({ tableName: tableName() })
    class Invoice extends AbstractEntity {
      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    expect(Reflect.get(Invoice, 'AUTHORIZATION_SUBJECT')).toBe('Invoice');
    expect(Object.hasOwn(Invoice, 'AUTHORIZATION_SUBJECT')).toBe(true);
  });

  test('an empty principal is no principal: the name is used', () => {
    @model({ tableName: tableName(), settings: { authorize: { principal: '' } } })
    class Receipt extends AbstractEntity {
      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    expect(Reflect.get(Receipt, 'AUTHORIZATION_SUBJECT')).toBe('Receipt');
  });

  test('the value is defined over a getter the base answers, which an assignment could not do', () => {
    abstract class Base extends AbstractEntity {
      static get AUTHORIZATION_SUBJECT(): string {
        return this.name;
      }
    }

    @model({ tableName: tableName(), settings: { authorize: { principal: 'Child' } } })
    class Entry extends Base {
      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    @model({ tableName: tableName() })
    class Other extends Base {
      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    expect(Entry.AUTHORIZATION_SUBJECT).toBe('Child');
    expect(Other.AUTHORIZATION_SUBJECT).toBe('Other');
    expect(Base.AUTHORIZATION_SUBJECT).toBe('Base');
  });

  test('a class that is not extensible is refused, naming the class', () => {
    const sealed = () => {
      class Frozen extends AbstractEntity {
        getSchema<T>(): T {
          throw getError({ message: 'the schema is not read in this test' });
        }
      }

      Object.preventExtensions(Frozen);

      return model({ tableName: tableName() })(Frozen);
    };

    expect(sealed).toThrow(/\[model\]\[Frozen\] Cannot set 'AUTHORIZATION_SUBJECT'/);
  });
});
