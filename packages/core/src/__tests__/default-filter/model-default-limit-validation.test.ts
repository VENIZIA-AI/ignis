import { describe, test, expect } from 'bun:test';
import { model } from '@/base/metadata';
import { IModelSettings } from '@/helpers/inversion';

/** `@model({ settings: { defaultLimit } })` validates at decoration (boot) time: a provided
 * defaultLimit MUST be a positive integer, failing fast before the query layer. */
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
    expect(decorate({ defaultLimit: 0 })).toThrow(/Invalid 'defaultLimit'/);
  });

  test('rejects a negative value', () => {
    expect(decorate({ defaultLimit: -5 })).toThrow(/Invalid 'defaultLimit'/);
  });

  test('rejects a non-integer', () => {
    expect(decorate({ defaultLimit: 10.5 })).toThrow(/Invalid 'defaultLimit'/);
  });

  test('rejects NaN', () => {
    expect(decorate({ defaultLimit: NaN })).toThrow(/Invalid 'defaultLimit'/);
  });
});
