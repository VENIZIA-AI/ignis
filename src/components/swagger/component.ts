import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { Binding } from '@/helpers/inversion';
import { validateModule } from '@/utilities/module.utility';
import { OpenAPIObjectConfigure } from '@hono/zod-openapi';
import { SwaggerBindingKeys } from './keys';
import { IGetProviderParams, ISwaggerOptions, IUIConfig, IUIProvider } from './types';
import type { Context, Next } from 'hono';
import { getError } from '@/helpers';

export class SwaggerUIProvider implements IUIProvider {
  async render(context: Context, config: IUIConfig, next: Next): Promise<Response | void> {
    validateModule({ scope: 'SwaggerUIProvider', modules: ['@hono/swagger-ui'] });
    const { swaggerUI } = await import('@hono/swagger-ui');
    const { title, url, ...customConfig } = config;
    return swaggerUI({
      title,
      url,
      ...customConfig,
    })(context, next);
  }
}

export class ScalarUIProvider implements IUIProvider {
  async render(context: Context, config: IUIConfig, next: Next): Promise<Response | void> {
    validateModule({ scope: 'ScalarUIProvider', modules: ['@scalar/hono-api-reference'] });
    const { Scalar } = await import('@scalar/hono-api-reference');
    const { title, url, ...customConfig } = config;
    return Scalar({
      url,
      pageTitle: title,
      ...customConfig,
    })(context, next);
  }
}

export class UIProviderFactory {
  private providers: Record<string, IUIProvider> = {
    swagger: new SwaggerUIProvider(),
    scalar: new ScalarUIProvider(),
  };

  getProvider({ type }: IGetProviderParams): IUIProvider {
    const provider = this.providers[type];
    if (!provider) {
      throw getError({
        message: `[SwaggerComponent][getProvider] Unknown UI type: ${type}. Available: ${Object.keys(this.providers).join(', ')}`,
      });
    }
    return provider;
  }

  registerProvider(type: string, provider: IUIProvider): void {
    this.providers[type] = provider;
  }

  getRegisteredProviders(): string[] {
    return Object.keys(this.providers);
  }
}

const DEFAULT_SWAGGER_OPTIONS: ISwaggerOptions = {
  restOptions: {
    path: {
      base: '/doc',
      doc: '/openapi.json',
      ui: 'explorer',
      uiType: 'scalar',
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
  private uiProviderFactory: UIProviderFactory;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: SwaggerComponent.name });

    this.uiProviderFactory = new UIProviderFactory();

    this.bindings = {
      [SwaggerBindingKeys.SWAGGER_OPTIONS]: Binding.bind<ISwaggerOptions>({
        key: SwaggerBindingKeys.SWAGGER_OPTIONS,
      }).toValue(DEFAULT_SWAGGER_OPTIONS),
    };
  }

  getUIProviderFactory(): UIProviderFactory {
    return this.uiProviderFactory;
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

    const uiType = restOptions.path.uiType || 'swagger';
    const docUrl = [configs.path.base, configs.basePath ?? '', docPath].join('');
    const uiProvider = this.uiProviderFactory.getProvider({ type: uiType });

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
