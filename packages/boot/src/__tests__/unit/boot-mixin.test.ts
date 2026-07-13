import { describe, expect, test } from 'bun:test';
import { Container } from '@venizia/ignis-inversion';
import { BootMixin } from '@/boot.mixin';
import type { IBootOptions } from '@/common/types';

const CUSTOM_OPTIONS: IBootOptions = {
  controllers: { dirs: ['my-controllers'], extensions: ['.ctrl.js'] },
};

describe('BootMixin - the app boot options actually reach the booters', () => {
  test('a subclass declaring bootOptions as a class FIELD still has them bound', async () => {
    class FieldApp extends BootMixin(Container) {
      override bootOptions = CUSTOM_OPTIONS;
    }

    const application = new FieldApp();
    // A class-field initializer runs AFTER the mixin constructor body, so binding the options there
    // captures `undefined` and every custom dirs/extensions/glob silently reverts to the defaults.
    await application.boot();

    expect(application.get<IBootOptions>({ key: '@app/boot-options' })).toEqual(CUSTOM_OPTIONS);
  });

  test('a subclass assigning bootOptions in its CONSTRUCTOR has them bound too', async () => {
    class ConstructorApp extends BootMixin(Container) {
      constructor() {
        super();
        this.bootOptions = CUSTOM_OPTIONS;
      }
    }

    const application = new ConstructorApp();
    await application.boot();

    expect(application.get<IBootOptions>({ key: '@app/boot-options' })).toEqual(CUSTOM_OPTIONS);
  });

  test('no bootOptions at all binds an empty object, never undefined', async () => {
    class BareApp extends BootMixin(Container) {}

    const application = new BareApp();
    await application.boot();

    expect(application.get<IBootOptions>({ key: '@app/boot-options' })).toEqual({});
  });

  test('the four built-in booters are registered under the booter tag', () => {
    class TaggedApp extends BootMixin(Container) {}

    const application = new TaggedApp();
    const booterKeys = application
      .findByTag({ tag: 'booter' })
      .map(binding => binding.key)
      .sort();

    expect(booterKeys).toEqual([
      'booter.ControllerBooter',
      'booter.DatasourceBooter',
      'booter.RepositoryBooter',
      'booter.ServiceBooter',
    ]);
  });
});

describe('BootMixin - the project root reaches the booters', () => {
  test('a subclass declaring projectRoot as a class FIELD still has it bound', async () => {
    class RootedApp extends BootMixin(Container) {
      override projectRoot = '/custom/root';
    }

    const application = new RootedApp();
    await application.boot();

    expect(application.get<string>({ key: '@app/project_root' })).toBe('/custom/root');
  });

  test('no projectRoot falls back to the process cwd', async () => {
    class DefaultRootApp extends BootMixin(Container) {}

    const application = new DefaultRootApp();
    await application.boot();

    expect(application.get<string>({ key: '@app/project_root' })).toBe(process.cwd());
  });
});
