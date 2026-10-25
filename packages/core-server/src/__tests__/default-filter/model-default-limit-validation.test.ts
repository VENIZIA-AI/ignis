import { describe, test, expect } from 'bun:test';
import { model } from '@/base/metadata';
import { type IModelSettings } from '@venizia/ignis-kernel';

/** `@model({ settings: { query: { limit } } })` validates at decoration (boot) time: a provided default or ceiling MUST be a positive integer, failing fast before the query path ever runs. */
describe('@model - query.limit validation', () => {
  const decorate = (settings: IModelSettings) => () => {
    @model({ type: 'entity', settings })
    class M {}
    return M;
  };

  test('accepts a positive integer', () => {
    expect(decorate({ query: { limit: { default: 50 } } })).not.toThrow();
  });

  test('accepts an omitted limit', () => {
    expect(decorate({})).not.toThrow();
  });

  test.each([
    ['zero', 0],
    ['a negative value', -5],
    ['a non-integer', 10.5],
    ['NaN', Number.NaN],
  ])('rejects %s for the default', (_name, value) => {
    expect(decorate({ query: { limit: { default: value } } })).toThrow(
      /Invalid 'query.limit.default'/,
    );
  });

  test.each([
    ['zero', 0],
    ['a negative value', -1],
    ['a non-integer', 2.5],
  ])('rejects %s for the ceiling', (_name, value) => {
    expect(decorate({ query: { limit: { max: value } } })).toThrow(/Invalid 'query.limit.max'/);
  });
});

describe('@model - the removed 0.4.2 keys', () => {
  const decorate = (settings: object) => () => {
    @model({ type: 'entity', settings })
    class M {}
    return M;
  };

  test.each([
    ['defaultFilter', { defaultFilter: { where: {} } }, 'query.filter'],
    ['defaultLimit', { defaultLimit: 5 }, 'query.limit.default'],
    ['maxLimit', { maxLimit: 5 }, 'query.limit.max'],
    ['scopeFilter', { scopeFilter: { resolve: () => null } }, 'access'],
  ])('%s throws at decoration and names the key to use', (key, settings, use) => {
    expect(decorate(settings)).toThrow(
      new RegExp(`settings\\.${key} \\(use settings\\.${use.replaceAll('.', '\\.')}\\)`),
    );
  });

  test('the message says it was removed in 0.4.3 and names the codemod', () => {
    expect(decorate({ defaultLimit: 5 })).toThrow(
      /removed in 0\.4\.3.*devz codemod model-settings/,
    );
  });

  test('every removed key in use is listed, so one run shows them all', () => {
    expect(decorate({ defaultFilter: {}, scopeFilter: {} })).toThrow(
      /settings\.defaultFilter.*settings\.scopeFilter/,
    );
  });

  test('an inherited name is not a removed key', () => {
    expect(decorate(Object.create({ scopeFilter: 1 }))).not.toThrow();
  });
});
