import { afterEach, describe, expect, test } from 'bun:test';
import { DroppedRouteDecorators } from '@/base/metadata/routes/common';

describe('a route decorator dropped under TC39 semantics', () => {
  const before = DroppedRouteDecorators.list().length;

  afterEach(() => {
    DroppedRouteDecorators['dropped'].splice(before);
  });

  test('on a symbol-named method is recorded, not thrown on', () => {
    DroppedRouteDecorators.isLegacyCall({
      decorator: 'get',
      propertyKey: { name: Symbol('list') },
    });

    expect(DroppedRouteDecorators.list()).toContain('@get Symbol(list)');
  });
});
