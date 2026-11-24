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

  test('a model with no principal is left alone: no own value is defined', () => {
    @model({ tableName: tableName() })
    class Invoice extends AbstractEntity {
      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    expect(Object.hasOwn(Invoice, 'AUTHORIZATION_SUBJECT')).toBe(false);
  });

  test('an empty principal is no principal', () => {
    @model({ tableName: tableName(), settings: { authorize: { principal: '' } } })
    class Receipt extends AbstractEntity {
      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    expect(Object.hasOwn(Receipt, 'AUTHORIZATION_SUBJECT')).toBe(false);
  });

  test('the principal is defined over a getter the base answers, and the base keeps answering its name otherwise', () => {
    abstract class Base extends AbstractEntity {
      static get AUTHORIZATION_SUBJECT(): string {
        return this.name;
      }

      static set AUTHORIZATION_SUBJECT(value: string) {
        Object.defineProperty(this, 'AUTHORIZATION_SUBJECT', { value, writable: true });
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

  test('a decorated child of a decorated parent with a principal inherits the parent subject', () => {
    @model({ tableName: tableName(), settings: { authorize: { principal: 'parent-subject' } } })
    class Parent extends AbstractEntity {
      getSchema<T>(): T {
        throw getError({ message: 'the schema is not read in this test' });
      }
    }

    @model({ tableName: tableName() })
    class Child extends Parent {}

    expect(Reflect.get(Child, 'AUTHORIZATION_SUBJECT')).toBe('parent-subject');
    expect(Object.hasOwn(Child, 'AUTHORIZATION_SUBJECT')).toBe(false);
  });

  test('a class that is not extensible is refused when a principal is given, naming the class', () => {
    const sealed = () => {
      class Frozen extends AbstractEntity {
        getSchema<T>(): T {
          throw getError({ message: 'the schema is not read in this test' });
        }
      }

      Object.preventExtensions(Frozen);

      return model({ tableName: tableName(), settings: { authorize: { principal: 'x' } } })(Frozen);
    };

    expect(sealed).toThrow(/\[model\]\[Frozen\] Cannot set 'AUTHORIZATION_SUBJECT'/);
  });
});
