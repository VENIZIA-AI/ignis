import { AbstractRepository } from '@/base/repositories';
import type { TCount } from '@/base/repositories';
import type { TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { untyped } from '../support/untyped';

const denied = (opts: { method: string }): Promise<never> =>
  Promise.reject(getError({ message: `[StubRepository][${opts.method}] is not stubbed` }));

/**
 * Answers a stubbed verb with `value`. The abstract verbs are generic in their result, so no fixed
 * value fits them: a `Promise<never>` does, and `untyped` hands the value over.
 */
export const answer = <Result = never>(value: unknown): Promise<Result> =>
  Promise.resolve(untyped<Result>(value));

/** A repository with nothing behind it: `count` answers the length of its tag and every other verb rejects. */
export class StubRepository<Row extends object = object> extends AbstractRepository<Row> {
  constructor(readonly tag: string = 'stub') {
    super();
  }

  count() {
    return Promise.resolve({ count: this.tag.length });
  }

  existsWith(_opts?: unknown) {
    return denied({ method: 'existsWith' });
  }

  find(_opts?: unknown) {
    return denied({ method: 'find' });
  }

  findOne(_opts?: unknown) {
    return denied({ method: 'findOne' });
  }

  findById(_opts?: unknown) {
    return denied({ method: 'findById' });
  }

  create(_opts?: unknown) {
    return denied({ method: 'create' });
  }

  createAll(_opts?: unknown) {
    return denied({ method: 'createAll' });
  }

  updateById(_opts?: unknown) {
    return denied({ method: 'updateById' });
  }

  updateBy(_opts?: unknown) {
    return denied({ method: 'updateBy' });
  }

  deleteById(_opts?: unknown) {
    return denied({ method: 'deleteById' });
  }

  deleteBy(_opts?: unknown) {
    return denied({ method: 'deleteBy' });
  }
}

/** A stub that also has the restore verbs, as a soft-deletable repository does. */
export class RestorableStubRepository<Row extends object = object> extends StubRepository<Row> {
  restoreById(_opts?: unknown): Promise<TCount & { data: TNullable<Row> }> {
    return denied({ method: 'restoreById' });
  }

  restoreBy(_opts?: unknown): Promise<TCount & { data: TNullable<Array<Row>> }> {
    return denied({ method: 'restoreBy' });
  }
}
