import { getError } from '@venizia/ignis-helpers/core';

/** Applies a route/rpc decorator with the legacy (`experimentalDecorators`) call shape - the only one supported. `@decorator` syntax is unusable in these tests: bun does not resolve the tsconfig `extends` chain, compiles TC39 semantics, and the decorators reject that shape loudly. */
export const applyMethodDecorator = (opts: {
  decorator: (target: object, methodName: string, descriptor: PropertyDescriptor) => unknown;
  target: object;
  methodName: string;
}): void => {
  const { decorator, target, methodName } = opts;

  const descriptor = Object.getOwnPropertyDescriptor(target, methodName);

  if (!descriptor) {
    throw getError({
      message: `[applyMethodDecorator] Method not found on target | methodName: ${methodName}`,
    });
  }

  decorator(target, methodName, descriptor);
};

/** Minimal repository stand-in: an uninitialised instance of the real repository class whose verbs are replaced by the ones the generated CRUD handlers call. */
export const fakeCrudRepository = <Repository extends object>(opts: {
  repository: abstract new (...args: never[]) => Repository;
  records: Array<Record<string, unknown>>;
}): Repository => {
  const { repository, records } = opts;
  const instance: Repository = Object.create(repository.prototype);

  return Object.assign(instance, {
    // The real filter check needs a datasource; the stand-in has no hidden fields to hold a filter to.
    assertRequestFilter: () => {},
    count: async () => ({ count: records.length }),
    find: async () => ({
      data: records,
      range: { start: 0, end: records.length, total: records.length },
    }),
    findOne: async () => records[0],
    findById: async (findOpts: { id: unknown }) => ({ ...records[0], resolvedId: findOpts.id }),
    create: async (createOpts: { data: object }) => ({ count: 1, data: createOpts.data }),
    updateById: async () => ({ count: 1, data: records[0] }),
    updateBy: async () => ({ count: 1, data: records }),
    deleteById: async () => ({ count: 1, data: records[0] }),
    deleteBy: async () => ({ count: 1, data: records }),
  });
};
