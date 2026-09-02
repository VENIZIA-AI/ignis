import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { ApiReferenceComponent } from '@/components/api-reference';
import {
  ApiReferenceBindingKeys,
  DocumentUITypes,
  type IApiReferenceOptions,
  type IUIConfig,
  type IUIProvider,
} from '@/components/api-reference/common';
import { UIProviderFactory } from '@/components/api-reference/ui';
import type { Context } from 'hono';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

const buildConfigs = (opts?: { port?: number }): IApplicationConfigs => ({
  host: '0.0.0.0',
  port: opts?.port ?? 3000,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
});

class TestApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'test-app', version: '1.2.3', description: 'Api reference test app' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

/** Boots an application with the ApiReferenceComponent configured. */
const bootApiReferenceApplication = async (opts?: {
  options?: Partial<IApiReferenceOptions>;
  port?: number;
}): Promise<TestApplication> => {
  const application = new TestApplication({
    scope: 'ApiReferenceTestApp',
    config: buildConfigs({ port: opts?.port }),
  });
  application.init();

  if (opts?.options) {
    application
      .bind<IApiReferenceOptions>({ key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS })
      .toValue(opts.options as IApiReferenceOptions);
  }

  const component = new ApiReferenceComponent(application);
  await component.configure();
  return application;
};

const readDocument = async (opts: {
  application: TestApplication;
  path?: string;
}): Promise<Record<string, AnyType>> => {
  const response = await opts.application.getRootRouter().request(opts.path ?? '/doc/openapi.json');
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, AnyType>;
};

describe('ApiReferenceComponent — options binding', () => {
  test('registers its default options binding in the container', async () => {
    const application = await bootApiReferenceApplication();

    expect(application.isBound({ key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS })).toBe(true);

    const bound = application.get<IApiReferenceOptions>({
      key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS,
    });
    expect(bound.restOptions?.ui?.type).toBe(DocumentUITypes.SCALAR);
  });

  test('a user supplied options binding is not overwritten by the component defaults', async () => {
    const application = await bootApiReferenceApplication({
      options: {
        restOptions: {
          base: { path: '/api-docs' },
          doc: { path: '/spec.json' },
          ui: { path: '/ui', type: DocumentUITypes.SWAGGER },
        },
        explorer: { openapi: '3.0.0' },
      },
    });

    const document = await readDocument({ application, path: '/api-docs/spec.json' });
    expect(document.openapi).toBe('3.0.0');
  });
});

describe('ApiReferenceComponent — partial options resilience', () => {
  test('an empty options binding does not crash the app at boot', async () => {
    const application = await bootApiReferenceApplication({ options: {} });

    const document = await readDocument({ application });
    expect(document.info).toBeDefined();
  });

  test('a partial restOptions binding falls back to the defaults', async () => {
    const application = await bootApiReferenceApplication({
      options: {
        restOptions: { ui: { path: '/explorer', type: DocumentUITypes.SCALAR } } as AnyType,
      },
    });

    const document = await readDocument({ application });
    expect(document.openapi).toBeDefined();
  });
});

describe('ApiReferenceComponent — per application document', () => {
  test('the app info comes from the booting application, not a shared default', async () => {
    const application = await bootApiReferenceApplication();

    const document = await readDocument({ application });
    expect(document.info.title).toBe('test-app');
    expect(document.info.version).toBe('1.2.3');
  });

  test('a second application does not inherit the first application server url', async () => {
    const first = await bootApiReferenceApplication({ port: 3000 });
    const firstDocument = await readDocument({ application: first });
    expect(firstDocument.servers[0].url).toContain('3000');

    const second = await bootApiReferenceApplication({ port: 4000 });
    const secondDocument = await readDocument({ application: second });
    expect(secondDocument.servers[0].url).toContain('4000');
  });
});

describe('ApiReferenceComponent — document url', () => {
  test('the UI points at an absolute doc url, never a protocol-relative "//doc" one', async () => {
    const application = await bootApiReferenceApplication();

    const response = await application.getRootRouter().request('/doc/explorer');
    expect(response.status).toBe(200);

    const page = await response.text();
    expect(page).toContain('/doc/openapi.json');
    expect(page).not.toContain('//doc/openapi.json');
  });
});

describe('UIProviderFactory — pluggability', () => {
  test('built-in providers resolve by type', () => {
    const factory = UIProviderFactory.getInstance();
    factory.register({ type: DocumentUITypes.SCALAR });
    factory.register({ type: DocumentUITypes.SWAGGER });

    expect(factory.getProvider({ type: DocumentUITypes.SCALAR })).toBeDefined();
    expect(factory.getProvider({ type: DocumentUITypes.SWAGGER })).toBeDefined();
  });

  test('an unknown provider type throws a descriptive error', () => {
    const factory = UIProviderFactory.getInstance();
    expect(() => factory.getProvider({ type: 'redoc' })).toThrow(/Unknown UI Provider/);
  });

  test('a custom registered provider is used by the component instead of being rejected', async () => {
    const factory = UIProviderFactory.getInstance();

    class RedocUIProvider implements IUIProvider {
      async render(context: Context, config: IUIConfig): Promise<Response> {
        return context.html(`<title>${config.title}</title><redoc spec-url="${config.url}" />`);
      }
    }

    factory.set('redoc', new RedocUIProvider());

    const application = await bootApiReferenceApplication({
      options: {
        restOptions: {
          base: { path: '/doc' },
          doc: { path: '/openapi.json' },
          ui: { path: '/explorer', type: 'redoc' as AnyType },
        },
        explorer: { openapi: '3.0.0' },
      },
    });

    const response = await application.getRootRouter().request('/doc/explorer');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('redoc spec-url');
  });
});
