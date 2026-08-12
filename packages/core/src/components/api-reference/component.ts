import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { OpenAPIObjectConfigure } from '@hono/zod-openapi';
import type { Context, Next } from 'hono';
import { Authentication } from '../auth';
import { ApiReferenceBindingKeys, DocumentUITypes, IApiReferenceOptions } from './common';
import { UIProviderFactory } from './ui-factory';
import { getError } from '@venizia/ignis-helpers/core';
import { Binding } from '@/helpers/inversion';

const DEFAULT_API_REFERENCE_OPTIONS: IApiReferenceOptions = {
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'scalar' },
  },
  explorer: {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
      description: 'API documentation for your service',
    },
  },
};

/** Joins rest path segments into a single absolute path (no empty or duplicated separators). */
const joinRestPath = (segments: Array<string | undefined>): string => {
  const joined = segments
    .filter((segment): segment is string => Boolean(segment))
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');

  return joined.startsWith('/') ? joined : `/${joined}`;
};

export class ApiReferenceComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: ApiReferenceComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [ApiReferenceBindingKeys.API_REFERENCE_OPTIONS]: Binding.bind<IApiReferenceOptions>({
          key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS,
        }).toValue(DEFAULT_API_REFERENCE_OPTIONS),
      },
    });
  }

  override async binding() {
    const boundOptions = this.application.get<IApiReferenceOptions>({
      key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS,
      isOptional: true,
    });

    const defaultRestOptions = DEFAULT_API_REFERENCE_OPTIONS.restOptions!;
    const restOptions = {
      base: { ...defaultRestOptions.base, ...boundOptions?.restOptions?.base },
      doc: { ...defaultRestOptions.doc, ...boundOptions?.restOptions?.doc },
      ui: { ...defaultRestOptions.ui, ...boundOptions?.restOptions?.ui },
    };

    // A fresh explorer object per application: mutating the bound one (or the module default) leaks this application's info/servers into every later application in the process.
    const explorer: NonNullable<IApiReferenceOptions['explorer']> = {
      ...DEFAULT_API_REFERENCE_OPTIONS.explorer,
      ...boundOptions?.explorer,
    };

    const rootRouter = this.application.getRootRouter();
    const configs = this.application.getProjectConfigs();

    const appInfo = await this.application.getAppInfo();
    explorer.info = {
      title: appInfo.name,
      version: appInfo.version,
      description: appInfo.description,
      contact: appInfo.author,
    };

    if (!explorer.servers?.length) {
      explorer.servers = [
        {
          url: ['http://', this.application.getServerAddress(), configs.path.base ?? ''].join(''),
          description: 'Local Application Server URL',
        },
      ];
    }

    const docPath = joinRestPath([restOptions.base.path, restOptions.doc.path]);
    const uiPath = joinRestPath([restOptions.base.path, restOptions.ui.path]);

    rootRouter.doc(docPath, explorer as OpenAPIObjectConfigure<any, string>);

    const uiType = restOptions.ui.type ?? DocumentUITypes.SWAGGER;
    const uiProviderFactory = UIProviderFactory.getInstance();

    // A custom provider registered on the factory is honoured; only unknown types are rejected.
    if (!uiProviderFactory.isBound(uiType)) {
      if (!DocumentUITypes.isValid(uiType)) {
        throw getError({
          message: `[binding] Invalid document UI Type | uiType: ${uiType} | valids: ${[...DocumentUITypes.SCHEME_SET]}`,
        });
      }

      uiProviderFactory.register({ type: uiType });
    }

    const docUrl = joinRestPath([configs.path.base, docPath]);
    const uiProvider = uiProviderFactory.getProvider({ type: uiType });

    rootRouter.get(uiPath, async (context: Context, next: Next) => {
      return uiProvider.render(
        context,
        {
          title: appInfo.name,
          url: docUrl,
          ...(boundOptions?.uiConfig ?? {}),
        },
        next,
      );
    });

    rootRouter.openAPIRegistry.registerComponent('securitySchemes', Authentication.STRATEGY_JWT, {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });

    rootRouter.openAPIRegistry.registerComponent('securitySchemes', Authentication.STRATEGY_BASIC, {
      type: 'http',
      scheme: 'basic',
    });
  }
}

/** @deprecated Use `ApiReferenceComponent`. */
export const SwaggerComponent = ApiReferenceComponent;
/** @deprecated Use `ApiReferenceComponent`. */
export type SwaggerComponent = ApiReferenceComponent;
