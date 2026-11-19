import { describe, expect, test } from 'bun:test';
import { Container } from '@/modules/container';
import { inject } from '@/modules/metadata';
import { BindingKeys } from '@/modules/binding/common/constants';

class Dep {}

class Holder {
  @inject({ key: BindingKeys.build<unknown>({ key: 'dep' }) })
  readonly dep!: Dep;
}

class Locked {
  @inject({ key: BindingKeys.build<unknown>({ key: 'dep' }) })
  dep!: Dep;

  constructor() {
    Object.defineProperty(this, 'dep', { value: undefined, writable: false });
  }
}

describe('property injection', () => {
  test('assigns a property declared readonly in TypeScript', () => {
    const container = new Container();
    const dep = new Dep();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'dep' }) }).toValue(dep);

    expect(container.instantiate(Holder).dep).toBe(dep);
  });

  test('refuses a property that cannot be written, as the assignment did', () => {
    const container = new Container();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'dep' }) }).toValue(new Dep());

    expect(() => container.instantiate(Locked)).toThrow(/cannot be injected/);
  });
});
