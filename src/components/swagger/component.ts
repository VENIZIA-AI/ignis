import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { Binding } from '@/helpers/inversion';
import { validateModule } from '@/utilities/module.utility';
import { SwaggerBindingKeys } from './keys';
import { ISwaggerOptions } from './types';
import { OpenAPIObjectConfigure } from '@hono/zod-openapi';

const DEFAULT_SWAGGER_OPTIONS: ISwaggerOptions = {
  restOptions: {
    path: {
      base: '/doc',
      doc: '/openapi.json',
      ui: 'explorer',
    },
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
    validateModule({ scope: SwaggerComponent.name, modules: ['@hono/swagger-ui'] });
    const { swaggerUI } = await import('@hono/swagger-ui');

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

    // Application Server Urls
    if (!explorer.servers?.length) {
      explorer.servers = [
        {
          url: ['http://', this.application.getServerAddress(), configs.path.base ?? ''].join(''),
          description: 'Local Application Server URL',
        },
      ];
    }

    const basePath = [restOptions.path.base.startsWith('/') ? '' : '/', restOptions.path.base];
    const docPath = [
      ...basePath,
      restOptions.path.doc.startsWith('/') ? '' : '/',
      restOptions.path.doc,
    ].join('');

    const uiPath = [
      ...basePath,
      restOptions.path.ui.startsWith('/') ? '' : '/',
      restOptions.path.ui,
    ].join('');

    rootRouter.doc(docPath, explorer as OpenAPIObjectConfigure<any, any>);
    rootRouter.get(
      uiPath,
      swaggerUI({
        title: appInfo.name,
        url: [configs.path.base, configs.basePath ?? '', docPath].join(''),
      }),
    );

    rootRouter.openAPIRegistry.registerComponent('securitySchemes', 'jwt', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });

    rootRouter.openAPIRegistry.registerComponent('securitySchemes', 'basic', {
      type: 'http',
      scheme: 'basic',
    });
  }
}
