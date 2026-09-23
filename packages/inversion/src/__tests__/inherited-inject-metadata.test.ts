import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { MetadataKeys } from '../modules/metadata/common/constants';
import { Container } from '../modules/container/container';
import { inject } from '../modules/metadata/injectors';
import { metadataRegistry } from '../modules/registry';

class Base {
  constructor(readonly dependency: string) {}
}

// The base's injection is recorded programmatically, the way a generated class carries one.
metadataRegistry.setInjectMetadata({
  target: Base,
  index: 0,
  metadata: { key: 'values.base', index: 0, isOptional: false },
});

class ExplicitChild extends Base {
  constructor(@inject({ key: 'values.explicit' }) dependency: string) {
    super(dependency);
  }
}

class PlainChild extends Base {}

const buildContainer = () => {
  const container = new Container({ scope: 'inherited-inject-test' });
  container.bind({ key: 'values.base' }).toValue('base');
  container.bind({ key: 'values.explicit' }).toValue('explicit');
  return container;
};

describe("a subclass's @inject leaves its parent's list alone", () => {
  test('the explicit subclass gets its own dependency', () => {
    expect(buildContainer().resolve(ExplicitChild).dependency).toBe('explicit');
  });

  test('a sibling that declares nothing still inherits the base injection', () => {
    expect(buildContainer().resolve(PlainChild).dependency).toBe('base');
  });

  test('the base keeps its own list, and the subclass owns a separate one', () => {
    const baseList = Reflect.getOwnMetadata(MetadataKeys.INJECT, Base);
    const childList = Reflect.getOwnMetadata(MetadataKeys.INJECT, ExplicitChild);

    expect(baseList[0].key).toBe('values.base');
    expect(childList[0].key).toBe('values.explicit');
    expect(childList).not.toBe(baseList);
  });
});
