import 'reflect-metadata';

import { beforeEach, describe, expect, test } from 'bun:test';
import { Container } from '../modules/container/container';
import { inject } from '../modules/metadata/injectors';

/**
 * A container-instantiated class must decorate EVERY constructor parameter.
 *
 * There is no channel through which the container could supply an undecorated one - it would receive
 * `undefined` - so the shape is refused, not silently tolerated. It is refused HERE, with the class
 * name and the parameter index, because the failure otherwise surfaced as
 * `TypeError: undefined is not an object (evaluating 'meta.isOptional')` from inside `dist`: the
 * metadata array is sparse (`@inject` at index 1 leaves a hole at 0), and the hole was dereferenced.
 *
 * The check lives in `instantiate`, not in the decorator: parameter decorators run RIGHT-TO-LEFT, so
 * when `@inject` on parameter 1 runs, parameter 0 has not been visited yet - nothing there can know
 * whether it will be decorated.
 */
class NoteService {
  find(): string {
    return 'note';
  }
}

class AuditService {
  audit(): string {
    return 'audit';
  }
}

describe('every constructor parameter of a container-instantiated class must be decorated', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container({ scope: 'ctor-shape-test' });
    container.bind({ key: 'services.NoteService' }).toClass(NoteService);
    container.bind({ key: 'services.AuditService' }).toClass(AuditService);
  });

  test('an UNDECORATED parameter before a decorated one is refused, by name and by index', () => {
    class LeadingHoleController {
      constructor(
        public options: object,
        @inject({ key: 'services.NoteService' }) public noteService: NoteService,
      ) {}
    }

    let thrown: Error | undefined;
    try {
      container.instantiate(LeadingHoleController);
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeDefined();
    // The message has to say WHICH class and WHICH parameter - the old TypeError said neither.
    expect(thrown?.message).toContain('LeadingHoleController');
    expect(thrown?.message).toContain('0');
    expect(thrown?.message).toContain('@inject');
  });

  test('an undecorated parameter BETWEEN two decorated ones is refused too', () => {
    class MiddleHoleController {
      constructor(
        @inject({ key: 'services.NoteService' }) public noteService: NoteService,
        public options: object,
        @inject({ key: 'services.AuditService' }) public auditService: AuditService,
      ) {}
    }

    let thrown: Error | undefined;
    try {
      container.instantiate(MiddleHoleController);
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeDefined();
    expect(thrown?.message).toContain('MiddleHoleController');
    expect(thrown?.message).toContain('1');
  });

  test('a fully decorated constructor still resolves every dependency, in the right position', () => {
    class WellFormedController {
      constructor(
        @inject({ key: 'services.NoteService' }) public noteService: NoteService,
        @inject({ key: 'services.AuditService' }) public auditService: AuditService,
      ) {}
    }

    const instance = container.instantiate(WellFormedController);

    expect(instance.noteService).toBeInstanceOf(NoteService);
    expect(instance.auditService).toBeInstanceOf(AuditService);
  });

  test('a class with NO constructor parameters is untouched', () => {
    class NoDependencies {
      readonly ready = true;
    }

    expect(container.instantiate(NoDependencies).ready).toBe(true);
  });

  test('the resolved dependencies land by INDEX, not by declaration order of the decorators', () => {
    // Parameter decorators run right-to-left; the container assigns `args[meta.index]`, so the
    // evaluation order must not matter.
    class OrderSensitiveController {
      constructor(
        @inject({ key: 'services.AuditService' }) public first: AuditService,
        @inject({ key: 'services.NoteService' }) public second: NoteService,
      ) {}
    }

    const instance = container.instantiate(OrderSensitiveController);

    expect(instance.first).toBeInstanceOf(AuditService);
    expect(instance.second).toBeInstanceOf(NoteService);
  });
});
