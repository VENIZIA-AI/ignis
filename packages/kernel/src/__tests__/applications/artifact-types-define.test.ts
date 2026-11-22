import { ArtifactGroup } from '@/base/applications/artifact-group';
import { ArtifactIndexHelper } from '@/base/applications/artifact-index';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { RestApplication } from '@/base/applications/rest';
import { inject, injectable } from '@/base/metadata';
import { ArtifactTypes, BindingKeys, BindingScopes } from '@/helpers/inversion';
import { SingletonRealm } from '@/helpers/singleton-realm';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { describe, expect, test } from 'bun:test';

class DefineApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'define-app', version: '0.0.0', description: '' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});

const buildApplication = () => {
  const application = new DefineApplication({
    scope: DefineApplication.name,
    config: buildConfigs(),
  });
  application.init();

  return application;
};

const emitter = ArtifactTypes.define({
  type: 'emitter',
  namespace: 'emitters',
  scope: BindingScopes.SINGLETON,
});

const worker = ArtifactTypes.define({
  type: 'worker',
  namespace: 'workers',
  scope: BindingScopes.TRANSIENT,
});

@emitter()
class OrderEmitter {}

@emitter()
class MailEmitter {}

@worker()
class SyncWorker {}

class EmitterClient {
  constructor(@inject({ target: OrderEmitter }) readonly orders: OrderEmitter) {}
}

describe('ArtifactTypes.define', () => {
  test('keeps the built-in types as they were: define adds none to values() or isValid', () => {
    expect(ArtifactTypes.values()).not.toContain('emitter');
    expect(ArtifactTypes.isValid('emitter')).toBe(false);
    expect(ArtifactTypes.isValid('service')).toBe(true);
  });

  test('the definitions live on the realm, so a second copy of the kernel sees them', () => {
    const shared = SingletonRealm.resolve({
      key: 'artifact-type-definitions',
      create: () => new Map<string, unknown>(),
    });

    expect(shared.get('emitter')).toEqual({
      type: 'emitter',
      namespace: 'emitters',
      scope: BindingScopes.SINGLETON,
    });
  });

  test('definitionOf answers the definition, and undefined for a built-in or an unknown type', () => {
    expect(ArtifactTypes.definitionOf({ type: 'emitter' })).toEqual({
      type: 'emitter',
      namespace: 'emitters',
      scope: BindingScopes.SINGLETON,
    });
    expect(ArtifactTypes.definitionOf({ type: 'service' })).toBeUndefined();
    expect(ArtifactTypes.definitionOf({ type: 'nothing' })).toBeUndefined();
  });

  test('a built-in type name is refused', () => {
    expect(() =>
      ArtifactTypes.define({ type: 'service', namespace: 'mine', scope: BindingScopes.SINGLETON }),
    ).toThrow(/built-in artifact type/);
  });

  test('a built-in namespace is refused', () => {
    expect(() =>
      ArtifactTypes.define({
        type: 'thing',
        namespace: 'services',
        scope: BindingScopes.SINGLETON,
      }),
    ).toThrow(/namespace of a built-in artifact type/);
  });

  test('a namespace that is not one segment is refused', () => {
    expect(() =>
      ArtifactTypes.define({ type: 'thing', namespace: 'a.b', scope: BindingScopes.SINGLETON }),
    ).toThrow(/Invalid namespace/);
  });

  test('a type with whitespace is refused', () => {
    expect(() =>
      ArtifactTypes.define({ type: 'my thing', namespace: 'mine', scope: BindingScopes.SINGLETON }),
    ).toThrow(/Invalid type/);
  });

  test('two types in one namespace are refused: a tag could not tell them apart', () => {
    expect(() =>
      ArtifactTypes.define({
        type: 'other-emitter',
        namespace: 'emitters',
        scope: BindingScopes.SINGLETON,
      }),
    ).toThrow(/already the namespace of the type 'emitter'/);
  });

  test('the same definition again is a no-op, another namespace or scope throws', () => {
    expect(() =>
      ArtifactTypes.define({
        type: 'emitter',
        namespace: 'emitters',
        scope: BindingScopes.SINGLETON,
      }),
    ).not.toThrow();
    expect(() =>
      ArtifactTypes.define({ type: 'emitter', namespace: 'other', scope: BindingScopes.SINGLETON }),
    ).toThrow(/already defined/);
    expect(() =>
      ArtifactTypes.define({
        type: 'emitter',
        namespace: 'emitters',
        scope: BindingScopes.TRANSIENT,
      }),
    ).toThrow(/already defined/);
  });
});

describe('injectable with a type', () => {
  test('an unknown type throws and lists the built-in and the defined types', () => {
    expect(() => {
      @injectable({ type: 'nothing' })
      class Stray {}

      return Stray;
    }).toThrow(
      /Expected one of: .*service.* | or a type defined with ArtifactTypes.define: .*emitter/s,
    );
  });
});

describe('registerArtifacts with a custom type', () => {
  test('a class is bound once, in the definition namespace, found by target', async () => {
    const application = buildApplication();
    await application.registerArtifacts({ custom: { emitter: [OrderEmitter, MailEmitter] } });

    const key = BindingKeys.build<OrderEmitter>({ key: 'emitters.OrderEmitter' });

    expect(application.isBound({ key })).toBe(true);
    expect(
      application.isBound({ key: BindingKeys.build<unknown>({ key: 'emitters.MailEmitter' }) }),
    ).toBe(true);
    expect(application.get({ target: OrderEmitter })).toBeInstanceOf(OrderEmitter);
    expect(application.instantiate(EmitterClient).orders).toBeInstanceOf(OrderEmitter);
  });

  test('the scope is the definition scope: a singleton is one instance, a transient is not', async () => {
    const application = buildApplication();
    await application.registerArtifacts({
      custom: { emitter: [OrderEmitter], worker: [SyncWorker] },
    });

    expect(application.get({ target: OrderEmitter })).toBe(
      application.get({ target: OrderEmitter }),
    );
    expect(application.get({ target: SyncWorker })).not.toBe(
      application.get({ target: SyncWorker }),
    );
  });

  test("a class's own scope beats the definition's", async () => {
    @emitter({ scope: BindingScopes.TRANSIENT })
    class TransientEmitter {}

    const application = buildApplication();
    await application.registerArtifacts({ custom: { emitter: [TransientEmitter] } });

    expect(application.get({ target: TransientEmitter })).not.toBe(
      application.get({ target: TransientEmitter }),
    );
  });

  test('a decorator-only application discovers the class under its type', () => {
    const discovered = ArtifactIndexHelper.getInstance().buildDiscoveredIndex();

    expect(discovered.custom?.emitter).toContain(MailEmitter);
    expect(discovered.custom?.worker).toContain(SyncWorker);
  });

  test('a group that carries custom classes registers them like an index does', async () => {
    const application = buildApplication();
    const group = ArtifactGroup.define({
      folder: 'emitters',
      content: { custom: { emitter: [OrderEmitter] } },
    });

    await application.registerArtifacts(group);

    expect(application.get({ target: OrderEmitter })).toBeInstanceOf(OrderEmitter);
  });

  test('a custom type nobody defined throws, naming the class', async () => {
    const application = buildApplication();
    class Orphan {}

    await RejectionUtility.expectRejection({
      task: application.registerArtifacts({ custom: { ghost: [Orphan] } }),
      message: /'Orphan' is listed under the artifact type 'ghost', which is not defined/,
    });
  });

  test('two classes that derive one key collide, as built-in ones do', async () => {
    const application = buildApplication();
    const first = (() => {
      @emitter()
      class Twin {}

      return Twin;
    })();
    const second = (() => {
      @emitter()
      class Twin {}

      return Twin;
    })();

    await RejectionUtility.expectRejection({
      task: application.registerArtifacts({ custom: { emitter: [first, second] } }),
      message: /emitters\.Twin/,
    });
  });

  test('when and order apply to a custom type', async () => {
    @emitter({ order: 2 })
    class SecondEmitter {}

    @emitter({ order: 1 })
    class FirstEmitter {}

    @emitter({ when: () => false })
    class SkippedEmitter {}

    const resolved = await ArtifactIndexHelper.getInstance().resolve({
      input: { custom: { emitter: [SecondEmitter, FirstEmitter, SkippedEmitter] } },
      application: buildApplication(),
    });

    expect(resolved.custom.emitter).toEqual([FirstEmitter, SecondEmitter]);
  });
});

describe('ArtifactGroup.pick with custom', () => {
  test('custom is one kind: a slice keeps all custom types, or none', async () => {
    const group = ArtifactGroup.define({
      folder: 'x',
      content: { services: [], custom: { emitter: [OrderEmitter] } },
    });
    const withCustom = ArtifactGroup.pick({ group, kinds: ['custom'] });
    const without = ArtifactGroup.pick({ group, kinds: ['services'] });

    const kept = await ArtifactGroup.resolveContent({ group: withCustom });
    const dropped = await ArtifactGroup.resolveContent({ group: without });

    expect(kept).toEqual({ custom: { emitter: [OrderEmitter] } });
    expect(dropped).toEqual({ services: [] });
  });
});

describe('the module graph', () => {
  const ENTRIES = ['index', 'metadata', 'common/bindings', 'helpers/inversion/index'];

  test.each(ENTRIES)(
    'importing %s first, in a fresh process, loads without a cycle error',
    (entry) => {
      const run = Bun.spawnSync(['bun', '-e', `await import('./src/${entry}.ts')`], {
        cwd: process.cwd(),
      });

      expect(run.exitCode, run.stderr.toString()).toBe(0);
    },
  );
});
