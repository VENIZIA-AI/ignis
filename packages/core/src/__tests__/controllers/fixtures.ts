import type { AnyType } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';

/** Applies a route/rpc decorator with the legacy (`experimentalDecorators`) call shape - the only one supported. `@decorator` syntax is unusable in these tests: bun does not resolve the tsconfig `extends` chain, compiles TC39 semantics, and the decorators reject that shape loudly. */
export const applyMethodDecorator = (opts: {
  decorator: AnyType;
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

/** Minimal repository stand-in: the generated CRUD handlers only ever call these verbs. */
export const fakeCrudRepository = (opts: { records: Array<Record<string, unknown>> }) => {
  const { records } = opts;

  return {
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
  } as AnyType;
};
