import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { OpenAPIObjectConfigure } from '@hono/zod-openapi';
import type { Context, Next } from 'hono';
import { Authentication } from '../auth';
import { DocumentUITypes, ISwaggerOptions, SwaggerBindingKeys } from './common';
import { UIProviderFactory } from './ui-factory';
import { getError } from '@venizia/ignis-helpers';
import { Binding } from '@/helpers/inversion';

const DEFAULT_SWAGGER_OPTIONS: ISwaggerOptions = {
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

export class SwaggerComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: SwaggerComponent.name });

    this.bindings = {
      [SwaggerBindingKeys.SWAGGER_OPTIONS]: Binding.bind<ISwaggerOptions>({
        key: SwaggerBindingKeys.SWAGGER_OPTIONS,
      }).toValue(DEFAULT_SWAGGER_OPTIONS),
    };
  }

  override async binding() {
    const swaggerOptions =
      this.application.get<ISwaggerOptions>({
        key: SwaggerBindingKeys.SWAGGER_OPTIONS,
        isOptional: true,
      }) ?? DEFAULT_SWAGGER_OPTIONS;

    const rootRouter = this.application.getRootRouter();
    const configs = this.application.getProjectConfigs();

    const { restOptions, explorer } = swaggerOptions;

    // OpenAPI Documentation URL
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

    const basePath = [restOptions.base.path.startsWith('/') ? '' : '/', restOptions.base.path];
    const docPath = [
      ...basePath,
      restOptions.doc.path.startsWith('/') ? '' : '/',
      restOptions.doc.path,
    ].join('');

    const uiPath = [
      ...basePath,
      restOptions.ui.path.startsWith('/') ? '' : '/',
      restOptions.ui.path,
    ].join('');

    rootRouter.doc(docPath, explorer as OpenAPIObjectConfigure<any, string>);

    const uiType = restOptions.ui.type || DocumentUITypes.SWAGGER;
    const uiProviderFactory = UIProviderFactory.getInstance();

    if (!DocumentUITypes.isValid(uiType)) {
      throw getError({
        message: `[binding] Invalid document UI Type | uiType: ${uiType} | valids: ${[...DocumentUITypes.SCHEME_SET]}`,
      });
    } else {
      uiProviderFactory.register({ type: uiType });
    }

    const docUrl = [configs.path.base, configs.basePath ?? '', docPath].join('');
    const uiProvider = uiProviderFactory.getProvider({ type: uiType });

    rootRouter.get(uiPath, async (context: Context, next: Next) => {
      return uiProvider.render(
        context,
        {
          title: appInfo.name,
          url: docUrl,
          ...(swaggerOptions.uiConfig || {}),
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
