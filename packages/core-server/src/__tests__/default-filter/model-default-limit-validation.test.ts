import { describe, test, expect } from 'bun:test';
import { model } from '@/base/metadata';
import { type IModelSettings } from '@venizia/ignis-kernel';

/** `@model({ settings: { defaultLimit } })` validates at decoration (boot) time: a provided defaultLimit MUST be a positive integer, failing fast before the query layer. */
describe('@model - defaultLimit validation', () => {
  const decorate = (settings: IModelSettings) => () => {
    @model({ type: 'entity', settings })
    class M {}
    return M;
  };

  test('accepts a positive integer', () => {
    expect(decorate({ defaultLimit: 50 })).not.toThrow();
  });

  test('accepts an omitted defaultLimit', () => {
    expect(decorate({})).not.toThrow();
  });

  test('rejects zero', () => {
    expect(decorate({ defaultLimit: 0 })).toThrow(/Invalid 'query.limit.default'/);
  });

  test('rejects a negative value', () => {
    expect(decorate({ defaultLimit: -5 })).toThrow(/Invalid 'query.limit.default'/);
  });

  test('rejects a non-integer', () => {
    expect(decorate({ defaultLimit: 10.5 })).toThrow(/Invalid 'query.limit.default'/);
  });

  test('rejects NaN', () => {
    expect(decorate({ defaultLimit: NaN })).toThrow(/Invalid 'query.limit.default'/);
  });
});

describe('@model - query.limit validation under the grouped keys', () => {
  const decorate = (settings: IModelSettings) => () => {
    @model({ type: 'entity', settings })
    class M {}
    return M;
  };

  test('accepts positive integers for the default and the ceiling', () => {
    expect(decorate({ query: { limit: { default: 20, max: 200 } } })).not.toThrow();
  });

  test('rejects a bad default and a bad ceiling, naming the new key', () => {
    expect(decorate({ query: { limit: { default: 0 } } })).toThrow(/Invalid 'query.limit.default'/);
    expect(decorate({ query: { limit: { max: -1 } } })).toThrow(/Invalid 'query.limit.max'/);
  });

  test('the old maxLimit is validated under the new name too', () => {
    expect(decorate({ maxLimit: 2.5 })).toThrow(/Invalid 'query.limit.max'/);
  });
});
