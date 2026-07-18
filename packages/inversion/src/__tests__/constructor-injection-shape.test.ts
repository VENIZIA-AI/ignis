import 'reflect-metadata';

import { beforeEach, describe, expect, test } from 'bun:test';
import { Container } from '../modules/container/container';
import { inject } from '../modules/metadata/injectors';

/**
 * Every constructor parameter of a container-instantiated class must carry `@inject` - a sparse
 * metadata array is refused in `instantiate` with class name + index (decorators run right-to-left,
 * so the decorator itself cannot check).
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
