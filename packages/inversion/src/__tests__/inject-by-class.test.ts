import 'reflect-metadata';

import { beforeEach, describe, expect, test } from 'bun:test';
import { Container } from '../modules/container/container';
import { inject } from '../modules/metadata/injectors';
import { metadataRegistry } from '../modules/registry/registry';
import {
  AuthorService as CycleAuthorService,
  NoteService as CycleNoteService,
} from './cycle-barrel/index';

/** `@inject({ target })` names the class; the key it resolves to is the one registration recorded on that class. */
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

/** Never registered, never given a key - the shape the error message has to name. */
class OrphanService {}

describe('@inject({ target })', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container({ scope: 'inject-by-class-test' });

    metadataRegistry.setBindingKey({ target: NoteService, key: 'services.NoteService' });
    metadataRegistry.setBindingKey({ target: AuditService, key: 'services.AuditService' });

    container.bind({ key: 'services.NoteService' }).toClass(NoteService);
    container.bind({ key: 'services.AuditService' }).toClass(AuditService);
  });

  test('resolves a constructor parameter through the key recorded on the class', () => {
    class NoteController {
      constructor(@inject({ target: NoteService }) readonly noteService: NoteService) {}
    }

    const instance = container.instantiate(NoteController);

    expect(instance.noteService).toBeInstanceOf(NoteService);
  });

  test('resolves a property through the key recorded on the class', () => {
    class AuditController {
      @inject({ target: AuditService })
      readonly auditService!: AuditService;
    }

    const instance = container.instantiate(AuditController);

    expect(instance.auditService).toBeInstanceOf(AuditService);
  });

  test('mixes with the key form in one constructor', () => {
    class MixedController {
      constructor(
        @inject({ target: NoteService }) readonly noteService: NoteService,
        @inject({ key: 'services.AuditService' }) readonly auditService: AuditService,
      ) {}
    }

    const instance = container.instantiate(MixedController);

    expect(instance.noteService).toBeInstanceOf(NoteService);
    expect(instance.auditService).toBeInstanceOf(AuditService);
  });

  /** The failure has to name the class asked for, not just say a key was missing. */
  test('refuses a class that carries no recorded key, naming it', () => {
    class OrphanController {
      constructor(@inject({ target: OrphanService }) readonly orphan: OrphanService) {}
    }

    let thrown: Error | undefined;
    try {
      container.instantiate(OrphanController);
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.message).toContain('OrphanController');
    expect(thrown?.message).toContain('OrphanService');
    expect(thrown?.message).toContain('Constructor parameter 0');
  });

  /** A circular import hands the decorator `undefined`; the metadata must never record that hole. */
  test('refuses a target that is not a class, at decoration time', () => {
    expect(() => inject({ target: undefined as never })).toThrow();
    expect(() => inject({ target: 'services.NoteService' as never })).toThrow();
  });

  /** A subclass of a registered class is not itself registered - inheriting the key resolves the wrong binding. */
  test('a recorded key is not inherited by a subclass', () => {
    class DerivedNoteService extends NoteService {}

    expect(metadataRegistry.getBindingKey({ target: NoteService })).toBe('services.NoteService');
    expect(metadataRegistry.getBindingKey({ target: DerivedNoteService })).toBeUndefined();
  });

  test('an optional class dependency resolves to undefined instead of throwing', () => {
    class UnboundService {}
    metadataRegistry.setBindingKey({ target: UnboundService, key: 'services.UnboundService' });

    class OptionalController {
      constructor(
        @inject({ target: UnboundService, isOptional: true })
        readonly maybe: UnboundService | undefined,
      ) {}
    }

    expect(container.instantiate(OptionalController).maybe).toBeUndefined();
  });
});

describe('@inject({ target: () => Class })', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container({ scope: 'inject-by-thunk-test' });
    metadataRegistry.setBindingKey({ target: NoteService, key: 'services.NoteService' });
    container.bind({ key: 'services.NoteService' }).toClass(NoteService);
  });

  test('a thunk resolves to the same binding as the class itself', () => {
    class NoteController {
      constructor(@inject({ target: () => NoteService }) readonly noteService: NoteService) {}
    }

    expect(container.instantiate(NoteController).noteService.find()).toBe('note');
  });

  test('the thunk runs at resolve time, not at decoration time', () => {
    let calls = 0;

    class LateController {
      constructor(
        @inject({
          target: () => {
            calls += 1;
            return NoteService;
          },
        })
        readonly noteService: NoteService,
      ) {}
    }

    expect(calls).toBe(0);
    container.instantiate(LateController);
    expect(calls).toBe(1);
  });

  test('a thunk that does not return a class is refused, naming the class and the position', () => {
    class BadController {
      constructor(
        @inject({ target: () => 'services.NoteService' as never })
        readonly noteService: NoteService,
      ) {}
    }

    let thrown: Error | undefined;
    try {
      container.instantiate(BadController);
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.message).toContain('BadController');
    expect(thrown?.message).toContain('Constructor parameter 0');
  });

  /** The shape the thunk exists for: a barrel re-exports two modules and one imports the other back. Importing this fixture at all is half the assertion - a bare class reference there throws at module load. */
  test('a barrel import cycle resolves, and the injected dependency is the real class', () => {
    metadataRegistry.setBindingKey({ target: CycleNoteService, key: 'services.CycleNoteService' });
    container.bind({ key: 'services.CycleNoteService' }).toClass(CycleNoteService);

    const author = container.instantiate(CycleAuthorService);
    expect(author.noteService.find()).toBe('note');
  });
});
