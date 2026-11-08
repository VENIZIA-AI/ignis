import { AbstractRepository } from '@/base/repositories';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

const denied = (opts: { method: string }): Promise<AnyType> =>
  Promise.reject(getError({ message: `[StubRepository][${opts.method}] is not stubbed` }));

/** A repository with nothing behind it: `count` answers the length of its tag and every other verb rejects. */
export class StubRepository<Row extends object = object> extends AbstractRepository<Row> {
  constructor(readonly tag: string = 'stub') {
    super();
  }

  count() {
    return Promise.resolve({ count: this.tag.length });
  }

  existsWith(_opts?: AnyType) {
    return denied({ method: 'existsWith' });
  }

  find(_opts?: AnyType) {
    return denied({ method: 'find' });
  }

  findOne(_opts?: AnyType) {
    return denied({ method: 'findOne' });
  }

  findById(_opts?: AnyType) {
    return denied({ method: 'findById' });
  }

  create(_opts?: AnyType) {
    return denied({ method: 'create' });
  }

  createAll(_opts?: AnyType) {
    return denied({ method: 'createAll' });
  }

  updateById(_opts?: AnyType) {
    return denied({ method: 'updateById' });
  }

  updateBy(_opts?: AnyType) {
    return denied({ method: 'updateBy' });
  }

  deleteById(_opts?: AnyType) {
    return denied({ method: 'deleteById' });
  }

  deleteBy(_opts?: AnyType) {
    return denied({ method: 'deleteBy' });
  }
}

/** A stub that also has the restore verbs, as a soft-deletable repository does. */
export class RestorableStubRepository<Row extends object = object> extends StubRepository<Row> {
  restoreById(_opts?: AnyType) {
    return denied({ method: 'restoreById' });
  }

  restoreBy(_opts?: AnyType) {
    return denied({ method: 'restoreBy' });
  }
}
